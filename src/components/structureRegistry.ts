import { createElement } from 'react';
import type { ComponentType, ReactElement } from 'react';
import type { DataStructureState, NodeHighlight, TargetType } from '../types';
import { ACCENTS } from './DataStructures/accents';
import StackPlate from './DataStructures/StackPlate';
import QueueBlock from './DataStructures/QueueBlock';
import GraphView from './DataStructures/GraphView';
import TreeChart from './DataStructures/TreeChart';
import CircularListView from './DataStructures/CircularListView';
import DoublyListView from './DataStructures/DoublyListView';
import GraphChart from './DataStructures/GraphChart';
import HeapView from './DataStructures/HeapView';
import HashMapView from './DataStructures/HashMapView';
import UnionFindView from './DataStructures/UnionFindView';

export { accentFor, type Accent } from './DataStructures/accents';

/**
 * One table describing every data-structure type the app can draw.
 *
 * Before this existed, adding a type meant editing a switch with no `default`
 * (a missing case rendered nothing, with no compile or runtime error), a
 * `Record<string, string>` colour map (a missing key silently fell back), and
 * two separate default-height expressions that had already drifted apart — the
 * drag-start one listed five types and the render one listed eight, so heap,
 * hashmap and unionfind panels rendered at 450px and snapped to 300px on the
 * first drag. All four are now driven from here and checked by the compiler.
 *
 * Colours live in ./DataStructures/accents so a view can read its own accent
 * without importing this module, which imports the views.
 *
 * Built with `createElement` rather than JSX so this stays a .ts module: a .tsx
 * file that exports these lookup functions trips react-refresh, which expects
 * component modules to export only components.
 */

export type StateOf<K extends TargetType> = Extract<DataStructureState, { type: K }>;

export interface StructureViewProps<S> {
    data: S;
    highlight?: NodeHighlight | null;
}

export interface StructureEntry<K extends TargetType = TargetType> {
    readonly type: K;
    readonly render: (data: DataStructureState, highlight: NodeHighlight | null) => ReactElement;
    readonly defaultPanelHeight: number;
}

/**
 * The only cast in the design, sealed inside this factory. The call sites stay
 * fully checked: `TreeChart`'s props are `{ data: TreeState }` and
 * `StateOf<'tree'>` is `TreeState`, so passing `GraphChart` under the key
 * `'tree'` is a compile error, and so is storing `entry('graph', …)` in the
 * `tree` slot of the registry.
 */
function entry<K extends TargetType>(
    type: K,
    View: ComponentType<StructureViewProps<StateOf<K>>>,
    defaultPanelHeight: number,
): StructureEntry<K> {
    return {
        type,
        render: (data, highlight) =>
            createElement(View, { data: data as StateOf<K>, highlight }),
        defaultPanelHeight,
    };
}

/** Flat structures need less room than ones that draw a node graph. */
const COMPACT = 300;
const TALL = 450;

/**
 * A mapped type over TargetType: omitting a key is TS2741, and adding a member
 * to TargetType makes this literal fail to compile until it is filled in.
 */
export type StructureRegistry = { readonly [K in TargetType]: StructureEntry<K> };

export const STRUCTURES: StructureRegistry = {
    stack: entry('stack', StackPlate, COMPACT),
    queue: entry('queue', QueueBlock, COMPACT),
    memory: entry('memory', GraphView, TALL),
    tree: entry('tree', TreeChart, TALL),
    circular: entry('circular', CircularListView, TALL),
    doubly: entry('doubly', DoublyListView, TALL),
    graph: entry('graph', GraphChart, TALL),
    heap: entry('heap', HeapView, TALL),
    hashmap: entry('hashmap', HashMapView, TALL),
    unionfind: entry('unionfind', UnionFindView, TALL),
};

export function renderStructure(
    structure: DataStructureState,
    highlight: NodeHighlight | null,
): ReactElement {
    return STRUCTURES[structure.type].render(structure, highlight);
}

export function defaultPanelHeight(type: TargetType): number {
    return STRUCTURES[type].defaultPanelHeight;
}

/** Panel border for a structure's frame, from the shared accent table. */
export function panelBorderFor(type: TargetType): string {
    return ACCENTS[type].panelBorder;
}
