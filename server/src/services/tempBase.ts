/**
 * Where compiled user binaries are written and run from.
 *
 * This used to be `process.platform === 'linux' ? '/dev/shm' : tmpdir()`, hard
 * coded. /dev/shm is RAM-backed, which is the right instinct — a job writes a
 * source file, a binary and two redirect files, and none of it should touch a
 * disk. But Docker mounts /dev/shm `noexec` at 64 MB unless the run overrides
 * it, so under a plain `docker run`, or on a PaaS that gives you no control over
 * mount flags, the binary is written successfully and then cannot be executed.
 *
 * That failure is nasty because it looks like something else entirely: the
 * compile succeeds, the exec fails, and the platform gets blamed for denying
 * ptrace. Switching USE_GDB=false does not help either — the untraced path
 * writes and runs from the same directory.
 *
 * So the choice is made from the actual mount options rather than assumed, and
 * an operator can always override it outright.
 */

/**
 * Decide the temp base. Pure, so CI can exercise every branch without a
 * container: it is handed the platform, the contents of /proc/mounts, and the
 * fallback that os.tmpdir() would have returned.
 *
 * @param mounts contents of /proc/mounts, or null when it cannot be read
 */
export function pickTempBase(
    platform: NodeJS.Platform,
    mounts: string | null,
    osTmpDir: string,
    override?: string,
): { base: string; reason: string } {
    if (override) {
        return { base: override, reason: 'TEMP_BASE was set explicitly' };
    }
    if (platform !== 'linux') {
        return { base: osTmpDir, reason: 'not Linux; /dev/shm is a Linux-only shortcut' };
    }
    if (mounts === null) {
        return { base: osTmpDir, reason: '/proc/mounts unreadable, so exec permission is unknown' };
    }

    // /proc/mounts columns: device, mountpoint, fstype, options, dump, pass.
    const line = mounts.split('\n').find(l => l.split(' ')[1] === '/dev/shm');
    if (!line) {
        return { base: osTmpDir, reason: '/dev/shm is not mounted' };
    }

    const options = (line.split(' ')[3] ?? '').split(',');
    if (options.includes('noexec')) {
        return {
            base: osTmpDir,
            reason: '/dev/shm is mounted noexec, so a compiled binary there could not run',
        };
    }
    return { base: '/dev/shm', reason: '/dev/shm is exec-capable and RAM-backed' };
}
