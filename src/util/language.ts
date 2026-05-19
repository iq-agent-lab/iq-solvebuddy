// LeetCode 언어 slug를 파일 확장자로 매핑

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  python: 'py',
  python3: 'py',
  java: 'java',
  javascript: 'js',
  typescript: 'ts',
  cpp: 'cpp',
  c: 'c',
  csharp: 'cs',
  'c#': 'cs',
  go: 'go',
  golang: 'go',
  rust: 'rs',
  kotlin: 'kt',
  swift: 'swift',
  ruby: 'rb',
  scala: 'scala',
  php: 'php',
  dart: 'dart',
  elixir: 'ex',
  erlang: 'erl',
};

export function langToExt(langSlug: string): string {
  return LANGUAGE_EXTENSIONS[langSlug.toLowerCase()] ?? 'txt';
}

// LeetCode 언어 slug를 디렉토리명으로 매핑
// 같은 문제를 여러 언어로 풀 때 풀이/회고를 언어별 하위 폴더로 분리하기 위함
const LANGUAGE_FOLDERS: Record<string, string> = {
  python: 'python',
  python3: 'python',
  java: 'java',
  javascript: 'javascript',
  typescript: 'typescript',
  cpp: 'cpp',
  c: 'c',
  csharp: 'csharp',
  'c#': 'csharp',
  go: 'go',
  golang: 'go',
  rust: 'rust',
  kotlin: 'kotlin',
  swift: 'swift',
  ruby: 'ruby',
  scala: 'scala',
  php: 'php',
  dart: 'dart',
  elixir: 'elixir',
  erlang: 'erlang',
};

export function langToFolder(langSlug: string): string {
  return LANGUAGE_FOLDERS[langSlug.toLowerCase()] ?? langSlug.toLowerCase();
}

// retry helper - iq-blogger 패턴 차용
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelay = opts.baseDelayMs ?? 1000;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// 입력 파싱: 4개 플랫폼 URL만 인식 (v1.11+)
// 지원 URL:
//   - LeetCode: leetcode.com/problems/{slug} 또는 leetcode.cn/problems/{slug}
//                (cn은 Cloudflare로 직접 GraphQL 차단 → com에서 같은 slug fetch)
//   - 프로그래머스: school.programmers.co.kr/learn/courses/{N}/lessons/{lessonId}
//   - AtCoder: atcoder.jp/contests/{contestId}/tasks/{taskId}
//                contestId/taskId 하이픈 허용 (SCPC 등 — scpc2026-div2)
//   - Codeforces: codeforces.com/contest/{N}/problem/{X}
//                 또는 codeforces.com/problemset/problem/{N}/{X}
//
// 매칭 안 되면 throw — 사용자에게 친절 에러 (placeholder + 펼쳐보기로 안내).
// 옛 자유 텍스트(문제 이름) / 숫자(frontendId) 입력은 v1.11에서 제거 — 4개 플랫폼이라 URL이 표준.

export interface ParsedInput {
  platform: 'LeetCode' | 'Programmers' | 'AtCoder' | 'Codeforces';
  /** LeetCode: titleSlug */
  titleSlug: string;
  /** Programmers: lesson ID */
  lessonId?: string;
  /** AtCoder: contest ID + task ID */
  contestId?: string;
  taskId?: string;
  /** Codeforces: contest ID는 위 contestId 재사용, index 별도 */
  cfIndex?: string;
}

export function parseProblemInput(input: string): ParsedInput {
  const trimmed = input.trim();

  // Codeforces URL — contest 또는 problemset 형식
  const cfContestMatch = trimmed.match(/codeforces\.com\/contest\/(\d+)\/problem\/([A-Z]\d*)/i);
  const cfProblemsetMatch = trimmed.match(/codeforces\.com\/problemset\/problem\/(\d+)\/([A-Z]\d*)/i);
  const cfMatch = cfContestMatch || cfProblemsetMatch;
  if (cfMatch) {
    return {
      platform: 'Codeforces',
      contestId: cfMatch[1],
      cfIndex: cfMatch[2].toUpperCase(),
      titleSlug: '',
    };
  }

  // AtCoder URL — atcoder.jp 고유
  const acMatch = trimmed.match(/atcoder\.jp\/contests\/([a-z0-9_-]+)\/tasks\/([a-z0-9_-]+)/i);
  if (acMatch) {
    return {
      platform: 'AtCoder',
      contestId: acMatch[1].toLowerCase(),
      taskId: acMatch[2].toLowerCase(),
      titleSlug: '',
    };
  }

  // Programmers URL
  const progMatch = trimmed.match(/programmers\.co\.kr\/learn\/courses\/\d+\/lessons\/(\d+)/i);
  if (progMatch) {
    return {
      platform: 'Programmers',
      lessonId: progMatch[1],
      titleSlug: '',
    };
  }

  // LeetCode URL — com/cn 동일 처리
  const lcMatch = trimmed.match(/leetcode\.(?:com|cn)\/problems\/([a-zA-Z0-9-]+)/i);
  if (lcMatch) {
    return {
      platform: 'LeetCode',
      titleSlug: lcMatch[1].toLowerCase(),
    };
  }

  // 매칭 실패 — 친절 에러
  throw new Error(
    '문제 URL을 입력해주세요. 지원하는 형식:\n' +
      '· LeetCode — https://leetcode.com/problems/two-sum/\n' +
      '· 프로그래머스 — https://school.programmers.co.kr/learn/courses/30/lessons/12345\n' +
      '· AtCoder — https://atcoder.jp/contests/abc300/tasks/abc300_a\n' +
      '· Codeforces — https://codeforces.com/problemset/problem/1234/A'
  );
}
