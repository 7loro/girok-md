# CLAUDE.md

이 파일은 Claude Code(claude.ai/code)가 이 레포지토리에서 작업할 때 참고하는 가이드입니다.

## 언어

항상 한국어로 사고하고 응답한다. 코드 내부의 변수명, 주석, 커밋 메시지 등 코드 작성 관련 요소는 기존 코드베이스 컨벤션(영어)을 따른다. 주석은 반드시 영어로 작성한다.

## 프로젝트 개요

**girok-md**는 Obsidian 마크다운 파일을 블로그로 변환하는 Astro 5.x 기반 정적 사이트 생성기(SSG)이다. 소스 볼트에서 마크다운을 동기화하고, Obsidian 전용 문법(위키링크, 콜아웃, 이미지 임베드)을 처리하여 검색, 다국어, 댓글, 분석 기능을 갖춘 정적 사이트를 생성한다.

## 명령어

```bash
npm run dev          # 개발 서버 (localhost:4321)
npm run build        # 프로덕션 빌드 (postbuild로 pagefind 인덱싱 자동 실행)
npm run preview      # 프로덕션 빌드 미리보기
npm run sync         # setting.toml의 source_root_path에서 마크다운 동기화
npm run translate    # 포스트 자동 번역
npm run clean        # 생성 파일 정리
npm run dashboard    # 웹 대시보드 빌드 + 실행 (http://127.0.0.1:4322)
npm test             # 전체 테스트 실행 (vitest, watch 모드)
npx vitest run       # watch 없이 테스트 실행
npx vitest run scripts/__tests__/sync.test.ts  # 단일 테스트 파일
npx vitest -t "should convert"                 # 테스트 이름 패턴 매칭
```

## 아키텍처

### 동기화 파이프라인

소스 마크다운(Obsidian 볼트, `source_root_path`) → `scripts/sync.ts` → `src/content/posts/` (자동 생성, 직접 수정 금지). `publish: true` 프론트매터가 있는 파일만 동기화된다. `modified` vs `publish_sync_at` 타임스탬프 기반 증분 동기화. 이미지는 `public/assets/`로 동기화.

### 설정

`setting.toml`이 모든 블로그 설정(블로그명, 로케일, 댓글, 분석, 번역)의 단일 진실 원천이다. `astro.config.mjs`가 `setting.toml`을 읽어 `import.meta.env.*` 전역 변수(`BLOG_NAME`, `LOCALE`, `INTRO`, `COMMENTS`, `ANALYTICS`)로 주입한다.

### 라우팅

- 포스트: `/posts/[slug]` (기본 로케일), `/[lang]/posts/[slug]` (번역본)
- 태그: `/tags/`, `/tags/[tag]` (대소문자 무시 매칭)
- 번역 파일은 `_lang` 접미사 사용: `post-title_en.md`, `post-title_ko.md`
- 라우팅 로직: `src/utils/i18nRouting.ts`, 로케일 함수: `src/i18n/index.ts`

### 다국어 (i18n)

지원 로케일: `en`, `ko`. 번역 문자열은 `src/i18n/translations/`에 위치. `t(key, params?)` 함수로 파라미터 치환 지원. 포스트 언어는 콘텐츠의 유니코드 범위로 자동 감지.

### 디자인 테마

`data-design-theme` 속성으로 3가지 테마 전환: neo-brutalism (기본), material, glassmorphism. 시스템 설정 감지 기반 라이트/다크 모드. 전체 테마 CSS는 `src/styles/global.css`에 위치.

### 마크다운 처리 파이프라인

`gray-matter` (프론트매터) → `remark-parse` → `remark-gfm` → `remark-obsidian` (위키링크 `[[doc]]`, 이미지 임베드 `![[img.png]]`, 콜아웃 `> [!NOTE]`) → `remark-rehype` → `rehype-stringify`.

### 웹 대시보드

`dashboard/`는 로컬 전용 CMS 어드민이다. `dashboard/server/`(Hono, 127.0.0.1:4322)가 API와 빌드된
SPA(`dashboard/web/`, Vite+React)를 서빙한다. `.env`의 `DASHBOARD_PASSWORD`로 로그인한다.
문서 상태 조회는 `scripts/sync.ts`의 export 함수를 재사용하고, CLI 실행은 spawn으로 기존 스크립트를 호출한다.

## 코드 컨벤션

- **TypeScript strict 모드** — `any`, `@ts-ignore` 금지, 함수에 명시적 반환 타입
- **2스페이스 들여쓰기**, trailing comma, 세미콜론, 작은따옴표
- **한 줄 최대 150자**
- **파일 명명**: `.ts`는 camelCase, `.astro`는 PascalCase
- **import 순서**: Node 내장 모듈 → 외부 라이브러리 → 내부 모듈
- **에러 처리**: try-catch로 실패 시 `null` 반환; CLI 스크립트는 `console.error` + `process.exit(1)`
- **커밋 메시지**: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:` — 영어 사용
- **테스트**: Vitest, `describe`/`it`/`expect` 구조, `createMock*` 팩토리 함수 활용, 실제 파일시스템 접근 최소화
