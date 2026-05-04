import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import StackPlate from '../DataStructures/StackPlate';
import QueueBlock from '../DataStructures/QueueBlock';
import GraphView from '../DataStructures/GraphView';
import TreeChart from '../DataStructures/TreeChart';
import CircularListView from '../DataStructures/CircularListView';
import DoublyListView from '../DataStructures/DoublyListView';
import GraphChart from '../DataStructures/GraphChart';
import HeapView from '../DataStructures/HeapView';
import HashMapView from '../DataStructures/HashMapView';
import UnionFindView from '../DataStructures/UnionFindView';
import type { MemoryNode } from '../../types';

afterEach(cleanup);

const node = (id: string, fields: Record<string, number | string | boolean> = {}, pointers: Record<string, string | null> = {}, labels: string[] = []): MemoryNode =>
    ({ id, type: 'Node', fields, pointers, labels });

describe('Visualization render smoke tests', () => {
    it('StackPlate — empty + populated', () => {
        const { rerender, container } = render(<StackPlate data={{ type: 'stack', name: 's', items: [] }} />);
        expect(container.textContent).toMatch(/empty/i);
        rerender(
            <StackPlate
                data={{
                    type: 'stack',
                    name: 's',
                    items: [{ id: '1', value: 10 }, { id: '2', value: 20 }],
                }}
            />,
        );
        expect(container.textContent).toContain('10');
        expect(container.textContent).toContain('20');
        expect(container.textContent).toMatch(/TOP/);
    });

    it('QueueBlock — populated', () => {
        const { container } = render(
            <QueueBlock
                data={{
                    type: 'queue',
                    name: 'q',
                    items: [{ id: '1', value: 100 }, { id: '2', value: 200 }],
                }}
            />,
        );
        expect(container.textContent).toContain('100');
        expect(container.textContent).toContain('200');
    });

    it('GraphView — memory nodes', () => {
        const { container } = render(
            <GraphView data={{ type: 'memory', name: 'Heap', nodes: [
                node('0x100', { data: 1 }, { next: '0x200' }),
                node('0x200', { data: 2 }, { next: null }),
            ] }} />,
        );
        expect(container.textContent).toContain('data');
    });

    it('TreeChart — root + children', () => {
        const { container } = render(
            <TreeChart data={{ type: 'tree', name: 'Tree', rootId: '0x100', nodes: [
                node('0x100', { val: 5 }, { left: '0x200', right: '0x300' }),
                node('0x200', { val: 3 }, {}),
                node('0x300', { val: 7 }, {}),
            ] }} />,
        );
        expect(container.textContent).toMatch(/ROOT/);
    });

    it('CircularListView — small loop', () => {
        const { container } = render(
            <CircularListView data={{ type: 'circular', name: 'Ring', headId: '0x100', nodes: [
                node('0x100', { v: 1 }, { next: '0x200' }),
                node('0x200', { v: 2 }, { next: '0x100' }),
            ] }} />,
        );
        expect(container.textContent).toMatch(/HEAD/);
    });

    it('DoublyListView — next/prev rendered', () => {
        const { container } = render(
            <DoublyListView data={{ type: 'doubly', name: 'DLL', headId: '0x100', nodes: [
                node('0x100', {}, { next: '0x200', prev: null }),
                node('0x200', {}, { next: null, prev: '0x100' }),
            ] }} />,
        );
        expect(container.textContent).toContain('next');
        expect(container.textContent).toContain('prev');
        expect(container.textContent).toMatch(/HEAD/);
    });

    it('GraphChart — branching with cycle', () => {
        const { container } = render(
            <GraphChart data={{ type: 'graph', name: 'G', nodes: [
                node('A', {}, { p1: 'B', p2: 'C' }),
                node('B', {}, { p1: 'C' }),
                node('C', {}, { p1: 'B' }),
            ] }} />,
        );
        expect(container.textContent).toMatch(/General Graph/);
        expect(container.textContent).toContain('p1');
    });

    it('HeapView — array + tree visible', () => {
        const { container } = render(
            <HeapView data={{ type: 'heap', name: 'PQ', items: [
                { id: '1', value: 10 },
                { id: '2', value: 5 },
                { id: '3', value: 8 },
            ] }} />,
        );
        expect(container.textContent).toMatch(/Heap/);
        expect(container.textContent).toContain('10');
        expect(container.textContent).toContain('top:');
    });

    it('HashMapView — buckets + entries', () => {
        const { container } = render(
            <HashMapView data={{ type: 'hashmap', name: 'M', entries: [
                { id: '1', key: 'foo', value: '1' },
                { id: '2', key: 'bar', value: '2' },
            ] }} />,
        );
        expect(container.textContent).toMatch(/HashMap/);
        expect(container.textContent).toContain('foo');
        expect(container.textContent).toContain('bar');
    });

    it('UnionFindView — forest from parent map', () => {
        const { container } = render(
            <UnionFindView data={{ type: 'unionfind', name: 'UF',
                parent: { '1': '1', '2': '1', '3': '3' },
                ops: [{ id: 'a', op: 'union', a: '2', b: '1' }],
            }} />,
        );
        expect(container.textContent).toMatch(/Union-Find/);
        expect(container.textContent).toContain('elements:');
        expect(container.textContent).toContain('sets:');
    });

    it('UnionFindView — empty state', () => {
        const { container } = render(
            <UnionFindView data={{ type: 'unionfind', name: 'UF', parent: {}, ops: [] }} />,
        );
        expect(container.textContent).toMatch(/no operations yet/i);
    });
});
