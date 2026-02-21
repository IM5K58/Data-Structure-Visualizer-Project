[![English](https://img.shields.io/badge/Language-English-blue?style=for-the-badge)](./README.md)

# 데이터 구조 시각화 도구 (Data Structure Visualizer)

사용자가 입력한 C++ 코드를 바탕으로 데이터 구조의 변화를 실시간 애니메이션으로 보여주는 웹 애플리케이션입니다. 단순한 텍스트 파싱을 넘어, **가상 실행 엔진(Virtual Execution Engine)**을 통해 복잡한 제어 흐름과 변수 연산을 시뮬레이션합니다.

### 🌐 [라이브 데모](https://data-structure-visualizer-d.vercel.app/)

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![Framer Motion](https://img.shields.io/badge/Framer_Motion-12-E91E8C?logo=framer&logoColor=white)

---

## 주요 기능

- **🚀 가상 실행 엔진**: 실제 C++ 로직을 시뮬레이션하여 변수 할당, 산술 연산 등을 정확하게 추적합니다.
- **🔄 제어 흐름 지원**: `for`, `while` 루프 및 `if` 조건문에 따른 애니메이션을 완벽하게 시각화합니다.
- **📦 함수 및 재귀 지원**: 사용자 정의 함수, 재귀 호출, 참조자(`&`)를 통한 데이터 구조 전달이 가능합니다.
- **🎬 단계별 실행 제어**: 실행(Run), 일시정지(Pause), 단계별 이동(Step), 이전 단계(Prev) 기능을 지원합니다.
- **⚡ 속도 조절**: 0.25배속부터 4배속까지 애니메이션 재생 속도를 실시간으로 조절할 수 있습니다.
- **🎨 부드러운 애니메이션**: Framer Motion을 활용한 직관적이고 부드러운 데이터 삽입/삭제 효과를 제공합니다.
- **🌙 다크 테마**: 네온 포인트와 글래스모피즘 디자인이 적용된 프리미엄 UI를 제공합니다.

---

## 🗂️ 지원되는 데이터 구조 및 타입

| 데이터 구조 | 색상 | 지원 연산 |
|----------------|-------|----------------------|
| **Stack** | 🟣 Purple | `push()`, `pop()`, `top()`, `size()`, `empty()` |
| **Queue** | 🔵 Cyan | `push()`, `pop()`, `front()`, `size()`, `empty()` |
| **Array** | 🟢 Green | 선언 `int arr[N]`, 초기화 `{...}`, 값 할당 `arr[i] = v` |
| **Linked List** | 🟠 Orange | `push_back()`, `push_front()`, `insert()`, `pop_back()`, `pop_front()`, `remove()` |

**지원되는 데이터 타입:** `int`, `double`, `string`, `bool`, `char`

---

## 🛠️ 고급 C++ 문법 예시

### ✅ 제어 흐름 및 변수 활용
```cpp
stack<int> s;
for (int i = 1; i <= 5; i++) {
    if (i % 2 == 0) {
        s.push(i * 10);
    }
}
```

### ✅ 함수 및 재귀 호출
```cpp
void fill(stack<int>& s, int n) {
    if (n <= 0) return;
    s.push(n);
    fill(s, n - 1);
}

int main() {
    stack<int> myStack;
    fill(myStack, 3);
}
```

### ✅ 다양한 타입 지원
```cpp
list<string> names;
string msg = "Hello";
names.push_back(msg);
names.push_back("World");
```

---

##  🚀 시작하기

### 사전 준비 사항

- **Node.js** 18 이상
- **npm** 9 이상

### 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```

브라우저에서 `http://localhost:5173` 접속 후 사용 가능합니다.

---

## ️📂 프로젝트 구조

```
src/
├── types.ts                  # 공통 타입 정의 (Command, State 등)
├── App.tsx                   # 메인 레이아웃 및 패널 리사이징
├── utils/
│   └── parser.ts             # 가상 실행 엔진 (C++ 시뮬레이터 핵심 로직)
├── hooks/
│   └── useVisualizer.ts      # useReducer를 활용한 상태 관리 및 애니메이션 제어
└── components/
    ├── CodeInput.tsx         # 코드 에디터 컴포넌트
    ├── Controls.tsx          # 실행 제어 및 속도 조절 바
    ├── Visualizer.tsx        # 데이터 구조별 시각화 라우터
    └── DataStructures/       # 각 데이터 구조별 렌더링 컴포넌트
```

---

##  🎮 사용 방법

1. **코드 입력**: 왼쪽 에디터에 C++ 코드를 입력합니다. (루프, 함수, `main()` 포함 가능)
2. **▶ 실행(Run)**: 전체 코드를 시뮬레이션하고 애니메이션 단계를 생성합니다.
3. **⏸ 일시정지(Pause)**: 실행을 멈춥니다. 다시 Run을 누르면 재개됩니다.
4. **⏮ 이전 / 다음 ⏭**: 한 단계씩 코드를 앞뒤로 실행하며 변화를 관찰합니다.
5. **↺ 리셋(Reset)**: 모든 상태를 초기화합니다.
6. **재생 속도**: 하단 슬라이더를 통해 애니메이션 속도를 조절합니다.

---

## 📄 라이선스

MIT
