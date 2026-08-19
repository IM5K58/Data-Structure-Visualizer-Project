import { describe, it, expect } from 'vitest';
import { childEnv } from '../childEnv.js';

/**
 * The allowlist that stops the server handing its own secrets to user C++.
 *
 * These assertions are about NAMES, not behaviour of the toolchain — that part
 * was verified by running g++ and gdb under a stripped environment. What CI can
 * hold onto is the rule: a name nobody put on the list does not reach the child.
 */

const SECRETS = {
    GROQ_API_KEY: 'gsk_live_key',
    AWS_SECRET_ACCESS_KEY: 'aws',
    DATABASE_URL: 'postgres://u:p@h/db',
    SESSION_SECRET: 'shh',
} as const;

describe('childEnv on posix', () => {
    const base = { PATH: '/usr/bin', TMPDIR: '/tmp', HOME: '/home/svc', ...SECRETS };

    it('drops every secret', () => {
        const env = childEnv(base, 'linux');
        for (const name of Object.keys(SECRETS)) {
            expect(env[name], `${name} must not reach user code`).toBeUndefined();
        }
    });

    it('keeps what the toolchain needs', () => {
        const env = childEnv(base, 'linux');
        expect(env.PATH).toBe('/usr/bin');
        expect(env.TMPDIR).toBe('/tmp');
    });

    // GDB runs with --nx, so it reads no init file and does not need HOME. User
    // code has no business learning the server account's home directory.
    it('drops HOME', () => {
        expect(childEnv(base, 'linux').HOME).toBeUndefined();
    });

    it('adds no Windows PATH prefix', () => {
        expect(childEnv(base, 'linux').PATH).not.toContain('msys64');
    });

    it('invents nothing that was not in the source', () => {
        const env = childEnv({ PATH: '/usr/bin' }, 'linux');
        expect(Object.keys(env)).toEqual(['PATH']);
    });
});

describe('childEnv on win32', () => {
    const base = { Path: 'C:/tools', SystemRoot: 'C:/Windows', TEMP: 'C:/Temp', ...SECRETS };

    it('drops every secret', () => {
        const env = childEnv(base, 'win32');
        for (const name of Object.keys(SECRETS)) {
            expect(env[name], `${name} must not reach user code`).toBeUndefined();
        }
    });

    // Windows picks its own casing: the real process.env on the dev box stores
    // SYSTEMROOT, and PATH is commonly Path. Reading process.env directly gets
    // away with this because Node wraps it in a case-insensitive proxy; a plain
    // object does not, so the lookup has to be case-insensitive itself.
    it('finds allowed names whatever their casing, and emits the canonical one', () => {
        const env = childEnv({ SYSTEMROOT: 'C:/Windows', pAtH: 'C:/tools' }, 'win32');
        expect(env.SystemRoot).toBe('C:/Windows');
        expect(env.PATH).toContain('C:/tools');
        expect(Object.keys(env).sort()).toEqual(['PATH', 'SystemRoot']);
    });

    it('puts the MSYS2 runtime directory first on PATH', () => {
        const env = childEnv(base, 'win32');
        expect(env.PATH).toBe('C:\\msys64\\ucrt64\\bin;C:/tools');
    });

    it('still sets PATH when the source has none', () => {
        expect(childEnv({}, 'win32').PATH).toBe('C:\\msys64\\ucrt64\\bin');
    });
});

describe('childEnv against the live environment', () => {
    // The regression that started this: dotenv loads server/.env into
    // process.env, and both spawn sites used to forward the whole thing.
    it('is a small allowlist, not a copy of process.env', () => {
        const env = childEnv();
        expect(env.GROQ_API_KEY).toBeUndefined();
        expect(Object.keys(env).length).toBeLessThan(20);
        expect(env.PATH).toBeDefined();
    });
});
