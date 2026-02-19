import type { Command, TargetType } from '../types';

let idCounter = 0;
const nextId = () => `item-${++idCounter}`;

export function resetParserIds() {
    idCounter = 0;
}

/**
 * Parse C++ code into a list of executable commands.
 * Supports: stack, queue, array, linked list operations.
 */
export function parseCode(code: string): Command[] {
    const lines = code.split('\n');
    const commands: Command[] = [];

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('//') || line.startsWith('#')) continue;

        // --- Stack operations ---
        // stack<int> s; or stack<int> myStack;
        const stackDecl = line.match(/stack\s*<\s*int\s*>\s+(\w+)/);
        if (stackDecl) continue; // Declaration only, no command needed

        // s.push(5)
        const stackPush = line.match(/(\w+)\.push\(\s*(-?\d+)\s*\)/);
        if (stackPush) {
            commands.push({
                type: 'PUSH',
                target: 'stack',
                targetName: stackPush[1],
                value: parseInt(stackPush[2]),
                raw: line,
            });
            continue;
        }

        // s.pop()
        const stackPop = line.match(/(\w+)\.pop\(\s*\)/);
        if (stackPop && !line.includes('push_back') && !line.includes('push_front')) {
            // Determine if this is a stack or queue pop based on context
            // We'll check the target name pattern - if it was declared as queue we handle in queue section
            commands.push({
                type: 'POP',
                target: 'stack',
                targetName: stackPop[1],
                raw: line,
            });
            continue;
        }

        // --- Queue operations ---
        // queue<int> q;
        const queueDecl = line.match(/queue\s*<\s*int\s*>\s+(\w+)/);
        if (queueDecl) continue;

        // q.push(5) — queue uses push for enqueue
        const queuePush = line.match(/(\w+)\.push\(\s*(-?\d+)\s*\)/);
        if (queuePush) {
            // Already handled by stackPush above — we'll differentiate by target name in reducer
            continue;
        }

        // q.front() and q.pop() — for queue dequeue pattern
        const queueFront = line.match(/(\w+)\.front\(\)/);
        if (queueFront) continue; // front() alone doesn't modify state

        // --- Array operations ---
        // int arr[5]; or int arr[5] = {1, 2, 3, 4, 5};
        const arrayDecl = line.match(/int\s+(\w+)\s*\[\s*(\d+)\s*\](?:\s*=\s*\{([^}]*)\})?/);
        if (arrayDecl) {
            const name = arrayDecl[1];
            const size = parseInt(arrayDecl[2]);
            const initialValues = arrayDecl[3]
                ? arrayDecl[3].split(',').map((v) => parseInt(v.trim()))
                : [];

            commands.push({
                type: 'ARRAY_DECLARE',
                target: 'array',
                targetName: name,
                size,
                raw: line,
            });

            initialValues.forEach((val, idx) => {
                commands.push({
                    type: 'ARRAY_SET',
                    target: 'array',
                    targetName: name,
                    value: val,
                    index: idx,
                    raw: `${name}[${idx}] = ${val};`,
                });
            });
            continue;
        }

        // arr[2] = 10;
        const arraySet = line.match(/(\w+)\[\s*(\d+)\s*\]\s*=\s*(-?\d+)/);
        if (arraySet) {
            commands.push({
                type: 'ARRAY_SET',
                target: 'array',
                targetName: arraySet[1],
                index: parseInt(arraySet[2]),
                value: parseInt(arraySet[3]),
                raw: line,
            });
            continue;
        }

        // --- Linked List operations (simplified) ---
        // list<int> ll; or LinkedList ll;
        const listDecl = line.match(/(?:list\s*<\s*int\s*>|LinkedList)\s+(\w+)/);
        if (listDecl) continue;

        // ll.push_back(5) or ll.insert(5)
        const listInsert = line.match(/(\w+)\.(push_back|push_front|insert)\(\s*(-?\d+)\s*\)/);
        if (listInsert) {
            commands.push({
                type: 'LIST_INSERT',
                target: 'linkedlist',
                targetName: listInsert[1],
                value: parseInt(listInsert[3]),
                raw: line,
            });
            continue;
        }

        // ll.pop_back() or ll.pop_front() or ll.remove(5)
        const listRemove = line.match(/(\w+)\.(pop_back|pop_front|remove)\(\s*(-?\d+)?\s*\)/);
        if (listRemove) {
            commands.push({
                type: 'LIST_REMOVE',
                target: 'linkedlist',
                targetName: listRemove[1],
                value: listRemove[3] ? parseInt(listRemove[3]) : undefined,
                raw: line,
            });
            continue;
        }
    }

    return commands;
}

/**
 * Detect which data structure types are referenced in the code,
 * used for correctly resolving ambiguous operations (like .push on queue vs stack).
 */
export function detectTargetTypes(code: string): Record<string, TargetType> {
    const map: Record<string, TargetType> = {};
    const lines = code.split('\n');

    for (const rawLine of lines) {
        const line = rawLine.trim();

        const stackDecl = line.match(/stack\s*<\s*int\s*>\s+(\w+)/);
        if (stackDecl) map[stackDecl[1]] = 'stack';

        const queueDecl = line.match(/queue\s*<\s*int\s*>\s+(\w+)/);
        if (queueDecl) map[queueDecl[1]] = 'queue';

        const arrayDecl = line.match(/int\s+(\w+)\s*\[/);
        if (arrayDecl) map[arrayDecl[1]] = 'array';

        const listDecl = line.match(/(?:list\s*<\s*int\s*>|LinkedList)\s+(\w+)/);
        if (listDecl) map[listDecl[1]] = 'linkedlist';
    }

    return map;
}

/**
 * Parse code with proper type resolution.
 * First detects variable types, then parses with correct target mapping.
 */
export function parseCodeWithContext(code: string): Command[] {
    const typeMap = detectTargetTypes(code);
    const rawCommands = parseCode(code);

    // Fix target types based on declarations
    return rawCommands.map((cmd) => {
        const declaredType = typeMap[cmd.targetName];
        if (declaredType) {
            // Fix push/pop for queue
            if (declaredType === 'queue' && cmd.type === 'PUSH') {
                return { ...cmd, target: 'queue' as TargetType, type: 'ENQUEUE' as const };
            }
            if (declaredType === 'queue' && cmd.type === 'POP') {
                return { ...cmd, target: 'queue' as TargetType, type: 'DEQUEUE' as const };
            }
            return { ...cmd, target: declaredType };
        }
        return cmd;
    });
}

export { nextId };
