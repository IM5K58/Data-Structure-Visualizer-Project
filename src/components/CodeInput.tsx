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
