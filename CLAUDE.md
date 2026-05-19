# CLAUDE.md — iq-solvebuddy 작업 컨텍스트

> 외부 사용자용은 README. 이 파일은 **Claude 세션 작업 컨텍스트** (어떻게 작업·왜 이 결정·다음 어디로).
>
> **마지막 업데이트**: 2026-05-19 (v1.6.0)

**기호**: ✦ 시그니처 / ✓ 유지 / ❌ 하지 말 것

---

## 프로젝트 한눈에

**LeetCode + 프로그래머스 + AtCoder + Codeforces** 풀이를 **한국어로 정리**해 보여주고, 통과한 코드에 **AI 회고**를 붙여 **GitHub에 단일 commit으로 자동 정리**하는 **Electron 데스크톱 에이전트**.

**iq-agent-lab 행성 중 하나** — 매일 문제 풀이를 *기록 가능한 학습 자산*으로 바꾸는 것이 이 행성의 일.

> v0.x~v0.9는 `iq-leetbuddy` 이름. v1.0에 `iq-solvebuddy`로 rename (GitHub repo / .app productName / 메뉴/트레이/창 title 모두). **단 사용자 데이터 호환을 위해 유지**: ① userData 폴더명(`app.setName('iq-leetbuddy')` 명시) ② localStorage key prefix(`iq-leetbuddy:*`) ③ GitHub 풀이 레포 marker(`<!-- iq-leetbuddy:LeetCode:* -->`). 이 3개는 invisible이라 사용자 노출 X, 변경 시 모든 v0.x 사용자 데이터 손실.

- **로컬**: `/Users/ibm514/iq-lab/iq-agent-lab/iq-leetbuddy` (폴더명은 그대로 — git rename 안 함, GitHub remote URL만 iq-solvebuddy로)
- **GitHub**: https://github.com/iq-agent-lab/iq-solvebuddy

Stack: Electron + TypeScript + Anthropic SDK (streaming) + Octokit (git data API) + marked + highlight.js. Renderer는 vanilla JS.

---

## 세션 시작 체크리스트

새 Claude 세션은 이 순서로 부트업:

1. `git status`, `git log -5` — 현재 상태 / 최근 사이클 확인
2. `npm install` (필요 시) — 첫 부트 후엔 보통 skip
3. **STOP 트리거** + **결정 매트릭스** 훑기 (아래) — 명시 결정 재확인
4. 무엇을 할지 사용자와 합의 — 다음 단계 후보에서 선택
5. `npx tsc --noEmit && npm run build` — 통과 확인
6. **한국어 커밋 메시지**, 작은 라운드 묶음 패턴

---

## 개발 명령

### 로컬 개발

```bash
npm install
npm run build       # tsc + copy-assets.js
npm start           # build + electron (--dev로 DevTools detach)
```

### 배포

```bash
npm run dist:mac           # macOS .zip (arm64 + x64)
npm run dist:mac-universal # universal binary
npm run dist:win           # Windows NSIS
npm run dist:linux         # Linux AppImage
npm run release            # version patch + push + GitHub Actions
```

---

## STOP 트리거

**아래 패턴 감지하면 멈추고 결정 매트릭스의 해당 결정을 사용자에게 보여주고 재확인.** 표면적으로 합리적이지만 명시 결정과 충돌하는 요청들:

| 트리거 키워드 | 충돌하는 결정 |
|---|---|
| ".env 사용자에게 노출" / "config 경로 표시" | UI에 환경 변수/시크릿 명칭 노출 안 함 |
| "한 번에 한 파일씩 commit" | 단일 commit per 풀이 (Octokit git data API) |
| "non-streaming만" / "spinner로 충분" | Streaming 유지 (체감 UX 결정적) |
| "java 고정 default" | localStorage로 마지막 lang 기억 |
| "renderer에 marked 추가" | main에서 marked.parse, IPC로 HTML push |
| "LeetCode UI 자동화 완벽히" | best-effort + 토스트 fallback |
| "임베드에 preload 추가" | preload 없이 console-message sentinel |
| "history 누적 무한" | localStorage 5개 LRU + dedup |

---

## 결정 매트릭스

각 결정의 *왜* 만 여기 (코드에 없으니까). *언제/누가* 는 `git log`.

| 결정 | 상태 | Why |
|---|---|---|
| 단일 commit per 풀이 | 유지 | `createOrUpdateFileContents`는 파일당 1 commit. git data API(getRef→getCommit→createBlob→createTree→createCommit→updateRef)로 3파일 1 commit |
| 자동 레포 생성 + 1회 재시도 | 유지 | 404 시 `createRepoIfMissing` + 1.5s propagation wait + retry. annotated 결과 재사용으로 AI 비용 추가 X |
| 시크릿 UI 노출 X | 유지 | `hasAnthropicKey`/`hasGithubToken` flag만. `.env` 같은 구현 단어 사용자에게 노출 안 함 |
| .env 저장 위치 분리 | 유지 | dev: 프로젝트 루트, packaged: `userData/.env` (asar read-only 회피) |
| 시크릿 OS keychain 암호화 | 유지 | Electron `safeStorage`로 macOS Keychain/Windows DPAPI/Linux libsecret. `.env`엔 `ENC:base64` prefix로 저장, `process.env`엔 복호화된 평문. 첫 부팅 시 평문 자동 마이그레이션. canEncrypt() 실패 시 평문 fallback |
| 숫자 입력 = frontendId 해결 | 유지 | `parseProblemInput`이 ParsedInput 객체 반환 (`isNumericId` flag). main에서 `resolveTitleSlugByFrontendId` 호출 (searchKeywords + 정확 매칭). renderer paste preview는 미리 "문제 #N 으로 검색" 표시 |
| leetcode.cn URL 인식 (com fallback) | 유지 | cn은 Cloudflare bot protection으로 직접 GraphQL 접근 시 HTTP 403. cn URL 받아도 com endpoint로 fetch (같은 slug 공유). cn-only 문제만 404로 fail. parseProblemInput에서 isCN flag 제거 — 모든 URL이 동일 처리 |
| 테마: Dark / Light / System (Sepia 제거) | 유지 | 초기엔 Sepia(중간) 포함했으나 사용자 피드백 "너무 이상해" + Dark variant라 가치 모호 → 제거. legacy localStorage 'sepia' 값은 'dark'로 자동 migrate. System은 `matchMedia('(prefers-color-scheme)')` listen해 OS 자동. CSS 변수 분리 + hljs/CodeMirror theme 동기 전환 |
| 행성 시각 효과 3-layer | 유지 | `.planet-halo`(conic-gradient 회전, 5s) + `.planet-pulse`(radial glow 호흡, 3.5s) + `.planet::before` sparkle(푸른빛↔흰빛↔붉은빛 색조 순환, 5s). Light 모드는 흰빛 halo가 안 보여 따뜻한 brown 그림자로 반전. 사용자가 "살아있는 느낌" 명시 요청 — macOS Siri orb 메타포 |
| 헤더 padding은 dogfooding fix | 유지 | 정확한 px는 코드 참조 (`.app-header` padding). 사용자 미세 조정 여러 번 반영. 마지막 anchor: "약간 더 밑으로 + 왼쪽" (top 58 / left 32). align-items: center로 우측 아이콘과 수직 동일 라인 |
| Draft 자동 저장 (localStorage) | 유지 | CodeMirror change → 800ms debounced. key `iq-leetbuddy:draft:{slug}:{lang}`. handleFetch / lang change 시 maybeRestoreDraft 호출 (현재 editor 비어있을 때만 복원). upload 성공 시 clearCurrentDraft |
| GitHub backfill = root README 인덱스 parse | 유지 | 별도 stats.json 만들지 않고 이미 자동 생성되는 root README 인덱스를 source of truth로. parseExistingIndex 재사용. v0.5 이전 풀이는 인덱스에 없어 제한 — 사용자가 직접 root README 한 번 manual update하면 그 후 자동 |
| 자동 update = polling (electron-updater 안 씀) | 유지 | macOS unsigned 앱은 cert 요구로 자동 install fail → polling + footer pill로 알림만. dev 모드는 app.isPackaged로 skip |
| macOS notification = renderer Notification API | 유지 | Electron renderer에서 new Notification(...)으로 OS native 알림. 첫 사용 시 permission 자동 요청. denied면 silent skip. 사용자 다른 앱 작업 중일 때 가치 |
| CodeMirror light theme = default (not material) | 유지 | `material` theme이 이름과 달리 dark 배경용 (#263238). light 배경에서 punctuation 옅어 거의 안 보임. `default`는 codemirror.css에 포함된 진짜 light theme (별도 CSS 불필요) |
| Accepted 사전 확인 = override 허용 (차단 X) | 유지 | 본 도구 핵심 가치는 통과한 풀이 학습 자산화. 단 완전 차단은 다른 OJ/오프라인 풀이/세션 만료 등 예외 케이스 막음 → Electron `dialog.showMessageBox`로 confirm + override 허용. `hasAcceptedSubmission` null(API fail)은 silent skip. 모달 안 "다시 묻지 않음" 체크박스로 토글 OFF 가능 |
| 회고 사후 편집 = 새 commit (not amend) | 유지 | step-4에 ✏️ 버튼 — annotation-stream을 editable textarea로 전환. "commit" → `updateRetrospective`가 RETROSPECTIVE.md만 새 commit (`fix:` prefix). amend는 force push 필요 + history 재작성이라 risk → 새 commit이 자기 개선 트래킹에도 가치 |
| 멀티 플랫폼 path = 플랫폼별 폴더 | 유지 | v0.8 이하: `NNNN-slug/`(root 바로 아래). v0.9부터: `LeetCode/NNNN-slug/`. Programmers/AtCoder/Codeforces/BOJ는 enum/marker 예약. 자동 마이그레이션 도구로 기존 사용자도 단일 commit으로 전환 |
| 멀티 플랫폼 인덱스 = `<details>` 섹션 | 유지 | 플랫폼별 marker (`<!-- iq-leetbuddy:LeetCode:start -->` 등). LeetCode default 펼침, 나머지는 접힘. legacy marker(`iq-leetbuddy:problems`)는 parseExistingIndex가 자동으로 LeetCode platform으로 변환 — backward compat |
| 자동 마이그레이션 = recursive tree mv | 유지 | recursive tree get → legacy 패턴(`^\d+-[a-z0-9-]+/`) 필터 → createTree에 (sha:null 삭제 + LeetCode/ 새 path 추가) + 새 README → 단일 commit. 사용자 명시 클릭 후만 실행 (stats 모달 버튼). 이미 마이그레이션이면 noop |
| 이름 = `iq-solvebuddy` (v1.0+) | 유지 | v0.x~v0.9는 `iq-leetbuddy`. v1.0 출시(프로그래머스 추가)와 함께 rename. **변경**: GitHub repo URL / .app productName / 창 title / 트레이 메뉴 / Releases API URL / README/CLAUDE.md. **유지** (사용자 데이터 손실 방지): userData 폴더명 (`app.setName('iq-leetbuddy')` 명시 — invisible) / localStorage key prefix (`iq-leetbuddy:draft/theme/...`) / GitHub 풀이 레포 marker (`<!-- iq-leetbuddy:LeetCode:* -->`). package.json의 `name`도 `iq-leetbuddy` 유지 (npm-level, fallback for setName 안정성) |
| Programmers = 정리 모드 (번역 X) | 유지 | 본문이 이미 한국어. translator.ts에 `buildProgrammersPrompt` 분기 — "번역 금지" 명시 + HTML 태그만 마크다운 변환. Problem union discriminator (`platform === 'Programmers'`)로 dispatch. SQL 문제도 동일 흐름 |
| Programmers fetch = HTML scraping (cheerio) | 유지 | 공식 API 없음. `school.programmers.co.kr/learn/courses/30/lessons/{lessonId}` HTML fetch + cheerio로 selector 시도. 다중 selector fallback (사이트 업데이트 대응). Lv 3+ 로그인 필요는 친절 에러 — Phase 2.5에서 `persist:programmers` 임베드 활용 예정 |
| Programmers path = `Programmers/{lessonId}-{slug}/` | 유지 | LeetCode와 달리 frontendId 없으니 lessonId 사용. slug는 한국어 보존 (cheerio slugify가 한글+dash). titleSlug가 한국어라도 git path는 UTF-8 안전. 인덱스 entry의 problemId = lessonId |
| 캐시 key = platform prefix | 유지 | 같은 식별자라도 플랫폼 간 분리. LeetCode는 `{slug}.json` (legacy 호환), 나머지는 `{platform-lower}-{key}.json` (예: `programmers-12345.json`, `atcoder-abc300_a.json`). 함수 시그니처: `readTranslationCache(platform, key)` |
| AtCoder = 영어→한국어 번역 (LeetCode 패턴) | 유지 | 페이지에 영어+일본어 둘 다 표시. `extractStatement`가 영어 우선 → fallback 일본어. translator의 `buildAtcoderPrompt`가 lang hint(en/ja) 받아 prompt 조정. 일본어 → 한국어 번역도 합리적이지만 LLM 정확도 면에서 영어 우선 |
| AtCoder fetch = HTML scraping (cheerio) | 유지 | 공식 API 없음. `atcoder.jp/contests/{contestId}/tasks/{taskId}` HTML fetch. 진행 중인 콘테스트는 비참가자 접근 차단(403) → 친절 에러. submission 자동 fetch는 로그인 필요 → v1.2+ Phase 3.5 |
| AtCoder path = `AtCoder/{taskId}-{slug}/` | 유지 | taskId가 globally unique (contest prefix 포함, 예: `abc300_a`). titleSlug에 taskId 포함하므로 `entryFolder`는 `AtCoder/{slug}` (중복 prefix 방지 — 다른 플랫폼은 `{problemId}-{slug}` 패턴) |
| AtCoder 난이도 = 점수 표시 (외부 API X) | 유지 | AtCoder 페이지엔 점수만 있음 (예: "Score: 300 points"). difficulty rating은 외부 API (kenkoooo.com/atcoder/...) 필요. 외부 의존성 추가 비용 vs 가치 — 점수가 사실상 콘테스트 내 상대 난이도 |
| frontendId = `number \| string` | 유지 | v1.0까지 LeetCode/Programmers는 숫자 ID였지만 AtCoder(`abc300_a`) / Codeforces(`1234A`)는 string. SolutionRecord.frontendId 타입 확장 — 기존 데이터(number) 호환 + 새 데이터(string) 수용. stats dashboard `#${frontendId}` 표시 그대로 작동 |
| AtCoder title 추출 = task letter 제거 | 유지 | AtCoder 페이지의 `<span class="h2">A - N-Choice Question</span>` / `<title>A - N-Choice Question - ...</title>` 형식. 첫 " - " 앞이 task letter("A") — 제거 필요. `stripTaskLetter`가 " - " 위치 가드(0 < idx < 5)로 안전 처리. 둘째 " - " 뒤는 contest name suffix → title 단계에서만 추가 제거 |
| Codeforces = 영어→한국어 번역 (LeetCode 패턴) | 유지 | statement HTML이 `.problem-statement` 전체 (header/body/sample-tests/note 다 포함). MathJax 수식($...$) 보존. `buildCodeforcesPrompt`에서 .sample-tests 활용 명시 |
| Codeforces fetch = HTML scraping (cheerio) | 유지 | 공식 API(`/api/problemset.problems`)는 메타데이터만 — statement는 HTML 필요. `problemset/problem/{contestId}/{index}` URL이 더 안정적 (진행 중 contest URL은 403 가능). 두 URL 형태 모두 인식 |
| Codeforces path = `Codeforces/{contestId}-{index}-{slug}/` | 유지 | 예: `Codeforces/1234-A-two-pointers/`. titleSlug에 이미 다 포함 → `entryFolder`는 `Codeforces/${slug}` (중복 prefix 방지). problemId = `{contestId}{index}` (예: `1234A`) — 인덱스 표 # column |
| Codeforces 난이도 = ★rating | 유지 | 페이지 sidebar의 difficulty tag(`*1500` 형식)에서 추출 → `★1500`으로 표시. Codeforces 표준 별표 표기법과 호환 |
| 헤더 바로가기 = LeetCode/AtCoder 임베드, 나머지 외부 | 유지 | LeetCode/AtCoder는 임베드 윈도우 (`persist:leetcode` / `persist:atcoder` partition) — submission 자동 fetch 위해 persistent cookies 필요. Programmers/Codeforces는 자동 fetch 미지원 (Phase 2.5/4.5에서 추가 예정) → `shell.openExternal` 외부 브라우저 |
| AtCoder 임베드 = LeetCode와 같은 패턴 | 유지 | INJECT_SCRIPT (chip 버튼 + console-message sentinel) + persist 파티션 + URL pull/push 모두 LeetCode와 평행 구조. 다만 lang hint 없음 (AtCoder는 starter code 없어서). sentinel 분리(`IQ_SOLVEBUDDY_AC_PULL::`)로 LeetCode와 안 섞임 |
| AtCoder submission auto fetch = HTML scraping | 유지 | AtCoder는 공식 GraphQL/REST API 없음 → `/submissions/me?f.Task={taskId}&f.Status=AC` HTML scraping. 임베드 세션 cookies(`REVEL_SESSION` 등) 활용. 가장 최근 AC submission ID 추출 → detail 페이지에서 `<pre id="submission-code">` 본문 추출. AtCoder lang 이름(`C++ 23 (gcc 12.2)` 등)을 우리 langSlug로 substring 매칭 |
| fetch-submission IPC = payload 형태 generic | 유지 | v1.3까지 `fetchSubmission(titleSlug: string)`이었지만 AtCoder는 contestId+taskId 두 식별자 필요 → payload union으로 변경 (`{platform:'LeetCode', titleSlug}` 또는 `{platform:'AtCoder', contestId, taskId}`). string 인자 형태도 backward-compat (LeetCode로 라우팅) |
| pull-embed-btn = LeetCode 우선, AtCoder → Codeforces fallback | 유지 | 메인 input의 "↩ 임베드에서" 버튼은 3개 임베드 윈도우 중 떠있는 것 우선순위로 끌어옴. 셋 다 없으면 친절 에러. 동시에 띄우는 케이스 드물어 우선순위 단순화 OK |
| Codeforces 임베드 = persist:codeforces 공유 (browserFetch와) | 유지 | browserFetch가 Cloudflare 우회용으로 이미 `persist:codeforces` 사용 중. 임베드 윈도우도 같은 partition → cookies 공유. **장점**: 사용자가 임베드에서 한 번 로그인하면 problem fetch도 같은 cookies로 작동 (Cloudflare 챌린지 패스 + 로그인 상태 모두 활용). 단일 source of truth |
| Codeforces submission auto fetch = HTML scraping (browserFetch) | 유지 | CF API(`/api/user.status`)는 메타데이터만 — 코드 본문은 페이지 scraping. `/contest/{N}/my` HTML(로그인 필요)에서 `data-submission-id` + `verdict-accepted` 필터링 → `/contest/{N}/submission/{id}` detail 페이지의 `<pre id="program-source-text">` 코드 추출. browserFetch가 Cloudflare 통과 + cookies 적용. `<ol><li>` 라인 wrapping 대응 (li.text() join '\n') |
| CF login 감지 = "Enter" 링크 패턴 | 유지 | CF는 미로그인 시 응답이 login redirect가 아닌 페이지 헤더에 "Enter | Register" 링크 표시. `/href="\/enter[^"]*"\s+[^>]*>\s*Enter\s*</a>/` 정규식으로 감지. 다른 페이지 구조 시 false negative 있을 수 있지만 헤더 패턴은 안정적 |
| Programmers 임베드 = ace editor 직접 추출 (+ HTML fallback) | 유지 | 프로그래머스는 submission API 없음 — 1순위는 임베드 윈도우 ace editor (`ace.edit(el).getValue()`), 2순위는 cookies fetch한 페이지 HTML의 textarea (사용자 마지막 코드가 inject됨). 임베드 윈도우 안 떠있어도 cookies 있으면 fallback 작동 |
| Programmers lang 감지 = DOM selector → code heuristic | 유지 | 페이지에 lang selector DOM 있으면 그걸 활용 (`select#language option[selected]` 등), 없으면 code 첫 줄로 추정 (`#include <bits/stdc++.h>` → cpp, `def solution` → python3, `class Solution` → java 등). 프로그래머스 SPA라 lang state가 정적 HTML에 없는 경우가 많아 heuristic이 실용적 |
| Programmers level = DOM + inline JSON 패턴 | 유지 | DOM selector 다중 시도 후 못 찾으면 page HTML의 `"level":N` 패턴 매칭 (SPA initial state). 범위 가드(1~9)로 false positive 제거 |
| Programmers Lv 3+ 문제 = 임베드 cookies fallback | 유지 | `fetchProgrammersHtml()`이 `persist:programmers` cookies 우선 사용. 미로그인 fetch는 Lv 3+ 문제 본문 못 받음 → cookies retry. 임베드 윈도우와 같은 partition이라 한 번 로그인하면 problem fetch + submission fetch 둘 다 자동 |
| 4개 플랫폼 풀 패리티 (v1.6) | 마일스톤 | LeetCode/AtCoder/Codeforces/Programmers 모두 임베드 윈도우 + submission 자동 fetch. `open-platform-site` IPC는 빈 fallback만 유지 (backward compat). 모든 활성 플랫폼이 동일 UX |
| starter code 메시지 = 플랫폼별 분기 | 유지 | LeetCode 하드코딩 메시지가 AtCoder/CF/Programmers에서 어색. `noSnippetMessage(problem)` 헬퍼가 platform별 메시지 반환. AtCoder/CF는 "시작 코드 제공 안 함" 명시, Programmers는 비로그인 케이스 안내. starter-block 자체는 hide 안 함 — lang select가 그 안에 있어 항상 필요 |
| Codeforces tag 추출 = `.tag-box` 통합 순회 | 유지 | rating(`*1500`)과 algorithmic tags(`greedy`, `dp` 등)가 같은 `.tag-box` selector. 한 번 순회하며 별표 정규식으로 rating 분리, 나머지를 topicTags로. 길이 가드(< 40자) + alpha 필터로 noise 제거. tag가 prompt에 포함되어 번역에 도움 |
| AtCoder difficulty rating = kenkoooo.com API | 유지 | AtCoder 페이지엔 점수만 있음. AtCoder Problems(`kenkoooo.com/atcoder/resources/problem-models.json`)가 IRT 기반 difficulty 제공. **30MB+ JSON** (gzip ~5-10MB) — 24h TTL disk 캐시 + 메모리 캐시. 부팅 시 background prewarm으로 첫 fetch 대기 시간 제거. 실패 silent (점수만 표시되어도 무해). 표기: "300점 · 난이도 1234" / 음수 rating은 "≤0" |
| KaTeX 수식 렌더링 | 유지 | LLM이 `$...$` / `$$...$$` 형식으로 출력하지만 marked 기본은 raw 텍스트. `marked-katex-extension`으로 자동 KaTeX HTML 변환. main 프로세스에서 변환 (Node 호환), renderer는 `katex.min.css` + 폰트(woff2)만 load. throwOnError:false로 잘못된 LaTeX은 원본 텍스트 fallback (앱 크래시 방지). CSP `font-src 'self'` 추가 필요 |
| 외부 사이트 favicon = Google S2 proxy | 유지 | Programmers 직접 favicon URL이 hotlink 차단으로 깨짐 (CORS 또는 referer). `https://www.google.com/s2/favicons?domain={D}&sz=64` proxy 사용 — 항상 fallback 있음, 캐싱됨, 빠름. 일관성 위해 4개 플랫폼 모두 S2 (LeetCode는 임베드 버튼이라 기존 favicon 유지) |
| Cloudflare 우회 = BrowserWindow fetch | 유지 | Codeforces는 node fetch를 HTTP 403으로 차단 (Cloudflare JS challenge). hidden BrowserWindow에 loadURL → outerHTML 추출. 진짜 Chromium이라 챌린지 통과. 같은 partition으로 window pool 재사용 (메모리 + 속도). 첫 호출 ~3-5s, 재호출 ~1-2s. `closeAllBrowserFetchWindows()`를 app.will-quit에서 호출 (cleanup) |
| 풀이 레포 root README 자동 인덱스 | 유지 | uploadSolution이 매 풀이마다 root README marker 영역만 update. `<!-- iq-leetbuddy:problems:start/end -->` 사이만 touch — 사용자 자유 텍스트(위/아래) 보존. 같은 slug는 languages 합치고 savedAt 갱신. 실패 silent (풀이 commit 우선) |
| 풀이 통계 localStorage (not SQLite) | 유지 | `better-sqlite3` native module은 electron rebuild 필요 + 플랫폼별 까다로움. localStorage JSON 배열로 단순화 — 오프라인 안전, 디바이스 sync 안 됨. 가치 90% 보존. 📊 모달에서 요약/난이도/언어/월별/최근 표시 |
| 자동 업데이트 = polling (not electron-updater) | 유지 | electron-updater는 macOS unsigned 앱에서 squirrel.mac cert 요구로 fail. cert 비용 + 복잡도 큼. 대신 GitHub Releases API polling + footer pill로 알림만 — 다운로드는 기존 zip 흐름. dev 모드는 `app.isPackaged`로 skip |
| LeetCode submission 자동 fetch | 유지 | 임베드 윈도우(`persist:leetcode`)의 cookies 활용. `LEETCODE_SESSION + csrftoken`으로 인증된 `submissionList + submissionDetails` GraphQL. 비공식 API라 schema 변경 risk. 미인증 시 친절 에러 ("LeetCode 버튼으로 로그인") |
| 재upload 차단 안 함, 알림만 | 유지 | 같은 slug+lang 재풀이는 정상 use case (개선 코드 + 새 회고). force overwrite 동작 유지. localStorage 통계 기반으로 step-3에 dashed 알림 표시 — 사용자 인지만, 차단 X |
| 영속 LeetCode 세션 | 유지 | `session.fromPartition('persist:leetcode')` — 한 번 로그인하면 다음 실행까지 유지 |
| 임베드 push: console-message sentinel | 유지 | preload 추가 없이 LeetCode 페이지 JS와 격리. `console.log(SENTINEL + url)` → main의 `console-message`로 캡처 |
| 원문 클릭 시 lang은 URL hash | 유지 | `#leetbuddy-lang=java`로 전달. INJECT_SCRIPT가 hash 읽어 토스트(확정) + DOM 조작(best-effort) |
| Lang dropdown 자동 클릭 | best-effort | LeetCode UI 변경에 fragile. 토스트는 항상 표시 → 실패해도 무해 |
| Streaming (translate/annotate) | 유지 | spinner 30s+ → 즉시 점진 표시. throttle 120ms + renderPromise 체인으로 marked.parse race 없음 |
| 시작 언어 기억 | 유지 | `localStorage['iq-leetbuddy:preferred-lang']`. 우선순위: 저장 → java → 첫 번째 |
| 최근 풀이 5개 chips | 유지 | `localStorage['iq-leetbuddy:recent-problems']` LRU. fetch 성공 시 자동 추가, dedup |
| README 중복 commit skip | 유지 | `fileNeedsUpdate`로 base64 decode + trim 비교. 같으면 commit files에서 제외. solution/RETROSPECTIVE는 항상 |
| 첫 실행 자동 settings | 유지 | Anthropic + GitHub 둘 다 미설정 시 0.5s 자동 모달. 세션당 한 번 |
| Credential 에러 자동 모달 | 유지 | `offerSettingsOnCredentialError` — API_KEY/TOKEN 누락 또는 401 시 자동 모달 안내 |
| 단일 모델 commit hist 한국어 | 유지 | 사용자 한국어 first |
| Renderer vanilla JS | 임시 | 작은 규모, TS 마이그레이션은 큰 사이클 별도 |

새 결정 추가 시: 이 표 + 필요하면 STOP 트리거 두 곳만 update. **한 결정은 한 곳에서만 진술.**

---

## 핵심 메커니즘

### 1. 파이프라인 흐름

```
[step-1] input (URL/slug/name/chip) → parseProblemInput → titleSlug
       ↓
[GraphQL fetch] LeetCode questionData (로그인 불필요, public 데이터)
       ↓
[step-2] Claude streaming translate → translation-output 점진 갱신
       ↓ [사용자가 LeetCode에서 직접 풀이]
[step-3] 통과 코드 붙여넣기 → 시작 언어는 last-used 자동
       ↓
[step-4] Claude streaming annotate → annotation-stream 점진 갱신
       ↓
[GitHub] Octokit git data API → 1 commit (3 files)
       ↓
upload-info에 폴더 + commit URL + "다음 문제" 버튼
```

### 2. 임베드 LeetCode 양방향 URL 전달

- **Push (임베드 → 메인)** — 3 경로:
  - 임베드 윈도우 우하단 코랄 chip
  - 메뉴바 `Cmd+Shift+Return`
  - INJECT_SCRIPT가 SPA 라우팅 대응 (1.2s interval polling)
- **Pull (메인 → 임베드)**:
  - input 옆 "↩ 임베드에서" 버튼
  - `leetcodeWindow.webContents.getURL()`

3개 진입점 모두 `pullToMainWindow(url)` 통일. 메인 윈도우 없으면 `createWindow` + `ready-to-show` 대기 + `did-finish-load` 후 메시지 전송 (DOM listener 부착 전 유실 방지).

### 3. Streaming

- translator/annotator의 `stream.on('text', (delta, snapshot))` → snapshot 콜백
- main의 `makeStreamForwarder`가 **120ms throttle** + `renderPromise = renderPromise.then(...)` 체인으로 marked.parse race 없음
- IPC로 HTML push → renderer `innerHTML` 갱신
- final 단계에서 `result.translationHtml` / `annotatedHtml`로 한 번 더 교체 (incomplete markdown 정리, 안정성)
- streaming 중엔 hljs skip, final 시점에만 `highlightCodeBlocks()` 호출

### 4. 원문 클릭 시 lang 자동 안내

- renderer가 `[원문]` 클릭 → URL hash `#leetbuddy-lang=${slug}` 추가
- 임베드 INJECT_SCRIPT의 `ensureLangHint`가 hash 읽음
- **토스트** (확정 동작) — 우상단 5초
- **best-effort DOM 조작** — `trySwitchLang(display)`이 `Python3/Java/...` 텍스트 매칭으로 dropdown button 찾아 클릭, ~7.5s 재시도
- LeetCode UI 변경에 fragile, 실패해도 무해

### 5. BYOK (Bring Your Own Key)

- Anthropic API Key + GitHub PAT 직접 입력
- 저장: dev 모드 프로젝트 루트 `.env`, packaged 모드 `userData/.env`
- UI에 시크릿 노출 안 함 (`hasXxx` flag로 존재만 표시)
- 첫 실행 시 자동 settings prompt
- credential 에러 시 자동 모달 안내

---

## 아키텍처

| 파일 | 역할 |
|---|---|
| `src/main/index.ts` | Electron 부트, 메인/임베드 윈도우, 단축키 fallback chain, INJECT_SCRIPT |
| `src/main/ipc.ts` | IPC 핸들러, `makeStreamForwarder` (throttle + renderPromise 체인) |
| `src/main/settings.ts` | `.env` 읽기/쓰기, `MANAGED_KEYS`, secret-skip 로직 |
| `src/services/leetcode.ts` | LeetCode GraphQL fetch (`questionData`) |
| `src/services/programmers.ts` | 프로그래머스 HTML scraping (cheerio, v1.0+) |
| `src/services/atcoder.ts` | AtCoder HTML scraping (cheerio, v1.1+). 영어/일본어 statement |
| `src/services/codeforces.ts` | Codeforces HTML scraping (cheerio, v1.2+). `.problem-statement` 전체 + rating/tags 분리 |
| `src/services/atcoderModels.ts` | AtCoder difficulty rating 캐시 (kenkoooo.com API, v1.3+). 24h TTL + 메모리 캐시 + 부팅 prewarm |
| `src/services/atcoderSubmission.ts` | AtCoder submission 자동 fetch (v1.4+). 임베드 세션 cookies + HTML scraping. lang 매핑 |
| `src/services/codeforcesSubmission.ts` | Codeforces submission 자동 fetch (v1.5+). browserFetch + 같은 partition cookies. `<ol><li>` 라인 wrapping 대응 |
| `src/services/programmersSubmission.ts` | 프로그래머스 submission 자동 fetch (v1.6+). 임베드 윈도우의 ace editor 값을 webContents.executeJavaScript로 직접 추출 |
| `src/services/browserFetch.ts` | hidden BrowserWindow 기반 HTML fetch (v1.3.1+). Cloudflare 우회용. partition별 window pool 재사용 |
| `src/services/translator.ts` | Claude translate(LeetCode/AtCoder/Codeforces) / organize(Programmers) — platform dispatch, streaming |
| `src/services/annotator.ts` | Claude annotate (회고 생성), streaming. Problem union 수용 |
| `src/services/pipeline.ts` | `fetchAndTranslate` + `annotateAndUpload` 오케스트레이션 (platform 분기) |
| `src/services/github.ts` | Octokit git data API, `fileNeedsUpdate`, `verifyConnection`, platform-aware path |
| `src/services/markdown.ts` | marked v12 dynamic import (ESM 우회) |
| `src/util/language.ts` | `langToExt`, `langToFolder`, `parseProblemInput`, `withRetry` |
| `src/preload/preload.ts` | contextBridge — IPC 채널 노출만 |
| `src/renderer/*.{js,html,css}` | UI (vanilla JS) |

전체 트리는 `tree -L 3 src` 또는 직접 ls. 이 표엔 *역할*만, *상세 구현*은 코드.

---

## 사용자 컨텍스트

### IQ (한동희)
- 우테코 8기 백엔드, 중앙대 SW
- INTP, 매일 dogfooder
- 닉네임 표기: **"아이큐"** (한글, 영문 IQ 아님)
- 커밋 메시지 언어: **한국어**
- GitHub: [@e9ua1](https://github.com/e9ua1)

### iq-agent-lab
- Claude를 활용한 daily workflow tool 모음 (행성 메타포)
- iq-solvebuddy = 학습 자산화 행성 (v0.x~v0.9 시절 이름: iq-leetbuddy)
- 본 사용자 main use case: 주 5~7 LeetCode + 프로그래머스 풀이 + 한국어 회고 누적

### 작업 스타일
- 깊이 있는 분석 + 명확한 결정 + 트레이드오프 명시
- 한국어 first
- "깊게 고민해서" 자주 요청
- 작은 라운드 묶음 사이클 (큰 PR 안 만듦)

---

## Source-of-truth 매핑

| 알고 싶은 것 | 어디 | 비고 |
|---|---|---|
| 결정의 *왜* | **이 파일** (결정 매트릭스) | |
| 결정의 *언제/누가* | `git log --oneline` | 한국어 커밋 메시지 |
| 코드 동작 / 정확한 임계값 | 코드 직접 | 이 문서에 hard-code 금지 |
| 사용자/외부용 설명 | README + 설치 가이드 | |
| 빌드 사이즈 / 의존성 | `package.json` | 시점 변동 |

---

## 다음 단계 후보

### 진행 가능 (v1.7+ 후보) — 4개 플랫폼 풀 패리티 후 다듬기
- **AtCoder/Codeforces/Programmers Accepted 사전 확인** — LeetCode 패턴 적용. 풀이 업로드 전 통과 여부 확인 → 없으면 dialog override
- **history 카드 클릭 시 cache 사용** — 캐시 hit 시 즉시 step-2 final, streaming skip
- **에러 메시지 한국어화** — Octokit 원본 에러 메시지 wrapping (현재 부분만)
- **회고 prompt 사용자 customize** — settings에서 회고 형식 자유 입력 (간결/상세 등)
- **풀이 검색** — stats 모달 안 search box (100개 이상 누적 시 필요)
- **백준 BOJ (Phase 5)** — 보류 (서버 종료 — 사용자 요청). 향후 재개 시 진행

### 장기
- 풀이 레포 RAG 검색 — "DP 문제 중 비슷한 것" 같은 자연어 검색
- iq-blogger 연동 — RETROSPECTIVE → 블로그 포스트 자동 변환

보류 / 안 함 결정은 **결정 매트릭스** 참조.

---

## Troubleshooting

| 증상 | 점검 |
|---|---|
| 단축키 등록 실패 | macOS Privacy & Security → Input Monitoring 권한. fallback chain 콘솔 `[shortcut]` 로그 |
| 임베드 LeetCode 로그인 풀림 | userData/cookies 또는 session 데이터 — 보통 한 번 다시 로그인 |
| streaming 텍스트 안 보임 | marked가 incomplete markdown throw → 다음 flush 재시도. ipc.ts 콘솔 에러 확인 |
| 코드블록 syntax highlight X | `window.hljs` 로드 확인. `dist/vendor/highlight.min.js` 존재? |
| 자동 lang 선택 안 됨 | LeetCode UI 변경 fragile. 토스트는 표시되니 수동 변경 |
| 빌드된 .app 미서명 → 손상 경고 | README "터미널에서 한 번에 설치" 섹션의 `xattr -cr` |
| 메인 윈도우 안 뜸 | 트레이 아이콘 클릭 또는 단축키 (`Cmd+Option+L` default) |
| 임베드 URL push 안 됨 | DevTools `console-message` 이벤트 호환성 확인 (Electron 33 시그니처) |

---

## 완성된 사이클 요약 (큰 줄기)

상세 진척은 `git log` (한국어 커밋 메시지):
- **v0.1~0.3**: 기본 파이프라인 — LeetCode fetch → translate → annotate → GitHub commit → .app 패키징 + Actions 자동 release
- **임베드 LeetCode**: persist session + 양방향 URL 전달 (push: chip/메뉴/단축키 + pull: input 보조 버튼)
- **원문 lang 자동 안내**: hash 전달 + 토스트 + best-effort DOM 조작
- **Input UX**: hint 카드 그리드 + paste 정규화 미리보기 + clear 버튼 + 에러 shake
- **시작 언어 기억**: localStorage, 마지막 선택 유지
- **다음 문제 버튼**: upload 성공 후 reset 발견성↑
- **Streaming**: spinner-only → 즉시 점진 표시 (translate + annotate)
- **최근 풀이 chips**: localStorage 5개 LRU + dedup
- **README 중복 commit skip**: `fileNeedsUpdate` sha 비교
- **첫 실행 자동 prompt + credential 에러 모달**: onboarding 마찰 제거
- **코드블록 hljs**: 번역/회고 영역에도 syntax highlight

---

## 이 문서 유지 원칙

다른 tale-02 작업 컨텍스트 문서에서 도출된 안티패턴 (재발 방지):

- ❌ **코드와 sync 강제되는 spec hard-code** — throttle 정확한 ms, 캐시 만료 시간, 전체 디렉토리 트리는 drift 시한폭탄. 이 문서엔 *원리*만, *값*은 코드/README에서 읽을 것
- ❌ **같은 결정 다중 진술** — **한 결정은 결정 매트릭스 한 곳**
- ❌ **상대 일자** ("현재 진행 중", "최근 변경") — 절대 일자 또는 evergreen 표현
- ✓ 결정의 *왜* 만 담기. *언제/누가* 는 git log
- ✓ 사용자 명시 결정 anchor 보존
- ✓ 새 결정 추가 시 결정 매트릭스 + 필요하면 STOP 트리거 두 곳만 update
