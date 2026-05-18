// AtCoder Problems difficulty rating — kenkoooo.com 외부 API
//
// AtCoder 자체 페이지엔 점수(예: 300)만 있고 difficulty rating은 없음.
// AtCoder Problems(kenkoooo.com)가 모든 문제의 IRT 기반 difficulty rating 제공.
// 같은 API에 30MB+ JSON 전체 (수만 문제) — 자주 fetch하면 비용 큼.
//
// 캐시 전략:
//   - userData/cache/atcoder-models.json (24h TTL)
//   - 메모리 캐시 (런타임 동안 한 번만 parse)
//   - gzip Accept-Encoding으로 transfer 크기 ~5-10MB로 축소
//   - 실패 silent (점수만 표시되어도 큰 문제 X)

import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';

const MODELS_URL = 'https://kenkoooo.com/atcoder/resources/problem-models.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface ProblemModel {
  difficulty?: number;
  is_experimental?: boolean;
}

type ModelsMap = Record<string, ProblemModel>;

let _memCache: ModelsMap | null = null;
let _fetchInflight: Promise<ModelsMap | null> | null = null;

function cachePath(): string {
  return path.join(app.getPath('userData'), 'cache', 'atcoder-models.json');
}

async function readDiskCache(): Promise<ModelsMap | null> {
  try {
    const stat = await fs.stat(cachePath());
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null; // 만료
    const data = await fs.readFile(cachePath(), 'utf-8');
    return JSON.parse(data) as ModelsMap;
  } catch {
    return null;
  }
}

async function writeDiskCache(models: ModelsMap): Promise<void> {
  try {
    await fs.mkdir(path.dirname(cachePath()), { recursive: true });
    await fs.writeFile(cachePath(), JSON.stringify(models), 'utf-8');
  } catch {
    // silent — 디스크 쓰기 실패해도 메모리 캐시는 작동
  }
}

async function fetchModels(): Promise<ModelsMap | null> {
  try {
    const res = await fetch(MODELS_URL, {
      headers: {
        // Node fetch는 gzip 자동 처리 — 명시적으로 hint
        'Accept-Encoding': 'gzip, deflate',
        'User-Agent': 'iq-solvebuddy',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data as ModelsMap;
  } catch {
    return null;
  }
}

// 최초 호출 시 fetch (~5-10MB compressed, 5초 정도) 후 캐시.
// 동시에 여러 호출 와도 fetch는 한 번만 (in-flight promise 공유).
async function ensureModels(): Promise<ModelsMap | null> {
  if (_memCache) return _memCache;

  if (_fetchInflight) return _fetchInflight;

  _fetchInflight = (async () => {
    // disk 캐시 우선
    const cached = await readDiskCache();
    if (cached) {
      _memCache = cached;
      return cached;
    }
    // download
    const fresh = await fetchModels();
    if (fresh) {
      _memCache = fresh;
      // disk write는 await — 다음 부팅 시 즉시 활용
      await writeDiskCache(fresh);
      return fresh;
    }
    return null;
  })();

  try {
    return await _fetchInflight;
  } finally {
    _fetchInflight = null;
  }
}

/**
 * AtCoder task의 difficulty rating 조회.
 * @param taskId 예: 'abc300_a'
 * @returns 정수 rating (정수가 아니면 round) 또는 null (cache miss / API 실패)
 */
export async function getAtcoderDifficulty(taskId: string): Promise<number | null> {
  const models = await ensureModels();
  if (!models) return null;
  const model = models[taskId];
  if (!model || typeof model.difficulty !== 'number') return null;
  return Math.round(model.difficulty);
}

/**
 * 앱 부팅 시 background prewarm — 사용자가 AtCoder 문제 가져올 때 대기 시간 제거.
 * 실패해도 silent.
 */
export function prewarmAtcoderModels(): void {
  // fire-and-forget — await 안 함
  ensureModels().catch(() => {
    // silent
  });
}
