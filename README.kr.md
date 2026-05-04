[![English](https://img.shields.io/badge/Language-English-blue?style=for-the-badge)](./README.md)

# 자료구조 시각화 도구 (Data Structure Visualizer)

C++ 코드를 입력하면 **실제 g++ 컴파일러**로 컴파일 및 실행하고, **GDB MI**를 통해 런타임 메모리 연산을 추적하여 자료구조의 변화를 실시간 애니메이션으로 시각화하는 웹 애플리케이션입니다.

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

### 기본 경로: GDB MI 모드 (기본값)

```
C++ 코드  -->  g++ 컴파일  -->  GDB MI 세션  -->  라인별 스냅샷  -->  gdbMapper  -->  TraceStep[]  -->  시각화
               (-g -O0)        (--interpreter=mi2)  (지역변수 + 구조체 필드)  (ALLOC/SET_PTR/        (React + Framer Motion)
                                                                               SET_FIELD/LOCAL_VAR)
```

1. 사용자가 C++ 코드를 작성 (커스텀 struct / 포인터 포함)
2. 백엔드가 **디버그 심볼 포함**으로 컴파일 (`g++ -g -O0`)
3. **GDB**가 MI 모드로 바이너리를 한 줄씩 실행하며 지역변수와 struct 필드값을 매 단계마다 캡처
4. `gdbMapper`가 GDB 스냅샷을 `TraceStep[]` 이벤트로 변환 (ALLOC, SET_PTR, SET_FIELD, LOCAL_VAR)
5. **런타임 패턴 분석** 엔진이 실제 포인터 그래프를 구축하고, 그래프 토폴로지(분기도, 순환, 깊이)로 자료구조를 자동 감지
6. 프론트엔드에서 커맨드를 애니메이션으로 재생

### 폴백 경로: 계측기(Instrumenter) 모드 (`USE_GDB=false` 또는 GDB 미설치 시)

```
C++ 코드  -->  AI 분석  -->  계측기(Instrumenter)  -->  g++ 컴파일  -->  실행  -->  트레이스 출력  -->  런타임 분석  -->  시각화
               (Groq LLM)   (추적 함수 삽입)          (실제 바이너리)   (실행)   (__TRACE__ JSON)    (그래프 토폴로지)   (React + Framer Motion)
               struct 힌트 제공
```

1. **Groq AI** (선택 사항)가 struct 정의를 사전 분석하여 분류 힌트 제공
2. 백엔드 **계측기**가 AI 힌트를 활용해 추적 함수를 자동 삽입 (`__vt::alloc`, `__vt::set_ptr` 등)
3. **g++** (C++17)로 컴파일 및 실행
4. 런타임 트레이스 출력을 단계별 커맨드로 파싱

---

## 주요 기능

- **실제 C++ 실행**: g++ 백엔드를 통해 실제 C++ 코드를 컴파일하고 실행합니다. 시뮬레이션이나 의사코드 파싱이 아닙니다.
- **GDB 기반 추적**: GDB Machine Interface(MI)로 코드를 한 줄씩 스텝하며 정확한 메모리 상태를 캡처합니다. 소스 코드 변환이 필요 없습니다.
- **AI 보조 분류** (폴백 모드): 선택 사항인 Groq AI (무료 플랜)가 struct 정의를 사전 분석하여 비표준 필드명 등 애매한 패턴을 처리합니다.
- **스마트 자동 감지**: 3단계 감지 시스템:
  - **AI 분석**: Groq LLM이 계측 전 struct 타입 분류 (`GROQ_API_KEY` 설정 시, 폴백 모드 전용)
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
| **Stack** | Purple | `push()` + `pop()` 메서드, 또는 `std::stack`/`vector` | 수직 플레이트 적층, TOP 표시 |
| **Queue** | Cyan | `enqueue()` + `dequeue()` 메서드, 또는 `std::queue`/`deque`/`priority_queue` | 수평 컨베이어 벨트, FRONT/BACK 라벨 |
| **Tree (BST / N-ary)** | Green | 자기 타입 포인터 2+개 또는 런타임 분기 패턴 (parent 포인터 허용) | 계층 버킷 레이아웃, ROOT 뱃지, 드래그 패닝 |
| **Linked List** | Purple | 자기 타입 포인터 1개, 선형 체인 | 화살표 연결 그래프 뷰 |
| **이중 연결 리스트(Doubly LL)** | Cyan / Amber | `next`/`prev` 양방향 페어를 가진 선형 체인 | 수평 체인 — solid cyan `next` + dashed amber `prev` |
| **원형 연결 리스트** | Amber | 런타임 사이클 감지 (출차수 1 + 루프) | 다각형 배치, HEAD 뱃지, amber 점선 cycle-back 엣지 |
| **일반 그래프(General Graph)** | Rose | back-edge 제거 후에도 분기+사이클이 남는 경우 | 모든 엣지가 표시되는 그래프 뷰 |
| **Memory (Heap)** | Purple | 포인터 구조 폴백 | 메모리 주소 기반 그래프 뷰 |

### 스마트 감지 파이프라인

```
정적 힌트 (컴파일 타임)                런타임 분석 (실행 후, GDB 모드)
push/pop 메서드   → Stack             (이미 분류됨)
enqueue/dequeue   → Queue             (이미 분류됨)
std::stack/vector              → Stack (계측기 + GDB 양쪽)
std::queue/deque/priority_queue → Queue
                                       ┌─ 한 필드의 양방향 페어를 제거 ─┐
                                       │  (= back-edge / prev / parent) │
                                       └────────────────┬──────────────┘
                                                        ▼
                                  primary 그래프 사이클 + 분기              → Graph
                                  primary 그래프 사이클 + 출차수 ≤ 1        → 원형 연결 리스트
                                  primary 그래프 비순환 + 분기              → Tree
                                  primary 그래프 비순환 + back-edge 존재    → Doubly Linked List
                                  primary 그래프 비순환 + 단순 체인         → Linked List
```

**필드명 무관**: `left/right`, `a/b`, `child1/child2`, `ptr1/ptr2`, `next/prev`, `child/parent` — 실제 런타임 포인터 토폴로지에서 구조를 감지합니다.

**지원 C++ 패턴**: `struct`, `class`, `private`/`public`/`protected`, `friend class`, 생성자 초기화 리스트, `const`/`static` 한정자, 배열 필드, 다중 변수 선언, `delete[]`.

**지원 값 타입**: `int`, `double`, `string`, `bool`, `char`

**지원 STL 컨테이너** (GDB / 계측기 양쪽 모드):
`std::stack`, `std::queue`, `std::priority_queue`, `std::vector`, `std::deque`. GDB 모드는 매 스냅샷마다 `.size()` / `.top()` / `.back()`을 평가해 PUSH / POP 커맨드를 합성하고, 계측기 모드는 `push`/`push_back`/`push_front`/`enqueue` 및 `pop`/`pop_back`/`pop_front`/`dequeue` 호출을 트레이스 이벤트로 재작성합니다.

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

### 이중 연결 리스트 (Doubly Linked List)

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

## 시작하기

### 사전 준비

- **Node.js** 18+
- **npm** 9+
- **g++** (Windows: MSYS2, Linux/Mac: 시스템 g++)
- **GDB** (Windows MSYS2: `pacman -S mingw-w64-ucrt-x86_64-gdb`, Linux: `apt install gdb`, Mac: `brew install gdb`)

> GDB는 기본 실행 모드에 필요합니다. GDB가 설치되어 있지 않으면 서버가 자동으로 계측기(Instrumenter) 모드로 폴백합니다.

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
| `GDB_PATH` | 자동 감지 | GDB 디버거 경로 |
| `USE_GDB` | `true` | `false`로 설정하면 계측기 모드 강제 사용 |
| `FRONTEND_URL` | — | 프로덕션 CORS 허용 도메인 |
| `GROQ_API_KEY` | — | Groq AI struct 분류용 API 키 (선택, 폴백 모드 전용) |
| `RATE_LIMIT_COMPILE` | `20` | IP당 분당 컴파일 요청 수 |
| `RATE_LIMIT_GENERAL` | `120` | IP당 분당 일반 `/api` 요청 수 |
| `RATE_LIMIT_WINDOW_MS` | `60000` | 레이트 리밋 윈도(밀리초) |
| `TRUST_PROXY` | — | 로드밸런서 뒤에 있을 때 실제 클라이언트 IP를 추출하기 위한 Express trust-proxy 값 (`1` 또는 CIDR 리스트) |
| `RLIMIT_CPU_SEC` | `8` | 프로그램당 CPU 시간 한도(초) — Linux에서 `prlimit`로 적용 |
| `RLIMIT_AS_BYTES` | `268435456` | 프로그램당 가상 메모리 한도 (기본 256 MiB) |
| `RLIMIT_STACK_BYTES` | `16777216` | 프로그램당 스택 한도 (기본 16 MiB) |
| `RLIMIT_FSIZE_BYTES` | `8388608` | 프로그램이 쓸 수 있는 파일 최대 크기 (8 MiB) |
| `RLIMIT_NOFILE` | `64` | 최대 열린 파일 디스크립터 수 |
| `RLIMIT_NPROC` | `64` | 최대 사용자 프로세스 수 |
| `PRLIMIT_PATH` | `/usr/bin/prlimit` | `prlimit` 경로. 미존재 시 경고 후 리소스 제한 비활성화 |
| `DISABLE_RLIMIT` | — | `true`로 설정하면 prlimit이 있어도 리소스 제한을 끔 |

---

## 배포

### 프론트엔드 (Vercel - 무료)

1. GitHub 레포를 [Vercel](https://vercel.com)에 연결
2. `VITE_COMPILER_API_URL`에 백엔드 URL 설정
3. 배포

### 백엔드 (Render.com - 무료, Docker)

1. GitHub 레포를 [Render](https://render.com)에 연결
2. Root directory를 `server`, Runtime을 Docker로 설정
3. 환경변수 설정: `GPP_PATH=/usr/bin/g++`, `USE_GDB=false` (Render는 ptrace 미허용), `FRONTEND_URL=https://your-app.vercel.app`, `GROQ_API_KEY=gsk_...` (선택)
4. 배포

> ptrace를 제한하는 클라우드 환경(예: Render 무료 플랜)에서는 `USE_GDB=false`로 설정하여 계측기 모드를 사용하세요.

### 보안 강화 (공개 배포 시 필수)

서버는 HTTP로 전송된 임의의 C++ 코드를 컴파일/실행합니다. 내장된 리소스 리밋(`prlimit`)과 컨테이너 격리 옵션을 함께 적용하세요:

```bash
docker run \
  --read-only \
  --tmpfs /tmp:exec --tmpfs /dev/shm:exec \
  --memory=512m --cpus=1 --pids-limit=128 \
  --security-opt=no-new-privileges \
  --security-opt seccomp=server/seccomp-profile.json \
  -p 3001:3001 server-image
```

보수적인 seccomp 프로파일이 `server/seccomp-profile.json`에 포함되어 있습니다. Express 서버 자체도 `/api/compile`에 레이트 리밋(기본 20 req/min/IP)을 적용하며, 위 표의 `RATE_LIMIT_*` 환경변수로 조정할 수 있습니다.

---

## 프로젝트 구조

```
src/
├── types.ts                  # 타입 정의 (Command, State 등)
├── App.tsx                   # 메인 레이아웃 (리사이즈 패널)
├── api/
│   └── compilerApi.ts        # 프론트엔드 -> 백엔드 API 클라이언트
├── engine/
│   └── stepMapper.ts         # TraceStep[] -> 커맨드 변환 + 런타임 패턴 분석
├── hooks/
│   └── useVisualizer.ts      # 상태 관리 (useReducer)
├── utils/
│   └── ids.ts                # ID 생성 유틸리티
└── components/
    ├── CodeInput.tsx          # Monaco C++ 에디터 (자동완성)
    ├── Controls.tsx           # 실행 컨트롤 & 속도 슬라이더
    ├── Terminal.tsx           # 출력 / 입력 / 커맨드 로그 탭
    ├── Visualizer.tsx         # 자료구조별 시각화 라우터
    └── DataStructures/
        ├── StackPlate.tsx     # Stack: 수직 플레이트 적층
        ├── QueueBlock.tsx     # Queue: 수평 컨베이어 벨트
        ├── GraphView.tsx      # Memory / Linked List / 일반 그래프: 화살표 그래프
        ├── TreeChart.tsx      # Tree: 계층 버킷 레이아웃 (N-ary)
        ├── CircularListView.tsx # 원형 연결 리스트: 다각형 레이아웃
        └── DoublyListView.tsx   # 이중 연결 리스트: forward/back 화살표

server/
├── Dockerfile                # 배포용 Docker 이미지 (Node.js + g++ + util-linux)
├── seccomp-profile.json      # `--security-opt seccomp=...` 용 syscall 화이트리스트
├── src/
│   ├── index.ts              # Express 서버 (CORS + 레이트 리밋)
│   ├── routes/compile.ts     # POST /api/compile 엔드포인트 (GDB 또는 계측기)
│   └── services/
│       ├── compiler.ts       # g++ 컴파일 + Linux용 prlimit 래퍼
│       ├── gdbDriver.ts      # GDB MI 드라이버: 스폰/라인 스텝/스냅샷 + exec-wrapper rlimit
│       ├── gdbMapper.ts      # GDB 스냅샷 → TraceStep[] (STL 컨테이너 포함)
│       ├── instrumenter.ts   # C++ 코드 계측 (폴백 모드)
│       └── codeAnalyzer.ts   # Groq AI struct 분류기 (폴백 모드, 선택)
└── sandbox/
    └── __tracer.h            # C++ 트레이싱 헤더 (계측기 모드에서 주입)
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
| [GDB](https://www.sourceware.org/gdb/) | GPL-3.0 | 라인별 추적용 GNU 디버거 (런타임 의존성, 번들에 미포함) |

---

## 라이선스

MIT License - 자세한 내용은 [LICENSE](./LICENSE) 참조.
