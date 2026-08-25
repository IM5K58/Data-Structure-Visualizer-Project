import { describe, it, expect } from 'vitest';
import { Slots, QueueFullError, QueueTimeoutError } from '../slots.js';

const tick = () => new Promise(r => setTimeout(r, 0));

describe('Slots ceiling', () => {
    it('lets jobs through up to the limit', async () => {
        const s = new Slots(2, 10, 1000);
        await s.acquire();
        await s.acquire();
        expect(s.inFlight).toBe(2);
    });

    it('makes the next job wait rather than run', async () => {
        const s = new Slots(1, 10, 1000);
        const release = await s.acquire();

        let ran = false;
        const pending = s.acquire().then(() => { ran = true; });
        await tick();
        expect(ran).toBe(false);
        expect(s.queued).toBe(1);

        release();
        await pending;
        expect(ran).toBe(true);
    });

    it('hands the slot straight to the next waiter without dipping', async () => {
        const s = new Slots(1, 10, 1000);
        const release = await s.acquire();
        const pending = s.acquire();
        release();
        await pending;
        // Still exactly one job running — the count never went to zero and back.
        expect(s.inFlight).toBe(1);
        expect(s.queued).toBe(0);
    });
});

describe('Slots refusal', () => {
    it('refuses immediately once the queue is full', async () => {
        const s = new Slots(1, 2, 5000);
        await s.acquire();
        s.acquire().catch(() => {});   // waiter 1
        s.acquire().catch(() => {});   // waiter 2
        await expect(s.acquire()).rejects.toBeInstanceOf(QueueFullError);
    });

    it('gives up waiting after the timeout', async () => {
        const s = new Slots(1, 10, 30);
        await s.acquire();
        await expect(s.acquire()).rejects.toBeInstanceOf(QueueTimeoutError);
    });

    // A request that timed out must not still be holding a queue place, or the
    // queue fills with corpses and every later request is refused.
    it('leaves no queue entry behind after a timeout', async () => {
        const s = new Slots(1, 10, 20);
        await s.acquire();
        await expect(s.acquire()).rejects.toBeInstanceOf(QueueTimeoutError);
        expect(s.queued).toBe(0);
    });
});

describe('Slots release', () => {
    it('ignores a second release of the same slot', async () => {
        const s = new Slots(2, 10, 1000);
        const release = await s.acquire();
        await s.acquire();
        release();
        release();                 // a defensive double-release must not free two
        expect(s.inFlight).toBe(1);
    });

    it('drains a burst without leaking slots', async () => {
        const s = new Slots(2, 20, 5000);
        let peak = 0;
        await Promise.all(Array.from({ length: 12 }, async () => {
            const release = await s.acquire();
            peak = Math.max(peak, s.inFlight);
            await tick();
            release();
        }));
        expect(peak).toBeLessThanOrEqual(2);
        expect(s.inFlight).toBe(0);
        expect(s.queued).toBe(0);
    });
});
