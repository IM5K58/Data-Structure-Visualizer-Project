/**
 * Test environment shims for APIs jsdom does not implement.
 */

// jsdom has no ResizeObserver. Components use it to re-measure layout, which is
// a no-op in a headless render, so a stub that never fires is the right shape.
if (typeof globalThis.ResizeObserver === 'undefined') {
    class ResizeObserverStub implements ResizeObserver {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    }
    globalThis.ResizeObserver = ResizeObserverStub;
}

// jsdom implements requestAnimationFrame but not always cancelAnimationFrame's
// pairing under fake timers; ensure both exist.
if (typeof globalThis.requestAnimationFrame === 'undefined') {
    const timers = new Map<number, ReturnType<typeof setTimeout>>();
    let nextId = 1;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
        const id = nextId++;
        timers.set(id, setTimeout(() => { timers.delete(id); cb(0); }, 16));
        return id;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((id: number) => {
        const t = timers.get(id);
        if (t !== undefined) { clearTimeout(t); timers.delete(id); }
    }) as typeof cancelAnimationFrame;
}
