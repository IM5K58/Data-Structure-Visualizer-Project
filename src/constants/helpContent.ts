export type Language = 'en' | 'ko';

export interface DeepDive {
    complexity: string;
    useCases: string[];
    tips: string[];
    advancedCode: string;
}

export interface StructureHelp {
    id: string;
    name: string;
    icon: string;
    description: string;
    howToUse: string;
    codeExample: string;
    deepDive: DeepDive;
}

export interface HelpContent {
    title: string;
    subtitle: string;
    description: string;
    backToEditor: string;
    selectLanguage: string;
    readMore: string;
    structures: StructureHelp[];
}

export const translations: Record<Language, HelpContent> = {
    en: {
        title: "How to Use?",
        subtitle: "Data Structure Visualizer",
        description: "Visualize C++ data structures in real-time. Write code, execute it, and see how memory and structures change step by step.",
        backToEditor: "Back to Editor",
        selectLanguage: "Language",
        readMore: "Read Deep Dive Guide",
        structures: [
            {
                id: "stack",
                name: "Stack",
                icon: "📚",
                description: "A Last-In-First-Out (LIFO) data structure. Elements are added and removed from the top.",
                howToUse: "Use `Stack<int> s;` to declare. Methods: `push()`, `pop()`, `top()`.",
                codeExample: "Stack<int> s;\ns.push(10);\ns.push(20);\ns.pop();",
                deepDive: {
                    complexity: "Push/Pop: O(1) | Search: O(n)",
                    useCases: ["Undo/Redo functions", "Expression parsing", "Function call management (Call Stack)"],
                    tips: ["Always check if the stack is empty before popping to avoid errors."],
                    advancedCode: "// Advanced Stack Test\nstack<int> s;\nfor(int i=1; i<=3; i++) {\n    s.push(i * 100);\n}\n\nwhile(!s.empty()) {\n    int val = s.top();\n    // Use val logic here\n    s.pop();\n}"
                }
            },
            {
                id: "queue",
                name: "Queue",
                icon: "🚶‍♂️",
                description: "A First-In-First-Out (FIFO) data structure. Elements are added at the back and removed from the front.",
                howToUse: "Use `Queue<int> q;` to declare. Methods: `push()`, `pop()`, `front()`.",
                codeExample: "Queue<int> q;\nq.push(10);\nq.push(20);\nq.pop();",
                deepDive: {
                    complexity: "Enqueue/Dequeue: O(1) | Search: O(n)",
                    useCases: ["Printer job scheduling", "Task processing in background", "Breadth-First Search (BFS) algorithm"],
                    tips: ["Circular queues can be more memory-efficient in specific scenarios."],
                    advancedCode: "// Advanced Queue Test\nqueue<int> q;\nfor(int i=0; i<3; i++) {\n    q.push(i + 1);\n}\n\nwhile(!q.empty()) {\n    int val = q.front();\n    // Use val logic here\n    q.pop();\n}"
                }
            },
            {
                id: "array",
                name: "Array",
                icon: "📊",
                description: "A collection of elements identified by index. Fixed-size sequence of elements.",
                howToUse: "Use `int arr[size];` to declare. Access via `arr[index]`.",
                codeExample: "int arr[5];\nfor(int i=0; i<5; i++) {\n  arr[i] = i * 10;\n}",
                deepDive: {
                    complexity: "Access: O(1) | Search: O(n) | Insert/Delete: O(n)",
                    useCases: ["Storing fixed-size collections", "Lookup tables", "Base for more complex structures like Matrices"],
                    tips: ["Index starts from 0. Accessing out of bounds causes undefined behavior."],
                    advancedCode: "// Advanced Array Test\nint arr[4] = {1, 2, 3, 4};\nfor(int i=0; i<4; i++) {\n    arr[i] = arr[i] * arr[i];\n}\n\nint j = 0;\nwhile(j < 4) {\n    arr[j] += 10;\n    j++;\n}"
                }
            },
            {
                id: "list",
                name: "Linked List",
                icon: "🔗",
                description: "A linear collection of data elements whose order is not given by their physical placement in memory.",
                howToUse: "Use `LinkedList<int> list;` to declare. Methods: `insert()`, `remove()`.",
                codeExample: "LinkedList<int> list;\nlist.insert(5);\nlist.insert(10);",
                deepDive: {
                    complexity: "Insert/Delete: O(1) (if node is known) | Search: O(n)",
                    useCases: ["Dynamic memory allocation", "Implementing Stacks/Queues", "Adjacency lists in Graphs"],
                    tips: ["Each node contains data and a pointer to the next node. Sequential access only."],
                    advancedCode: "// Advanced List Test\nlinkedlist<int> list;\nfor(int i=0; i<5; i++) {\n    list.insert(i * 5);\n}\n\n// Basic modifications\nlist.insert(100);\nlist.remove(10);"
                }
            },
            {
                id: "tree",
                name: "Tree (BST)",
                icon: "🌳",
                description: "A hierarchical data structure. This visualizer implements a Binary Search Tree (BST) where smaller values are placed left and larger values right.",
                howToUse: "Use `Tree<int> t;` or `BST<int> t;` to declare. Methods: `insert(val)`, `remove(val)`.",
                codeExample: "Tree<int> t;\nt.insert(20);\nt.insert(10);\nt.insert(30);",
                deepDive: {
                    complexity: "Search/Insert/Delete: O(log n) | Worst: O(n)",
                    useCases: ["Hierarchical data storage", "Fast searching and sorting", "Database indexing (B-Trees)"],
                    tips: ["The tree structure follows Binary Search Tree logic for node placement."],
                    advancedCode: "// Advanced Tree Test\nbst<int> t;\nint vals[7] = {20, 10, 30, 5, 15, 25, 35};\nfor(int i=0; i<7; i++) {\n    t.insert(vals[i]);\n}\n\nt.remove(15);\nt.remove(30);"
                }
            }
        ]
    },
    ko: {
        title: "사용 방법",
        subtitle: "자료구조 시각화 도구",
        description: "C++ 자료구조를 실시간으로 시각화합니다. 코드를 작성하고 실행하여 메모리와 구조가 어떻게 변하는지 단계별로 확인해보세요.",
        backToEditor: "에디터로 돌아가기",
        selectLanguage: "언어 선택",
        readMore: "심화 학습 가이드 읽기",
        structures: [
            {
                id: "stack",
                name: "스택 (Stack)",
                icon: "📚",
                description: "후입선출(LIFO) 방식의 자료구조입니다. 데이터의 삽입과 삭제가 한쪽 끝(Top)에서만 일어납니다.",
                howToUse: "`Stack<int> s;`와 같이 선언합니다. `push()`, `pop()`, `top()` 메서드를 지원합니다.",
                codeExample: "Stack<int> s;\ns.push(10);\ns.push(20);\ns.pop();",
                deepDive: {
                    complexity: "삽입/삭제: O(1) | 탐색: O(n)",
                    useCases: ["되돌리기(Undo)/다시실행(Redo)", "수식 괄호 검사", "함수 호출 관리(Call Stack)"],
                    tips: ["데이터를 꺼내기 전(pop)에 반드시 비어있는지 확인해야 에러를 방지할 수 있습니다."],
                    advancedCode: "// 고급 스택 테스트\nstack<int> s;\nfor(int i=1; i<=3; i++) {\n    s.push(i * 100);\n}\n\nwhile(!s.empty()) {\n    int val = s.top();\n    // val 값 활용\n    s.pop();\n}"
                }
            },
            {
                id: "queue",
                name: "큐 (Queue)",
                icon: "🚶‍♂️",
                description: "선입선출(FIFO) 방식의 자료구조입니다. 뒤(Back)에서 삽입되고 앞(Front)에서 삭제됩니다.",
                howToUse: "`Queue<int> q;`와 같이 선언합니다. `push()`, `pop()`, `front()` 메서드를 지원합니다.",
                codeExample: "Queue<int> q;\nq.push(10);\nq.push(20);\nq.pop();",
                deepDive: {
                    complexity: "삽입/삭제: O(1) | 탐색: O(n)",
                    useCases: ["프린터 인쇄 대기열", "백그라운드 작업 처리", "너비 우선 탐색(BFS) 알고리즘"],
                    tips: ["원형 큐를 사용하면 메모리를 더 효율적으로 재사용할 수 있습니다."],
                    advancedCode: "// 고급 큐 테스트\nqueue<int> q;\nfor(int i=0; i<3; i++) {\n    q.push(i + 1);\n}\n\nwhile(!q.empty()) {\n    int val = q.front();\n    // val 값 활용\n    q.pop();\n}"
                }
            },
            {
                id: "array",
                name: "배열 (Array)",
                icon: "📊",
                description: "인덱스로 식별되는 요소들의 집합입니다. 연속된 메모리 공간에 고정된 크기로 저장됩니다.",
                howToUse: "`int arr[크기];`와 같이 선언합니다. `arr[인덱스]`를 통해 접근합니다.",
                codeExample: "int arr[5];\nfor(int i=0; i<5; i++) {\n  arr[i] = i * 10;\n}",
                deepDive: {
                    complexity: "접근: O(1) | 탐색: O(n) | 삽입/삭제: O(n)",
                    useCases: ["고정된 크기의 데이터 저장", "조회 테이블(Lookup Table)", "행렬과 같은 복잡한 자료구조의 기본 구조"],
                    tips: ["인덱스는 0부터 시작하며, 범위를 벗어난 접근은 예상치 못한 오류를 발생시킵니다."],
                    advancedCode: "// 고급 배열 테스트\nint arr[4] = {1, 2, 3, 4};\nfor(int i=0; i<4; i++) {\n    arr[i] = arr[i] * arr[i];\n}\n\nint j = 0;\nwhile(j < 4) {\n    arr[j] += 10;\n    j++;\n}"
                }
            },
            {
                id: "list",
                name: "연결 리스트 (Linked List)",
                icon: "🔗",
                description: "데이터 요소들이 노드 형태로 연결된 선형 집합입니다. 각 노드는 다음 노드를 가리킵니다.",
                howToUse: "`LinkedList<int> list;`와 같이 선언합니다. `insert()`, `remove()` 메서드를 지원합니다.",
                codeExample: "LinkedList<int> list;\nlist.insert(5);\nlist.insert(10);",
                deepDive: {
                    complexity: "삽입/삭제: O(1) (노드를 알 때) | 탐색: O(n)",
                    useCases: ["동적 메모리 할당이 필요할 때", "스택이나 큐를 구현할 때", "그래프의 인접 리스트"],
                    tips: ["노드들이 메모리상에 흩어져 있어 순차적으로만 접근이 가능합니다."],
                    advancedCode: "// 고급 리스트 테스트\nlinkedlist<int> list;\nfor(int i=0; i<5; i++) {\n    list.insert(i * 5);\n}\n\n// 기본 수정 작업\nlist.insert(100);\nlist.remove(10);"
                }
            },
            {
                id: "tree",
                name: "이진 탐색 트리 (Tree)",
                icon: "🌳",
                description: "계층적 구조를 가진 자료구조입니다. 이 비주얼라이저는 작은 값은 왼쪽, 큰 값은 오른쪽에 배치되는 이진 탐색 트리(BST)를 제공합니다.",
                howToUse: "`Tree<int> t;` 또는 `BST<int> t;`로 선언합니다. `insert(val)`, `remove(val)` 메서드를 지원합니다.",
                codeExample: "Tree<int> t;\nt.insert(20);\nt.insert(10);\nt.insert(30);",
                deepDive: {
                    complexity: "탐색/삽입/삭제: O(log n) | 최악: O(n)",
                    useCases: ["계층적 데이터 저장", "효율적인 검색 및 정렬", "데이터베이스 인덱싱"],
                    tips: ["이진 탐색 트리 규칙에 따라 데이터가 자동으로 배치됩니다."],
                    advancedCode: "// 고급 트리 테스트\nbst<int> t;\nint vals[7] = {20, 10, 30, 5, 15, 25, 35};\nfor(int i=0; i<7; i++) {\n    t.insert(vals[i]);\n}\n\nt.remove(15);\nt.remove(30);"
                }
            }
        ]
    }
};
