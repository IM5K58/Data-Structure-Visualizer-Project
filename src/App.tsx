import { useCallback, useEffect, useRef, useState } from 'react';
import CodeInput from './components/CodeInput';
import Controls from './components/Controls';
import Visualizer from './components/Visualizer';
import { useVisualizer } from './hooks/useVisualizer';

function App() {
  const { state, loadCode, step, stepBack, run, reset, stopAutoRun, setSpeed } = useVisualizer();
  const codeRef = useRef('');

  // --- Resizable panel state ---
  const [panelWidth, setPanelWidth] = useState(420);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      // Panel is on the RIGHT, so width = container right edge - mouse X
      const newWidth = containerRect.right - e.clientX;
      const clamped = Math.max(320, Math.min(newWidth, containerRect.width * 0.6));
      setPanelWidth(clamped);
    };

    const onMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const startResize = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  // Stop auto-run when all commands are executed
  useEffect(() => {
    if (
      state.isRunning &&
      state.currentStep >= state.commandHistory.length - 1 &&
      state.commandHistory.length > 0
    ) {
      stopAutoRun();
    }
  }, [state.currentStep, state.isRunning, state.commandHistory.length, stopAutoRun]);

  const handleCodeChange = useCallback((code: string) => {
    codeRef.current = code;
    loadCode(code);
  }, [loadCode]);

  const handleRun = useCallback(() => {
    if (state.currentStep === -1) {
      loadCode(codeRef.current);
    }
    setTimeout(() => run(), 50);
  }, [run, loadCode, state.currentStep]);

  const handleStep = useCallback(() => {
    if (state.currentStep === -1) {
      loadCode(codeRef.current);
      setTimeout(() => step(), 50);
    } else {
      step();
    }
  }, [step, loadCode, state.currentStep]);

  const handleReset = useCallback(() => {
    reset();
    loadCode(codeRef.current);
  }, [reset, loadCode]);

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-bg-secondary/50 backdrop-blur-md">
        <div className="max-w-[1920px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-cyan to-accent-purple flex items-center justify-center text-white text-sm font-bold">
              DS
            </div>
            <div>
              <h1 className="text-sm font-bold text-text-primary tracking-tight">
                Data Structure Visualizer
              </h1>
              <p className="text-[10px] text-text-muted">
                C++ → Visual · Stack · Queue · Array · Linked List
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted font-mono px-2 py-1 rounded-md bg-white/5 border border-border">
              v0.1.0-MVP
            </span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main ref={containerRef} className="flex-1 flex overflow-hidden">
        {/* Left panel — Visualization */}
        <section className="flex-1 flex flex-col bg-bg-primary relative overflow-hidden">
          {/* Decorative gradient orbs */}
          <div className="absolute top-[-200px] right-[-200px] w-[500px] h-[500px] rounded-full bg-accent-cyan/[0.03] blur-[100px] pointer-events-none" />
          <div className="absolute bottom-[-200px] left-[-200px] w-[500px] h-[500px] rounded-full bg-accent-purple/[0.03] blur-[100px] pointer-events-none" />

          <Visualizer structures={state.structures} />
        </section>

        {/* Resize handle */}
        <div
          onMouseDown={startResize}
          className="w-[5px] cursor-col-resize bg-border hover:bg-accent-cyan/40 active:bg-accent-cyan/60 transition-colors duration-150 flex-shrink-0 relative group"
        >
          {/* Grip dots */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-1 h-1 rounded-full bg-accent-cyan/60" />
            <div className="w-1 h-1 rounded-full bg-accent-cyan/60" />
            <div className="w-1 h-1 rounded-full bg-accent-cyan/60" />
          </div>
        </div>

        {/* Right panel — Code & Controls */}
        <aside
          style={{ width: `${panelWidth}px` }}
          className="flex-shrink-0 border-l border-border bg-bg-secondary/30 flex flex-col"
        >
          {/* Code input */}
          <div className="flex-1 p-4 overflow-hidden">
            <CodeInput onCodeChange={handleCodeChange} />
          </div>

          {/* Divider */}
          <div className="h-px bg-border mx-4" />

          {/* Controls */}
          <div className="p-4">
            <Controls
              onRun={handleRun}
              onStop={stopAutoRun}
              onStepBack={stepBack}
              onStep={handleStep}
              onReset={handleReset}
              onSpeedChange={setSpeed}
              isRunning={state.isRunning}
              currentStep={state.currentStep}
              totalSteps={state.commandHistory.length}
              commands={state.commandHistory}
            />
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;

