import { useState, useRef, useEffect } from 'react';

interface Props {
    terminalOutput: string;
    stdin: string;
    setStdin: (val: string) => void;
    currentStep: number;
    commands: any[];
}

export default function Terminal({ 
    terminalOutput, 
    stdin, 
    setStdin, 
    currentStep, 
    commands 
}: Props) {
    const [activeTab, setActiveTab] = useState<'output' | 'input' | 'log'>('output');
    const outputRef = useRef<HTMLPreElement>(null);
    const logRef = useRef<HTMLDivElement>(null);

    // Auto-scroll output to bottom
    useEffect(() => {
        if (activeTab === 'output' && outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
        if (activeTab === 'log' && logRef.current) {
            // Scroll to current command in log
            const activeItem = logRef.current.querySelector('.active-command');
            if (activeItem) {
                activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }, [terminalOutput, currentStep, activeTab]);

    return (
        <div className="flex flex-col h-full bg-[#1e1e1e] border-t border-border/40 shadow-inner overflow-hidden font-mono">
            {/* Tabs Header */}
            <div className="flex items-center justify-between px-4 bg-[#252526] border-b border-white/5 h-9 shrink-0">
                <div className="flex gap-1 h-full">
                    <button 
                        onClick={() => setActiveTab('output')}
                        className={`px-4 text-[11px] font-bold tracking-tight h-full transition-all flex items-center gap-2 ${
                            activeTab === 'output' 
                            ? 'text-accent-cyan border-b-2 border-accent-cyan bg-[#1e1e1e]' 
                            : 'text-text-muted hover:text-text-secondary'
                        }`}
                    >
                        <span className="opacity-60 text-xs">$_</span>
                        OUTPUT
                    </button>
                    <button 
                        onClick={() => setActiveTab('input')}
                        className={`px-4 text-[11px] font-bold tracking-tight h-full transition-all flex items-center gap-2 ${
                            activeTab === 'input' 
                            ? 'text-accent-purple border-b-2 border-accent-purple bg-[#1e1e1e]' 
                            : 'text-text-muted hover:text-text-secondary'
                        }`}
                    >
                        <span className="opacity-60 text-xs">&gt;</span>
                        INPUT
                        {stdin.length > 0 && (
                            <div className="w-1.5 h-1.5 rounded-full bg-accent-purple animate-pulse" />
                        )}
                    </button>
                    <button 
                        onClick={() => setActiveTab('log')}
                        className={`px-4 text-[11px] font-bold tracking-tight h-full transition-all flex items-center gap-2 ${
                            activeTab === 'log' 
                            ? 'text-accent-cyan border-b-2 border-accent-cyan bg-[#1e1e1e]' 
                            : 'text-text-muted hover:text-text-secondary'
                        }`}
                    >
                        <span className="opacity-60 text-xs">#</span>
                        COMMAND LOG
                        {commands.length > 0 && (
                            <span className="bg-white/5 px-1.5 rounded text-[9px] opacity-60">
                                {Math.max(0, currentStep + 1)}/{commands.length}
                            </span>
                        )}
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    <div className="text-[10px] text-text-muted/40 uppercase tracking-widest hidden sm:block">
                        {activeTab === 'output' ? 'Read-only log' : activeTab === 'input' ? 'Stdin Buffer' : 'Visualization Steps'}
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 relative overflow-hidden group">
                {activeTab === 'output' && (
                    <div className="h-full flex flex-col p-4">
                        <pre 
                            ref={outputRef}
                            className="flex-1 overflow-auto text-[12px] leading-6 text-text-secondary scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pr-2"
                        >
                            {terminalOutput || (
                                <div className="h-full flex flex-col items-center justify-center opacity-30 gap-2">
                                    <div className="text-2xl">⏳</div>
                                    <div className="text-[10px]">Waiting for program execution...</div>
                                </div>
                            )}
                            {terminalOutput && <span className="inline-block w-2 h-4 bg-accent-cyan/40 ml-1 animate-pulse align-middle" />}
                        </pre>
                    </div>
                )}

                {activeTab === 'input' && (
                    <div className="h-full flex flex-col relative p-4 bg-black/20">
                        <textarea
                            value={stdin}
                            onChange={(e) => setStdin(e.target.value)}
                            placeholder="// Enter inputs (cin) here...&#10;// Example:&#10;5&#10;10 20 30 40 50"
                            className="flex-1 bg-transparent border-none outline-none resize-none px-0 text-[13px] leading-relaxed text-accent-purple font-mono placeholder:text-text-muted/30 scrollbar-thin"
                        />
                        <div className="absolute top-4 right-4 text-[9px] font-bold text-accent-purple/40 pointer-events-none bg-accent-purple/5 px-2 py-1 rounded border border-accent-purple/10">
                            STDIN BUFFER
                        </div>
                    </div>
                )}

                {activeTab === 'log' && (
                    <div ref={logRef} className="h-full overflow-auto p-4 space-y-1 scrollbar-thin">
                        {commands.length === 0 ? (
                            <div className="h-full flex items-center justify-center opacity-20 text-xs">No commands executed yet</div>
                        ) : (
                            commands.map((cmd, idx) => (
                                <div
                                    key={idx}
                                    className={`
                                        text-[11px] font-mono px-3 py-1.5 rounded transition-colors flex items-center gap-3
                                        ${idx === currentStep ? 'bg-accent-cyan/10 text-accent-cyan active-command border border-accent-cyan/20' : 'text-text-muted/60'}
                                        ${idx < currentStep ? 'text-text-secondary' : ''}
                                    `}
                                >
                                    <span className="opacity-30 w-4 text-right">{idx + 1}</span>
                                    <span className="flex-1 truncate">{cmd.raw}</span>
                                    {idx === currentStep && <div className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-pulse" />}
                                </div>
                            ))
                        )}
                    </div>
                )}
                
                {/* Decorative background logo */}
                <div className="absolute bottom-4 right-6 text-3xl font-black text-white/[0.02] select-none pointer-events-none italic">
                    VIERASION
                </div>
            </div>
        </div>
    );
}
