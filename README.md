# 🪐 iq-solvebuddy

> *a small companion in the iq-agent-lab system.*
>
> v0.x~v0.9는 `iq-leetbuddy` 이름. v1.0+ 멀티 플랫폼 지원과 함께 `iq-solvebuddy`로 rename. 사용자 데이터(`.env` / 캐시 / 풀이 통계 / draft)는 모두 그대로 유지 (userData 경로 / localStorage key 호환).

**LeetCode + 프로그래머스 + AtCoder + Codeforces** 문제 풀이를 **한국어로 정리**해 보여주고, 통과한 코드에 **AI 회고**를 붙여 **GitHub에 자동 정리**하는 데스크톱 에이전트.

iq-agent-lab 행성 중 하나. 매일 문제 풀이를 *기록 가능한 학습 자산*으로 바꾸는 것이 이 행성의 일.

**현재 버전: v1.3.0** — LeetCode + 프로그래머스 + AtCoder + Codeforces (Phase 1-4 완료, 메타데이터 정교화). 백준(BOJ)은 보류 (서버 이슈), 각 플랫폼 submission 자동 fetch는 Phase 2.5-4.5에서 추가 예정. 자세한 진척은 [로드맵](#로드맵) 참조.

> 플랫폼별 statement 정책: **LeetCode/AtCoder/Codeforces**는 영어 원문 → 한국어 번역. **프로그래머스**는 한국어 원문 → 정리만 (HTML→마크다운). **AtCoder**는 영어 우선 + 일본어 fallback.

---

## 📥 다운로드 & 설치

빌드 없이 그냥 받아 쓰는 길.

### 1. 본인 Mac에 맞는 zip 다운로드

**[Releases](https://github.com/iq-agent-lab/iq-solvebuddy/releases/latest)** 페이지로 가서 다음 둘 중 하나 받기:

| Mac 종류 | 파일 |
|---|---|
| Apple Silicon (M1, M2, M3, M4) | `iq-solvebuddy-{version}-arm64-mac.zip` |
| Intel Mac | `iq-solvebuddy-{version}-mac.zip` |

> 본인 Mac이 어느 쪽인지 모르면: `메뉴 → 이 Mac에 관하여`. "Apple M*" 보이면 Apple Silicon, "Intel" 보이면 Intel.

Windows / Linux도 자동 빌드되어 있음 — `.exe` (Windows) / `.AppImage` (Linux).

### 2. ⚠️ 그냥 zip 풀어서 실행하면 — 이렇게 됨

![iq-solvebuddy은(는) 손상되었기 때문에 열 수 없습니다 경고](docs/images/gatekeeper-warning.png)

다운로드한 zip을 풀어서 `.app` 파일을 더블클릭하면 macOS가 위 같은 경고를 띄움:

> **'iq-solvebuddy'은(는) 손상되었기 때문에 열 수 없습니다. 해당 항목을 휴지통으로 이동해야 합니다.**

**진짜 손상된 게 아니야.** Chrome으로 다운받은 unsigned 앱에 macOS가 `com.apple.quarantine`이라는 "출처 모름" 꼬리표를 붙이고, Gatekeeper가 그걸 보고 *손상이라고 거짓말*하면서 차단하는 거. Apple Developer cert가 있는 *서명된* 앱이면 안 뜨는데, iq-solvebuddy는 개인 도구라 cert 없음.

휴지통으로 옮기지 말고 — **터미널 한 줄로 우회 가능**.

### 3. 터미널에서 한 번에 설치

새 터미널을 열고 (Spotlight → "터미널") 다음을 복사 붙여넣기:

```bash
cd /tmp && \
unzip -o ~/Downloads/iq-solvebuddy-*-mac.zip && \
xattr -cr iq-solvebuddy.app && \
rm -rf /Applications/iq-solvebuddy.app && \
mv iq-solvebuddy.app /Applications/ && \
open /Applications/iq-solvebuddy.app && \
rm -f ~/Downloads/iq-solvebuddy-*-mac.zip
```

> **v0.9 이하 사용자**: `iq-leetbuddy.app`이 `/Applications/`에 남아있으면 한 번만 `rm -rf /Applications/iq-leetbuddy.app`. 새 `.app`은 다른 이름이라 자동 덮어쓰기 안 됨. 사용자 데이터(API 키 / 통계 / draft)는 그대로 살아 있음 — userData 폴더는 호환성 유지.

각 줄이 하는 일:

| 명령 | 의미 |
|---|---|
| `cd /tmp` | 작업 디렉토리로 이동 |
| `unzip -o ~/Downloads/...` | Downloads의 zip 풀기 (Apple Silicon/Intel 자동 매칭) |
| `xattr -cr iq-solvebuddy.app` | quarantine 꼬리표 제거 (이게 핵심) |
| `rm -rf /Applications/iq-solvebuddy.app` | 기존 버전 제거 (.app은 디렉토리라 `mv -f`로 덮어쓰기 안 됨 — `Directory not empty` 에러 회피) |
| `mv ... /Applications/` | Applications 폴더로 옮기기 |
| `open ...` | 실행 |
| `rm -f ~/Downloads/...zip` | 다운로드 폴더의 zip 정리 — 다음 업데이트 시 여러 버전 zip이 섞여 glob이 헷갈리는 문제 회피 |

성공하면:
- Dock에 코랄 행성 아이콘이 떠오르고
- 메뉴바 우측 상단에도 🪐 트레이 아이콘 자리잡고
- iq-solvebuddy 창이 열림

다음번부터는 Launchpad / Spotlight / Dock에서 일반 앱처럼 켜기 가능.

### 4. 첫 실행 — 설정 자동 안내

키가 둘 다 비어 있는 첫 실행이면 **자동으로 ⚙️ 설정 모달이 열림** (0.5초 후). 닫아도 같은 세션에선 다시 안 띄움.

1. **Anthropic API Key**: https://console.anthropic.com → API Keys → 키 발급 → 붙여넣기
2. **GitHub Personal Access Token**: 토큰 라벨 옆 `?` 버튼 → 가이드 패널 안의 발급 링크 클릭 → `repo` scope 미리 체크된 페이지 열림 → Generate token → 한 번만 보이는 토큰 복사 → 붙여넣기
3. **Owner / Repository**: 본인 GitHub 사용자명 + 풀이 레포 이름 (예: `e9ua1` / `leetcode-solutions`)
4. **"GitHub 연결 확인"** 버튼 → 토큰/레포 한 번에 진단. 레포 없으면 그 자리에서 **"지금 만들기"** 클릭
5. (선택) **"레포 없을 때 자동 생성"** 토글 켜기

저장 후 메인 화면에서 LeetCode 문제 URL이나 문제 이름을 던지면 끝.

> 시크릿은 OS keychain(macOS Keychain / Windows DPAPI / Linux libsecret)으로 자동 암호화 저장 — 사용자가 `.env` 파일을 직접 만질 일 없음. credential 누락/만료 시에도 ⚙️ 모달 자동 안내.

### 5. 새 버전 — footer 알림

부팅 시 GitHub Releases polling. 새 버전이 release되면 footer 우측에 코랄 pill `↗ v0.x.x 사용 가능` 표시. 클릭 → Releases 페이지로 이동 → 위 명령 다시 실행하면 끝.

---

## 무엇을 하는가

```
01 ─ 문제 던지기
       URL · slug · 문제 이름 · 문제 번호 모두 자유
       또는 임베드 LeetCode chip · 최근 풀이 chip · 보조 버튼

02 ─ Claude streaming 번역 (한국어 마크다운)
       이미지·예시·제약조건·메타 보존, 점진 표시
       시작 코드는 LeetCode가 주는 모든 언어로 select
       마지막 선택 언어 자동 기억

03 ─ LeetCode 사이트에서 직접 풀고 Accepted 받기
       임베드 윈도우는 영속 세션 — 한 번 로그인하면 다음에도 유지

04 ─ 통과 코드 입력 (CodeMirror 5 에디터)
       임베드에서 "최근 통과 코드 자동 가져오기" 버튼으로 한 클릭
       또는 직접 붙여넣기

05 ─ Claude streaming 회고
       알고리즘 로직 100% 동일 유지 (재해석)
       의미 있는 변수명 + 한국어 한 줄 주석
       복잡도 + 대안 접근 + 비슷한 문제 추천

06 ─ 단일 atomic commit으로 GitHub 업로드 + root README 인덱스 자동 갱신
       NNNN-title-slug/
         ├── README.md            (한국어 번역, 공통 — 중복 skip)
         └── {language}/
             ├── solution.{ext}    (통과 코드)
             └── RETROSPECTIVE.md  (AI 회고)
```

문제 하나당 사용자 행동은 **두 번의 클릭** (임베드 chip → 자동 가져오기 → 업로드). 나머지는 다 알아서.

---

## 왜 만들었는가

LeetHub 계열 확장은 *제출 후 GitHub에 올리기*는 해주지만, 핵심이 다 빠져 있다:

- LeetCode 문제는 영어라 한국어 학습자에게 *이해 자체가 비용*이고,
- 코드만 commit되면 **나중에 그 풀이를 다시 꺼냈을 때 맥락을 잃는다.**
- 회고 없이 정답 코드만 쌓으면, 100문제 풀어도 95문제는 잊는다.

iq-solvebuddy는 *commit*이 아니라 *학습*을 자동화한다.

- **번역은 풀이 *전*에** — 영어 해독 시간 → 알고리즘 사고 시간으로 전환
- **회고는 풀이 *후*에** — 복잡도, 개선 코드(한국어 주석), 대안 접근, 유사 문제까지
- **레포는 *학습 노트*** — 미래의 본인이 들춰봤을 때 풀이뿐 아니라 *왜*가 같이 있음
- **인덱스 자동 생성** — 풀이가 100개 쌓여도 root README의 표로 한눈에

장기적으로 풀이 레포 자체가 "내가 어떻게 사고했는가"의 아카이브가 된다.

---

## 핵심 기능

### 입력의 유연성

대소문자, 공백, `-`, `_` 모두 **자동 정규화** + **문제 번호 검색** + **leetcode.cn URL 인식**:

```
✓ https://leetcode.com/problems/two-sum/
✓ https://leetcode.com/problems/two-sum/description/
✓ https://leetcode.com/problems/regular-expression-matching/description/?envType=problem-list-v2&envId=depth-first-search
✓ leetcode.cn/problems/two-sum      ← com에서 같은 slug로 fetch (cn은 Cloudflare 직접 접근 불가)
✓ Two Sum
✓ symmetric tree
✓ TWO_SUM
✓ 1                                  ← 문제 번호로 검색 → titleSlug 자동 해결
✓ 2024
```

입력하는 동안 input 아래에 `→ two-sum 으로 정규화` 또는 `→ 문제 #1 으로 검색` **paste preview** 실시간 표시.

**최근 풀이 5개 chips**: fetch 성공한 문제는 step-1에 코랄 톤 카드로 표시 (최대 5개, LRU + dedup). 클릭하면 자동 fetch.

**입력 도움**: 카드형 hint grid (펼쳐보기) · clear(×) 버튼 · fetch 실패 시 input shake + red border.

### 임베드 LeetCode (양방향 자동화)

별도 **영속 세션 윈도우**(`persist:leetcode` 파티션). 한 번 로그인하면 앱을 껐다 켜도 유지됨. 메인 solvebuddy UI는 절대 navigate 안 됨 — 풀이 흐름 중에 작업 컨텍스트 안 잃음.

**임베드 → 메인** (push, 3 경로):
- 임베드 윈도우 우하단 **"→ solvebuddy로 가져오기"** 코랄 chip
- 메뉴바 단축키 **⌘⇧↩** (Cmd+Shift+Return)
- 메인 윈도우 input 옆 **"↩ 임베드에서"** 보조 버튼

세 경로 모두 메인 윈도우 자동 활성화 + URL 자동 입력 + fetch 자동 시작.

**원문 클릭 시 시작 언어 자동 안내**: 번역 결과 안 `[원문]` 링크 클릭 시 현재 step-2의 시작 언어를 URL hash로 임베드에 전달 → 우상단 토스트 "선택된 시작 언어: Python3" 5초 + LeetCode lang dropdown 자동 클릭 시도 (best-effort, fragile하지만 토스트는 보장).

**최근 통과 코드 자동 가져오기**: step-3의 **"↩ LeetCode에서 최근 통과 코드 가져오기"** 버튼. 임베드 세션 cookies(`LEETCODE_SESSION` + `csrftoken`)로 인증된 GraphQL로 `submissionList` → 첫 Accepted → `submissionDetails` → code/lang 추출 → CodeMirror에 자동 채움 + lang dropdown 자동 변경. **복사-붙여넣기 단계 제거.**

> LeetCode 비공식 API라 schema 변경 risk. 미인증/Accepted 없음 시 친절 에러로 fallback.

### CodeMirror 5 코드 에디터

step-3의 통과 코드 입력란이 **진짜 에디터** (textarea가 아님):

- **줄 번호** + **syntax color** (material-darker + 우리 코랄 톤 통합)
- **bracket matching** + 자동 닫기 — `{` `[` `(` 자동 페어
- **active line highlight** — 현재 커서 줄 코랄 강조
- **자동 인덴트** — Enter 시 이전 줄 들여쓰기 유지
- **검색** (`Cmd+F`) · **다중 커서** (`Cmd+D`) — CodeMirror 5 기본 단축키
- 9개 lang 지원: Java / C / C++ / C# / Kotlin / Scala / Python / JS / TS / Go / Rust / Swift / Ruby / Dart (미지원 lang은 plain text fallback — 편집 정상)
- lang dropdown 변경 시 syntax mode 즉시 교체

> CodeMirror 5는 UMD bundle이라 번들러 없이 vendor 복사로 통합. CodeMirror 6 (ESM)은 webpack/esbuild 도입 필요해서 trade-off로 5 선택.

### Streaming 번역/회고

번역(step-2)과 회고(step-4) 둘 다 **Anthropic streaming API** 사용. spinner 30초+ 보다가 텅 빈 결과 받는 흐름이 아니라, **즉시 첫 문장부터 점진 표시**. 4000 토큰 회고도 첫 줄이 1-2초 안에 보이기 시작함.

- 좌측 코랄 라인 + spinner로 진행 시각화
- 완료 시 안정적인 최종 HTML로 교체 (incomplete markdown 정리)
- main에서 120ms throttle + `renderPromise` 체인 → 부하 + race 안 만듦
- **번역/회고 안 코드블록도 syntax color 적용** (langSlug → hljs 변환)

### 시작 언어 기억 (LocalStorage)

step-2에서 한 번 Java → Python으로 바꾸면 **다음 문제부터 자동으로 Python**. 매번 dropdown을 클릭하는 마찰 제거. 저장된 lang이 새 문제에 없으면 java fallback → 첫 번째 fallback.

### 번역 결과 캐시

같은 titleSlug 두 번 fetch 시 **LLM 호출 skip**, 즉시 final HTML 표시. 캐시는 `userData/cache/translations/{slug}.json`. LeetCode 문제는 거의 안 바뀌므로 만료 없음.

캐시 무효화: `~/Library/Application Support/iq-leetbuddy/cache/translations/` 폴더 삭제.

> userData 폴더가 `iq-leetbuddy`인 이유: v0.x 사용자의 데이터(API 키 / 캐시 / 풀이 통계) 손실 방지를 위해 폴더명은 호환성 유지. 앱 표시 이름만 v1.0+ `iq-solvebuddy`로 변경.

### AI 회고

`src/services/annotator.ts`의 프롬프트는 다음을 강제한다:

- **알고리즘 로직 100% 동일 유지** (개선이 아니라 *재해석*)
- 의미 없는 변수명 → 의미 있는 이름
- 핵심 단계마다 한국어 한 줄 주석
- 시간/공간 복잡도 + *왜* 그런지의 짧은 설명
- 대안 접근 1~2가지 (트레이드오프 포함)
- 비슷한 LeetCode 문제 추천 2~3개

### 단일 atomic commit + 언어별 폴더 + README 중복 skip

3개 파일이 *하나의 commit*으로 올라간다. **git data API**로 blob → tree → commit → ref 업데이트 직접 호출. 같은 문제를 여러 언어로 풀어도 **언어별 하위 폴더**로 분리되어 회고가 덮어써지지 않음.

**README는 한 번만**: 같은 문제 다른 언어로 풀 때 README가 동일 내용으로 매번 push되던 git history noise 제거. 기존 sha 내용과 비교해 같으면 commit에서 제외. solution / RETROSPECTIVE는 사용자 의도(개선 push)가 있을 수 있어 항상 commit.

```
feat: 101. Symmetric Tree (java) 풀이 추가 + 인덱스 갱신
feat: 101. Symmetric Tree (python, README 변경 없음) 풀이 추가 + 인덱스 갱신
```

**풀이 재upload 알림**: 같은 slug+language 풀이가 이미 있으면 step-3 위에 dashed 알림 — 차단 X, 인지 only. 다시 풀어서 개선한 코드로 회고 재생성하는 use case가 정상.

### 멀티 플랫폼 (v1.2 — Phase 1-4 완료)

풀이 레포 path 구조를 **플랫폼별 폴더**로:

```
{owner}/{repo}/
├── README.md                  ← 플랫폼별 섹션 (접기 가능)
├── LeetCode/
│   ├── 0001-two-sum/
│   │   ├── README.md
│   │   └── java/
│   │       ├── solution.java
│   │       └── RETROSPECTIVE.md
│   └── ...
├── Programmers/                ← v1.0 추가
│   ├── 12345-주사위-게임-3/
│   │   └── python/...
│   └── ...
├── AtCoder/                    ← v1.1 추가
│   ├── abc300_a-n-repititions/
│   │   └── cpp/...
│   └── ...
├── Codeforces/                 ← v1.2 추가
│   ├── 1234-A-two-pointers/
│   │   └── cpp/...
│   └── ...
└── BOJ/                        ← Phase 5
```

- **LeetCode**: 영어 → 한국어 번역. path: `LeetCode/NNNN-slug/` (0-pad frontendId)
- **프로그래머스**: 한국어 원문 → **정리 모드** (번역 X). SQL 문제도 동일. Lv 0-2 비로그인 OK, Lv 3+는 임베드 세션 활용 예정(Phase 2.5)
- **AtCoder**: 영어 우선 → 한국어 번역. 일본어만 있으면 일본어 → 한국어. path: `AtCoder/{taskId}-{slug}/` (taskId가 globally unique). 점수가 난이도 (예: "300점"). 진행 중인 콘테스트는 403 차단 — 콘테스트 종료 후 사용 가능
- **Codeforces**: 영어 → 한국어 번역. path: `Codeforces/{contestId}-{index}-{slug}/` (예: `1234-A-two-pointers`). rating이 난이도 (예: "★1500"). `contest/` / `problemset/problem/` 두 URL 형태 모두 인식

Root README는 각 플랫폼별 `<details>` 섹션 — LeetCode default 펼침, 나머지는 접힘:

```markdown
<details open>
<summary><b>LeetCode</b> · 12 문제</summary>
| # | 제목 | 난이도 | 언어 | 일자 |
...
</details>

<details>
<summary><b>Programmers</b> · 0 문제</summary>
_아직 풀이가 없습니다._
</details>
...
```

**기존 풀이 자동 마이그레이션**: v0.8 이하 사용자는 풀이가 root 바로 아래(`0001-two-sum/`)에 있음. 📊 stats 모달의 **"🗂 기존 풀이 정리"** 버튼 한 번 클릭 → recursive tree get + 새 tree create(legacy path 삭제 + LeetCode/ 새 path 추가) + root README 새 형식으로 — **단일 commit**으로 깔끔하게 정리. 이미 마이그레이션된 사용자는 noop.

> Phase 2 이후 각 플랫폼이 추가될 때마다 같은 패턴 — `Programmers/12345-슬러그/`, `AtCoder/abc300_a/` 등. 인덱스 섹션도 자동 추가.

### 풀이 레포 root README 자동 인덱스

매 upload 시 풀이 레포의 root `README.md`에 인덱스 표가 자동 갱신됨:

```markdown
| # | 제목 | 난이도 | 언어 | 풀이 일자 |
|---|---|---|---|---|
| 1 | [Two Sum](0001-two-sum/) | Easy | java, python | 2026-05-12 |
| 101 | [Symmetric Tree](0101-symmetric-tree/) | Easy | java | 2026-05-11 |
```

- 같은 문제 다른 언어로 풀면 `languages` 합쳐서 한 row로 표시
- `<!-- iq-leetbuddy:problems:start -->` ~ `:end -->` marker 사이만 update — **사용자가 README 위/아래에 자유롭게 글 추가 가능** (인사말, 사용법 등)
- 풀이 레포가 GitHub 파일 브라우저의 alphanumeric 정렬을 넘어 *진짜 인덱스 있는 학습 노트*가 됨

### 풀이 통계 dashboard + GitHub backfill

헤더 **📊 버튼** → 모달:

- **요약 카드 4개** — 총 풀이수 / 이번 달 / 최근 7일 / **연속 풀이 일수**
- **난이도 분포** — Easy(녹색) / Medium(황색) / Hard(적색) 막대
- **언어 분포** — 가장 많이 쓴 언어 순 막대
- **월별 풀이수** — 최근 6개월 세로 막대 그래프
- **최근 풀이 10개** — 번호 · 제목 · 언어 · 일자

`localStorage`에 누적 (오프라인 안전). 업로드 성공 시 자동 record. 같은 slug+lang은 dedup + savedAt 갱신.

**↻ GitHub 동기화 버튼** (모달 상단) — 풀이 레포 root README의 인덱스를 읽어 누락된 풀이를 localStorage에 채움. 다른 디바이스 / v0.5 이전 풀이까지 통계에 포함.

### Draft 자동 저장 + 복원

step-3에서 코드 작성 중 앱 종료 시 데이터 손실 방지. CodeMirror change → 800ms debounced localStorage 저장 (key: `iq-leetbuddy:draft:{slug}:{lang}`). 같은 문제 다시 fetch하면 자동 복원 + "이전 작성 중이던 코드 복원됨" 안내. 업로드 성공 시 해당 draft 자동 삭제.

### LeetCode Accepted 사전 확인 (override 가능)

본 도구의 핵심 가치는 *통과한 풀이*를 학습 자산화하는 것. 회고 생성 직전에 임베드 LeetCode 세션 cookies로 가벼운 `submissionList` 호출 → 해당 문제에 Accepted submission 존재 여부 확인:

- **있음** → 정상 진행
- **없음** → Electron native dialog 확인 모달:
  - "취소 (먼저 LeetCode에서 풀기)" / **"그래도 업로드"** 둘 중 선택
  - 다른 OJ / 오프라인 풀이 / 의도된 upload 같은 예외 케이스를 위한 **override 허용**
  - 모달 안 **"다시 묻지 않음"** 체크박스 — 설정 토글 자동 OFF (언제든 다시 켤 수 있음)
- **확인 불가** (로그인 안 됨 / 네트워크 / API fail) → silent skip — 정상 흐름 막지 않음 (false negative 방지)

⚙️ Settings의 **"업로드 전 LeetCode Accepted 확인"** 토글 (default ON)로 끌 수 있음.

### 회고 사후 편집

AI 회고가 자동 commit되지만, 가끔 알고리즘 분류나 복잡도 계산이 틀릴 수 있어 — step-4 결과 화면의 **✏️ 회고 수정해서 다시 commit** 버튼으로 사후 수정 가능:

- annotation-stream을 editable markdown textarea로 전환
- 수정 후 "commit" → `RETROSPECTIVE.md`만 새 commit (`fix:` prefix, history 보존 — amend X)
- 코드(solution) / 번역(README)은 그대로
- 또 수정도 가능

평소엔 자동 흐름 그대로, 잘못된 회고 발견 시만 한 번 클릭.

### 시스템 알림 + 자동 흐름

- **macOS native notification** — 업로드 완료 시 `✓ solvebuddy 업로드 완료` 시스템 알림 (첫 사용 시 권한 1회 요청)
- **자동 페이지 스크롤** — step-2/3/4가 처음 보일 때 부드럽게 viewport로
- **step-4에서 GitHub link** — 업로드 완료 후 📁 풀이 폴더 / 📚 풀이 인덱스 link 자동 표시

### OS Keychain 통합 (보안)

시크릿(`ANTHROPIC_API_KEY` / `GITHUB_TOKEN`)을 **OS native 암호화 저장소로**:
- **macOS**: Keychain (Security framework)
- **Windows**: DPAPI (current user scope)
- **Linux**: libsecret / kwallet / gnome-keyring (best available, 없으면 평문 fallback)

`.env` 파일에는 `ENC:base64_blob...` 형태로 저장. `process.env`엔 항상 복호화된 평문. **첫 부팅 시 평문 자동 마이그레이션** — 사용자 액션 불필요.

### 새 버전 자동 알림

부팅 시 GitHub Releases API polling. 새 버전이 있으면 footer 우측에 코랄 pill `↗ v0.x.x 사용 가능`. 클릭 → Releases 페이지 새 탭 → 새 zip 다운로드.

> `electron-updater`의 background download/install은 macOS unsigned 앱에서 cert 요구로 fail. 단순 polling 방식으로 가치 보존 (사용자는 알림만 받고, 다운로드는 기존 흐름과 동일).

### 테마 모드 (Dark / Light / System)

⚙️ 설정 → **모양 (Appearance)** 섹션에서 3 옵션:
- **Dark** (기본) — 짙은 베이지 + 검정 톤 위에 코랄 accent
- **Light** — 따뜻한 오프화이트 + 진한 코랄 (macOS feel)
- **System** — OS `prefers-color-scheme` 따라 자동. macOS/Windows 외관을 바꾸면 즉시 반영

전환 시 변경되는 것:
- CSS 변수 전체 (배경 / 텍스트 / border / accent / success / danger)
- **highlight.js 코드블록 색** — atom-one-dark ↔ atom-one-light
- **CodeMirror 에디터 색** — material-darker ↔ material
- 행성 halo/pulse 색 — Dark는 따뜻한 흰빛, Light는 따뜻한 brown 그림자 (반전 효과)

`localStorage`에 저장 (`iq-leetbuddy:theme`). System 모드는 OS 변경 감지 (`matchMedia` listen).

### 살아있는 코랄 행성

헤더 좌측 행성에 **3-layer 시각 효과**:
- **Halo** — conic gradient 따뜻한 빛이 행성 주위로 회전 (5초)
- **Pulse** — radial glow가 호흡하듯 scale/opacity 변동 (3.5초)
- **Sparkle** — 표면 좌상단 작은 spot이 푸른빛 → 흰빛 → 붉은빛으로 색조 순환 (5초)

macOS Siri orb / 명상 앱 느낌. Light 모드에선 흰빛 대신 따뜻한 brown 그림자 (배경 대비 유지).

### 친절한 에러 + 자동 복구

GitHub API 에러는 **HTTP status code별 한국어 진단 메시지**. 401 / API 키 누락 / `GITHUB_TOKEN` 누락 등 **credential 에러는 자동으로 ⚙️ 설정 모달 안내** (`.env` 같은 구현 단어 노출 X). 404 시 *"이 이름으로 새 레포 만들기"* 버튼 자동 노출 — 자동 생성 토글이 켜져 있으면 *AI 회고 비용 추가 없이* (annotated 재사용) 레포 만들고 retry까지 자동.

LeetCode 에러도 정밀화: 429 rate limit / 5xx 서버 / 404 ("문제를 찾을 수 없어요 — URL 또는 문제 이름을 확인해주세요") 분기.

input 자체에도 fetch 실패 시 **red border + shake 애니메이션** → 어디가 잘못됐는지 즉시 보임.

---

## 단축키

| 단축키 | 기능 |
|---|---|
| `⌘⌥L` (글로벌) | 어떤 앱에 있든 solvebuddy로 호출 (점유 시 `⌘⌥B → ⌘⌥J → ⌘⇧L` fallback) |
| `⌘⇧↩` (앱/임베드 active) | 임베드 LeetCode URL을 메인 input으로 + 자동 fetch |
| `⌘K` (앱 내) | 입력/결과 모두 초기화 (= "다음 문제 가져오기" 버튼) |
| `Enter` (문제 입력란) | 불러오기 |
| `Cmd+F` (코드 에디터) | 검색 (CodeMirror 기본) |
| `Cmd+D` (코드 에디터) | 다중 커서 (CodeMirror 기본) |
| `Esc` (설정/통계 모달) | 모달 닫기 |
| `⌘Q` | 완전 종료 |

추가: 메뉴바 🪐 트레이 아이콘 클릭 / `View → solvebuddy 보이기/포커스`.

---

## 결과물: GitHub에 이렇게 쌓인다

```
{owner}/{repo}/
├── README.md                  ← 자동 인덱스 표 (marker 영역만 update)
│
├── 0001-two-sum/
│   ├── README.md             ← 한국어 번역 (공통, 중복 skip)
│   ├── python/
│   │   ├── solution.py
│   │   └── RETROSPECTIVE.md  ← Python 풀이 회고
│   └── java/
│       ├── solution.java
│       └── RETROSPECTIVE.md  ← Java 풀이 회고
│
├── 0094-binary-tree-inorder-traversal/
│   ├── README.md
│   └── cpp/
│       ├── solution.cpp
│       └── RETROSPECTIVE.md
│
└── 0101-symmetric-tree/
    ├── README.md
    └── java/
        ├── solution.java
        └── RETROSPECTIVE.md
```

- root `README.md` — 풀이 인덱스 자동 갱신 (사용자 자유 텍스트 보존)
- 폴더명 `{4자리 번호}-{titleSlug}` → GitHub 파일 브라우저에서 자연 정렬
- **언어별 하위 폴더**로 풀이/회고 분리 → 같은 문제 여러 언어 풀어도 회고 보존

---

## 비용

문제당 Claude API 호출 = 번역 + 회고 = **2회** (캐시 hit이면 회고만 1회).
Sonnet 4.6 기준 **문제당 약 $0.02~0.04**. 월 100문제 풀어도 $2~4 수준.

GitHub API는 시간당 5,000 requests 한도. 문제당 ~9 calls (README sha 확인 1회 + git data API 8회). 555문제까지 여유.

---

## ⚙️ 개발자용 — 소스에서 빌드

위 다운로드 섹션 안 보고 직접 코드로 굴리고 싶다면.

### 의존성

- Node.js 20+
- macOS 13+ (또는 Windows 10+ / Ubuntu 20.04+)

### 로컬 실행

```bash
git clone https://github.com/iq-agent-lab/iq-solvebuddy.git
cd iq-solvebuddy
npm install
npm start
```

`npm start`는 `tsc + copy-assets + electron .` 한 번에. dev 모드는 DevTools detach 모드로 자동 오픈 (`npm run dev`).

API 키/토큰은 **앱 안 ⚙️ 모달에서 입력**. OS keychain으로 자동 암호화.

### 직접 패키징 (배포 파일 만들기)

```bash
npm run dist:mac           # macOS .zip (현재 아키텍처)
npm run dist:mac-universal # M-시리즈 + Intel 둘 다
npm run dist:win           # Windows .exe (Windows에서만)
npm run dist:linux         # Linux .AppImage (Linux에서만)
```

결과물은 `release/` 디렉토리.

### 자동 배포 (GitHub Actions)

git tag를 push하면 자동으로 macOS/Windows/Linux 빌드 후 GitHub Releases에 업로드:

```bash
# patch 버전 자동 bump + commit + tag + push 한 줄
npm run release

# 또는 수동
git tag v0.x.y
git push origin v0.x.y
```

### 폴더 구조

```
iq-solvebuddy/
├── src/
│   ├── main/                Electron 메인 (윈도우/트레이/단축키/IPC)
│   │   ├── index.ts         부트, 메인/임베드 윈도우, INJECT_SCRIPT
│   │   ├── ipc.ts           IPC + streaming throttle (makeStreamForwarder)
│   │   ├── settings.ts      .env 읽기/쓰기 + OS keychain encrypt/decrypt
│   │   └── update.ts        GitHub Releases polling (새 버전 알림)
│   ├── preload/             contextBridge 안전 다리
│   ├── renderer/            UI (TypeScript + HTML/CSS)
│   ├── services/
│   │   ├── leetcode.ts      GraphQL fetch + submission 자동 (cookies 인증)
│   │   ├── translator.ts    Claude streaming translate
│   │   ├── annotator.ts     Claude streaming annotate
│   │   ├── pipeline.ts      fetchAndTranslate + annotateAndUpload
│   │   ├── github.ts        Octokit git data API + root README 자동 인덱스
│   │   ├── cache.ts         번역 결과 캐시 (userData/cache/translations)
│   │   └── markdown.ts      marked v12 dynamic import
│   ├── types/               공유 타입 (IqApi, AppSettings 등)
│   └── util/                retry · langToExt · 입력 파싱 (URL/slug/번호)
├── build/                   앱 아이콘, macOS entitlements
├── assets/                  트레이 아이콘 (메뉴바용)
├── scripts/                 copy-assets, 아이콘 생성기
├── CLAUDE.md                Claude Code 세션 작업 컨텍스트
└── .github/workflows/       CI/CD
```

전 코드 베이스 TypeScript (main + preload + renderer). 빌드 후 `dist/vendor/`에 CodeMirror 5 + highlight.js + marked가 vendor 복사됨 (CSP `script-src 'self'` 유지).

---

## 로드맵

### v0.3.x (완료) — 배포 가능

- [x] 배포 가능한 macOS `.zip` + Linux `.AppImage` + Windows `.exe`
- [x] 코랄 행성 모티프 앱 아이콘
- [x] GitHub Actions 자동 빌드 / 자동 Release
- [x] `.app` 패키징 + 사용자 wrap 명령

### v0.4.x (완료) — 핵심 UX

- [x] **임베드 LeetCode 양방향 URL 전달** — push 3경로(chip/메뉴/단축키) + pull 보조 버튼
- [x] **원문 클릭 시 시작 언어 자동 안내** — 토스트 + best-effort DOM
- [x] **번역/회고 Streaming** (Anthropic SDK)
- [x] **Input UX** — 카드형 hint grid + paste preview + clear 버튼 + 에러 shake
- [x] **시작 언어 LocalStorage 기억** + 최근 풀이 5개 chips
- [x] **README 중복 commit skip** + 번역 결과 캐시
- [x] **첫 실행 자동 settings prompt** + credential 에러 자동 모달
- [x] **번역/회고 코드블록 syntax highlight**
- [x] **Renderer TypeScript 마이그레이션** (main↔renderer 비대칭 해소)
- [x] **OS keychain 통합** — Electron `safeStorage` (macOS Keychain / Windows DPAPI / Linux libsecret) + 평문 `.env` 자동 마이그레이션

### v0.5.x (완료) — 자동화 + 가시화

- [x] **문제 번호로 검색** — `1`, `2024` 입력 시 LeetCode GraphQL로 titleSlug 자동 해결
- [x] **leetcode.cn URL 인식** — com에서 같은 slug fallback (cn은 Cloudflare 직접 접근 불가)
- [x] **풀이 레포 root README 자동 인덱스** — marker 영역 갱신, 사용자 자유 텍스트 보존
- [x] **풀이 통계 dashboard** — 📊 모달 (요약 4카드 + 난이도/언어 분포 + 월별 그래프 + 최근 풀이)
- [x] **새 버전 자동 알림** — GitHub Releases polling → footer 코랄 pill
- [x] **LeetCode 최근 통과 코드 자동 가져오기** — 임베드 세션 cookies로 인증된 GraphQL → step-3 자동 채움
- [x] **풀이 재upload 시 step-3 경고** — 같은 slug+language 풀이 있으면 dashed 알림
- [x] **헤더 강화** — 38×38 버튼 + LeetCode favicon
- [x] **CodeMirror 5 코드 에디터** — 줄 번호 + syntax color + bracket matching + 자동 인덴트 + 검색 (8개 lang 지원)
- [x] **설정 모달 X 버튼 drag region fix** — macOS hiddenInset titlebar의 `-webkit-app-region: drag`가 modal 영역과 viewport 좌표상 겹쳐 click 가로채던 critical bug

### v0.6.x (완료) — 디자인 정체성

- [x] **테마 모드** — Dark / Light / System (OS 자동) 3 옵션. CSS 변수 전체 + hljs + CodeMirror theme 동기 전환
- [x] **살아있는 코랄 행성** — halo 회전 + pulse 호흡 + sparkle 색조 순환 (푸른빛↔흰빛↔붉은빛). Light 모드에선 따뜻한 brown halo (반전)
- [x] **헤더 정리** — subtitle 제거, traffic light와 균형, 우측 아이콘과 수직 center 정렬
- [x] **status 메시지 한국어 가독성** — uppercase 제거, letter-spacing 정상화, 자연스러운 줄바꿈 (한국어 단어 단위)
- [x] **step-2 title 가독성** — "번역 & 시작 코드" → "번역 · 시작 코드" (Fraunces italic에서 `&` 어색했음)

### v0.7.x (완료) — UX 흐름 완성 + 데이터 안전망

- [x] **자동 페이지 스크롤** — 새 step이 처음 보일 때 부드럽게 viewport로
- [x] **step-4 풀이 폴더 / 인덱스 link** — 업로드 완료 후 한 클릭으로 GitHub 풀이 폴더 또는 인덱스 페이지로
- [x] **Draft 자동 저장 + 복원** — step-3 코드를 800ms debounced localStorage 저장. 앱 종료/재부팅 후 같은 문제 fetch 시 자동 복원
- [x] **GitHub backfill** — root README 인덱스에서 풀이 entry parse → localStorage 채움. 다른 디바이스 / v0.5 이전 풀이 동기화
- [x] **macOS native notification** — 업로드 완료 시 시스템 알림 (`Notification` API, 첫 사용 시 권한 요청)
- [x] **Light 모드 modal backdrop** — Dark용 어두운 톤이 그대로 적용되던 일관성 깨짐 fix (`--modal-backdrop-bg` var화)
- [x] **OS keychain 실패 시 경고** — Linux/keychain 없는 환경에서 평문 fallback 시 settings 모달에 빨간 박스 안내
- [x] **Light 모드 CodeMirror theme fix** — `material`이 이름과 달리 dark theme이라 light 배경에서 punctuation 안 보임 → `default`로 변경
- [x] **step-4 title 가독성** — "AI 회고 & 업로드" → "AI 회고 · 업로드"

### v0.8.x (완료) — 풀이 무결성 + 사후 통제

- [x] **LeetCode Accepted 사전 확인** — 회고 생성 직전 `submissionList` 호출. Accepted 없으면 Electron native dialog로 "그래도 업로드?" override 확인. 모달 안 "다시 묻지 않음" 체크박스 (설정 토글 자동 OFF). API fail/세션 안 됨은 silent skip. Settings 토글로 끌 수 있음 (다른 OJ / 오프라인용)
- [x] **회고 사후 편집** — step-4의 ✏️ 버튼으로 회고만 새 commit (`fix:` prefix, amend 아닌 새 commit으로 history 보존). 자동 흐름은 그대로 유지, 잘못된 회고 발견 시만 수정

### v0.9.x (완료) — 멀티 플랫폼 기반 (Phase 1)

- [x] **레포 path 변경** — `LeetCode/NNNN-slug/` (이전 root 바로 아래에서). 5개 플랫폼 enum 예약 (LeetCode / Programmers / AtCoder / Codeforces / BOJ)
- [x] **root README 멀티 플랫폼 인덱스** — `<details>` 섹션, 플랫폼별 marker (`<!-- iq-leetbuddy:LeetCode:start -->`), legacy marker(`iq-leetbuddy:problems`) 자동 변환
- [x] **기존 풀이 자동 마이그레이션** — stats 모달 "🗂 기존 풀이 정리" 버튼. recursive tree get + 단일 commit으로 legacy path → LeetCode/ 아래로 mv + root README 새 형식 갱신
- [x] **IndexEntry / SolutionRecord에 platform 필드 추가** — 향후 다른 플랫폼 entry 호환

### v1.0.x (완료) — Phase 2: 프로그래머스

- [x] **프로그래머스 지원** — HTML scraping (공식 API 없음, cheerio), 한국어 원문이라 *정리 모드* (번역 X). SQL 문제도 동일 흐름. Lv 0-2 비로그인 OK
- [x] **Programmers URL 자동 인식** — `parseProblemInput`이 LeetCode/Programmers URL 자동 분기. paste preview에 "프로그래머스 #{lessonId} 으로 가져오기" 미리 안내
- [x] **번역 결과 캐시 platform-prefix** — `programmers-{lessonId}.json` / LeetCode는 legacy 호환으로 prefix 없음. cache hit 시 LLM 호출 skip
- [x] **commit message platform prefix** — `feat: [프로그래머스] 12345. 주사위 게임 (python) 풀이 추가 + 인덱스 갱신`

### v1.1.x (완료) — Phase 3: AtCoder

- [x] **AtCoder 지원** — HTML scraping (cheerio). statement 영어 우선 + 일본어 fallback → 한국어 번역 (LeetCode prompt 패턴). KaTeX 수식 보존
- [x] **AtCoder URL 자동 인식** — `atcoder.jp/contests/{contestId}/tasks/{taskId}` 분기. paste preview "AtCoder {taskId} 으로 가져오기"
- [x] **path: `AtCoder/{taskId}-{slug}/`** — taskId가 globally unique (contest prefix 포함). entryFolder 중복 prefix 방지
- [x] **난이도 = 점수 표시** — 페이지의 "Score: NNN points" 또는 "配点: NNN" 추출 (예: "300점"). 외부 difficulty rating API는 v1.2+에서
- [x] **commit message** — `feat: [AtCoder] abc300_a. N-Repititions (cpp) 풀이 추가 + 인덱스 갱신`
- [x] **frontendId type 확장** — `number | string` (AtCoder taskId는 string `abc300_a`). 기존 localStorage 데이터(number) 호환 + 새 entry 수용
- [x] **진행 중 콘테스트 차단 대응** — HTTP 403 시 친절 에러 ("콘테스트 종료 후 다시 시도해주세요")

### v1.2.x (완료) — Phase 4: Codeforces + UX 마감

- [x] **Codeforces 지원** — HTML scraping. statement는 `.problem-statement` 전체 (header + body + sample-tests + note). MathJax 수식 보존
- [x] **두 URL 형태 인식** — `codeforces.com/contest/{N}/problem/{X}` 및 `codeforces.com/problemset/problem/{N}/{X}` 둘 다
- [x] **path: `Codeforces/{contestId}-{index}-{slug}/`** — 예: `Codeforces/1234-A-two-pointers/`. problemId = `{contestId}{index}` (예: `1234A`)
- [x] **난이도 = ★rating** — sidebar `.tag-box`의 `*1500` 형식에서 추출 → "★1500"으로 표시
- [x] **commit message** — `feat: [Codeforces] 1234A. Two Pointers (cpp) 풀이 추가 + 인덱스 갱신`
- [x] **AtCoder title 추출 버그 fix** — "A - N-Choice Question"에서 task letter "A" 제거 후 task name만 추출 (`stripTaskLetter` 헬퍼)
- [x] **헤더 바로가기 버튼 4개** — LeetCode(임베드) / Programmers / AtCoder / Codeforces (외부 브라우저). submission 자동 fetch는 LeetCode만이라 임베드도 LeetCode만 유지

### v1.3.x (완료) — 메타데이터 정교화

- [x] **AtCoder starter code 메시지 fix** — LeetCode 하드코딩 메시지를 platform별로 분기 (`noSnippetMessage(problem)`). AtCoder/CF는 "시작 코드 제공 안 함", Programmers는 비로그인 케이스 안내
- [x] **Codeforces tag 추출** — `.tag-box`에서 rating(`*1500`)과 algorithmic tags(greedy/dp 등) 통합 순회로 분리. 태그가 prompt에 포함되어 번역에 도움
- [x] **AtCoder difficulty rating** — kenkoooo.com `problem-models.json` (IRT 기반). 30MB+ JSON gzip ~5-10MB · 24h disk 캐시 + 메모리 캐시 + 부팅 prewarm. 표기: "300점 · 난이도 1234" / 음수면 "≤0"

### v1.4+ (다음 후보) — submission 자동 fetch

- [ ] **AtCoder submission 자동 fetch (Phase 3.5)** — `persist:atcoder` 임베드 윈도우. 로그인 세션 활용해 마지막 통과 코드 가져오기
- [ ] **Codeforces submission 자동 fetch (Phase 4.5)** — `persist:codeforces` 임베드 + submission API 또는 scraping
- [ ] **프로그래머스 임베드 + submission (Phase 2.5)** — `persist:programmers` 임베드. Lv 3+ 로그인 필요 문제도 가져오기
- [ ] **백준 BOJ (Phase 5)** — 보류 (서버 종료 이슈). 향후 재개 시 진행

- [ ] **풀이 통계 native sync** — better-sqlite3 또는 localStorage → gist 백업 (디바이스 간 sync)
- [ ] **CodeMirror addons** — 검색 UI(panel), 코드 fold, line wrapping toggle
- [ ] **회고 prompt 사용자 customize** — 회고 형식 사용자 정의 (간결/상세 등)
- [ ] **풀이 검색** — stats 모달 안 search box (100개 이상 누적 시 필요)

### 장기

- [ ] 다른 OJ 지원 (Codeforces, BOJ)
- [ ] 풀이 레포 RAG 검색 — "DP 문제 중 비슷한 것" 같은 자연어 검색
- [ ] iq-blogger 연동 — RETROSPECTIVE → 블로그 포스트 자동 변환

---

## 트러블슈팅

### "iq-solvebuddy은(는) 손상되었기 때문에 열 수 없습니다"

unsigned 앱에 macOS가 quarantine 꼬리표를 붙인 거. *진짜 손상 아님*. 위 [3. 터미널에서 한 번에 설치](#3-터미널에서-한-번에-설치) 절차의 한 줄 명령으로 해결. 또는 이미 Applications에 있는 .app만 처리하려면:

```bash
xattr -cr /Applications/iq-solvebuddy.app
```

### 두 번째 설치 시 `mv: Directory not empty`

`.app`은 macOS에서 디렉토리(번들). `mv -f`는 *파일* 덮어쓰기는 되지만 디렉토리는 target이 비어있어야. 위 설치 명령의 `rm -rf /Applications/iq-solvebuddy.app && mv ...` 패턴이 이걸 해결.

### 업로드 실패: 404 Not Found

설정의 owner/repo가 실제 GitHub 레포와 불일치. ⚙️ 설정 → **"GitHub 연결 확인"** 클릭하면 진단됨. 레포 없으면 그 자리에서 "지금 만들기".

### 인증 에러 — API 키 / 토큰

solvebuddy가 자동으로 ⚙️ 설정 모달을 열어줌. 키를 새로 입력 후 저장하면 즉시 반영 (앱 재시작 불필요).

### globalShortcut 안 먹음

다른 앱이 키 점유 중. fallback 4개까지 시도하지만 모두 점유되면 등록 실패. 트레이 메뉴 또는 View 메뉴로 solvebuddy 복귀 가능.

### LeetCode embedded 윈도우 로그인 안 됨

`persist:leetcode` 파티션 손상 가능성. macOS: `~/Library/Application Support/iq-leetbuddy/Partitions/leetcode/` 폴더 삭제 후 재실행.

### "최근 통과 코드 자동 가져오기" 안 됨

임베드 LeetCode 윈도우에 로그인 안 되어 있거나 세션 만료. 헤더 LeetCode 버튼으로 임베드 윈도우 열고 다시 로그인. LeetCode 비공식 API라 schema 변경 시에도 실패 가능 — 그땐 기존 복사-붙여넣기 흐름으로.

### 번역 캐시 무효화

LeetCode 문제 본문이 갱신된 경우 (드물지만) 캐시를 비워야 새 번역을 받음:

```bash
rm -rf "~/Library/Application Support/iq-leetbuddy/cache/translations/"
```

또는 문제 하나만:
```bash
rm "~/Library/Application Support/iq-leetbuddy/cache/translations/{slug}.json"
```

### 다른 컴퓨터 / 계정으로 .env를 옮겼더니 키가 안 먹음

OS keychain encrypted 시크릿은 **그 머신/계정에서만 복호화 가능**. 다른 머신으로 `.env`를 그대로 옮기면 `ENC:` prefix 시크릿이 복호화 실패 → 빈 값으로 처리됨 → ⚙️ 설정 모달이 자동으로 뜸. 새 머신에서 키를 다시 입력하면 그 머신의 keychain으로 새로 암호화됨.

일반 설정(`ANTHROPIC_MODEL`, `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH`, `GITHUB_AUTO_CREATE_REPO`)은 평문이므로 그대로 옮겨감.

### Linux에서 keychain 없을 때

`safeStorage.isEncryptionAvailable()`이 `false`면 (libsecret/kwallet 없는 minimal 환경) **평문으로 저장 fallback**. 이 경우 `.env` 권한을 `chmod 600`으로 제한 권장.

### 임베드 → 메인 URL 전달이 안 됨

임베드 윈도우 우하단 chip이 안 보이면 SPA 라우팅 폴링(1.2s) 지연일 수 있음. 페이지 다시 로드 또는 `⌘⇧↩` 메뉴 단축키 사용.

### LeetCode lang dropdown 자동 선택이 안 됨

LeetCode UI 구조에 의존적이라 fragile. **토스트는 항상 표시**되니 직접 dropdown 클릭으로 변경. (이건 결정 — toast의 *명확한 확정성* vs DOM 조작의 *fragile함* 사이 trade-off)

### 빌드 시 타입 에러

```bash
rm -rf node_modules dist package-lock.json
npm install
npm run build
```

---

## 라이선스 & 크레딧

MIT.

빌딩 블록:
- [Electron](https://www.electronjs.org/) — 데스크톱 쉘
- [electron-builder](https://www.electron.build/) — 패키징/배포
- [Anthropic SDK](https://docs.anthropic.com/) — Claude Sonnet 4.6 API (streaming)
- [Octokit](https://github.com/octokit/octokit.js) — GitHub git data API
- [CodeMirror 5](https://codemirror.net/5/) — 코드 에디터 (통과 코드 입력)
- [highlight.js](https://highlightjs.org/) — syntax highlighting (번역/회고 코드블록, atom-one-dark)
- [marked](https://marked.js.org/) — Markdown → HTML
- [LeetCode GraphQL](https://leetcode.com/graphql/) — 공개 문제 메타 + 인증 submission endpoint

영감:
- [LeetHub](https://github.com/QasimWani/LeetHub) — 제출 후 GitHub commit 패턴의 원조

---

*Built by IQ as one planet of [iq-agent-lab](https://github.com/iq-agent-lab).*
*Curiosity is the question, code is the answer.*
