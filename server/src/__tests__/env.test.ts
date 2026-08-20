import { describe, it, expect } from 'vitest';
import { intFromEnv } from '../env.js';

/**
 * The settings parser that replaced parseInt at all fourteen call sites.
 *
 * The case that matters is `256M`. parseInt stops at the first non-digit and
 * returns 256, so RLIMIT_AS_BYTES=256M produced `--as=256` — a 256-byte address
 * space. Every traced program died instantly, and it surfaced as the
 * unrelated-sounding "GDB failed to start or ptrace denied". Nothing about the
 * env file looked wrong.
 */

describe('intFromEnv defaults', () => {
    it('uses the fallback when the name is unset', () => {
        expect(intFromEnv('MISSING', 42, {})).toBe(42);
    });

    // `FOO=` on a line in an env file. The old code's `?? fallback` never fired
    // for this, because '' is neither null nor undefined — so parseInt('') ran
    // and the setting became NaN.
    it('uses the fallback for an empty or blank value', () => {
        expect(intFromEnv('BLANK', 42, { BLANK: '' })).toBe(42);
        expect(intFromEnv('BLANK', 42, { BLANK: '   ' })).toBe(42);
    });

    it('reads the value when it is a plain whole number', () => {
        expect(intFromEnv('N', 1, { N: '256' })).toBe(256);
        expect(intFromEnv('N', 1, { N: ' 256 ' })).toBe(256);
    });
});

describe('intFromEnv rejects what parseInt silently truncated', () => {
    // The live bug, pinned.
    it('refuses a size suffix instead of reading 256', () => {
        expect(() => intFromEnv('RLIMIT_AS_BYTES', 1, { RLIMIT_AS_BYTES: '256M' }))
            .toThrow(/not a whole number/);
    });

    it.each([
        ['a unit suffix', '8s'],
        ['a decimal', '1.5'],
        ['scientific notation', '1e6'],
        ['hex', '0x40'],
        ['a negative', '-5'],
        ['a leading plus', '+5'],
        ['a thousands separator', '1_000'],
        ['a trailing comment', '64 # bytes'],
        ['pure text', 'unlimited'],
    ])('refuses %s', (_label, value) => {
        expect(() => intFromEnv('N', 1, { N: value })).toThrow(/not a whole number/);
    });

    it('refuses zero, which no caller means', () => {
        expect(() => intFromEnv('N', 1, { N: '0' })).toThrow(/positive whole number/);
    });

    it('refuses a value past the safe integer range', () => {
        expect(() => intFromEnv('N', 1, { N: '99999999999999999999' }))
            .toThrow(/positive whole number/);
    });

    it('names the variable and echoes the value it was given', () => {
        expect(() => intFromEnv('RLIMIT_CPU_SEC', 8, { RLIMIT_CPU_SEC: '8s' }))
            .toThrow(/RLIMIT_CPU_SEC="8s"/);
    });
});

describe('intFromEnv source', () => {
    it('reads the supplied source rather than process.env', () => {
        expect(intFromEnv('PATH', 7, {})).toBe(7);
    });
});
