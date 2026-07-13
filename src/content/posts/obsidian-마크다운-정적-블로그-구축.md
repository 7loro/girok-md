---
title: Obsidian 마크다운 정적 블로그 구축
date: 2026-01-31
publish: true
publish_sync_at: "2026-07-13 08:57:42"
lang: ko
tags:
  - personal
  - obsidian
  - blog
  - feature
summary: "Obsidian으로 노트를 몇 년째 작성해 오면서, 작성한 글을 공유하는 것에 불편함을 느끼기도 했고, 작성한 노트를 통해 블로그를 만들고 싶다는 생각을 해왔습니다. 마크다운을 정적 페이지로 만드는 도구들은 여럿 있지만, 나만의 도구를 만들고 원하는 기능을 붙여보고 싶어서 기존의 솔루션들을 사용하지 않고 직접 만들게 됐습니다. 마크다운 문서의 frontmatter 에 `publish: true` 하나만 붙이면 블로그 글로 게시할 수 있는 `girok.md (기록.md)`를 만들게 됐습니다."
---


<div class="callout callout-summary">
<div class="callout-title">SUMMARY</div>
<div class="callout-content">

Obsidian으로 노트를 몇 년째 작성해 오면서, 작성한 글을 공유하는 것에 불편함을 느끼기도 했고, 작성한 노트를 통해 블로그를 만들고 싶다는 생각을 해왔습니다. 마크다운을 정적 페이지로 만드는 도구들은 여럿 있지만, 나만의 도구를 만들고 원하는 기능을 붙여보고 싶어서 기존의 솔루션들을 사용하지 않고 직접 만들게 됐습니다. 마크다운 문서의 frontmatter 에 `publish: true` 하나만 붙이면 블로그 글로 게시할 수 있는 `girok.md (기록.md)`를 만들게 됐습니다.

</div>
</div>

## 왜 만들었나

Obsidian으로 노트를 몇 년째 작성해 오면서, 작성한 글을 공유하는 것에 점점 불편함을 느꼈습니다. 물론 기존의 여러 플러그인을 통해 개별 문서를 공유하는 건 어렵지 않습니다. 하지만 저는 그 이상을 원했습니다.

**제 노트들 중 공유하고 싶은 것들만 골라서 한 곳에 모으고 싶었습니다.** 개별 링크를 하나씩 보내는 게 아니라, 블로그처럼 한 공간에서 제 글들을 보여주고 싶었던 거죠. Jekyll, Gatsby, Obsidian Publish 등 다양한 솔루션이 있다는 건 알고 있었습니다. 하지만 제 워크플로우에 딱 맞는 나만의 도구를 직접 만들어보고 싶었습니다.

**노트를 작성하는 것은 개인적인 활동으로 끝날 수 있습니다.** 하지만 그 노트를 정제하고, 다듬어서 공유하는 "출판" 과정을 거치면 그 글은 진짜 의미를 갖게 된다고 생각합니다. 내가 배운 것을 정리하는 과정에서 이해가 깊어지고, 공유를 통해 누군가에게 도움이 될 수 있으니까요.

그래서 마크다운 문서의 frontmatter에 `publish: true` 하나만 붙이면 블로그 글로 게시할 수 있는 `기록.md (girok.md)`를 만들게 되었습니다.

- [기록.md github](https://github.com/7loro/girok-md)
- [기록.md 사용법](https://7loro.github.io/girok-md/)

## 어떻게 쓰나

1. Obsidian에서 글을 씁니다
2. frontmatter에 `publish: true`를 추가합니다
3. `npm run sync` 명령어를 실행합니다
4. commit을 만들어 push하면 자동으로 배포됩니다

## 주요 기능

### Obsidian 문법 그대로

블로그용으로 따로 수정할 필요가 없습니다.

- **Wikilinks**: `[[다른 문서]]`, `[[문서|표시텍스트]]` → 자동으로 내부 링크 변환
- **이미지 임베드**: `![[image.png]]` → 자동으로 복사되고 경로 변환
- **Callouts**: `> [!NOTE]`, `> [!WARNING]` → 스타일된 박스로 렌더링

### 증분 동기화

모든 문서를 매번 동기화하지 않습니다. `publish_sync_at` 타임스탬프를 비교해서 **수정된 문서만** 동기화하므로 빌드 시간이 빠릅니다.

### 전문 검색 (Pagefind)

`Cmd+K` (Mac) 또는 `Ctrl+K` (Windows)로 검색창을 열 수 있습니다. 서버 없이 클라이언트 사이드에서 전체 텍스트 검색이 가능하며, 한국어도 잘 지원됩니다.

### 태그 시스템

태그별로 글을 필터링할 수 있으며, **해시 함수 기반으로 태그 색상이 자동 생성**됩니다. 같은 태그는 항상 같은 색으로 표시되어 일관성을 유지합니다.

### TOC (목차)

긴 글을 읽을 때 유용합니다. 우측에 고정된 목차가 있어서 클릭하면 해당 섹션으로 바로 이동하고, 스크롤할 때마다 현재 보고 있는 섹션이 하이라이트됩니다.

### 다크/라이트 모드

헤더에 있는 해/달 아이콘으로 테마를 전환할 수 있습니다. 시스템 설정을 감지하며, localStorage에 저장되어 다음에 방문해도 설정이 유지됩니다.

### 모바일 최적화

화면 크기에 따라 레이아웃이 자동 조정됩니다. 데스크톱 3열, 태블릿 2열, 모바일 1열. iPhone SE 같은 작은 화면에서도 잘 보입니다.

### 댓글 (Giscus)

GitHub Discussions 기반의 댓글 시스템입니다. 설정만 해두면 각 글에 댓글 기능이 자동으로 붙습니다.

### 조회수 추적 (GoatCounter)

개인정보 친화적인 조회수 추적입니다. 쿠키를 사용하지 않으며, 각 글에 조회수를 표시할 수 있습니다.

### 읽기 시간 표시

글의 길이에 따라 예상 읽기 시간이 자동으로 계산됩니다. (영어: 200 WPM, 한글: 500 CPM 기준, 코드블록/이미지/링크 제외)

### SEO 최적화

sitemap과 meta 태그가 자동 생성되며, robots.txt도 함께 관리됩니다.

### 게시글 번역

게시글의 원본 문서를 원하는 언어들로 손쉽게 번역하여 게시할 수 있습니다.

## 기존 솔루션과의 비교

| 항목 | girok.md | Jekyll | Gatsby | Obsidian Publish |
|------|----------|--------|--------|------------------|
| **가격** | 무료 (GitHub Pages) | 무료 (GitHub Pages) | 무료 (Netlify 등) | 월 $10 |
| **Obsidian 문법** | ✅ 네이티브 지원 | ❌ 별도 변환 필요 | ❌ 플러그인 필요 | ✅ 완벽 지원 |
| **Wikilinks** | ✅ 자동 변환 | ❌ 미지원 | ⚠️ 플러그인 의존 | ✅ 지원 |
| **Callouts** | ✅ 지원 | ❌ 미지원 | ❌ 미지원 | ✅ 지원 |
| **설정 난이도** | 낮음 (TOML 하나) | 중간 | 높음 (React/GraphQL) | 매우 낮음 |
| **빌드 속도** | 빠름 (Astro) | 중간 (Ruby) | 느림 | N/A |
| **커스터마이징** | ✅ 완전 자유 | ✅ 가능 | ✅ 가능 | ⚠️ 제한적 |
| **검색** | Pagefind (무료) | 직접 구현 | Algolia (유료) | ✅ 내장 |
| **호스팅** | GitHub Pages 등 | GitHub Pages 등 | Vercel, Netlify 등 | Obsidian 서버 |

### 언제 girok.md를 선택하면 좋을까?

- **Obsidian 사용자**이고, 노트를 블로그로 공유하고 싶을 때
- **무료**로 운영하고 싶을 때 (GitHub Pages 활용)
- Wikilinks, Callouts 등 **Obsidian 문법을 그대로 쓰고 싶을 때**
- **직접 커스터마이징**하고 싶을 때
- Jekyll/Gatsby의 복잡한 설정이 부담스러울 때

## 무엇으로 만들었나

- **Astro**: 정적 사이트 생성기입니다. Next.js보다 가볍고, 마크다운 블로그에 특화되어 있습니다. 빌드도 빠릅니다.
- **Pagefind**: 서버 없이 작동하는 검색 엔진입니다. Algolia는 유료인데, 이건 무료고 한국어도 잘 됩니다.
- **GitHub Pages**: 무료 호스팅입니다. push하면 자동 배포되고, HTTPS도 알아서 붙습니다.

사실 저는 앱 개발자라 웹은 잘 모릅니다. 대신 [OpenCode](https://github.com/opencode-ai/opencode) + [oh-my-opencode](https://github.com/pinkroosterai/oh-my-opencode)와 Anthropic 모델들(Claude Opus 4.5, Sonnet 4.5)을 적극 활용했습니다. AI 코딩 도구 덕분에 익숙하지 않은 영역도 빠르게 만들 수 있었습니다.

## 동작 원리

```
Obsidian Vault (publish: true 문서)
    ↓ npm run sync
변환 (Wikilinks → HTML, 이미지 복사, Callouts 변환)
    ↓ Astro Build
정적 HTML
    ↓ GitHub Actions
GitHub Pages (배포)
```

`npm run sync`가 핵심입니다. `setting.toml`에 마크다운 문서가 모여있는 경로를 설정해두면, 그 경로에서 `publish: true`인 문서를 찾아서 Wikilinks, 이미지, Callouts를 변환합니다. 그 다음 Astro가 정적 HTML로 빌드하고, push하면 GitHub Actions가 자동 배포합니다.

## 시작하기

코드는 GitHub에 공개되어 있습니다: https://github.com/7loro/girok-md

### 사전 준비

- **Node.js 18+**: [nodejs.org](https://nodejs.org/)에서 LTS 버전 설치
- **Git**: [git-scm.com](https://git-scm.com/)에서 설치
- **GitHub 계정**: 배포에 필요

<div class="callout callout-tip">
<div class="callout-title">TIP</div>
<div class="callout-content">

터미널에서 `node -v`와 `npm -v`를 입력하면 설치 여부를 확인할 수 있습니다.

</div>
</div>

### 설치

```bash
git clone https://github.com/7loro/girok-md.git
cd girok-md
npm install
```

### 설정

`setting.toml`을 열어서 본인 환경에 맞게 수정합니다:

```toml
# 마크다운 문서가 있는 폴더의 절대 경로
source_root_path = "/Users/yourname/Documents/ObsidianVault"

# 블로그 이름
blog_name = "My Blog"

# 배포될 사이트 URL (GitHub Pages 사용 시)
site_url = "https://your-username.github.io"
```

### 로컬 테스트

```bash
npm run sync    # vault에서 publish: true 문서 동기화
npm run dev     # http://localhost:4321 에서 미리보기
```

### 배포 (GitHub Pages)

1. [girok-md](https://github.com/7loro/girok-md)에서 **Use this template** 버튼을 클릭합니다
2. Repository 이름을 `username.github.io` 형식으로 입력합니다 (예: `7loro.github.io`)
3. 생성된 저장소를 clone합니다: `git clone https://github.com/YOUR_USERNAME/YOUR_USERNAME.github.io.git`
4. 저장소 **Settings → Pages → Source**에서 "GitHub Actions"를 선택합니다
5. 변경사항을 commit하고 push하면 자동으로 빌드 및 배포됩니다

```bash
git add .
git commit -m "Add new post"
git push
```

<div class="callout callout-note">
<div class="callout-title">NOTE</div>
<div class="callout-content">

배포가 완료되면 `https://username.github.io`에서 블로그를 확인할 수 있습니다.

</div>
</div>

## 회고

사실 예전에도 마크다운으로 정적 블로그를 만들어본 적이 있습니다. 여러 유튜브 영상을 보고, next.js, react 를 조금 학습해보면서 따라해보면서 마크다운 파일들을 가져오고, 필요한 문법들을 변환하고, 게시글 목록에 표시하고, 게시글을 읽는 핵심 기능 정도를 수동으로 만들었습니다. 하나씩 만들었는데, 웹을 잘 모르기도 하고 시간도 많이 걸렸습니다.

바이브 코딩의 시대가 되면서 AI 기술들을 따라가보고자 뭔가를 만들어 보고 싶었고, OpenCode와 oh-my-opencode를 쓰면서 놀라움을 많이 느꼈습니다. 물론 "블로그 만들어줘"라고만 하면 안 됩니다. 제가 원하는 워크플로우가 명확하게 있었기 때문에, 그에 맞춰서 계획하고 진행하는 게 수월했습니다.

특히 재밌었던 건 Playwright MCP로 에이전트가 직접 브라우저 테스트를 수행하고, 이슈를 발견하면 고치고, 다시 테스트하는 과정을 지켜보는 것이었습니다. 개발 뿐만 아니라 검증 절차 까지도 자동으로 돌아가는 걸 보는 게 신기했습니다. 이제는 필요한 도구는 직접 만들어 쓰는 시대가 됐다고 느꼈습니다.

제 워크플로우에 맞춰 만들고 나니 꽤 쓸만해져서, 오픈소스로 공개하기로 했습니다. 많은 사람들이 함께 사용하고 개발해나가면 정말 기쁠 것 같습니다.
