// 번역 결과 캐시 — userData/cache/translations/{slug}.json
// 같은 titleSlug 두 번 fetch 시 LLM 호출 skip (비용/시간 절약).
// LeetCode 문제 자체가 거의 안 바뀌므로 만료 없음.
// 무효화 원할 시 userData/cache 폴더 삭제 (Troubleshooting에 명시).

import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import { FetchProblemResult } from '../types';

function cacheDir(): string {
  return path.join(app.getPath('userData'), 'cache', 'translations');
}

type CachePlatform = 'LeetCode' | 'Programmers' | 'AtCoder' | 'Codeforces';

// platform 별 cache key prefix — 같은 식별자라도 플랫폼 간 분리
// LeetCode는 prefix 없이 (legacy 호환), 나머지는 platform 이름 lowercase prefix
function cachePath(platform: CachePlatform, key: string): string {
  // key는 영숫자/dash/underscore만 (parseProblemInput 보장) — path traversal 안전
  const safeKey =
    platform === 'LeetCode'
      ? key
      : `${platform.toLowerCase()}-${key}`;
  return path.join(cacheDir(), `${safeKey}.json`);
}

// 캐시된 결과의 metadata 품질이 의심스러우면 cache miss로 처리해 재fetch 유도
// v1.6.2 이전 캐시된 CF/PG는 rating/level이 '?' / 'Lv ?'로 저장됐을 수 있음
// → 사용자가 수동 캐시 삭제 안 해도 다음 fetch 시 자동 refresh
function looksStale(result: FetchProblemResult): boolean {
  const p = result.problem;
  const diff = (p as { difficulty?: string }).difficulty || '';
  if (diff === '?' || diff === 'Lv ?' || diff === '?점' || diff === '?점 · 난이도 ≤0') return true;
  return false;
}

export async function readTranslationCache(
  platform: CachePlatform,
  key: string
): Promise<FetchProblemResult | null> {
  try {
    const data = await fs.readFile(cachePath(platform, key), 'utf-8');
    const parsed = JSON.parse(data);
    if (!parsed.problem || !parsed.translation || !parsed.translationHtml) {
      return null;
    }
    if (looksStale(parsed as FetchProblemResult)) {
      // 옛 fix 이전 캐시 — 자동 refresh
      return null;
    }
    return parsed as FetchProblemResult;
  } catch {
    return null;
  }
}

export async function writeTranslationCache(
  platform: CachePlatform,
  key: string,
  result: FetchProblemResult
): Promise<void> {
  try {
    await fs.mkdir(cacheDir(), { recursive: true });
    await fs.writeFile(
      cachePath(platform, key),
      JSON.stringify(result, null, 2),
      'utf-8'
    );
  } catch {
    // silent
  }
}
