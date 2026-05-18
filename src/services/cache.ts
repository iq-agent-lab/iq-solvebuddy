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

// platform 별 cache key prefix — LeetCode와 Programmers 같은 slug라도 분리
function cachePath(platform: 'LeetCode' | 'Programmers', key: string): string {
  // key는 영숫자/dash만 (parseProblemInput 보장) 또는 숫자 (Programmers lessonId) — path traversal 안전
  // LeetCode는 prefix 없이 (legacy 호환), Programmers는 'programmers-' prefix
  const safeKey = platform === 'LeetCode' ? key : `programmers-${key}`;
  return path.join(cacheDir(), `${safeKey}.json`);
}

export async function readTranslationCache(
  platform: 'LeetCode' | 'Programmers',
  key: string
): Promise<FetchProblemResult | null> {
  try {
    const data = await fs.readFile(cachePath(platform, key), 'utf-8');
    const parsed = JSON.parse(data);
    if (!parsed.problem || !parsed.translation || !parsed.translationHtml) {
      return null;
    }
    return parsed as FetchProblemResult;
  } catch {
    return null;
  }
}

export async function writeTranslationCache(
  platform: 'LeetCode' | 'Programmers',
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
