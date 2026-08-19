import { describe, it, expect } from 'vitest';
import { buildRunRedirect } from '../gdbDriver.js';

/**
 * The `run < in > out` console command GDB is given.
 *
 * The string here is the whole fix, so the string is what gets pinned. The
 * behaviour behind it was checked against gdb 16.3 by hand: with a space in the
 * path, GDB reports the failure only on the `&"..."` stream channel, which
 * handleLine() discards, and never as a ^error — so the driver sees a clean
 * result and the program runs with no redirect, holding GDB's own MI pipes as
 * its stdin and stdout. The quoted form runs and produces correct output.
 *
 * The quotes are backslash-escaped because the caller embeds this inside an MI
 * string: `interpreter-exec console "<this>"`.
 */

describe('buildRunRedirect', () => {
    it('quotes both paths', () => {
        expect(buildRunRedirect('/tmp/a/in', '/tmp/a/out', 'linux'))
            .toBe('run < \\"/tmp/a/in\\" > \\"/tmp/a/out\\"');
    });

    // os.tmpdir() on Windows is C:\Users\<name>\AppData\Local\Temp, so every
    // account whose name contains a space used to hit the silent failure. Only
    // the last path component is UUID-based; its parents are not.
    it('survives a space in the path', () => {
        const cmd = buildRunRedirect('C:/Users/Jane Doe/T/in.txt', 'C:/Users/Jane Doe/T/out.txt', 'win32');
        expect(cmd).toBe('run < \\"C:/Users/Jane Doe/T/in.txt\\" > \\"C:/Users/Jane Doe/T/out.txt\\"');
    });

    it('produces an MI line whose quoting balances', () => {
        const mi = `interpreter-exec console "${buildRunRedirect('/t/i', '/t/o', 'linux')}"`;
        expect(mi).toBe('interpreter-exec console "run < \\"/t/i\\" > \\"/t/o\\""');
        // Four escaped quotes inside, one unescaped pair around the whole thing.
        expect(mi.match(/\\"/g)).toHaveLength(4);
    });

    it('rewrites backslashes on Windows only', () => {
        expect(buildRunRedirect('C:\\T\\in', 'C:\\T\\out', 'win32'))
            .toBe('run < \\"C:/T/in\\" > \\"C:/T/out\\"');
    });

    // On POSIX a backslash is a legal filename character, so rewriting it would
    // name a different file. It also cannot be quoted safely for the shell GDB
    // uses, so it is refused instead.
    it('refuses a backslash on posix rather than rewriting it', () => {
        expect(() => buildRunRedirect('/tmp/a\\b/in', '/tmp/out', 'linux')).toThrow(/unquotable/);
    });

    // GDB hands `run` to /bin/sh on Linux (startup-with-shell is on by default),
    // so these keep their meaning inside double quotes. A loud failure beats a
    // command that quietly means something else.
    it.each([
        ['a double quote', '/tmp/a"b/in'],
        ['a dollar sign', '/tmp/$USER/in'],
        ['a backtick', '/tmp/a`id`b/in'],
        ['a newline', '/tmp/a\nb/in'],
    ])('refuses %s', (_label, path) => {
        expect(() => buildRunRedirect(path, '/tmp/out', 'linux')).toThrow(/unquotable/);
    });

    it('checks the output path too, not just the input', () => {
        expect(() => buildRunRedirect('/tmp/in', '/tmp/a"b/out', 'linux')).toThrow(/unquotable/);
    });
});
