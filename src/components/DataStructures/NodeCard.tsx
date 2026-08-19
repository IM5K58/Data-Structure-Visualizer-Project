import { memo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { MemoryNode } from '../../types';
import { abbreviatePointer } from './geometry';
import { PULSE_RING } from './accents';

/**
 * The node card, drawn five times in five files.
 *
 * The skeleton — a type header over a body of 45%/55% rows, one per field then
 * one per pointer — was byte-identical across all five copies. Everything that
 * actually differed is now a prop: an accent triple, the card width, which
 * optional chrome is attached, and GraphView's two DOM ids.
 *
 * Split in two on purpose. Four views own a dedicated inner box that carries the
 * pulse ring, but GraphChart puts the ring straight on its animated positioned
 * element, which also holds its label chips. A single component could only
 * absorb GraphChart by adding a DOM level or by shrinking its ring away from
 * those chips — a real regression whenever a node has labels. So `NodeCardBody`
 * is the header+rows (usable directly under a caller-owned element) and
 * `NodeCard` adds the ring box for the four views that have one.
 *
 * Contains no framer-motion, no refs and no hooks: all five copies had zero
 * motion elements inside the card region, so each view can migrate on its own
 * with a literally unchanged DOM tree.
 */

/** What `usePulse` returns. The views own the usePulse call — it needs a
 *  reference-stable trigger, which Visualizer already guarantees. */
export interface NodeCardPulse {
    nodeId: string;
    property: string | null;
}

/** The per-view accent. Free class strings, so no discriminated union is needed. */
export interface NodeCardTone {
    /** Field value cell, e.g. 'text-accent-cyan'. */
    fieldValue: string;
    /** Resting background of a pointer row, e.g. 'bg-accent-purple/5'. */
    pointerRow: string;
    /** Pointer value cell: colour, opacity and tint together. */
    pointerValue: string;
}

/** Per-pointer-name override, so a back-edge marker is data rather than a fork. */
export interface NodeCardPointerStyle {
    rowClass?: string;
    valueClass?: string;
    nameSuffix?: ReactNode;
}

export interface NodeCardBodyProps {
    node: MemoryNode;
    pulse: NodeCardPulse | null;
    tone: NodeCardTone;
    /** number → inline px; string → any CSS width such as '100%'. */
    width: number | string;
    /** Defaults to `width`. GraphView needs a full-width header over a 144px body. */
    headerWidth?: number | string;
    /** Extra classes on the body div. */
    bodyClassName?: string;
    /** Defaults to 'shadow-xl shadow-bg-secondary/20'; GraphChart drops the tint. */
    bodyShadowClass?: string;
    /** Placeholder when a node has neither fields nor pointers. Omit to render nothing. */
    emptyText?: string;
    pointerStyle?: (pointerName: string) => NodeCardPointerStyle | null;
    /** DOM id for a pointer's value cell. Off by default — only GraphView emits ids. */
    pointerCellId?: (pointerName: string) => string;
}

// ── Invariants: byte-identical in all five copies, so not part of `tone`. ────

/** Applied to the box element while its node is pulsed. */
export { PULSE_RING as NODE_CARD_PULSE_RING } from './accents';
/** Local alias so the card body can apply the shared treatment. */
const PULSE_RING_CLASS = PULSE_RING;
/** Base classes of the box element. */
export const NODE_CARD_BOX = 'flex flex-col items-center transition-shadow duration-500';

const FIELD_PULSE = 'bg-accent-cyan/20';
const POINTER_PULSE = 'bg-accent-cyan/25';
const NAME_CELL = 'w-[45%] p-1.5 border-r border-border/40 text-text-muted bg-black/10 '
    + 'text-[11px] font-mono tracking-tighter truncate';
const POINTER_NAME_CELL = 'w-[45%] p-1.5 border-r border-border/40 text-text-muted text-center '
    + 'bg-black/20 text-[11px] font-mono tracking-tighter truncate';
const HEADER = 'bg-bg-tertiary px-3 py-1 rounded-t-lg border border-border text-[10px] '
    + 'font-bold text-text-secondary text-center tracking-wider z-10';
const BODY = 'bg-bg-panel border border-t-0 border-border rounded-b-lg overflow-hidden';
const EMPTY_BODY = 'p-4 text-center text-[10px] text-text-muted italic opacity-50 font-mono';
const FIELD_ROW = 'flex border-b border-border/40 text-xs text-center transition-colors duration-500';
const POINTER_ROW = 'flex border-b border-border/40 text-xs transition-colors duration-500';

function widthStyle(w: number | string): CSSProperties {
    return { width: typeof w === 'number' ? `${w}px` : w };
}

function Body({
    node, pulse, tone, width, headerWidth, bodyClassName = '',
    bodyShadowClass = 'shadow-xl shadow-bg-secondary/20',
    emptyText, pointerStyle, pointerCellId,
}: NodeCardBodyProps) {
    const isPulsed = pulse?.nodeId === node.id;
    const fields = Object.entries(node.fields);
    const pointers = Object.entries(node.pointers);

    return (
        <>
            <div className={HEADER} style={widthStyle(headerWidth ?? width)}>{node.type}</div>
            <div className={`${BODY} ${bodyShadowClass} ${bodyClassName}`.trim()} style={widthStyle(width)}>
                {fields.map(([name, value]) => (
                    <div
                        key={name}
                        className={`${FIELD_ROW} ${isPulsed && pulse?.property === name ? FIELD_PULSE : ''}`}
                    >
                        <div className={NAME_CELL}>{name}</div>
                        <div className={`w-[55%] p-1.5 font-bold truncate ${tone.fieldValue}`}>
                            {value !== undefined ? String(value) : '?'}
                        </div>
                    </div>
                ))}

                {pointers.map(([name, targetId]) => {
                    const override = pointerStyle?.(name) ?? null;
                    const pulsed = isPulsed && pulse?.property === name;
                    const rowBg = pulsed ? POINTER_PULSE : (override?.rowClass ?? tone.pointerRow);
                    return (
                        <div key={name} className={`${POINTER_ROW} ${rowBg}`}>
                            <div className={POINTER_NAME_CELL}>
                                {name}
                                {override?.nameSuffix}
                            </div>
                            <div
                                id={pointerCellId?.(name)}
                                className={'w-[55%] p-1.5 text-center tracking-tighter truncate font-bold '
                                    + (override?.valueClass ?? tone.pointerValue)}
                            >
                                {abbreviatePointer(targetId)}
                            </div>
                        </div>
                    );
                })}

                {emptyText && fields.length === 0 && pointers.length === 0 && (
                    <div className={EMPTY_BODY}>{emptyText}</div>
                )}
            </div>
        </>
    );
}

export const NodeCardBody = memo(Body);

export interface NodeCardProps extends NodeCardBodyProps {
    /** Box classes while NOT pulsed — the view supplies its own resting look. */
    restClassName?: string;
    /** Classes always on the box. */
    boxClassName?: string;
    /** DOM id for the box. Off by default — only GraphView emits ids. */
    boxId?: string;
    /** Rendered inside the box after the body: HEAD badges, label chips. */
    children?: ReactNode;
}

function Card({ restClassName = '', boxClassName = '', boxId, children, ...body }: NodeCardProps) {
    const pulsed = body.pulse?.nodeId === body.node.id;
    return (
        <div
            id={boxId}
            className={`${NODE_CARD_BOX} ${boxClassName} ${pulsed ? PULSE_RING_CLASS : restClassName}`}
        >
            <NodeCardBody {...body} />
            {children}
        </div>
    );
}

export const NodeCard = memo(Card);

export interface NodeLabelsProps {
    labels: readonly string[];
    chipClassName: string;
}

/** The label chip row. Placed inside the box or beside it, as the view needs. */
export function NodeLabels({ labels, chipClassName }: NodeLabelsProps) {
    if (labels.length === 0) return null;
    return (
        <div className="flex gap-1 mt-1 flex-wrap justify-center">
            {labels.map(l => (
                <span key={l} className={chipClassName}>{l}</span>
            ))}
        </div>
    );
}
