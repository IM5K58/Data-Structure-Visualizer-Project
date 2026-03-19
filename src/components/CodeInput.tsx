import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';

interface Props {
    onCodeChange: (code: string) => void;
}

const DEFAULT_CODE = `#include <iostream>
using namespace std;

// Define a custom structural type
struct Node {
    int data;
    Node* next;
};

int main() {
    cout << "=== Welcome to Data Structure Visualizer ===" << endl;
    cout << "Click '▶ Run' on the right to compile and visualize!" << endl;

    // 1. Create a Head Node
    Node* head = new Node();
    head->data = 10;
    
    // 2. Link a second node
    head->next = new Node();
    head->next->data = 20;
    
    // 3. Link a third node using a pointer variable
    Node* current = head->next;
    current->next = new Node();
    current->next->data = 30;
    current->next->next = NULL;

    cout << "Nodes connected successfully!" << endl;

    return 0;
}`;

export default function CodeInput({ onCodeChange }: Props) {
    const [code, setCode] = useState(DEFAULT_CODE);

    useEffect(() => {
        onCodeChange(code);
    }, [code, onCodeChange]);

    const handleEditorWillMount = (monaco: any) => {
        monaco.editor.defineTheme('vs-visualizer', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
                { token: 'keyword', foreground: 'c084fc' }, // accent-purple
                { token: 'identifier', foreground: '93c5fd' }, // accent-blue
                { token: 'string', foreground: 'fcd34d' }, // accent-yellow
                { token: 'number', foreground: 'fb7185' }, // accent-pink
                { token: 'type', foreground: '2dd4bf' } // accent-cyan
            ],
            colors: {
                'editor.background': '#111827', // bg-primary
                'editor.foreground': '#f3f4f6', // text-primary
                'editorLineNumber.foreground': '#4b5563', // text-muted
                'editorCursor.foreground': '#c084fc', // accent-purple
                'editor.selectionBackground': '#374151',
                'editor.lineHighlightBackground': '#1f2937' // bg-secondary
            }
        });
    };

    const handleEditorChange = (value: string | undefined) => {
        if (value !== undefined) {
            setCode(value);
        }
    };

    return (
        <div className="w-full h-full rounded-2xl overflow-hidden border border-border bg-bg-primary shadow-2xl relative flex flex-col">
            {/* Toolbar Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-bg-secondary border-b border-border">
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-accent-pink shadow-[0_0_10px_rgba(251,113,133,0.5)]" />
                    <span className="w-3 h-3 rounded-full bg-accent-yellow shadow-[0_0_10px_rgba(253,224,71,0.5)]" />
                    <span className="w-3 h-3 rounded-full bg-accent-cyan shadow-[0_0_10px_rgba(34,211,238,0.5)]" />
                    <span className="text-text-muted text-xs font-mono ml-3 font-semibold tracking-wider">
                        editor.cpp
                    </span>
                </div>
                <div className="flex gap-4 text-[10px] text-text-muted font-mono tracking-widest uppercase">
                    <span className="px-2 py-0.5 rounded-full bg-accent-purple/10 text-accent-purple font-bold">C++ 17</span>
                    <span>UTF-8</span>
                </div>
            </div>

            {/* Monaco Editor Container */}
            <div className="flex-1 relative w-full h-full">
                <Editor
                    height="100%"
                    width="100%"
                    language="cpp"
                    theme="vs-visualizer"
                    beforeMount={handleEditorWillMount}
                    value={code}
                    onChange={handleEditorChange}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        fontFamily: "'JetBrains Mono', 'Fira Code', 'Iosevka', monospace",
                        fontLigatures: true,
                        wordWrap: 'on',
                        wrappingIndent: 'indent',
                        scrollBeyondLastLine: false,
                        smoothScrolling: true,
                        cursorBlinking: 'smooth',
                        cursorSmoothCaretAnimation: 'on',
                        formatOnPaste: true,
                        formatOnType: true,
                        suggestSelection: 'first',
                        quickSuggestions: true,
                        acceptSuggestionOnEnter: 'smart',
                        bracketPairColorization: { enabled: true },
                        autoClosingBrackets: 'always',
                        autoClosingQuotes: 'always',
                        autoIndent: 'full',
                        padding: { top: 16, bottom: 16 }
                    }}
                    loading={
                        <div className="flex items-center justify-center h-full text-text-muted font-mono animate-pulse">
                            Loading Editor Core...
                        </div>
                    }
                />
            </div>
        </div>
    );
}
