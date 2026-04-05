/**
 * C++ 코드 계측기 (Instrumenter)
 * 사용자의 C++ 코드에 자동으로 추적 함수를 삽입합니다.
 */

interface StructDef {
    name: string;
    fields: { name: string; type: string; isPointer: boolean; isArray?: boolean }[];
    methods: string[];
    hint?: 'stack' | 'queue' | 'node' | 'tree';
    suppressInternals?: boolean; // AI 또는 정적 분석에서 결정
    extendedHint?: 'circular'; // circular_linked_list 전달용
}

// STL 컨테이너 → 자료구조 힌트 매핑
const STL_CONTAINER_HINTS: Record<string, 'stack' | 'queue'> = {
    'queue': 'queue',
    'stack': 'stack',
    'priority_queue': 'queue',
    'deque': 'queue',
};

const STL_PUSH_METHODS = ['push', 'push_back', 'push_front', 'enqueue'];
const STL_POP_METHODS = ['pop', 'pop_back', 'pop_front', 'dequeue'];

/**
 * main() 함수가 없으면 자동으로 추가합니다.
 * 선언부(struct, class, 함수 정의 등)와 실행부(변수 선언, 함수 호출 등)를 분리하여
 * 실행부만 main()으로 감쌉니다.
 */
function ensureMain(code: string): string {
    // main 함수가 이미 있으면 그대로 반환
    if (/\b(?:int|void)\s+main\s*\(/.test(code)) {
        return code;
    }

    const lines = code.split(/\r?\n/);
    const declarationLines: string[] = [];
    const statementLines: string[] = [];
    let braceDepth = 0;
    let inDeclaration = false;

    for (const line of lines) {
        const trimmed = line.trim();

        // 중괄호 개수
        const opens = (trimmed.match(/\{/g) || []).length;
        const closes = (trimmed.match(/\}/g) || []).length;

        // 중괄호 블록 내부 (struct/class/함수 본문)는 선언부
        if (braceDepth > 0 || inDeclaration) {
            declarationLines.push(line);
            braceDepth += opens - closes;
            if (braceDepth <= 0) {
                braceDepth = 0;
                inDeclaration = false;
            }
            continue;
        }

        // 최상위 레벨 선언 시작 패턴
        // 함수 정의: "ReturnType funcName(" 형태이되 세미콜론으로 끝나지 않는 경우
        // (세미콜론으로 끝나면 변수 선언: "Type var(args);")
        const looksLikeFunc = /^(?:(?:static|inline|const|constexpr|extern|virtual|void|int|float|double|char|bool|long|short|unsigned|signed|auto)\s+)*\w+(?:<[^>]*>)?(?:\s*\*)*\s+\w+\s*\(/.test(trimmed)
            && !trimmed.endsWith(';');
        const isDecl = /^(#|\/\/|\/\*|\*|struct\s|class\s|template\s|typedef\s|using\s|enum\s)/.test(trimmed)
            || looksLikeFunc
            || trimmed === ''
            || /^\}\s*;?\s*$/.test(trimmed);

        if (isDecl) {
            declarationLines.push(line);
            braceDepth += opens - closes;
            if (braceDepth > 0) inDeclaration = true;
        } else {
            statementLines.push(line);
        }
    }

    if (statementLines.length === 0) {
        // 실행 코드가 없으면 빈 main() 추가
        return code + '\n\nint main() {\n    return 0;\n}\n';
    }

    // 선언부 유지 + 실행부를 main()으로 감싸기
    return declarationLines.join('\n') + '\n\nint main() {\n'
        + statementLines.map(l => '    ' + l).join('\n')
        + '\n    return 0;\n}\n';
}


/**
 * C++ 코드를 분석하고 추적 코드를 삽입합니다.
 */
export function instrument(code: string, analysis?: import('./codeAnalyzer.js').CodeAnalysis | null): string {
    code = ensureMain(code);
    const structs = parseStructs(code);
    if (analysis) {
        // AI 힌트를 동기적으로 적용 (dynamic import 없이 직접 처리)
        if (analysis.confidence >= 0.7) {
            for (const struct of structs) {
                const ai = analysis.structClassifications[struct.name];
                if (!ai) continue;
                const hintMap: Record<string, 'stack' | 'queue' | 'node' | 'tree'> = {
                    singly_linked_list: 'node',
                    doubly_linked_list: 'node',
                    circular_linked_list: 'node',
                    binary_tree: 'tree',
                    nary_tree: 'tree',
                    bst: 'tree',
                    stack: 'stack',
                    queue: 'queue',
                };
                const mapped = hintMap[ai.hint];
                if (mapped !== undefined) struct.hint = mapped;
                struct.suppressInternals = ai.suppressInternals;
                if (ai.hint === 'circular_linked_list') struct.extendedHint = 'circular';
            }
        }
    }
    const varTypes = new Map<string, string>(); // varName -> typeName
    const lines = code.split(/\r?\n/);
    const output: string[] = [];

    output.push('#include "__tracer.h"');
    output.push('#include <cstdlib>');
    output.push('');

    let braceDepth = 0;
    const structStack: { def: StructDef; startDepth: number }[] = [];
    let currentStruct: StructDef | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        const lineNum = i + 1;

        output.push(line);

        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*')) {
            continue;
        }

        // 1. 중괄호 깊이 및 구조체 스택 추적
        const structStartMatch = trimmed.match(/^(?:struct|class)\s+(\w+)/);
        if (structStartMatch) {
            const className = structStartMatch[1];
            const def = structs.find(s => s.name === className);
            if (def) {
                structStack.push({ def, startDepth: braceDepth });
            }
        }

        const openBraces = (trimmed.match(/\{/g) || []).length;
        const closeBraces = (trimmed.match(/\}/g) || []).length;

        // 중괄호 처리: 여는 중괄호를 먼저 처리해야
        // void method() { stmt; } 같은 한 줄 메서드에서
        // 구조체가 잘못 pop되는 것을 방지
        braceDepth += openBraces;
        for (let b = 0; b < closeBraces; b++) {
            if (structStack.length > 0 && braceDepth <= structStack[structStack.length - 1].startDepth + 1) {
                if (braceDepth === structStack[structStack.length - 1].startDepth + 1) {
                    structStack.pop();
                }
            }
            braceDepth--;
        }

        currentStruct = structStack.length > 0 ? structStack[structStack.length - 1].def : null;

        // 2. 계측 우선 순위 패턴 (생성자 초기화 리스트 등)
        if (currentStruct) {
            // Node(T v) : data(v), next(nullptr) { ... }
            const initListMatch = trimmed.match(/(\w+)\s*\([^)]*\)\s*:\s*([^;{]+)/);
            if (initListMatch && !trimmed.startsWith('//')) {
                const constructorName = initListMatch[1];
                if (constructorName === currentStruct.name) {
                    const initList = initListMatch[2];
                    const fieldInits = initList.split(',').map(s => s.trim());
                    const traceLines: string[] = [];
                    fieldInits.forEach(init => {
                        const m = init.match(/^(\w+)\s*\(([^)]+)\)$/);
                        if (m) {
                            const fieldName = m[1];
                            const fieldDef = currentStruct?.fields.find(f => f.name === fieldName);
                            if (fieldDef) {
                                if (fieldDef.isPointer) {
                                    traceLines.push(`    __vt::set_ptr(${lineNum}, "this", "${fieldName}", this, this->${fieldName});`);
                                } else {
                                    traceLines.push(`    __vt::${getTraceSetFn(fieldDef.type)}(${lineNum}, "this", "${fieldName}", this, this->${fieldName});`);
                                }
                            }
                        }
                    });

                    // 단일 라인 생성자: {} 가 같은 줄에 있으면 본문 안에 삽입
                    if (trimmed.includes('{') && traceLines.length > 0) {
                        output.pop(); // 원본 라인 제거
                        const braceIdx = line.indexOf('{');
                        output.push(line.substring(0, braceIdx + 1)); // "... {" 까지
                        traceLines.forEach(t => output.push(t));
                        output.push(line.substring(braceIdx + 1)); // "}" 이후
                    } else {
                        // 멀티 라인 생성자: 기존처럼 다음 줄에 추가
                        traceLines.forEach(t => output.push(t));
                    }
                    continue;
                }
            }
        }

        // 3. 계측 스킵 조건
        // 구조체 내부이되 멤버 변수 선언 영역(depth 1)이거나 접근 제어자 라인은 스킵
        const currentLevel = structStack.length > 0 ? structStack[structStack.length - 1].startDepth + 1 : 0;
        if ((currentStruct && braceDepth === currentLevel && !trimmed.endsWith('{')) || /^(?:public|private|protected):/.test(trimmed)) {
            continue;
        }

        // 함수 선언부나 단순 여는 중괄호 라인 스킵
        if (trimmed.endsWith('{') || (openBraces > 0 && !trimmed.includes('=') && !trimmed.includes(';') && !trimmed.includes(':'))) {
            continue;
        }

        // 4. 일반 패턴 매칭

        // 패턴 0: 메서드 호출 계측 (q.enqueue(100), s.push(42), q.dequeue())
        // matchAll로 라인 내 모든 메서드 호출을 스캔하여 탐욕적 매칭 방지
        // 예: if (!q.isEmpty()) q.dequeue(); → isEmpty는 무시, dequeue만 계측
        {
            const methodCallRegex = /(\w+)\.(\w+)\s*\(([^)]*)\)/g;
            const matches = [...trimmed.matchAll(methodCallRegex)];
            let methodInstrumented = false;

            for (const m of matches) {
                const varName = m[1];
                const methodName = m[2];
                const args = m[3].trim();

                const typeName = varTypes.get(varName);
                if (!typeName) continue;

                // 사용자 정의 struct 또는 STL 컨테이너에서 hint 조회
                let hint: string | undefined;
                const baseType = typeName.split('<')[0];
                const struct = structs.find(s => s.name === baseType || s.name === typeName);
                if (struct) {
                    hint = struct.hint;
                } else {
                    const stlBase = typeName.replace('std::', '');
                    hint = STL_CONTAINER_HINTS[stlBase];
                }
                if (hint !== 'stack' && hint !== 'queue') continue;

                const lowerMethod = methodName.toLowerCase();
                if (STL_PUSH_METHODS.includes(lowerMethod) && args) {
                    output.push(`    __vt::push_val(${lineNum}, "${varName}", (${args}));`);
                    output.push(`    __vt_guard_${varName}.onPush();`);
                    methodInstrumented = true;
                } else if (STL_POP_METHODS.includes(lowerMethod)) {
                    output.push(`    __vt::pop(${lineNum}, "${varName}");`);
                    output.push(`    __vt_guard_${varName}.onPop();`);
                    methodInstrumented = true;
                }
            }
            if (methodInstrumented) continue;
        }

        // Stack/Queue 컨테이너 내부 메서드 본문에서는 패턴 1-5 계측 억제
        // suppressInternals 플래그(AI 제공) 또는 stack/queue 힌트일 때 적용
        if (currentStruct && (currentStruct.suppressInternals ?? (currentStruct.hint === 'stack' || currentStruct.hint === 'queue'))) {
            continue;
        }

        // 패턴 1: new 할당 (const/static/volatile 접두사 허용, 괄호/중괄호 초기화 모두 지원)
        const newMatch = trimmed.match(/^(?:const\s+|static\s+|volatile\s+)*(\w+(?:<[^>]+>)?)\s*\*\s*(\w+)\s*=\s*new\s+(\w+(?:<[^>]+>)?)\s*(?:\([^;]*\)|\{[^}]*\})?\s*;/);
        if (newMatch) {
            const varName = newMatch[2];
            const typeName = newMatch[3];
            varTypes.set(varName, typeName);
            const baseTypeName = typeName.split('<')[0];
            const struct = structs.find(s => s.name === baseTypeName || s.name === typeName);
            const effectiveHint = struct?.extendedHint ?? struct?.hint;
            const hintAttr = effectiveHint ? `, "${effectiveHint}"` : '';
            output.push(`    __vt::alloc(${lineNum}, "${varName}", ${varName}, "${typeName}"${hintAttr});`);
            // ALLOC 직후 필드 초기값 트레이스 (집합 초기화 / 생성자 초기화 모두 커버)
            if (struct) {
                for (const field of struct.fields) {
                    if (field.isArray) continue;
                    if (field.isPointer) {
                        output.push(`    __vt::set_ptr(${lineNum}, "${varName}", "${field.name}", ${varName}, ${varName}->${field.name});`);
                    } else {
                        output.push(`    __vt::${getTraceSetFn(field.type)}(${lineNum}, "${varName}", "${field.name}", ${varName}, ${varName}->${field.name});`);
                    }
                }
            }
            continue;
        }

        // 패턴 2: 멤버 포인터에 new 할당 (괄호/중괄호 초기화 모두 지원)
        const memberNewMatch = trimmed.match(/^([\w]+(?:->[\w]+)*)->(\w+)\s*=\s*new\s+(\w+(?:<[^>]+>)?)\s*(?:\([^;]*\)|\{[^}]*\})?\s*;/);
        if (memberNewMatch) {
            const varPath = memberNewMatch[1];
            const fieldName = memberNewMatch[2];
            const typeName = memberNewMatch[3];
            const baseTypeName = typeName.split('<')[0];
            const struct = structs.find(s => s.name === baseTypeName || s.name === typeName);
            const effectiveHint2 = struct?.extendedHint ?? struct?.hint;
            const hintAttr = effectiveHint2 ? `, "${effectiveHint2}"` : '';
            output.push(`    __vt::alloc(${lineNum}, "${varPath}->${fieldName}", ${varPath}->${fieldName}, "${typeName}"${hintAttr});`);
            // ALLOC 직후 새 노드의 필드 초기값 트레이스
            if (struct) {
                for (const f of struct.fields) {
                    if (f.isArray) continue;
                    if (f.isPointer) {
                        output.push(`    __vt::set_ptr(${lineNum}, "${varPath}->${fieldName}", "${f.name}", ${varPath}->${fieldName}, ${varPath}->${fieldName}->${f.name});`);
                    } else {
                        output.push(`    __vt::${getTraceSetFn(f.type)}(${lineNum}, "${varPath}->${fieldName}", "${f.name}", ${varPath}->${fieldName}, ${varPath}->${fieldName}->${f.name});`);
                    }
                }
            }
            output.push(`    __vt::set_ptr(${lineNum}, "${varPath}", "${fieldName}", ${varPath}, ${varPath}->${fieldName});`);
            continue;
        }

        // 패턴 3: delete / delete[] (조건부 delete도 매칭)
        const deleteMatch = trimmed.match(/delete\s*(?:\[\])?\s*(\w+)\s*;/);
        if (deleteMatch) {
            const varName = deleteMatch[1];
            output.pop();
            output.push(`    __vt::dealloc(${lineNum}, "${varName}", ${varName});`);
            output.push(line);
            continue;
        }

        // 패턴 4: 멤버 필드 대입 (var->field = expr)
        const memberSetMatch = trimmed.match(/^([\w]+(?:->[\w]+)*)->(\w+)\s*=\s*(.+)\s*;/);
        if (memberSetMatch) {
            const varPath = memberSetMatch[1];
            const fieldName = memberSetMatch[2];
            const expr = memberSetMatch[3];
            const rootVar = varPath.split('->')[0];

            let traceFn = getTraceSetFn('int');
            let isPtr = false;

            if (expr === 'NULL' || expr === 'nullptr') {
                isPtr = true;
            } else {
                let structDef = findStructForVar(rootVar, varTypes, structs, currentStruct);
                if (!structDef && currentStruct) {
                    const memberField = currentStruct.fields.find(f => f.name === rootVar);
                    if (memberField) structDef = structs.find(s => s.name === memberField.type);
                }
                const fieldDef = structDef?.fields.find(f => f.name === fieldName);
                if (fieldDef) {
                    isPtr = fieldDef.isPointer;
                    traceFn = getTraceSetFn(fieldDef.type);
                }
            }

            if (isPtr) {
                output.push(`    __vt::set_ptr(${lineNum}, "${varPath}", "${fieldName}", ${varPath}, ${varPath}->${fieldName});`);
            } else {
                output.push(`    __vt::${traceFn}(${lineNum}, "${varPath}", "${fieldName}", ${varPath}, ${varPath}->${fieldName});`);
            }
            continue;
        }

        // 패턴 4.5: 클래스 내부 멤버 직접 대입 (field = expr;)
        if (currentStruct) {
            const directSetMatch = trimmed.match(/(?:^|[\s{}])(\w+)\s*=\s*(?!=)([^;]+)\s*;/);
            if (directSetMatch) {
                const fieldName = directSetMatch[1];
                const fieldDef = currentStruct.fields.find(f => f.name === fieldName);
                if (fieldDef) {
                    if (fieldDef.isPointer) {
                        output.push(`    __vt::set_ptr(${lineNum}, "this", "${fieldName}", this, this->${fieldName});`);
                    } else {
                        output.push(`    __vt::${getTraceSetFn(fieldDef.type)}(${lineNum}, "this", "${fieldName}", this, this->${fieldName});`);
                    }
                    continue;
                }
            }
        }

        // 패턴 5: 포인터 변수 대입 (var = expr)
        const ptrAssignMatch = trimmed.match(/^(\w+)\s*=\s*(\w+(?:->[\w]+)*)\s*;/);
        if (ptrAssignMatch) {
            const varName = ptrAssignMatch[1];
            if (varTypes.has(varName)) {
                output.push(`    __vt::set_ptr(${lineNum}, "__scope", "${varName}", nullptr, ${varName});`);
                continue;
            }
        }

        // 패턴 8-10: 선언부 추적 (const/static/volatile 접두사 허용)
        const ptrDeclMatch = trimmed.match(/^(?:const\s+|static\s+|volatile\s+)*(\w+(?:<[^>]+>)?)\s*\*\s*(\w+)\s*=\s*(.+);/);
        if (ptrDeclMatch) {
            const typeName = ptrDeclMatch[1];
            const varName = ptrDeclMatch[2];
            varTypes.set(varName, typeName);
            if (!ptrDeclMatch[3].includes('new')) {
                output.push(`    __vt::set_ptr(${lineNum}, "__scope", "${varName}", nullptr, ${varName});`);
            }
            continue;
        }

        const simplePtrDecl = trimmed.match(/^(?:const\s+|static\s+|volatile\s+)*(\w+(?:<[^>]+>)?)\s*\*\s*(\w+)\s*;/);
        if (simplePtrDecl) {
            varTypes.set(simplePtrDecl[2], simplePtrDecl[1]);
            continue;
        }

        // STL 컨테이너 선언 감지: std::queue<int> q; 또는 queue<int> q;
        const stlDeclMatch = trimmed.match(/^(?:std::)?(\w+)\s*<([^>]+)>\s+(\w+)\s*(?:\{[^}]*\}|\([^)]*\))?\s*;/);
        if (stlDeclMatch) {
            const containerName = stlDeclMatch[1];
            const varName = stlDeclMatch[3];
            const hint = STL_CONTAINER_HINTS[containerName];
            if (hint) {
                varTypes.set(varName, `std::${containerName}`);
                output.push(`    __vt::alloc(${lineNum}, "${varName}", &${varName}, "std::${containerName}", "${hint}");`);
                output.push(`    __vt::__container_guard __vt_guard_${varName}("${varName}");`);
                continue;
            }
        }

        const stackObjDecl = trimmed.match(/^(?:const\s+|static\s+|volatile\s+)*(\w+(?:<[^>]+>)?)\s+(\w+)\s*(?:\{[^}]*\}|\([^)]*\))?\s*;/);
        if (stackObjDecl) {
            const typeName = stackObjDecl[1];
            const varName = stackObjDecl[2];
            const baseType = typeName.split('<')[0]; // Handle template containers
            const struct = structs.find(s => s.name === baseType || s.name === typeName);
            if (struct) {
                varTypes.set(varName, typeName);
                const hintAttr = struct.hint ? `, "${struct.hint}"` : '';
                output.push(`    __vt::alloc(${lineNum}, "${varName}", &${varName}, "${struct.name}"${hintAttr});`);
                // 큐/스택 객체에 RAII scope guard 추가 — 소멸 시 남은 항목 자동 POP
                if (struct.hint === 'stack' || struct.hint === 'queue') {
                    output.push(`    __vt::__container_guard __vt_guard_${varName}("${varName}");`);
                }
            }
            continue;
        }
    }

    return output.join('\n');
}

export function parseStructs(code: string): StructDef[] {
    const structs: StructDef[] = [];
    const structStartRegex = /(?:template\s*<[^>]+>\s*)?(?:struct|class)\s+(\w+)[^{]*\{/g;
    let match;

    while ((match = structStartRegex.exec(code)) !== null) {
        const name = match[1];
        let body = "";
        let depth = 1;
        let pos = structStartRegex.lastIndex;

        while (depth > 0 && pos < code.length) {
            if (code[pos] === '{') depth++;
            else if (code[pos] === '}') depth--;
            if (depth > 0) body += code[pos];
            pos++;
        }

        const fields: StructDef['fields'] = [];
        const methods: string[] = [];
        let fieldSearchBody = "";
        let innerDepth = 0;
        for (let i = 0; i < body.length; i++) {
            if (body[i] === '{') innerDepth++;
            else if (body[i] === '}') innerDepth--;
            else if (innerDepth === 0) fieldSearchBody += body[i];
        }

        const cleanBody = fieldSearchBody
            .replace(/\/\/.*/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(?:public|private|protected)\s*:/g, ';');

        const fieldLines = cleanBody.split(';');
        for (const fline of fieldLines) {
            const trimmed = fline.trim();
            if (!trimmed || trimmed.includes('(') || trimmed.includes('~')) continue;

            // Strip default initializers: "int top = -1" → "int top", "Node *a = nullptr, *b = nullptr" → "Node *a, *b"
            const stripped = trimmed
                .replace(/\s*=\s*[^,;]+/g, '')
                .replace(/^(?:const|static|volatile|mutable|inline|explicit)\s+/g, '') // strip qualifiers
                .trim();

            // Multi-variable declaration: "int a, b, c;" or "Node* left, *right;"
            const multiVarMatch = stripped.match(/^(?:(?:unsigned|signed|long|short)\s+)?(\w+(?:<[^>]+>)?)\s+([\w\s*,\[\]]+)$/);
            if (multiVarMatch) {
                const type = multiVarMatch[1];
                const vars = multiVarMatch[2].split(',');
                for (const v of vars) {
                    const vm = v.trim().match(/^(\*?)\s*(\w+)(\s*\[.*\])?$/);
                    if (vm) {
                        fields.push({
                            name: vm[2],
                            type,
                            isPointer: vm[1] === '*',
                            isArray: !!vm[3],
                        });
                    }
                }
                continue;
            }

            // Single field with optional array: "int data[100]", "unsigned long count"
            const fieldMatch = stripped.match(/^(?:(?:unsigned|signed|long|short)\s+)?(\w+(?:<[^>]+>)?)\s*(\*?)\s*(\w+)(\s*\[.*\])?$/);
            if (fieldMatch) {
                fields.push({
                    name: fieldMatch[3],
                    type: fieldMatch[1],
                    isPointer: fieldMatch[2] === '*',
                    isArray: !!fieldMatch[4],
                });
            }
        }

        // 메서드 감지: cleanBody에서 ( 가 들어간 모든 식별자를 추출하되, 예약어는 제외
        const methodMatches = cleanBody.matchAll(/(\w+)\s*\(/g);
        const forbiddenMethods = new Set(['if', 'for', 'while', 'switch', 'catch', 'template', 'new', 'delete', 'return', 'sizeof', 'typeid']);
        for (const m of methodMatches) {
            const methodName = m[1];
            if (!forbiddenMethods.has(methodName) && !fields.some(f => f.name === methodName)) {
                methods.push(methodName);
            }
        }

        // 자료구조 힌트 결정 (구조적 분석)
        let hint: StructDef['hint'];
        const methodSet = new Set(methods.map(m => m.toLowerCase()));

        // 자기 자신 타입을 가리키는 포인터 필드 개수로 구조 판별
        const selfPointers = fields.filter(f => f.isPointer && (f.type === name || f.type === `${name}*`));
        const selfPointerCount = selfPointers.length;

        // 큐/스택 힌트 감지
        const queueFieldNames = ['front', 'rear', 'head', 'tail', 'first', 'last'];
        const hasQueueFields = fields.some(f => queueFieldNames.includes(f.name.toLowerCase()));

        if ((methodSet.has('enqueue') && methodSet.has('dequeue')) ||
            (methodSet.has('push_back') && (methodSet.has('pop_front') || methodSet.has('dequeue'))) ||
            (methodSet.has('push') && methodSet.has('front') && !methodSet.has('pop'))) {
            hint = 'queue';
        } else if (methodSet.has('push') && methodSet.has('pop') && hasQueueFields) {
            // push+pop이지만 front/rear 필드가 있으면 FIFO → queue
            hint = 'queue';
        } else if (methodSet.has('push') && methodSet.has('pop')) {
            hint = 'stack';
        // 완화된 fallback 규칙: 단일 메서드만으로도 힌트 부여
        } else if (methodSet.has('enqueue') || (hasQueueFields && (methodSet.has('push') || methodSet.has('push_back')))) {
            hint = 'queue';
        } else if (methodSet.has('dequeue') || methodSet.has('pop_front')) {
            hint = 'queue';
        } else if (methodSet.has('push') && !hasQueueFields) {
            hint = 'stack';
        } else if (methodSet.has('pop')) {
            hint = 'stack';
        } else if (selfPointerCount >= 2) {
            // 이중 연결 리스트 vs 트리 구분: prev/previous/back 등의 필드명이 있으면 이중 연결 리스트
            const doublyLinkedPatterns = [/prev/i, /back/i, /prior/i, /pred/i, /bwd/i, /before/i, /parent/i, /llink/i];
            const isDoublyLinked = selfPointers.some(f => doublyLinkedPatterns.some(p => p.test(f.name)));
            hint = isDoublyLinked ? 'node' : 'tree';
        } else if (selfPointerCount === 1) {
            hint = 'node';
        }

        structs.push({ name, fields, methods, hint });
    }
    return structs;
}

function findStructForVar(varName: string, varTypes: Map<string, string>, structs: StructDef[], currentStruct?: StructDef | null): StructDef | undefined {
    if (varName === 'this' && currentStruct) return currentStruct;
    const typeName = varTypes.get(varName);
    if (!typeName) return undefined;
    const baseType = typeName.split('<')[0];
    return structs.find(s => s.name === baseType || s.name === typeName);
}

function getTraceSetFn(type?: string): string {
    if (!type) return 'set_field_int';
    const t = type.toLowerCase().replace(/^(unsigned|signed|const|volatile)\s+/g, '').trim();
    if (t === 'double' || t === 'float' || t === 'long double') return 'set_field_double';
    if (t === 'string' || t === 'char' || t === 'elem' || t === 'std::string') return 'set_field_string';
    // int, long, short, unsigned, bool 등 모두 int로 처리
    return 'set_field_int';
}

export function parseTraceOutput(stdout: string): { userOutput: string; steps: TraceStep[] } {
    const lines = stdout.split('\n');
    const allUserLines: string[] = [];
    const steps: TraceStep[] = [];
    let currentStepOutput: string[] = [];

    for (const line of lines) {
        if (line.startsWith('__TRACE__')) {
            try {
                const json = line.substring('__TRACE__'.length);
                const step = JSON.parse(json) as TraceStep;
                if (currentStepOutput.length > 0) {
                    step.output = currentStepOutput.join('\n');
                    allUserLines.push(...currentStepOutput);
                    currentStepOutput = [];
                }
                steps.push(step);
            } catch { }
        } else {
            currentStepOutput.push(line);
        }
    }
    const finalOutput = currentStepOutput.join('\n').trim();
    if (finalOutput && steps.length > 0) {
        allUserLines.push(finalOutput);
        const lastStep = steps[steps.length - 1];
        lastStep.output = (lastStep.output ? lastStep.output + '\n' : '') + finalOutput;
    }
    return { userOutput: allUserLines.join('\n').trim(), steps };
}

export interface TraceStep {
    step: number; line: number; type: string; var?: string; field?: string;
    source?: string; value?: number | string; addr?: string; target?: string;
    struct?: string; hint?: 'stack' | 'queue' | 'node' | 'tree' | 'circular';
    raw?: string; output?: string;
}
