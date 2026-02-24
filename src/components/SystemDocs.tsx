import React from 'react';
import { motion } from 'framer-motion';

interface SystemDocsProps {
    onBack: () => void;
    lang?: 'en' | 'ko';
}

const SystemDocs: React.FC<SystemDocsProps> = ({ onBack, lang = 'en' }) => {
    const t = {
        en: {
            title: "System Documentation",
            subtitle: "Detailed guide for the C++ Visualizer engine",
            back: "Back to Help",
            sections: {
                structures: "Data Structures",
                syntax: "Syntax & Rules",
                features: "Engine Features"
            },
            structureNames: {
                stack: "Stack",
                queue: "Queue",
                list: "Linked List / Vector",
                tree: "Tree / BST",
                array: "Array"
            },
            syntaxLabels: {
                loops: "Loops",
                conditions: "Conditions",
                functions: "Functions",
                variables: "Variables",
                utility: "Utility"
            },
            features: [
                { title: "Case-Insensitivity", text: "Declarations (Stack, stack, STACK) are all recognized automatically." },
                { title: "Infinite Loop Protection", text: "Loops are limited to 5,000 iterations to prevent browser freezing." },
                { title: "Pre-processing", text: "#include and using namespace are accepted but ignored for execution." }
            ]
        },
        ko: {
            title: "시스템 상세 문서",
            subtitle: "C++ 비주얼라이저 엔진 상세 가이드",
            back: "도움말로 돌아가기",
            sections: {
                structures: "지원 자료구조",
                syntax: "문법 및 규칙",
                features: "엔진 주요 기능"
            },
            structureNames: {
                stack: "스택 (Stack)",
                queue: "큐 (Queue)",
                list: "연결 리스트 / 벡터",
                tree: "이진 탐색 트리 (Tree / BST)",
                array: "배열 (Array)"
            },
            syntaxLabels: {
                loops: "반복문 (Loops)",
                conditions: "조건문 (Conditions)",
                functions: "함수 (Functions)",
                variables: "변수 (Variables)",
                utility: "기타 (Utility)"
            },
            features: [
                { title: "대소문자 구분 없음", text: "자료구조 선언 시 대소문자를 구분하지 않고 자동으로 인식합니다. (Stack, stack, STACK 모두 가능)" },
                { title: "무한 루프 방지", text: "브라우저 정지를 방지하기 위해 모든 반복문은 최대 5,000회 실행으로 제한됩니다." },
                { title: "전처리 구문 허용", text: "#include 또는 using namespace와 같은 전처리 구문은 작성이 가능하지만, 엔진 실행 시에는 무시됩니다." }
            ]
        }
    }[lang];

    const sections = [
        {
            title: t.sections.structures,
            content: [
                {
                    name: t.structureNames.stack,
                    declaration: "stack<int> s;",
                    methods: ["push(val)", "pop()", "top()", "size()", "empty()"]
                },
                {
                    name: t.structureNames.queue,
                    declaration: "queue<int> q;",
                    methods: ["push(val)", "pop()", "front()", "size()", "empty()"]
                },
                {
                    name: t.structureNames.list,
                    declaration: "linkedlist<int> l; / vector<int> v;",
                    methods: ["push_back(val)", "push_front(val)", "insert(val)", "pop_back()", "pop_front()", "remove(val)", "size()", "empty()"]
                },
                {
                    name: t.structureNames.tree,
                    declaration: "tree<int> t; / bst<int> t;",
                    methods: ["insert(val)", "remove(val)"]
                },
                {
                    name: t.structureNames.array,
                    declaration: "int arr[5]; / int arr[3] = {1, 2, 3};",
                    methods: ["arr[index] (Access/Update)"]
                }
            ]
        },
        {
            title: t.sections.syntax,
            items: [
                { label: t.syntaxLabels.loops, value: "for(int i=0; i<n; i++), while(condition)" },
                { label: t.syntaxLabels.conditions, value: "if, else if, else" },
                { label: t.syntaxLabels.functions, value: "void func(int a) { ... } (main() supported)" },
                { label: t.syntaxLabels.variables, value: "int, double, string, bool, auto, etc." },
                { label: t.syntaxLabels.utility, value: "nullptr (null), endl (\\n)" }
            ]
        },
        {
            title: t.sections.features,
            tips: t.features
        }
    ];

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col h-full overflow-hidden"
        >
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-accent-cyan to-accent-purple bg-clip-text text-transparent">
                        {t.title}
                    </h2>
                    <p className="text-sm text-text-muted mt-1">{t.subtitle}</p>
                </div>
                <button
                    onClick={onBack}
                    className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm font-medium text-text-secondary hover:bg-white/10 hover:text-text-primary transition-all"
                >
                    {t.back}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-4 space-y-10 custom-scrollbar pb-10">
                {/* 1. Data Structures Table */}
                <section>
                    <h3 className="text-xs font-bold text-accent-cyan uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <span className="w-4 h-4 rounded-sm bg-accent-cyan/20 flex items-center justify-center text-[10px]">1</span>
                        {t.sections.structures}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {sections[0].content?.map((ds, i) => (
                            <div key={i} className="p-4 rounded-2xl bg-bg-secondary/30 border border-white/5 shadow-lg group hover:border-accent-cyan/30 transition-all duration-300">
                                <div className="flex justify-between items-start mb-3">
                                    <h4 className="font-bold text-text-primary">{ds.name}</h4>
                                    <code className="text-[10px] px-2 py-1 rounded bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20">
                                        {ds.declaration}
                                    </code>
                                </div>
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    {ds.methods.map((method, mi) => (
                                        <span key={mi} className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-bg-primary/50 text-text-secondary border border-white/5">
                                            {method}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* 2. Basic Syntax */}
                <section>
                    <h3 className="text-xs font-bold text-accent-purple uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <span className="w-4 h-4 rounded-sm bg-accent-purple/20 flex items-center justify-center text-[10px]">2</span>
                        {t.sections.syntax}
                    </h3>
                    <div className="rounded-2xl bg-bg-secondary/30 border border-white/5 overflow-hidden">
                        {sections[1].items?.map((item, i) => (
                            <div key={i} className={`flex flex-col gap-2 p-4 ${i !== 0 ? 'border-t border-white/5' : ''}`}>
                                <span className="text-[11px] font-bold text-accent-cyan/80 uppercase tracking-widest">{item.label}</span>
                                <code className="text-xs font-mono text-accent-purple break-all">{item.value}</code>
                            </div>
                        ))}
                    </div>
                </section>

                {/* 3. System Features */}
                <section>
                    <h3 className="text-xs font-bold text-accent-cyan uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <span className="w-4 h-4 rounded-sm bg-accent-cyan/20 flex items-center justify-center text-[10px]">3</span>
                        {t.sections.features}
                    </h3>
                    <div className="space-y-3">
                        {sections[2].tips?.map((tip, i) => (
                            <div key={i} className="p-4 rounded-2xl bg-accent-cyan/5 border border-accent-cyan/10 flex gap-4">
                                <div className="p-2 h-fit rounded-lg bg-accent-cyan/10">
                                    <svg className="w-4 h-4 text-accent-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-text-primary mb-1">{tip.title}</h4>
                                    <p className="text-xs text-text-muted leading-relaxed">{tip.text}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </motion.div>
    );
};

export default SystemDocs;
