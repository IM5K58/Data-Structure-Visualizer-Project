[![Korean](https://img.shields.io/badge/Language-Korean-red?style=for-the-badge)](./README.kr.md)

# Data Structure Visualizer

A web application that visualizes data structures with real-time animations based on C++ code input. Unlike simple parsers, it features a **Virtual Execution Engine** that simulates code logic, supporting complex control flows and variables.

### 🌐 [Live Demo](https://data-structure-visualizer-project.vercel.app/)

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![Framer Motion](https://img.shields.io/badge/Framer_Motion-12-E91E8C?logo=framer&logoColor=white)

---

## Key Features

- **🚀 Virtual Execution Engine**: Simulates real C++ logic including variable assignments and math operations.
- **🔄 Control Flow Support**: Fully visualizes `for`, `while` loops and `if` conditional branches.
- **📦 Function Support**: Supports function definitions, recursive calls, and passing data structures by reference (`&`).
- **🎬 Step-by-Step Execution**: Supports Run / Pause / Step / Prev controls with precise state tracking.
- **📖 Intelligent Help System**: Features a multi-layered help modal with "Deep Dive" guides and a full **Detailed System Docs** page.
- **🌍 Multilingual Support**: Seamlessly switch between **English** and **Korean** for all instructions and documentation.
- **⚡ Adjustable Speed**: Playback speed control from 0.25x to 4x.
- **🎨 Premium Visuals**: Modern UI with Neon accents, Glassmorphism, and smooth Framer Motion animations.

---

## 🗂️ Supported Data Structures & Types

| Data Structure | Color | Operations |
|----------------|-------|------------|
| **Stack** | 🟣 Purple | `push()`, `pop()`, `top()`, `size()`, `empty()` |
| **Queue** | 🔵 Cyan | `push()`, `pop()`, `front()`, `size()`, `empty()` |
| **Tree (BST)** | 🔮 Indigo | `insert(val)`, `remove(val)` |
| **Array** | 🟢 Green | Declaration `int arr[N]`, Init `{...}`, `arr[i] = v` |
| **Linked List** | 🟠 Orange | `push_back()`, `push_front()`, `insert()`, `pop_back()`, `pop_front()`, `remove()` |

**Supported Value Types:** `int`, `double`, `string`, `bool`, `char`

---

## 🛠️ Advanced C++ Syntax Examples

### ✅ Control Flow & Binary Search Tree
```cpp
tree<int> t; // or bst<int> t;
int vals[7] = {20, 10, 30, 5, 15, 25, 35};

for(int i=0; i<7; i++) {
    t.insert(vals[i]);
}

t.remove(15);
```

### ✅ Recursion & Functions
```cpp
void fill(stack<int>& s, int n) {
    if (n <= 0) return;
    s.push(n);
    fill(s, n - 1);
}

int main() {
    stack<int> s;
    fill(s, 3);
}
```

### ✅ String & List Operations
```cpp
list<string> names;
string msg = "Hello";
names.push_back(msg);
names.push_back("World");
```

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

---

## ️📂 Project Structure

```
src/
├── types.ts                  # Common type definitions (Command, State, etc.)
├── App.tsx                   # Main layout (Resizable panels)
├── utils/
│   └── parser.ts             # Virtual Execution Engine (C++ Simlator)
├── hooks/
│   └── useVisualizer.ts      # State management using useReducer
└── components/
    ├── CodeInput.tsx         # Code editor area (with line numbers)
    ├── Controls.tsx          # Execution controls & Speed slider
    ├── Visualizer.tsx        # Visualizer router per data structure
    └── DataStructures/       # Visualization components
```

---

##  🎮 Usage

1. **Write Code**: Enter valid C++ code in the left panel. (Includes `int main()`, loops, functions)
2. **▶ Run**: Execute the entire simulation and collect animation steps.
3. **⏸ Pause**: pause execution. Press Run again to resume.
4. **⏮ Prev / Next ⏭**: Step through the execution steps.
5. **↺ Reset**: Clear all states and reset visualization.
6. **Speed**: Adjust animation speed (0.25x - 4x).

---

## 📄 License

MIT
