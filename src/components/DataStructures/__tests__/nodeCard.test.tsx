import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import type { MemoryNode } from '../../../types';
import { NodeCard, NODE_CARD_PULSE_RING } from '../NodeCard';
import { abbreviatePointer } from '../geometry';

/**
 * The safety net for folding five copies of the card markup into one.
 *
 * The invariants that matter are the ones a view could silently lose in the
 * migration: GraphView's two DOM ids (a measurement contract — the edge layer
 * reads them by id), the accent slots, the per-pointer override that carries
 * DoublyListView's back-edge marker, and the pulse ring.
 */

function node(
    id = '0x100',
    fields: Record<string, number | string | boolean> = { data: 7 },
    pointers: Record<string, string | null> = { next: '0x200' },
): MemoryNode {
    return { id, type: 'Node', fields, pointers, labels: [] };
}

const TONE = {
    fieldValue: 'text-accent-cyan',
    pointerRow: 'bg-accent-purple/5',
    pointerValue: 'text-accent-purple opacity-80 bg-accent-purple/5',
};

const base = { tone: TONE, width: 144, pulse: null };

describe('NodeCard content', () => {
    it('renders the type, field names and values', () => {
        const { container } = render(<NodeCard {...base} node={node()} />);
        expect(container.textContent).toContain('Node');
        expect(container.textContent).toContain('data');
        expect(container.textContent).toContain('7');
    });

    it('abbreviates pointer targets to four characters', () => {
        const { container } = render(
            <NodeCard {...base} node={node('0x100', { data: 7 }, { next: '0x7dd220' })} />);
        expect(container.textContent).toContain('next');
        expect(container.textContent).toContain('*d220');
    });

    it('shows null for an unset pointer', () => {
        const { container } = render(
            <NodeCard {...base} node={node('0x100', {}, { next: null })} />);
        expect(container.textContent).toContain('null');
    });

    it('renders the empty placeholder only when asked', () => {
        const bare = node('0x1', {}, {});
        const withText = render(
            <NodeCard {...base} node={bare} emptyText="Uninitialized Memory" />);
        expect(withText.container.textContent).toContain('Uninitialized');

        const without = render(<NodeCard {...base} node={bare} />);
        expect(without.container.textContent).not.toContain('Uninitialized');
    });
});

describe('NodeCard DOM id contract', () => {
    // GraphView measures these by id to place its edges. No other view may start
    // emitting them, or the document would carry duplicate ids.
    it('emits box and pointer ids only when the view asks', () => {
        const { container } = render(
            <NodeCard
                {...base}
                node={node()}
                boxId="node-0x100"
                pointerCellId={(p) => `ptr-0x100-${p}`}
            />);
        expect(container.querySelector('#node-0x100')).not.toBeNull();
        expect(container.querySelector('#ptr-0x100-next')).not.toBeNull();
    });

    it('emits no ids by default', () => {
        const { container } = render(<NodeCard {...base} node={node()} />);
        expect(container.querySelector('[id]')).toBeNull();
    });
});

describe('NodeCard pulse', () => {
    it('rings the box for the pulsed node only', () => {
        const ringClass = NODE_CARD_PULSE_RING.split(' ')[0];
        const on = render(
            <NodeCard {...base} node={node()} pulse={{ nodeId: '0x100', property: null }} />);
        expect(on.container.querySelector(`.${ringClass}`)).not.toBeNull();

        const off = render(
            <NodeCard {...base} node={node()} pulse={{ nodeId: '0xOTHER', property: null }} />);
        expect(off.container.querySelector(`.${ringClass}`)).toBeNull();
    });

    it('tints the pulsed field row', () => {
        const { container } = render(
            <NodeCard {...base} node={node()} pulse={{ nodeId: '0x100', property: 'data' }} />);
        expect(container.querySelector('.bg-accent-cyan\\/20')).not.toBeNull();
    });

    it('tints the pulsed pointer row', () => {
        const { container } = render(
            <NodeCard {...base} node={node()} pulse={{ nodeId: '0x100', property: 'next' }} />);
        expect(container.querySelector('.bg-accent-cyan\\/25')).not.toBeNull();
    });
});

describe('NodeCard per-view accents', () => {
    it('applies the tone to field and pointer values', () => {
        const { container } = render(
            <NodeCard
                {...base}
                node={node()}
                tone={{ fieldValue: 'text-rose-300', pointerRow: 'bg-rose-500/5', pointerValue: 'text-rose-400' }}
            />);
        expect(container.querySelector('.text-rose-300')).not.toBeNull();
        expect(container.querySelector('.text-rose-400')).not.toBeNull();
    });

    // This is how DoublyListView's back-edge marker stays data instead of a fork.
    it('lets a view override one pointer by name', () => {
        const { container } = render(
            <NodeCard
                {...base}
                node={node('0x100', {}, { next: '0x200', prev: '0x050' })}
                pointerStyle={(p) => p === 'prev'
                    ? { valueClass: 'text-amber-400', nameSuffix: <span>↩</span> }
                    : null}
            />);
        expect(container.textContent).toContain('↩');
        expect(container.querySelector('.text-amber-400')).not.toBeNull();
    });

    it('sizes the card from the width prop', () => {
        const px = render(<NodeCard {...base} node={node()} width={128} />);
        const body = px.container.querySelector('.rounded-b-lg') as HTMLElement;
        expect(body.style.width).toBe('128px');

        const pct = render(<NodeCard {...base} node={node()} width="100%" />);
        const body2 = pct.container.querySelector('.rounded-b-lg') as HTMLElement;
        expect(body2.style.width).toBe('100%');
    });

    it('lets the header be wider than the body', () => {
        const { container } = render(
            <NodeCard {...base} node={node()} width={144} headerWidth="100%" />);
        const header = container.querySelector('.rounded-t-lg') as HTMLElement;
        expect(header.style.width).toBe('100%');
    });
});

describe('abbreviatePointer', () => {
    it('takes the last four characters of an address', () => {
        expect(abbreviatePointer('0x7dd470')).toBe('*d470');
    });

    it('takes the suffix of a synthetic id', () => {
        expect(abbreviatePointer('item-12')).toBe('*12');
    });

    it('renders null for an absent target', () => {
        expect(abbreviatePointer(null)).toBe('null');
        expect(abbreviatePointer(undefined)).toBe('null');
    });
});
