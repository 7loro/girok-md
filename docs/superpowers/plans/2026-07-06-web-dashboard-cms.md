# girok-md 웹 대시보드 CMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로컬 전용 웹 대시보드(CMS 어드민)를 추가한다 — .env 비밀번호 로그인, 문서 파이프라인 상태 조회, publish 토글, 폴더 지정 CLI 실행(SSE 로그), git 배포, setting.toml 편집.

**Architecture:** `dashboard/server/`(Hono, 포트 4322, 127.0.0.1 전용)가 API와 빌드된 SPA를 서빙하고, `dashboard/web/`(Vite+React+Tailwind 4)이 UI를 담당한다. 문서 조회는 `scripts/sync.ts`의 export 함수를 직접 import해 재사용하고, CLI 실행은 `child_process.spawn`으로 기존 스크립트를 그대로 돌린다. Astro 블로그(`src/`)는 변경하지 않는다.

**Tech Stack:** Hono + @hono/node-server, React 18, Vite 6, Tailwind CSS 4(@tailwindcss/vite), vitest(기존), Node 22 type stripping(.ts 직접 실행)

**Spec:** `docs/superpowers/specs/2026-07-06-web-dashboard-cms-design.md`

## Global Constraints

- Node v22.22.2 — `.ts` 파일을 `node`로 직접 실행 (type stripping). 서버 코드도 빌드 없이 실행
- TypeScript strict — `any`, `@ts-ignore` 금지, 함수에 명시적 반환 타입
- 2스페이스 들여쓰기, 세미콜론, 작은따옴표, trailing comma, 한 줄 최대 150자
- 코드 주석은 영어로 작성
- 커밋 메시지는 영어, `feat:` / `test:` / `docs:` / `chore:` prefix
- 파일 명명: `.ts`는 camelCase, React 컴포넌트 `.tsx`는 PascalCase
- import 순서: Node 내장 → 외부 라이브러리 → 내부 모듈
- 서버는 `127.0.0.1:4322` 고정 바인딩, Vite dev 서버는 4323(프록시 `/api` → 4322)
- `scripts/sync.ts`의 기존 CLI 동작은 절대 변경하지 않는다 (인자 추가만 허용)
- 세션 쿠키 이름: `girok_session`
- 테스트는 vitest, `describe`/`it`/`expect`, 실제 파일시스템 접근 최소화(순수 함수에 로직 격리)

## File Structure

```
scripts/sync.ts                                  # Modify: parseCliArgs 추가 (--source)
tsconfig.json                                    # Modify: dashboard 제외
package.json                                     # Modify: deps + dashboard 스크립트
.env.example                                     # Create: DASHBOARD_PASSWORD 안내
dashboard/
├── tsconfig.json                                # server용 타입체크 설정
├── server/
│   ├── index.ts                                 # 엔트리: env 로드, 조립, listen
│   ├── app.ts                                   # Hono 앱: 전체 라우트 + 인증 미들웨어
│   ├── auth.ts                                  # 세션 스토어, 비밀번호 검증, 로그인 가드
│   ├── services/
│   │   ├── docStatus.ts                         # 문서 상태 도출 (핵심 도메인)
│   │   ├── publishToggle.ts                     # publish 라인 치환
│   │   ├── settingsFile.ts                      # setting.toml 키별 라인 치환
│   │   ├── jobs.ts                              # 잡 러너 (spawn, 락, 로그, 영속화)
│   │   └── deploy.ts                            # git status/commit/push 래퍼
│   └── __tests__/
│       ├── auth.test.ts
│       ├── docStatus.test.ts
│       ├── publishToggle.test.ts
│       ├── settingsFile.test.ts
│       ├── jobs.test.ts
│       ├── deploy.test.ts
│       └── app.test.ts
└── web/
    ├── tsconfig.json                            # React용 타입체크 설정
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx                              # 인증 게이트 (Login ↔ Shell)
        ├── api.ts                               # fetch 래퍼 + 전체 API 클라이언트
        ├── theme.css                            # Tailwind 4 + neo-brutalism 토큰
        ├── components/
        │   ├── Login.tsx
        │   ├── Shell.tsx                        # 사이드바 + 뷰 스위칭
        │   ├── StatusBadge.tsx                  # 문서 상태 배지 (공용)
        │   └── LogView.tsx                      # 잡 로그 뷰 (공용)
        └── pages/
            ├── Overview.tsx
            ├── Documents.tsx
            ├── Jobs.tsx
            ├── Deploy.tsx
            └── Settings.tsx
dashboard/.data/                                 # 런타임 생성 (gitignore)
```

**태스크 의존 순서:** 1(sync 인자) → 2(스캐폴딩+auth) → 3~7(서비스, 상호 독립) → 8(Hono 조립) → 9(웹 셸) → 10~13(페이지, 상호 독립) → 14(문서화+검증)

---

### Task 1: sync.ts에 `--source` CLI 인자 추가

**Files:**
- Modify: `scripts/sync.ts` (main 함수와 export 목록)
- Test: `scripts/__tests__/sync.test.ts` (기존 파일에 describe 추가)

**Interfaces:**
- Produces: `parseCliArgs(argv: string[]): { source?: string }` — Task 6의 잡 러너가 `node scripts/sync.ts --source <path>`로 호출하는 계약의 근거

- [ ] **Step 1: 실패하는 테스트 작성**

`scripts/__tests__/sync.test.ts` 끝에 추가:

```ts
describe('parseCliArgs', () => {
  it('should return empty object when no args', () => {
    expect(parseCliArgs([])).toEqual({});
  });

  it('should parse --source with a path', () => {
    expect(parseCliArgs(['--source', '/my/vault'])).toEqual({ source: '/my/vault' });
  });

  it('should ignore --source without a value', () => {
    expect(parseCliArgs(['--source'])).toEqual({});
  });

  it('should ignore unknown args', () => {
    expect(parseCliArgs(['--verbose', '--source', '/v'])).toEqual({ source: '/v' });
  });
});
```

파일 상단 import에 `parseCliArgs` 추가:

```ts
import { parseCliArgs } from '../sync.ts';
```

(기존 import 구문이 `../sync.ts`에서 여러 심볼을 가져오고 있으면 거기에 `parseCliArgs`만 추가)

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run scripts/__tests__/sync.test.ts -t "parseCliArgs"`
Expected: FAIL — `parseCliArgs is not a function` (또는 export 없음 에러)

- [ ] **Step 3: 최소 구현**

`scripts/sync.ts`의 `main()` 함수 정의 바로 위에 추가:

```ts
export interface CliArgs {
  source?: string;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source' && argv[i + 1]) {
      args.source = argv[i + 1];
      i++;
    }
  }
  return args;
}
```

`main()` 안에서 sourcePath 결정 부분을 수정. 기존:

```ts
  const sourcePath = settings.source_root_path;
```

변경:

```ts
  const cliArgs = parseCliArgs(process.argv.slice(2));
  const sourcePath = cliArgs.source ?? settings.source_root_path;
```

에러 메시지도 함께 갱신. 기존:

```ts
  if (!sourcePath) {
    console.error('❌ source_root_path is not configured.');
    console.error('   Please check your setting.toml file.');
    process.exit(1);
  }
```

변경:

```ts
  if (!sourcePath) {
    console.error('❌ source_root_path is not configured.');
    console.error('   Please check your setting.toml file or pass --source <path>.');
    process.exit(1);
  }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run scripts/__tests__/sync.test.ts`
Expected: 기존 테스트 포함 전체 PASS

- [ ] **Step 5: 커밋**

```bash
git add scripts/sync.ts scripts/__tests__/sync.test.ts
git commit -m "feat: add --source CLI arg to sync script"
```

---

### Task 2: 대시보드 스캐폴딩 + 인증 서비스

**Files:**
- Modify: `package.json` (deps + scripts), `tsconfig.json` (exclude), `.gitignore` (.data)
- Create: `.env.example`, `dashboard/tsconfig.json`, `dashboard/server/auth.ts`
- Test: `dashboard/server/__tests__/auth.test.ts`

**Interfaces:**
- Produces (Task 8이 사용):
  - `createSessionStore(): SessionStore` — `{ create(): string; has(token: string): boolean; destroy(token: string): void }`
  - `verifyPassword(input: string, expected: string): boolean` — timing-safe
  - `createLoginGuard(maxFailures?: number, cooldownMs?: number): LoginGuard` — `{ canAttempt(now: number): { allowed: boolean; retryAfterMs: number }; recordFailure(now: number): void; reset(): void }`

- [ ] **Step 1: 의존성 설치**

```bash
npm install hono @hono/node-server
npm install -D react@^18 react-dom@^18 @types/react@^18 @types/react-dom@^18 vite @vitejs/plugin-react tailwindcss @tailwindcss/vite
```

Expected: package.json에 추가되고 에러 없이 완료

- [ ] **Step 2: 설정 파일들 작성**

`tsconfig.json` 전체를 다음으로 교체 (dashboard를 Astro 타입체크에서 제외):

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "jsxImportSource": "astro",
  },
  "exclude": ["dashboard", "dist", "node_modules"],
}
```

`dashboard/tsconfig.json` 생성 (서버 코드 타입체크용):

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["server/**/*.ts", "../scripts/**/*.ts"]
}
```

`.env.example` 생성:

```
# Dashboard admin password. Copy this file to .env and set your own value.
DASHBOARD_PASSWORD=change-me
```

`.gitignore`의 `# AI` 섹션 위에 추가:

```
# Dashboard runtime data
dashboard/.data/
dashboard/web/dist/
```

`package.json`의 scripts에 추가 (`"clean"` 라인 뒤):

```json
    "dashboard": "npm run dashboard:build && node dashboard/server/index.ts",
    "dashboard:build": "vite build dashboard/web",
    "dashboard:server": "node dashboard/server/index.ts",
    "dashboard:dev": "vite dashboard/web"
```

(`dashboard:dev`는 HMR용 — 별도 터미널에서 `dashboard:server`를 함께 띄운다. README에 Task 14에서 문서화)

- [ ] **Step 3: 실패하는 테스트 작성**

`dashboard/server/__tests__/auth.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest';
import { createSessionStore, verifyPassword, createLoginGuard } from '../auth.ts';

describe('createSessionStore', () => {
  it('should create tokens that validate and can be destroyed', () => {
    const store = createSessionStore();
    const token = store.create();
    expect(token.length).toBeGreaterThan(10);
    expect(store.has(token)).toBe(true);
    store.destroy(token);
    expect(store.has(token)).toBe(false);
  });

  it('should not validate unknown tokens', () => {
    const store = createSessionStore();
    expect(store.has('nope')).toBe(false);
  });
});

describe('verifyPassword', () => {
  it('should accept exact match', () => {
    expect(verifyPassword('secret', 'secret')).toBe(true);
  });

  it('should reject mismatch and different lengths', () => {
    expect(verifyPassword('secret!', 'secret')).toBe(false);
    expect(verifyPassword('Secret', 'secret')).toBe(false);
    expect(verifyPassword('', 'secret')).toBe(false);
  });
});

describe('createLoginGuard', () => {
  it('should allow attempts before the failure limit', () => {
    const guard = createLoginGuard(5, 30_000);
    for (let i = 0; i < 4; i++) guard.recordFailure(1000);
    expect(guard.canAttempt(1000).allowed).toBe(true);
  });

  it('should block after max failures and expose retryAfterMs', () => {
    const guard = createLoginGuard(5, 30_000);
    for (let i = 0; i < 5; i++) guard.recordFailure(1000);
    const check = guard.canAttempt(2000);
    expect(check.allowed).toBe(false);
    expect(check.retryAfterMs).toBe(29_000);
  });

  it('should allow again after cooldown passes', () => {
    const guard = createLoginGuard(5, 30_000);
    for (let i = 0; i < 5; i++) guard.recordFailure(1000);
    expect(guard.canAttempt(31_001).allowed).toBe(true);
  });

  it('should clear failures on reset', () => {
    const guard = createLoginGuard(2, 30_000);
    guard.recordFailure(0);
    guard.reset();
    guard.recordFailure(100);
    expect(guard.canAttempt(100).allowed).toBe(true);
  });
});
```

- [ ] **Step 4: 테스트 실패 확인**

Run: `npx vitest run dashboard/server/__tests__/auth.test.ts`
Expected: FAIL — `Cannot find module '../auth.ts'`

- [ ] **Step 5: 구현**

`dashboard/server/auth.ts` 생성:

```ts
import { randomUUID, timingSafeEqual } from 'crypto';

export interface SessionStore {
  create(): string;
  has(token: string): boolean;
  destroy(token: string): void;
}

export function createSessionStore(): SessionStore {
  const tokens = new Set<string>();
  return {
    create(): string {
      const token = randomUUID();
      tokens.add(token);
      return token;
    },
    has(token: string): boolean {
      return tokens.has(token);
    },
    destroy(token: string): void {
      tokens.delete(token);
    },
  };
}

export function verifyPassword(input: string, expected: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Burn comparable time before failing so length is not observable via timing.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export interface AttemptCheck {
  allowed: boolean;
  retryAfterMs: number;
}

export interface LoginGuard {
  canAttempt(now: number): AttemptCheck;
  recordFailure(now: number): void;
  reset(): void;
}

export function createLoginGuard(maxFailures = 5, cooldownMs = 30_000): LoginGuard {
  let failures = 0;
  let blockedUntil = 0;
  return {
    canAttempt(now: number): AttemptCheck {
      if (now < blockedUntil) {
        return { allowed: false, retryAfterMs: blockedUntil - now };
      }
      return { allowed: true, retryAfterMs: 0 };
    },
    recordFailure(now: number): void {
      failures += 1;
      if (failures >= maxFailures) {
        blockedUntil = now + cooldownMs;
        failures = 0;
      }
    },
    reset(): void {
      failures = 0;
      blockedUntil = 0;
    },
  };
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npx vitest run dashboard/server/__tests__/auth.test.ts`
Expected: PASS (전체)

- [ ] **Step 7: 타입체크 확인**

Run: `npx tsc --noEmit -p dashboard`
Expected: 에러 없음

- [ ] **Step 8: 커밋**

```bash
git add package.json package-lock.json tsconfig.json .gitignore .env.example dashboard/
git commit -m "feat: scaffold dashboard workspace with auth service"
```

---

### Task 3: 문서 상태 도출 서비스 (docStatus)

**Files:**
- Create: `dashboard/server/services/docStatus.ts`
- Test: `dashboard/server/__tests__/docStatus.test.ts`

**Interfaces:**
- Consumes: `scripts/sync.ts`의 `findMarkdownFiles`, `parseDocument`, `isPublishable`, `checkShouldSync`
- Produces (Task 8이 사용):
  - `type DocStatus = 'draft' | 'pending' | 'synced' | 'built' | 'orphaned'`
  - `deriveStatus(input: StatusInput): DocStatus` — 순수 함수
  - `scanDocuments(sourceRoot: string, postsDir: string, distDir: string): DocEntry[]`
  - `DocEntry = { slug, title, status, sourcePath: string | null, relPath: string | null, publish: boolean, tags: string[], modified: string | null, lastSyncAt: string | null, translations: string[], warnings: string[] }`

- [ ] **Step 1: 실패하는 테스트 작성**

`dashboard/server/__tests__/docStatus.test.ts` 생성 (순수 함수 `deriveStatus`만 단위 테스트 — 파일시스템을 걷는 `scanDocuments`는 Task 8의 라우트 통합 확인과 Task 14의 실기동 검증으로 커버):

```ts
import { describe, it, expect } from 'vitest';
import { deriveStatus, type StatusInput } from '../services/docStatus.ts';

function makeInput(overrides: Partial<StatusInput> = {}): StatusInput {
  return {
    publishable: true,
    inOutput: true,
    upToDate: true,
    builtAt: undefined,
    lastSyncAt: undefined,
    ...overrides,
  };
}

describe('deriveStatus', () => {
  it('should be draft when not publishable', () => {
    expect(deriveStatus(makeInput({ publishable: false }))).toBe('draft');
  });

  it('should be pending when publishable but not yet in output', () => {
    expect(deriveStatus(makeInput({ inOutput: false, upToDate: false }))).toBe('pending');
  });

  it('should be pending when synced copy is stale', () => {
    expect(deriveStatus(makeInput({ upToDate: false }))).toBe('pending');
  });

  it('should be synced when up to date but never built', () => {
    expect(deriveStatus(makeInput())).toBe('synced');
  });

  it('should be synced when build predates the last sync', () => {
    const input = makeInput({
      builtAt: new Date('2026-07-01T00:00:00'),
      lastSyncAt: new Date('2026-07-02T00:00:00'),
    });
    expect(deriveStatus(input)).toBe('synced');
  });

  it('should be built when build is at or after the last sync', () => {
    const input = makeInput({
      builtAt: new Date('2026-07-03T00:00:00'),
      lastSyncAt: new Date('2026-07-02T00:00:00'),
    });
    expect(deriveStatus(input)).toBe('built');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run dashboard/server/__tests__/docStatus.test.ts`
Expected: FAIL — `Cannot find module '../services/docStatus.ts'`

- [ ] **Step 3: 구현**

`dashboard/server/services/docStatus.ts` 생성:

```ts
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { basename, join, relative } from 'path';
import matter from 'gray-matter';
import {
  findMarkdownFiles,
  parseDocument,
  isPublishable,
  checkShouldSync,
  buildPublishedIndex,
  processDocument,
  type ParsedDocument,
} from '../../../scripts/sync.ts';

export type DocStatus = 'draft' | 'pending' | 'synced' | 'built' | 'orphaned';

export interface StatusInput {
  publishable: boolean;
  inOutput: boolean;
  upToDate: boolean;
  builtAt?: Date;
  lastSyncAt?: Date;
}

export function deriveStatus(input: StatusInput): DocStatus {
  if (!input.publishable) return 'draft';
  if (!input.inOutput || !input.upToDate) return 'pending';
  if (input.builtAt && input.lastSyncAt && input.builtAt.getTime() >= input.lastSyncAt.getTime()) {
    return 'built';
  }
  return 'synced';
}

export interface DocEntry {
  slug: string;
  title: string;
  status: DocStatus;
  sourcePath: string | null;
  relPath: string | null;
  publish: boolean;
  tags: string[];
  modified: string | null;
  lastSyncAt: string | null;
  translations: string[];
  warnings: string[];
}

const LANG_SUFFIX = /^(.+)_([a-z]{2})$/;

// Collect translation langs per base slug from files like `my-post_en.md`.
function collectTranslations(postsDir: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (!existsSync(postsDir)) return map;
  for (const file of readdirSync(postsDir).filter((f) => f.endsWith('.md'))) {
    const match = basename(file, '.md').match(LANG_SUFFIX);
    if (match) {
      const langs = map.get(match[1]) ?? [];
      langs.push(match[2]);
      map.set(match[1], langs);
    }
  }
  return map;
}

function builtAtOf(distDir: string, slug: string): Date | undefined {
  const htmlPath = join(distDir, 'posts', slug, 'index.html');
  try {
    return statSync(htmlPath).mtime;
  } catch {
    return undefined;
  }
}

function toTags(doc: ParsedDocument): string[] {
  const tags = doc.frontmatter.tags;
  return Array.isArray(tags) ? tags.map(String) : [];
}

export function scanDocuments(sourceRoot: string, postsDir: string, distDir: string): DocEntry[] {
  const entries: DocEntry[] = [];
  const sourceSlugs = new Set<string>();

  const docs = existsSync(sourceRoot)
    ? findMarkdownFiles(sourceRoot)
        .map((f) => parseDocument(f))
        .filter((d): d is ParsedDocument => d !== null)
    : [];
  const publishableDocs = docs.filter((d) => isPublishable(d));
  const publishedIndex = buildPublishedIndex(publishableDocs);

  for (const doc of docs) {
    const publishable = isPublishable(doc);
    if (publishable) sourceSlugs.add(doc.slug);

    const syncCheck = publishable
      ? checkShouldSync(doc, postsDir)
      : { shouldSync: false, reason: 'not publishable' as const, lastSyncTime: undefined };
    // Warnings (broken wikilinks, missing images) only make sense for publishable docs.
    const warnings = publishable ? processDocument(doc, publishedIndex, sourceRoot).warnings : [];
    const inOutput = existsSync(join(postsDir, `${doc.slug}.md`));
    const status = deriveStatus({
      publishable,
      inOutput,
      upToDate: !syncCheck.shouldSync,
      builtAt: builtAtOf(distDir, doc.slug),
      lastSyncAt: syncCheck.lastSyncTime,
    });

    entries.push({
      slug: doc.slug,
      title: doc.title,
      status,
      sourcePath: doc.filePath,
      relPath: relative(sourceRoot, doc.filePath),
      publish: publishable,
      tags: toTags(doc),
      modified: doc.modified.toISOString(),
      lastSyncAt: syncCheck.lastSyncTime ? syncCheck.lastSyncTime.toISOString() : null,
      translations: [],
      warnings,
    });
  }

  // Synced posts whose source is gone or unpublished — removed on next sync.
  const translations = collectTranslations(postsDir);
  if (existsSync(postsDir)) {
    for (const file of readdirSync(postsDir).filter((f) => f.endsWith('.md'))) {
      const slug = basename(file, '.md');
      if (LANG_SUFFIX.test(slug)) continue;
      if (sourceSlugs.has(slug)) continue;
      const raw = readFileSync(join(postsDir, file), 'utf-8');
      const { data } = matter(raw);
      entries.push({
        slug,
        title: typeof data.title === 'string' ? data.title : slug,
        status: 'orphaned',
        sourcePath: null,
        relPath: null,
        publish: false,
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        modified: null,
        lastSyncAt: typeof data.publish_sync_at === 'string' ? data.publish_sync_at : null,
        translations: [],
        warnings: [],
      });
    }
  }

  for (const entry of entries) {
    entry.translations = translations.get(entry.slug) ?? [];
  }

  return entries;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run dashboard/server/__tests__/docStatus.test.ts`
Expected: PASS

- [ ] **Step 5: 타입체크 + 커밋**

```bash
npx tsc --noEmit -p dashboard
git add dashboard/server/services/docStatus.ts dashboard/server/__tests__/docStatus.test.ts
git commit -m "feat: add document pipeline status service"
```

---

### Task 4: publish 토글 서비스 (안전한 라인 치환)

**Files:**
- Create: `dashboard/server/services/publishToggle.ts`
- Test: `dashboard/server/__tests__/publishToggle.test.ts`

**Interfaces:**
- Produces (Task 8이 사용):
  - `setPublishInContent(raw: string, publish: boolean): string` — 순수 함수
  - `setPublishFlag(filePath: string, publish: boolean): void` — 쓰기 전 재파싱 검증, 실패 시 throw(파일 미변경)

- [ ] **Step 1: 실패하는 테스트 작성**

`dashboard/server/__tests__/publishToggle.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest';
import matter from 'gray-matter';
import { setPublishInContent } from '../services/publishToggle.ts';

describe('setPublishInContent', () => {
  it('should replace an existing publish line without touching other lines', () => {
    const raw = '---\ntitle: Hello # keep\npublish: false\ntags:\n  - a\n---\n\nBody';
    const result = setPublishInContent(raw, true);
    expect(result).toContain('publish: true');
    expect(result).toContain('title: Hello # keep');
    expect(result).toContain('tags:\n  - a');
    expect(matter(result).data.publish).toBe(true);
  });

  it('should turn publish off', () => {
    const raw = '---\npublish: true\n---\nBody';
    const result = setPublishInContent(raw, false);
    expect(matter(result).data.publish).toBe(false);
  });

  it('should add a publish line when frontmatter exists without one', () => {
    const raw = '---\ntitle: Hi\n---\n\nBody';
    const result = setPublishInContent(raw, true);
    expect(matter(result).data.publish).toBe(true);
    expect(matter(result).data.title).toBe('Hi');
    expect(result).toContain('Body');
  });

  it('should create frontmatter when the file has none', () => {
    const raw = '# Just content\n';
    const result = setPublishInContent(raw, true);
    expect(matter(result).data.publish).toBe(true);
    expect(result).toContain('# Just content');
  });

  it('should not rewrite quoted values elsewhere in the body', () => {
    const raw = '---\npublish: false\n---\n\nUse `publish: false` in frontmatter.';
    const result = setPublishInContent(raw, true);
    expect(result).toContain('Use `publish: false` in frontmatter.');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run dashboard/server/__tests__/publishToggle.test.ts`
Expected: FAIL — `Cannot find module '../services/publishToggle.ts'`

- [ ] **Step 3: 구현**

`dashboard/server/services/publishToggle.ts` 생성:

```ts
import { readFileSync, writeFileSync } from 'fs';
import matter from 'gray-matter';

// Conservative single-line edit: gray-matter round-trips can destroy comments,
// key order, and quoting, so only the `publish:` line is ever touched.
export function setPublishInContent(raw: string, publish: boolean): string {
  const value = publish ? 'true' : 'false';
  if (raw.startsWith('---')) {
    const end = raw.indexOf('\n---', 3);
    if (end !== -1) {
      const fmBlock = raw.slice(0, end);
      const publishLine = /^publish\s*:.*$/m;
      if (publishLine.test(fmBlock)) {
        return fmBlock.replace(publishLine, `publish: ${value}`) + raw.slice(end);
      }
      return `${fmBlock}\npublish: ${value}${raw.slice(end)}`;
    }
  }
  return `---\npublish: ${value}\n---\n\n${raw}`;
}

export function setPublishFlag(filePath: string, publish: boolean): void {
  const raw = readFileSync(filePath, 'utf-8');
  const updated = setPublishInContent(raw, publish);
  // Verify before writing: the file on disk is only replaced by a version
  // that parses back to exactly the requested flag.
  const { data } = matter(updated);
  const applied = data.publish === true || data.publish === 'true';
  if (applied !== publish) {
    throw new Error(`Publish flag verification failed for ${filePath}`);
  }
  writeFileSync(filePath, updated, 'utf-8');
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run dashboard/server/__tests__/publishToggle.test.ts`
Expected: PASS

- [ ] **Step 5: 타입체크 + 커밋**

```bash
npx tsc --noEmit -p dashboard
git add dashboard/server/services/publishToggle.ts dashboard/server/__tests__/publishToggle.test.ts
git commit -m "feat: add safe publish flag toggle service"
```

---

### Task 5: setting.toml 편집 서비스 (주석 보존 라인 치환)

**Files:**
- Create: `dashboard/server/services/settingsFile.ts`
- Test: `dashboard/server/__tests__/settingsFile.test.ts`

**Interfaces:**
- Produces (Task 8이 사용):
  - `type TomlValue = string | boolean | number | string[]`
  - `updateTomlContent(raw: string, updates: Record<string, Record<string, TomlValue>>): string` — 바깥 키는 섹션명(top-level은 `''`), 안쪽은 키=값. 존재하지 않는 키가 있으면 throw
  - `serializeTomlValue(value: TomlValue): string`

- [ ] **Step 1: 실패하는 테스트 작성**

`dashboard/server/__tests__/settingsFile.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest';
import { parse } from 'smol-toml';
import { updateTomlContent, serializeTomlValue } from '../services/settingsFile.ts';

const SAMPLE = `# Top comment
source_root_path = "/source"
blog_name = "Casper Blog"

# Intro Section
[intro]
name = "Your Name"

[posts.translate]
enabled = true
target_langs = ["en", "ko"]
`;

describe('serializeTomlValue', () => {
  it('should serialize strings, booleans, numbers, and string arrays', () => {
    expect(serializeTomlValue('a "b"')).toBe('"a \\"b\\""');
    expect(serializeTomlValue(true)).toBe('true');
    expect(serializeTomlValue(42)).toBe('42');
    expect(serializeTomlValue(['en', 'ko'])).toBe('["en", "ko"]');
  });
});

describe('updateTomlContent', () => {
  it('should update a top-level key and keep comments', () => {
    const result = updateTomlContent(SAMPLE, { '': { blog_name: 'New Blog' } });
    expect(result).toContain('blog_name = "New Blog"');
    expect(result).toContain('# Top comment');
    expect((parse(result) as Record<string, unknown>).source_root_path).toBe('/source');
  });

  it('should update keys inside nested sections only', () => {
    const result = updateTomlContent(SAMPLE, { 'posts.translate': { enabled: false } });
    const parsed = parse(result) as { posts: { translate: { enabled: boolean } } };
    expect(parsed.posts.translate.enabled).toBe(false);
    expect(result).toContain('name = "Your Name"');
  });

  it('should update array values', () => {
    const result = updateTomlContent(SAMPLE, { 'posts.translate': { target_langs: ['ja'] } });
    expect(result).toContain('target_langs = ["ja"]');
  });

  it('should not touch a same-named key in a different section', () => {
    const result = updateTomlContent(SAMPLE, { intro: { name: 'Casper' } });
    expect(result).toContain('name = "Casper"');
    expect(result).toContain('source_root_path = "/source"');
  });

  it('should throw when a key does not exist in the file', () => {
    expect(() => updateTomlContent(SAMPLE, { '': { missing_key: 'x' } })).toThrow(/missing_key/);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run dashboard/server/__tests__/settingsFile.test.ts`
Expected: FAIL — `Cannot find module '../services/settingsFile.ts'`

- [ ] **Step 3: 구현**

`dashboard/server/services/settingsFile.ts` 생성:

```ts
export type TomlValue = string | boolean | number | string[];

export function serializeTomlValue(value: TomlValue): string {
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
  return JSON.stringify(value);
}

// Line-based replacement so comments, ordering, and quoting stay intact.
// `updates` maps section name ('' for top level) → key → new value.
// Throws if any requested key is not present as an active line in the file.
export function updateTomlContent(raw: string, updates: Record<string, Record<string, TomlValue>>): string {
  const pending = new Map<string, Map<string, TomlValue>>();
  for (const [section, kv] of Object.entries(updates)) {
    pending.set(section, new Map(Object.entries(kv)));
  }

  const lines = raw.split('\n');
  let section = '';
  for (let i = 0; i < lines.length; i++) {
    const sectionMatch = lines[i].match(/^\s*\[([^\]]+)\]\s*$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }
    const keyMatch = lines[i].match(/^(\s*)([A-Za-z0-9_-]+)\s*=/);
    if (!keyMatch) continue;
    const kv = pending.get(section);
    if (kv && kv.has(keyMatch[2])) {
      lines[i] = `${keyMatch[1]}${keyMatch[2]} = ${serializeTomlValue(kv.get(keyMatch[2])!)}`;
      kv.delete(keyMatch[2]);
    }
  }

  const leftovers: string[] = [];
  for (const [sec, kv] of pending) {
    for (const key of kv.keys()) {
      leftovers.push(sec ? `${sec}.${key}` : key);
    }
  }
  if (leftovers.length > 0) {
    throw new Error(`Keys not found in setting.toml: ${leftovers.join(', ')}`);
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run dashboard/server/__tests__/settingsFile.test.ts`
Expected: PASS

- [ ] **Step 5: 타입체크 + 커밋**

```bash
npx tsc --noEmit -p dashboard
git add dashboard/server/services/settingsFile.ts dashboard/server/__tests__/settingsFile.test.ts
git commit -m "feat: add comment-preserving setting.toml editor service"
```

---

### Task 6: 잡 러너 서비스 (spawn + 락 + 로그 + 영속화)

**Files:**
- Create: `dashboard/server/services/jobs.ts`
- Test: `dashboard/server/__tests__/jobs.test.ts`

**Interfaces:**
- Consumes: Task 1의 `scripts/sync.ts --source <path>` CLI 계약
- Produces (Task 8이 사용):
  - `type JobType = 'sync' | 'translate' | 'build' | 'preview'`, `type JobStatus = 'running' | 'succeeded' | 'failed' | 'canceled'`
  - `JobRecord = { id, type, status, startedAt, endedAt, exitCode, options: { sourcePath? }, logs: string[] }`
  - `commandFor(type: JobType, options: JobOptions): { cmd: string; args: string[] }`
  - `createJobManager(deps: { projectRoot: string; dataDir: string; spawnFn?: SpawnFn }): JobManager`
  - `JobManager = { start(type, options?): JobRecord; cancel(id): boolean; list(): JobRecord[]; get(id): JobRecord | undefined; onLog(cb: (jobId: string, line: string) => void): () => void }`
  - `class JobLockError extends Error`

- [ ] **Step 1: 실패하는 테스트 작성**

`dashboard/server/__tests__/jobs.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'events';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { commandFor, createJobManager, JobLockError, type SpawnFn } from '../services/jobs.ts';

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill(): boolean {
    this.emit('exit', null);
    return true;
  }
}

function setup(): { manager: ReturnType<typeof createJobManager>; children: FakeChild[]; dataDir: string } {
  const children: FakeChild[] = [];
  const spawnFn: SpawnFn = () => {
    const child = new FakeChild();
    children.push(child);
    return child;
  };
  const dataDir = mkdtempSync(join(tmpdir(), 'girok-jobs-'));
  return { manager: createJobManager({ projectRoot: '/proj', dataDir, spawnFn }), children, dataDir };
}

describe('commandFor', () => {
  it('should run sync via node with optional --source', () => {
    expect(commandFor('sync', {})).toEqual({ cmd: process.execPath, args: ['scripts/sync.ts'] });
    expect(commandFor('sync', { sourcePath: '/vault' })).toEqual({
      cmd: process.execPath,
      args: ['scripts/sync.ts', '--source', '/vault'],
    });
  });

  it('should run build and preview via npm', () => {
    expect(commandFor('build', {})).toEqual({ cmd: 'npm', args: ['run', 'build'] });
    expect(commandFor('preview', {})).toEqual({ cmd: 'npm', args: ['run', 'preview'] });
  });
});

describe('createJobManager', () => {
  it('should collect stdout/stderr lines into logs and notify listeners', () => {
    const { manager, children } = setup();
    const seen: string[] = [];
    manager.onLog((_id, line) => seen.push(line));
    const job = manager.start('sync', {});
    children[0].stdout.emit('data', Buffer.from('line one\nline two\n'));
    children[0].stderr.emit('data', Buffer.from('warn\n'));
    expect(manager.get(job.id)!.logs).toEqual(['line one', 'line two', 'warn']);
    expect(seen).toEqual(['line one', 'line two', 'warn']);
  });

  it('should reject a second non-preview job while one runs', () => {
    const { manager } = setup();
    manager.start('sync', {});
    expect(() => manager.start('build', {})).toThrow(JobLockError);
  });

  it('should allow preview alongside a regular job, but not two previews', () => {
    const { manager } = setup();
    manager.start('preview', {});
    expect(() => manager.start('preview', {})).toThrow(JobLockError);
    expect(() => manager.start('sync', {})).not.toThrow();
  });

  it('should mark success/failure from exit code and persist history', () => {
    const { manager, children, dataDir } = setup();
    const job = manager.start('sync', {});
    children[0].emit('exit', 0);
    expect(manager.get(job.id)!.status).toBe('succeeded');
    const saved = JSON.parse(readFileSync(join(dataDir, 'jobs.json'), 'utf-8')) as Array<{ id: string }>;
    expect(saved[0].id).toBe(job.id);

    const job2 = manager.start('build', {});
    children[1].emit('exit', 1);
    expect(manager.get(job2.id)!.status).toBe('failed');
  });

  it('should mark canceled jobs', () => {
    const { manager, children } = setup();
    const job = manager.start('sync', {});
    // FakeChild.kill() emits exit(null) synchronously.
    expect(manager.cancel(job.id)).toBe(true);
    expect(manager.get(job.id)!.status).toBe('canceled');
  });

  it('should release the lock after a job ends', () => {
    const { manager, children } = setup();
    manager.start('sync', {});
    children[0].emit('exit', 0);
    expect(() => manager.start('build', {})).not.toThrow();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run dashboard/server/__tests__/jobs.test.ts`
Expected: FAIL — `Cannot find module '../services/jobs.ts'`

- [ ] **Step 3: 구현**

`dashboard/server/services/jobs.ts` 생성:

```ts
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export type JobType = 'sync' | 'translate' | 'build' | 'preview';
export type JobStatus = 'running' | 'succeeded' | 'failed' | 'canceled';

export interface JobOptions {
  sourcePath?: string;
}

export interface JobRecord {
  id: string;
  type: JobType;
  status: JobStatus;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  options: JobOptions;
  logs: string[];
}

// Minimal child-process surface so tests can substitute a fake.
export interface ChildLike {
  stdout: { on(event: 'data', cb: (chunk: Buffer | string) => void): unknown } | null;
  stderr: { on(event: 'data', cb: (chunk: Buffer | string) => void): unknown } | null;
  on(event: 'exit', cb: (code: number | null) => void): unknown;
  kill(signal?: NodeJS.Signals): boolean;
}

export type SpawnFn = (cmd: string, args: string[], opts: { cwd: string }) => ChildLike;

export class JobLockError extends Error {}

const MAX_MEMORY_LOG_LINES = 2000;
const MAX_PERSISTED_LOG_LINES = 500;
const MAX_HISTORY = 50;

export function commandFor(type: JobType, options: JobOptions): { cmd: string; args: string[] } {
  switch (type) {
    case 'sync': {
      const args = ['scripts/sync.ts'];
      if (options.sourcePath) args.push('--source', options.sourcePath);
      return { cmd: process.execPath, args };
    }
    case 'translate':
      return { cmd: process.execPath, args: ['scripts/translate.ts'] };
    case 'build':
      return { cmd: 'npm', args: ['run', 'build'] };
    case 'preview':
      return { cmd: 'npm', args: ['run', 'preview'] };
  }
}

export interface JobManager {
  start(type: JobType, options?: JobOptions): JobRecord;
  cancel(id: string): boolean;
  list(): JobRecord[];
  get(id: string): JobRecord | undefined;
  onLog(cb: (jobId: string, line: string) => void): () => void;
}

export function createJobManager(deps: { projectRoot: string; dataDir: string; spawnFn?: SpawnFn }): JobManager {
  const spawnFn: SpawnFn = deps.spawnFn ?? ((cmd, args, opts) => spawn(cmd, args, opts));
  const historyPath = join(deps.dataDir, 'jobs.json');
  const active = new Map<string, { record: JobRecord; child: ChildLike }>();
  const canceled = new Set<string>();
  const listeners = new Set<(jobId: string, line: string) => void>();

  function loadHistory(): JobRecord[] {
    try {
      return JSON.parse(readFileSync(historyPath, 'utf-8')) as JobRecord[];
    } catch {
      return [];
    }
  }

  function persist(record: JobRecord): void {
    if (!existsSync(deps.dataDir)) mkdirSync(deps.dataDir, { recursive: true });
    const trimmed: JobRecord = { ...record, logs: record.logs.slice(-MAX_PERSISTED_LOG_LINES) };
    const history = [trimmed, ...loadHistory()].slice(0, MAX_HISTORY);
    writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
  }

  function appendLog(record: JobRecord, chunk: Buffer | string): void {
    for (const line of chunk.toString().split('\n')) {
      if (line.length === 0) continue;
      record.logs.push(line);
      if (record.logs.length > MAX_MEMORY_LOG_LINES) {
        record.logs.splice(0, record.logs.length - MAX_MEMORY_LOG_LINES);
      }
      for (const cb of listeners) cb(record.id, line);
    }
  }

  function runningOfKind(preview: boolean): JobRecord | undefined {
    for (const { record } of active.values()) {
      if ((record.type === 'preview') === preview && record.status === 'running') return record;
    }
    return undefined;
  }

  return {
    start(type: JobType, options: JobOptions = {}): JobRecord {
      const isPreview = type === 'preview';
      const conflict = runningOfKind(isPreview);
      if (conflict) {
        throw new JobLockError(`A ${conflict.type} job is already running`);
      }

      const record: JobRecord = {
        id: randomUUID(),
        type,
        status: 'running',
        startedAt: new Date().toISOString(),
        endedAt: null,
        exitCode: null,
        options,
        logs: [],
      };
      const { cmd, args } = commandFor(type, options);
      const child = spawnFn(cmd, args, { cwd: deps.projectRoot });
      active.set(record.id, { record, child });

      child.stdout?.on('data', (chunk) => appendLog(record, chunk));
      child.stderr?.on('data', (chunk) => appendLog(record, chunk));
      child.on('exit', (code) => {
        record.endedAt = new Date().toISOString();
        record.exitCode = code;
        record.status = canceled.has(record.id) ? 'canceled' : code === 0 ? 'succeeded' : 'failed';
        canceled.delete(record.id);
        active.delete(record.id);
        persist(record);
      });

      return record;
    },
    cancel(id: string): boolean {
      const entry = active.get(id);
      if (!entry) return false;
      canceled.add(id);
      entry.child.kill('SIGTERM');
      return true;
    },
    list(): JobRecord[] {
      const runningRecords = [...active.values()].map((e) => e.record);
      return [...runningRecords, ...loadHistory()];
    },
    get(id: string): JobRecord | undefined {
      return active.get(id)?.record ?? loadHistory().find((r) => r.id === id);
    },
    onLog(cb: (jobId: string, line: string) => void): () => void {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run dashboard/server/__tests__/jobs.test.ts`
Expected: PASS

- [ ] **Step 5: 타입체크 + 커밋**

```bash
npx tsc --noEmit -p dashboard
git add dashboard/server/services/jobs.ts dashboard/server/__tests__/jobs.test.ts
git commit -m "feat: add job runner service with lock and log streaming"
```

---

### Task 7: 배포 서비스 (git 래퍼)

**Files:**
- Create: `dashboard/server/services/deploy.ts`
- Test: `dashboard/server/__tests__/deploy.test.ts`

**Interfaces:**
- Produces (Task 8이 사용):
  - `DeployStatus = { branch: string; changedFiles: Array<{ status: string; path: string }>; ahead: number }`
  - `DeployRecord = { at: string; message: string; ok: boolean; steps: Array<{ cmd: string; output: string }>; error?: string }`
  - `createDeployService(deps: { projectRoot: string; dataDir: string; execFn?: ExecFn }): DeployService`
  - `DeployService = { status(): Promise<DeployStatus>; deploy(message: string): Promise<DeployRecord>; history(): DeployRecord[] }`

- [ ] **Step 1: 실패하는 테스트 작성**

`dashboard/server/__tests__/deploy.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createDeployService, type ExecFn } from '../services/deploy.ts';

interface Call {
  cmd: string;
  args: string[];
}

function setup(responses: Record<string, string | Error>): {
  service: ReturnType<typeof createDeployService>;
  calls: Call[];
} {
  const calls: Call[] = [];
  const execFn: ExecFn = (cmd, args) => {
    calls.push({ cmd, args });
    const key = args.join(' ');
    const found = Object.entries(responses).find(([prefix]) => key.startsWith(prefix));
    if (found && found[1] instanceof Error) return Promise.reject(found[1]);
    return Promise.resolve({ stdout: (found?.[1] as string | undefined) ?? '', stderr: '' });
  };
  const dataDir = mkdtempSync(join(tmpdir(), 'girok-deploy-'));
  return { service: createDeployService({ projectRoot: '/proj', dataDir, execFn }), calls };
}

describe('deploy status', () => {
  it('should report branch, changed files, and ahead count', async () => {
    const { service } = setup({
      'rev-parse': 'main\n',
      'status': ' M src/a.ts\n?? new.md\n',
      'rev-list': '2\n',
    });
    const status = await service.status();
    expect(status.branch).toBe('main');
    expect(status.changedFiles).toEqual([
      { status: 'M', path: 'src/a.ts' },
      { status: '??', path: 'new.md' },
    ]);
    expect(status.ahead).toBe(2);
  });

  it('should report ahead 0 when there is no upstream', async () => {
    const { service } = setup({
      'rev-parse': 'main\n',
      'status': '',
      'rev-list': new Error('no upstream'),
    });
    expect((await service.status()).ahead).toBe(0);
  });
});

describe('deploy', () => {
  it('should add, commit, and push when there are changes', async () => {
    const { service, calls } = setup({
      'rev-parse': 'main\n',
      'status': ' M src/a.ts\n',
      'rev-list': '0\n',
    });
    const record = await service.deploy('release: update');
    expect(record.ok).toBe(true);
    const gitArgs = calls.map((c) => c.args[0]);
    expect(gitArgs).toContain('add');
    expect(gitArgs).toContain('commit');
    expect(gitArgs).toContain('push');
    expect(service.history()[0].message).toBe('release: update');
  });

  it('should skip commit when there is nothing to commit but still push', async () => {
    const { service, calls } = setup({
      'rev-parse': 'main\n',
      'status': '',
      'rev-list': '1\n',
    });
    const record = await service.deploy('push only');
    expect(record.ok).toBe(true);
    const gitArgs = calls.map((c) => c.args[0]);
    expect(gitArgs).not.toContain('commit');
    expect(gitArgs).toContain('push');
  });

  it('should record a failed deploy with the error message', async () => {
    const { service } = setup({
      'rev-parse': 'main\n',
      'status': '',
      'rev-list': '0\n',
      'push': new Error('remote rejected'),
    });
    const record = await service.deploy('will fail');
    expect(record.ok).toBe(false);
    expect(record.error).toContain('remote rejected');
    expect(service.history()[0].ok).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run dashboard/server/__tests__/deploy.test.ts`
Expected: FAIL — `Cannot find module '../services/deploy.ts'`

- [ ] **Step 3: 구현**

`dashboard/server/services/deploy.ts` 생성:

```ts
import { execFile } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export type ExecFn = (cmd: string, args: string[], opts: { cwd: string }) => Promise<ExecResult>;

const defaultExec: ExecFn = (cmd, args, opts) =>
  new Promise((resolvePromise, reject) => {
    execFile(cmd, args, { cwd: opts.cwd, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${cmd} ${args.join(' ')} failed: ${stderr || error.message}`));
      } else {
        resolvePromise({ stdout, stderr });
      }
    });
  });

export interface ChangedFile {
  status: string;
  path: string;
}

export interface DeployStatus {
  branch: string;
  changedFiles: ChangedFile[];
  ahead: number;
}

export interface DeployStep {
  cmd: string;
  output: string;
}

export interface DeployRecord {
  at: string;
  message: string;
  ok: boolean;
  steps: DeployStep[];
  error?: string;
}

export interface DeployService {
  status(): Promise<DeployStatus>;
  deploy(message: string): Promise<DeployRecord>;
  history(): DeployRecord[];
}

const MAX_HISTORY = 20;

export function createDeployService(deps: { projectRoot: string; dataDir: string; execFn?: ExecFn }): DeployService {
  const execFn = deps.execFn ?? defaultExec;
  const historyPath = join(deps.dataDir, 'deploys.json');

  function git(...args: string[]): Promise<ExecResult> {
    return execFn('git', args, { cwd: deps.projectRoot });
  }

  function loadHistory(): DeployRecord[] {
    try {
      return JSON.parse(readFileSync(historyPath, 'utf-8')) as DeployRecord[];
    } catch {
      return [];
    }
  }

  function persist(record: DeployRecord): void {
    if (!existsSync(deps.dataDir)) mkdirSync(deps.dataDir, { recursive: true });
    writeFileSync(historyPath, JSON.stringify([record, ...loadHistory()].slice(0, MAX_HISTORY), null, 2), 'utf-8');
  }

  async function status(): Promise<DeployStatus> {
    const { stdout: branchOut } = await git('rev-parse', '--abbrev-ref', 'HEAD');
    const { stdout: porcelain } = await git('status', '--porcelain');
    const changedFiles = porcelain
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => ({ status: line.slice(0, 2).trim(), path: line.slice(3) }));
    let ahead = 0;
    try {
      const { stdout } = await git('rev-list', '--count', '@{u}..HEAD');
      ahead = parseInt(stdout.trim(), 10) || 0;
    } catch {
      ahead = 0;
    }
    return { branch: branchOut.trim(), changedFiles, ahead };
  }

  return {
    status,
    async deploy(message: string): Promise<DeployRecord> {
      const record: DeployRecord = { at: new Date().toISOString(), message, ok: false, steps: [] };
      try {
        const current = await status();
        const commands: string[][] = [];
        if (current.changedFiles.length > 0) {
          commands.push(['add', '-A'], ['commit', '-m', message]);
        }
        commands.push(['push']);
        for (const args of commands) {
          const { stdout, stderr } = await git(...args);
          record.steps.push({ cmd: `git ${args.join(' ')}`, output: `${stdout}${stderr}`.trim() });
        }
        record.ok = true;
      } catch (error) {
        record.error = error instanceof Error ? error.message : String(error);
      }
      persist(record);
      return record;
    },
    history(): DeployRecord[] {
      return loadHistory();
    },
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run dashboard/server/__tests__/deploy.test.ts`
Expected: PASS

- [ ] **Step 5: 타입체크 + 커밋**

```bash
npx tsc --noEmit -p dashboard
git add dashboard/server/services/deploy.ts dashboard/server/__tests__/deploy.test.ts
git commit -m "feat: add git deploy service"
```

---

### Task 8: Hono 앱 조립 (라우트 + 인증 미들웨어 + SSE + 엔트리)

**Files:**
- Create: `dashboard/server/app.ts`, `dashboard/server/index.ts`
- Test: `dashboard/server/__tests__/app.test.ts`

**Interfaces:**
- Consumes: Task 2~7의 모든 Produces
- Produces (Task 9~13의 웹 클라이언트가 사용하는 API 계약):
  - `POST /api/auth/login` body `{ password: string }` → 200 `{ ok: true }` + Set-Cookie / 401 `{ error }` / 429 `{ error, retryAfterMs }`
  - `POST /api/auth/logout` → 200, `GET /api/auth/me` → 200 `{ ok: true }` (미인증 시 모든 API가 401 `{ error: 'unauthorized' }`)
  - `GET /api/overview` → `{ counts: Record<DocStatus, number>, total: number, translatedCount: number, pipeline: { lastSyncAt, lastBuildAt, lastDeployAt: string | null }, recentJobs: JobRecord[] }`
  - `GET /api/docs` → `{ sourceRoot: string, docs: DocEntry[] }`
  - `PATCH /api/docs/publish` body `{ path: string, publish: boolean }` → 200 `{ ok: true }` / 400
  - `POST /api/jobs` body `{ type: JobType, options?: { sourcePath?: string } }` → 201 JobRecord / 409(락) / 400
  - `GET /api/jobs` → JobRecord[], `POST /api/jobs/:id/cancel` → `{ ok: boolean }`
  - `GET /api/jobs/:id/stream` → SSE (`event: log` data=라인, `event: done` data=최종 status)
  - `GET /api/deploy/status` → DeployStatus, `POST /api/deploy` body `{ message }` → DeployRecord(실패 시 ok:false), `GET /api/deploy/history` → DeployRecord[]
  - `GET /api/settings` → setting.toml 파싱 객체, `PUT /api/settings` body `{ updates: Record<string, Record<string, TomlValue>> }` → 200 / 400

- [ ] **Step 1: 실패하는 테스트 작성**

`dashboard/server/__tests__/app.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest';
import { createApp, SESSION_COOKIE, type AppDeps } from '../app.ts';
import { createSessionStore, createLoginGuard } from '../auth.ts';
import type { JobManager, JobRecord } from '../services/jobs.ts';
import type { DeployService } from '../services/deploy.ts';

function stubJobs(): JobManager {
  return {
    start: (type): JobRecord => ({
      id: 'job-1', type, status: 'running', startedAt: 'now', endedAt: null, exitCode: null, options: {}, logs: [],
    }),
    cancel: () => true,
    list: () => [],
    get: () => undefined,
    onLog: () => () => undefined,
  };
}

function stubDeploy(): DeployService {
  return {
    status: () => Promise.resolve({ branch: 'main', changedFiles: [], ahead: 0 }),
    deploy: (message) => Promise.resolve({ at: 'now', message, ok: true, steps: [] }),
    history: () => [],
  };
}

function makeApp(): ReturnType<typeof createApp> {
  const deps: AppDeps = {
    password: 'pw',
    sessions: createSessionStore(),
    guard: createLoginGuard(2, 30_000),
    jobs: stubJobs(),
    deployService: stubDeploy(),
    projectRoot: process.cwd(),
  };
  return createApp(deps);
}

async function loginCookie(app: ReturnType<typeof createApp>): Promise<string> {
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'pw' }),
  });
  const setCookie = res.headers.get('set-cookie') ?? '';
  return setCookie.split(';')[0];
}

describe('auth flow', () => {
  it('should reject API calls without a session', async () => {
    const app = makeApp();
    const res = await app.request('/api/jobs');
    expect(res.status).toBe(401);
  });

  it('should login with the right password and access the API', async () => {
    const app = makeApp();
    const cookie = await loginCookie(app);
    expect(cookie).toContain(SESSION_COOKIE);
    const res = await app.request('/api/auth/me', { headers: { cookie } });
    expect(res.status).toBe(200);
  });

  it('should reject a wrong password and cool down after repeated failures', async () => {
    const app = makeApp();
    const attempt = (): Promise<Response> =>
      app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'nope' }),
      });
    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(429);
  });

  it('should logout and invalidate the session', async () => {
    const app = makeApp();
    const cookie = await loginCookie(app);
    await app.request('/api/auth/logout', { method: 'POST', headers: { cookie } });
    const res = await app.request('/api/auth/me', { headers: { cookie } });
    expect(res.status).toBe(401);
  });
});

describe('jobs routes', () => {
  it('should reject an unknown job type', async () => {
    const app = makeApp();
    const cookie = await loginCookie(app);
    const res = await app.request('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ type: 'rm-rf' }),
    });
    expect(res.status).toBe(400);
  });

  it('should start a valid job', async () => {
    const app = makeApp();
    const cookie = await loginCookie(app);
    const res = await app.request('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ type: 'sync' }),
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as JobRecord).id).toBe('job-1');
  });
});

describe('publish route validation', () => {
  it('should reject a path outside the source root', async () => {
    const app = makeApp();
    const cookie = await loginCookie(app);
    const res = await app.request('/api/docs/publish', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ path: '/etc/passwd', publish: true }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run dashboard/server/__tests__/app.test.ts`
Expected: FAIL — `Cannot find module '../app.ts'`

- [ ] **Step 3: app.ts 구현**

`dashboard/server/app.ts` 생성:

```ts
import { readFileSync, writeFileSync } from 'fs';
import { join, resolve, sep } from 'path';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';
import { parse } from 'smol-toml';
import { verifyPassword, type LoginGuard, type SessionStore } from './auth.ts';
import { scanDocuments, type DocStatus } from './services/docStatus.ts';
import { setPublishFlag } from './services/publishToggle.ts';
import { updateTomlContent, type TomlValue } from './services/settingsFile.ts';
import { JobLockError, type JobManager, type JobType } from './services/jobs.ts';
import type { DeployService } from './services/deploy.ts';

export const SESSION_COOKIE = 'girok_session';

const JOB_TYPES: JobType[] = ['sync', 'translate', 'build', 'preview'];

export interface AppDeps {
  password: string;
  sessions: SessionStore;
  guard: LoginGuard;
  jobs: JobManager;
  deployService: DeployService;
  projectRoot: string;
}

interface SettingsShape {
  source_root_path: string;
  [key: string]: unknown;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const settingPath = join(deps.projectRoot, 'setting.toml');
  const postsDir = join(deps.projectRoot, 'src', 'content', 'posts');
  const distDir = join(deps.projectRoot, 'dist');

  function loadSettings(): SettingsShape {
    return parse(readFileSync(settingPath, 'utf-8')) as unknown as SettingsShape;
  }

  app.use('/api/*', async (c, next) => {
    if (c.req.path === '/api/auth/login') return next();
    const token = getCookie(c, SESSION_COOKIE);
    if (!token || !deps.sessions.has(token)) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    return next();
  });

  app.post('/api/auth/login', async (c) => {
    const check = deps.guard.canAttempt(Date.now());
    if (!check.allowed) {
      return c.json({ error: 'too many attempts', retryAfterMs: check.retryAfterMs }, 429);
    }
    const body = (await c.req.json().catch(() => ({}))) as { password?: string };
    if (typeof body.password !== 'string' || !verifyPassword(body.password, deps.password)) {
      deps.guard.recordFailure(Date.now());
      return c.json({ error: 'invalid password' }, 401);
    }
    deps.guard.reset();
    const token = deps.sessions.create();
    setCookie(c, SESSION_COOKIE, token, { httpOnly: true, sameSite: 'Strict', path: '/' });
    return c.json({ ok: true });
  });

  app.post('/api/auth/logout', (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) deps.sessions.destroy(token);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  app.get('/api/auth/me', (c) => c.json({ ok: true }));

  app.get('/api/docs', (c) => {
    const settings = loadSettings();
    const sourceRoot = resolve(settings.source_root_path);
    return c.json({ sourceRoot, docs: scanDocuments(sourceRoot, postsDir, distDir) });
  });

  app.patch('/api/docs/publish', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { path?: string; publish?: boolean };
    if (typeof body.path !== 'string' || typeof body.publish !== 'boolean') {
      return c.json({ error: 'path and publish are required' }, 400);
    }
    const settings = loadSettings();
    const sourceRoot = resolve(settings.source_root_path);
    const target = resolve(body.path);
    if (!target.startsWith(sourceRoot + sep) || !target.endsWith('.md')) {
      return c.json({ error: 'path must be a markdown file inside the source root' }, 400);
    }
    try {
      setPublishFlag(target, body.publish);
      return c.json({ ok: true });
    } catch (error) {
      return c.json({ error: 'failed to update publish flag', detail: String(error) }, 500);
    }
  });

  app.get('/api/overview', (c) => {
    const settings = loadSettings();
    const sourceRoot = resolve(settings.source_root_path);
    const docs = scanDocuments(sourceRoot, postsDir, distDir);
    const counts: Record<DocStatus, number> = { draft: 0, pending: 0, synced: 0, built: 0, orphaned: 0 };
    for (const doc of docs) counts[doc.status] += 1;
    const jobs = deps.jobs.list();
    const lastOf = (type: JobType): string | null =>
      jobs.find((j) => j.type === type && j.status === 'succeeded')?.endedAt ?? null;
    const lastDeploy = deps.deployService.history().find((d) => d.ok) ?? null;
    return c.json({
      counts,
      total: docs.length,
      translatedCount: docs.filter((d) => d.translations.length > 0).length,
      pipeline: {
        lastSyncAt: lastOf('sync'),
        lastBuildAt: lastOf('build'),
        lastDeployAt: lastDeploy ? lastDeploy.at : null,
      },
      recentJobs: jobs.slice(0, 10),
    });
  });

  app.post('/api/jobs', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      type?: string;
      options?: { sourcePath?: string };
    };
    if (!JOB_TYPES.includes(body.type as JobType)) {
      return c.json({ error: `type must be one of: ${JOB_TYPES.join(', ')}` }, 400);
    }
    try {
      const record = deps.jobs.start(body.type as JobType, body.options ?? {});
      return c.json(record, 201);
    } catch (error) {
      if (error instanceof JobLockError) return c.json({ error: error.message }, 409);
      return c.json({ error: 'failed to start job', detail: String(error) }, 500);
    }
  });

  app.get('/api/jobs', (c) => c.json(deps.jobs.list()));

  app.post('/api/jobs/:id/cancel', (c) => c.json({ ok: deps.jobs.cancel(c.req.param('id')) }));

  app.get('/api/jobs/:id/stream', (c) => {
    const id = c.req.param('id');
    const job = deps.jobs.get(id);
    if (!job) return c.json({ error: 'job not found' }, 404);
    return streamSSE(c, async (stream) => {
      for (const line of job.logs) {
        await stream.writeSSE({ event: 'log', data: line });
      }
      if (job.status !== 'running') {
        await stream.writeSSE({ event: 'done', data: job.status });
        return;
      }
      await new Promise<void>((resolveWait) => {
        const unsubscribe = deps.jobs.onLog((jobId, line) => {
          if (jobId === id) void stream.writeSSE({ event: 'log', data: line });
        });
        // Poll for terminal state: the exit handler runs outside this stream.
        const timer = setInterval(() => {
          const current = deps.jobs.get(id);
          if (!current || current.status !== 'running') {
            clearInterval(timer);
            unsubscribe();
            void stream
              .writeSSE({ event: 'done', data: current ? current.status : 'failed' })
              .then(() => resolveWait());
          }
        }, 500);
        stream.onAbort(() => {
          clearInterval(timer);
          unsubscribe();
          resolveWait();
        });
      });
    });
  });

  app.get('/api/deploy/status', async (c) => {
    try {
      return c.json(await deps.deployService.status());
    } catch (error) {
      return c.json({ error: 'git status failed', detail: String(error) }, 500);
    }
  });

  app.post('/api/deploy', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { message?: string };
    if (typeof body.message !== 'string' || body.message.trim().length === 0) {
      return c.json({ error: 'commit message is required' }, 400);
    }
    return c.json(await deps.deployService.deploy(body.message.trim()));
  });

  app.get('/api/deploy/history', (c) => c.json(deps.deployService.history()));

  app.get('/api/settings', (c) => c.json(loadSettings()));

  app.put('/api/settings', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      updates?: Record<string, Record<string, TomlValue>>;
    };
    if (!body.updates || typeof body.updates !== 'object') {
      return c.json({ error: 'updates object is required' }, 400);
    }
    try {
      const raw = readFileSync(settingPath, 'utf-8');
      writeFileSync(settingPath, updateTomlContent(raw, body.updates), 'utf-8');
      return c.json({ ok: true });
    } catch (error) {
      return c.json({ error: 'failed to update settings', detail: String(error) }, 400);
    }
  });

  return app;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run dashboard/server/__tests__/app.test.ts`
Expected: PASS

- [ ] **Step 5: index.ts 엔트리 구현**

`dashboard/server/index.ts` 생성:

```ts
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.ts';
import { createLoginGuard, createSessionStore } from './auth.ts';
import { createJobManager } from './services/jobs.ts';
import { createDeployService } from './services/deploy.ts';

const projectRoot = resolve(import.meta.dirname, '..', '..');

const envPath = join(projectRoot, '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const password = process.env.DASHBOARD_PASSWORD;
if (!password) {
  console.error('❌ DASHBOARD_PASSWORD is not set.');
  console.error('   Copy .env.example to .env and set your password.');
  process.exit(1);
}

const dataDir = join(projectRoot, 'dashboard', '.data');
const app = createApp({
  password,
  sessions: createSessionStore(),
  guard: createLoginGuard(),
  jobs: createJobManager({ projectRoot, dataDir }),
  deployService: createDeployService({ projectRoot, dataDir }),
  projectRoot,
});

// Static SPA serving. serveStatic paths are relative to the process cwd,
// and every npm script runs from the project root.
const webDistAbs = join(projectRoot, 'dashboard', 'web', 'dist');
app.use('/*', serveStatic({ root: 'dashboard/web/dist' }));
app.get('*', (c) => {
  const indexPath = join(webDistAbs, 'index.html');
  if (!existsSync(indexPath)) {
    return c.text('Dashboard UI is not built yet. Run: npm run dashboard:build', 503);
  }
  return c.html(readFileSync(indexPath, 'utf-8'));
});

serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 4322 }, (info) => {
  console.log(`✅ girok-md dashboard: http://127.0.0.1:${info.port}`);
});
```

- [ ] **Step 6: 서버 기동 스모크 테스트**

```bash
cp .env.example .env 2>/dev/null || true   # .env가 없을 때만 생성 (있으면 건드리지 않음)
node dashboard/server/index.ts &
sleep 2
curl -s http://127.0.0.1:4322/api/auth/me   # {"error":"unauthorized"} 기대
curl -s -X POST http://127.0.0.1:4322/api/auth/login -H 'content-type: application/json' -d '{"password":"change-me"}'
kill %1
```

Expected: 첫 curl은 401 JSON, 둘째 curl은 `.env`의 비밀번호와 일치하면 `{"ok":true}` (기본 change-me)

- [ ] **Step 7: 전체 테스트 + 타입체크 + 커밋**

```bash
npx vitest run
npx tsc --noEmit -p dashboard
git add dashboard/server/
git commit -m "feat: add dashboard API server with auth, jobs, deploy routes"
```

---

### Task 9: 웹 스캐폴딩 + API 클라이언트 + 로그인 + 셸

**Files:**
- Create: `dashboard/web/vite.config.ts`, `dashboard/web/tsconfig.json`, `dashboard/web/index.html`,
  `dashboard/web/src/main.tsx`, `dashboard/web/src/theme.css`, `dashboard/web/src/api.ts`,
  `dashboard/web/src/App.tsx`, `dashboard/web/src/components/Login.tsx`, `dashboard/web/src/components/Shell.tsx`,
  `dashboard/web/src/components/StatusBadge.tsx`
- 페이지 5개는 이 태스크에서 placeholder로 만들고 Task 10~13에서 완성

**Interfaces:**
- Consumes: Task 8의 API 계약
- Produces (Task 10~13이 사용):
  - `api` 객체 전체 (아래 코드의 시그니처가 계약), `ApiError { status, retryAfterMs? }`
  - `StatusBadge({ status }: { status: DocStatus }): JSX.Element`
  - 각 페이지는 props 없는 `(): JSX.Element` 컴포넌트로 `Shell`이 렌더

프론트엔드는 단위 테스트 없음(스펙 범위 밖) — 검증은 타입체크 + 프로덕션 빌드 + Task 14 실기동.

- [ ] **Step 1: 설정/엔트리 파일 작성**

`dashboard/web/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 4323,
    proxy: { '/api': 'http://127.0.0.1:4322' },
  },
});
```

`dashboard/web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "lib": ["es2022", "dom", "dom.iterable"]
  },
  "include": ["src"]
}
```

`dashboard/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>girok.md dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`dashboard/web/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './theme.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`dashboard/web/src/theme.css` (neo-brutalism 토큰 + 다크모드):

```css
@import 'tailwindcss';

:root {
  --paper: #f4f1e8;
  --panel: #ffffff;
  --ink: #141414;
  --muted: #6b6b6b;
  --accent: #ff5f1f;
  --ok: #16a34a;
  --warn: #ca8a04;
  --err: #dc2626;
  --shadow: #141414;
}

@media (prefers-color-scheme: dark) {
  :root {
    --paper: #17161a;
    --panel: #201f24;
    --ink: #f0ede6;
    --muted: #a09d96;
    --shadow: #000000;
  }
}

@theme inline {
  --color-paper: var(--paper);
  --color-panel: var(--panel);
  --color-ink: var(--ink);
  --color-muted: var(--muted);
  --color-accent: var(--accent);
  --color-ok: var(--ok);
  --color-warn: var(--warn);
  --color-err: var(--err);
}

@layer components {
  .brutal {
    border: 3px solid var(--ink);
    box-shadow: 4px 4px 0 var(--shadow);
    background: var(--panel);
  }
  .brutal-btn {
    border: 3px solid var(--ink);
    box-shadow: 3px 3px 0 var(--shadow);
    background: var(--accent);
    color: #fff;
    font-weight: 700;
    padding: 0.5rem 1rem;
    cursor: pointer;
    transition: transform 0.05s ease, box-shadow 0.05s ease;
  }
  .brutal-btn:hover:not(:disabled) {
    transform: translate(1px, 1px);
    box-shadow: 2px 2px 0 var(--shadow);
  }
  .brutal-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .brutal-btn-ghost {
    border: 3px solid var(--ink);
    box-shadow: 3px 3px 0 var(--shadow);
    background: var(--panel);
    color: var(--ink);
    font-weight: 700;
    padding: 0.5rem 1rem;
    cursor: pointer;
  }
  .brutal-input {
    border: 3px solid var(--ink);
    background: var(--panel);
    color: var(--ink);
    padding: 0.5rem 0.75rem;
    outline: none;
    width: 100%;
  }
}

body {
  background: var(--paper);
  color: var(--ink);
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
}
```

- [ ] **Step 2: API 클라이언트 작성**

`dashboard/web/src/api.ts` (서버 응답 타입 미러 + fetch 래퍼):

```ts
export type DocStatus = 'draft' | 'pending' | 'synced' | 'built' | 'orphaned';

export interface DocEntry {
  slug: string;
  title: string;
  status: DocStatus;
  sourcePath: string | null;
  relPath: string | null;
  publish: boolean;
  tags: string[];
  modified: string | null;
  lastSyncAt: string | null;
  translations: string[];
  warnings: string[];
}

export type JobType = 'sync' | 'translate' | 'build' | 'preview';
export type JobStatus = 'running' | 'succeeded' | 'failed' | 'canceled';

export interface JobRecord {
  id: string;
  type: JobType;
  status: JobStatus;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  options: { sourcePath?: string };
  logs: string[];
}

export interface Overview {
  counts: Record<DocStatus, number>;
  total: number;
  translatedCount: number;
  pipeline: { lastSyncAt: string | null; lastBuildAt: string | null; lastDeployAt: string | null };
  recentJobs: JobRecord[];
}

export interface DeployStatus {
  branch: string;
  changedFiles: Array<{ status: string; path: string }>;
  ahead: number;
}

export interface DeployRecord {
  at: string;
  message: string;
  ok: boolean;
  steps: Array<{ cmd: string; output: string }>;
  error?: string;
}

export type TomlValue = string | boolean | number | string[];

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfterMs?: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; retryAfterMs?: number };
    throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`, body.retryAfterMs);
  }
  return res.json() as Promise<T>;
}

export const api = {
  me: (): Promise<{ ok: boolean }> => request('/api/auth/me'),
  login: (password: string): Promise<{ ok: boolean }> =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: (): Promise<{ ok: boolean }> => request('/api/auth/logout', { method: 'POST' }),
  overview: (): Promise<Overview> => request('/api/overview'),
  docs: (): Promise<{ sourceRoot: string; docs: DocEntry[] }> => request('/api/docs'),
  setPublish: (path: string, publish: boolean): Promise<{ ok: boolean }> =>
    request('/api/docs/publish', { method: 'PATCH', body: JSON.stringify({ path, publish }) }),
  jobs: (): Promise<JobRecord[]> => request('/api/jobs'),
  startJob: (type: JobType, options?: { sourcePath?: string }): Promise<JobRecord> =>
    request('/api/jobs', { method: 'POST', body: JSON.stringify({ type, options }) }),
  cancelJob: (id: string): Promise<{ ok: boolean }> => request(`/api/jobs/${id}/cancel`, { method: 'POST' }),
  deployStatus: (): Promise<DeployStatus> => request('/api/deploy/status'),
  deploy: (message: string): Promise<DeployRecord> =>
    request('/api/deploy', { method: 'POST', body: JSON.stringify({ message }) }),
  deployHistory: (): Promise<DeployRecord[]> => request('/api/deploy/history'),
  settings: (): Promise<Record<string, unknown>> => request('/api/settings'),
  saveSettings: (updates: Record<string, Record<string, TomlValue>>): Promise<{ ok: boolean }> =>
    request('/api/settings', { method: 'PUT', body: JSON.stringify({ updates }) }),
};
```

- [ ] **Step 3: App / Login / Shell / StatusBadge + 페이지 placeholder 작성**

`dashboard/web/src/App.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { api } from './api.ts';
import Login from './components/Login.tsx';
import Shell from './components/Shell.tsx';

type AuthState = 'loading' | 'anon' | 'authed';

export default function App(): JSX.Element {
  const [auth, setAuth] = useState<AuthState>('loading');

  useEffect(() => {
    api
      .me()
      .then(() => setAuth('authed'))
      .catch(() => setAuth('anon'));
  }, []);

  if (auth === 'loading') return <div className="p-10 font-bold">Loading…</div>;
  if (auth === 'anon') return <Login onSuccess={(): void => setAuth('authed')} />;
  return <Shell onLogout={(): void => setAuth('anon')} />;
}
```

`dashboard/web/src/components/Login.tsx`:

```tsx
import { useState } from 'react';
import { api, ApiError } from '../api.ts';

export default function Login({ onSuccess }: { onSuccess: () => void }): JSX.Element {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.status === 429 && err.retryAfterMs !== undefined) {
        setError(`Too many attempts. Retry in ${Math.ceil(err.retryAfterMs / 1000)}s.`);
      } else {
        setError('Invalid password.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="brutal p-8 w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-black">
          girok<span className="text-accent">.md</span> dashboard
        </h1>
        <input
          type="password"
          className="brutal-input"
          placeholder="Password"
          value={password}
          onChange={(e): void => setPassword(e.target.value)}
          autoFocus
        />
        {error && <p className="text-err font-bold text-sm">{error}</p>}
        <button type="submit" className="brutal-btn w-full" disabled={busy || password.length === 0}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
```

`dashboard/web/src/components/Shell.tsx`:

```tsx
import { useState } from 'react';
import { api } from '../api.ts';
import Overview from '../pages/Overview.tsx';
import Documents from '../pages/Documents.tsx';
import Jobs from '../pages/Jobs.tsx';
import Deploy from '../pages/Deploy.tsx';
import Settings from '../pages/Settings.tsx';

type Page = 'overview' | 'documents' | 'jobs' | 'deploy' | 'settings';

const NAV: Array<{ id: Page; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'documents', label: 'Documents' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'deploy', label: 'Deploy' },
  { id: 'settings', label: 'Settings' },
];

export default function Shell({ onLogout }: { onLogout: () => void }): JSX.Element {
  const [page, setPage] = useState<Page>('overview');

  async function logout(): Promise<void> {
    await api.logout().catch(() => undefined);
    onLogout();
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 shrink-0 border-r-4 border-ink p-4 flex flex-col gap-2">
        <h1 className="text-xl font-black mb-4">
          girok<span className="text-accent">.md</span>
        </h1>
        {NAV.map((item) => (
          <button
            key={item.id}
            onClick={(): void => setPage(item.id)}
            className={`text-left font-bold px-3 py-2 border-[3px] ${
              page === item.id ? 'brutal bg-accent text-white' : 'border-transparent hover:border-ink'
            }`}
          >
            {item.label}
          </button>
        ))}
        <button onClick={(): void => void logout()} className="brutal-btn-ghost mt-auto text-sm">
          Sign out
        </button>
      </aside>
      <main className="flex-1 p-8 overflow-x-auto">
        {page === 'overview' && <Overview />}
        {page === 'documents' && <Documents />}
        {page === 'jobs' && <Jobs />}
        {page === 'deploy' && <Deploy />}
        {page === 'settings' && <Settings />}
      </main>
    </div>
  );
}
```

`dashboard/web/src/components/StatusBadge.tsx`:

```tsx
import type { DocStatus } from '../api.ts';

const STYLES: Record<DocStatus, string> = {
  draft: 'bg-panel text-muted',
  pending: 'bg-warn text-white',
  synced: 'bg-ok text-white',
  built: 'bg-accent text-white',
  orphaned: 'bg-err text-white',
};

export default function StatusBadge({ status }: { status: DocStatus }): JSX.Element {
  return (
    <span className={`inline-block border-2 border-ink px-2 py-0.5 text-xs font-black uppercase ${STYLES[status]}`}>
      {status}
    </span>
  );
}
```

페이지 placeholder 5개 생성 — `dashboard/web/src/pages/Overview.tsx`, `Documents.tsx`, `Jobs.tsx`, `Deploy.tsx`, `Settings.tsx` 각각 (컴포넌트명만 파일에 맞게 변경):

```tsx
export default function Overview(): JSX.Element {
  return <h2 className="text-2xl font-black">Overview</h2>;
}
```

- [ ] **Step 4: 타입체크 + 빌드 검증**

```bash
npx tsc --noEmit -p dashboard/web
npm run dashboard:build
```

Expected: 둘 다 에러 없음, `dashboard/web/dist/index.html` 생성

- [ ] **Step 5: 로그인 실기동 확인**

```bash
node dashboard/server/index.ts &
sleep 2
curl -s http://127.0.0.1:4322/ | head -3   # 빌드된 index.html이 서빙되는지 확인
kill %1
```

Expected: `<!doctype html>`로 시작하는 HTML

- [ ] **Step 6: 커밋**

```bash
git add dashboard/web/
git commit -m "feat: add dashboard web shell with login and navigation"
```

---

### Task 10: Overview 페이지

**Files:**
- Modify: `dashboard/web/src/pages/Overview.tsx` (placeholder 교체)

**Interfaces:**
- Consumes: `api.overview()` → `Overview` 타입, `StatusBadge`

- [ ] **Step 1: 구현**

`dashboard/web/src/pages/Overview.tsx` 전체 교체:

```tsx
import { useEffect, useState } from 'react';
import { api, type Overview as OverviewData, type DocStatus } from '../api.ts';
import StatusBadge from '../components/StatusBadge.tsx';

const STATUS_ORDER: DocStatus[] = ['draft', 'pending', 'synced', 'built', 'orphaned'];

function formatTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—';
}

export default function Overview(): JSX.Element {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.overview().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="text-err font-bold">Failed to load overview: {error}</p>;
  if (!data) return <p className="font-bold">Loading…</p>;

  const pipeline: Array<{ label: string; at: string | null }> = [
    { label: 'Last sync', at: data.pipeline.lastSyncAt },
    { label: 'Last build', at: data.pipeline.lastBuildAt },
    { label: 'Last deploy', at: data.pipeline.lastDeployAt },
  ];

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-black">Overview</h2>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="brutal p-4">
          <p className="text-3xl font-black">{data.total}</p>
          <p className="text-sm font-bold text-muted">documents</p>
        </div>
        {STATUS_ORDER.map((status) => (
          <div key={status} className="brutal p-4">
            <p className="text-3xl font-black">{data.counts[status]}</p>
            <StatusBadge status={status} />
          </div>
        ))}
      </div>

      <div className="brutal p-4">
        <h3 className="font-black mb-3">Pipeline</h3>
        <div className="flex flex-wrap items-center gap-3">
          {pipeline.map((step, i) => (
            <div key={step.label} className="flex items-center gap-3">
              {i > 0 && <span className="font-black text-accent">→</span>}
              <div className="border-2 border-ink px-3 py-2">
                <p className="text-xs font-black uppercase">{step.label}</p>
                <p className="text-sm">{formatTime(step.at)}</p>
              </div>
            </div>
          ))}
          <span className="text-sm font-bold text-muted ml-2">{data.translatedCount} translated</span>
        </div>
      </div>

      <div className="brutal p-4">
        <h3 className="font-black mb-3">Recent jobs</h3>
        {data.recentJobs.length === 0 && <p className="text-sm text-muted">No jobs yet.</p>}
        <ul className="space-y-1">
          {data.recentJobs.map((job) => (
            <li key={job.id} className="flex gap-3 text-sm font-bold">
              <span className="uppercase w-20">{job.type}</span>
              <span
                className={
                  job.status === 'succeeded' ? 'text-ok' : job.status === 'failed' ? 'text-err' : 'text-muted'
                }
              >
                {job.status}
              </span>
              <span className="text-muted">{formatTime(job.startedAt)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 검증 + 커밋**

```bash
npx tsc --noEmit -p dashboard/web && npm run dashboard:build
git add dashboard/web/src/pages/Overview.tsx
git commit -m "feat: add overview page with pipeline and stats"
```

---

### Task 11: Documents 페이지 (테이블 + 상세 + publish 토글)

**Files:**
- Modify: `dashboard/web/src/pages/Documents.tsx` (placeholder 교체)

**Interfaces:**
- Consumes: `api.docs()`, `api.setPublish(path, publish)`, `StatusBadge`

- [ ] **Step 1: 구현**

`dashboard/web/src/pages/Documents.tsx` 전체 교체:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { api, type DocEntry, type DocStatus } from '../api.ts';
import StatusBadge from '../components/StatusBadge.tsx';

const FILTERS: Array<DocStatus | 'all'> = ['all', 'draft', 'pending', 'synced', 'built', 'orphaned'];

export default function Documents(): JSX.Element {
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [filter, setFilter] = useState<DocStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<DocEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  function load(): void {
    api
      .docs()
      .then((res) => {
        setDocs(res.docs);
        setSelected((prev) => (prev ? res.docs.find((d) => d.slug === prev.slug) ?? null : null));
      })
      .catch((e: Error) => setError(e.message));
  }

  useEffect(load, []);

  const visible = useMemo(() => {
    const q = query.toLowerCase();
    return docs
      .filter((d) => filter === 'all' || d.status === filter)
      .filter((d) => q.length === 0 || d.title.toLowerCase().includes(q) || d.tags.some((t) => t.toLowerCase().includes(q)))
      .sort((a, b) => (b.modified ?? '').localeCompare(a.modified ?? ''));
  }, [docs, filter, query]);

  async function togglePublish(doc: DocEntry): Promise<void> {
    if (!doc.sourcePath) return;
    setToggling(true);
    setError(null);
    try {
      await api.setPublish(doc.sourcePath, !doc.publish);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-black">Documents</h2>
      {error && <p className="text-err font-bold">{error}</p>}

      <div className="flex flex-wrap gap-2 items-center">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={(): void => setFilter(f)}
            className={`px-3 py-1 border-2 border-ink text-sm font-bold ${filter === f ? 'bg-ink text-paper' : ''}`}
          >
            {f}
          </button>
        ))}
        <input
          className="brutal-input max-w-xs ml-auto"
          placeholder="Search title or tag…"
          value={query}
          onChange={(e): void => setQuery(e.target.value)}
        />
      </div>

      <div className="flex gap-4 items-start">
        <div className="brutal flex-1 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-[3px] border-ink text-left">
                <th className="p-3">Title</th>
                <th className="p-3">Status</th>
                <th className="p-3">Tags</th>
                <th className="p-3">Modified</th>
                <th className="p-3">Langs</th>
                <th className="p-3">⚠</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((doc) => (
                <tr
                  key={doc.slug}
                  onClick={(): void => setSelected(doc)}
                  className={`border-b border-muted/30 cursor-pointer hover:bg-accent/10 ${
                    selected?.slug === doc.slug ? 'bg-accent/20' : ''
                  }`}
                >
                  <td className="p-3 font-bold">{doc.title}</td>
                  <td className="p-3"><StatusBadge status={doc.status} /></td>
                  <td className="p-3 text-muted">{doc.tags.join(', ')}</td>
                  <td className="p-3 text-muted">{doc.modified ? new Date(doc.modified).toLocaleDateString() : '—'}</td>
                  <td className="p-3 text-muted">{doc.translations.join(', ')}</td>
                  <td className="p-3 font-bold text-warn">{doc.warnings.length > 0 ? doc.warnings.length : ''}</td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td className="p-4 text-muted" colSpan={6}>No documents.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {selected && (
          <aside className="brutal p-4 w-80 shrink-0 space-y-3">
            <h3 className="font-black break-all">{selected.title}</h3>
            <StatusBadge status={selected.status} />
            <dl className="text-sm space-y-1">
              <div><dt className="font-bold inline">slug: </dt><dd className="inline break-all">{selected.slug}</dd></div>
              <div><dt className="font-bold inline">source: </dt><dd className="inline break-all">{selected.relPath ?? '(removed)'}</dd></div>
              <div><dt className="font-bold inline">last sync: </dt><dd className="inline">{selected.lastSyncAt ?? '—'}</dd></div>
              <div><dt className="font-bold inline">translations: </dt><dd className="inline">{selected.translations.join(', ') || '—'}</dd></div>
            </dl>
            {selected.warnings.length > 0 && (
              <div>
                <p className="font-bold text-sm text-warn">Warnings</p>
                <ul className="text-xs space-y-1">
                  {selected.warnings.map((w) => (
                    <li key={w}>⚠ {w}</li>
                  ))}
                </ul>
              </div>
            )}
            {selected.sourcePath ? (
              <button className="brutal-btn w-full" disabled={toggling} onClick={(): void => void togglePublish(selected)}>
                {selected.publish ? 'Unpublish' : 'Publish'}
              </button>
            ) : (
              <p className="text-xs text-muted">Source file is gone — this post will be removed on next sync.</p>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 검증 + 커밋**

```bash
npx tsc --noEmit -p dashboard/web && npm run dashboard:build
git add dashboard/web/src/pages/Documents.tsx
git commit -m "feat: add documents page with status table and publish toggle"
```

---

### Task 12: Jobs 페이지 (실행 + SSE 로그 + 히스토리)

**Files:**
- Create: `dashboard/web/src/components/LogView.tsx`
- Modify: `dashboard/web/src/pages/Jobs.tsx` (placeholder 교체)

**Interfaces:**
- Consumes: `api.jobs()`, `api.startJob()`, `api.cancelJob()`, SSE `GET /api/jobs/:id/stream` (`event: log`, `event: done`)
- Produces: `LogView({ lines }: { lines: string[] }): JSX.Element` (Deploy 페이지도 재사용 가능)

- [ ] **Step 1: LogView 작성**

`dashboard/web/src/components/LogView.tsx`:

```tsx
import { useEffect, useRef } from 'react';

export default function LogView({ lines }: { lines: string[] }): JSX.Element {
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);

  return (
    <pre ref={ref} className="brutal p-3 text-xs font-mono h-72 overflow-y-auto whitespace-pre-wrap bg-ink text-paper">
      {lines.length > 0 ? lines.join('\n') : 'No output yet.'}
    </pre>
  );
}
```

- [ ] **Step 2: Jobs 페이지 구현**

`dashboard/web/src/pages/Jobs.tsx` 전체 교체:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type JobRecord, type JobType } from '../api.ts';
import LogView from '../components/LogView.tsx';

const JOB_TYPES: Array<{ type: JobType; label: string; hint: string }> = [
  { type: 'sync', label: 'Sync', hint: 'Vault → posts' },
  { type: 'translate', label: 'Translate', hint: 'Auto-translate posts' },
  { type: 'build', label: 'Build', hint: 'astro build + pagefind' },
  { type: 'preview', label: 'Preview', hint: 'Serve dist at :4321' },
];

export default function Jobs(): JSX.Element {
  const [history, setHistory] = useState<JobRecord[]>([]);
  const [sourcePath, setSourcePath] = useState('');
  const [activeJob, setActiveJob] = useState<JobRecord | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const refresh = useCallback((): void => {
    api.jobs().then(setHistory).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    refresh();
    return (): void => eventSourceRef.current?.close();
  }, [refresh]);

  function watch(job: JobRecord): void {
    eventSourceRef.current?.close();
    setActiveJob(job);
    setLogs([]);
    const es = new EventSource(`/api/jobs/${job.id}/stream`);
    es.addEventListener('log', (e) => setLogs((prev) => [...prev, (e as MessageEvent<string>).data]));
    es.addEventListener('done', (e) => {
      setActiveJob((prev) => (prev ? { ...prev, status: (e as MessageEvent<string>).data as JobRecord['status'] } : prev));
      es.close();
      refresh();
    });
    es.onerror = (): void => es.close();
    eventSourceRef.current = es;
  }

  async function start(type: JobType): Promise<void> {
    setError(null);
    try {
      const options = type === 'sync' && sourcePath.trim().length > 0 ? { sourcePath: sourcePath.trim() } : undefined;
      const job = await api.startJob(type, options);
      watch(job);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? `Blocked: ${e.message}` : String(e));
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-black">Jobs</h2>
      {error && <p className="text-err font-bold">{error}</p>}

      <div className="brutal p-4 space-y-4">
        <div className="flex flex-wrap gap-3">
          {JOB_TYPES.map((jt) => (
            <button key={jt.type} className="brutal-btn" onClick={(): void => void start(jt.type)} title={jt.hint}>
              {jt.label}
            </button>
          ))}
        </div>
        <div>
          <label className="text-sm font-bold block mb-1">
            Source folder override (sync only — empty = setting.toml)
          </label>
          <input
            className="brutal-input max-w-lg"
            placeholder="/path/to/obsidian/vault"
            value={sourcePath}
            onChange={(e): void => setSourcePath(e.target.value)}
          />
        </div>
      </div>

      {activeJob && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h3 className="font-black uppercase">{activeJob.type}</h3>
            <span className={`font-bold text-sm ${
              activeJob.status === 'succeeded' ? 'text-ok' : activeJob.status === 'failed' ? 'text-err' : 'text-muted'
            }`}>
              {activeJob.status}
            </span>
            {activeJob.status === 'running' && (
              <button
                className="brutal-btn-ghost text-sm"
                onClick={(): void => void api.cancelJob(activeJob.id).then(refresh)}
              >
                Cancel
              </button>
            )}
          </div>
          <LogView lines={logs} />
        </div>
      )}

      <div className="brutal p-4">
        <h3 className="font-black mb-3">History</h3>
        {history.length === 0 && <p className="text-sm text-muted">No jobs yet.</p>}
        <ul className="space-y-1">
          {history.map((job) => (
            <li key={job.id}>
              <button
                className="w-full text-left flex gap-3 text-sm font-bold hover:bg-accent/10 px-2 py-1"
                onClick={(): void => {
                  setActiveJob(job);
                  setLogs(job.logs);
                  if (job.status === 'running') watch(job);
                }}
              >
                <span className="uppercase w-20">{job.type}</span>
                <span className={
                  job.status === 'succeeded' ? 'text-ok' : job.status === 'failed' ? 'text-err' : 'text-muted'
                }>
                  {job.status}
                </span>
                <span className="text-muted">{new Date(job.startedAt).toLocaleString()}</span>
                {job.options.sourcePath && <span className="text-muted truncate">({job.options.sourcePath})</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 검증 + 커밋**

```bash
npx tsc --noEmit -p dashboard/web && npm run dashboard:build
git add dashboard/web/src/components/LogView.tsx dashboard/web/src/pages/Jobs.tsx
git commit -m "feat: add jobs page with live SSE logs and source override"
```

---

### Task 13: Deploy + Settings 페이지

**Files:**
- Modify: `dashboard/web/src/pages/Deploy.tsx`, `dashboard/web/src/pages/Settings.tsx` (placeholder 교체)

**Interfaces:**
- Consumes: `api.deployStatus()`, `api.deploy()`, `api.deployHistory()`, `api.settings()`, `api.saveSettings()`

- [ ] **Step 1: Deploy 페이지 구현**

`dashboard/web/src/pages/Deploy.tsx` 전체 교체 (배포는 2단계 확인 — Deploy 클릭 후 Confirm 버튼이 나타남):

```tsx
import { useCallback, useEffect, useState } from 'react';
import { api, type DeployRecord, type DeployStatus } from '../api.ts';

export default function Deploy(): JSX.Element {
  const [status, setStatus] = useState<DeployStatus | null>(null);
  const [history, setHistory] = useState<DeployRecord[]>([]);
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DeployRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback((): void => {
    api.deployStatus().then(setStatus).catch((e: Error) => setError(e.message));
    api.deployHistory().then(setHistory).catch(() => undefined);
  }, []);

  useEffect(refresh, [refresh]);

  async function deploy(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const record = await api.deploy(message.trim());
      setResult(record);
      setConfirming(false);
      setMessage('');
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const nothingToDo = status !== null && status.changedFiles.length === 0 && status.ahead === 0;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-black">Deploy</h2>
      {error && <p className="text-err font-bold">{error}</p>}

      <div className="brutal p-4 space-y-3">
        <h3 className="font-black">Working tree {status && <span className="text-muted">({status.branch})</span>}</h3>
        {!status && <p className="text-sm text-muted">Loading…</p>}
        {status && status.changedFiles.length === 0 && <p className="text-sm text-muted">No local changes.</p>}
        {status && status.changedFiles.length > 0 && (
          <ul className="text-sm font-mono space-y-0.5">
            {status.changedFiles.map((f) => (
              <li key={f.path}>
                <span className="inline-block w-8 font-bold text-accent">{f.status}</span>
                {f.path}
              </li>
            ))}
          </ul>
        )}
        {status && status.ahead > 0 && (
          <p className="text-sm font-bold">{status.ahead} commit(s) ahead of remote.</p>
        )}

        <div className="space-y-2 pt-2 border-t-2 border-muted/30">
          <input
            className="brutal-input max-w-lg"
            placeholder="Commit message (e.g. release: new posts)"
            value={message}
            onChange={(e): void => { setMessage(e.target.value); setConfirming(false); }}
          />
          {!confirming ? (
            <button
              className="brutal-btn"
              disabled={busy || message.trim().length === 0 || nothingToDo}
              onClick={(): void => setConfirming(true)}
            >
              Deploy…
            </button>
          ) : (
            <div className="flex gap-2 items-center">
              <span className="font-bold text-sm">Commit, push, and publish to GitHub Pages?</span>
              <button className="brutal-btn" disabled={busy} onClick={(): void => void deploy()}>
                {busy ? 'Deploying…' : 'Confirm deploy'}
              </button>
              <button className="brutal-btn-ghost" disabled={busy} onClick={(): void => setConfirming(false)}>
                Cancel
              </button>
            </div>
          )}
          {nothingToDo && <p className="text-xs text-muted">Nothing to commit or push.</p>}
        </div>
      </div>

      {result && (
        <div className="brutal p-4 space-y-2">
          <h3 className="font-black">
            Result: <span className={result.ok ? 'text-ok' : 'text-err'}>{result.ok ? 'success' : 'failed'}</span>
          </h3>
          {result.steps.map((step) => (
            <div key={step.cmd} className="text-sm">
              <p className="font-mono font-bold">$ {step.cmd}</p>
              {step.output && <pre className="font-mono text-xs whitespace-pre-wrap text-muted">{step.output}</pre>}
            </div>
          ))}
          {result.error && <pre className="font-mono text-xs whitespace-pre-wrap text-err">{result.error}</pre>}
        </div>
      )}

      <div className="brutal p-4">
        <h3 className="font-black mb-3">History</h3>
        {history.length === 0 && <p className="text-sm text-muted">No deploys yet.</p>}
        <ul className="space-y-1">
          {history.map((d) => (
            <li key={d.at} className="flex gap-3 text-sm font-bold">
              <span className={d.ok ? 'text-ok' : 'text-err'}>{d.ok ? '✓' : '✗'}</span>
              <span className="text-muted">{new Date(d.at).toLocaleString()}</span>
              <span className="truncate">{d.message}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Settings 페이지 구현**

`dashboard/web/src/pages/Settings.tsx` 전체 교체:

```tsx
import { useEffect, useState } from 'react';
import { api, type TomlValue } from '../api.ts';

interface SettingsForm {
  source_root_path: string;
  blog_name: string;
  site_url: string;
  locale: string;
  translateEnabled: boolean;
  targetLangs: string;
  commentsEnabled: boolean;
  analyticsEnabled: boolean;
}

interface RawSettings {
  source_root_path?: string;
  blog_name?: string;
  site_url?: string;
  locale?: string;
  posts?: { translate?: { enabled?: boolean; target_langs?: string[] } };
  comments?: { enabled?: boolean };
  analytics?: { enabled?: boolean };
}

export default function Settings(): JSX.Element {
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .settings()
      .then((raw) => {
        const s = raw as RawSettings;
        setForm({
          source_root_path: s.source_root_path ?? '',
          blog_name: s.blog_name ?? '',
          site_url: s.site_url ?? '',
          locale: s.locale ?? 'en',
          translateEnabled: s.posts?.translate?.enabled ?? false,
          targetLangs: (s.posts?.translate?.target_langs ?? []).join(', '),
          commentsEnabled: s.comments?.enabled ?? false,
          analyticsEnabled: s.analytics?.enabled ?? false,
        });
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  function set<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]): void {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  }

  async function save(): Promise<void> {
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      const updates: Record<string, Record<string, TomlValue>> = {
        '': {
          source_root_path: form.source_root_path,
          blog_name: form.blog_name,
          site_url: form.site_url,
          locale: form.locale,
        },
        'posts.translate': {
          enabled: form.translateEnabled,
          target_langs: form.targetLangs.split(',').map((s) => s.trim()).filter((s) => s.length > 0),
        },
        comments: { enabled: form.commentsEnabled },
        analytics: { enabled: form.analyticsEnabled },
      };
      await api.saveSettings(updates);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (error && !form) return <p className="text-err font-bold">{error}</p>;
  if (!form) return <p className="font-bold">Loading…</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-2xl font-black">Settings</h2>
      <p className="text-sm text-muted">Edits are written to setting.toml, preserving comments.</p>

      <div className="brutal p-4 space-y-4">
        {(
          [
            ['source_root_path', 'Source root path'],
            ['blog_name', 'Blog name'],
            ['site_url', 'Site URL'],
          ] as Array<[keyof SettingsForm & string, string]>
        ).map(([key, label]) => (
          <div key={key}>
            <label className="text-sm font-bold block mb-1">{label}</label>
            <input
              className="brutal-input"
              value={form[key] as string}
              onChange={(e): void => set(key, e.target.value)}
            />
          </div>
        ))}
        <div>
          <label className="text-sm font-bold block mb-1">Locale</label>
          <select className="brutal-input" value={form.locale} onChange={(e): void => set('locale', e.target.value)}>
            <option value="en">en</option>
            <option value="ko">ko</option>
          </select>
        </div>
      </div>

      <div className="brutal p-4 space-y-4">
        <label className="flex items-center gap-2 font-bold text-sm">
          <input
            type="checkbox"
            checked={form.translateEnabled}
            onChange={(e): void => set('translateEnabled', e.target.checked)}
          />
          Enable translation
        </label>
        <div>
          <label className="text-sm font-bold block mb-1">Target languages (comma-separated)</label>
          <input
            className="brutal-input max-w-xs"
            value={form.targetLangs}
            onChange={(e): void => set('targetLangs', e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 font-bold text-sm">
          <input
            type="checkbox"
            checked={form.commentsEnabled}
            onChange={(e): void => set('commentsEnabled', e.target.checked)}
          />
          Enable comments
        </label>
        <label className="flex items-center gap-2 font-bold text-sm">
          <input
            type="checkbox"
            checked={form.analyticsEnabled}
            onChange={(e): void => set('analyticsEnabled', e.target.checked)}
          />
          Enable analytics
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button className="brutal-btn" disabled={busy} onClick={(): void => void save()}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
        {saved && <span className="text-ok font-bold">Saved.</span>}
        {error && form && <span className="text-err font-bold">{error}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 검증 + 커밋**

```bash
npx tsc --noEmit -p dashboard/web && npm run dashboard:build
git add dashboard/web/src/pages/Deploy.tsx dashboard/web/src/pages/Settings.tsx
git commit -m "feat: add deploy and settings pages"
```

---

### Task 14: 문서화 + 최종 통합 검증

**Files:**
- Modify: `README.md`, `README.ko.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: 전체 태스크의 결과물

- [ ] **Step 1: 문서 업데이트**

`CLAUDE.md`의 명령어 코드 블록에 추가 (`npm run clean` 라인 뒤):

```
npm run dashboard   # 웹 대시보드 빌드 + 실행 (http://127.0.0.1:4322)
```

`CLAUDE.md` 아키텍처 섹션 끝에 추가:

```markdown
### 웹 대시보드

`dashboard/`는 로컬 전용 CMS 어드민이다. `dashboard/server/`(Hono, 127.0.0.1:4322)가 API와 빌드된
SPA(`dashboard/web/`, Vite+React)를 서빙한다. `.env`의 `DASHBOARD_PASSWORD`로 로그인한다.
문서 상태 조회는 `scripts/sync.ts`의 export 함수를 재사용하고, CLI 실행은 spawn으로 기존 스크립트를 호출한다.
```

`README.md`에 섹션 추가 (기존 섹션 구조에 맞춰 Commands/Usage 근처):

```markdown
## Web Dashboard

A local-only admin dashboard for managing your blog pipeline.

```bash
cp .env.example .env   # set DASHBOARD_PASSWORD
npm run dashboard      # build UI + start server at http://127.0.0.1:4322
```

Features: document pipeline status (draft → pending → synced → built), publish flag toggle,
running sync/translate/build/preview with live logs (with an optional source folder override),
one-click git deploy, and setting.toml editing.

For dashboard development: `npm run dashboard:server` + `npm run dashboard:dev` (HMR at :4323).
```

`README.ko.md`에 같은 내용의 한국어 버전 추가:

```markdown
## 웹 대시보드

블로그 파이프라인을 관리하는 로컬 전용 어드민 대시보드입니다.

```bash
cp .env.example .env   # DASHBOARD_PASSWORD 설정
npm run dashboard      # UI 빌드 + 서버 실행 (http://127.0.0.1:4322)
```

기능: 문서 파이프라인 상태(draft → pending → synced → built), publish 플래그 토글,
sync/translate/build/preview 실행과 실시간 로그(소스 폴더 지정 가능), 원클릭 git 배포, setting.toml 편집.

대시보드 개발 시: `npm run dashboard:server` + `npm run dashboard:dev` (HMR, :4323).
```

- [ ] **Step 2: 전체 테스트 + 타입체크**

```bash
npx vitest run
npx tsc --noEmit -p dashboard
npx tsc --noEmit -p dashboard/web
```

Expected: 전체 PASS, 타입 에러 없음

- [ ] **Step 3: 실기동 통합 검증**

```bash
npm run dashboard &
sleep 5
# 1) 미인증 → 401
curl -s http://127.0.0.1:4322/api/docs
# 2) 로그인 → 쿠키 저장
curl -s -c /tmp/girok-cookie.txt -X POST http://127.0.0.1:4322/api/auth/login \
  -H 'content-type: application/json' -d "{\"password\":\"$(grep DASHBOARD_PASSWORD .env | cut -d= -f2)\"}"
# 3) 문서 목록 (setting.toml의 source_root_path 기준)
curl -s -b /tmp/girok-cookie.txt http://127.0.0.1:4322/api/docs | head -c 500
# 4) overview
curl -s -b /tmp/girok-cookie.txt http://127.0.0.1:4322/api/overview
kill %1
```

Expected: 순서대로 401 JSON → `{"ok":true}` → docs JSON → overview JSON

브라우저 확인(수동 또는 agent-browser): `npm run dashboard` 실행 후 http://127.0.0.1:4322 접속 →
로그인 → Overview/Documents/Jobs/Deploy/Settings 각 페이지 렌더 확인, sync 잡 실행해 SSE 로그 출력 확인.

- [ ] **Step 4: 커밋**

```bash
git add README.md README.ko.md CLAUDE.md
git commit -m "docs: document web dashboard usage"
```

---

## Self-Review Notes

- **스펙 커버리지:** 인증(Task 2·8), 문서 상태 모델(Task 3), publish 토글(Task 4·8·11), setting.toml 편집(Task 5·8·13),
  잡 실행+폴더 지정+SSE(Task 1·6·8·12), 배포(Task 7·8·13), 5개 화면(Task 9~13), 에러 처리(각 라우트/페이지),
  테스트 5종(Task 2~8) — 스펙의 모든 섹션에 대응 태스크 존재
- **타입 일관성:** `DocEntry`/`JobRecord`/`DeployStatus`/`DeployRecord`/`TomlValue`는 서버(Task 3·6·7·5)와
  웹 `api.ts`(Task 9)에 동일 형태로 정의 — 필드명 변경 시 양쪽 모두 수정할 것
- **의도적 제외(YAGNI):** 본문 편집, 원격 배포/HTTPS, 잡 스케줄링, 이미지 관리 UI — 스펙의 범위 제외 절 참조

