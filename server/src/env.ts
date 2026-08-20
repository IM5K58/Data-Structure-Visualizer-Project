/**
 * Read a whole-number setting from the environment.
 *
 * `parseInt` was used at all fourteen of these sites, and it is the wrong tool:
 * it stops at the first non-digit and returns what it has. So
 * `RLIMIT_AS_BYTES=256M` became `--as=256` — a 256-BYTE address space, which
 * kills every traced program the instant it starts and surfaces as the
 * unrelated-sounding "GDB failed to start or ptrace denied". The value looks
 * perfectly correct sitting in the env file, which is what makes it dangerous.
 *
 * An empty value is the mirror image: `parseInt('')` is NaN, and the
 * `?? fallback` these sites used never fires for it, because '' is neither null
 * nor undefined. The NaN then flows into a `--cpu=` flag or a setTimeout.
 *
 * So: parse strictly, and fail at startup rather than at request time. A
 * resource limit that quietly becomes a different number is worse than no limit
 * at all, because it looks configured. compiler.ts already refuses to start
 * when prlimit is missing, for the same reason.
 */
export function intFromEnv(
    name: string,
    fallback: number,
    source: NodeJS.ProcessEnv = process.env,
): number {
    const raw = source[name];
    // Unset and blank both mean "use the default". Blank is worth treating that
    // way explicitly: it is what an env file with `FOO=` on a line produces.
    if (raw === undefined || raw.trim() === '') return fallback;

    const value = raw.trim();
    if (!/^[0-9]+$/.test(value)) {
        throw new Error(
            `${name}="${raw}" is not a whole number. Size suffixes (K, M, G), units and `
            + `signs are not supported — give the plain byte count or number.`,
        );
    }

    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
        throw new Error(
            `${name}="${raw}" must be a positive whole number no larger than ${Number.MAX_SAFE_INTEGER}.`,
        );
    }
    return parsed;
}
