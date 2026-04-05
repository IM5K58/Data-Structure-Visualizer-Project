# 백엔드 서버 (Vierasion Compiler Server) 파일 구조 및 역할 명세서

C++ 코드를 받아서 컴파일, 실행하고 시각화를 위한 메모리 추적(Trace) 정보를 프론트엔드에 전달하는 백엔드 서버입니다.

## 실행 모드

### GDB MI 모드 (기본값)

GDB를 `--interpreter=mi2` 옵션으로 실행하여 C++ 프로그램을 한 줄씩 추적합니다. 소스 코드를 변환하지 않고 디버거가 직접 메모리 상태를 읽어옵니다.

```
g++ -g -O0  →  GDB MI 세션  →  라인별 스냅샷 (locals + struct fields)  →  gdbMapper  →  TraceStep[]
```

### 계측기(Instrumenter) 모드 (폴백)

GDB가 없거나 `USE_GDB=false`일 때 동작합니다. 소스 코드에 추적 함수를 삽입한 후 컴파일하여 실행합니다.

```
instrumenter (코드 변환)  →  g++  →  실행  →  __TRACE__ JSON 파싱  →  TraceStep[]
```

---

## 📂 디렉토리 구조 및 파일별 역할

### 🛠 최상위 설정 파일들

- **`package.json` & `package-lock.json`**
  Node.js 프로젝트의 종속성(라이브러리) 목록과 스크립트. `Express`, `TypeScript`, `CORS` 등의 라이브러리 정보 포함.

- **`tsconfig.json`**
  TypeScript 컴파일러 설정 파일.

- **`Dockerfile`**
  Render.com 등 클라우드 배포용 Docker 이미지 정의 (Node.js + g++). GDB를 제한하는 환경에서는 `USE_GDB=false`로 계측기 모드를 사용합니다.

---

### 🚀 `src/` (핵심 소스코드)

#### `index.ts`
**역할:** 서버 진입점(Entry Point).
Express 웹 서버를 설정하고 실행(포트 3001)시키며, 프론트엔드와의 통신을 위한 CORS 규칙을 정의합니다.

#### `routes/compile.ts`
**역할:** API 라우터.
프론트엔드에서 보내는 `POST /api/compile` 요청을 응대합니다. `USE_GDB` 환경변수에 따라 GDB MI 경로 또는 계측기 경로를 선택하고, 결과를 JSON으로 응답합니다.

- GDB 미설치 감지 시 자동으로 계측기 모드로 폴백
- `/api/health` 엔드포인트에서 현재 실행 모드 확인 가능

#### `services/compiler.ts`
**역할:** g++ 컴파일 및 실행 대행자.

- `compileWithDebug()`: GDB 모드용 디버그 심볼 포함 컴파일 (`-g -O0`). jobDir과 binaryPath를 반환하므로 호출자가 정리해야 합니다.
- `executeLocal()`: 계측기 모드용 일반 컴파일 및 실행.
- `runProcess()`: 내부 프로세스 실행 헬퍼. Windows에서 spawn의 timeout 옵션이 실제로 동작하지 않아 수동으로 SIGTERM → SIGKILL 타이머를 구현합니다.
- Windows 환경에서는 MSYS2 DLL 경로(`C:\msys64\ucrt64\bin`)를 PATH에 추가합니다.

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

#### `services/instrumenter.ts`
**역할:** C++ 코드 자동 계측기. **(계측기 모드 전용)**

사용자 코드에 정규표현식으로 `new`, `->`, `delete` 등을 찾아 `__vt::alloc()`, `__vt::set_ptr()` 등의 추적 함수를 삽입합니다.

#### `services/codeAnalyzer.ts`
**역할:** Groq AI struct 분류기. **(계측기 모드 전용, 선택)**

`GROQ_API_KEY`가 설정된 경우 Groq LLM API를 호출하여 struct를 사전 분류하고 계측기에 힌트를 제공합니다.

---

### 📦 `sandbox/` (C++ 추적 라이브러리)

#### `__tracer.h`
**역할:** C++ 런타임 추적 헤더 파일. **(계측기 모드 전용)**

`instrumenter.ts`가 삽입한 `__vt::alloc()`, `__vt::set_ptr()` 등의 함수가 실제로 정의된 C++ 라이브러리입니다. 실행 시 `__TRACE__{"type":"ALLOC", ...}` 형태의 JSON 로그를 stdout에 출력합니다.

---

## 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PORT` | `3001` | 서버 포트 |
| `GPP_PATH` | 자동 감지 | g++ 컴파일러 경로 |
| `GDB_PATH` | 자동 감지 | GDB 디버거 경로 |
| `USE_GDB` | `true` | `false`로 설정하면 계측기 모드 강제 사용 |
| `FRONTEND_URL` | — | 프로덕션 CORS 허용 도메인 |
| `GROQ_API_KEY` | — | Groq AI 분류용 API 키 (계측기 모드 전용, 선택) |
