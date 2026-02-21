import { useState, useEffect } from 'react';

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

export default function CodeInput({ onCodeChange }: Props) {
    const [code, setCode] = useState(DEFAULT_CODE);

    useEffect(() => {
        onCodeChange(code);
    }, []);

    const handleChange = (value: string) => {
        setCode(value);
        onCodeChange(value);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const textarea = e.currentTarget;
        const { selectionStart, selectionEnd, value } = textarea;

        // 1. 자동 괄호/따옴표 완성 (Auto-closing)
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

        // 2. Tab 키 처리
        if (e.key === 'Tab') {
            e.preventDefault();
            const tabSpaces = '    ';
            const newValue = value.substring(0, selectionStart) + tabSpaces + value.substring(selectionEnd);
            
            setCode(newValue);
            onCodeChange(newValue);

            // 커서 위치 조정 (setTimeout으로 렌더링 이후에 적용)
            setTimeout(() => {
                textarea.selectionStart = textarea.selectionEnd = selectionStart + tabSpaces.length;
            }, 0);
        }

        // 3. Enter 키 처리 (스마트 들여쓰기 및 중괄호 확장)
        if (e.key === 'Enter') {
            const beforeCursor = value.substring(0, selectionStart);
            const afterCursor = value.substring(selectionEnd);
            const linesBefore = beforeCursor.split('\n');
            const lastLine = linesBefore[linesBefore.length - 1] || '';
            const indentation = lastLine.match(/^\s*/)?.[0] || '';
            
            // 특수 케이스: { | } 사이에서 엔터를 누를 때 (중괄호 확장)
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

            // 일반적인 자동 들여쓰기
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

        // 4. Backspace 키 처리 (들여쓰기 한꺼번에 삭제)
        if (e.key === 'Backspace' && selectionStart === selectionEnd) {
            const beforeCursor = value.substring(0, selectionStart);
            const lastLine = beforeCursor.split('\n').pop() || '';
            
            // 현재 줄의 커서 앞부분이 오직 공백으로만 이루어져 있고, 4칸 단위일 때
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
        <div className="flex flex-col gap-3 h-full">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-secondary tracking-wider uppercase">
                    C++ Code
                </h2>
                <span className="text-[10px] text-text-muted font-mono">
                    {code.split('\n').length} lines
                </span>
            </div>

            <div className="relative flex-1 rounded-xl overflow-hidden border border-border bg-bg-primary/50">
                {/* Line numbers gutter */}
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
            </div>
        </div>
    );
}
