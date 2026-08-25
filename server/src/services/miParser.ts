/**
 * GDB Machine Interface (MI): the value grammar.
 *
 * Pure: a string in, a plain object out. It runs inside GDB's stdout
 * handler, so its one hard requirement is that it always terminates.
 */

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
            const loopStart = this.pos;
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

            // parseValue can consume nothing: a character that is not a quote, a
            // brace, a bracket or an identifier character leaves pos exactly
            // where it was, and this loop spins on it forever. That runs inside
            // the stdout 'data' handler, so it takes the whole event loop with
            // it — the server stops answering, it does not just fail a request.
            // parseResults and parseTuple both guard this; this one did not.
            if (this.pos === loopStart) this.pos++;
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

/**
 * Parse an MI result payload. Exported so CI can hold the parser to its one
 * hard requirement: it must always terminate. Its input is whatever arrives on
 * GDB's stdout, and it runs inside the 'data' handler, so a parser that hangs
 * hangs the server.
 */
export function parseMI(str: string): Record<string, unknown> {
    return new MIParser(str).parseResults();
}
