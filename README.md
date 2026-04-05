[![Korean](https://img.shields.io/badge/Language-Korean-red?style=for-the-badge)](./README.kr.md)

# Data Structure Visualizer

A web application that visualizes C++ data structures with real-time animations. It compiles and executes **real C++ code** via a backend g++ compiler, traces actual memory operations at runtime using **GDB MI**, and renders step-by-step animated visualizations.

### [Live Demo](https://data-structure-visualizer-project.vercel.app/)

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![Framer Motion](https://img.shields.io/badge/Framer_Motion-12-E91E8C?logo=framer&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=nodedotjs&logoColor=white)

---

## How It Works

### Primary Path: GDB MI Mode (default)

```
C++ Code  -->  g++ Compile  -->  GDB MI Session  -->  Line-by-line Snapshots  -->  gdbMapper  -->  TraceStep[]  -->  Visualization
               (-g -O0)         (--interpreter=mi2)   (locals + struct fields)    (ALLOC/SET_PTR/             (React + Framer Motion)
                                                                                    SET_FIELD/LOCAL_VAR)
```

1. User writes C++ code with custom structs / pointers
2. Backend compiles code with **debug symbols** (`g++ -g -O0`)
3. **GDB** runs the binary line-by-line in MI mode, capturing local variables and struct field values at every step
4. `gdbMapper` converts raw GDB snapshots into `TraceStep[]` events (ALLOC, SET_PTR, SET_FIELD, LOCAL_VAR)
5. **Runtime pattern analysis** builds a pointer graph and detects data structure types by analyzing actual graph topology (out-degree, cycles, depth)
6. Frontend replays commands as animated visualizations

### Fallback Path: Instrumenter Mode (`USE_GDB=false` or GDB not installed)

```
C++ Code  -->  AI Analysis  -->  Instrumenter  -->  g++ Compile  -->  Execute  -->  Trace Output  -->  Runtime Analysis  -->  Visualization
               (Groq LLM)        (inject trace      (real binary)     (real run)    (__TRACE__ JSON)   (graph topology)      (React + Framer Motion)
               struct hints       calls)
```

1. **Groq AI** (optional) pre-analyzes struct definitions and provides classification hints
2. Backend **instrumenter** injects trace calls (`__vt::alloc`, `__vt::set_ptr`, etc.) using AI hints
3. Code is compiled and executed with **g++** (C++17)
4. Runtime trace output is parsed into step-by-step commands

---

## Key Features

- **Real C++ Execution**: Compiles and runs actual C++ code via g++ backend. No simulation or pseudo-code parsing.
- **GDB-Powered Tracing**: Uses GDB Machine Interface (MI) to step through code line by line and capture exact memory state — no source code transformation needed.
- **AI-Assisted Classification** (fallback mode): Optional Groq AI (free tier) pre-analyzes struct definitions to handle ambiguous field names and non-standard patterns.
- **Smart Auto-Detection**: Three-layer detection system:
  - **AI analysis**: Groq LLM classifies struct types before instrumentation (if `GROQ_API_KEY` is set, fallback mode only)
  - **Static analysis**: Method names (`push`/`pop` = Stack) and self-type pointer counts (2+ = Tree, 1 = Linked List)
  - **Runtime analysis**: Builds actual pointer graph from execution traces and reclassifies based on graph topology (branching, cycles, depth)
- **Memory Graph Visualization**: Traces pointers (`->`), allocations (`new`), and deallocations (`delete`) to draw memory relationships.
- **Step-by-Step Execution**: Run / Pause / Step / Prev controls with precise state tracking.
- **Adjustable Speed**: Playback speed control from 0.25x to 4x.
- **Resizable Panels**: Editor, visualizer, and terminal panels are all draggable.
- **Interactive Views**: Drag-to-pan and Ctrl+Scroll zoom in visualization boxes.
- **C++ Autocomplete**: IDE-style code completion for C++ keywords, types, and STL containers.
- **Terminal Output**: Real-time `cout` output display with stdin input support.

---

## Supported Data Structures

| Data Structure | Color | Detection Method | Visualization |
|----------------|-------|------------------|---------------|
| **Stack** | Purple | `push()` + `pop()` methods | Vertical plate stacking with TOP indicator |
| **Queue** | Cyan | `enqueue()` + `dequeue()` methods | Horizontal conveyor belt with FRONT/BACK labels |
| **Tree (BST / N-ary)** | Green | 2+ self-type pointers OR runtime branching pattern | Hierarchical bucket layout with ROOT badge, drag-to-pan |
| **Linked List** | Purple | 1 self-type pointer, linear chain | Graph view with arrow connections |
| **Circular Linked List** | Amber | Runtime cycle detection (single outgoing pointer with loop) | Polygon layout with HEAD badge, amber dashed cycle-back edge |
| **Memory (Heap)** | Purple | Fallback for pointer structures | Graph view with memory addresses |

### Smart Detection Pipeline

```
Static Hint (compile-time)          Runtime Analysis (post-execution)
push/pop methods → Stack            (already classified)
enqueue/dequeue  → Queue            (already classified)
2+ self-pointers → Tree hint    →   verify: branching + acyclic + depth > 1 → Tree
1 self-pointer   → Node hint    →   verify: linear chain → Linked List
no hint          → Memory       →   cycle detected → Circular Linked List
```

**Field names don't matter**: `left/right`, `a/b`, `child1/child2`, `ptr1/ptr2` — the system detects structure from actual runtime pointer topology.

**Supported C++ patterns**: `struct`, `class`, `private`/`public`/`protected`, `friend class`, constructors with initializer lists, `const`/`static` qualifiers, array fields, multi-variable declarations, `delete[]`.

**Supported Value Types**: `int`, `double`, `string`, `bool`, `char`

---

## Test Code Examples

### Stack

```cpp
#include <iostream>
using namespace std;

struct Stack {
    int data[100];
    int top;
    Stack() : top(-1) {}
    void push(int val) { data[++top] = val; }
    void pop() { if (top >= 0) top--; }
};

int main() {
    Stack s;
    s.push(10);
    s.push(20);
    s.push(30);
    s.pop();
    s.push(40);
    return 0;
}
```

### Queue (Linked List Based)

```cpp
#include <iostream>
using namespace std;

class Node {
private:
    int data;
    Node* next;
    Node(int d) : data(d), next(nullptr) {}
    friend class LLQueue;
};

class LLQueue {
private:
    Node* front;
    Node* rear;
public:
    LLQueue() : front(nullptr), rear(nullptr) {}
    void enqueue(int val) {
        Node* node = new Node(val);
        if (!rear) { front = rear = node; return; }
        rear->next = node;
        rear = node;
    }
    void dequeue() {
        if (!front) return;
        Node* temp = front;
        front = front->next;
        if (!front) rear = nullptr;
        delete temp;
    }
};

int main() {
    LLQueue q;
    q.enqueue(100);
    q.enqueue(200);
    q.enqueue(300);
    q.dequeue();
    q.enqueue(400);
    return 0;
}
```

### Tree (Custom Field Names)

```cpp
#include <iostream>
using namespace std;

struct BBB {
    int val;
    BBB* a;
    BBB* b;
    BBB(int v) : val(v), a(nullptr), b(nullptr) {}
};

int main() {
    BBB* root = new BBB(42);
    root->a = new BBB(10);
    root->b = new BBB(99);
    root->a->a = new BBB(5);
    root->a->b = new BBB(25);
    return 0;
}
```

### Linked List

```cpp
#include <iostream>
using namespace std;

struct Node {
    int data;
    Node* next;
    Node(int v) : data(v), next(nullptr) {}
};

int main() {
    Node* head = new Node(1);
    head->next = new Node(2);
    head->next->next = new Node(3);
    head->next->next->next = new Node(4);

    // Delete middle node
    Node* temp = head->next;
    head->next = temp->next;
    delete temp;

    return 0;
}
```

### Circular Linked List

```cpp
#include <iostream>
using namespace std;

struct Node {
    int data;
    Node* next;
    Node(int v) : data(v), next(nullptr) {}
};

int main() {
    Node* head = new Node(1);
    head->next = new Node(2);
    head->next->next = new Node(3);
    head->next->next->next = head; // cycle back to head
    return 0;
}
```

---

## Getting Started

### Prerequisites

- **Node.js** 18+
- **npm** 9+
- **g++** (MSYS2 on Windows, or system g++ on Linux/Mac)
- **GDB** (MSYS2 on Windows: `pacman -S mingw-w64-ucrt-x86_64-gdb`, Linux/Mac: `apt install gdb` / `brew install gdb`)

> GDB is required for the default execution mode. If GDB is not installed, the server automatically falls back to instrumenter mode.

### Installation & Setup

```bash
# Frontend
npm install
npm run dev

# Backend (separate terminal)
cd server
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_COMPILER_API_URL` | `http://localhost:3001` | Backend API URL (frontend) |
| `PORT` | `3001` | Server port (backend) |
| `GPP_PATH` | Auto-detected | Path to g++ compiler |
| `GDB_PATH` | Auto-detected | Path to GDB debugger |
| `USE_GDB` | `true` | Set to `false` to force instrumenter mode |
| `FRONTEND_URL` | — | Allowed CORS origin for production |
| `GROQ_API_KEY` | — | Groq API key for AI struct classification (optional, fallback mode only) |

---

## Deployment

### Frontend (Vercel - Free)

1. Connect GitHub repo to [Vercel](https://vercel.com)
2. Set `VITE_COMPILER_API_URL` to your backend URL
3. Deploy

### Backend (Render.com - Free, Docker)

1. Connect GitHub repo to [Render](https://render.com)
2. Set root directory to `server`, runtime to Docker
3. Set env vars: `GPP_PATH=/usr/bin/g++`, `USE_GDB=false` (Render does not allow ptrace), `FRONTEND_URL=https://your-app.vercel.app`, `GROQ_API_KEY=gsk_...` (optional)
4. Deploy

> On cloud platforms that restrict ptrace (e.g. Render free tier), set `USE_GDB=false` to use instrumenter mode.

---

## Project Structure

```
src/
├── types.ts                  # Type definitions (Command, State, etc.)
├── App.tsx                   # Main layout with resizable panels
├── api/
│   └── compilerApi.ts        # Frontend -> Backend API client
├── engine/
│   └── stepMapper.ts         # TraceStep[] -> Commands + runtime pattern analysis
├── hooks/
│   └── useVisualizer.ts      # State management (useReducer)
├── utils/
│   └── ids.ts                # ID generation utility
└── components/
    ├── CodeInput.tsx          # Monaco C++ editor with autocomplete
    ├── Controls.tsx           # Execution controls & speed slider
    ├── Terminal.tsx           # Output / Input / Command Log tabs
    ├── Visualizer.tsx         # Routes structures to visualization components
    └── DataStructures/
        ├── StackPlate.tsx     # Stack: vertical plate stacking
        ├── QueueBlock.tsx     # Queue: horizontal conveyor belt
        ├── GraphView.tsx      # Memory / Linked List: graph with arrows
        ├── TreeChart.tsx      # Tree: hierarchical bucket layout (N-ary)
        └── CircularListView.tsx # Circular Linked List: polygon layout

server/
├── Dockerfile                # Docker image for deployment (Node.js + g++)
├── src/
│   ├── index.ts              # Express server with CORS
│   ├── routes/compile.ts     # POST /api/compile endpoint (GDB or instrumenter)
│   └── services/
│       ├── compiler.ts       # g++ compilation (debug build + standard build)
│       ├── gdbDriver.ts      # GDB MI driver: spawns GDB, steps line-by-line, captures snapshots
│       ├── gdbMapper.ts      # Converts GDB snapshots → TraceStep[] events
│       ├── instrumenter.ts   # C++ code instrumentation (fallback mode)
│       └── codeAnalyzer.ts   # Groq AI struct classifier (fallback mode, optional)
└── sandbox/
    └── __tracer.h            # C++ tracing header (injected in instrumenter mode)
```

---

## Open Source Licenses

This project is built with the following open-source libraries:

### Frontend

| Library | License | Description |
|---------|---------|-------------|
| [React](https://react.dev/) | MIT | UI component library |
| [React DOM](https://react.dev/) | MIT | React rendering for web |
| [TypeScript](https://www.typescriptlang.org/) | Apache-2.0 | Typed superset of JavaScript |
| [Vite](https://vite.dev/) | MIT | Next-generation frontend build tool |
| [Tailwind CSS](https://tailwindcss.com/) | MIT | Utility-first CSS framework |
| [Framer Motion](https://www.framer.com/motion/) | MIT | Animation library for React |
| [Monaco Editor (React)](https://github.com/suren-atoyan/monaco-react) | MIT | VS Code editor component for React |
| [ESLint](https://eslint.org/) | MIT | JavaScript/TypeScript linter |

### Backend

| Library | License | Description |
|---------|---------|-------------|
| [Express](https://expressjs.com/) | MIT | Web framework for Node.js |
| [CORS](https://github.com/expressjs/cors) | MIT | Cross-Origin Resource Sharing middleware |
| [Node.js](https://nodejs.org/) | MIT | JavaScript runtime |
| [tsx](https://github.com/privatenumber/tsx) | MIT | TypeScript execution for Node.js |
| [groq-sdk](https://github.com/groq/groq-typescript) | Apache-2.0 | Groq API client for AI struct classification (optional) |

### Toolchain

| Tool | License | Description |
|------|---------|-------------|
| [g++ (GCC)](https://gcc.gnu.org/) | GPL-3.0 | C++ compiler (runtime dependency, not bundled) |
| [GDB](https://www.sourceware.org/gdb/) | GPL-3.0 | GNU Debugger for line-by-line tracing (runtime dependency, not bundled) |

---

## License

MIT License - see [LICENSE](./LICENSE) for details.
