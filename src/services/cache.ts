// 번역 결과 캐시 — userData/cache/translations/{slug}.json
// 같은 titleSlug 두 번 fetch 시 LLM 호출 skip (비용/시간 절약).
// 문제 자체가 거의 안 바뀌므로 만료 없음 — 단 schema version mismatch / specific stale 패턴이면 자동 refresh.
//
// schema versioning (v1.11+):
//   CURRENT_SCHEMA를 추출 로직 변경 시마다 bump → 옛 캐시는 schema mismatch로 자동 invalidate.
//   사용자가 수동 캐시 삭제 불필요. settings 모달의 "캐시 비우기" 버튼으로 강제 비우기도 가능.

import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import { FetchProblemResult } from '../types';

// schema version — 추출/번역 로직 변경 시 bump
// v1: 초기 (v1.0)
// v2: AC 색깔 체계 (v1.9)
// v3: CF Division fallback / PG 'Lv ?' 숨김 (v1.10.1)
// v4: URL-only input (v1.11) — 영향 없지만 versioning 시작점 명시
const CURRENT_SCHEMA = 4;

function cacheDir(): string {
  return path.join(app.getPath('userData'), 'cache', 'translations');
}

type CachePlatform = 'LeetCode' | 'Programmers' | 'AtCoder' | 'Codeforces';

interface CachedFetchProblemResult extends FetchProblemResult {
  _schemaVersion?: number;
}

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
// 옛 추출 로직으로 저장된 result는 새 fix 로직으로 자동 refresh
function looksStale(result: FetchProblemResult): boolean {
  const p = result.problem;
  const diff = (p as { difficulty?: string }).difficulty || '';
  // CF rating 미정 / PG level 미정 / AC 점수 미정 — 모두 stale
  if (diff === '?' || diff === 'Lv ?' || diff === '?점') return true;
  // 옛 AC 표기 "...· 난이도 ≤0" 또는 "...· 난이도 1234" — v1.9+에서 색깔 표기로 교체
  if (/난이도\s*(?:≤?\d+|\?)/.test(diff)) return true;
  return false;
}

export async function readTranslationCache(
  platform: CachePlatform,
  key: string
): Promise<FetchProblemResult | null> {
  try {
    const data = await fs.readFile(cachePath(platform, key), 'utf-8');
    const parsed = JSON.parse(data) as CachedFetchProblemResult;
    if (!parsed.problem || !parsed.translation || !parsed.translationHtml) {
      return null;
    }
    // schema version 검사 — mismatch면 자동 refresh
    // (옛 추출 로직으로 저장된 캐시가 새 로직으로 자연 갱신)
    if (typeof parsed._schemaVersion !== 'number' || parsed._schemaVersion < CURRENT_SCHEMA) {
      return null;
    }
    if (looksStale(parsed)) {
      return null;
    }
    return parsed;
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
    const tagged: CachedFetchProblemResult = { ...result, _schemaVersion: CURRENT_SCHEMA };
    await fs.writeFile(
      cachePath(platform, key),
      JSON.stringify(tagged, null, 2),
      'utf-8'
    );
  } catch {
    // silent
  }
}

/**
 * 캐시 전체 삭제 — settings 모달 "캐시 비우기" 버튼에서 호출.
 * 다음 fetch 시 모든 문제 새로 받아 LLM 다시 호출 (비용 발생) → 사용자 명시 클릭 후만.
 */
export async function clearTranslationCache(): Promise<{ removed: number }> {
  try {
    const dir = cacheDir();
    const files = await fs.readdir(dir).catch(() => [] as string[]);
    let removed = 0;
    for (const f of files) {
      if (f.endsWith('.json')) {
        await fs.unlink(path.join(dir, f)).catch(() => {});
        removed++;
      }
    }
    return { removed };
  } catch {
    return { removed: 0 };
  }
}
