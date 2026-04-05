/**
 * GDB Machine Interface (MI) 드라이버
 * GDB를 --interpreter=mi2 모드로 실행하여 C++ 프로그램을 라인별로 추적합니다.
 */

import { spawn, ChildProcess } from 'child_process';
import { writeFile, readFile, rm } from 'fs/promises';

const GDB_PATH = process.env.GDB_PATH ?? (process.platform === 'win32'
    ? 'C:\\msys64\\ucrt64\\bin\\gdb.exe'
    : '/usr/bin/gdb');

const MAX_STEPS = 500;

// ===== Public Types =====

export interface GDBLocal {
    name: string;
    type: string;
    value: string;     // stripped address (no GDB annotation)
    rawValue: string;  // original GDB value, may contain " <symbol>"
}

export interface GDBField {
    name: string;   // field name (e.g., "data", "next")
    type: string;   // C++ type (e.g., "int", "Node *")
    value: string;  // value as string
}

export interface GDBStopInfo {
    reason: string;
    line: number;
    file: string;
    func: string;
}

export interface GDBSnapshot {
    line: number;
    func: string;
    locals: GDBLocal[];
    /** addr (hex string) → struct fields at that address (pointer-based nodes) */
    structData: Map<string, GDBField[]>;
    /** varName → fields (scalar + array metadata) for stack-allocated structs */
    valueStructData: Map<string, GDBField[]>;
    /** "varName.field[idx]" → element value (for array-based Stack/Queue) */
    arrayReadings: Map<string, string>;
}

export interface GDBSessionResult {
    snapshots: GDBSnapshot[];
    programOutput: string;
    timedOut: boolean;
    error?: string;
}

// ===== GDB MI Parser =====

/**
 * GDB MI 값 파서. 문법: value = string | tuple | list
 * Examples:
 *   "hello"
 *   {name="x",type="int",value="5"}
 *   [{name="x",...},{name="y",...}]
 *   [child={exp="data",value="42",type="int"},...]
 */
class MIParser {
    private pos = 0;
    constructor(private str: string) {}

    parseResults(): Record<string, unknown> {
        const obj: Record<string, unknown> = {};
        while (this.pos < this.str.length) {
            this.skipWS();
            const key = this.parseIdent();
            if (!key) { this.pos++; continue; }
            this.skipWS();
            if (this.str[this.pos] === '=') {
                this.pos++;
                obj[key] = this.parseValue();
            }
            if (this.str[this.pos] === ',') this.pos++;
        }
        return obj;
    }

    private parseValue(): unknown {
        this.skipWS();
        const ch = this.str[this.pos];
        if (ch === '"') return this.parseString();
        if (ch === '{') return this.parseTuple();
        if (ch === '[') return this.parseList();
        return this.parseIdent();
    }

    parseString(): string {
        this.pos++; // skip opening "
        let result = '';
        while (this.pos < this.str.length && this.str[this.pos] !== '"') {
            if (this.str[this.pos] === '\\') {
                this.pos++;
                const esc = this.str[this.pos] ?? '';
                result += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc;
            } else {
                result += this.str[this.pos];
            }
            this.pos++;
        }
        if (this.str[this.pos] === '"') this.pos++;
        return result;
    }

    private parseTuple(): Record<string, unknown> {
        this.pos++; // skip {
        const obj: Record<string, unknown> = {};
        while (this.pos < this.str.length && this.str[this.pos] !== '}') {
            this.skipWS();
            const key = this.parseIdent();
            if (!key) { this.pos++; continue; }
            this.skipWS();
            if (this.str[this.pos] === '=') {
                this.pos++;
                obj[key] = this.parseValue();
            }
            if (this.str[this.pos] === ',') this.pos++;
        }
        if (this.str[this.pos] === '}') this.pos++;
        return obj;
    }

    private parseList(): unknown[] {
        this.pos++; // skip [
        const arr: unknown[] = [];
        while (this.pos < this.str.length && this.str[this.pos] !== ']') {
            this.skipWS();
            // Check if it's a key=value pair (e.g., "child={...}")
            const savedPos = this.pos;
            const key = this.parseIdent();
            this.skipWS();
            if (key && this.str[this.pos] === '=') {
                this.pos++;
                arr.push(this.parseValue()); // push value only, discard key
            } else {
                this.pos = savedPos;
                arr.push(this.parseValue());
            }
            if (this.str[this.pos] === ',') this.pos++;
        }
        if (this.str[this.pos] === ']') this.pos++;
        return arr;
    }

    private parseIdent(): string {
        let result = '';
        while (this.pos < this.str.length && /[\w\-.]/.test(this.str[this.pos])) {
            result += this.str[this.pos++];
        }
        return result;
    }

    private skipWS(): void {
        while (this.pos < this.str.length &&
               (this.str[this.pos] === ' ' || this.str[this.pos] === '\t')) {
            this.pos++;
        }
    }
}

function parseMI(str: string): Record<string, unknown> {
    return new MIParser(str).parseResults();
}

// ===== Helpers =====

/**
 * GDB often annotates pointer values with symbol names, e.g.:
 *   "0x70ba40 <Node::Node()>"  or  "0x7ff7313d7040 <__native_startup_lock>"
 * Strip everything after the first space to get the raw hex address.
 */
export function stripGDBAnnotation(val: string): string {
    return val.split(' ')[0].trim();
}

export function isNullPointer(val: string): boolean {
    const raw = stripGDBAnnotation(val);
    return raw === '0x0' || raw === '0' || raw === '(null)' || raw === 'NULL' || raw === '';
}

export function isPointerType(type: string): boolean {
    return type.trimEnd().endsWith('*');
}

/**
 * Returns true if the type looks like a user-defined struct/class
 * (not a primitive, not a pointer, not an array, not a std:: type).
 */
export function isStructType(type: string): boolean {
    if (isPointerType(type)) return false;
    if (type.includes('[')) return false;
    if (type.includes('&')) return false;
    if (type.includes('std::')) return false;
    const clean = type
        .replace(/\b(const|volatile|unsigned|long|short|signed|struct|class)\b/g, '')
        .trim();
    return !/^(int|char|bool|float|double|void|size_t|ptrdiff_t|wchar_t|auto)$/.test(clean)
        && clean.length > 0;
}

/** True if the type is a plain integer-like scalar (used to detect index fields). */
export function isIntegralType(type: string): boolean {
    const clean = type
        .replace(/\b(const|volatile|unsigned|long|short|signed)\b/g, '')
        .trim();
    return /^(int|char|size_t|ptrdiff_t)$/.test(clean);
}

function strOf(v: unknown): string {
    return v == null ? '' : String(v);
}

// ===== GDB Driver =====

interface PendingCmd {
    resolve: (r: { class: string; results: Record<string, unknown> }) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}

export class GDBDriver {
    private proc: ChildProcess | null = null;
    private rawBuf = '';
    private token = 100;
    private pending = new Map<number, PendingCmd>();
    private stopResolve: ((i: GDBStopInfo) => void) | null = null;
    private stopReject: ((e: Error) => void) | null = null;
    private stopTimer: ReturnType<typeof setTimeout> | null = null;

    async start(binaryPath: string): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            // Windows: MSYS2 DLL들이 PATH에 있어야 컴파일된 바이너리가 실행됨
            const env = { ...process.env };
            if (process.platform === 'win32') {
                const msysBin = 'C:\\msys64\\ucrt64\\bin';
                env.PATH = `${msysBin};${env.PATH ?? ''}`;
            }

            this.proc = spawn(GDB_PATH, [
                '--interpreter=mi2',
                '--quiet',
                '--nx',
                binaryPath,
            ], { stdio: ['pipe', 'pipe', 'ignore'], env });

            this.proc.stdout!.setEncoding('utf-8');
            this.proc.stdout!.on('data', (chunk: string) => {
                this.rawBuf += chunk;
                this.flush();
            });

            // Fail immediately if GDB executable is not found
            this.proc.once('error', (err) => {
                reject(new Error(`GDB not found at "${GDB_PATH}": ${err.message}`));
            });

            // If GDB exits immediately (bad binary, wrong arch, etc.) → reject
            this.proc.once('exit', (code) => {
                clearTimeout(t);
                reject(new Error(`GDB exited immediately with code ${code}`));
            });

            // Give GDB time to initialize; remove listeners once we consider it started
            const t = setTimeout(() => {
                this.proc!.removeAllListeners('error');
                this.proc!.removeAllListeners('exit');
                resolve();
            }, process.platform === 'win32' ? 1500 : 800);
        });
    }

    private flush(): void {
        const lines = this.rawBuf.split('\n');
        this.rawBuf = lines.pop() ?? '';
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) console.log('  [GDB raw]', trimmed);
            this.handleLine(trimmed);
        }
    }

    private handleLine(line: string): void {
        if (!line || line === '(gdb)' || line.startsWith('~"') || line.startsWith('&"')) return;

        // Result record: <token>^<class>[,<results>]
        const rr = line.match(/^(\d+)\^(\w+)(?:,(.+))?$/);
        if (rr) {
            const tok = parseInt(rr[1]);
            const cls = rr[2];
            const rest = rr[3] ?? '';
            const cmd = this.pending.get(tok);
            if (cmd) {
                clearTimeout(cmd.timer);
                this.pending.delete(tok);
                cmd.resolve({ class: cls, results: parseMI(rest) });
            }
            return;
        }

        // Async stop record
        if (line.startsWith('*stopped')) {
            const rest = line.slice('*stopped'.length);
            const results = rest.startsWith(',') ? parseMI(rest.slice(1)) : {};
            const frame = results['frame'] as Record<string, unknown> ?? {};
            const info: GDBStopInfo = {
                reason: strOf(results['reason']) || 'unknown',
                line: parseInt(strOf(frame['line'])) || 0,
                file: strOf(frame['file']),
                func: strOf(frame['func']),
            };
            if (this.stopResolve) {
                if (this.stopTimer) clearTimeout(this.stopTimer);
                const resolve = this.stopResolve;
                this.stopResolve = null;
                this.stopReject = null;
                resolve(info);
            }
        }
        // Ignore *running, =thread-*, =library-*, etc.
    }

    private sendMI(cmd: string): Promise<{ class: string; results: Record<string, unknown> }> {
        if (!this.proc?.stdin?.writable) {
            return Promise.reject(new Error('GDB stdin not writable'));
        }
        const tok = this.token++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(tok);
                reject(new Error(`GDB MI timeout: ${cmd}`));
            }, 8000);
            this.pending.set(tok, { resolve, reject, timer });
            this.proc!.stdin!.write(`${tok}-${cmd}\n`);
        });
    }

    private waitStop(ms = 12000): Promise<GDBStopInfo> {
        return new Promise((resolve, reject) => {
            this.stopResolve = resolve;
            this.stopReject = reject;
            this.stopTimer = setTimeout(() => {
                this.stopResolve = null;
                this.stopReject = null;
                reject(new Error('GDB stop timeout'));
            }, ms);
        });
    }

    async setBreakpoint(location: string): Promise<void> {
        await this.sendMI(`break-insert -f ${location}`).catch(() => {});
    }

    async runWithRedirect(stdinFile: string, stdoutFile: string): Promise<GDBStopInfo> {
        const stopPromise = this.waitStop();
        // Convert Windows backslashes to forward slashes for GDB shell.
        // Do NOT add inner quotes — they break the MI string parser.
        // Temp paths are UUID-based so they never contain spaces.
        const inPath = stdinFile.replace(/\\/g, '/');
        const outPath = stdoutFile.replace(/\\/g, '/');
        const cmd = `run < ${inPath} > ${outPath}`;
        await this.sendMI(`interpreter-exec console "${cmd}"`).catch(() => {});
        return stopPromise;
    }

    async run(): Promise<GDBStopInfo> {
        const stopPromise = this.waitStop();
        await this.sendMI('exec-run').catch(() => {});
        return stopPromise;
    }

    async next(): Promise<GDBStopInfo | null> {
        try {
            const stopPromise = this.waitStop(6000);
            await this.sendMI('exec-next').catch(() => {});
            return await stopPromise;
        } catch {
            return null;
        }
    }

    async getLocals(): Promise<GDBLocal[]> {
        try {
            const res = await this.sendMI('stack-list-locals 2');
            if (res.class !== 'done') return [];
            const locals = res.results['locals'];
            if (!Array.isArray(locals)) return [];
            return (locals as unknown[]).map((l) => {
                const obj = l as Record<string, unknown>;
                const rawValue = strOf(obj['value']);
                return {
                    name: strOf(obj['name']),
                    type: strOf(obj['type']),
                    value: stripGDBAnnotation(rawValue),
                    rawValue,
                };
            }).filter(l => l.name);
        } catch {
            return [];
        }
    }

    /** Inspect pointer variable and return struct fields */
    async inspectPointer(expr: string): Promise<GDBField[]> {
        const varName = `vtmp${this.token}`; // must start with a letter (GDB rejects __ prefix)
        try {
            const createRes = await this.sendMI(`var-create ${varName} * ${expr}`);
            if (createRes.class !== 'done') return [];

            const fields = await this.listChildrenFlat(varName);
            await this.sendMI(`var-delete ${varName}`).catch(() => {});
            return fields;
        } catch {
            await this.sendMI(`var-delete ${varName}`).catch(() => {});
            return [];
        }
    }

    /**
     * Recursively expand GDB var children, flattening access-specifier
     * pseudo-nodes (public / private / protected) that GDB inserts for C++ structs.
     */
    private async listChildrenFlat(varName: string): Promise<GDBField[]> {
        const childRes = await this.sendMI(`var-list-children --all-values ${varName}`);
        if (childRes.class !== 'done') return [];
        const children = childRes.results['children'];
        if (!Array.isArray(children)) return [];

        const fields: GDBField[] = [];
        for (const c of children as unknown[]) {
            const obj = c as Record<string, unknown>;
            const exp  = strOf(obj['exp']  ?? obj['name']); // display name
            const gdbVarName = strOf(obj['name']);           // GDB internal var name for recursion

            // GDB wraps C++ struct members in access-specifier pseudo-children
            if (exp === 'public' || exp === 'private' || exp === 'protected') {
                const sub = await this.listChildrenFlat(gdbVarName);
                fields.push(...sub);
                continue;
            }

            if (!exp || exp.startsWith('__')) continue;

            fields.push({
                name:  exp,
                type:  strOf(obj['type']),
                value: stripGDBAnnotation(strOf(obj['value'])),
            });
        }
        return fields;
    }

    /**
     * Evaluate a C++ expression in the current frame and return its value string.
     */
    async evaluateExpression(expr: string): Promise<string> {
        try {
            const escaped = expr.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            const res = await this.sendMI(`data-evaluate-expression "${escaped}"`);
            if (res.class !== 'done') return '';
            return stripGDBAnnotation(strOf(res.results['value']));
        } catch {
            return '';
        }
    }

    /**
     * List direct children of a GDB var object for a value-type struct.
     * - Recurses into access-specifier pseudo-nodes (public/private/protected).
     * - Arrays: recorded as { value: "[size]" } without fetching elements.
     * - Scalars: value read via C++ expression using cppPath.fieldName.
     * - Nested structs: skipped (numchild > 0, not array, not access specifier).
     */
    private async listValueStructFields(gdbVarName: string, cppPath: string): Promise<GDBField[]> {
        const res = await this.sendMI(`var-list-children ${gdbVarName}`);
        if (res.class !== 'done') return [];
        const children = res.results['children'];
        if (!Array.isArray(children)) return [];

        const fields: GDBField[] = [];
        for (const c of children as unknown[]) {
            const obj   = c as Record<string, unknown>;
            const exp   = strOf(obj['exp']  ?? obj['name']);
            const child = strOf(obj['name']);
            const type  = strOf(obj['type']);
            const numchild = parseInt(strOf(obj['numchild'])) || 0;

            if (exp === 'public' || exp === 'private' || exp === 'protected') {
                const sub = await this.listValueStructFields(child, cppPath);
                fields.push(...sub);
                continue;
            }
            if (!exp || exp.startsWith('__')) continue;

            if (type.includes('[')) {
                // Array field: store element count as value, do not fetch elements here
                fields.push({ name: exp, type, value: `[${numchild}]` });
            } else if (numchild === 0) {
                // Scalar field: read via C++ expression
                const val = await this.evaluateExpression(`${cppPath}.${exp}`);
                fields.push({ name: exp, type, value: val });
            }
            // Nested structs (numchild > 0, not array) → skip for now
        }
        return fields;
    }

    /**
     * Inspect a value-type (stack-allocated) struct local variable.
     * Returns its scalar fields and array-field metadata.
     */
    async inspectValueStruct(varName: string): Promise<GDBField[]> {
        const tmpName = `vstv${this.token}`;
        try {
            const createRes = await this.sendMI(`var-create ${tmpName} * ${varName}`);
            if (createRes.class !== 'done') return [];
            const fields = await this.listValueStructFields(tmpName, varName);
            await this.sendMI(`var-delete ${tmpName}`).catch(() => {});
            return fields;
        } catch {
            await this.sendMI(`var-delete ${tmpName}`).catch(() => {});
            return [];
        }
    }

    async quit(): Promise<void> {
        try { this.proc?.stdin?.write('-gdb-exit\n'); } catch { /* ignore */ }
        await new Promise<void>((resolve) => {
            if (!this.proc) { resolve(); return; }
            const t = setTimeout(() => {
                try { this.proc?.kill('SIGKILL'); } catch { /* ignore */ }
                resolve();
            }, 1000);
            this.proc.once('exit', () => { clearTimeout(t); resolve(); });
        });
    }
}

// ===== Session Runner =====

function delay(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

function isTerminalReason(reason: string): boolean {
    return reason.startsWith('exited') || reason === 'signal-received';
}

/**
 * GDB 세션을 실행하여 라인별 변수 스냅샷을 수집합니다.
 */
export async function runGDBSession(
    binaryPath: string,
    stdinContent: string,
): Promise<GDBSessionResult> {
    const stdinFile = `${binaryPath}.stdin`;
    const stdoutFile = `${binaryPath}.stdout`;

    await writeFile(stdinFile, stdinContent, 'utf-8');
    await writeFile(stdoutFile, '', 'utf-8');

    const driver = new GDBDriver();
    let timedOut = false;

    try {
        console.log('  [GDB] starting with binary:', binaryPath);
        await driver.start(binaryPath);
        console.log('  [GDB] started OK, setting breakpoint at main');
        await driver.setBreakpoint('main');
        console.log('  [GDB] breakpoint set, running with redirect');

        let stop: GDBStopInfo;
        try {
            stop = await driver.runWithRedirect(stdinFile, stdoutFile);
            console.log('  [GDB] initial stop:', stop.reason, 'at line', stop.line, 'func', stop.func);
        } catch (e) {
            console.error('  [GDB] runWithRedirect failed:', e);
            return { snapshots: [], programOutput: '', timedOut: false, error: 'GDB failed to start or ptrace denied' };
        }

        // Remember the user's source file path from the first stop
        const userSrcFile = stop.file; // e.g. "C:/Temp/.../main.cpp"

        const snapshots: GDBSnapshot[] = [];
        let steps = 0;

        while (steps < MAX_STEPS) {
            if (isTerminalReason(stop.reason)) break;

            // Skip CRT/runtime frames — only collect snapshots inside user source
            if (stop.file && userSrcFile && stop.file !== userSrcFile) {
                const nextStop = await driver.next();
                if (!nextStop) break;
                stop = nextStop;
                steps++;
                continue;
            }

            // Capture local variables at this line
            const locals = await driver.getLocals();

            // BFS traversal of the pointer graph starting from local pointer variables.
            // This discovers nodes reachable only via struct fields (e.g. head->next->next)
            // in addition to nodes directly pointed to by locals.
            const structData = new Map<string, GDBField[]>();
            {
                const visited = new Set<string>();
                const bfsQueue: Array<{ expr: string; addr: string }> = [];
                const MAX_NODES = 50;

                for (const local of locals) {
                    if (isPointerType(local.type) && !isNullPointer(local.value) && !visited.has(local.value)) {
                        bfsQueue.push({ expr: local.name, addr: local.value });
                    }
                }

                while (bfsQueue.length > 0 && visited.size < MAX_NODES) {
                    const item = bfsQueue.shift()!;
                    if (visited.has(item.addr)) continue;
                    visited.add(item.addr);

                    const fields = await driver.inspectPointer(item.expr);
                    if (fields.length === 0) continue;
                    structData.set(item.addr, fields);

                    for (const f of fields) {
                        if (isPointerType(f.type) && !isNullPointer(f.value) && !visited.has(f.value)) {
                            bfsQueue.push({ expr: `${item.expr}->${f.name}`, addr: f.value });
                        }
                    }
                }
            }

            // Inspect stack-allocated struct locals (array-based Stack/Queue)
            const valueStructData = new Map<string, GDBField[]>();
            const arrayReadings   = new Map<string, string>();
            for (const local of locals) {
                if (isPointerType(local.type)) continue;
                if (!isStructType(local.type))  continue;
                const fields = await driver.inspectValueStruct(local.name);
                if (fields.length === 0) continue;
                valueStructData.set(local.name, fields);

                // For each pair of (array field, integer field), read the element
                // at index [curr] and [curr-1] so gdbMapper can detect push/pop.
                const arrFields = fields.filter(f => f.type.includes('['));
                const idxFields = fields.filter(f => isIntegralType(f.type));
                for (const arr of arrFields) {
                    for (const idx of idxFields) {
                        const iv = parseInt(idx.value);
                        if (isNaN(iv)) continue;
                        for (const ri of [iv, iv - 1].filter(i => i >= 0)) {
                            const key = `${local.name}.${arr.name}[${ri}]`;
                            const val = await driver.evaluateExpression(
                                `${local.name}.${arr.name}[${ri}]`
                            );
                            if (val) arrayReadings.set(key, val);
                        }
                    }
                }
            }

            snapshots.push({ line: stop.line, func: stop.func, locals, structData, valueStructData, arrayReadings });

            const nextStop = await driver.next();
            if (!nextStop) break;
            stop = nextStop;
            steps++;
        }

        if (steps >= MAX_STEPS) timedOut = true;

        await driver.quit();

        let programOutput = '';
        try { programOutput = await readFile(stdoutFile, 'utf-8'); } catch { /* no output */ }

        return { snapshots, programOutput, timedOut };

    } catch (err) {
        await driver.quit().catch(() => {});
        return {
            snapshots: [],
            programOutput: '',
            timedOut: false,
            error: err instanceof Error ? err.message : 'GDB session failed',
        };
    } finally {
        await delay(200); // let GDB release file handles before deleting
        await rm(stdinFile, { force: true }).catch(() => {});
        await rm(stdoutFile, { force: true }).catch(() => {});
    }
}
