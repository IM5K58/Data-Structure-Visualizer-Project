
[![English](https://img.shields.io/badge/Language-English-blue?style=for-the-badge)](./README.md)

# 📊 Data Structure Visualizer

C++ 코드를 입력하면 **Stack, Queue, Array, Linked List** 자료구조를 실시간 애니메이션으로 시각화하는 웹 애플리케이션입니다.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![Framer Motion](https://img.shields.io/badge/Framer_Motion-12-E91E8C?logo=framer&logoColor=white)

---

## ✨ 주요 기능

- **🖥️ 코드 입력**: C++ 자료구조 코드를 직접 작성하면 자동으로 명령어를 파싱
- **🎬 단계별 실행**: Run(전체 실행) / Pause(일시정지) / Step(한 단계씩) / Prev(이전 단계) 지원
- **⚡ 속도 조절**: 0.25x ~ 4x 속도로 애니메이션 재생 가능
- **🎨 Framer Motion 애니메이션**: 데이터 추가/삭제 시 부드러운 spring 기반 전환 효과
- **📐 리사이즈 가능한 패널**: 코드 패널과 시각화 패널 경계를 드래그하여 자유롭게 조절
- **🌙 다크 테마**: 네온 액센트 + Glassmorphism 기반 프리미엄 UI

---

## 🗂️ 지원 자료구조

| 자료구조 | 색상 | 지원 연산 |
|----------|------|-----------|
| **Stack** | 🟣 Purple | `push()`, `pop()` |
| **Queue** | 🔵 Cyan | `push()`, `pop()` |
| **Array** | 🟢 Green | 선언 `int arr[N]`, 초기화 `{...}`, 인덱스 대입 `arr[i] = v` |
| **Linked List** | 🟠 Orange | `push_back()`, `push_front()`, `insert()`, `pop_back()`, `pop_front()`, `remove()` |

---

## 📝 지원 C++ 문법

### ✅ 인식 가능한 패턴

```cpp
// 선언
stack<int> s;
queue<int> q;
int arr[5] = {1, 2, 3, 4, 5};
list<int> ll;

// Stack 조작
s.push(10);
s.pop();

// Queue 조작
q.push(5);
q.pop();

// Array 조작
arr[2] = 42;

// Linked List 조작
ll.push_back(10);
ll.push_front(20);
ll.pop_back();
ll.pop_front();
ll.remove(10);
```

### ❌ 미지원 (향후 확장 예정)

- 변수 참조 (`int x = 5; s.push(x);`)
- 제어 흐름 (`for`, `while`, `if`)
- 함수 정의 및 호출
- `int` 이외의 타입 (`string`, `double` 등)

---

## 🚀 시작하기

### 사전 요구사항

- **Node.js** 18 이상
- **npm** 9 이상

### 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```

브라우저에서 `http://localhost:5173`으로 접속합니다.

### 프로덕션 빌드

```bash
npm run build
npm run preview
```

---

## 🏗️ 프로젝트 구조

```
src/
├── types.ts                              # 공통 타입 정의 (Command, State 등)
├── App.tsx                               # 메인 레이아웃 (리사이즈 가능한 패널)
├── utils/
│   └── parser.ts                         # C++ 코드 → Command 파서
├── hooks/
│   └── useVisualizer.ts                  # useReducer 기반 상태 관리
└── components/
    ├── CodeInput.tsx                     # 코드 입력 영역 (라인 넘버 포함)
    ├── Controls.tsx                      # Run/Pause/Prev/Next/Reset + 속도 조절
    ├── Visualizer.tsx                    # 자료구조별 시각화 라우터
    └── DataStructures/
        ├── StackPlate.tsx                # 수직 스택 시각화
        ├── QueueBlock.tsx                # 수평 큐 시각화
        ├── ArrayBlock.tsx                # 인덱스 배열 시각화
        └── ListNode.tsx                  # 연결 리스트 + SVG 화살표
```

---

## 🛠️ 기술 스택

| Category | Technology | Purpose |
|----------|-----------|---------|
| Framework | React 19 | UI 컴포넌트 |
| Language | TypeScript 5.9 | 타입 안정성 |
| Bundler | Vite 7 | 빠른 HMR 및 빌드 |
| Styling | Tailwind CSS 4 | 유틸리티 기반 스타일링 |
| Animation | Framer Motion 12 | 자료구조 전환 애니메이션 |

---

## 🎮 사용법

1. **코드 작성**: 오른쪽 패널에 C++ 자료구조 코드를 입력합니다.
2. **▶ Run**: 전체 코드를 자동으로 실행합니다.
3. **⏸ Pause**: 실행 중 일시정지합니다. 다시 Run을 누르면 이어서 재개됩니다.
4. **⏮ Prev / Next ⏭**: 한 단계씩 앞뒤로 이동합니다.
5. **↺ Reset**: 모든 상태를 초기화합니다.
6. **Speed**: 0.25x ~ 4x로 애니메이션 속도를 조절합니다.

---

## 📄 License

MIT
