import type { TargetType } from '../../types';

/**
 * One accent per structure type.
 *
 * Lives apart from the registry because the registry imports the views, so a
 * view importing the registry back would close a cycle. Both sides import this.
 *
 * Tailwind classes cannot reach an SVG `stroke`/`fill` attribute, so an accent
 * carries both forms: class names for DOM chrome, raw colour strings for SVG.
 */
export interface Accent {
    /** Panel border class, used by Visualizer. */
    panelBorder: string;
    /** Heading text class, used by each view's <h3>. */
    heading: string;
    /** SVG `stroke=` value for edges; '' when the view draws none. */
    edgeStroke: string;
    /** SVG arrowhead `fill=`; '' when the view draws none. */
    edgeArrow: string;
    /** Whole drop-shadow utility class for edges; '' for none. */
    edgeGlow: string;
}

const NO_EDGES = { edgeStroke: '', edgeArrow: '', edgeGlow: '' } as const;

export const ACCENTS: Record<TargetType, Accent> = {
    stack: {
        panelBorder: 'border-accent-purple/20',
        heading: 'text-accent-purple',
        ...NO_EDGES,
    },
    queue: {
        panelBorder: 'border-accent-cyan/20',
        heading: 'text-accent-cyan',
        ...NO_EDGES,
    },
    memory: {
        panelBorder: 'border-accent-purple/40',
        heading: 'text-accent-purple',
        edgeStroke: 'rgba(192, 132, 252, 1)',
        edgeArrow: 'rgba(192, 132, 252, 0.8)',
        edgeGlow: 'drop-shadow-[0_0_8px_rgba(192,132,252,0.4)]',
    },
    tree: {
        panelBorder: 'border-green-500/20',
        heading: 'text-green-400',
        edgeStroke: 'rgba(74, 222, 128, 0.8)',
        edgeArrow: 'rgba(74, 222, 128, 0.8)',
        edgeGlow: 'drop-shadow-[0_0_8px_rgba(74,222,128,0.3)]',
    },
    circular: {
        panelBorder: 'border-amber-500/30',
        heading: 'text-amber-400',
        edgeStroke: 'rgba(74, 222, 128, 0.8)',
        edgeArrow: 'rgba(74, 222, 128, 0.8)',
        edgeGlow: 'drop-shadow-[0_0_6px_rgba(74,222,128,0.3)]',
    },
    doubly: {
        panelBorder: 'border-accent-cyan/40',
        heading: 'text-accent-cyan',
        ...NO_EDGES,
    },
    graph: {
        panelBorder: 'border-rose-500/30',
        heading: 'text-rose-400',
        edgeStroke: 'rgba(244, 63, 94, 0.85)',
        edgeArrow: 'rgba(244, 63, 94, 0.85)',
        edgeGlow: 'drop-shadow-[0_0_4px_rgba(244,63,94,0.4)]',
    },
    heap: {
        panelBorder: 'border-orange-500/30',
        heading: 'text-orange-400',
        edgeStroke: 'rgba(251, 146, 60, 0.55)',
        edgeArrow: '',
        edgeGlow: '',
    },
    hashmap: {
        panelBorder: 'border-pink-500/30',
        heading: 'text-pink-400',
        ...NO_EDGES,
    },
    unionfind: {
        panelBorder: 'border-emerald-500/30',
        heading: 'text-emerald-400',
        ...NO_EDGES,
    },
};

export function accentFor(type: TargetType): Accent {
    return ACCENTS[type];
}
