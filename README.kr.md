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

### GDB 없이 실행 (`USE_GDB=false` 또는 GDB 미설치 시)

두 번째 추적 경로는 없습니다. 프로그램을 컴파일해 실행하고 그 출력만 돌려줍니다. `steps`는 비어 있고 시각화는 아무것도 그리지 않으며, 응답의 `notice`가 그 사실을 알립니다.

예전에는 사용자 소스에 추적 함수를 주입하는 계측기(instrumenter) 폴백이 있었습니다. 혼자서는 멀쩡히 컴파일되는 프로그램에 대해 **컴파일되지 않는 C++를 뱉는** 일이 있어 제거했습니다.

---

## 주요 기능

- **실제 C++ 실행**: g++ 백엔드를 통해 실제 C++ 코드를 컴파일하고 실행합니다. 시뮬레이션이나 의사코드 파싱이 아닙니다.
- **GDB 기반 추적**: GDB Machine Interface(MI)로 코드를 한 줄씩 스텝하며 정확한 메모리 상태를 캡처합니다. 소스 코드 변환이 필요 없습니다.
- **스마트 자동 감지**: 2단계 감지 시스템:
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
std::stack/vector               → Stack
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

**지원 STL 컨테이너**:
`std::stack`, `std::queue`, `std::priority_queue`, `std::vector`, `std::deque`. 매 스냅샷마다 `.size()` / `.top()` / `.back()`을 평가하고 그 차이에서 PUSH / POP 커맨드를 합성합니다.

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

- **Node.js** 22 (`.nvmrc`에 고정된 버전이며 CI도 이걸 씁니다)
- **npm** 9+
- **g++** (Windows: MSYS2, Linux/Mac: 시스템 g++)
- **GDB** (Windows MSYS2: `pacman -S mingw-w64-ucrt-x86_64-gdb`, Linux: `apt install gdb`, Mac: `brew install gdb`)

> **GDB는 필수입니다.** 트레이스를 만드는 건 GDB뿐이라, 없으면 시각화할 것 자체가 없습니다. GDB가 없어도 서버는 프로그램을 컴파일해 실행하고 출력을 돌려주지만 `steps`는 빈 배열이고 화면에는 아무것도 그려지지 않습니다. **폴백 추적 경로는 더 이상 없습니다** — 계측기는 제거됐습니다.

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

> **숫자 값은 기동 시점에 검증됩니다.** 순수한 양의 정수가 아니면(`256M`, `8s`, `-1`, `1e6`) 예외를 던지고 서버가 뜨지 않습니다. 바이트 수는 전부 풀어 쓰세요 — `RLIMIT_AS_BYTES=268435456`, `256M`은 안 됩니다. 값을 비우거나 지정하지 않으면 기본값을 씁니다. 이건 의도된 동작입니다: 예전 파서는 `256M`을 `256`으로 읽었고, 그 결과 모든 추적 대상이 주소공간 256**바이트**로 즉사한 뒤 엉뚱한 GDB 오류로 보고됐습니다.

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `VITE_COMPILER_API_URL` | `http://localhost:3001` | 백엔드 API URL (프론트엔드) |
| `PORT` | `3001` | 서버 포트 (백엔드) |
| `GPP_PATH` | 자동 감지 | g++ 컴파일러 경로 |
| `GDB_PATH` | 자동 감지 | GDB 디버거 경로 |
| `USE_GDB` | `true` | `false`면 **추적 없이** 실행 — 출력만 나오고 `steps`는 빈 배열이라 아무것도 그려지지 않습니다 |
| `TEMP_BASE` | 자동 탐지 | 컴파일된 바이너리를 쓰고 실행할 디렉터리. `/dev/shm`이 exec 가능하면 그걸, 아니면 OS 임시 디렉터리를 씁니다 |
| `FRONTEND_URL` | — | 프로덕션 CORS 허용 도메인 |
| `MAX_STDIN_BYTES` | `65536` | 요청당 stdin 최대 크기 |
| `MAX_OUTPUT_BYTES` | `1048576` | 캡처하는 프로그램 출력 상한 |
| `GDB_SESSION_BUDGET_MS` | `45000` | 추적 세션 하나의 벽시계 예산 |
| `COMPILE_TIMEOUT_MS` | `15000` | 디버그 빌드가 강제 종료되기까지의 시간 |
| `MAX_CONCURRENT_JOBS` | `2` | 동시에 도는 컴파일+추적 작업 수. 각각이 컴파일러 + GDB + 추적 대상 프로그램입니다 |
| `MAX_QUEUED_JOBS` | `8` | 슬롯을 기다릴 수 있는 작업 수. 넘으면 어차피 타임아웃 날 줄에 세우는 대신 503으로 즉시 거절합니다 |
| `QUEUE_WAIT_MS` | `20000` | 대기 중인 작업이 포기하기까지의 시간 |
| `PISTON_URL` | — | 로컬 g++ 대신 [Piston](https://github.com/engineer-man/piston) 서버에 실행 위임. 이 경로에는 추적이 없습니다 |
| `VERBOSE_STEP_LOG` | — | `true`면 생성된 추적 스텝을 전부 로깅 |
| `VERBOSE_MI_LOG` | — | `true`면 GDB/MI 전 라인 출력. 매우 시끄럽고 사용자 소스와 변수 값이 로그에 남습니다 |
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
| `PRLIMIT_PATH` | `/usr/bin/prlimit` | `prlimit` 경로. 리눅스에서 없으면 서버가 **기동을 거부합니다** — `util-linux`를 설치하거나, 경로를 고치거나, `DISABLE_RLIMIT=true`로 의도적으로 우회하세요 |
| `DISABLE_RLIMIT` | — | `true`면 사용자 코드에 **CPU·메모리·파일크기·프로세스 수 제한이 전혀 없는** 상태로 기동합니다. cgroup이나 VM으로 이미 갇힌 호스트를 위한 탈출구이고, 그 밖에서는 이 서비스를 무제한 원격 실행 엔드포인트로 만듭니다 |

---

## 배포

### 프론트엔드 (Vercel - 무료)

1. GitHub 레포를 [Vercel](https://vercel.com)에 연결
2. `VITE_COMPILER_API_URL`에 백엔드 URL 설정
3. 배포

### 백엔드

백엔드는 관리형 PaaS가 잘 내주지 않는 두 가지를 필요로 합니다.

1. **ptrace.** 트레이스를 만드는 건 GDB뿐입니다.
2. **exec 가능한 임시 디렉터리.** 컴파일된 바이너리를 쓰고 나서 실행해야 하는데, Docker는 `/dev/shm`을 기본적으로 `noexec`로 마운트합니다. 그러면 쓰기는 성공하고 실행에서 막힙니다. 서버가 기동 시 이걸 탐지해 OS 임시 디렉터리로 물러나며, `TEMP_BASE`로 직접 지정할 수도 있습니다.

ptrace가 없으면 프로그램을 컴파일·실행해 출력만 돌려주는 서버가 됩니다. `steps`는 비어 있고 화면에는 아무것도 안 그려집니다. 시각화 도구가 아니라 실행기입니다. **계측기 폴백은 더 이상 없습니다** — 어떤 플랫폼이 ptrace를 막는다면 답은 다른 설정이 아니라 다른 플랫폼입니다.

이 저장소에는 `render.yaml`도 `Procfile`도 없습니다. 대시보드로 설정하는 PaaS에 배포하면 빌드 명령·시작 명령·환경변수가 전부 버전 관리 밖에 있게 됩니다.

### Docker로 직접 호스팅 (지원되는 경로)

이 이미지에 필요한 플래그를 **전부** 거는 건 `server/docker-compose.yml` 하나뿐입니다. 위에서 말한 exec tmpfs 마운트를 포함해서요:

```bash
cd server
docker compose up compiler
```

`read_only`, `no-new-privileges`, 번들된 seccomp 프로파일, `mem_limit`, `cpus`, `pids_limit`을 적용하고 `/tmp`과 `/dev/shm`을 exec 가능한 tmpfs로 마운트합니다. 외부에 노출하기 전에 `FRONTEND_URL`을 프론트엔드 오리진으로 설정하세요. 동등한 `docker run` 형태는 `server/Dockerfile` 끝 주석에 있습니다 — 거기 seccomp 경로는 **호스트** 경로입니다. 컨테이너가 생기기 전에 Docker CLI가 읽기 때문입니다.

서버는 HTTP로 받은 임의의 C++를 컴파일·실행하므로 이 플래그들은 장식이 아니라 필수입니다. `prlimit`이 프로그램별 CPU·메모리·파일크기·프로세스 수를 막고, 컨테이너 플래그가 `prlimit`이 못 막는 것을 막습니다. `/api/compile`에는 레이트 리밋(기본 20 req/min/IP)도 걸려 있고 `RATE_LIMIT_*`로 조정합니다.

**번들 프로파일의 알려진 구멍** — 나중에 발견하지 말고 지금 결정하시라고 적어둡니다. seccomp 프로파일이 `socket`/`connect`를 허용하므로 추적 대상 코드가 네트워크에 나갈 수 있습니다. 문제가 된다면 compose 서비스에 `network_mode: none`을 추가하세요. `ptrace`도 무조건 허용인데 GDB에 필요해서입니다. 다만 `kernel.yama.ptrace_scope=0`인 호스트에서는 사용자 코드가 Node 프로세스에 붙을 수도 있습니다 — 둘이 같은 uid로 돌기 때문입니다. compose의 `piston` 프로파일은 `privileged` 컨테이너를 띄우며 기본으로 꺼져 있습니다. 네트워크를 격리하기 전에는 켜지 마세요.

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
├── Dockerfile                # 배포용 Docker 이미지 (Node.js + g++ + gdb + util-linux)
├── docker-compose.yml        # 지원되는 실행 방법 — 모든 보안 플래그를 적용
├── seccomp-profile.json      # `--security-opt seccomp=...` 용 syscall 화이트리스트
└── src/
    ├── index.ts              # Express 서버 (CORS + 레이트 리밋)
    ├── env.ts                # 숫자 설정 엄격 파싱, 잘못된 값이면 기동 시 예외
    ├── routes/compile.ts     # POST /api/compile 엔드포인트
    └── services/
        ├── compiler.ts       # g++ 컴파일 + Linux용 prlimit 래퍼
        ├── childEnv.ts       # 환경변수 허용목록 — 사용자 코드가 서버 비밀을 못 봄
        ├── tempBase.ts       # 컴파일된 바이너리를 실행할 exec 가능 디렉터리 선택
        ├── gdbDriver.ts      # GDB MI 드라이버: 스폰/라인 스텝/스냅샷 + exec-wrapper rlimit
        └── gdbMapper.ts      # GDB 스냅샷 → TraceStep[] (STL 컨테이너 포함)
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
| [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit) | MIT | `/api` IP별 레이트 리밋 |
| [dotenv](https://github.com/motdotla/dotenv) | BSD-2-Clause | `server/.env`를 환경변수로 로드 |

### 도구

| 도구 | 라이선스 | 설명 |
|------|---------|------|
| [g++ (GCC)](https://gcc.gnu.org/) | GPL-3.0 | C++ 컴파일러 (런타임 의존성, 번들에 미포함) |
| [GDB](https://www.sourceware.org/gdb/) | GPL-3.0 | 라인별 추적용 GNU 디버거 (런타임 의존성, 번들에 미포함) |

---

## 라이선스

MIT License - 자세한 내용은 [LICENSE](./LICENSE) 참조.
