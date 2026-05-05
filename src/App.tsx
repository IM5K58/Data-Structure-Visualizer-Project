import { useCallback, useEffect, useRef, useState } from 'react';
import CodeInput from './components/CodeInput';
import Controls from './components/Controls';
import Visualizer from './components/Visualizer';
import HowToUse from './components/HowToUse';
import Terminal from './components/Terminal';
import LocalVarsPanel from './components/LocalVarsPanel';
import CallStackPanel from './components/CallStackPanel';
import { useVisualizer } from './hooks/useVisualizer';
import { AnimatePresence } from 'framer-motion';

function App() {
  const { state, loadCode, step, stepBack, run, reset, stopAutoRun, setSpeed, setStdin, currentLine, lastChange, toggleBreakpoint } = useVisualizer();
  const [showHelp, setShowHelp] = useState(false);
  const codeRef = useRef('');

  // --- Resizable panel state (Horizontal) ---
  const [panelWidth, setPanelWidth] = useState(420);
  const isDraggingH = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- Resizable code state (Vertical - Sidebar) ---
  const [codeHeight, setCodeHeight] = useState(500);
  const isDraggingV = useRef(false);
  const rightPanelRef = useRef<HTMLElement>(null);

  // --- Resizable terminal state (Vertical - Bottom) ---
  const [terminalHeight, setTerminalHeight] = useState(200);
  const isDraggingT = useRef(false);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isDraggingH.current && containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const newWidth = containerRect.right - e.clientX;
        const clampedWidth = Math.max(320, Math.min(newWidth, containerRect.width * 0.6));
        setPanelWidth(clampedWidth);
      }

      if (isDraggingV.current && rightPanelRef.current) {
        const panelRect = rightPanelRef.current.getBoundingClientRect();
        const newHeight = e.clientY - panelRect.top;
        const clampedHeight = Math.max(150, Math.min(newHeight, panelRect.height - 250));
        setCodeHeight(clampedHeight);
      }

      if (isDraggingT.current && containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const newHeight = containerRect.bottom - e.clientY;
        const clampedHeight = Math.max(100, Math.min(newHeight, containerRect.height * 0.7));
        setTerminalHeight(clampedHeight);
      }
    };

    const onMouseUp = () => {
      isDraggingH.current = false;
      isDraggingV.current = false;
      isDraggingT.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const startResizeH = useCallback(() => {
    isDraggingH.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const startResizeV = useCallback(() => {
    isDraggingV.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const startResizeT = useCallback(() => {
    isDraggingT.current = true;
    document.body.style.cursor = 'row-resize';
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
  }, []);

  const handleRun = useCallback(async () => {
    if (state.currentStep === -1) {
      const success = await loadCode(codeRef.current);
      if (success) run();
    } else {
      run();
    }
  }, [run, loadCode, state.currentStep]);

  const handleStep = useCallback(async () => {
    if (state.currentStep === -1) {
      const success = await loadCode(codeRef.current);
      if (success) step();
    } else {
      step();
    }
  }, [step, loadCode, state.currentStep]);

  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-border bg-bg-secondary/50 backdrop-blur-md shrink-0">
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
            <a href="https://docs.google.com/forms/d/e/1FAIpQLSeyNKIuOPpKxi2yJicmq2EV6qrqaNAN-ywgYA28a_qWulcTUA/viewform?usp=header" target="_blank" rel="noopener noreferrer" className="group relative flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent-orange/10 border border-accent-orange/20 hover:bg-accent-orange/20 hover:border-accent-orange/40 transition-all duration-300">
              <span className="text-[11px] font-bold text-accent-orange tracking-wider">BUG REPORT</span>
            </a>
            <a href="https://vierasion.com" target="_blank" rel="noopener noreferrer" className="group relative flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent-purple/10 border border-accent-purple/20 hover:bg-accent-purple/20 hover:border-accent-purple/40 transition-all duration-300">
              <span className="text-[11px] font-bold text-accent-purple tracking-wider">ABOUT US</span>
            </a>
            <button onClick={() => setShowHelp(true)} className="group relative flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent-cyan/10 border border-accent-cyan/20 hover:bg-accent-cyan/20 hover:border-accent-cyan/40 transition-all duration-300 cursor-pointer">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-cyan opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-cyan"></span>
              </span>
              <span className="text-[11px] font-bold text-accent-cyan tracking-wider">HOW TO USE?</span>
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {showHelp && <HowToUse onBack={() => setShowHelp(false)} />}
      </AnimatePresence>

      <main ref={containerRef} className="flex-1 flex overflow-hidden">
        <section className="flex-1 flex flex-col min-w-0 bg-bg-primary relative overflow-hidden">
          {/* Decorative gradients */}
          <div className="absolute top-[-200px] right-[-200px] w-[500px] h-[500px] rounded-full bg-accent-cyan/[0.03] blur-[100px] pointer-events-none" />
          <div className="absolute bottom-[-200px] left-[-200px] w-[500px] h-[500px] rounded-full bg-accent-purple/[0.03] blur-[100px] pointer-events-none" />

          {/* Visualization Area */}
          <div className="flex-1 overflow-auto relative">
             <Visualizer structures={state.structures} lastChange={lastChange} />
          </div>

          {/* Bottom Terminal Panel */}
          <div 
            style={{ height: `${terminalHeight}px` }}
            className="shrink-0 flex flex-col relative"
          >
            {/* Horizontal Resize handle (Terminal Top) */}
            <div
              onMouseDown={startResizeT}
              className="h-[4px] absolute -top-[2px] w-full cursor-row-resize bg-border hover:bg-accent-cyan/40 active:bg-accent-cyan/60 transition-colors duration-150 z-30 group"
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-1.5 h-1.5 rounded-full bg-accent-cyan/60" />
                <div className="w-1.5 h-1.5 rounded-full bg-accent-cyan/60" />
                <div className="w-1.5 h-1.5 rounded-full bg-accent-cyan/60" />
              </div>
            </div>

            <Terminal 
              terminalOutput={state.terminalOutput}
              stdin={state.stdin}
              setStdin={setStdin}
              currentStep={state.currentStep}
              commands={state.commandHistory}
            />
          </div>
        </section>

        {/* Sidebar Resize handle */}
        <div onMouseDown={startResizeH} className="w-[5px] cursor-col-resize bg-border hover:bg-accent-cyan/40 active:bg-accent-cyan/60 transition-colors duration-150 shrink-0 relative group">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-1 h-1 rounded-full bg-accent-cyan/60" />
            <div className="w-1 h-1 rounded-full bg-accent-cyan/60" />
            <div className="w-1 h-1 rounded-full bg-accent-cyan/60" />
          </div>
        </div>

        <aside ref={rightPanelRef} style={{ width: `${panelWidth}px` }} className="shrink-0 border-l border-border bg-bg-secondary/30 flex flex-col bg-bg-panel/40 backdrop-blur-xl">
          <div style={{ height: `${codeHeight}px` }} className="shrink-0 p-4 flex flex-col">
            <CodeInput
              onCodeChange={handleCodeChange}
              currentLine={currentLine}
              breakpoints={state.breakpoints}
              onToggleBreakpoint={toggleBreakpoint}
            />
          </div>

          <div onMouseDown={startResizeV} className="h-[5px] cursor-row-resize bg-border hover:bg-accent-cyan/40 active:bg-accent-cyan/60 transition-colors duration-150 shrink-0 relative group">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-1 h-1 rounded-full bg-accent-cyan/60" />
              <div className="w-1 h-1 rounded-full bg-accent-cyan/60" />
              <div className="w-1 h-1 rounded-full bg-accent-cyan/60" />
            </div>
          </div>

          <div className="flex-1 p-4 overflow-y-auto min-h-0 bg-bg-secondary/20 flex flex-col gap-4">
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
              isLoading={state.isLoading}
              error={state.error}
            />
            {state.callStack.length > 0 && (
              <CallStackPanel frames={state.callStack} />
            )}
            {state.localVars.length > 0 && (
              <LocalVarsPanel localVars={state.localVars} />
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;

