import type { LocalVar } from '../types';

interface LocalVarsPanelProps {
    localVars: LocalVar[];
}

export default function LocalVarsPanel({ localVars }: LocalVarsPanelProps) {
    if (localVars.length === 0) {
        return (
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Local Variables
                </h3>
                <p className="text-xs text-gray-600 italic">No local variables</p>
            </div>
        );
    }

    return (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Local Variables
            </h3>
            <table className="w-full text-xs font-mono">
                <thead>
                    <tr className="text-gray-500 border-b border-gray-800">
                        <th className="text-left py-1 pr-3 font-medium">Name</th>
                        <th className="text-left py-1 pr-3 font-medium">Type</th>
                        <th className="text-left py-1 font-medium">Value</th>
                    </tr>
                </thead>
                <tbody>
                    {localVars.map((v) => (
                        <tr
                            key={v.name}
                            className={`border-b border-gray-800/50 ${v.changed ? 'bg-amber-950/40' : ''}`}
                        >
                            <td className={`py-1 pr-3 ${v.changed ? 'text-amber-300' : 'text-blue-300'}`}>
                                {v.name}
                            </td>
                            <td className="py-1 pr-3 text-gray-500">{v.type}</td>
                            <td className={`py-1 ${v.changed ? 'text-amber-200 font-semibold' : 'text-green-300'}`}>
                                {v.value}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
