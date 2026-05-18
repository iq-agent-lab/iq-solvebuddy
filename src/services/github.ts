// GitHub API로 한 번의 commit에 3개 파일 (README, solution, RETROSPECTIVE) 업로드
// Octokit git data API 사용 - createOrUpdateFileContents는 파일당 commit 1개라 비효율

import { Octokit } from '@octokit/rest';
import { LeetCodeProblem, ProgrammersProblem, Problem, UploadResult, Platform } from '../types';
import { langToExt, langToFolder } from '../util/language';

// GitHub API 에러를 진단 가능한 한국어 메시지로 변환 (원본 status는 보존)
function toGitHubError(
  err: unknown,
  context: { owner: string; repo: string; branch: string; stage: string }
): Error & { status?: number } {
  const e = err as { status?: number; message?: string };
  const where = `[${context.stage}] ${context.owner}/${context.repo} · ${context.branch}`;

  let message: string;
  if (e?.status === 404) {
    message = `GitHub 리소스를 찾을 수 없습니다 (404)
현재 설정: ${context.owner}/${context.repo} (브랜치: ${context.branch})

가능한 원인:
• 레포 자체가 없음 — 아래 "이 이름으로 새 레포 만들기" 버튼으로 자동 생성 가능
• 레포 이름 불일치 — 설정의 GITHUB_REPO 값과 실제 GitHub 레포 이름이 다름
• 브랜치 이름이 다름 — main이 아니라 master일 수도
• PAT 권한 부족 — fine-grained 토큰이면 이 레포가 허용 목록에 있는지 확인`;
  } else if (e?.status === 401) {
    message = 'GitHub 토큰이 유효하지 않습니다 (401)\n헤더 ⚙️ 설정에서 새 PAT를 입력해주세요.';
  } else if (e?.status === 403) {
    message = `GitHub 토큰 권한 부족 (403)\nPAT 발급 시 repo scope (또는 public_repo) 체크 필요.\n토큰: https://github.com/settings/tokens`;
  } else if (e?.status === 409) {
    message = `레포 충돌 상태 (409)\n${where}\n레포가 비어있을 가능성. README 하나 추가 후 재시도.`;
  } else if (e?.status === 422) {
    message = `요청 형식 오류 (422) ${where}\n${e.message || ''}`;
  } else {
    message = `${e?.message || String(err)} ${where}`;
  }

  const out = new Error(message) as Error & { status?: number };
  out.status = e?.status;
  return out;
}

let _octokit: Octokit | null = null;
function octokit(): Octokit {
  if (!_octokit) {
    if (!process.env.GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN이 설정되지 않았습니다 — ⚙️ 설정에서 입력해주세요');
    }
    _octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  }
  return _octokit;
}

export function resetGithubClient() {
  _octokit = null;
}

interface CommitFile {
  path: string;
  content: string;
}

// ─── 풀이 레포 root README 자동 인덱스 (멀티 플랫폼) ─────────────────
// uploadSolution이 매 풀이마다 root README.md의 marker 영역만 update.
// 사용자가 README 위/아래에 자유 텍스트 추가 가능 (marker 밖 보존).
//
// 멀티 플랫폼: 각 플랫폼별 marker — `<!-- iq-leetbuddy:LeetCode:start -->` 등
// 풀이 path: `LeetCode/NNNN-slug/` / `Programmers/{lessonId}-{slug}/` 등
// legacy marker (`iq-leetbuddy:problems`)는 parseExistingIndex가 자동으로 LeetCode로 변환.
//
// ⚠️ 도구 이름이 v1.0+ iq-solvebuddy로 바뀌었지만 marker prefix는 `iq-leetbuddy:` 유지.
// 사용자 풀이 레포에 이미 저장된 marker와 일치시키기 위함 — invisible HTML 주석이라
// 사용자 노출 없음. marker 변경 시 모든 기존 entry가 미인식 처리되어 인덱스가 깨짐.

const PLATFORMS_IN_ORDER: Platform[] = ['LeetCode', 'Programmers', 'AtCoder', 'Codeforces', 'BOJ'];
const platformMarker = (p: Platform) => ({
  start: `<!-- iq-leetbuddy:${p}:start -->`,
  end: `<!-- iq-leetbuddy:${p}:end -->`,
});

const LEGACY_MARKER_START = '<!-- iq-leetbuddy:problems:start -->';
const LEGACY_MARKER_END = '<!-- iq-leetbuddy:problems:end -->';

interface IndexEntry {
  platform: Platform;
  /** 플랫폼별 식별자 — LeetCode: frontendId(string), Programmers: lessonId, etc. */
  problemId: string;
  title: string;
  /** path-safe slug — LeetCode: titleSlug, etc. */
  slug: string;
  difficulty: string;
  languages: string[];
  savedAt: string; // YYYY-MM-DD
}

// 풀이 폴더 경로 — 플랫폼별 prefix + 플랫폼별 폴더 명명 규칙
function entryFolder(e: IndexEntry): string {
  if (e.platform === 'LeetCode') {
    const num = String(e.problemId).padStart(4, '0');
    return `LeetCode/${num}-${e.slug}`;
  }
  // Phase 2+에서 추가될 플랫폼 — 일단 LeetCode 규칙으로 fallback
  return `${e.platform}/${e.problemId}-${e.slug}`;
}

// 한 플랫폼의 표 한 줄
function entryRow(e: IndexEntry): string {
  const langs = e.languages.join(', ');
  const safeTitle = e.title.replace(/\|/g, '\\|');
  return `| ${e.problemId} | [${safeTitle}](${entryFolder(e)}/) | ${e.difficulty} | ${langs} | ${e.savedAt} |`;
}

// 표 정렬 키 — 플랫폼별 다를 수 있지만 일단 problemId 숫자(있으면) → 문자열
function sortEntries(entries: IndexEntry[]): IndexEntry[] {
  return [...entries].sort((a, b) => {
    const an = parseInt(a.problemId, 10);
    const bn = parseInt(b.problemId, 10);
    if (!isNaN(an) && !isNaN(bn)) return an - bn;
    return a.problemId.localeCompare(b.problemId);
  });
}

function renderPlatformTable(entries: IndexEntry[]): string {
  if (entries.length === 0) {
    return '_아직 풀이가 없습니다._';
  }
  const sorted = sortEntries(entries);
  return [
    '| # | 제목 | 난이도 | 언어 | 풀이 일자 |',
    '|---|---|---|---|---|',
    ...sorted.map(entryRow),
  ].join('\n');
}

// 한 플랫폼 섹션 — `<details>` 접기 + count + 표
function renderPlatformSection(platform: Platform, entries: IndexEntry[]): string {
  const m = platformMarker(platform);
  const count = entries.length;
  // 첫 번째 (LeetCode)는 default open, 나머지는 접힘
  const openAttr = platform === 'LeetCode' && count > 0 ? ' open' : '';
  const tableMd = renderPlatformTable(entries);
  return `${m.start}
<details${openAttr}>
<summary><b>${platform}</b> · ${count} 문제</summary>

${tableMd}

</details>
${m.end}`;
}

// 한 플랫폼의 marker 영역 parse (새 또는 legacy)
function parsePlatformBlock(content: string, startMarker: string, endMarker: string, platform: Platform): IndexEntry[] {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  if (start < 0 || end < 0 || end < start) return [];
  const block = content.slice(start + startMarker.length, end);
  const lines = block.split('\n');
  const entries: IndexEntry[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    if (/^\|\s*-+/.test(trimmed)) continue;
    if (/^\|\s*#\s*\|/i.test(trimmed)) continue;
    const cells = trimmed.split('|').map((s) => s.trim()).filter((s, i, a) => {
      return !(i === 0 && s === '') && !(i === a.length - 1 && s === '');
    });
    if (cells.length < 5) continue;
    const [idCell, titleCell, diffCell, langCell, dateCell] = cells;
    const titleMatch = titleCell.match(/^\[(.+?)\]\((.+?)\/?\)\s*$/);
    if (!titleMatch) continue;
    const title = titleMatch[1];
    const folder = titleMatch[2].replace(/\/$/, '');
    // path: 새 format은 `LeetCode/NNNN-slug`, legacy는 `NNNN-slug`
    const platformStripped = folder.replace(new RegExp(`^${platform}/`), '');
    const slugMatch = platformStripped.match(/^(\d+)-(.+)$/);
    const problemId = slugMatch ? slugMatch[1] : idCell;
    const slug = slugMatch ? slugMatch[2] : platformStripped;
    const languages = langCell.split(',').map((s) => s.trim()).filter(Boolean);
    entries.push({
      platform,
      problemId,
      title,
      slug,
      difficulty: diffCell,
      languages,
      savedAt: dateCell,
    });
  }
  return entries;
}

// 기존 root README의 marker 영역(들) parse — 모든 플랫폼 + legacy
function parseExistingIndex(content: string): IndexEntry[] {
  const all: IndexEntry[] = [];

  // legacy marker (v0.8 이하) — 'LeetCode'로 변환
  if (content.includes(LEGACY_MARKER_START)) {
    all.push(...parsePlatformBlock(content, LEGACY_MARKER_START, LEGACY_MARKER_END, 'LeetCode'));
  }

  // 새 multi-platform markers
  for (const p of PLATFORMS_IN_ORDER) {
    const m = platformMarker(p);
    if (content.includes(m.start)) {
      all.push(...parsePlatformBlock(content, m.start, m.end, p));
    }
  }

  // dedup: 같은 platform + folder는 한 번만 (legacy + new 둘 다 매칭될 수 있어)
  const seen = new Set<string>();
  const unique: IndexEntry[] = [];
  for (const e of all) {
    const key = `${e.platform}:${entryFolder(e)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(e);
  }
  return unique;
}

function buildRootReadme(existingContent: string | null, entries: IndexEntry[]): string {
  // 플랫폼별로 entries 분리
  const byPlatform: Record<Platform, IndexEntry[]> = {
    LeetCode: [], Programmers: [], AtCoder: [], Codeforces: [], BOJ: [],
  };
  for (const e of entries) {
    byPlatform[e.platform].push(e);
  }

  // 모든 플랫폼 섹션 (count 0이어도 표시 — 풀이 추가 시 어떤 플랫폼 있는지 보임)
  const sections = PLATFORMS_IN_ORDER.map((p) => renderPlatformSection(p, byPlatform[p])).join('\n\n');

  const totalCount = entries.length;
  const header = `# 풀이 노트

> [iq-solvebuddy](https://github.com/iq-agent-lab/iq-solvebuddy)로 자동 정리되는 알고리즘 풀이 모음. 매 풀이마다 한국어 번역/정리 + AI 회고 + 통과 코드가 단일 commit으로 올라옴.

## 풀이 목록 (총 ${totalCount}문제)
`;
  const footer = `\n---\n*Generated by [iq-solvebuddy](https://github.com/iq-agent-lab/iq-solvebuddy)*\n`;

  // 기존 README가 있고 marker 영역(legacy 또는 new) 존재하면 사용자 자유 텍스트(위/아래) 보존
  if (existingContent) {
    // legacy marker 영역 전체 (legacy block만 교체 — 다른 새 marker 영역은 별도 처리)
    let result = existingContent;

    // legacy block 제거 (있으면)
    if (result.includes(LEGACY_MARKER_START)) {
      const lStart = result.indexOf(LEGACY_MARKER_START);
      const lEnd = result.indexOf(LEGACY_MARKER_END) + LEGACY_MARKER_END.length;
      result = result.slice(0, lStart) + result.slice(lEnd);
    }

    // 각 새 platform block 제거
    for (const p of PLATFORMS_IN_ORDER) {
      const m = platformMarker(p);
      if (result.includes(m.start)) {
        const s = result.indexOf(m.start);
        const e = result.indexOf(m.end) + m.end.length;
        result = result.slice(0, s) + result.slice(e);
      }
    }

    // marker 영역들 모두 제거된 result에 새 sections를 어디 넣을지:
    // 기존 marker 위치 비슷한 자리에 — 가장 단순한 건 끝에 append
    return `${result.trimEnd()}\n\n${sections}\n`;
  }

  // 처음 만드는 README
  return `${header}\n${sections}\n${footer}`;
}

// 파일 raw content fetch — getContent의 base64 decode
async function fetchFileContent(
  owner: string,
  repo: string,
  filePath: string,
  ref: string
): Promise<string | null> {
  try {
    const { data } = await octokit().repos.getContent({ owner, repo, path: filePath, ref });
    if (Array.isArray(data)) return null;
    if (data && 'content' in data && typeof data.content === 'string') {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    return null;
  } catch (err) {
    const e = err as { status?: number };
    if (e?.status === 404) return null;
    // 권한/네트워크 등 다른 에러는 caller에서 잡지 않고 그냥 null (index update 실패해도 풀이 commit은 진행되도록 silent)
    return null;
  }
}

// 기존 파일 내용과 새 content를 비교 — 같으면 commit에서 제외 가능 (git noise 회피)
// 404 / 기타 에러 시엔 true 반환 (안전하게 새로 만듦)
async function fileNeedsUpdate(
  owner: string,
  repo: string,
  path: string,
  newContent: string,
  ref: string
): Promise<boolean> {
  try {
    const { data } = await octokit().repos.getContent({ owner, repo, path, ref });
    if (Array.isArray(data)) return true; // 디렉토리는 항상 update
    if (data && 'content' in data && typeof data.content === 'string') {
      const existing = Buffer.from(data.content, 'base64').toString('utf-8');
      return existing.trim() !== newContent.trim();
    }
    return true;
  } catch (err) {
    const e = err as { status?: number };
    if (e?.status === 404) return true; // 파일 없음 → 새로 만들어야 함
    // 권한/네트워크 등 다른 에러는 commit 흐름에서 잡히도록 true 반환
    return true;
  }
}

async function commitFiles(
  owner: string,
  repo: string,
  branch: string,
  files: CommitFile[],
  message: string
): Promise<{ sha: string; url: string }> {
  const o = octokit();
  const ctx = { owner, repo, branch };

  let latestCommitSha: string;
  try {
    const { data: refData } = await o.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    latestCommitSha = refData.object.sha;
  } catch (err) {
    throw toGitHubError(err, { ...ctx, stage: 'getRef' });
  }

  let baseTreeSha: string;
  try {
    const { data: commitData } = await o.git.getCommit({
      owner,
      repo,
      commit_sha: latestCommitSha,
    });
    baseTreeSha = commitData.tree.sha;
  } catch (err) {
    throw toGitHubError(err, { ...ctx, stage: 'getCommit' });
  }

  let blobs;
  try {
    blobs = await Promise.all(
      files.map((f) =>
        o.git.createBlob({
          owner,
          repo,
          content: Buffer.from(f.content, 'utf-8').toString('base64'),
          encoding: 'base64',
        })
      )
    );
  } catch (err) {
    throw toGitHubError(err, { ...ctx, stage: 'createBlob' });
  }

  let newTree;
  try {
    const result = await o.git.createTree({
      owner,
      repo,
      base_tree: baseTreeSha,
      tree: files.map((f, i) => ({
        path: f.path,
        mode: '100644',
        type: 'blob',
        sha: blobs[i].data.sha,
      })),
    });
    newTree = result.data;
  } catch (err) {
    throw toGitHubError(err, { ...ctx, stage: 'createTree' });
  }

  let newCommit;
  try {
    const result = await o.git.createCommit({
      owner,
      repo,
      message,
      tree: newTree.sha,
      parents: [latestCommitSha],
    });
    newCommit = result.data;
  } catch (err) {
    throw toGitHubError(err, { ...ctx, stage: 'createCommit' });
  }

  try {
    await o.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommit.sha,
    });
  } catch (err) {
    throw toGitHubError(err, { ...ctx, stage: 'updateRef' });
  }

  return {
    sha: newCommit.sha,
    url: `https://github.com/${owner}/${repo}/commit/${newCommit.sha}`,
  };
}

// 플랫폼별 풀이 폴더 path — LeetCode는 0-pad NNNN-slug, 나머지는 그대로
// IndexEntry.entryFolder와 동일한 규칙이어야 함 (root README 인덱스 link가 정확해야)
function solutionFolder(problem: Problem): string {
  if (problem.platform === 'Programmers') {
    const p = problem as ProgrammersProblem;
    return `Programmers/${p.lessonId}-${p.titleSlug}`;
  }
  // LeetCode (platform 미지정 포함 — discriminator optional)
  const lp = problem as LeetCodeProblem;
  const num = String(lp.questionFrontendId).padStart(4, '0');
  return `LeetCode/${num}-${lp.titleSlug}`;
}

// 플랫폼별 어떤 platform 으로 인덱스에 기록할지
function problemPlatform(problem: Problem): Platform {
  return problem.platform === 'Programmers' ? 'Programmers' : 'LeetCode';
}

// 플랫폼별 problemId (root README 인덱스의 # column + sort key)
function problemIdOf(problem: Problem): string {
  if (problem.platform === 'Programmers') {
    return (problem as ProgrammersProblem).lessonId;
  }
  return (problem as LeetCodeProblem).questionFrontendId;
}

export async function uploadSolution(args: {
  problem: Problem;
  translation: string;
  code: string;
  language: string;
  annotated: string;
}): Promise<UploadResult> {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';

  if (!owner || !repo) {
    throw new Error('GITHUB_OWNER 또는 GITHUB_REPO가 설정되지 않았습니다 — ⚙️ 설정에서 입력해주세요');
  }

  const baseFolder = solutionFolder(args.problem);
  const ext = langToExt(args.language);
  const langDir = langToFolder(args.language);

  const readmePath = `${baseFolder}/README.md`;
  const solutionPath = `${baseFolder}/${langDir}/solution.${ext}`;
  const retroPath = `${baseFolder}/${langDir}/RETROSPECTIVE.md`;

  // README는 모든 언어 풀이가 공유 — 같은 문제 다른 언어로 풀거나 같은 풀이 재upload 시
  // 동일 내용을 매번 push하면 git history noise. 기존 sha 내용과 비교해 같으면 skip.
  // solution / RETROSPECTIVE는 사용자 의도(개선 push)가 있을 수 있어 항상 commit.
  const readmeChanged = await fileNeedsUpdate(owner, repo, readmePath, args.translation, branch);

  const files: CommitFile[] = [];
  if (readmeChanged) {
    files.push({ path: readmePath, content: args.translation });
  }
  files.push(
    {
      path: solutionPath,
      content: args.code.endsWith('\n') ? args.code : args.code + '\n',
    },
    {
      path: retroPath,
      content: args.annotated,
    }
  );

  // ─── root README.md 자동 인덱스 ───────────────────────────────
  // 풀이 레포 root의 README에 marker 영역만 update — 사용자가 위/아래 자유 텍스트 추가 가능.
  // 같은 문제 다른 언어로 풀면 languages 합치고 savedAt 갱신.
  // 실패해도 silent — 풀이 자체 commit은 진행되어야 함.
  let indexUpdated = false;
  try {
    const existingRootReadme = await fetchFileContent(owner, repo, 'README.md', branch);
    const entries = parseExistingIndex(existingRootReadme || '');
    const newEntry: IndexEntry = {
      platform: problemPlatform(args.problem),
      problemId: problemIdOf(args.problem),
      title: args.problem.title,
      slug: args.problem.titleSlug,
      difficulty: args.problem.difficulty,
      languages: [langDir],
      savedAt: new Date().toISOString().slice(0, 10),
    };

    // dedup: 같은 platform + slug 있으면 languages 합치고 entry 교체 (savedAt 갱신)
    const existingIdx = entries.findIndex(
      (e) => e.platform === newEntry.platform && e.slug === newEntry.slug
    );
    if (existingIdx >= 0) {
      const prev = entries[existingIdx];
      const langs = Array.from(new Set([...prev.languages, langDir])).sort();
      entries[existingIdx] = { ...newEntry, languages: langs };
    } else {
      entries.push(newEntry);
    }

    const newRootReadme = buildRootReadme(existingRootReadme, entries);
    if ((existingRootReadme || '') !== newRootReadme) {
      files.push({ path: 'README.md', content: newRootReadme });
      indexUpdated = true;
    }
  } catch {
    // 인덱스 update 실패는 silent — 풀이 자체는 commit 진행
  }

  const langLabel = readmeChanged ? `(${langDir})` : `(${langDir}, README 변경 없음)`;
  const indexLabel = indexUpdated ? ' + 인덱스 갱신' : '';
  const platformPrefix = args.problem.platform === 'Programmers' ? '[프로그래머스] ' : '';
  const idLabel = problemIdOf(args.problem);
  const message = `feat: ${platformPrefix}${idLabel}. ${args.problem.title} ${langLabel} 풀이 추가${indexLabel}`;

  const result = await commitFiles(owner, repo, branch, files, message);

  return {
    folder: `${baseFolder}/${langDir}`,
    commitSha: result.sha,
    commitUrl: result.url,
  };
}

// 회고만 수정해서 다시 commit (RETROSPECTIVE.md 한 파일만).
// 자동 upload 후 사용자가 회고 내용 검토하다 잘못된 부분 발견 시 사용.
// amend가 아닌 새 commit — history 보존 + force push 불필요.
export async function updateRetrospective(args: {
  problem: Problem;
  language: string;
  annotated: string;
}): Promise<UploadResult> {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';

  if (!owner || !repo) {
    throw new Error('GITHUB_OWNER 또는 GITHUB_REPO가 설정되지 않았습니다 — ⚙️ 설정에서 입력해주세요');
  }

  const baseFolder = solutionFolder(args.problem);
  const langDir = langToFolder(args.language);
  const retroPath = `${baseFolder}/${langDir}/RETROSPECTIVE.md`;

  const files: CommitFile[] = [{ path: retroPath, content: args.annotated }];
  const platformPrefix = args.problem.platform === 'Programmers' ? '[프로그래머스] ' : '';
  const idLabel = problemIdOf(args.problem);
  const message = `fix: ${platformPrefix}${idLabel}. ${args.problem.title} (${langDir}) 회고 수정`;

  const result = await commitFiles(owner, repo, branch, files, message);

  return {
    folder: `${baseFolder}/${langDir}`,
    commitSha: result.sha,
    commitUrl: result.url,
  };
}

// 레포 자동 생성: owner가 본인 계정이면 createForAuthenticatedUser,
// 아니면 조직(org)으로 간주하고 createInOrg
export async function createRepoIfMissing(): Promise<{
  url: string;
  defaultBranch: string;
  scope: 'user' | 'org';
}> {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  if (!owner || !repo) {
    throw new Error('GITHUB_OWNER 또는 GITHUB_REPO가 설정되지 않았습니다 — ⚙️ 설정에서 입력해주세요');
  }

  const o = octokit();

  // 1) 인증된 사용자 username 확인 → 본인/조직 판별
  let authedLogin: string;
  try {
    const { data: user } = await o.users.getAuthenticated();
    authedLogin = user.login;
  } catch (err) {
    throw toGitHubError(err, { owner, repo, branch: 'main', stage: 'getAuthenticated' });
  }

  const isPersonal = authedLogin.toLowerCase() === owner.toLowerCase();

  // 2) 레포 생성
  const body = {
    name: repo,
    description: 'Algorithm solutions managed by iq-solvebuddy (LeetCode + Programmers)',
    private: false,
    auto_init: true, // README 자동 생성 → main 브랜치 보장
  };

  try {
    if (isPersonal) {
      const { data } = await o.repos.createForAuthenticatedUser(body);
      return {
        url: data.html_url,
        defaultBranch: data.default_branch || 'main',
        scope: 'user',
      };
    } else {
      const { data } = await o.repos.createInOrg({ org: owner, ...body });
      return {
        url: data.html_url,
        defaultBranch: data.default_branch || 'main',
        scope: 'org',
      };
    }
  } catch (err) {
    throw toGitHubError(err, { owner, repo, branch: 'main', stage: 'createRepo' });
  }
}

// ─── 풀이 통계 backfill — root README 인덱스에서 풀이 entry 추출 ─
// 사용자가 다른 디바이스에서 풀이했거나 v0.5 이전 풀이 (localStorage stats가
// 없던 시점)도 통계에 포함하기 위함. UI의 stats 모달 "GitHub에서 동기화"
// 버튼 → 이 함수 호출 → 결과를 localStorage solutions에 merge.
export async function fetchIndexFromGithub(): Promise<{
  entries: Array<{
    platform: Platform;
    problemId: string;
    title: string;
    slug: string;
    difficulty: string;
    languages: string[];
    savedAt: string;
  }>;
}> {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!owner || !repo) {
    throw new Error('GITHUB_OWNER 또는 GITHUB_REPO가 설정되지 않았습니다 — ⚙️ 설정에서 입력해주세요');
  }

  const readme = await fetchFileContent(owner, repo, 'README.md', branch);
  if (!readme) return { entries: [] };

  const entries = parseExistingIndex(readme);
  return { entries };
}

// ─── v0.9 legacy 풀이 자동 마이그레이션 ──────────────────────────────
// v0.8 이하 사용자는 풀이 path가 root 바로 아래 (`NNNN-slug/...`). v0.9부턴 `LeetCode/NNNN-slug/...`
// 한 commit으로 모든 legacy path → LeetCode/ 아래로 mv + root README 인덱스도 새 형식으로 갱신.
//
// 동작:
//   1) root tree recursive 가져옴
//   2) legacy 패턴(`^\d+-[a-z0-9-]+/`) 매칭하는 모든 blob 찾기
//   3) 새 tree: 기존 path 삭제(sha:null) + LeetCode/{path}에 새 entry
//   4) root README도 새 멀티 플랫폼 형식으로
//   5) 단일 commit으로 push
//
// 이미 LeetCode/ 폴더 있으면 noop. 사용자가 stats 모달의 "기존 풀이 LeetCode/ 로 정리" 명시 클릭 후만 실행.
export async function migrateLegacyLeetCodeFolders(): Promise<{
  migrated: number;
  alreadyMigrated: boolean;
  commitSha?: string;
  commitUrl?: string;
}> {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!owner || !repo) {
    throw new Error('GITHUB_OWNER 또는 GITHUB_REPO가 설정되지 않았습니다 — ⚙️ 설정에서 입력해주세요');
  }

  const o = octokit();
  const ctx = { owner, repo, branch };

  // 1) 현재 ref + commit + tree sha
  let latestCommitSha: string;
  let baseTreeSha: string;
  try {
    const { data: refData } = await o.git.getRef({ owner, repo, ref: `heads/${branch}` });
    latestCommitSha = refData.object.sha;
    const { data: commitData } = await o.git.getCommit({ owner, repo, commit_sha: latestCommitSha });
    baseTreeSha = commitData.tree.sha;
  } catch (err) {
    throw toGitHubError(err, { ...ctx, stage: 'migrate/getRef' });
  }

  // 2) recursive tree get
  let tree: Array<{ path?: string; mode?: string; type?: string; sha?: string }>;
  try {
    const { data } = await o.git.getTree({
      owner,
      repo,
      tree_sha: baseTreeSha,
      recursive: 'true',
    });
    tree = data.tree;
  } catch (err) {
    throw toGitHubError(err, { ...ctx, stage: 'migrate/getTree' });
  }

  // 3) legacy 패턴 매칭 — root 바로 아래 NNNN-slug/...
  // (LeetCode/ 안은 이미 새 형식이라 제외)
  const LEGACY_PATTERN = /^(\d+-[a-z0-9-]+)\/(.+)$/;
  const legacyBlobs: Array<{ oldPath: string; newPath: string; sha: string; mode: string }> = [];
  for (const entry of tree) {
    if (!entry.path || !entry.sha || entry.type !== 'blob') continue;
    const m = entry.path.match(LEGACY_PATTERN);
    if (!m) continue;
    legacyBlobs.push({
      oldPath: entry.path,
      newPath: `LeetCode/${entry.path}`,
      sha: entry.sha,
      mode: entry.mode || '100644',
    });
  }

  if (legacyBlobs.length === 0) {
    return { migrated: 0, alreadyMigrated: true };
  }

  // 4) 새 root README 생성 — legacy + 기존 새 marker entries 합쳐서
  const existingReadme = await fetchFileContent(owner, repo, 'README.md', branch);
  const parsed = parseExistingIndex(existingReadme || '');
  // parsed에는 legacy block의 entry (root path)도 있음 — 이미 LeetCode platform 으로 변환됨
  // 새 buildRootReadme가 LeetCode/ prefix path로 표시
  const newReadme = buildRootReadme(existingReadme, parsed);

  // 5) tree entries: 삭제(legacy path) + 추가(LeetCode/{path}) + README update
  const treeEntries: Array<{ path: string; mode: '100644' | '100755' | '040000' | '160000' | '120000'; type: 'blob' | 'tree' | 'commit'; sha: string | null; content?: string }> = [];
  for (const b of legacyBlobs) {
    treeEntries.push({ path: b.oldPath, mode: '100644', type: 'blob', sha: null });
    treeEntries.push({ path: b.newPath, mode: '100644', type: 'blob', sha: b.sha });
  }
  // README 새 content
  treeEntries.push({ path: 'README.md', mode: '100644', type: 'blob', content: newReadme, sha: null });

  let newTreeSha: string;
  try {
    // content가 있는 entry는 sha 대신 content 사용 — octokit type이 sha를 string으로 강제하므로 separate
    const treeForApi = treeEntries.map((t) => {
      if (t.content !== undefined) {
        return { path: t.path, mode: t.mode, type: t.type, content: t.content };
      }
      return { path: t.path, mode: t.mode, type: t.type, sha: t.sha };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await o.git.createTree({ owner, repo, base_tree: baseTreeSha, tree: treeForApi as any });
    newTreeSha = data.sha;
  } catch (err) {
    throw toGitHubError(err, { ...ctx, stage: 'migrate/createTree' });
  }

  let newCommit;
  try {
    const { data } = await o.git.createCommit({
      owner,
      repo,
      message: `chore: 기존 LeetCode 풀이 ${legacyBlobs.length}개 파일을 LeetCode/ 폴더로 정리 (v0.9 멀티 플랫폼 기반)`,
      tree: newTreeSha,
      parents: [latestCommitSha],
    });
    newCommit = data;
  } catch (err) {
    throw toGitHubError(err, { ...ctx, stage: 'migrate/createCommit' });
  }

  try {
    await o.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: newCommit.sha });
  } catch (err) {
    throw toGitHubError(err, { ...ctx, stage: 'migrate/updateRef' });
  }

  // 파일 수 → 풀이 수 (대략 한 풀이당 3 파일: README/solution/RETROSPECTIVE)
  const approxProblemCount = Math.ceil(legacyBlobs.length / 3);

  return {
    migrated: approxProblemCount,
    alreadyMigrated: false,
    commitSha: newCommit.sha,
    commitUrl: `https://github.com/${owner}/${repo}/commit/${newCommit.sha}`,
  };
}

// 연결 진단: 토큰 유효성 + 레포 존재 확인 + 브랜치 일치 여부
export async function verifyConnection(): Promise<{
  authedAs: string;
  owner: string;
  repo: string;
  repoExists: boolean;
  repoUrl?: string;
  repoDefaultBranch?: string;
  configuredBranch: string;
  branchMatches?: boolean;
}> {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';

  if (!owner || !repo) {
    throw new Error('GITHUB_OWNER 또는 GITHUB_REPO가 설정되지 않았습니다 — ⚙️ 설정에서 입력해주세요');
  }

  const o = octokit();

  let authedAs: string;
  try {
    const { data } = await o.users.getAuthenticated();
    authedAs = data.login;
  } catch (err) {
    throw toGitHubError(err, { owner, repo, branch, stage: 'verify/auth' });
  }

  try {
    const { data } = await o.repos.get({ owner, repo });
    return {
      authedAs,
      owner,
      repo,
      repoExists: true,
      repoUrl: data.html_url,
      repoDefaultBranch: data.default_branch,
      configuredBranch: branch,
      branchMatches: data.default_branch === branch,
    };
  } catch (err) {
    const e = err as { status?: number };
    if (e?.status === 404) {
      return {
        authedAs,
        owner,
        repo,
        repoExists: false,
        configuredBranch: branch,
      };
    }
    throw toGitHubError(err, { owner, repo, branch, stage: 'verify/repo' });
  }
}
