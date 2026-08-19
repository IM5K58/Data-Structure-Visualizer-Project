interface Props {
    scale: number;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onReset: () => void;
    /** Accent class for the percentage readout, e.g. 'text-green-400'. */
    tone: string;
    /** Named in the button labels so screen-reader users know which panel. */
    label: string;
}

/**
 * The zoom controls, previously copied into four views.
 *
 * Every copy had the same two accessibility holes: the buttons carried only a
 * `−` / `+` glyph with no accessible name, and reset was a `<div onClick>` —
 * unreachable by keyboard and unannounced. Both are fixed here once.
 */
export default function ZoomToolbar({ scale, onZoomIn, onZoomOut, onReset, tone, label }: Props) {
    const button = 'w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 '
        + 'text-text-secondary transition-colors outline-none '
        + 'focus-visible:ring-1 focus-visible:ring-accent-cyan/60';

    return (
        <div
            className="absolute top-4 right-4 z-30 flex items-center gap-2 bg-bg-panel/80
                       backdrop-blur-md border border-border p-1.5 rounded-lg shadow-xl"
            role="group"
            aria-label={`${label} zoom controls`}
        >
            <button type="button" onClick={onZoomOut} className={button} aria-label={`Zoom out of ${label}`}>
                −
            </button>
            <button
                type="button"
                onClick={onReset}
                className={`px-2 text-[10px] font-bold ${tone} min-w-[45px] text-center rounded
                            hover:text-white transition-colors outline-none
                            focus-visible:ring-1 focus-visible:ring-accent-cyan/60`}
                aria-label={`Reset ${label} view to fit`}
            >
                {Math.round(scale * 100)}%
            </button>
            <button type="button" onClick={onZoomIn} className={button} aria-label={`Zoom in on ${label}`}>
                +
            </button>
        </div>
    );
}
