[![English](https://img.shields.io/badge/Language-English-blue?style=for-the-badge)](./README.md)

# 자료구조 시각화 도구 (Data Structure Visualizer)

C++ 코드를 입력하면 **실제 g++ 컴파일러**로 컴파일 및 실행하고, 런타임 메모리 연산을 추적하여 자료구조의 변화를 실시간 애니메이션으로 시각화하는 웹 애플리케이션입니다.

### [Live Demo](https://data-structure-visualizer-project.vercel.app/)

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![Framer Motion](https://img.shields.io/badge/Framer_Motion-12-E91E8C?logo=framer&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=nodedotjs&logoColor=white)

---

## 동작 원리

```
C++ 코드  -->  AI 분석  -->  계측기(Instrumenter)  -->  g++ 컴파일  -->  실행  -->  트레이스 출력  -->  런타임 분석  -->  시각화
               (Groq LLM)   (추적 함수 삽입)          (실제 바이너리)   (실행)   (__TRACE__ JSON)    (그래프 토폴로지)   (React + Framer Motion)
               struct 힌트 제공
```

1. 사용자가 C++ 코드를 작성 (커스텀 struct / 포인터 포함)
2. **Groq AI** (선택 사항)가 struct 정의를 사전 분석하여 분류 힌트 제공
3. 백엔드 **계측기**가 AI 힌트를 활용해 추적 함수를 자동 삽입 (`__vt::alloc`, `__vt::set_ptr` 등)
4. **g++** (C++17)로 컴파일 및 실행
5. 런타임 트레이스 출력을 단계별 커맨드로 파싱
6. **런타임 패턴 분석** 엔진이 실제 포인터 그래프를 구축하고, 그래프 토폴로지(분기도, 순환, 깊이)를 분석하여 자료구조를 자동 감지
7. 프론트엔드에서 커맨드를 애니메이션으로 재생

---

## 주요 기능

- **실제 C++ 실행**: g++ 백엔드를 통해 실제 C++ 코드를 컴파일하고 실행합니다. 시뮬레이션이나 의사코드 파싱이 아닙니다.
- **AI 보조 분류**: 선택 사항인 Groq AI (무료 플랜)가 struct 정의를 사전 분석하여 비표준 필드명 등 애매한 패턴을 처리합니다. 키 미설정 시 regex로 자동 폴백.
- **스마트 자동 감지**: 3단계 감지 시스템:
  - **AI 분석**: Groq LLM이 계측 전 struct 타입 분류 (`GROQ_API_KEY` 설정 시)
  - **정적 분석**: 메서드명 (`push`/`pop` = Stack) 및 자기 타입 포인터 수 (2+ = Tree, 1 = Linked List)
  - **런타임 분석**: 실행 트레이스에서 실제 포인터 그래프를 구축하고, 그래프 속성(분기, 순환, 깊이)으로 재분류
- **메모리 그래프 시각화**: 포인터(`->`), 할당(`new`), 해제(`delete`)를 추적하여 메모리 관계를 그래프로 표현
- **단계별 실행**: Run / Pause / Step / Prev 컨트롤로 정밀한 상태 추적
- **속도 조절**: 0.25x ~ 4x 재생 속도
- **리사이즈 패널**: 에디터, 시각화, 터미널 패널 크기 조절 가능
- **인터랙티브 뷰**: 드래그로 패닝, Ctrl+스크롤로 확대/축소
- **C++ 자동완성**: C++ 키워드, 타입, STL 컨테이너에 대한 IDE 스타일 코드 완성
- **터미널 출력**: `cout` 실시간 출력 및 `cin` 입력 지원

---

## 지원 자료구조

| 자료구조 | 색상 | 감지 방식 | 시각화 |
|----------|------|-----------|--------|
| **Stack** | Purple | `push()` + `pop()` 메서드 | 수직 플레이트 적층, TOP 표시 |
| **Queue** | Cyan | `enqueue()` + `dequeue()` 메서드 | 수평 컨베이어 벨트, FRONT/BACK 라벨 |
| **Tree (BST / N-ary)** | Green | 자기 타입 포인터 2+개 또는 런타임 분기 패턴 | 계층 버킷 레이아웃, ROOT 뱃지, 드래그 패닝 |
| **Linked List** | Purple | 자기 타입 포인터 1개, 선형 체인 | 화살표 연결 그래프 뷰 |
| **원형 연결 리스트** | Amber | 런타임 사이클 감지 (출차수 1 + 루프) | 다각형 배치, HEAD 뱃지, amber 점선 cycle-back 엣지 |
| **Memory (Heap)** | Purple | 포인터 구조 폴백 | 메모리 주소 기반 그래프 뷰 |

### 스마트 감지 파이프라인

```
AI 힌트 (컴파일 전, 선택)            정적 힌트 (컴파일 타임)              런타임 분석 (실행 후)
  Groq LLM이 struct 분류         →   push/pop 메서드  → Stack            (이미 분류됨)
  (신뢰도 ≥ 0.7 시 적용)              enqueue/dequeue  → Queue            (이미 분류됨)
  null이면 정적 분석으로 폴백          자기포인터 2+개  → Tree 힌트        → 검증: 분기 + 비순환 + depth > 1 → Tree
                                       자기포인터 1개   → Node 힌트        → 검증: 선형 체인 → Linked List
                                       힌트 없음        → Memory           → 사이클 감지 → 원형 연결 리스트
```

**필드명 무관**: `left/right`, `a/b`, `child1/child2`, `ptr1/ptr2` — 실제 런타임 포인터 토폴로지에서 구조를 감지합니다. `p1`/`p2` 같은 비표준 필드명은 AI 레이어가 판별합니다.

**지원 C++ 패턴**: `struct`, `class`, `private`/`public`/`protected`, `friend class`, 생성자 초기화 리스트, `const`/`static` 한정자, 배열 필드, 다중 변수 선언, `delete[]`.

**지원 값 타입**: `int`, `double`, `string`, `bool`, `char`

---

## 테스트 코드 예시

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

### Queue (링크드 리스트 기반)

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

### Tree (커스텀 필드명)

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

    // 중간 노드 삭제
    Node* temp = head->next;
    head->next = temp->next;
    delete temp;

    return 0;
}
```

### 원형 연결 리스트

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
    head->next->next->next = head; // head로 다시 연결 (사이클)
    return 0;
}
```

---

## 시작하기

### 사전 준비

- **Node.js** 18+
- **npm** 9+
- **g++** (Windows: MSYS2, Linux/Mac: 시스템 g++)

### 설치 및 실행

```bash
# 프론트엔드
npm install
npm run dev

# 백엔드 (별도 터미널)
cd server
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 접속.

### 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `VITE_COMPILER_API_URL` | `http://localhost:3001` | 백엔드 API URL (프론트엔드) |
| `PORT` | `3001` | 서버 포트 (백엔드) |
| `GPP_PATH` | 자동 감지 | g++ 컴파일러 경로 |
| `FRONTEND_URL` | — | 프로덕션 CORS 허용 도메인 |
| `GROQ_API_KEY` | — | Groq AI struct 분류용 API 키 (선택, 무료 플랜) |

---

## 배포

### 프론트엔드 (Vercel - 무료)

1. GitHub 레포를 [Vercel](https://vercel.com)에 연결
2. `VITE_COMPILER_API_URL`에 백엔드 URL 설정
3. 배포

### 백엔드 (Render.com - 무료, Docker)

1. GitHub 레포를 [Render](https://render.com)에 연결
2. Root directory를 `server`, Runtime을 Docker로 설정
3. 환경변수 설정: `GPP_PATH=/usr/bin/g++`, `FRONTEND_URL=https://your-app.vercel.app`, `GROQ_API_KEY=gsk_...` (선택)
4. 배포

---

## 프로젝트 구조

```
src/
├── types.ts                  # 타입 정의 (Command, State 등)
├── App.tsx                   # 메인 레이아웃 (리사이즈 패널)
├── api/
│   └── compilerApi.ts        # 프론트엔드 -> 백엔드 API 클라이언트
├── engine/
│   └── stepMapper.ts         # 트레이스 -> 커맨드 변환 + 런타임 패턴 분석
├── hooks/
│   └── useVisualizer.ts      # 상태 관리 (useReducer)
├── utils/
│   └── ids.ts                # ID 생성 유틸리티
└── components/
    ├── CodeInput.tsx          # Monaco C++ 에디터 (자동완성)
    ├── Controls.tsx           # 실행 컨트롤 & 속도 슬라이더
    ├── Terminal.tsx            # 출력 / 입력 / 커맨드 로그 탭
    ├── Visualizer.tsx         # 자료구조별 시각화 라우터
    └── DataStructures/
        ├── StackPlate.tsx     # Stack: 수직 플레이트 적층
        ├── QueueBlock.tsx     # Queue: 수평 컨베이어 벨트
        ├── GraphView.tsx      # Memory / Linked List: 화살표 그래프
        ├── TreeChart.tsx      # Tree: 계층 버킷 레이아웃 (N-ary)
        └── CircularListView.tsx # 원형 연결 리스트: 다각형 레이아웃

server/
├── Dockerfile                # 배포용 Docker 이미지 (Node.js + g++)
├── src/
│   ├── index.ts              # Express 서버 (CORS)
│   ├── routes/compile.ts     # POST /api/compile 엔드포인트
│   └── services/
│       ├── compiler.ts       # g++ 컴파일 & 실행 (PCH 최적화)
│       ├── instrumenter.ts   # C++ 코드 계측 & 구조 감지
│       └── codeAnalyzer.ts   # Groq AI struct 분류기 (선택)
└── sandbox/
    └── __tracer.h            # C++ 트레이싱 헤더 (컴파일 시 주입)
```

---

## 오픈소스 라이선스

이 프로젝트는 다음 오픈소스 라이브러리를 사용합니다:

### 프론트엔드

| 라이브러리 | 라이선스 | 설명 |
|-----------|---------|------|
| [React](https://react.dev/) | MIT | UI 컴포넌트 라이브러리 |
| [React DOM](https://react.dev/) | MIT | 웹용 React 렌더러 |
| [TypeScript](https://www.typescriptlang.org/) | Apache-2.0 | JavaScript의 타입 확장 |
| [Vite](https://vite.dev/) | MIT | 차세대 프론트엔드 빌드 도구 |
| [Tailwind CSS](https://tailwindcss.com/) | MIT | 유틸리티 우선 CSS 프레임워크 |
| [Framer Motion](https://www.framer.com/motion/) | MIT | React 애니메이션 라이브러리 |
| [Monaco Editor (React)](https://github.com/suren-atoyan/monaco-react) | MIT | VS Code 에디터 React 컴포넌트 |
| [ESLint](https://eslint.org/) | MIT | JavaScript/TypeScript 린터 |

### 백엔드

| 라이브러리 | 라이선스 | 설명 |
|-----------|---------|------|
| [Express](https://expressjs.com/) | MIT | Node.js 웹 프레임워크 |
| [CORS](https://github.com/expressjs/cors) | MIT | Cross-Origin Resource Sharing 미들웨어 |
| [Node.js](https://nodejs.org/) | MIT | JavaScript 런타임 |
| [tsx](https://github.com/privatenumber/tsx) | MIT | Node.js용 TypeScript 실행기 |
| [groq-sdk](https://github.com/groq/groq-typescript) | Apache-2.0 | AI struct 분류용 Groq API 클라이언트 (선택) |

### 도구

| 도구 | 라이선스 | 설명 |
|------|---------|------|
| [g++ (GCC)](https://gcc.gnu.org/) | GPL-3.0 | C++ 컴파일러 (런타임 의존성, 번들에 미포함) |

---

## 라이선스

MIT License - 자세한 내용은 [LICENSE](./LICENSE) 참조.
