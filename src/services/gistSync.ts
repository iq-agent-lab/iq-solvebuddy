// 풀이 통계 디바이스 간 동기화 — GitHub Gist 백업
//
// 동기 흐름:
//   1. 사용자 GitHub PAT에 gist scope 추가 (기존 repo scope에 추가)
//   2. settings 토글 ON → 매 upload 후 + 매 5분 debounced로 push
//   3. 다른 디바이스 부팅 시 + 사용자 manual "↻ 동기화" → pull + merge
//   4. conflict resolution: savedAt 기준 newest wins
//
// gist 식별:
//   - 첫 push 시 gist 생성 후 gistId를 localStorage('solvebuddy:stats-gist-id')에 저장
//   - 이후 같은 gist update
//   - 다른 디바이스: localStorage 비어있으면 사용자 gist 목록에서 description으로 검색
//
// gist 구조:
//   description: 'Solve Buddy stats sync (do not delete)'
//   filename: 'solvebuddy-stats.json'
//   content: localStorage 'iq-leetbuddy:solutions' 그대로 (JSON)
//   private: true

import { Octokit } from '@octokit/rest';

const GIST_DESCRIPTION = 'Solve Buddy stats sync (do not delete)';
const GIST_FILENAME = 'solvebuddy-stats.json';

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

export function resetGistClient(): void {
  _octokit = null;
}

// gist scope 확인 — token에 gist 권한 있는지 (404/401 시 친절 에러용)
async function ensureGistScope(): Promise<void> {
  try {
    // 간단한 gist list — 가장 가벼운 endpoint
    await octokit().gists.list({ per_page: 1 });
  } catch (err) {
    const e = err as { status?: number; message?: string };
    if (e?.status === 404 || e?.status === 401 || e?.status === 403) {
      throw new Error(
        'GitHub PAT에 gist 권한이 없어요. ⚙️ 설정 → 새 PAT 발급 시 repo + **gist** scope 둘 다 체크해주세요'
      );
    }
    throw err;
  }
}

interface PushResult {
  gistId: string;
  url: string;
  size: number;
}

/**
 * 통계 JSON을 gist에 push. 첫 호출이면 gist 생성, 이후엔 update.
 *
 * @param solutionsJson localStorage 'iq-leetbuddy:solutions' 의 JSON 문자열
 * @param existingGistId localStorage에 저장된 gist ID (없으면 생성)
 */
export async function pushStatsToGist(
  solutionsJson: string,
  existingGistId?: string | null
): Promise<PushResult> {
  await ensureGistScope();
  const o = octokit();

  if (existingGistId) {
    // update existing gist
    try {
      const { data } = await o.gists.update({
        gist_id: existingGistId,
        files: {
          [GIST_FILENAME]: { content: solutionsJson },
        },
      });
      return {
        gistId: data.id || existingGistId,
        url: data.html_url || '',
        size: solutionsJson.length,
      };
    } catch (err) {
      const e = err as { status?: number };
      if (e?.status === 404) {
        // gist 삭제됐거나 ID 잘못 — 새로 만들기로 fall through
      } else {
        throw err;
      }
    }
  }

  // 신규 gist 생성 (또는 옛 gist 사라진 경우)
  const { data } = await o.gists.create({
    description: GIST_DESCRIPTION,
    public: false,
    files: {
      [GIST_FILENAME]: { content: solutionsJson },
    },
  });
  return {
    gistId: data.id || '',
    url: data.html_url || '',
    size: solutionsJson.length,
  };
}

interface PullResult {
  solutionsJson: string | null; // null = gist 없음
  gistId: string | null;
}

/**
 * gist에서 통계 JSON 가져옴. 옛 gist ID 알면 직접, 없으면 description으로 검색.
 *
 * @param existingGistId localStorage에 저장된 gist ID (없으면 검색)
 */
export async function pullStatsFromGist(
  existingGistId?: string | null
): Promise<PullResult> {
  await ensureGistScope();
  const o = octokit();

  // 1) gistId 있으면 직접 조회
  if (existingGistId) {
    try {
      const { data } = await o.gists.get({ gist_id: existingGistId });
      const file = data.files?.[GIST_FILENAME];
      if (file?.content) {
        return { solutionsJson: file.content, gistId: existingGistId };
      }
    } catch (err) {
      const e = err as { status?: number };
      if (e?.status !== 404) throw err;
      // 404면 검색 fallback
    }
  }

  // 2) description으로 검색 — 첫 디바이스에서 push 후 두 번째 디바이스가 처음 부팅 시
  // 사용자 gist 목록을 페이지네이션으로 (최대 100개)
  const { data } = await o.gists.list({ per_page: 100 });
  for (const gist of data) {
    if (gist.description === GIST_DESCRIPTION) {
      // 찾음 — 본문 fetch (list response는 file content가 truncated일 수 있음)
      const { data: full } = await o.gists.get({ gist_id: gist.id });
      const file = full.files?.[GIST_FILENAME];
      if (file?.content) {
        return { solutionsJson: file.content, gistId: gist.id };
      }
    }
  }

  return { solutionsJson: null, gistId: null };
}
