/**
 * The environment a child process is allowed to see.
 *
 * Both spawn sites used to build `{ ...process.env }`, which handed the user's
 * own C++ everything this server holds. `import 'dotenv/config'` at index.ts:1
 * loads server/.env into process.env at startup, so this three-line program
 * printed the live API key:
 *
 *     #include <cstdio>
 *     #include <cstdlib>
 *     int main() { printf("%s\n", getenv("GROQ_API_KEY")); }
 *
 * Reproduced before this file was written. The child here IS the untrusted
 * input, so it gets an allowlist rather than a denylist — a denylist has to be
 * updated every time a secret is added, and forgetting to is silent.
 *
 * The list is short because it was measured, not guessed. On Windows with MSYS2
 * (g++ 16.3, gdb 16.3), PATH alone was enough to compile, to load symbols, and
 * to run the inferior to correct output. Everything else below is boring OS
 * plumbing a C runtime may reach for; none of it is ever a secret.
 *
 * Note this is not a sandbox. It stops the server from handing its own secrets
 * to user code; it does nothing about what that code reads off the filesystem.
 */

/** Where the MSYS2 runtime DLLs live — a Windows child cannot start without them. */
const MSYS2_BIN = 'C:\\msys64\\ucrt64\\bin';

/** Wanted on every platform. */
const SHARED = ['PATH', 'LANG', 'LC_ALL', 'TZ'];

/** Windows: the CRT reads these, and COMSPEC/PATHEXT matter if anything shells out. */
const WIN32 = [
    'SystemRoot', 'SystemDrive', 'windir', 'COMSPEC', 'PATHEXT',
    'TMP', 'TEMP', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE',
];

/** POSIX: TMPDIR steers temp files, TERM keeps GDB quiet. HOME is deliberately
 *  absent — GDB is spawned with --nx so it reads no init file, and user code has
 *  no business being told where the server account's home directory is. */
const POSIX = ['TMPDIR', 'TERM'];

/**
 * Build the environment for a compiler, debugger or traced binary.
 *
 * Pure on purpose: both arguments are injectable so CI can assert the allowlist
 * on either platform without spawning anything.
 */
export function childEnv(
    source: NodeJS.ProcessEnv = process.env,
    platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
    const allowed = [...SHARED, ...(platform === 'win32' ? WIN32 : POSIX)];

    // Windows stores these under whatever casing the OS chose — SYSTEMROOT and
    // Path are both common. Reading process.env directly happens to work, since
    // Node wraps it in a case-insensitive proxy, but a plain object (what a test
    // passes) is case-sensitive and would silently come back empty. Index once,
    // then emit the canonical name so the child sees one unambiguous key.
    const index = new Map<string, string>();
    if (platform === 'win32') {
        for (const [key, value] of Object.entries(source)) {
            if (value !== undefined) index.set(key.toLowerCase(), value);
        }
    }
    const read = (name: string): string | undefined =>
        platform === 'win32' ? index.get(name.toLowerCase()) : source[name];

    const env: NodeJS.ProcessEnv = {};
    for (const name of allowed) {
        const value = read(name);
        if (value !== undefined) env[name] = value;
    }

    // The MSYS2 prefix used to be pasted at both spawn sites; it belongs with
    // the rest of the environment construction.
    if (platform === 'win32') {
        env.PATH = env.PATH ? `${MSYS2_BIN};${env.PATH}` : MSYS2_BIN;
    }

    return env;
}

/** Exported for the test that pins which names are allowed through. */
export const ALLOWED_NAMES = { SHARED, WIN32, POSIX } as const;
