// 파이프라인 오케스트레이션

import { fetchProblem, resolveTitleSlugByFrontendId } from './leetcode';
import { fetchProgrammersProblem } from './programmers';
import { fetchAtcoderProblem } from './atcoder';
import { fetchCodeforcesProblem } from './codeforces';
import { translateProblem, StreamCallback } from './translator';
import { annotateCode } from './annotator';
import { uploadSolution, createRepoIfMissing } from './github';
import { renderMarkdown } from './markdown';
import { readTranslationCache, writeTranslationCache } from './cache';
import { parseProblemInput } from '../util/language';
import { FetchProblemResult, UploadResult, Problem } from '../types';

export type ProgressFn = (stage: string) => void;

export async function fetchAndTranslate(
  input: string,
  onProgress?: ProgressFn,
  onStream?: StreamCallback
): Promise<FetchProblemResult> {
  const parsed = parseProblemInput(input);

  // ─── Codeforces 분기 ────────────────────────────────
  // cache key: 'contestId-index' (예: '1234-A')
  if (parsed.platform === 'Codeforces') {
    if (!parsed.contestId || !parsed.cfIndex) {
      throw new Error('Codeforces URL이 올바르지 않아요 — codeforces.com/{contest|problemset}/.../{문제번호}/{인덱스} 형식의 URL을 입력해주세요');
    }
    const cacheKey = `${parsed.contestId}-${parsed.cfIndex}`;

    const cached = await readTranslationCache('Codeforces', cacheKey);
    if (cached) {
      onProgress?.('cached');
      return cached;
    }

    onProgress?.('fetching');
    const problem = await fetchCodeforcesProblem({ contestId: parsed.contestId, index: parsed.cfIndex });

    onProgress?.('translating');
    const translation = await translateProblem(problem, onStream);
    const translationHtml = await renderMarkdown(translation);

    const result = { problem, translation, translationHtml };
    await writeTranslationCache('Codeforces', cacheKey, result);
    return result;
  }

  // ─── AtCoder 분기 ────────────────────────────────
  // taskId가 globally unique (contest prefix 포함) → cache key로 충분
  if (parsed.platform === 'AtCoder') {
    if (!parsed.contestId || !parsed.taskId) {
      throw new Error('AtCoder URL이 올바르지 않아요 — atcoder.jp/contests/{콘테스트}/tasks/{태스크} 형식의 URL을 입력해주세요');
    }

    const cached = await readTranslationCache('AtCoder', parsed.taskId);
    if (cached) {
      onProgress?.('cached');
      return cached;
    }

    onProgress?.('fetching');
    const problem = await fetchAtcoderProblem({ contestId: parsed.contestId, taskId: parsed.taskId });

    onProgress?.('translating');
    const translation = await translateProblem(problem, onStream);
    const translationHtml = await renderMarkdown(translation);

    const result = { problem, translation, translationHtml };
    await writeTranslationCache('AtCoder', parsed.taskId, result);
    return result;
  }

  // ─── Programmers 분기 ────────────────────────────────
  // lessonId 가 cache key — slug은 한글이라 파일명 안전성 위해 lessonId 사용
  if (parsed.platform === 'Programmers') {
    if (!parsed.lessonId) {
      throw new Error('프로그래머스 URL에서 lessonId를 찾지 못했어요 — programmers.co.kr/learn/courses/.../lessons/{id} 형식의 URL을 입력해주세요');
    }

    const cached = await readTranslationCache('Programmers', parsed.lessonId);
    if (cached) {
      onProgress?.('cached');
      return cached;
    }

    onProgress?.('fetching');
    const problem = await fetchProgrammersProblem(parsed.lessonId);

    onProgress?.('translating');
    const translation = await translateProblem(problem, onStream);
    const translationHtml = await renderMarkdown(translation);

    const result = { problem, translation, translationHtml };
    await writeTranslationCache('Programmers', parsed.lessonId, result);
    return result;
  }

  // ─── LeetCode 분기 ────────────────────────────────
  // 숫자 입력 (예: "1") — frontendId → slug 해결 후 진행
  let titleSlug = parsed.titleSlug;
  if (parsed.isNumericId && parsed.frontendId) {
    onProgress?.('resolving');
    titleSlug = await resolveTitleSlugByFrontendId(parsed.frontendId);
  }

  if (!titleSlug) {
    throw new Error('입력에서 문제 식별자를 찾지 못했어요 — URL/slug/문제 이름/번호 중 하나를 입력해주세요');
  }

  // 캐시 hit 시 LLM 호출 skip — chip 재클릭 / 같은 문제 다른 언어로 풀 때 즉시 로드
  const cached = await readTranslationCache('LeetCode', titleSlug);
  if (cached) {
    onProgress?.('cached');
    return cached;
  }

  onProgress?.('fetching');
  const problem = await fetchProblem(titleSlug);

  onProgress?.('translating');
  const translation = await translateProblem(problem, onStream);
  const translationHtml = await renderMarkdown(translation);

  const result = { problem, translation, translationHtml };
  // 캐시 쓰기 실패해도 흐름엔 영향 X — fire-and-forget OK이지만 await로 순서 보장
  await writeTranslationCache('LeetCode', titleSlug, result);
  return result;
}

export async function annotateAndUpload(
  args: {
    problem: Problem;
    translation: string;
    code: string;
    language: string;
  },
  onProgress?: ProgressFn,
  onStream?: StreamCallback
): Promise<UploadResult & { annotatedHtml: string; annotated: string }> {
  // 1) AI 회고 생성 (가장 비싼 단계 - 한 번만 호출)
  onProgress?.('annotating');
  const annotated = await annotateCode(
    args.problem,
    args.translation,
    args.code,
    args.language,
    onStream
  );
  const annotatedHtml = await renderMarkdown(annotated);

  const uploadArgs = {
    problem: args.problem,
    translation: args.translation,
    code: args.code,
    language: args.language,
    annotated,
  };

  // 2) GitHub 업로드 시도
  onProgress?.('uploading');
  try {
    const result = await uploadSolution(uploadArgs);
    return { ...result, annotatedHtml, annotated };
  } catch (err) {
    const status = (err as { status?: number })?.status;
    const autoCreate = process.env.GITHUB_AUTO_CREATE_REPO === 'true';

    // 자동 생성 옵션이 켜져 있고 404면, 레포 만들고 한 번 더 시도
    // 핵심: annotated 결과를 재사용 → AI 호출 비용 추가 발생 X
    if (autoCreate && status === 404) {
      onProgress?.('creating-repo');
      await createRepoIfMissing();
      await new Promise((r) => setTimeout(r, 1500)); // propagation 대기
      onProgress?.('uploading');
      const result = await uploadSolution(uploadArgs);
      return { ...result, annotatedHtml, annotated };
    }
    throw err;
  }
}
