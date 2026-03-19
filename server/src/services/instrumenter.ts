/**
 * C++ 코드 계측기 (Instrumenter)
 * 사용자의 C++ 코드에 자동으로 추적 함수를 삽입합니다.
 */

interface StructDef {
    name: string;
    fields: { name: string; type: string; isPointer: boolean }[];
    methods: string[];
    hint?: 'stack' | 'queue' | 'node' | 'tree';
}

/**
 * C++ 코드를 분석하고 추적 코드를 삽입합니다.
 */
export function instrument(code: string): string {
    const structs = parseStructs(code);
    const varTypes = new Map<string, string>(); // varName -> typeName
    const lines = code.split(/\r?\n/);
    const output: string[] = [];

    output.push('#include "__tracer.h"');
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
                    fieldInits.forEach(init => {
                        const m = init.match(/^(\w+)\s*\(([^)]+)\)$/);
                        if (m) {
                            const fieldName = m[1];
                            const fieldDef = currentStruct?.fields.find(f => f.name === fieldName);
                            if (fieldDef) {
                                if (fieldDef.isPointer) {
                                    output.push(`    __vt::set_ptr(${lineNum}, "this", "${fieldName}", this, this->${fieldName});`);
                                } else {
                                    output.push(`    __vt::${getTraceSetFn(fieldDef.type)}(${lineNum}, "this", "${fieldName}", this, this->${fieldName});`);
                                }
                            }
                        }
                    });
                    // 초기화 리스트 라인은 스킵 로직에 걸려도 이미 처리가 끝났으므로 continue
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
        // ^ 앵커 제거: if (cond) s.push(x); 같은 제어문 내부에서도 매칭
        const methodCallMatch = trimmed.match(/(\w+)\.(\w+)\s*\((.*)\)\s*;/);
        if (methodCallMatch) {
            const varName = methodCallMatch[1];
            const methodName = methodCallMatch[2];
            const args = methodCallMatch[3].trim();

            const typeName = varTypes.get(varName);
            if (typeName) {
                const baseType = typeName.split('<')[0];
                const struct = structs.find(s => s.name === baseType || s.name === typeName);
                if (struct && (struct.hint === 'stack' || struct.hint === 'queue')) {
                    const lowerMethod = methodName.toLowerCase();
                    if (['push', 'enqueue'].includes(lowerMethod) && args) {
                        output.push(`    __vt::push_val(${lineNum}, "${varName}", (${args}));`);
                    } else if (['pop', 'dequeue'].includes(lowerMethod)) {
                        output.push(`    __vt::pop(${lineNum}, "${varName}");`);
                    }
                    continue;
                }
            }
        }

        // 패턴 1: new 할당 (const/static/volatile 접두사 허용)
        const newMatch = trimmed.match(/^(?:const\s+|static\s+|volatile\s+)*(\w+(?:<[^>]+>)?)\s*\*\s*(\w+)\s*=\s*new\s+(\w+(?:<[^>]+>)?)\s*(?:\([^;]*\))?\s*;/);
        if (newMatch) {
            const varName = newMatch[2];
            const typeName = newMatch[3];
            varTypes.set(varName, typeName);
            const baseTypeName = typeName.split('<')[0];
            const struct = structs.find(s => s.name === baseTypeName || s.name === typeName);
            const hintAttr = struct?.hint ? `, "${struct.hint}"` : '';
            output.push(`    __vt::alloc(${lineNum}, "${varName}", ${varName}, "${typeName}"${hintAttr});`);
            continue;
        }

        // 패턴 2: 멤버 포인터에 new 할당
        const memberNewMatch = trimmed.match(/^([\w]+(?:->[\w]+)*)->(\w+)\s*=\s*new\s+(\w+(?:<[^>]+>)?)\s*(?:\([^;]*\))?\s*;/);
        if (memberNewMatch) {
            const varPath = memberNewMatch[1];
            const fieldName = memberNewMatch[2];
            const typeName = memberNewMatch[3];
            const baseTypeName = typeName.split('<')[0];
            const struct = structs.find(s => s.name === baseTypeName || s.name === typeName);
            const hintAttr = struct?.hint ? `, "${struct.hint}"` : '';
            output.push(`    __vt::alloc(${lineNum}, "${varPath}->${fieldName}", ${varPath}->${fieldName}, "${typeName}"${hintAttr});`);
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

            // Multi-variable declaration: "int a, b, c;" or "Node* left, *right;"
            const multiVarMatch = trimmed.match(/^(\w+(?:<[^>]+>)?)\s+([\w\s*,\[\]]+)$/);
            if (multiVarMatch) {
                const type = multiVarMatch[1];
                const vars = multiVarMatch[2].split(',');
                for (const v of vars) {
                    const vm = v.trim().match(/^(\*?)\s*(\w+)(?:\s*\[.*\])?$/);
                    if (vm) {
                        fields.push({
                            name: vm[2],
                            type,
                            isPointer: vm[1] === '*',
                        });
                    }
                }
                continue;
            }

            // Single field with optional array: "int data[100]"
            const fieldMatch = trimmed.match(/^(\w+(?:<[^>]+>)?)\s*(\*?)\s*(\w+)(?:\s*\[.*\])?$/);
            if (fieldMatch) {
                fields.push({
                    name: fieldMatch[3],
                    type: fieldMatch[1],
                    isPointer: fieldMatch[2] === '*',
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

        if (methodSet.has('push') && methodSet.has('pop')) {
            hint = 'stack';
        } else if ((methodSet.has('enqueue') && methodSet.has('dequeue')) || (methodSet.has('push') && methodSet.has('front'))) {
            hint = 'queue';
        } else if (selfPointerCount >= 2) {
            hint = 'tree';
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
    const t = type.toLowerCase();
    if (t === 'double' || t === 'float') return 'set_field_double';
    if (t === 'string' || t === 'char' || t === 'elem' || t === 'std::string') return 'set_field_string';
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
    struct?: string; hint?: 'stack' | 'queue' | 'node' | 'tree';
    raw?: string; output?: string;
}
