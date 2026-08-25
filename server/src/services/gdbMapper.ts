/**
 * GDB Snapshot Mapper
 * Converts GDBSnapshot[] (per-line variable state) into TraceStep[] events
 * that are compatible with the existing frontend stepMapper.
 */

import type { GDBSnapshot, GDBField, GDBLocal, STLSnapshot } from './gdbTypes.js';
import { isPointerType, isNullPointer, isIntegralType } from './gdbValues.js';
import type { TraceStep } from '../types/index.js';

export type { TraceStep };

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
 * Split a C++ type name into lowercase word tokens, breaking on camelCase
 * humps as well as separators: `MaxHeap` → ['max','heap'], `min_heap` →
 * ['min','heap'], `BinaryHeap` → ['binary','heap'].
 */
function typeNameTokens(typeName: string): string[] {
    return baseTypeName(typeName)
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .map(t => t.toLowerCase());
}

const HEAP_TOKENS = new Set(['heap', 'heapify', 'pq', 'pqueue', 'priorityqueue', 'binaryheap']);

/**
 * Recognize a user-defined heap class from its type name. In GDB mode we can't
 * see method names, only the type, so this is the only signal available.
 *
 * Tokenizing rather than regex-matching the raw string is what makes `MyHeap`
 * and `BinaryHeap` match while `cheap` does not — a substring test would get
 * both wrong in opposite directions.
 */
function isHeapTypeName(typeName: string): boolean {
    const tokens = typeNameTokens(typeName);
    if (tokens.some(t => HEAP_TOKENS.has(t))) return true;
    for (let i = 0; i < tokens.length - 1; i++) {
        if (tokens[i] === 'priority' && (tokens[i + 1] === 'queue' || tokens[i + 1] === 'q')) return true;
    }
    return false;
}

/** Field names that describe a fixed bound rather than a live index. */
const CAPACITY_NAME = /^(cap|capacity|max_?size|maxsize|max_?len|maxlen|limit|bound|_?capacity)$/i;
/** Field names that plausibly track how many elements are live. */
const SIZE_NAME = /^_?(size|count|cnt|len|length|n|num|top|idx|index|tail|rear|back|end|head|front|start)$/i;
/** Field names that advance as elements are appended. */
const REAR_NAME = /^_?(rear|back|tail|end|write|w)$/i;
/** Field names that advance as elements are consumed. */
const FRONT_NAME = /^_?(front|head|start|read|r|first)$/i;
/** Field names holding the live element count — the most reliable queue signal. */
const COUNT_NAME = /^_?(size|count|cnt|len|length|num|n)$/i;

/** Parse the element count out of an array type such as `int [10]`. */
function arrayCapacity(arrayType: string): number | null {
    const m = /\[\s*(\d+)\s*\]/.exec(arrayType);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * All nodes start as 'node' hint.
 * Actual data structure classification is handled entirely by
 * stepMapper's analyzeAndReclassify() using runtime pointer graph topology.
 */
function guessHint(): 'node' {
    return 'node';
}

// ===== Core Mapper =====

/**
 * Ceiling on how many PUSH/POP commands one container change may produce.
 *
 * Every element here becomes an object in the returned array. A size read from
 * uninitialised memory — which is what `v.size()` gives before the constructor
 * has run — once produced a loop of 27 trillion iterations and killed the
 * server. traceSession rejects such sizes at the source; this is the second
 * line, because this is the file that turns a number into allocations.
 */
const MAX_CONTAINER_COMMANDS = 4096;

function boundedCount(from: number, to: number): number {
    return Math.min(Math.abs(to - from), MAX_CONTAINER_COMMANDS);
}

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
    let prevSTLContainers = new Map<string, STLSnapshot>();
    const knownSTLVars = new Set<string>();
    let prevCallStack: string[] = [];

    // varName → classification + the fields we track for push/pop detection
    const knownValueStructs = new Map<string, {
        hint: 'stack' | 'queue' | 'heap';
        initialIdx: number;
        /** Integral fields that could plausibly be a live index (capacity excluded). */
        idxFieldNames: string[];
        arrFieldName: string;
        /** Declared array length, when the type carried one (`int [10]` → 10). */
        capacity: number | null;
    }>();

    for (let i = 0; i < snapshots.length; i++) {
        const snap = snapshots[i];
        const isLast = i === snapshots.length - 1;

        // ── 0. Call stack diff ────────────────────────────────────────────────
        // Emit a STACK_FRAMES event only when the stack changed since the
        // previous snapshot (function call / return). The frontend uses these
        // to refresh its call-stack panel.
        const cs = snap.callStack ?? [];
        const csChanged =
            cs.length !== prevCallStack.length ||
            cs.some((f, k) => f !== prevCallStack[k]);
        if (csChanged) {
            push({
                line: snap.line,
                type: 'STACK_FRAMES',
                frames: cs.slice(),
                raw: `[Line ${snap.line}] frames: ${cs.join(' › ') || '(empty)'}`,
            });
        }

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
            const hint = guessHint();

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
                                hint: guessHint(),
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
                    addr: tgtAddr, struct: tgtType, hint: guessHint(),
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

        // ── 4b. STL containers (std::stack / queue / priority_queue / vector / deque / map) ──
        for (const [varName, info] of snap.stlContainers) {
            const prev = prevSTLContainers.get(varName);

            // Hint mapping → frontend visualization:
            //   priority_queue                              → 'heap'
            //   map / unordered_map                         → 'hashmap'
            //   queue                                       → 'queue'
            //   stack / vector / deque                      → 'stack'
            const hint =
                info.kind === 'priority_queue' ? 'heap'
                : (info.kind === 'map' || info.kind === 'unordered_map') ? 'hashmap'
                : info.kind === 'queue' ? 'queue'
                : 'stack';

            if (!knownSTLVars.has(varName)) {
                push({
                    line: snap.line,
                    type: 'ALLOC',
                    var: varName,
                    addr: `__stl__${varName}`,
                    hint,
                    raw: `[Line ${snap.line}] ${varName} (std::${info.kind}, size=${info.size})`,
                });
                knownSTLVars.add(varName);

                // Replay current contents so visualization is in sync.
                if (hint === 'hashmap' && info.entries) {
                    for (const e of info.entries) {
                        push({
                            line: snap.line,
                            type: 'MAP_SET',
                            var: varName,
                            key: e.key,
                            value: e.value,
                            raw: `[Line ${snap.line}] ${varName}[${e.key}] = ${e.value}`,
                        });
                    }
                } else if ((hint === 'stack' || hint === 'queue' || hint === 'heap') && info.size > 0 && info.pushValue !== undefined) {
                    const n = Math.min(info.size, MAX_CONTAINER_COMMANDS);
                    for (let i = 0; i < n; i++) {
                        push({
                            line: snap.line,
                            type: 'PUSH',
                            var: varName,
                            value: info.pushValue,
                            raw: `[Line ${snap.line}] ${varName}.push(?)`,
                        });
                    }
                }
                continue;
            }

            if (!prev) continue;

            if (hint === 'hashmap') {
                // Diff entries: emit MAP_SET for added/changed, MAP_REMOVE for removed.
                const prevEntries = new Map((prev.entries ?? []).map(e => [e.key, e.value]));
                const currEntries = new Map((info.entries ?? []).map(e => [e.key, e.value]));
                for (const [k, v] of currEntries) {
                    if (prevEntries.get(k) !== v) {
                        push({
                            line: snap.line,
                            type: 'MAP_SET',
                            var: varName,
                            key: k,
                            value: v,
                            raw: `[Line ${snap.line}] ${varName}[${k}] = ${v}`,
                        });
                    }
                }
                for (const k of prevEntries.keys()) {
                    if (!currEntries.has(k)) {
                        push({
                            line: snap.line,
                            type: 'MAP_REMOVE',
                            var: varName,
                            key: k,
                            raw: `[Line ${snap.line}] ${varName}.erase(${k})`,
                        });
                    }
                }
                continue;
            }

            // PUSH/POP-style containers (stack, queue, heap, vector, deque)
            if (prev.size === info.size) continue;

            if (info.size > prev.size) {
                const value = info.pushValue ?? '';
                const grew = boundedCount(prev.size, info.size);
                for (let i = 0; i < grew; i++) {
                    push({
                        line: snap.line,
                        type: 'PUSH',
                        var: varName,
                        value,
                        raw: `[Line ${snap.line}] ${varName}.push(${value})`,
                    });
                }
            } else {
                const shrank = boundedCount(info.size, prev.size);
                for (let i = 0; i < shrank; i++) {
                    push({
                        line: snap.line,
                        type: 'POP',
                        var: varName,
                        raw: `[Line ${snap.line}] ${varName}.pop()`,
                    });
                }
            }
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
                // Heap detection: if the C++ struct/class type name looks like a heap
                // (MaxHeap, MyHeap, PriorityQueue, …), classify as heap regardless of
                // index-field count. Otherwise fall back to 1-idx → stack, 2+ → queue.
                const local = snap.locals.find(l => l.name === varName);
                const typeName = local?.type ?? '';

                // A `capacity`/`maxSize` member is a fixed bound, not a live index.
                // Tracking it would mean tracking a constant and emitting nothing.
                const trackable = idxFields.filter(f => !CAPACITY_NAME.test(f.name));
                const candidates = trackable.length > 0 ? trackable : idxFields;

                const hint: 'stack' | 'queue' | 'heap' = isHeapTypeName(typeName)
                    ? 'heap'
                    : (candidates.length >= 2 ? 'queue' : 'stack');

                // Prefer an explicitly size-like field for the initial-style probe
                // (top-style starts at -1, size-style starts at 0).
                const probe = candidates.find(f => SIZE_NAME.test(f.name)) ?? candidates[0];
                const initialIdx = parseInt(probe.value);
                knownValueStructs.set(varName, {
                    hint,
                    initialIdx: isNaN(initialIdx) ? -1 : initialIdx,
                    idxFieldNames: candidates.map(f => f.name),
                    arrFieldName: arrFields[0].name,
                    capacity: arrayCapacity(arrFields[0].type),
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

            // Read every tracked index field's prev→curr delta once; both branches
            // below select from this instead of assuming field order.
            const deltas = info.idxFieldNames.map(name => {
                const currF = fields.find(f => f.name === name);
                const prevF = prevFields.find(f => f.name === name);
                if (!currF || !prevF) return null;
                const curr = parseInt(currF.value);
                const prev = parseInt(prevF.value);
                if (isNaN(curr) || isNaN(prev) || curr === prev) return null;
                // Sanity check: ignore garbage-value transitions
                if (Math.abs(curr - prev) > 1000) return null;
                return { name, curr, prev };
            }).filter((d): d is { name: string; curr: number; prev: number } => d !== null);

            if (deltas.length === 0) continue;

            if (info.hint === 'stack' || info.hint === 'heap') {
                // Whichever tracked field actually moved is the live index. A class
                // like `{ int data[100]; int capacity; int size; }` would otherwise
                // latch onto `capacity` and never emit anything.
                const chosen = deltas.find(d => SIZE_NAME.test(d.name)) ?? deltas[0];
                const { curr, prev } = chosen;

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
                // Queue — front/rear pattern. A single enqueue typically moves BOTH
                // `rear` and `count`, so we must emit one event per *operation*, not
                // one per changed field: pick the rear field and the front field by
                // name and ignore everything else (size/count is derived from them).
                const rear = deltas.find(d => REAR_NAME.test(d.name));
                const front = deltas.find(d => FRONT_NAME.test(d.name));

                /** Steps advanced, accounting for a circular wrap back through 0. */
                const advanceOf = (d: { curr: number; prev: number }): number => {
                    if (d.curr > d.prev) return d.curr - d.prev;
                    // Went backwards. With a known capacity this is a ring wrap when
                    // the implied forward distance is small; anything larger is a
                    // reset/clear, which is not a dequeue.
                    if (info.capacity !== null) {
                        const wrapped = d.curr + info.capacity - d.prev;
                        if (wrapped > 0 && wrapped <= 4) return wrapped;
                    }
                    return 0;
                };

                const emitEnqueue = (steps: number, endIdx: number) => {
                    for (let k = steps; k >= 1; k--) {
                        const raw = endIdx - k + 1;
                        const elemIdx = info.capacity !== null
                            ? ((raw % info.capacity) + info.capacity) % info.capacity
                            : raw;
                        const val = snap.arrayReadings.get(`${varName}.${info.arrFieldName}[${elemIdx}]`) ?? '';
                        push({
                            line: snap.line,
                            type: 'PUSH',
                            var: varName,
                            value: val,
                            raw: `[Line ${snap.line}] ${varName}.enqueue(${val})`,
                        });
                    }
                };

                const emitDequeue = (steps: number) => {
                    for (let k = 0; k < steps; k++) {
                        push({
                            line: snap.line,
                            type: 'POP',
                            var: varName,
                            raw: `[Line ${snap.line}] ${varName}.dequeue()`,
                        });
                    }
                };

                // `rear` may point at the next free slot or at the last element;
                // either way the newest element sits just behind the new rear.
                const newestIdx = rear
                    ? (info.initialIdx < 0 ? rear.curr : rear.curr - 1)
                    : null;

                const counter = deltas.find(d => COUNT_NAME.test(d.name));
                if (counter) {
                    // A live element count is unambiguous: it distinguishes an
                    // enqueue from a `clear()` that happens to leave `rear` looking
                    // like it wrapped, and it survives ring-buffer index arithmetic.
                    const delta = counter.curr - counter.prev;
                    if (delta > 0) emitEnqueue(delta, newestIdx ?? counter.curr - 1);
                    else emitDequeue(-delta);
                } else if (rear || front) {
                    if (rear) emitEnqueue(advanceOf(rear), newestIdx!);
                    if (front) emitDequeue(advanceOf(front));
                } else {
                    // No recognizable front/rear names. Fall back to the single
                    // most-moved field and infer direction from whether the element it
                    // now points past was freshly written (enqueue) or pre-existing
                    // (read pointer advancing = dequeue).
                    const d = deltas[0];
                    const steps = advanceOf(d);
                    if (steps > 0) {
                        const elemIdx = d.curr - 1;
                        const key = `${varName}.${info.arrFieldName}[${elemIdx}]`;
                        const currVal = snap.arrayReadings.get(key) ?? '';
                        const prevVal = prevArrayReadings.get(key);
                        const isNewWrite = prevVal === undefined || prevVal !== currVal;

                        if (isNewWrite) {
                            emitEnqueue(steps, d.curr - 1);
                        } else {
                            for (let k = 0; k < steps; k++) {
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
        prevSTLContainers = snap.stlContainers;
        prevCallStack = cs;
    }

    return steps;
}
