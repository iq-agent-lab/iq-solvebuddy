// 프로그래머스 문제 fetch — 공식 API 없어 HTML scraping.
//
// 페이지: https://school.programmers.co.kr/learn/courses/30/lessons/{lessonId}
//
// 접근 정책:
//   - Lv 0-2 문제는 비로그인 접근 OK
//   - Lv 3+ 일부 문제는 로그인 필요 (HTML 받지만 내용 일부 가려짐)
//   - 사용자가 임베드에 로그인했어도 cookies 활용은 별도 단계 — Phase 2.5에서
//
// HTML 구조는 사이트 업데이트에 따라 변할 수 있어 — selector를 여러 개 시도 +
// 실패 시 친절 에러로 fallback.

import * as cheerio from 'cheerio';
import { ProgrammersProblem } from '../types';

const BASE_URL = 'https://school.programmers.co.kr';

const COMMON_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

// 한국어 제목 → path-safe slug
// 한글 보존 + 공백 → dash + 특수문자 제거. 너무 길면 80자로 자름.
function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w가-힣-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'programmers-problem';
}

// HTML body에서 제목 추출 — 여러 selector 시도 (사이트 변경 대응)
function extractTitle($: cheerio.CheerioAPI): string {
  const candidates = [
    'h3.challenge-title',
    '.algorithm-title',
    'h2.lesson-title',
    'h1.lesson-title',
    'header.lesson-header h2',
    'div.lesson-content h1',
  ];
  for (const sel of candidates) {
    const t = $(sel).first().text().trim();
    if (t) return t;
  }
  // og:title meta로 fallback
  const og = $('meta[property="og:title"]').attr('content');
  if (og) {
    // "문제 풀이 - 프로그래머스" 같은 suffix 제거
    return og.replace(/\s*-\s*프로그래머스\s*$/, '').replace(/\s*\|\s*프로그래머스\s*$/, '').trim();
  }
  return '';
}

// 본문 HTML — markdown 영역
function extractContent($: cheerio.CheerioAPI): string {
  const candidates = [
    '.markdown',
    'div.problem-description',
    '.lesson-content .markdown',
    'section.lesson-content',
  ];
  for (const sel of candidates) {
    const el = $(sel).first();
    if (el.length) {
      const html = el.html();
      if (html && html.trim()) return html.trim();
    }
  }
  return '';
}

// 난이도 — "level 3" / "Lv. 3" 등 다양한 표기 → "Lv 3"
function extractDifficulty($: cheerio.CheerioAPI): string {
  const candidates = [
    '.challenge-level',
    '.lesson-level',
    '.level',
    'span.level-text',
    'div.lesson-summary .level',
  ];
  let raw = '';
  for (const sel of candidates) {
    const t = $(sel).first().text().trim();
    if (t) {
      raw = t;
      break;
    }
  }
  // 클래스명 자체에 level 정보가 있는 경우 (예: class="level-3")
  if (!raw) {
    const levelClass = $('[class*="level-"]').attr('class');
    if (levelClass) {
      const cm = levelClass.match(/level-(\d)/);
      if (cm) raw = `level ${cm[1]}`;
    }
  }
  const m = raw.match(/(?:level|lv\.?|레벨)\s*(\d)/i);
  if (m) return `Lv ${m[1]}`;
  if (raw) return raw;
  return 'Lv ?';
}

// starter code — ace editor / textarea에서 추출 시도
// 비로그인 시 보통 default lang(언어 선택 안 함) starter만 보임
function extractCodeSnippets(
  $: cheerio.CheerioAPI
): Array<{ lang: string; langSlug: string; code: string }> {
  const snippets: Array<{ lang: string; langSlug: string; code: string }> = [];
  // ace editor에 setValue로 init하는 패턴 — script 안에서 발견
  // 페이지 자체에 textarea도 가능
  const textareaCode = $('textarea#code-editor, textarea[name="code"]').first().text();
  if (textareaCode && textareaCode.trim()) {
    // 언어 추정 어려움 — 사용자가 select하면 거기서 보임. default는 모름.
    snippets.push({ lang: 'Python3', langSlug: 'python3', code: textareaCode });
  }
  return snippets;
}

// 입출력 예시 테이블 추출 — content 안 first table을 텍스트화
function extractExampleTestcases($: cheerio.CheerioAPI, contentHtml: string): string {
  if (!contentHtml) return '';
  // 단순화: content HTML에서 첫 table 찾고 cell text 추출
  const $c = cheerio.load(contentHtml);
  const $table = $c('table').first();
  if (!$table.length) return '';
  const rows: string[] = [];
  $table.find('tr').each((_i, tr) => {
    const cells = $c(tr)
      .find('td, th')
      .map((_j, td) => $c(td).text().trim())
      .get();
    if (cells.length) rows.push(cells.join(' | '));
  });
  return rows.join('\n');
}

export async function fetchProgrammersProblem(lessonId: string): Promise<ProgrammersProblem> {
  if (!/^\d+$/.test(lessonId)) {
    throw new Error(`프로그래머스 lessonId가 잘못됐어요: "${lessonId}" — 숫자만 가능`);
  }

  const url = `${BASE_URL}/learn/courses/30/lessons/${lessonId}`;

  const res = await fetch(url, { headers: COMMON_HEADERS });
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        `프로그래머스에서 문제 #${lessonId}를 찾을 수 없어요 — URL을 확인해주세요`
      );
    }
    if (res.status === 429) {
      throw new Error(`프로그래머스 요청 제한 (HTTP 429) — 잠시 후 다시 시도해주세요`);
    }
    throw new Error(`프로그래머스 응답 오류 (HTTP ${res.status})`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const title = extractTitle($);
  if (!title) {
    throw new Error(
      `프로그래머스 페이지에서 제목을 찾을 수 없어요 — 페이지 구조 변경 가능성 또는 ` +
        `로그인 필요한 문제 (Lv 3+). 임베드 LeetCode 윈도우처럼 프로그래머스 로그인 ` +
        `세션 활용은 다음 release(v1.1+)에서 지원 예정`
    );
  }

  const content = extractContent($);
  if (!content) {
    throw new Error(
      `프로그래머스 페이지에서 문제 본문을 찾을 수 없어요 — 로그인이 필요한 문제일 수 있음`
    );
  }

  const difficulty = extractDifficulty($);
  const codeSnippets = extractCodeSnippets($);
  const exampleTestcases = extractExampleTestcases($, content);

  return {
    platform: 'Programmers',
    lessonId,
    questionFrontendId: lessonId,
    title,
    titleSlug: slugify(title),
    content,
    difficulty,
    exampleTestcases,
    topicTags: [],
    codeSnippets,
    url,
  };
}
