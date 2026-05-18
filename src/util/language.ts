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

// LeetCode 입력 파싱: URL (모든 형태), slug, 문제 이름, 문제 번호 지원
// 지원하는 입력 예시:
//   - https://leetcode.com/problems/two-sum/
//   - https://leetcode.com/problems/two-sum/description/
//   - https://leetcode.com/problems/regular-expression-matching/description/?envType=problem-list-v2&envId=depth-first-search
//   - leetcode.com/problems/two-sum
//   - leetcode.cn/problems/two-sum         (cn은 Cloudflare 보호로 직접 GraphQL 접근 불가 →
//                                            com에서 같은 slug로 fetch. 대부분 com/cn slug 공유.
//                                            cn-only 문제는 404)
//   - Symmetric Tree         (대소문자/공백 자유)
//   - symmetric tree
//   - SYMMETRIC-TREE
//   - 1, 2024                (숫자만이면 frontendId — leetcode.ts에서 별도 해결)
export interface ParsedInput {
  /** v1.0+ platform 분기 */
  platform: 'LeetCode' | 'Programmers' | 'AtCoder' | 'Codeforces';
  /** LeetCode: 정규화된 slug. 숫자 입력이면 빈 문자열 + isNumericId=true */
  titleSlug: string;
  /** LeetCode: 입력이 숫자만인 경우 (예: "1") — frontendId → slug 해결 */
  isNumericId: boolean;
  /** LeetCode: isNumericId일 때 원본 숫자 */
  frontendId: string | null;
  /** Programmers: lesson ID (URL에서 추출) */
  lessonId?: string;
  /** AtCoder: contest ID (예: 'abc300') */
  contestId?: string;
  /** AtCoder: task ID (예: 'abc300_a') */
  taskId?: string;
  /** Codeforces: index (예: 'A', 'B1') */
  cfIndex?: string;
}

export function parseProblemInput(input: string): ParsedInput {
  const trimmed = input.trim();

  // Codeforces URL — contest 또는 problemset 형식
  // https://codeforces.com/contest/{contestId}/problem/{index}
  // https://codeforces.com/problemset/problem/{contestId}/{index}
  const cfContestMatch = trimmed.match(/codeforces\.com\/contest\/(\d+)\/problem\/([A-Z]\d*)/i);
  const cfProblemsetMatch = trimmed.match(/codeforces\.com\/problemset\/problem\/(\d+)\/([A-Z]\d*)/i);
  const cfMatch = cfContestMatch || cfProblemsetMatch;
  if (cfMatch) {
    return {
      platform: 'Codeforces',
      contestId: cfMatch[1],
      cfIndex: cfMatch[2].toUpperCase(),
      titleSlug: '',
      isNumericId: false,
      frontendId: null,
    };
  }

  // AtCoder URL — atcoder.jp 고유
  // https://atcoder.jp/contests/{contestId}/tasks/{taskId}
  const acMatch = trimmed.match(/atcoder\.jp\/contests\/([a-z0-9_]+)\/tasks\/([a-z0-9_]+)/i);
  if (acMatch) {
    return {
      platform: 'AtCoder',
      contestId: acMatch[1].toLowerCase(),
      taskId: acMatch[2].toLowerCase(),
      titleSlug: '',
      isNumericId: false,
      frontendId: null,
    };
  }

  // Programmers URL — 가장 먼저 체크
  // https://school.programmers.co.kr/learn/courses/{courseId}/lessons/{lessonId}
  const progMatch = trimmed.match(/programmers\.co\.kr\/learn\/courses\/\d+\/lessons\/(\d+)/i);
  if (progMatch) {
    return {
      platform: 'Programmers',
      lessonId: progMatch[1],
      titleSlug: '',
      isNumericId: false,
      frontendId: null,
    };
  }

  // LeetCode 숫자만 — frontendId로 해결
  if (/^\d+$/.test(trimmed)) {
    return {
      platform: 'LeetCode',
      titleSlug: '',
      isNumericId: true,
      frontendId: trimmed,
    };
  }

  // LeetCode URL 매칭 — com/cn 동일 처리 (com에서 fetch)
  const urlPattern = /leetcode\.(?:com|cn)\/problems\/([a-zA-Z0-9-]+)/i;
  const urlMatch = trimmed.match(urlPattern);
  if (urlMatch) {
    return {
      platform: 'LeetCode',
      titleSlug: urlMatch[1].toLowerCase(),
      isNumericId: false,
      frontendId: null,
    };
  }

  // 자유 텍스트 → LeetCode slug 정규화 (default platform)
  const slug = trimmed
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return {
    platform: 'LeetCode',
    titleSlug: slug,
    isNumericId: false,
    frontendId: null,
  };
}
