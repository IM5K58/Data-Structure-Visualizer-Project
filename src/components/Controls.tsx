import { useState } from 'react';
import type { Command } from '../types';

interface Props {
    onRun: () => void;
    onStop: () => void;
    onStepBack: () => void;
    onStep: () => void;
    onReset: () => void;
    onSpeedChange: (ms: number) => void;
    isRunning: boolean;
    currentStep: number;
    totalSteps: number;
    commands: Command[];
}

const SPEED_OPTIONS = [
    { label: '0.25x', value: 2000 },
    { label: '0.5x', value: 1000 },
    { label: '1x', value: 500 },
    { label: '2x', value: 250 },
    { label: '4x', value: 125 },
];

export default function Controls({
    onRun,
    onStop,
    onStepBack,
    onStep,
    onReset,
    onSpeedChange,
    isRunning,
    currentStep,
    totalSteps,
    commands,
}: Props) {
    const [speedIndex, setSpeedIndex] = useState(2); // default 1x
    const isFinished = currentStep >= totalSteps - 1 && totalSteps > 0;

    const handleSpeedChange = (idx: number) => {
        setSpeedIndex(idx);
        onSpeedChange(SPEED_OPTIONS[idx].value);
    };

    return (
        <div className="flex flex-col gap-4">
            {/* Buttons */}
            <div className="flex items-center gap-3">
                <button
                    onClick={isRunning ? onStop : onRun}
                    disabled={isFinished && !isRunning}
                    className={`
            flex-1 h-12 rounded-xl font-semibold text-base transition-all duration-200
            ${isRunning
                            ? 'bg-accent-orange/20 text-accent-orange border border-accent-orange/30 hover:bg-accent-orange/30'
                            : isFinished
                                ? 'bg-white/5 text-text-muted border border-border cursor-not-allowed'
                                : 'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30 hover:bg-accent-cyan/30 hover:shadow-[0_0_20px_rgba(0,229,255,0.15)]'
                        }
          `}
                >
                    {isRunning ? '⏸ Pause' : isFinished ? '✓ Done' : '▶ Run'}
                </button>

                <button
                    onClick={onStepBack}
                    disabled={isRunning || currentStep <= -1}
                    className={`
            flex-1 h-12 rounded-xl font-semibold text-base transition-all duration-200
            border border-border
            ${isRunning || currentStep <= -1
                            ? 'bg-white/5 text-text-muted cursor-not-allowed'
                            : 'bg-accent-purple/10 text-accent-purple border-accent-purple/30 hover:bg-accent-purple/20'
                        }
          `}
                >
                    ⏮ Prev
                </button>

                <button
                    onClick={onStep}
                    disabled={isRunning || isFinished}
                    className={`
            flex-1 h-12 rounded-xl font-semibold text-base transition-all duration-200
            border border-border
            ${isRunning || isFinished
                            ? 'bg-white/5 text-text-muted cursor-not-allowed'
                            : 'bg-accent-purple/10 text-accent-purple border-accent-purple/30 hover:bg-accent-purple/20'
                        }
          `}
                >
                    Next ⏭
                </button>

                <button
                    onClick={onReset}
                    className="h-12 px-5 rounded-xl font-semibold text-base transition-all duration-200 bg-white/5 text-text-secondary border border-border hover:bg-white/10 hover:text-text-primary"
                >
                    ↺ Reset
                </button>
            </div>

            {/* Progress bar */}
            <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[10px] font-mono text-text-muted">
                    <span>Progress</span>
                    <span>{Math.max(0, currentStep + 1)} / {totalSteps}</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div
                        className="h-full rounded-full bg-gradient-to-r from-accent-cyan to-accent-purple transition-all duration-300"
                        style={{
                            width: totalSteps > 0
                                ? `${((currentStep + 1) / totalSteps) * 100}%`
                                : '0%',
                        }}
                    />
                </div>
            </div>

            {/* Speed controls */}
            <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-mono text-text-muted">Speed</span>
                <div className="flex gap-1">
                    {SPEED_OPTIONS.map((opt, idx) => (
                        <button
                            key={opt.label}
                            onClick={() => handleSpeedChange(idx)}
                            className={`
                flex-1 h-9 rounded-lg text-xs font-mono transition-all duration-150
                ${idx === speedIndex
                                    ? 'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30'
                                    : 'bg-white/5 text-text-muted border border-transparent hover:bg-white/10 hover:text-text-secondary'
                                }
              `}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Command log */}
            {commands.length > 0 && (
                <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-mono text-text-muted">Command Log</span>
                    <div className="max-h-[200px] overflow-y-auto rounded-lg bg-bg-primary/50 border border-border p-2 space-y-0.5">
                        {commands.map((cmd, idx) => (
                            <div
                                key={idx}
                                className={`
                  text-[11px] font-mono px-2 py-1 rounded
                  ${idx === currentStep
                                        ? 'bg-accent-cyan/10 text-accent-cyan'
                                        : idx < currentStep + 1
                                            ? 'text-text-secondary'
                                            : 'text-text-muted/40'
                                    }
                `}
                            >
                                <span className="text-text-muted/30 mr-2">{idx + 1}.</span>
                                {cmd.raw}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
