import type { Command, TargetType } from '../types';

/**
 * 전처리: C++ 스타일 코드를 JS 실행 가능 코드로 변환
 */
function preprocess(code: string): string {
    const lines = code.split('\n');
    const types = ['int', 'double', 'string', 'bool', 'float', 'char', 'auto', 'long', 'unsigned', 'short', 'void'];
    const typeRegexStr = `\\b(${types.join('|')})\\b`;

    let hasMain = false;

    const processedLines = lines.map((line) => {
        let pline = line.trim();
        
        // 1. 주석 및 전처리기 무시
        if (!pline || pline.startsWith('//') || pline.startsWith('#')) return '';
        
        // 2. common C++ boilerplate 무시
        if (pline.startsWith('using namespace') || pline.includes('cout <<') || pline.includes('cin >>')) return '';

        // 3. 현재 실행 중인 원본 라인을 추적하기 위한 가이드 주입
        const escapedLine = pline.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
        const trace = `__setLine(\`${escapedLine}\`); `;

        // 4. std:: 접두사 제거
        pline = pline.replace(/std::/g, '');

        // 5. 데이터 구조 선언 변환
        pline = pline.replace(/(?:stack|vector|queue|list|LinkedList)\s*<.*?>\s+(\w+)\s*;/g, (match, name) => {
            if (match.includes('stack')) return `const ${name} = __createStack("${name}");`;
            if (match.includes('queue')) return `const ${name} = __createQueue("${name}");`;
            return `const ${name} = __createList("${name}");`;
        });

        // 6. 함수 정의 변환 (void func(int a) -> function func(a))
        // 인자 부분의 타입을 제거하는 로직 포함
        const funcRegex = new RegExp(`^${typeRegexStr}\\s+(\\w+)\\s*\\(([^)]*)\\)\\s*\\{?`, 'g');
        pline = pline.replace(funcRegex, (_match, _type, name, args) => {
            if (name === 'main') hasMain = true;
            
            // 인자에서 타입 및 참조자(&) 제거
            const cleanArgs = args.split(',').map((arg: string) => {
                const parts = arg.trim().split(/\s+/);
                return parts[parts.length - 1].replace('&', ''); // 마지막 단어(변수명)만 추출하고 & 제거
            }).filter(Boolean).join(', ');
            
            return `function ${name}(${cleanArgs}) {`;
        });

        // 7. 일반 변수 타입 선언 제거 및 변환 (함수가 아닌 경우만)
        // int x = 5 -> let x = 5
        const varTypeRegex = new RegExp(`${typeRegexStr}\\s+(\\w+)(?!\\s*\\()`, 'g');
        pline = pline.replace(varTypeRegex, 'let $2');

        // 8. 배열 선언 정교화
        const arrayMatch = pline.match(/let\s+(\w+)\s*\[\s*(\d+)\s*\](?:\s*=\s*\{([^}]*)\})?;/);
        if (arrayMatch) {
            const name = arrayMatch[1];
            const size = arrayMatch[2];
            const initValues = arrayMatch[3] ? `[${arrayMatch[3]}]` : '[]';
            pline = `const ${name} = __createArray("${name}", ${size}, ${initValues});`;
        }

        // 9. 기타 C++ 키워드 변환
        pline = pline.replace(/\bnullptr\b/g, 'null');
        pline = pline.replace(/\bendl\b/g, '"\\n"');

        return trace + pline;
    });

    // 무한 루프 방지
    let finalCode = processedLines.join('\n');
    finalCode = finalCode.replace(/while\s*\((.*)\)/g, 'while (__checkLoop(), $1)');
    finalCode = finalCode.replace(/for\s*\(([^;]*);([^;]*);([^)]*)\)/g, 'for ($1; (__checkLoop(), $2); $3)');

    // 만약 main 함수가 정의되었다면 마지막에 호출 추가
    if (hasMain) {
        finalCode += '\nmain();';
    }

    return `
        let __loop_count = 0;
        const __checkLoop = () => {
            if (++__loop_count > 5000) throw new Error("Infinite loop detected or code too long");
            return true;
        };
        ${finalCode}
    `;
}

type ValueType = number | string | boolean;

/**
 * 코드 실행 및 명령어 수집
 */
export function parseCodeWithContext(code: string): Command[] {
    const commands: Command[] = [];
    let currentRawLine = '';

    const helpers = {
        __setLine: (line: string) => { currentRawLine = line; },
        
        __createStack: (name: string) => {
            const _items: ValueType[] = [];
            const obj = {
                push: (val: ValueType) => {
                    _items.push(val);
                    commands.push({ type: 'PUSH', target: 'stack', targetName: name, value: val, raw: currentRawLine });
                },
                pop: () => {
                    _items.pop();
                    commands.push({ type: 'POP', target: 'stack', targetName: name, raw: currentRawLine });
                },
                top: () => _items[_items.length - 1],
                size: () => _items.length,
                empty: () => _items.length === 0,
                push_back: (val: ValueType) => obj.push(val),
                pop_back: () => obj.pop()
            };
            return obj;
        },

        __createQueue: (name: string) => {
            const _items: ValueType[] = [];
            return {
                push: (val: ValueType) => {
                    _items.push(val);
                    commands.push({ type: 'ENQUEUE', target: 'queue', targetName: name, value: val, raw: currentRawLine });
                },
                pop: () => {
                    _items.shift();
                    commands.push({ type: 'DEQUEUE', target: 'queue', targetName: name, raw: currentRawLine });
                },
                front: () => _items[0],
                size: () => _items.length,
                empty: () => _items.length === 0
            };
        },

        __createList: (name: string) => {
            const _items: ValueType[] = [];
            return {
                push_back: (val: ValueType) => {
                    _items.push(val);
                    commands.push({ type: 'LIST_INSERT', target: 'linkedlist', targetName: name, value: val, raw: currentRawLine });
                },
                push_front: (val: ValueType) => {
                    _items.unshift(val);
                    commands.push({ type: 'LIST_INSERT', target: 'linkedlist', targetName: name, value: val, raw: currentRawLine });
                },
                insert: (val: ValueType) => {
                    _items.push(val);
                    commands.push({ type: 'LIST_INSERT', target: 'linkedlist', targetName: name, value: val, raw: currentRawLine });
                },
                pop_back: () => {
                    _items.pop();
                    commands.push({ type: 'LIST_REMOVE', target: 'linkedlist', targetName: name, raw: currentRawLine });
                },
                pop_front: () => {
                    _items.shift();
                    commands.push({ type: 'LIST_REMOVE', target: 'linkedlist', targetName: name, raw: currentRawLine });
                },
                remove: (val: ValueType) => {
                    const idx = _items.indexOf(val);
                    if (idx !== -1) _items.splice(idx, 1);
                    commands.push({ type: 'LIST_REMOVE', target: 'linkedlist', targetName: name, value: val, raw: currentRawLine });
                },
                size: () => _items.length,
                empty: () => _items.length === 0
            };
        },

        __createArray: (name: string, size: number, initValues: ValueType[]) => {
            commands.push({ type: 'ARRAY_DECLARE', target: 'array', targetName: name, size, raw: currentRawLine });
            const internalArr: (ValueType | null)[] = new Array(size).fill(null);
            initValues.forEach((v, i) => {
                if (i < size) {
                    internalArr[i] = v;
                    commands.push({ type: 'ARRAY_SET', target: 'array', targetName: name, index: i, value: v, raw: `int ${name}[${size}] = { initial values };` });
                }
            });

            return new Proxy(internalArr, {
                set(target, prop, value) {
                    const idx = Number(prop);
                    if (!isNaN(idx) && idx >= 0 && idx < size) {
                        target[idx] = value;
                        commands.push({ type: 'ARRAY_SET', target: 'array', targetName: name, index: idx, value, raw: currentRawLine });
                        return true;
                    }
                    return Reflect.set(target, prop, value);
                },
                get(target, prop) {
                    if (prop === 'length') return size;
                    return Reflect.get(target, prop);
                }
            });
        }
    };

    try {
        const jsCode = preprocess(code);
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        const executor = new Function(...Object.keys(helpers), jsCode);
        executor(...Object.values(helpers));
    } catch (e) {
        console.error('Code execution error:', e);
    }

    return commands;
}

export function parseCode(code: string): Command[] {
    return parseCodeWithContext(code);
}

export function detectTargetTypes(): Record<string, TargetType> {
    return {};
}

let idCounter = 0;
export const nextId = () => `item-${++idCounter}`;
export function resetParserIds() { idCounter = 0; }
