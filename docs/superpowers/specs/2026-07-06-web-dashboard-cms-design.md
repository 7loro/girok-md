# girok-md 웹 대시보드 CMS 디자인

- 작성일: 2026-07-06
- 상태: 승인됨 (브레인스토밍 완료)

## 목표

CLI로만 운영되는 girok-md에 로컬 전용 웹 대시보드(CMS 어드민)를 추가한다.
`.env` 비밀번호로 로그인하면 문서 탐색·publish 상태·동기화·빌드·배포 현황을 종합적으로 조회하고,
소스 폴더를 지정해 CLI(sync/translate/build/preview)를 실행하며, GitHub Pages 배포까지 원클릭으로 수행할 수 있다.

## 확정된 요구사항

| 항목 | 결정 |
|---|---|
| 실행 환경 | 로컬 전용 (`npm run dashboard`, `127.0.0.1` 바인딩) |
| 인증 | `.env`의 `DASHBOARD_PASSWORD` — 가벼운 게이트 수준 |
| 편집 범위 | 조회 + 워크플로우 관리. publish 플래그 토글(소스 frontmatter만 수정). 본문 편집은 Obsidian에 맡김 |
| 빌드/배포 | sync → translate → build → preview 실행 + git commit/push 배포까지 전부 (배포는 확인 모달 필수) |
| 폴더 지정 | sync 실행 시 소스 폴더 override 가능 (기본값은 setting.toml의 source_root_path) |

## 아키텍처

별도 서버 앱 방식 (승인된 A안). Astro 블로그 빌드와 완전 분리.

```
girok-md/
├── scripts/sync.ts          # 기존 CLI — export 함수 직접 재사용
├── dashboard/
│   ├── server/              # Hono API 서버 (포트 4322)
│   │   ├── index.ts         # 엔트리: API + 빌드된 SPA 정적 서빙
│   │   ├── auth.ts          # .env 비밀번호 → 세션 쿠키
│   │   ├── routes/          # docs / jobs / deploy / settings / overview
│   │   └── services/        # 문서 상태 도출, 잡 실행기, git 래퍼
│   ├── web/                 # Vite + React SPA
│   └── .data/               # 잡 히스토리 JSON (gitignore)
├── src/                     # Astro 블로그 — 변경 없음
└── .env                     # DASHBOARD_PASSWORD (gitignore, .env.example 제공)
```

- 실행 스크립트:
  - `npm run dashboard` — 프로덕션 모드. SPA 빌드본을 Hono가 정적 서빙
  - `npm run dashboard:dev` — Vite dev 서버(HMR) + API 서버 병렬 실행
- 의존성 추가: `hono`, `@hono/node-server`, `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, Tailwind CSS
- dotenv 불필요 — Node 내장 `process.loadEnvFile()` 사용
- 문서 조회는 `scripts/sync.ts`의 `findMarkdownFiles` / `parseDocument` / `checkShouldSync` / `isPublishable` 등을
  직접 import하여 재사용한다. 로직 중복 금지
- 서버 코드는 기존 CLI와 동일하게 Node의 TS 직접 실행(type stripping)으로 구동한다

## 인증

- `.env`의 `DASHBOARD_PASSWORD`와 timing-safe 비교(`crypto.timingSafeEqual`)
- 성공 시 랜덤 토큰 발급 → httpOnly 쿠키 + 서버 메모리 세션 (재시작 시 재로그인)
- 모든 `/api/*`는 인증 미들웨어로 보호 (auth 라우트 제외)
- 서버는 `127.0.0.1`에만 바인딩하여 로컬 전용 강제
- 5회 연속 실패 시 30초 쿨다운 (가벼운 브루트포스 방지)
- `DASHBOARD_PASSWORD` 미설정 시 서버 기동 실패 + 안내 메시지

## 문서 상태 모델 (핵심 도메인)

소스 볼트, `src/content/posts/`, `dist/`를 스캔·병합해 문서마다 파이프라인 상태를 도출한다.

| 상태 | 의미 |
|---|---|
| `draft` | 소스에서 탐색됨, `publish` 플래그 없음/false |
| `pending` | `publish: true`인데 미동기화 (신규 or 동기화 이후 수정됨) |
| `synced` | 동기화 완료, 최신 상태 |
| `built` | 마지막 빌드에 포함됨 (dist에 해당 포스트 HTML 존재 + 그 파일의 mtime ≥ `publish_sync_at`) |
| `orphaned` | `src/content/posts/`에 있으나 소스에서 publish 해제/삭제됨 → 다음 sync 때 제거 예정 |

부가 정보:

- 경고: 깨진 위키링크, 누락 이미지 (`processDocument`의 warnings 재사용)
- 번역 상태: `_en` / `_ko` 접미사 파일 존재 여부로 언어별 번역 완료 표시
- 상태 도출 로직은 `dashboard/server/services/docStatus.ts`에 순수 함수로 격리 (단위 테스트 대상)

## 화면 구성

1. **로그인** — 비밀번호 입력, 실패 시 남은 시도/쿨다운 표시
2. **개요(Overview)** — 통계 카드(탐색/publish 대상/동기화/번역 수),
   파이프라인 시각화(볼트 → sync → build → deploy 각 단계 마지막 실행 시각), 최근 잡 히스토리
3. **문서(Documents)** — 전체 문서 테이블(제목·상태·태그·수정일·마지막 동기화·경고 수),
   필터(상태/태그)·검색·정렬, 행 클릭 시 상세 패널(frontmatter, 경고 목록, 번역 상태),
   publish 토글 스위치
4. **작업(Jobs)** — sync/translate/build/preview 실행 버튼, 소스 폴더 override 입력(기본값 setting.toml),
   실시간 로그 스트리밍(SSE), 잡 히스토리와 실패 로그 보존, 동시 실행 방지(잡 락)
5. **배포(Deploy)** — git status 요약 + 변경 파일 목록 → 커밋 메시지 입력 → 확인 모달 → commit+push, 배포 히스토리
6. **설정(Settings)** — setting.toml 폼 기반 편집 (source_root_path, blog_name, locale, 번역/댓글/분석 설정)

## API 설계

```
POST  /api/auth/login          { password } → 세션 쿠키
POST  /api/auth/logout
GET   /api/auth/me             인증 상태 확인

GET   /api/overview            통계 + 파이프라인 단계별 마지막 실행 시각
GET   /api/docs                병합된 문서 상태 목록 (필터 쿼리 지원)
PATCH /api/docs/publish        { filePath, publish } — 소스 frontmatter의 publish만 수정

POST  /api/jobs                { type: 'sync'|'translate'|'build'|'preview', options?: { sourcePath? } }
GET   /api/jobs                잡 히스토리
GET   /api/jobs/:id/stream     SSE 실시간 로그
POST  /api/jobs/:id/cancel     실행 중 잡 중단

GET   /api/deploy/status       git status/diff 요약
POST  /api/deploy              { message } — add + commit + push

GET   /api/settings            setting.toml 파싱 결과
PUT   /api/settings            setting.toml 갱신 (주석 보존을 위해 키별 라인 치환)
```

## 잡 실행 모델

- `child_process.spawn('node', ['scripts/sync.ts', ...args])`로 기존 CLI를 그대로 실행 —
  대시보드와 터미널의 동작이 항상 일치
- **sync.ts에 `--source <path>` CLI 인자 지원 추가** (미지정 시 기존처럼 setting.toml 사용, 기존 동작 불변)
- preview는 장기 실행 프로세스 — 시작/중지 토글로 관리하고 접속 URL(localhost:4321) 안내
- 동시 실행 방지: 서버 전역 락으로 한 번에 하나의 잡만 (preview는 예외적으로 백그라운드 유지)
- 로그는 메모리 버퍼에 쌓고 SSE로 브로드캐스트, 종료 시 `dashboard/.data/jobs.json`에
  요약(타입·시각·exit code·로그)을 영속화 (최근 50개 유지)

## publish 토글의 안전한 파일 수정

gray-matter 재직렬화는 원본 frontmatter 포맷(주석, 키 순서, 따옴표 스타일)을 훼손할 수 있다.
따라서 소스 파일 수정은 보수적 문자열 치환으로 한정한다:

- frontmatter 블록 내 `publish:` 라인이 있으면 해당 라인만 값 교체
- 없으면 frontmatter 닫는 `---` 직전에 `publish: true` 라인 추가
- frontmatter 블록 자체가 없으면 파일 맨 앞에 새 블록 생성
- 수정 전 파일을 재파싱해 실제로 의도한 변경만 발생했는지 검증, 실패 시 롤백하고 에러 반환

## 에러 처리

- 잡 실패: exit code + 전체 로그 보존, UI에 실패 배지 + 로그 뷰
- 소스 경로 미존재/파싱 실패: API가 구조화된 에러(`{ error, detail }`) 반환, UI 토스트 표시
- git push 실패(인증, 충돌 등): stderr 그대로 노출
- 서버 라우트는 기존 컨벤션대로 try-catch 후 실패 시 명시적 에러 응답

## 테스트

기존 vitest 컨벤션(`describe`/`it`/`expect`, mock 팩토리, 실제 파일시스템 접근 최소화)을 따른다.

- `docStatus` 상태 도출 로직 (핵심 — 상태별 경계 케이스)
- publish 라인 치환 로직 (있음/없음/frontmatter 없음/롤백)
- 인증 미들웨어 (성공/실패/쿨다운)
- 잡 락 (동시 실행 거부)
- setting.toml 키별 라인 치환 (주석 보존)

## UI 톤

[AI의견] 블로그 기본 테마인 neo-brutalism 계열(굵은 보더, 플랫 섀도)로 대시보드를 맞춰
"girok-md 제품"으로서의 일관성을 준다. 시스템 설정 기반 다크모드 지원.

## 범위 제외 (YAGNI)

- 소스 문서 본문 편집 (Obsidian 담당)
- 원격 서버 배포·HTTPS·다중 사용자
- 잡 스케줄링/크론
- 이미지 업로드/관리 UI (sync가 자동 처리)
