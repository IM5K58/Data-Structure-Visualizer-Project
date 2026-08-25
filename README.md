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

### Without GDB (`USE_GDB=false`, or GDB not installed)

There is no second tracing path. The program is compiled, run, and its output
returned; `steps` is empty and the visualizer draws nothing. The response
carries a `notice` saying so.

An earlier version rewrote the user's source to inject trace calls. It was
removed because it could emit C++ that would not compile — for a program that
compiled perfectly well on its own.

---

## Key Features

- **Real C++ Execution**: Compiles and runs actual C++ code via g++ backend. No simulation or pseudo-code parsing.
- **GDB-Powered Tracing**: Uses GDB Machine Interface (MI) to step through code line by line and capture exact memory state — no source code transformation needed.
- **Smart Auto-Detection**: Two-layer detection system:
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
| **Stack** | Purple | `push()` + `pop()` methods, or `std::stack`/`vector` | Vertical plate stacking with TOP indicator |
| **Queue** | Cyan | `enqueue()` + `dequeue()` methods, or `std::queue`/`deque`/`priority_queue` | Horizontal conveyor belt with FRONT/BACK labels |
| **Tree (BST / N-ary)** | Green | 2+ self-type pointers OR runtime branching pattern (parent pointers tolerated) | Hierarchical bucket layout with ROOT badge, drag-to-pan |
| **Linked List** | Purple | 1 self-type pointer, linear chain | Graph view with arrow connections |
| **Doubly Linked List** | Cyan / Amber | Linear chain with bidirectional `next`/`prev` pairs | Horizontal chain — solid cyan `next` arrows + dashed amber `prev` arrows |
| **Circular Linked List** | Amber | Runtime cycle detection (single outgoing pointer with loop) | Polygon layout with HEAD badge, amber dashed cycle-back edge |
| **General Graph** | Rose | Branching + cycle that survives back-edge stripping | Graph view with all edges |
| **Memory (Heap)** | Purple | Fallback for pointer structures | Graph view with memory addresses |

### Smart Detection Pipeline

```
Static Hint (compile-time)            Runtime Analysis (post-execution)
push/pop methods → Stack              (already classified)
enqueue/dequeue  → Queue              (already classified)
std::stack/vector               → Stack
std::queue/deque/priority_queue → Queue
                                      ┌─ strip bidirectional pairs from one field ─┐
                                      │  (the "back-edge" / prev / parent field)   │
                                      └─────────────────┬──────────────────────────┘
                                                        ▼
                                  primary graph cyclic + branching       → Graph
                                  primary graph cyclic + max-out-deg ≤ 1 → Circular Linked List
                                  primary graph acyclic + branching      → Tree
                                  primary graph acyclic + back-edges     → Doubly Linked List
                                  primary graph acyclic + chain          → Linked List
```

**Field names don't matter**: `left/right`, `a/b`, `child1/child2`, `ptr1/ptr2`, `next/prev`, `child/parent` — the system detects structure from actual runtime pointer topology.

**Supported C++ patterns**: `struct`, `class`, `private`/`public`/`protected`, `friend class`, constructors with initializer lists, `const`/`static` qualifiers, array fields, multi-variable declarations, `delete[]`.

**Supported Value Types**: `int`, `double`, `string`, `bool`, `char`

**Supported STL Containers**:
`std::stack`, `std::queue`, `std::priority_queue`, `std::vector`, `std::deque`. The
tracer evaluates `.size()` / `.top()` / `.back()` per snapshot and synthesises
PUSH / POP commands from the differences.

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

### Doubly Linked List

```cpp
#include <iostream>
using namespace std;

struct Node {
    int data;
    Node* next;
    Node* prev;
    Node(int v) : data(v), next(nullptr), prev(nullptr) {}
};

int main() {
    Node* a = new Node(1);
    Node* b = new Node(2);
    Node* c = new Node(3);
    a->next = b; b->prev = a;
    b->next = c; c->prev = b;
    return 0;
}
```

### STL Stack / Queue

```cpp
#include <stack>
#include <queue>
using namespace std;

int main() {
    stack<int> s;
    s.push(10); s.push(20); s.push(30);
    s.pop();

    queue<int> q;
    q.push(1); q.push(2); q.push(3);
    q.pop();
    return 0;
}
```

---

## Getting Started

### Prerequisites

- **Node.js** 22 (the version in `.nvmrc`, which CI also uses)
- **npm** 9+
- **g++** (MSYS2 on Windows, or system g++ on Linux/Mac)
- **GDB** (MSYS2 on Windows: `pacman -S mingw-w64-ucrt-x86_64-gdb`, Linux/Mac: `apt install gdb` / `brew install gdb`)

> **GDB is required.** It is the only thing that produces a trace, so without it
> there is nothing to visualize. If GDB is missing the server still compiles and
> runs the program and returns its output, but `steps` comes back empty and the
> visualizer draws nothing. There is no longer a second tracing path to fall back
> to — the instrumenter was removed.

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

### Tests

```bash
npm run test:all    # frontend and server suites
npm run typecheck   # both TypeScript projects
npm run lint        # covers server/src as well
```

`npm test` on its own runs only the frontend suite — the root vitest config is
scoped to `src/**`. Use `test:all` for both. CI
(`.github/workflows/ci.yml`) runs lint, typecheck, both suites and both builds
on Node 22.

### Environment Variables

> **Numeric values are validated at startup.** Anything that is not a plain
> positive whole number — `256M`, `8s`, `-1`, `1e6` — throws and the server does
> not start. Write byte counts out in full: `RLIMIT_AS_BYTES=268435456`, never
> `256M`. Unset or empty uses the default. This is deliberate: the old parser
> read `256M` as `256`, which gave every traced program a 256-byte address space
> and reported it as an unrelated GDB failure.

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_COMPILER_API_URL` | `http://localhost:3001` | Backend API URL (frontend) |
| `PORT` | `3001` | Server port (backend) |
| `GPP_PATH` | Auto-detected | Path to g++ compiler |
| `GDB_PATH` | Auto-detected | Path to GDB debugger |
| `USE_GDB` | `true` | Set to `false` to run programs **without a trace** — output only, `steps` is empty and nothing is visualized |
| `TEMP_BASE` | Probed | Directory that compiled binaries are written to and run from. Defaults to `/dev/shm` when it is exec-capable, otherwise the OS temp dir. Set explicitly if neither works |
| `FRONTEND_URL` | — | Allowed CORS origin for production |
| `MAX_STDIN_BYTES` | `65536` | Largest stdin payload accepted per request |
| `MAX_OUTPUT_BYTES` | `1048576` | Cap on captured program output |
| `GDB_SESSION_BUDGET_MS` | `45000` | Wall-clock budget for one trace session |
| `PISTON_URL` | — | Delegate execution to a [Piston](https://github.com/engineer-man/piston) server instead of local g++. No tracing on this path |
| `VERBOSE_STEP_LOG` | — | `true` logs every generated trace step |
| `VERBOSE_MI_LOG` | — | `true` echoes every GDB/MI line. Very noisy, and it prints user source and variable values |
| `RATE_LIMIT_COMPILE` | `20` | Compile requests per minute per IP |
| `RATE_LIMIT_GENERAL` | `120` | Other `/api` requests per minute per IP |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window in milliseconds |
| `TRUST_PROXY` | — | Express trust-proxy setting (set to `1` or a CIDR list when behind a load balancer so rate limit keys on the real client IP) |
| `RLIMIT_CPU_SEC` | `8` | Per-program CPU-time cap in seconds (Linux, applied via `prlimit`) |
| `RLIMIT_AS_BYTES` | `268435456` | Per-program virtual-memory cap (256 MiB default) |
| `RLIMIT_STACK_BYTES` | `16777216` | Per-program stack cap (16 MiB default) |
| `RLIMIT_FSIZE_BYTES` | `8388608` | Max file size a program may write (8 MiB) |
| `RLIMIT_NOFILE` | `64` | Max open file descriptors |
| `RLIMIT_NPROC` | `64` | Max user processes |
| `PRLIMIT_PATH` | `/usr/bin/prlimit` | Path to `prlimit`. On Linux the server **refuses to start** if it is missing — install `util-linux`, correct this path, or set `DISABLE_RLIMIT=true` deliberately |
| `DISABLE_RLIMIT` | — | `true` starts the server with **no CPU, memory, file-size or process caps** on user code. This is the documented escape hatch for a host that is already constrained (cgroups, a VM); anywhere else it turns this service into an unbounded remote-execution endpoint |

---

## Deployment

### Frontend (Vercel - Free)

1. Connect GitHub repo to [Vercel](https://vercel.com)
2. Set `VITE_COMPILER_API_URL` to your backend URL
3. Deploy

### Backend

The backend needs two things a managed PaaS often will not give you:

1. **ptrace**, because GDB is the only thing that produces a trace.
2. **An exec-capable temp directory.** Compiled binaries are written and then
   run. Docker mounts `/dev/shm` `noexec` by default, so the binary is written
   successfully and then refuses to execute. The server probes for this at
   startup and falls back to the OS temp dir; `TEMP_BASE` overrides it outright.

Without ptrace you get a backend that compiles and runs the submitted program
and returns its output, with `steps` empty and nothing drawn. That is a
run-only service, not a visualizer. **There is no instrumenter fallback any
more** — if a platform denies ptrace, the answer is a different platform, not a
different setting.

The repo has no `render.yaml` or `Procfile`; anything deployed to a dashboard-
configured PaaS has its build command, start command and env vars living
outside version control.

### Self-hosting with Docker (the supported path)

`server/docker-compose.yml` is the only invocation that sets every flag this
image needs — the `exec` tmpfs mounts above included:

```bash
cd server
docker compose up compiler
```

It applies `read_only`, `no-new-privileges`, the bundled seccomp profile,
`mem_limit`, `cpus` and `pids_limit`, and mounts `/tmp` and `/dev/shm` as
exec-capable tmpfs. Set `FRONTEND_URL` to your frontend origin before exposing
it. The equivalent raw `docker run` is in the comment at the end of
`server/Dockerfile` — note the seccomp path there is a **host** path, resolved
by the Docker CLI before the container exists.

The server compiles and runs arbitrary C++ submitted over HTTP, so these flags
are load-bearing rather than decorative. `prlimit` caps each program's CPU,
memory, file size and process count; the container flags bound everything
`prlimit` cannot. `/api/compile` is additionally rate-limited (20 req/min/IP by
default); tune with the `RATE_LIMIT_*` vars above.

**Known gaps in the bundled profile**, so you can decide rather than discover:
the seccomp profile permits `socket`/`connect`, so traced code can reach the
network — add `network_mode: none` to the compose service if that matters. It
also permits `ptrace` unconditionally, which GDB needs; on a host with
`kernel.yama.ptrace_scope=0` that also lets user code attach to the Node process,
since both run as the same uid. The `piston` profile in the compose file starts a
`privileged` container and is off by default; leave it off unless you have
isolated its network.

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
        ├── GraphView.tsx      # Memory / Linked List / General Graph: graph with arrows
        ├── TreeChart.tsx      # Tree: hierarchical bucket layout (N-ary)
        ├── CircularListView.tsx # Circular Linked List: polygon layout
        └── DoublyListView.tsx   # Doubly Linked List: forward/back arrows

server/
├── Dockerfile                # Docker image for deployment (Node.js + g++ + gdb + util-linux)
├── docker-compose.yml        # The supported invocation — applies every hardening flag
├── seccomp-profile.json      # Conservative syscall whitelist for `--security-opt seccomp=...`
└── src/
    ├── index.ts              # Express server with CORS + rate-limit
    ├── env.ts                # Strict parsing of numeric settings; throws at startup on a bad value
    ├── routes/compile.ts     # POST /api/compile endpoint
    └── services/
        ├── compiler.ts       # g++ compilation + prlimit wrapper (Linux)
        ├── childEnv.ts       # Env allowlist — user code never sees the server's own variables
        ├── tempBase.ts       # Picks an exec-capable directory for compiled binaries
        ├── gdbDriver.ts      # GDB MI driver: spawns GDB, steps line-by-line, captures snapshots, exec-wrapper rlimit
        └── gdbMapper.ts      # Converts GDB snapshots → TraceStep[] events (incl. STL containers)
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
| [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit) | MIT | Per-IP rate limiting for `/api` |
| [dotenv](https://github.com/motdotla/dotenv) | BSD-2-Clause | Loads `server/.env` into the environment |

### Toolchain

| Tool | License | Description |
|------|---------|-------------|
| [g++ (GCC)](https://gcc.gnu.org/) | GPL-3.0 | C++ compiler (runtime dependency, not bundled) |
| [GDB](https://www.sourceware.org/gdb/) | GPL-3.0 | GNU Debugger for line-by-line tracing (runtime dependency, not bundled) |

---

## License

MIT License - see [LICENSE](./LICENSE) for details.
