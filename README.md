
[![Korean](https://img.shields.io/badge/Language-Korean-red?style=for-the-badge)](./README.kr.md)

# Data Structure Visualizer

A web application that visualizes data structures with real-time animations based on C++ code input.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![Framer Motion](https://img.shields.io/badge/Framer_Motion-12-E91E8C?logo=framer&logoColor=white)

---

## Key Features

- **🖥️ Code Parsing**: Automatically parses C++ data structure code and commands.
- **🎬 Step-by-Step Execution**: Supports Run / Pause / Step / Prev controls.
- **⚡ Adjustable Speed**: Playback speed control from 0.25x to 4x.
- **🎨 Smooth Animations**: Powered by Framer Motion for fluid data insertion/deletion effects.
- **📐 Resizable Panels**: Draggable boundary between the code editor and the visualizer.
- **🌙 Dark Theme**: Premium UI with Neon accents and Glassmorphism design.

---

## 🗂️ Supported Data Structures

| Data Structure | Color | Supported Operations |
|----------------|-------|----------------------|
| **Stack** | 🟣 Purple | `push()`, `pop()` |
| **Queue** | 🔵 Cyan | `push()`, `pop()` |
| **Array** | 🟢 Green | Declaration `int arr[N]`, Init `{...}`, Assignment `arr[i] = v` |
| **Linked List** | 🟠 Orange | `push_back()`, `push_front()`, `insert()`, `pop_back()`, `pop_front()`, `remove()` |

---

## 🛠️ Supported C++ Syntax

### ✅ Recognizable Patterns

```cpp
// Declarations
stack<int> s;
queue<int> q;
int arr[5] = {1, 2, 3, 4, 5};
list<int> ll;

// Stack Operations
s.push(10);
s.pop();

// Queue Operations
q.push(5);
q.pop();

// Array Operations
arr[2] = 42;

// Linked List Operations
ll.push_back(10);
ll.push_front(20);
ll.pop_back();
ll.pop_front();
ll.remove(10);
```

### 🚧Currently Unsupported (Planned)

- Variable references (e.g., int x = 5; s.push(x);)
- Control flow (for, while, if)
- Function definitions and calls
- Types other than int (e.g., string, double)

---

##  🚀 Getting Started

### Prerequisites

- **Node.js** 18 or higher
- **npm** 9 or higher

### Installation & Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open your browser and navigate to `http://localhost:5173`.

### Production Build

```bash
npm run build
npm run preview
```

---

## ️📂 Project Structure

```
src/
├── types.ts                  # Common type definitions (Command, State, etc.)
├── App.tsx                   # Main layout (Resizable panels)
├── utils/
│   └── parser.ts             # C++ Code → Command Parser
├── hooks/
│   └── useVisualizer.ts      # State management using useReducer
└── components/
    ├── CodeInput.tsx         # Code editor area (with line numbers)
    ├── Controls.tsx          # Run/Pause/Prev/Next/Reset + Speed controls
    ├── Visualizer.tsx        # Visualizer router per data structure
    └── DataStructures/
        ├── StackPlate.tsx    # Vertical Stack visualization
        ├── QueueBlock.tsx    # Horizontal Queue visualization
        ├── ArrayBlock.tsx    # Index-based Array visualization
        └── ListNode.tsx      # Linked List + SVG Arrows
```

---

## ️💻 Tech Stack

| Category | Technology | Purpose |
|----------|-----------|---------|
| Framework | React 19 | UI Components |
| Language | TypeScript 5.9 | Type Safety |
| Bundler | Vite 7 | Fast HMR & Build |
| Styling | Tailwind CSS 4 | Utility-first Styling |
| Animation | Framer Motion 12 | Transitions & Effects |

---

##  🎮 Usage

1. **Write Code**: Enter valid C++ data structure code in the right panel.
2. **▶ Run**: Automatically execute the entire code.
3. **⏸ Pause**: pause execution. Press Run again to resume.
4. **⏮ Prev / Next ⏭**: Step through the execution one line at a time.
5. **↺ Reset**: Clear all states and reset visualization.
6. **Speed**: Adjust animation speed (0.25x - 4x).

---

## 📄 License

MIT
