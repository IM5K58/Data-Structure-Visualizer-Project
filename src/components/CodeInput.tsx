import { useState, useEffect, useRef } from 'react';

interface Props {
    onCodeChange: (code: string) => void;
}

const DEFAULT_CODE = `// Stack Example
stack<int> s;
s.push(10);
s.push(20);
s.push(30);
s.pop();
s.push(40);

// Queue Example
queue<int> q;
q.push(1);
q.push(2);
q.push(3);
q.pop();
q.push(4);

// Array Example
int arr[5] = {3, 7, 1, 9, 4};
arr[2] = 42;

// Linked List Example
list<int> ll;
ll.push_back(10);
ll.push_back(20);
ll.push_back(30);
ll.push_back(40);
ll.pop_back();`;

const SUGGESTIONS = [
    'stack', 'queue', 'list', 'vector', 'int', 'string', 'double', 'bool', 'void',
    'push', 'pop', 'top', 'front', 'push_back', 'push_front', 'insert', 'remove',
    'size', 'empty', 'if', 'else', 'for', 'while', 'main', 'return', 'true', 'false'
];

export default function CodeInput({ onCodeChange }: Props) {
    const [code, setCode] = useState(DEFAULT_CODE);
    const [suggestionState, setSuggestionState] = useState({
        visible: false,
        list: [] as string[],
        index: 0,
        word: '',
        cursorPos: { top: 0, left: 0 }
    });
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        onCodeChange(code);
    }, []);

    const handleChange = (value: string) => {
        setCode(value);
        onCodeChange(value);

        // 자동 완성 로직
        const textarea = textareaRef.current;
        if (!textarea) return;

        const selectionStart = textarea.selectionStart;
        const textBeforeCursor = value.substring(0, selectionStart);
        const match = textBeforeCursor.match(/\b(\w+)$/);

        if (match) {
            const word = match[1];
            const filtered = SUGGESTIONS.filter(s => s.startsWith(word) && s !== word);

            if (filtered.length > 0) {
                // 커서 위치 근처에 띄우기 위한 좌표 계산
                const lines = textBeforeCursor.split('\n');
                const lineNum = lines.length;
                const charNum = lines[lines.length - 1].length;
                
                setSuggestionState({
                    visible: true,
                    list: filtered,
                    index: 0,
                    word: word,
                    cursorPos: { 
                        top: lineNum * 25.6 + 20,
                        left: charNum * 8 + 50
                    }
                });
            } else {
                setSuggestionState(prev => ({ ...prev, visible: false }));
            }
        } else {
            setSuggestionState(prev => ({ ...prev, visible: false }));
        }
    };

    const applySuggestion = (suggestedWord: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const { selectionStart } = textarea;
        const before = code.substring(0, selectionStart - suggestionState.word.length);
        const after = code.substring(selectionStart);
        const newValue = before + suggestedWord + after;

        setCode(newValue);
        onCodeChange(newValue);
        setSuggestionState(prev => ({ ...prev, visible: false }));

        setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = before.length + suggestedWord.length;
            textarea.focus();
        }, 0);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const textarea = e.currentTarget;
        const { selectionStart, selectionEnd, value } = textarea;

        if (suggestionState.visible) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSuggestionState(prev => ({ ...prev, index: (prev.index + 1) % prev.list.length }));
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSuggestionState(prev => ({ ...prev, index: (prev.index - 1 + prev.list.length) % prev.list.length }));
                return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                applySuggestion(suggestionState.list[suggestionState.index]);
                return;
            }
            if (e.key === 'Escape') {
                setSuggestionState(prev => ({ ...prev, visible: false }));
                return;
            }
        }

        const pairs: Record<string, string> = {
            '(': ')',
            '{': '}',
            '[': ']',
            '"': '"',
            "'": "'",
        };

        if (pairs[e.key]) {
            e.preventDefault();
            const char = e.key;
            const pair = pairs[char];
            const newValue = value.substring(0, selectionStart) + char + pair + value.substring(selectionEnd);
            
            setCode(newValue);
            onCodeChange(newValue);

            setTimeout(() => {
                textarea.selectionStart = textarea.selectionEnd = selectionStart + 1;
            }, 0);
            return;
        }

        if (e.key === 'Tab') {
            e.preventDefault();
            const tabSpaces = '    ';
            const newValue = value.substring(0, selectionStart) + tabSpaces + value.substring(selectionEnd);
            
            setCode(newValue);
            onCodeChange(newValue);

            setTimeout(() => {
                textarea.selectionStart = textarea.selectionEnd = selectionStart + tabSpaces.length;
            }, 0);
        }

        if (e.key === 'Enter') {
            const beforeCursor = value.substring(0, selectionStart);
            const afterCursor = value.substring(selectionEnd);
            const linesBefore = beforeCursor.split('\n');
            const lastLine = linesBefore[linesBefore.length - 1] || '';
            const indentation = lastLine.match(/^\s*/)?.[0] || '';
            
            if (beforeCursor.trim().endsWith('{') && afterCursor.trim().startsWith('}')) {
                e.preventDefault();
                const middleIndent = '\n' + indentation + '    ';
                const endIndent = '\n' + indentation;
                const newValue = beforeCursor + middleIndent + endIndent + afterCursor;
                
                setCode(newValue);
                onCodeChange(newValue);

                setTimeout(() => {
                    textarea.selectionStart = textarea.selectionEnd = selectionStart + middleIndent.length;
                }, 0);
                return;
            }

            const extraIndent = lastLine.trim().endsWith('{') ? '    ' : '';
            const autoIndent = '\n' + indentation + extraIndent;

            e.preventDefault();
            const newValue = value.substring(0, selectionStart) + autoIndent + value.substring(selectionEnd);
            
            setCode(newValue);
            onCodeChange(newValue);

            setTimeout(() => {
                textarea.selectionStart = textarea.selectionEnd = selectionStart + autoIndent.length;
            }, 0);
        }

        if (e.key === 'Backspace' && selectionStart === selectionEnd) {
            const beforeCursor = value.substring(0, selectionStart);
            const lastLine = beforeCursor.split('\n').pop() || '';
            
            if (lastLine.length > 0 && lastLine.trim() === '' && lastLine.length % 4 === 0) {
                e.preventDefault();
                const newValue = value.substring(0, selectionStart - 4) + value.substring(selectionEnd);
                
                setCode(newValue);
                onCodeChange(newValue);

                setTimeout(() => {
                    textarea.selectionStart = textarea.selectionEnd = selectionStart - 4;
                }, 0);
            }
        }
    };

    return (
        <div className="flex flex-col gap-3 h-full relative">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-secondary tracking-wider uppercase">
                    C++ Code
                </h2>
                <span className="text-[10px] text-text-muted font-mono">
                    {code.split('\n').length} lines
                </span>
            </div>

            <div className="relative flex-1 rounded-xl overflow-hidden border border-border bg-bg-primary/50">
                <div className="absolute inset-y-0 left-0 w-10 bg-white/[0.02] border-r border-border flex flex-col pt-4 overflow-hidden">
                    {code.split('\n').map((_, i) => (
                        <span
                            key={i}
                            className="text-[11px] text-text-muted/50 font-mono text-right pr-2 leading-[1.6rem] select-none"
                        >
                            {i + 1}
                        </span>
                    ))}
                </div>

                <textarea
                    ref={textareaRef}
                    value={code}
                    onChange={(e) => handleChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    spellCheck={false}
                    className={`
            w-full h-full resize-none bg-transparent text-text-primary
            pl-12 pr-4 pt-4 pb-4 text-[13px] leading-[1.6rem]
            focus:outline-none focus:ring-0
            placeholder:text-text-muted/30
          `}
                    placeholder="Enter your C++ code here..."
                />

                {suggestionState.visible && (
                    <div 
                        className="absolute z-50 bg-bg-secondary border border-border rounded-lg shadow-2xl py-1 min-w-[120px]"
                        style={{ 
                            top: suggestionState.cursorPos.top, 
                            left: Math.min(suggestionState.cursorPos.left, 250)
                        }}
                    >
                        {suggestionState.list.map((item, idx) => (
                            <div
                                key={item}
                                onClick={() => applySuggestion(item)}
                                className={`
                                    px-3 py-1.5 text-[12px] font-mono cursor-pointer transition-colors
                                    ${idx === suggestionState.index ? 'bg-accent-cyan/20 text-accent-cyan' : 'text-text-secondary hover:bg-white/5'}
                                `}
                            >
                                {item}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
