// LeetCode GraphQL 응답 + 내부 도메인 타입 + IPC API 계약

/**
 * 지원 플랫폼 — Phase 1은 LeetCode만 실제 동작, 나머지는 enum/marker 예약.
 * Phase 2: Programmers (한국어), Phase 3: AtCoder, Phase 4: Codeforces, Phase 5: BOJ
 */
export type Platform = 'LeetCode' | 'Programmers' | 'AtCoder' | 'Codeforces' | 'BOJ';

export const ALL_PLATFORMS: Platform[] = ['LeetCode', 'Programmers', 'AtCoder', 'Codeforces', 'BOJ'];


export interface LeetCodeTag {
  name: string;
  slug: string;
}

export interface CodeSnippet {
  lang: string;        // 표시명 (e.g., "Python3", "Java")
  langSlug: string;    // 슬러그 (e.g., "python3", "java")
  code: string;        // 시작 코드 템플릿
}

export interface LeetCodeProblem {
  platform?: 'LeetCode'; // discriminator (v1.0+ — union 시 type narrowing)
  questionFrontendId: string;
  title: string;
  titleSlug: string;
  content: string; // HTML
  difficulty: 'Easy' | 'Medium' | 'Hard';
  exampleTestcases: string;
  topicTags: LeetCodeTag[];
  codeSnippets: CodeSnippet[];
}

/**
 * 프로그래머스 문제 — HTML scraping (공식 API 없음).
 * 본문이 이미 한국어라 *번역*이 아닌 *정리* 모드 사용 (translator).
 */
export interface ProgrammersProblem {
  platform: 'Programmers';
  lessonId: string;
  /** LeetCode와 호환되도록 같은 필드명 — pipeline에서 union으로 다루기 위해 */
  questionFrontendId: string; // = lessonId
  title: string;
  titleSlug: string; // slug from title (한글 + dash)
  content: string; // HTML
  difficulty: string; // 'Lv 0' ~ 'Lv 5'
  exampleTestcases: string; // table 또는 빈
  topicTags: LeetCodeTag[]; // 일반적으로 빈, 있으면 채움
  codeSnippets: CodeSnippet[]; // starter code — 비로그인 시 빈 배열 가능
  url: string;
}

/**
 * AtCoder 문제 — HTML scraping (공식 API 없음).
 * statement는 영어 + 일본어 둘 다 페이지에 있음. translator가 영어 우선 → 한국어 번역.
 */
export interface AtCoderProblem {
  platform: 'AtCoder';
  contestId: string; // 예: 'abc300'
  taskId: string;    // 예: 'abc300_a'
  /** Problem union 호환 — taskId 그대로 */
  questionFrontendId: string;
  title: string;
  titleSlug: string; // taskId-slug 형식
  content: string;   // HTML (영어 또는 일본어)
  difficulty: string; // 점수 표시 (예: '300점')
  /** translator가 어떤 언어인지 알아야 prompt 분기 가능 */
  statementLang: 'en' | 'ja' | 'unknown';
  exampleTestcases: string;
  topicTags: LeetCodeTag[]; // 비어있음 (AtCoder는 태그 없음)
  codeSnippets: CodeSnippet[]; // 비어있음 (starter code 없음)
  url: string;
}

/**
 * Codeforces 문제 — HTML scraping (공식 API는 problemset 메타데이터만).
 * statement는 영어 → 한국어 번역 (LeetCode 패턴 재사용).
 */
export interface CodeforcesProblem {
  platform: 'Codeforces';
  contestId: string; // 예: '1234'
  index: string;     // 예: 'A', 'B1'
  /** Problem union 호환 — '{contestId}{index}' (예: '1234A') */
  questionFrontendId: string;
  title: string;
  titleSlug: string; // `{contestId}-{index}-{slug}` 형식
  content: string;   // HTML
  difficulty: string; // 예: '★1500' (Codeforces rating)
  exampleTestcases: string;
  topicTags: LeetCodeTag[]; // CF tags 추출 가능하지만 비워둠 (v1.3+)
  codeSnippets: CodeSnippet[]; // 비어있음
  url: string;
}

export type Problem = LeetCodeProblem | ProgrammersProblem | AtCoderProblem | CodeforcesProblem;

export interface UploadPayload {
  problem: Problem;
  translation: string;
  code: string;
  language: string;
}

export interface UploadResult {
  folder: string;
  commitSha: string;
  commitUrl: string;
}

export interface FetchProblemResult {
  problem: Problem;           // v1.0+ : LeetCodeProblem | ProgrammersProblem
  translation: string;        // 원본 마크다운 (GitHub 업로드용. Programmers는 *정리*된 한국어)
  translationHtml: string;    // 렌더링된 HTML (UI 표시용)
}

export interface IpcError {
  error: string;
}

// ─── Settings (main/settings.ts + renderer 양쪽에서 사용) ──────────────────

export interface AppSettings {
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  GITHUB_TOKEN?: string;
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
  GITHUB_BRANCH?: string;
  GITHUB_AUTO_CREATE_REPO?: string;
}

export interface SettingsView {
  ANTHROPIC_API_KEY: string;          // 항상 빈 문자열 (보안)
  ANTHROPIC_MODEL: string;
  GITHUB_TOKEN: string;                // 항상 빈 문자열 (보안)
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  GITHUB_AUTO_CREATE_REPO: boolean;
  hasAnthropicKey: boolean;
  hasGithubToken: boolean;
}

export interface CheckConfigResult {
  anthropic: boolean;
  github: boolean;
  owner: string;
  repo: string;
  shortcut: string | null;
  /** OS keychain (safeStorage) 사용 가능 여부 — false면 시크릿이 평문 fallback. settings 모달에 경고. */
  keychain: boolean;
}

export interface VerifyResult {
  authedAs: string;
  owner: string;
  repo: string;
  repoExists: boolean;
  repoUrl?: string;
  repoDefaultBranch?: string;
  configuredBranch: string;
  branchMatches?: boolean;
}

export interface CreateRepoResult {
  url: string;
  defaultBranch: string;
  scope: 'user' | 'org';
}

// ─── IPC API 계약 (preload.ts ↔ renderer.ts) ──────────────────────────────

type IpcOk<T> = { ok: true } & T;
type IpcErr = { ok: false; error: string; status?: number | null };
type IpcResult<T> = IpcOk<T> | IpcErr;

export interface IqApi {
  fetchProblem: (input: string) => Promise<IpcResult<FetchProblemResult>>;
  uploadSolution: (
    payload: UploadPayload
  ) => Promise<IpcResult<UploadResult & { annotatedHtml: string }>>;
  checkConfig: () => Promise<CheckConfigResult>;
  getSettings: () => Promise<SettingsView>;
  saveSettings: (settings: AppSettings) => Promise<{ ok: boolean; error?: string }>;
  openLeetCode: (url?: string) => Promise<{ ok: boolean }>;
  getLeetCodeUrl: () => Promise<{ ok: boolean; url: string | null }>;
  pullLeetCodeUrl: () => Promise<{ ok: boolean }>;
  openAtcoder: (url?: string) => Promise<{ ok: boolean }>;
  getAtcoderUrl: () => Promise<{ ok: boolean; url: string | null }>;
  pullAtcoderUrl: () => Promise<{ ok: boolean }>;
  openCodeforces: (url?: string) => Promise<{ ok: boolean }>;
  getCodeforcesUrl: () => Promise<{ ok: boolean; url: string | null }>;
  pullCodeforcesUrl: () => Promise<{ ok: boolean }>;
  openProgrammers: (url?: string) => Promise<{ ok: boolean }>;
  getProgrammersUrl: () => Promise<{ ok: boolean; url: string | null }>;
  pullProgrammersUrl: () => Promise<{ ok: boolean }>;
  fetchSubmission: (
    payload:
      | string  // legacy: LeetCode titleSlug
      | { platform: 'LeetCode'; titleSlug: string }
      | { platform: 'AtCoder'; contestId: string; taskId: string }
      | { platform: 'Codeforces'; contestId: string; index: string }
      | { platform: 'Programmers'; lessonId: string }
  ) => Promise<IpcResult<{ code: string; langSlug: string; langName: string }>>;
  hasAcceptedSubmission: (
    payload:
      | string  // legacy: LeetCode titleSlug
      | { platform: 'LeetCode'; titleSlug: string }
      | { platform: 'AtCoder'; contestId: string; taskId: string }
      | { platform: 'Codeforces'; contestId: string; index: string }
  ) => Promise<{ accepted: boolean | null }>;
  confirmUploadWithoutAccepted: (
    payload: string | { platform: 'LeetCode' | 'AtCoder' | 'Codeforces'; label: string }
  ) => Promise<{ proceed: boolean; dontAskAgain: boolean }>;
  updateRetrospective: (payload: {
    problem: Problem;
    language: string;
    annotated: string;
  }) => Promise<IpcResult<UploadResult>>;
  backfillFromGithub: () => Promise<
    IpcResult<{
      entries: Array<{
        platform: Platform;
        problemId: string;
        title: string;
        slug: string;
        difficulty: string;
        languages: string[];
        savedAt: string;
      }>;
    }>
  >;
  migrateLegacyFolders: () => Promise<
    IpcResult<{
      migrated: number;
      alreadyMigrated: boolean;
      commitSha?: string;
      commitUrl?: string;
    }>
  >;
  clearTranslationCache: () => Promise<IpcResult<{ removed: number }>>;
  statsPushGist: (
    payload: { json: string; gistId: string | null }
  ) => Promise<IpcResult<{ gistId: string; url: string; size: number }>>;
  statsPullGist: (
    payload: { gistId: string | null }
  ) => Promise<IpcResult<{ solutionsJson: string | null; gistId: string | null }>>;
  createRepo: () => Promise<IpcResult<CreateRepoResult>>;
  verifyGithub: () => Promise<IpcResult<VerifyResult>>;
  onFetchProgress: (cb: (stage: string) => void) => () => void;
  onUploadProgress: (cb: (stage: string) => void) => () => void;
  onPullProblem: (cb: (url: string) => void) => () => void;
  onTranslateStream: (cb: (html: string) => void) => () => void;
  onAnnotateStream: (cb: (html: string) => void) => () => void;
  onUpdateAvailable: (cb: (info: { tag: string; url: string }) => void) => () => void;
}

declare global {
  interface Window {
    api: IqApi;
    hljs?: {
      highlightElement: (el: HTMLElement) => void;
    };
  }
}
