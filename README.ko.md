# girok.md (기록.md)

> **기록은 나눌 때 비로소 지도가 됩니다.**

*다른 언어로 읽기: [English](README.md), [한국어](README.ko.md)*

마크다운 파일을 정적 블로그로 변환하는 오픈소스 프로젝트입니다.

<p align="center">
  <img src=".github/screenshot.png" alt="girok.md 스크린샷" width="800">
</p>

[![Astro](https://img.shields.io/badge/Astro-5.x-BC52EE?logo=astro&logoColor=white)](https://astro.build)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## 기록의 힘

- **개인의 기록**: 내가 배운 것을 잊지 않기 위해 남기는 흔적.
- **우리의 기록**: 나의 기록이 공유되어 타인의 성장을 돕는 이정표.

당신의 기록은 단순한 메모가 아닙니다—누군가의 길을 안내하는 지도가 됩니다.

---

## 주요 기능

- **마크다운 네이티브**: Wikilinks, 이미지 임베드, Callouts 등 확장 문법 지원
- **증분 동기화**: `publish_sync_at` 타임스탬프 기반으로 변경된 파일만 동기화
- **전문 검색**: Pagefind 기반 클라이언트 사이드 검색
- **태그 시스템**: 태그별 포스트 분류 및 탐색
- **다크/라이트 테마**: 시스템 설정 연동 및 수동 전환
- **SEO 최적화**: Sitemap, 메타 태그 자동 생성
- **GitHub Pages**: 원클릭 배포 지원
- **댓글**: GitHub Discussions 기반 Giscus 댓글 시스템
- **조회수**: GoatCounter 기반 프라이버시 친화적 페이지 조회수 추적
- **다국어 (i18n)**: 영어/한국어 로케일 및 포스트 자동 번역
- **웹 대시보드**: 문서 상태·마크다운 프리뷰·작업 로그·원클릭 배포를 갖춘 로컬 전용 어드민 UI

## 문서

📖 자세한 사용법과 가이드는 **[공식 문서](https://7loro.github.io/girok-md/)**를 참고하세요.

## 빠른 시작

### 1. 저장소 생성

이 페이지 상단의 **Use this template** 버튼을 클릭하여 본인 저장소를 생성합니다.

> **Tip**: 저장소 이름을 `username.github.io` 형식으로 지정하면 (예: `7loro.github.io`) GitHub Pages 배포가 간편해집니다.

### 2. 클론 및 설치

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_USERNAME.github.io.git
cd YOUR_USERNAME.github.io
npm install
```

### 3. 설정

`setting.toml` 파일을 수정합니다:

```toml
# 마크다운 파일 폴더의 절대 경로
source_root_path = "/path/to/your/markdown/folder"

# 블로그 이름
blog_name = "My Blog"

# 사이트 URL (SEO용)
site_url = "https://your-username.github.io"
```

### 4. 동기화 및 실행

```bash
# 마크다운 폴더에서 포스트 동기화
npm run sync

# 개발 서버 실행
npm run dev
```

http://localhost:4321 에서 블로그를 확인할 수 있습니다.

## 포스트 작성

마크다운 문서의 frontmatter에 `publish: true`를 추가하면 블로그에 게시됩니다.

```yaml
---
title: 포스트 제목
publish: true
tags: [astro, blog]
description: 포스트 설명 (선택)
---

포스트 내용을 작성합니다.
```

### 지원하는 마크다운 문법

| 문법 | 예시 | 변환 결과 |
|------|------|-----------|
| Wikilinks | `[[문서명]]` | 내부 링크 |
| 별칭 링크 | `[[문서명\|표시텍스트]]` | 커스텀 텍스트 링크 |
| 이미지 임베드 | `![[image.png]]` | 이미지 태그 |
| Callouts | `> [!NOTE]` | 스타일된 콜아웃 박스 |

## 프로젝트 구조

```
.
├── src/
│   ├── components/       # Astro 컴포넌트
│   │   ├── Search.astro      # Pagefind 검색
│   │   ├── ThemeToggle.astro # 테마 전환
│   │   ├── TOC.astro         # 목차
│   │   └── TagList.astro     # 태그 목록
│   ├── layouts/          # 레이아웃
│   ├── pages/            # 라우팅
│   │   ├── index.astro       # 홈
│   │   ├── posts/            # 포스트 페이지
│   │   └── tags/             # 태그 페이지
│   ├── content/
│   │   └── posts/        # 동기화된 포스트 (자동 생성)
│   ├── styles/           # 전역 CSS
│   └── utils/            # 유틸리티
├── dashboard/            # 로컬 어드민 대시보드 (Hono API + React SPA)
├── scripts/
│   └── sync.ts           # 마크다운 동기화 스크립트
├── public/               # 정적 파일
├── setting.toml          # 블로그 설정
└── astro.config.mjs      # Astro 설정
```

## 명령어

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | 개발 서버 실행 (localhost:4321) |
| `npm run build` | 프로덕션 빌드 |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run sync` | 마크다운 폴더 동기화 |
| `npm run translate` | 포스트 자동 번역 |
| `npm run clean` | 생성 파일 정리 |
| `npm run dashboard` | 웹 대시보드 빌드 + 실행 (127.0.0.1:4322) |
| `npm test` | 테스트 실행 |

[just](https://github.com/casey/just)를 사용한다면 동일한 작업을 레시피로 실행할 수 있습니다 — `just`를 입력하면 목록이 표시됩니다.

## 웹 대시보드

블로그 파이프라인을 관리하는 로컬 전용 어드민 대시보드입니다.

```bash
cp .env.example .env   # DASHBOARD_PASSWORD 설정
npm run dashboard      # UI 빌드 + 서버 실행 (http://127.0.0.1:4322)
```

기능:

- 문서 파이프라인 상태(`draft` / `new` / `modified` / `synced` / `built` / `orphaned`)와 상태별 필터 개수 표시
- 읽기 전용 마크다운 프리뷰: 문서를 선택하면 상태 정보와 렌더링된 본문(위키링크·이미지 임베드·콜아웃 변환 적용)이 함께 표시
- 문서별 publish 플래그 토글
- sync/translate/build/preview 실행과 실시간 로그(소스 폴더 지정 가능)
- 원클릭 git 배포 및 setting.toml 편집

대시보드 개발 시: `npm run dashboard:server` + `npm run dashboard:dev` (HMR, :4323).

## 배포

### GitHub Pages

템플릿에 배포 워크플로우(`.github/workflows/deploy.yml`, build → deploy → Discord 알림)가
포함되어 있습니다. 활성화 방법:

1. 저장소 이름을 `username.github.io` 형식으로 지정합니다 (아직 안 했다면)
2. Repository **Settings > Pages > Source**에서 "GitHub Actions" 선택
3. `main` 브랜치에 push하면 자동으로 배포됨
4. `https://username.github.io`에서 블로그 확인 가능

이 워크플로우는 `main` 브랜치로 push할 때마다 자동으로 빌드하고 배포합니다. **Actions** 탭에서 수동으로 배포를 트리거할 수도 있습니다.

### Discord 배포 알림 (선택)

배포가 끝날 때마다 성공/실패 embed를 Discord 채널로 보낼 수 있습니다:

1. Discord 채널에서 **채널 편집 > 연동 > 웹후크 > 새 웹후크**를 만들고 URL 복사
2. 저장소 **Settings > Secrets and variables > Actions**에 `DISCORD_WEBHOOK_URL` 시크릿 등록

시크릿이 없으면 알림 스텝은 조용히 건너뛰므로 설정하지 않아도 안전합니다.

### 수동 빌드

```bash
npm run build
# dist/ 폴더를 웹 서버에 업로드
```

## 댓글

[Giscus](https://giscus.app)를 사용하여 블로그 포스트에 댓글 기능을 추가할 수 있습니다. Giscus는 GitHub Discussions 기반의 댓글 시스템입니다.

### 설정

1. [giscus.app](https://giscus.app)에서 저장소 설정을 구성합니다
2. 생성된 값을 `setting.toml`에 복사합니다:

```toml
[comments]
enabled = true
provider = "giscus"

[comments.giscus]
repo = "username/repo"
repo_id = "R_..."
category = "Announcements"
category_id = "DIC_..."
mapping = "pathname"
strict = "0"
reactions_enabled = "1"
emit_metadata = "0"
input_position = "top"
theme = "preferred_color_scheme"
lang = "ko"
```

> **참고**: GitHub Discussions가 활성화되어 있어야 합니다. **Settings > Features > Discussions**에서 활성화하세요.

## 분석 (조회수)

[GoatCounter](https://goatcounter.com)를 사용하여 페이지 조회수를 추적하고 포스트에 조회수를 표시할 수 있습니다. GoatCounter는 쿠키를 사용하지 않는 프라이버시 친화적 분석 플랫폼입니다.

### 설정

1. [goatcounter.com](https://goatcounter.com)에서 무료 계정을 생성합니다
2. 사이트 코드를 확인합니다 (예: `mysite.goatcounter.com`에서 `mysite`)
3. **Public Counter API 활성화** (조회수 표시에 필수):
   - GoatCounter 대시보드에 로그인 (예: `mysite.goatcounter.com`)
   - 상단 메뉴에서 **Settings** 클릭
   - **"Allow adding visitor counts on your website"** 체크박스 활성화
   - **Save** 클릭
4. `setting.toml`에서 설정합니다:

```toml
[analytics]
enabled = true
provider = "goatcounter"

[analytics.goatcounter]
site_code = "your-site-code"
show_view_count = true
```

### 옵션

| 옵션 | 설명 |
|------|------|
| `enabled` | 분석 추적 활성화/비활성화 |
| `site_code` | GoatCounter 사이트 코드 |
| `show_view_count` | 포스트 페이지에 조회수 표시 |

> **참고**: 조회수는 GoatCounter의 공개 API에서 클라이언트 사이드로 가져옵니다. 페이지 방문 후 조회수가 업데이트되기까지 몇 분이 걸릴 수 있습니다.

### 문제 해결

**조회수가 표시되지 않나요?**
- GoatCounter Settings에서 **"Allow adding visitor counts on your website"** 옵션이 활성화되어 있는지 확인하세요
- `site_code`가 GoatCounter 서브도메인과 정확히 일치하는지 확인하세요
- 브라우저 콘솔에서 CORS 또는 API 오류가 있는지 확인하세요

## 동기화 로직

동기화는 증분 방식으로 작동합니다:

1. `publish: true`인 문서만 대상으로 함
2. 문서의 `modified` 시간과 `publish_sync_at` 비교
3. 변경된 문서만 동기화하여 빌드 시간 최적화
4. 삭제되거나 `publish: false`로 변경된 문서는 자동 삭제

## 기술 스택

- **프레임워크**: [Astro](https://astro.build) 5.x
- **언어**: TypeScript (strict mode)
- **마크다운**: remark, rehype
- **검색**: [Pagefind](https://pagefind.app)
- **테스트**: Vitest, Playwright

## 기여하기

1. 저장소를 Fork합니다
2. 기능 브랜치를 생성합니다 (`git checkout -b feature/amazing-feature`)
3. 변경사항을 커밋합니다 (`git commit -m 'Add some amazing feature'`)
4. 브랜치에 Push합니다 (`git push origin feature/amazing-feature`)
5. Pull Request를 엽니다

## 라이선스

[MIT](LICENSE)
