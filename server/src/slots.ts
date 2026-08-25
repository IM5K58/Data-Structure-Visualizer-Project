/**
 * A ceiling on how many compile/trace jobs run at once.
 *
 * The rate limiter bounds requests per minute per IP; it does not bound how
 * many are in flight together. Each job spawns g++ (which forks cc1plus, as and
 * ld) and then GDB plus the traced program, and each of those is threads and
 * memory the container does not otherwise account for. Measured on the
 * deployment image: idle is 14 threads, eight concurrent requests peak at 82.
 *
 * The point is not to make the server faster — it is to make it degrade in a
 * way you can predict. Past the ceiling a request waits its turn, and past the
 * queue bound it is refused immediately with a 503 rather than joining a pile
 * that will time out anyway.
 */

export class Slots {
    private active = 0;
    private readonly waiting: Array<{
        resolve: (release: () => void) => void;
        reject: (err: Error) => void;
        timer: ReturnType<typeof setTimeout>;
    }> = [];

    constructor(
        private readonly limit: number,
        private readonly maxWaiting: number,
        private readonly waitMs: number,
    ) {}

    get inFlight(): number { return this.active; }
    get queued(): number { return this.waiting.length; }

    /**
     * Take a slot, waiting if they are all busy.
     *
     * Resolves with the release function — call it exactly once, in a `finally`,
     * or the slot leaks and the ceiling ratchets down to zero over time.
     *
     * Rejects with `QueueFullError` when the queue is already at its bound, and
     * with `QueueTimeoutError` when the wait runs out.
     */
    acquire(): Promise<() => void> {
        if (this.active < this.limit) {
            this.active++;
            return Promise.resolve(this.releaser());
        }

        if (this.waiting.length >= this.maxWaiting) {
            return Promise.reject(new QueueFullError(
                `${this.limit} jobs already running and ${this.maxWaiting} waiting`,
            ));
        }

        return new Promise((resolve, reject) => {
            const entry = {
                resolve,
                reject,
                timer: setTimeout(() => {
                    const i = this.waiting.indexOf(entry);
                    if (i !== -1) this.waiting.splice(i, 1);
                    reject(new QueueTimeoutError(`waited ${this.waitMs}ms for a free slot`));
                }, this.waitMs),
            };
            this.waiting.push(entry);
        });
    }

    /** One-shot release, so a caller that defensively releases twice cannot
     *  hand the same slot to two jobs. */
    private releaser(): () => void {
        let released = false;
        return () => {
            if (released) return;
            released = true;

            const next = this.waiting.shift();
            if (next) {
                clearTimeout(next.timer);
                next.resolve(this.releaser());   // the slot passes straight on
            } else {
                this.active--;
            }
        };
    }
}

export class QueueFullError extends Error {
    constructor(detail: string) {
        super(`Server is busy: ${detail}.`);
        this.name = 'QueueFullError';
    }
}

export class QueueTimeoutError extends Error {
    constructor(detail: string) {
        super(`Server is busy: ${detail}.`);
        this.name = 'QueueTimeoutError';
    }
}
