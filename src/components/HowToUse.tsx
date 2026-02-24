import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Language } from '../constants/helpContent';
import { translations } from '../constants/helpContent';
import SystemDocs from './SystemDocs';

interface HowToUseProps {
    onBack: () => void;
}

const HowToUse = ({ onBack }: HowToUseProps) => {
    const [lang, setLang] = useState<Language>('en');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isDeepDive, setIsDeepDive] = useState(false);
    const [isDocs, setIsDocs] = useState(false);
    const t = translations[lang];

    const selectedStructure = t.structures.find(s => s.id === selectedId);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-bg-primary overflow-y-auto flex flex-col"
        >
            {/* Header */}
            <header className="sticky top-0 z-20 border-b border-border bg-bg-secondary/80 backdrop-blur-xl">
                <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                    <button
                        onClick={isDocs ? () => setIsDocs(false) : (isDeepDive ? () => setIsDeepDive(false) : onBack)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-border hover:bg-white/10 hover:border-border-hover transition-all text-sm font-medium"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        {isDocs || isDeepDive ? (lang === 'en' ? 'Back to Overview' : '개요로 돌아가기') : t.backToEditor}
                    </button>

                    <div className="flex items-center gap-3">
                        <span className="text-xs text-text-muted font-medium">{t.selectLanguage}</span>
                        <div className="flex p-1 rounded-lg bg-white/5 border border-border">
                            {(['en', 'ko'] as const).map((l) => (
                                <button
                                    key={l}
                                    onClick={() => setLang(l)}
                                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${lang === l
                                        ? 'bg-accent-cyan text-bg-primary shadow-lg shadow-accent-cyan/20'
                                        : 'text-text-muted hover:text-text-primary'
                                        }`}
                                >
                                    {l.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 max-w-6xl mx-auto px-6 py-12 w-full relative">
                <AnimatePresence mode="wait">
                    {isDocs ? (
                        <SystemDocs key="docs-view" onBack={() => setIsDocs(false)} lang={lang} />
                    ) : !isDeepDive ? (
                        <motion.div
                            key="grid-view"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                        >
                            {/* Intro */}
                            <div className="text-center mb-16 px-4">
                                <motion.div
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="inline-block px-4 py-1.5 rounded-full bg-accent-cyan/10 border border-accent-cyan/20 text-accent-cyan text-[10px] font-bold uppercase tracking-wider mb-6"
                                >
                                    {t.subtitle}
                                </motion.div>
                                <motion.h2
                                    key={`title-${lang}`}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-6 tracking-tight"
                                >
                                    {t.title}
                                </motion.h2>
                                <motion.p
                                    key={`desc-${lang}`}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="text-base md:text-lg text-text-secondary max-w-2xl mx-auto leading-relaxed mb-8"
                                >
                                    {t.description}
                                </motion.p>

                                <motion.button
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => setIsDocs(true)}
                                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-accent-cyan/20 to-accent-purple/20 border border-white/10 hover:border-accent-cyan/50 text-sm font-bold text-white transition-all shadow-lg shadow-black/20"
                                >
                                    {lang === 'ko' ? '기능 및 명령어 상세 Docs 보기' : 'See Detailed System Docs'}
                                </motion.button>
                            </div>

                            {/* Card Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                {t.structures.map((s, idx) => (
                                    <motion.div
                                        key={s.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.1 }}
                                        whileHover={{ y: -5, scale: 1.02 }}
                                        onClick={() => setSelectedId(s.id)}
                                        className="group cursor-pointer relative p-6 rounded-3xl bg-bg-secondary/40 border border-border hover:border-accent-cyan/30 transition-all overflow-hidden"
                                    >
                                        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-accent-cyan/5 blur-3xl rounded-full group-hover:bg-accent-cyan/10 transition-all" />
                                        <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-300">
                                            {s.icon}
                                        </div>
                                        <h3 className="text-xl font-bold text-white mb-2">{s.name}</h3>
                                        <p className="text-sm text-text-secondary line-clamp-2 leading-relaxed">
                                            {s.description}
                                        </p>
                                        <div className="mt-6 flex items-center text-xs font-bold text-accent-cyan opacity-0 group-hover:opacity-100 transition-opacity">
                                            VIEW DETAILS
                                            <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="deep-dive-view"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="bg-bg-secondary/30 rounded-3xl border border-border p-8 md:p-12 mb-12 shadow-2xl"
                        >
                            {selectedStructure && (
                                <div className="max-w-4xl mx-auto">
                                    <div className="flex items-center gap-6 mb-12">
                                        <div className="text-6xl md:text-7xl">{selectedStructure.icon}</div>
                                        <div>
                                            <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-2">{selectedStructure.name}</h2>
                                            <p className="text-accent-cyan font-bold tracking-[0.2em] uppercase text-sm">Deep Dive Guide</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                                        <div className="lg:col-span-2 space-y-12">
                                            <section>
                                                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                                    <div className="w-1.5 h-6 bg-accent-cyan rounded-full" />
                                                    {lang === 'en' ? 'Core Concepts' : '핵심 개념'}
                                                </h3>
                                                <p className="text-text-secondary leading-relaxed text-lg">
                                                    {selectedStructure.description}
                                                </p>
                                            </section>

                                            <section>
                                                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                                    <div className="w-1.5 h-6 bg-accent-purple rounded-full" />
                                                    {lang === 'en' ? 'Implementation Details' : '구현 방법'}
                                                </h3>
                                                <div className="p-6 rounded-2xl bg-white/[0.03] border border-border">
                                                    <p className="text-text-primary mb-4">{selectedStructure.howToUse}</p>

                                                    <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest mb-3 mt-6">Basic Usage</h4>
                                                    <pre className="p-5 rounded-xl bg-bg-primary/80 font-mono text-sm border border-border overflow-x-auto shadow-inner mb-6">
                                                        <code className="text-accent-cyan">{selectedStructure.codeExample}</code>
                                                    </pre>

                                                    <h4 className="text-xs font-bold text-accent-purple uppercase tracking-widest mb-3">Advanced Test Case (For/While/Ref)</h4>
                                                    <pre className="p-5 rounded-xl bg-bg-primary/80 font-mono text-sm border border-border overflow-x-auto shadow-inner">
                                                        <code className="text-accent-purple">{selectedStructure.deepDive.advancedCode}</code>
                                                    </pre>
                                                </div>
                                            </section>

                                            <section>
                                                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                                    <div className="w-1.5 h-6 bg-accent-green rounded-full" />
                                                    {lang === 'en' ? 'Real-world Use Cases' : '실제 활용 사례'}
                                                </h3>
                                                <ul className="space-y-4">
                                                    {selectedStructure.deepDive.useCases.map((uc, i) => (
                                                        <li key={i} className="flex items-start gap-3 text-text-secondary">
                                                            <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent-green flex-shrink-0" />
                                                            {uc}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </section>
                                        </div>

                                        <div className="space-y-8">
                                            <div className="p-6 rounded-2xl bg-accent-cyan/5 border border-accent-cyan/10">
                                                <h4 className="text-xs font-bold text-accent-cyan uppercase tracking-widest mb-4">Time Complexity</h4>
                                                <div className="flex flex-col p-4 bg-bg-primary/50 rounded-xl border border-white/5 shadow-inner text-left">
                                                    {/* 메인 통계 영역 */}
                                                    <div className="flex flex-col gap-2.5">
                                                        {selectedStructure.deepDive.complexity.split('|').map((part, i) => {
                                                            const [label, value] = part.split(':').map(s => s.trim());
                                                            const bigOMatch = value.match(/^(O\(.*?\))(?:\s+\((.*)\))?$/);
                                                            const mainValue = bigOMatch ? bigOMatch[1] : value;
                                                            const hasNote = bigOMatch && bigOMatch[2];
                                                            return (
                                                                <div key={i} className="flex justify-between items-center gap-4 text-[13px]">
                                                                    <span className="text-text-secondary font-medium">{label}</span>
                                                                    <span className="font-mono text-accent-cyan font-bold whitespace-nowrap">
                                                                        {mainValue}
                                                                        {hasNote && <span className="ml-1 text-[10px] opacity-60">*</span>}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    {/* 주석(Footnote) 영역 */}
                                                    {selectedStructure.deepDive.complexity.match(/O\(.*?\)\s+\(.*\)/) && (
                                                        <div className="mt-4 pt-3 border-t border-white/10 space-y-1.5">
                                                            {selectedStructure.deepDive.complexity.split('|').map((part, i) => {
                                                                const noteMatch = part.match(/O\(.*?\)\s+\((.*)\)/);
                                                                if (!noteMatch) return null;
                                                                return (
                                                                    <div key={i} className="flex gap-1.5 text-[10px] text-text-muted italic leading-snug">
                                                                        <span className="flex-shrink-0 text-accent-cyan/60">*</span>
                                                                        <span>{noteMatch[1]}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="p-6 rounded-2xl bg-accent-purple/5 border border-accent-purple/10">
                                                <h4 className="text-xs font-bold text-accent-purple uppercase tracking-widest mb-4">Pro Tips</h4>
                                                <ul className="space-y-3">
                                                    {selectedStructure.deepDive.tips.map((tip, i) => (
                                                        <li key={i} className="text-sm text-text-secondary italic">
                                                            " {tip} "
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Detail Overlay */}
                <AnimatePresence>
                    {selectedId && selectedStructure && !isDeepDive && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedId(null)}
                            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-bg-primary/80 backdrop-blur-md"
                        >
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                                onClick={(e) => e.stopPropagation()}
                                className="max-w-2xl w-full max-h-[85vh] overflow-y-auto rounded-3xl bg-bg-secondary border border-border shadow-2xl p-8 md:p-10"
                            >
                                <div className="flex items-start justify-between mb-8">
                                    <div className="flex items-center gap-4">
                                        <div className="text-4xl md:text-5xl">{selectedStructure.icon}</div>
                                        <div>
                                            <h3 className="text-2xl md:text-3xl font-extrabold text-white mb-1">{selectedStructure.name}</h3>
                                            <p className="text-accent-cyan text-xs md:text-sm font-bold uppercase tracking-widest">Guide</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setSelectedId(null)}
                                        className="p-2 rounded-full hover:bg-white/5 transition-colors"
                                    >
                                        <svg className="w-6 h-6 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>

                                <div className="space-y-8">
                                    <section>
                                        <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest mb-3">Description</h4>
                                        <p className="text-text-secondary leading-relaxed">
                                            {selectedStructure.description}
                                        </p>
                                    </section>

                                    <section>
                                        <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest mb-3">How to use in DS Visualizer</h4>
                                        <div className="p-4 rounded-xl bg-accent-cyan/5 border border-accent-cyan/10">
                                            <p className="text-accent-cyan text-sm leading-relaxed">
                                                {selectedStructure.howToUse}
                                            </p>
                                        </div>
                                    </section>

                                    <section>
                                        <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest mb-3">C++ Code Example</h4>
                                        <div className="relative group/code">
                                            <div className="absolute -inset-1 bg-gradient-to-r from-accent-cyan/20 to-accent-purple/20 rounded-xl blur opacity-25 group-hover/code:opacity-50 transition duration-1000"></div>
                                            <pre className="relative p-5 rounded-xl bg-bg-primary/50 font-mono text-sm text-text-primary overflow-x-auto ring-1 ring-white/5">
                                                <code className="block whitespace-pre">
                                                    {selectedStructure.codeExample}
                                                </code>
                                            </pre>
                                        </div>
                                    </section>
                                </div>

                                <div className="mt-10 pt-6 border-t border-border flex items-center justify-between">
                                    <button
                                        onClick={() => setSelectedId(null)}
                                        className="px-6 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm font-bold transition-all"
                                    >
                                        {lang === 'en' ? 'Close' : '닫기'}
                                    </button>
                                    <button
                                        onClick={() => setIsDeepDive(true)}
                                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accent-cyan text-bg-primary text-sm font-bold shadow-lg shadow-accent-cyan/20 hover:scale-105 transition-all"
                                    >
                                        {t.readMore}
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {/* Footer Design Element */}
            <footer className="py-8 text-center text-[10px] text-text-muted uppercase tracking-[0.3em]">
                Interactive Data Structure Visualizer © 2026
            </footer>
        </motion.div>
    );
};

export default HowToUse;
