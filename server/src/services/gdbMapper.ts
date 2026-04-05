/**
 * GDB Snapshot Mapper
 * Converts GDBSnapshot[] (per-line variable state) into TraceStep[] events
 * that are compatible with the existing frontend stepMapper.
 */

import type { GDBSnapshot, GDBField, GDBLocal } from './gdbDriver.js';
import { isPointerType, isNullPointer, isIntegralType } from './gdbDriver.js';

// Mirror of the frontend TraceStep type (kept in sync with src/api/compilerApi.ts)
export interface TraceStep {
    step: number;
    line: number;
    type: string;
    var?: string;
    field?: string;
    source?: string;
    value?: number | string;
    addr?: string;
    target?: string;
    struct?: string;
    hint?: 'stack' | 'queue' | 'node' | 'tree' | 'circular';
    raw?: string;
    output?: string;
}

// ===== Helpers =====

/** Strip pointer stars and 'struct'/'class' keyword to get the base type name */
function baseTypeName(pointerType: string): string {
    return pointerType
        .replace(/\*/g, '')
        .replace(/\bstruct\b/g, '')
        .replace(/\bclass\b/g, '')
        .trim();
}

/**
 * All nodes start as 'node' hint.
 * Actual data structure classification is handled entirely by
 * stepMapper's analyzeAndReclassify() using runtime pointer graph topology.
 */
function guessHint(_fields: GDBField[]): 'node' {
    return 'node';
}

// ===== Core Mapper =====

export function snapshotsToTraceSteps(
    snapshots: GDBSnapshot[],
    programOutput: string,
): TraceStep[] {
    const steps: TraceStep[] = [];
    let counter = 0;

    const push = (partial: Omit<TraceStep, 'step'>) =>
        steps.push({ step: counter++, ...partial });

    // Persistent state across snapshots
    const knownAddrs = new Set<string>();            // addresses we have ALLOCed
    const addrToStruct = new Map<string, string>();  // addr → struct type name

    // Track previous pointer values per variable to detect genuine new allocations
    const prevPtrValues = new Map<string, string>(); // varName → previous address

    let prevLocals: GDBLocal[] = [];
    let prevStructData = new Map<string, GDBField[]>();
    let prevValueStructData = new Map<string, GDBField[]>();
    let prevArrayReadings = new Map<string, string>();

    // varName → { hint, initialIdx, idxFieldName, arrFieldName }
    const knownValueStructs = new Map<string, {
        hint: 'stack' | 'queue';
        initialIdx: number;
        idxFieldNames: string[];
        arrFieldName: string;
    }>();

    for (let i = 0; i < snapshots.length; i++) {
        const snap = snapshots[i];
        const isLast = i === snapshots.length - 1;

        // ── 1. New allocations ────────────────────────────────────────────────
        // A genuine allocation is detected when a pointer variable changes to a
        // NEW address (one we haven't seen before) that also has valid struct data.
        // This avoids treating uninitialized garbage values as allocations.
        for (const local of snap.locals) {
            if (!isPointerType(local.type)) continue;
            if (isNullPointer(local.value)) continue;

            const addr = local.value;
            if (knownAddrs.has(addr)) continue;

            const prevVal = prevPtrValues.get(local.name);
            // Skip first sight: the variable might hold a garbage stack value
            // before its initialization line executes. Wait for a real change.
            if (prevVal === undefined) continue;
            if (prevVal === addr) continue; // unchanged

            // Must have valid struct data at this address
            const fields = snap.structData.get(addr);
            if (!fields || fields.length === 0) continue;

            const structType = baseTypeName(local.type);
            const hint = guessHint(fields);

            push({
                line: snap.line,
                type: 'ALLOC',
                var: local.name,
                addr,
                struct: structType,
                hint,
                raw: `[Line ${snap.line}] new ${structType} @ ${addr}`,
            });

            knownAddrs.add(addr);
            addrToStruct.set(addr, structType);

            // Emit initial field values
            for (const f of fields) {
                if (isPointerType(f.type)) {
                    if (!isNullPointer(f.value) && knownAddrs.has(f.value)) {
                        push({
                            line: snap.line,
                            type: 'SET_PTR',
                            source: addr,
                            field: f.name,
                            target: f.value,
                            raw: `[Line ${snap.line}] ${structType}@${addr}.${f.name} → ${f.value}`,
                        });
                    }
                } else {
                    push({
                        line: snap.line,
                        type: 'SET_FIELD',
                        source: addr,
                        field: f.name,
                        value: f.value,
                        raw: `[Line ${snap.line}] ${structType}@${addr}.${f.name} = ${f.value}`,
                    });
                }
            }
        }

        // ── 2. Struct field changes ──────────────────────────────────────────
        for (const [addr, fields] of snap.structData) {
            if (!knownAddrs.has(addr)) continue;
            const prevFields = prevStructData.get(addr);
            if (!prevFields) continue;

            for (const f of fields) {
                const prev = prevFields.find(p => p.name === f.name);
                if (!prev || prev.value === f.value) continue;

                const structType = addrToStruct.get(addr) ?? 'Node';

                if (isPointerType(f.type)) {
                    const newAddr = isNullPointer(f.value) ? undefined : f.value;

                    // If target is a new address with struct data → discover & ALLOC it
                    if (newAddr && !knownAddrs.has(newAddr)) {
                        const newFields = snap.structData.get(newAddr);
                        if (newFields && newFields.length > 0) {
                            const newStructType = baseTypeName(f.type);
                            push({
                                line: snap.line,
                                type: 'ALLOC',
                                addr: newAddr,
                                struct: newStructType,
                                hint: guessHint(newFields),
                                raw: `[Line ${snap.line}] new ${newStructType} @ ${newAddr}`,
                            });
                            knownAddrs.add(newAddr);
                            addrToStruct.set(newAddr, newStructType);
                            for (const nf of newFields) {
                                if (isPointerType(nf.type)) {
                                    if (!isNullPointer(nf.value) && knownAddrs.has(nf.value)) {
                                        push({
                                            line: snap.line, type: 'SET_PTR',
                                            source: newAddr, field: nf.name, target: nf.value,
                                            raw: `[Line ${snap.line}] ${newStructType}@${newAddr}.${nf.name} → ${nf.value}`,
                                        });
                                    }
                                } else {
                                    push({
                                        line: snap.line, type: 'SET_FIELD',
                                        source: newAddr, field: nf.name, value: nf.value,
                                        raw: `[Line ${snap.line}] ${newStructType}@${newAddr}.${nf.name} = ${nf.value}`,
                                    });
                                }
                            }
                        }
                    }

                    push({
                        line: snap.line,
                        type: 'SET_PTR',
                        source: addr,
                        field: f.name,
                        target: newAddr,
                        raw: `[Line ${snap.line}] ${structType}@${addr}.${f.name} → ${isNullPointer(f.value) ? 'null' : f.value}`,
                    });
                } else {
                    push({
                        line: snap.line,
                        type: 'SET_FIELD',
                        source: addr,
                        field: f.name,
                        value: f.value,
                        raw: `[Line ${snap.line}] ${structType}@${addr}.${f.name} = ${f.value}`,
                    });
                }
            }
        }

        // ── 2b. BFS: discover nodes reachable only via pointer chains ───────────
        // Handles cases where multiple new nodes are allocated between GDB steps
        // (e.g. head->next->next where the middle node was caught by section 2's
        // inline ALLOC but its own pointer fields still need to be followed).
        {
            const bfsQ: Array<{ srcAddr: string; srcField: string; tgtAddr: string; tgtType: string }> = [];

            for (const knownAddr of knownAddrs) {
                const fields = snap.structData.get(knownAddr);
                if (!fields) continue;
                for (const f of fields) {
                    if (isPointerType(f.type) && !isNullPointer(f.value) &&
                        !knownAddrs.has(f.value) && snap.structData.has(f.value)) {
                        bfsQ.push({ srcAddr: knownAddr, srcField: f.name, tgtAddr: f.value, tgtType: baseTypeName(f.type) });
                    }
                }
            }

            while (bfsQ.length > 0) {
                const { srcAddr, srcField, tgtAddr, tgtType } = bfsQ.shift()!;
                if (knownAddrs.has(tgtAddr)) continue;

                const tgtFields = snap.structData.get(tgtAddr);
                if (!tgtFields || tgtFields.length === 0) continue;

                push({
                    line: snap.line, type: 'ALLOC',
                    addr: tgtAddr, struct: tgtType, hint: guessHint(tgtFields),
                    raw: `[Line ${snap.line}] new ${tgtType} @ ${tgtAddr}`,
                });
                knownAddrs.add(tgtAddr);
                addrToStruct.set(tgtAddr, tgtType);

                for (const nf of tgtFields) {
                    if (isPointerType(nf.type)) {
                        if (!isNullPointer(nf.value) && knownAddrs.has(nf.value)) {
                            push({
                                line: snap.line, type: 'SET_PTR',
                                source: tgtAddr, field: nf.name, target: nf.value,
                                raw: `[Line ${snap.line}] ${tgtType}@${tgtAddr}.${nf.name} → ${nf.value}`,
                            });
                        } else if (!isNullPointer(nf.value) && snap.structData.has(nf.value) && !knownAddrs.has(nf.value)) {
                            bfsQ.push({ srcAddr: tgtAddr, srcField: nf.name, tgtAddr: nf.value, tgtType: baseTypeName(nf.type) });
                        }
                    } else {
                        push({
                            line: snap.line, type: 'SET_FIELD',
                            source: tgtAddr, field: nf.name, value: nf.value,
                            raw: `[Line ${snap.line}] ${tgtType}@${tgtAddr}.${nf.name} = ${nf.value}`,
                        });
                    }
                }

                // Emit the pointer connection from parent to this newly discovered node
                push({
                    line: snap.line, type: 'SET_PTR',
                    source: srcAddr, field: srcField, target: tgtAddr,
                    raw: `[Line ${snap.line}] ${addrToStruct.get(srcAddr) ?? tgtType}@${srcAddr}.${srcField} → ${tgtAddr}`,
                });
            }
        }

        // ── 3. Scope-level pointer variable changes ──────────────────────────
        for (const local of snap.locals) {
            if (!isPointerType(local.type)) continue;

            const prev = prevLocals.find(l => l.name === local.name);
            if (prev && prev.value === local.value) continue;

            // Only emit SET_LABEL if target is a known node or null
            const addr = isNullPointer(local.value) ? undefined : local.value;
            if (addr && !knownAddrs.has(addr)) continue;

            push({
                line: snap.line,
                type: 'SET_PTR',
                var: '__scope',
                field: local.name,
                target: addr,
                raw: `[Line ${snap.line}] ${local.name} = ${addr ?? 'nullptr'}`,
            });
        }

        // ── 4. Primitive local variable changes ──────────────────────────────
        for (const local of snap.locals) {
            if (isPointerType(local.type)) continue;
            // Struct-type locals are handled in section 5; skip here
            if (snap.valueStructData.has(local.name)) continue;

            const prev = prevLocals.find(l => l.name === local.name);
            if (prev && prev.value === local.value) continue;

            push({
                line: snap.line,
                type: 'LOCAL_VAR',
                var: local.name,
                value: local.value,
                target: local.type,
                raw: `[Line ${snap.line}] ${local.type} ${local.name} = ${local.value}`,
            });
        }

        // ── 5. Array-based struct (Stack / Queue) ────────────────────────────
        for (const [varName, fields] of snap.valueStructData) {
            const arrFields = fields.filter(f => f.type.includes('['));
            const idxFields = fields.filter(f => isIntegralType(f.type));
            if (arrFields.length === 0 || idxFields.length === 0) continue;

            const prevFields = prevValueStructData.get(varName);

            // First appearance: fields may be uninitialized (constructor not yet run).
            // Just record them as prevFields — don't classify or emit anything yet.
            if (!prevFields) continue;

            if (!knownValueStructs.has(varName)) {
                // Second appearance: constructor has run, fields are now initialized.
                // Register the struct with current (stable) initial values.
                const hint: 'stack' | 'queue' = idxFields.length >= 2 ? 'queue' : 'stack';
                const initialIdx = parseInt(idxFields[0].value);
                knownValueStructs.set(varName, {
                    hint,
                    initialIdx: isNaN(initialIdx) ? -1 : initialIdx,
                    idxFieldNames: idxFields.map(f => f.name),
                    arrFieldName: arrFields[0].name,
                });
                push({
                    line: snap.line,
                    type: 'ALLOC',
                    var: varName,
                    addr: `__val__${varName}`,
                    hint,
                    raw: `[Line ${snap.line}] ${varName} (${hint})`,
                });
                continue; // skip push/pop for this (constructor→init) transition
            }

            const info = knownValueStructs.get(varName)!;

            if (info.hint === 'stack') {
                // Single index field → track push/pop
                const idxName = info.idxFieldNames[0];
                const currF = fields.find(f => f.name === idxName);
                const prevF = prevFields.find(f => f.name === idxName);
                if (!currF || !prevF) continue;

                const curr = parseInt(currF.value);
                const prev = parseInt(prevF.value);
                if (isNaN(curr) || isNaN(prev) || curr === prev) continue;
                // Sanity check: ignore garbage-value transitions
                if (Math.abs(curr - prev) > 1000) continue;

                if (curr > prev) {
                    // PUSH — element is at data[curr] (top-style, initial=-1)
                    //          or  data[curr-1] (size-style, initial=0)
                    for (let i = prev + 1; i <= curr; i++) {
                        const elemIdx = info.initialIdx < 0 ? i : i - 1;
                        const key = `${varName}.${info.arrFieldName}[${elemIdx}]`;
                        const val = snap.arrayReadings.get(key) ?? '';
                        push({
                            line: snap.line,
                            type: 'PUSH',
                            var: varName,
                            value: val,
                            raw: `[Line ${snap.line}] ${varName}.push(${val})`,
                        });
                    }
                } else {
                    // POP
                    for (let i = prev; i > curr; i--) {
                        push({
                            line: snap.line,
                            type: 'POP',
                            var: varName,
                            raw: `[Line ${snap.line}] ${varName}.pop()`,
                        });
                    }
                }
            } else {
                // Queue — multiple index fields (front + rear pattern).
                // Distinguish enqueue vs dequeue by checking whether the element
                // at data[curr-1] is freshly written (value changed since last snapshot)
                // or was already there (read-pointer advancing = dequeue).
                for (const idxName of info.idxFieldNames) {
                    const currF = fields.find(f => f.name === idxName);
                    const prevF = prevFields.find(f => f.name === idxName);
                    if (!currF || !prevF) continue;

                    const curr = parseInt(currF.value);
                    const prev = parseInt(prevF.value);
                    if (isNaN(curr) || isNaN(prev) || curr === prev) continue;
                    if (Math.abs(curr - prev) > 1000) continue;

                    if (curr > prev) {
                        // Index advanced — determine if this is a write (enqueue) or
                        // a read advance (dequeue) by checking if data[curr-1] changed.
                        const elemIdx = curr - 1;
                        const key = `${varName}.${info.arrFieldName}[${elemIdx}]`;
                        const currVal = snap.arrayReadings.get(key) ?? '';
                        const prevVal = prevArrayReadings.get(key);

                        const isNewWrite = prevVal === undefined || prevVal !== currVal;

                        if (isNewWrite) {
                            // Rear advanced and data was freshly written → enqueue
                            push({
                                line: snap.line,
                                type: 'PUSH',
                                var: varName,
                                value: currVal,
                                raw: `[Line ${snap.line}] ${varName}.enqueue(${currVal})`,
                            });
                        } else {
                            // Front advanced, data unchanged → dequeue
                            push({
                                line: snap.line,
                                type: 'POP',
                                var: varName,
                                raw: `[Line ${snap.line}] ${varName}.dequeue()`,
                            });
                        }
                    }
                }
            }
        }

        // ── 6. Attach program output to the last step ────────────────────────
        if (isLast && programOutput && steps.length > 0) {
            steps[steps.length - 1].output = programOutput;
        }

        // Update previous state
        for (const local of snap.locals) {
            if (isPointerType(local.type)) {
                prevPtrValues.set(local.name, local.value);
            }
        }
        prevLocals = snap.locals;
        prevStructData = snap.structData;
        prevValueStructData = snap.valueStructData;
        prevArrayReadings = snap.arrayReadings;
    }

    return steps;
}
