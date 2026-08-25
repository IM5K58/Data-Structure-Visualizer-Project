# 백엔드 서버 (Vierasion Compiler Server) 파일 구조 및 역할 명세서

C++ 코드를 받아서 컴파일, 실행하고 시각화를 위한 메모리 추적(Trace) 정보를 프론트엔드에 전달하는 백엔드 서버입니다.

## 실행 모드

### GDB MI 모드 (기본값)

GDB를 `--interpreter=mi2` 옵션으로 실행하여 C++ 프로그램을 한 줄씩 추적합니다. 소스 코드를 변환하지 않고 디버거가 직접 메모리 상태를 읽어옵니다.

```
g++ -g -O0  →  GDB MI 세션  →  라인별 스냅샷 (locals + struct fields)  →  gdbMapper  →  TraceStep[]
```

### 추적 없이 실행 (`USE_GDB=false`, 또는 GDB 미설치)

추적 경로는 이것 하나뿐입니다. GDB를 못 쓰면 프로그램을 컴파일해서 실행하고 그 출력만 돌려줍니다. `steps`는 비어 있고 시각화는 아무것도 그리지 않으며, 응답의 `notice`가 그 사실을 알립니다.

예전에는 사용자 소스에 추적 함수를 주입하는 계측기(instrumenter) 폴백이 있었습니다. 혼자서는 멀쩡히 컴파일되는 프로그램에 대해 **컴파일되지 않는 C++를 뱉는** 일이 있어 제거했습니다.

---

## 📂 디렉토리 구조 및 파일별 역할

### 🛠 최상위 설정 파일들

- **`package.json` & `package-lock.json`**
  Node.js 프로젝트의 종속성(라이브러리) 목록과 스크립트. `Express`, `TypeScript`, `CORS` 등의 라이브러리 정보 포함.

- **`tsconfig.json`**
  TypeScript 컴파일러 설정 파일.

- **`Dockerfile`**
  배포용 Docker 이미지 정의 (Node.js + g++ + gdb + util-linux). `USE_GDB=true`로 빌드됩니다.

- **`docker-compose.yml`**
  실제로 지원되는 실행 방법. `read_only`, `no-new-privileges`, seccomp 프로파일, `mem_limit`, `pids_limit`을 걸고 `/tmp`과 `/dev/shm`을 **exec 가능한** tmpfs로 마운트합니다. 마지막 항목이 특히 중요합니다 — Docker는 `/dev/shm`을 기본적으로 `noexec`로 마운트하는데, 컴파일된 바이너리가 거기서 실행돼야 하기 때문입니다.

- **`seccomp-profile.json`**
  시스템콜 허용목록. GDB에 필요한 `ptrace`를 의도적으로 허용합니다. 네트워크 계열(`socket`/`connect`)도 열려 있으니, 추적 대상 코드의 외부 통신을 막으려면 compose에 `network_mode: none`을 추가하세요.

---

### 🚀 `src/` (핵심 소스코드)

#### `index.ts`
**역할:** 서버 진입점(Entry Point).
Express 웹 서버를 설정하고 실행(포트 3001)시키며, 프론트엔드와의 통신을 위한 CORS 규칙을 정의합니다.

#### `routes/compile.ts`
**역할:** API 라우터.
프론트엔드에서 보내는 `POST /api/compile` 요청을 응대합니다. `USE_GDB`에 따라 GDB MI 추적 경로 또는 추적 없는 실행 경로를 선택하고, 결과를 JSON으로 응답합니다.

- GDB 미설치를 감지하면 추적 없이 실행하고 `notice`로 알립니다 (`steps`는 빈 배열)
- 그 외의 GDB 실패는 `success: false`와 런타임 에러로 응답합니다
- `/api/health` 엔드포인트에서 현재 실행 모드 확인 가능

#### `services/compiler.ts`
**역할:** g++ 컴파일 및 실행 대행자.

- `compileWithDebug()`: GDB 모드용 디버그 심볼 포함 컴파일 (`-g -O0`). jobDir과 binaryPath를 반환하므로 호출자가 정리해야 합니다.
- `executeLocal()`: 추적 없이 컴파일 후 실행 (`USE_GDB=false` 경로).
- `runProcess()`: 내부 프로세스 실행 헬퍼. Windows에서 spawn의 timeout 옵션이 실제로 동작하지 않아 수동으로 SIGTERM → SIGKILL 타이머를 구현합니다.
- 리눅스에서 `prlimit`이 없으면 **기동을 거부합니다.** 임의의 C++를 자원 제한 없이 실행하느니 뜨지 않는 편이 낫기 때문입니다. `DISABLE_RLIMIT=true`로만 의도적으로 우회할 수 있습니다.

#### `services/childEnv.ts`
**역할:** 자식 프로세스 환경변수 허용목록.

`{ ...process.env }`를 그대로 넘기면 dotenv가 `.env`에서 읽어들인 비밀까지 사용자 C++가 `getenv()`로 읽습니다. 그래서 거부목록이 아니라 허용목록입니다 — 거부목록은 비밀이 늘 때마다 갱신해야 하고, 빠뜨리면 조용합니다. Windows에서는 MSYS2 DLL 경로(`C:\msys64\ucrt64\bin`)를 PATH 앞에 붙이는 것도 여기서 합니다.

#### `services/tempBase.ts`
**역할:** 컴파일된 바이너리를 쓰고 실행할 디렉터리 결정.

리눅스에서는 RAM 기반 `/dev/shm`이 최선이지만, Docker는 이를 기본적으로 `noexec`로 마운트합니다. 그러면 바이너리 쓰기는 성공하고 **실행에서 막힙니다.** `/proc/mounts`를 읽어 실제 마운트 옵션을 확인하고, 안 되면 OS 임시 디렉터리로 물러납니다. `TEMP_BASE`로 직접 지정할 수도 있습니다.

#### `env.ts`
**역할:** 숫자 설정값의 엄격한 파싱.

`parseInt`는 첫 비숫자에서 멈춥니다. `RLIMIT_AS_BYTES=256M`이 조용히 `256`이 되어 주소공간 256**바이트**가 되고, 모든 추적 대상이 즉사한 뒤 엉뚱한 ptrace 에러로 보고됐습니다. 지금은 순수한 양의 정수만 받고, 아니면 **기동 시점에** 던집니다.

#### `services/gdbDriver.ts`
**역할:** GDB Machine Interface(MI) 드라이버. **(GDB 모드의 핵심)**

- `GDBDriver` 클래스: GDB 프로세스를 스폰하고 MI 프로토콜로 통신합니다.
  - `start()`: GDB를 실행하고 초기화를 기다립니다. 프로세스 즉시 종료 또는 오류 시 reject.
  - `sendMI()`: GDB MI 커맨드를 전송하고 응답을 파싱합니다. stdin writable 여부를 확인합니다.
  - `waitStop()`: `*stopped` 이벤트를 기다립니다.
  - `getLocals()`: 현재 스택 프레임의 지역변수 목록을 가져옵니다.
  - `inspectPointer()`: 포인터 변수를 역참조하여 struct 필드 값을 가져옵니다.
  - `listChildrenFlat()`: GDB의 `public`/`private`/`protected` 접근제어 의사노드를 재귀적으로 펼칩니다.
  - `quit()`: GDB에 `-gdb-exit`를 보내고 프로세스 종료를 대기합니다.
- `MIParser` 클래스: GDB MI 문법의 값(문자열, 튜플, 리스트)을 파싱합니다.
- `runGDBSession()`: 전체 GDB 세션을 실행하여 라인별 `GDBSnapshot[]`을 수집합니다.
  - stdin/stdout을 임시 파일로 리다이렉트합니다.
  - `main` 함수에 브레이크포인트를 설정하고 `exec-next`로 한 줄씩 진행합니다.
  - **알려진 한계:** `exec-next`는 함수 호출을 건너뜁니다. 그래서 `insert()`나 `push_front()` 같은 헬퍼 안에서 일어나는 일은 스냅샷에 전혀 잡히지 않습니다 — 자료구조 코드는 대부분 거기 있는데도요. `exec-step` 전환이 필요합니다.
  - CRT/런타임 프레임은 건너뛰고 사용자 소스 파일 내 라인만 스냅샷에 포함합니다.
  - 최대 500스텝 제한 (`MAX_STEPS`).

#### `services/gdbMapper.ts`
**역할:** GDB 스냅샷 → TraceStep 변환기. **(GDB 모드의 핵심)**

`GDBSnapshot[]`(라인별 변수 상태)을 프론트엔드 `stepMapper`와 호환되는 `TraceStep[]` 이벤트로 변환합니다.

- **ALLOC**: 포인터 변수가 새 주소로 변경되고 해당 주소에 struct 데이터가 있을 때 (= `new` 탐지)
- **SET_PTR**: struct 포인터 필드 값 변경, 또는 스코프 레벨 포인터 변수 변경
- **SET_FIELD**: struct 값 필드(int, double 등) 변경
- **LOCAL_VAR**: 일반 지역변수(비포인터) 값 변경

스냅샷 간 diff를 계산하여 실제 변경된 항목만 이벤트로 생성합니다.

---

## 테스트

```bash
npm test        # 서버 스위트
npm run typecheck
```

저장소 루트에서 `npm run test:all`을 쓰면 프론트와 서버를 한 번에 돌립니다. 루트의 `npm test`는 vitest 설정이 `src/**`로 한정돼 있어 **서버 테스트를 보지 않습니다.**

---

## 환경 변수

> 숫자 값은 **기동 시점에** 검증됩니다. 순수한 양의 정수가 아니면(`256M`, `8s`, `-1`) 서버가 뜨지 않습니다. 바이트 수는 전부 풀어 쓰세요 — `RLIMIT_AS_BYTES=268435456`.

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PORT` | `3001` | 서버 포트 |
| `GPP_PATH` | 자동 감지 | g++ 컴파일러 경로 |
| `GDB_PATH` | 자동 감지 | GDB 디버거 경로 |
| `USE_GDB` | `true` | `false`면 **추적 없이** 실행 — 출력만 나오고 `steps`는 빈 배열 |
| `TEMP_BASE` | 자동 탐지 | 컴파일된 바이너리를 쓰고 실행할 디렉터리 |
| `FRONTEND_URL` | — | 프로덕션 CORS 허용 도메인 |
| `MAX_STDIN_BYTES` | `65536` | 요청당 stdin 최대 크기 |
| `MAX_OUTPUT_BYTES` | `1048576` | 캡처하는 프로그램 출력 상한 |
| `GDB_SESSION_BUDGET_MS` | `45000` | 추적 세션 하나의 벽시계 예산 |
| `COMPILE_TIMEOUT_MS` | `15000` | 디버그 빌드가 강제 종료되기까지의 시간 |
| `MAX_CONCURRENT_JOBS` | `2` | 동시에 도는 컴파일+추적 작업 수 |
| `MAX_QUEUED_JOBS` | `8` | 슬롯 대기 가능 수. 넘으면 503 |
| `QUEUE_WAIT_MS` | `20000` | 대기 포기까지의 시간 |
| `PISTON_URL` | — | 로컬 g++ 대신 Piston 서버에 실행을 위임. 이 경로에는 추적이 없습니다 |
| `RATE_LIMIT_COMPILE` | `20` | IP당 분당 컴파일 요청 수 |
| `RATE_LIMIT_GENERAL` | `120` | IP당 분당 그 외 `/api` 요청 수 |
| `RATE_LIMIT_WINDOW_MS` | `60000` | 레이트 리밋 윈도(밀리초) |
| `TRUST_PROXY` | — | 프록시 뒤에 있을 때 신뢰할 홉 수 또는 IP/CIDR 목록 |
| `PRLIMIT_PATH` | `/usr/bin/prlimit` | `prlimit` 경로. 리눅스에서 없으면 **기동을 거부합니다** |
| `DISABLE_RLIMIT` | — | `true`면 자원 제한 **전부 없이** 기동. cgroup 등으로 이미 갇힌 호스트에서만 의도적으로 |
| `VERBOSE_STEP_LOG` | — | `true`면 생성된 추적 스텝을 전부 로깅 |
| `VERBOSE_MI_LOG` | — | `true`면 GDB/MI 전 라인 출력. 매우 시끄럽고 사용자 소스와 변수 값이 로그에 남습니다 |
