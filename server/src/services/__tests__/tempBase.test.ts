import { describe, it, expect } from 'vitest';
import { pickTempBase } from '../tempBase.js';

/**
 * Which directory compiled user binaries are written to and executed from.
 *
 * The case that matters is noexec. Docker mounts /dev/shm noexec at 64 MB
 * unless the run overrides it, and the old code hard-coded /dev/shm on Linux —
 * so a plain `docker run` of this image wrote the binary fine and then could not
 * execute it. Nothing in the error said so, and USE_GDB=false failed the same
 * way, because the untraced path uses the same directory.
 */

const EXEC = 'tmpfs /dev/shm tmpfs rw,nosuid,nodev,size=262144k 0 0';
const NOEXEC = 'tmpfs /dev/shm tmpfs rw,nosuid,nodev,noexec,relatime,size=65536k 0 0';
const OTHER = [
    '/dev/sda1 / ext4 rw,relatime 0 0',
    'proc /proc proc rw,nosuid,nodev,noexec,relatime 0 0',
    'tmpfs /tmp tmpfs rw,nosuid,nodev,size=262144k 0 0',
].join('\n');

describe('pickTempBase on Linux', () => {
    it('uses /dev/shm when it is exec-capable', () => {
        const r = pickTempBase('linux', [OTHER, EXEC].join('\n'), '/tmp');
        expect(r.base).toBe('/dev/shm');
    });

    // Docker's default. This is the whole reason the file exists.
    it('falls back when /dev/shm is noexec', () => {
        const r = pickTempBase('linux', [OTHER, NOEXEC].join('\n'), '/tmp');
        expect(r.base).toBe('/tmp');
        expect(r.reason).toMatch(/noexec/);
    });

    it('falls back when /dev/shm is not mounted at all', () => {
        const r = pickTempBase('linux', OTHER, '/tmp');
        expect(r.base).toBe('/tmp');
        expect(r.reason).toMatch(/not mounted/);
    });

    it('falls back when /proc/mounts cannot be read', () => {
        const r = pickTempBase('linux', null, '/tmp');
        expect(r.base).toBe('/tmp');
    });

    // /proc is itself noexec and its line contains the substring "/dev/shm"
    // nowhere — but a sloppy match on the whole line would trip over other
    // noexec mounts. Match the mountpoint column exactly.
    it('reads the mountpoint column, not the whole line', () => {
        const decoy = 'tmpfs /var/run/dev/shm tmpfs rw,noexec 0 0';
        const r = pickTempBase('linux', [decoy, EXEC].join('\n'), '/tmp');
        expect(r.base).toBe('/dev/shm');
    });

    it('does not mistake exec-adjacent option names for noexec', () => {
        const weird = 'tmpfs /dev/shm tmpfs rw,nosuid,nodev,noexecfoo 0 0';
        expect(pickTempBase('linux', weird, '/tmp').base).toBe('/dev/shm');
    });
});

describe('pickTempBase elsewhere', () => {
    it('uses the OS temp dir off Linux', () => {
        expect(pickTempBase('win32', null, 'C:/Temp').base).toBe('C:/Temp');
        expect(pickTempBase('darwin', null, '/var/folders/x').base).toBe('/var/folders/x');
    });

    it('lets an operator override the probe on any platform', () => {
        expect(pickTempBase('linux', NOEXEC, '/tmp', '/mnt/fast').base).toBe('/mnt/fast');
        expect(pickTempBase('win32', null, 'C:/Temp', 'D:/scratch').base).toBe('D:/scratch');
    });
});
