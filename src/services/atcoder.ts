// AtCoder 문제 fetch — 공식 API 없어 HTML scraping.
//
// 페이지: https://atcoder.jp/contests/{contestId}/tasks/{taskId}
//   예: https://atcoder.jp/contests/abc300/tasks/abc300_a
//
// statement 언어 정책:
//   AtCoder는 같은 페이지에 영어 + 일본어 둘 다 표시 (`.lang-en` / `.lang-ja` 영역).
//   영어 우선 추출 → fallback 일본어. translator가 영어/일본어 → 한국어 번역.
//
// 접근 정책:
//   - 모든 문제 비로그인 접근 OK (콘테스트 중인 문제는 시간 제한 있을 수 있음)
//   - submission 자동 fetch는 로그인 필요 → v1.2+ Phase 3.5
//
// HTML 구조 변경 대응 — 여러 selector candidates + 친절 에러 fallback.

import * as cheerio from 'cheerio';
import { AtCoderProblem } from '../types';
import { getAtcoderDifficulty, difficultyColor } from './atcoderModels';

const BASE_URL = 'https://atcoder.jp';

const COMMON_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  // ko 우선 — AtCoder가 Accept-Language 기반으로 default lang 결정. ko 없으니 en으로
  'Accept-Language': 'en-US,en;q=0.9,ja;q=0.5',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

// taskId (예: 'abc300_a') → path-safe slug
// 영문/숫자/underscore만 → dash로 통일
function taskIdToSlug(taskId: string): string {
  return taskId.toLowerCase().replace(/_/g, '-');
}

// 제목 → path-safe slug (영문 + 한글 + 일본어 보존)
// AtCoder 제목은 보통 영어/일본어 혼합. 짧게 자름.
function titleSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      // 영문/숫자/한글/일본어(히라가나/카타카나/한자) 보존
      .replace(/[^\w가-힣぀-ヿ一-鿿-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'task'
  );
}

// 제목 추출 — AtCoder 페이지 구조:
//   <span class="h2">A - N-Choice Question<a class="btn ...">Editorial</a></span>
//   <title>A - N-Choice Question - AtCoder Beginner Contest 300 - AtCoder</title>
// 둘 다 "{taskLetter} - {taskName}" 형식이라 task letter("A") 제거 필요.
function stripTaskLetter(text: string): string {
  // " - " 위치 — 처음 한 번만 split (task letter는 항상 첫 부분)
  const idx = text.indexOf(' - ');
  if (idx > 0 && idx < 5) {
    // task letter는 보통 1~3자 (A, B1, EX 등) — 안전 가드
    return text.slice(idx + 3).trim();
  }
  return text.trim();
}

function extractTitle($: cheerio.CheerioAPI): string {
  // h2/span 우선 — 페이지 내 직접 표시되는 타이틀, suffix 없어 깔끔
  const h2Candidates = ['span.h2', 'h2.h2', '#main-container h2', '.h2'];
  for (const sel of h2Candidates) {
    const t = $(sel).first().clone().children().remove().end().text().trim();
    if (t) {
      const cleaned = stripTaskLetter(t);
      // Editorial 같은 부산물 마지막 정리
      if (cleaned && !/^\s*editorial\s*$/i.test(cleaned)) return cleaned;
    }
  }

  // fallback: <title> 태그 — "A - Task Name - Contest Name - AtCoder" 형식
  const fullTitle = $('title').first().text().trim();
  if (fullTitle) {
    // 우선 task letter 제거 → 그 다음 contest name suffix 제거
    const afterLetter = stripTaskLetter(fullTitle);
    // afterLetter: "Task Name - Contest Name - AtCoder"
    // 첫 " - " 앞이 task name (suffix 안전 제거)
    const sepIdx = afterLetter.indexOf(' - ');
    if (sepIdx > 0) return afterLetter.slice(0, sepIdx).trim();
    return afterLetter;
  }
  return '';
}

// statement 본문 HTML — 영어 우선, fallback 일본어
// 반환: { html, lang } — translator에 lang hint 전달
function extractStatement($: cheerio.CheerioAPI): { html: string; lang: 'en' | 'ja' | 'unknown' } {
  // 영어 우선
  const enHtml = $('#task-statement .lang-en').html();
  if (enHtml && enHtml.trim()) {
    return { html: enHtml.trim(), lang: 'en' };
  }

  const jaHtml = $('#task-statement .lang-ja').html();
  if (jaHtml && jaHtml.trim()) {
    return { html: jaHtml.trim(), lang: 'ja' };
  }

  // fallback — `#task-statement` 자체
  const fallback = $('#task-statement').html();
  if (fallback && fallback.trim()) {
    return { html: fallback.trim(), lang: 'unknown' };
  }

  return { html: '', lang: 'unknown' };
}

// 점수 (난이도 대체) — "300" 같은 점수만 추출
// AtCoder 페이지 상단의 "Score : 300 points" 영역
function extractScore($: cheerio.CheerioAPI): string {
  // 영어/일본어 statement 안에 score 표기 있음
  const statementHtml =
    $('#task-statement .lang-en').html() || $('#task-statement .lang-ja').html() || '';
  const m = statementHtml.match(/(?:Score|配点)\s*[:：]\s*<var>(\d+)<\/var>/);
  if (m) return `${m[1]}점`;

  // 상단 표시
  const pageText = $('#main-container').text();
  const m2 = pageText.match(/Score\s*[:：]?\s*(\d+)\s*(?:points|点)/i);
  if (m2) return `${m2[1]}점`;

  return '?점';
}

// 입출력 예시 — statement HTML에서 자동 추출 안 함 (LLM이 잘 정리)
// 보존만 — statement 안에 이미 포함됨
function extractExamples(_$: cheerio.CheerioAPI, _statementHtml: string): string {
  // AtCoder는 예시가 statement 안에 자연스럽게 임베드되어 있어 따로 분리 안 함
  return '';
}

// AtCoder URL parse: contestId + taskId 둘 다 필요 (서로 다른 contest의 task끼리 다른 페이지)
export interface AtCoderTaskRef {
  contestId: string;  // 예: 'abc300'
  taskId: string;     // 예: 'abc300_a'
}

export function parseAtcoderUrl(url: string): AtCoderTaskRef | null {
  const m = url.match(/atcoder\.jp\/contests\/([a-z0-9_]+)\/tasks\/([a-z0-9_]+)/i);
  if (!m) return null;
  return { contestId: m[1].toLowerCase(), taskId: m[2].toLowerCase() };
}

export async function fetchAtcoderProblem(ref: AtCoderTaskRef): Promise<AtCoderProblem> {
  const url = `${BASE_URL}/contests/${ref.contestId}/tasks/${ref.taskId}`;

  const res = await fetch(url, { headers: COMMON_HEADERS });
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        `AtCoder에서 task "${ref.taskId}"를 찾을 수 없어요 — URL을 확인해주세요`
      );
    }
    if (res.status === 403) {
      // 콘테스트 진행 중인 문제는 비참가자 접근 차단
      throw new Error(
        `AtCoder 접근 차단 (HTTP 403) — 진행 중인 콘테스트 문제일 수 있어요. 콘테스트 종료 후 다시 시도해주세요`
      );
    }
    if (res.status === 429) {
      throw new Error(`AtCoder 요청 제한 (HTTP 429) — 잠시 후 다시 시도해주세요`);
    }
    throw new Error(`AtCoder 응답 오류 (HTTP ${res.status})`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const title = extractTitle($);
  if (!title) {
    throw new Error(
      `AtCoder 페이지에서 제목을 찾을 수 없어요 — 페이지 구조 변경 가능성. ` +
        `잠시 후 다시 시도하거나 issue 등록 부탁`
    );
  }

  const { html: statementHtml, lang } = extractStatement($);
  if (!statementHtml) {
    throw new Error(
      `AtCoder 페이지에서 문제 본문을 찾을 수 없어요 — 페이지 구조 변경 가능성`
    );
  }

  const score = extractScore($);
  // difficulty rating은 외부 API (kenkoooo.com) — 캐시된 경우 빠르고, 첫 호출은 5초 정도
  // 실패해도 점수만 표시되도록 silent fallback
  const diffRating = await getAtcoderDifficulty(ref.taskId);
  // 표기 (AtCoder Problems 색깔 체계):
  //   rating null  → "300점"
  //   rating < 0   → "100점 · ⚫ 회색"
  //   rating >= 0  → "500점 · 🔵 청색 (1350)"
  let difficultyLabel = score;
  if (diffRating !== null) {
    const { emoji, nameKr } = difficultyColor(diffRating);
    if (diffRating < 0) {
      // 매우 쉬움 — 숫자 가치 낮음, 색깔만
      difficultyLabel = `${score} · ${emoji} ${nameKr}`;
    } else {
      difficultyLabel = `${score} · ${emoji} ${nameKr} (${diffRating})`;
    }
  }
  const exampleTestcases = extractExamples($, statementHtml);

  // path-safe slug — taskId-titleSlug 형식
  // taskId가 이미 contest prefix 포함하므로 globally unique
  const slug = `${taskIdToSlug(ref.taskId)}-${titleSlug(title)}`;

  return {
    platform: 'AtCoder',
    contestId: ref.contestId,
    taskId: ref.taskId,
    // LeetCode 호환을 위한 별칭 — pipeline의 union 처리 단순화
    questionFrontendId: ref.taskId,
    title,
    titleSlug: slug,
    content: statementHtml,
    difficulty: difficultyLabel,
    statementLang: lang,
    exampleTestcases,
    topicTags: [],
    codeSnippets: [], // AtCoder는 starter code 없음 — 사용자 직접 paste
    url,
  };
}
