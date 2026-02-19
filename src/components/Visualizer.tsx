import type { DataStructureState } from '../types';
import StackPlate from './DataStructures/StackPlate';
import QueueBlock from './DataStructures/QueueBlock';
import ArrayBlock from './DataStructures/ArrayBlock';
import ListNode from './DataStructures/ListNode';

interface Props {
    structures: DataStructureState[];
}

function renderStructure(structure: DataStructureState) {
    switch (structure.type) {
        case 'stack':
            return <StackPlate data={structure} />;
        case 'queue':
            return <QueueBlock data={structure} />;
        case 'array':
            return <ArrayBlock data={structure} />;
        case 'linkedlist':
            return <ListNode data={structure} />;
    }
}

const TYPE_COLORS: Record<string, string> = {
    stack: 'border-accent-purple/20',
    queue: 'border-accent-cyan/20',
    array: 'border-accent-green/20',
    linkedlist: 'border-accent-orange/20',
};

export default function Visualizer({ structures }: Props) {
    if (structures.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="text-6xl opacity-20">📊</div>
                    <div className="space-y-1">
                        <p className="text-text-secondary text-sm font-medium">
                            No data structures to visualize
                        </p>
                        <p className="text-text-muted text-xs">
                            Write some C++ code and press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-text-secondary font-mono text-[10px]">Run</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-text-secondary font-mono text-[10px]">Step</kbd>
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-auto p-6">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {structures.map((structure) => (
                    <div
                        key={`${structure.type}-${structure.name}`}
                        className={`
              rounded-xl p-6 border bg-bg-panel backdrop-blur-sm
              flex items-center justify-center min-h-[140px]
              ${TYPE_COLORS[structure.type] || 'border-border'}
            `}
                    >
                        {renderStructure(structure)}
                    </div>
                ))}
            </div>
        </div>
    );
}
