// Codeforces 문제 fetch — HTML scraping (cheerio).
//
// 두 가지 URL 형태가 같은 문제를 가리킴:
//   - contest URL:    https://codeforces.com/contest/{contestId}/problem/{index}
//   - problemset URL: https://codeforces.com/problemset/problem/{contestId}/{index}
// 둘 다 인식.
//
// statement: 영어 → 한국어 번역 (LeetCode 패턴 재사용).
// 난이도: 문제 페이지의 rating tag (예: *1500) 또는 별표 표기.
//
// 인증: 비로그인 접근 OK. submission 자동 fetch는 v1.2+ Phase 4.5에서 임베드 활용.

import * as cheerio from 'cheerio';
import { CodeforcesProblem } from '../types';

const BASE_URL = 'https://codeforces.com';

// Codeforces는 단순 fetch는 안 막지만 일부 region/Cloudflare 보호 — 일반 브라우저 UA 필요
const COMMON_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9,ko;q=0.8',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

export interface CodeforcesProblemRef {
  contestId: string; // 예: '1234'
  index: string;     // 예: 'A', 'B1', 'C2'
}

// URL parse — contest 형태와 problemset 형태 둘 다 매칭
export function parseCfUrl(url: string): CodeforcesProblemRef | null {
  // contest URL
  const cm = url.match(/codeforces\.com\/contest\/(\d+)\/problem\/([A-Z]\d*)/i);
  if (cm) return { contestId: cm[1], index: cm[2].toUpperCase() };

  // problemset URL
  const pm = url.match(/codeforces\.com\/problemset\/problem\/(\d+)\/([A-Z]\d*)/i);
  if (pm) return { contestId: pm[1], index: pm[2].toUpperCase() };

  // gym URL — 비공개/공개 혼재라 skip (v1.3+에서)
  return null;
}

// 제목 → path-safe slug (영문 + 한글 + 일본어 보존)
function titleSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w가-힣-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'problem'
  );
}

// Codeforces 페이지의 .problem-statement > div:first-child가 보통:
//   <div class="header">
//     <div class="title">A. Two Pointers</div>
//     <div class="time-limit">...</div>
//     ...
//   </div>
// title에서 "A. " prefix 제거
function stripIndexPrefix(text: string, index: string): string {
  // "A. Title" 또는 "A1. Title" 형식
  const re = new RegExp(`^\\s*${index}\\.\\s+`, 'i');
  return text.replace(re, '').trim();
}

function extractTitle($: cheerio.CheerioAPI, index: string): string {
  const candidates = [
    '.problem-statement .header .title',
    '.problem-statement .title',
    'div.title',
  ];
  for (const sel of candidates) {
    const raw = $(sel).first().text().trim();
    if (raw) {
      return stripIndexPrefix(raw, index);
    }
  }
  // fallback: <title>
  const fullTitle = $('title').first().text().trim();
  if (fullTitle) {
    // "Problem - A. Two Pointers" 또는 "A. Two Pointers - Codeforces" 형식
    // " - " 단위로 split해서 가장 그럴듯한 부분 추출
    const parts = fullTitle.split(/\s+-\s+/);
    for (const p of parts) {
      if (/^\s*[A-Z]\d*\.\s+/.test(p)) {
        return stripIndexPrefix(p, index);
      }
    }
  }
  return '';
}

// statement HTML — problem-statement div 전체 (header 포함, sample-tests 포함)
// translator가 마크다운으로 변환할 때 모두 활용
function extractStatement($: cheerio.CheerioAPI): string {
  const $stmt = $('.problem-statement').first();
  if (!$stmt.length) return '';
  // MathJax script / 인라인 style 등 부산물 제거
  $stmt.find('script, style').remove();
  return $stmt.html()?.trim() || '';
}

// 난이도 — 문제 페이지 sidebar의 rating tag
// Codeforces는 *1500 형식 (별표 + 숫자) 또는 단순 숫자 tag
function extractRating($: cheerio.CheerioAPI): string {
  // sidebar의 problem tags 영역
  const candidates = [
    '.tag-box[title*="Difficulty"]',
    '.tag-box.tag-bottom',
    '.roundbox.sidebox span.tag-box',
  ];
  for (const sel of candidates) {
    const elements = $(sel);
    for (let i = 0; i < elements.length; i++) {
      const t = $(elements[i]).text().trim();
      // "*1500" 또는 "1500" 형식 매칭
      const m = t.match(/\*?(\d{3,4})/);
      if (m) return `★${m[1]}`;
    }
  }
  return '?';
}

// 입출력 예시는 statement HTML 안에 .sample-tests로 포함되어 있음
// translator가 그대로 활용하므로 별도 추출 안 함
function extractExamples(_$: cheerio.CheerioAPI): string {
  return '';
}

export async function fetchCodeforcesProblem(ref: CodeforcesProblemRef): Promise<CodeforcesProblem> {
  // problemset URL이 더 안정적 (contest URL은 진행 중이면 403)
  const url = `${BASE_URL}/problemset/problem/${ref.contestId}/${ref.index}`;
  const displayUrl = url;

  const res = await fetch(url, { headers: COMMON_HEADERS });
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        `Codeforces에서 문제 ${ref.contestId}${ref.index}를 찾을 수 없어요 — URL을 확인해주세요`
      );
    }
    if (res.status === 403) {
      throw new Error(
        `Codeforces 접근 차단 (HTTP 403) — Cloudflare 또는 region 차단 가능성. 잠시 후 다시 시도해주세요`
      );
    }
    if (res.status === 429) {
      throw new Error(`Codeforces 요청 제한 (HTTP 429) — 잠시 후 다시 시도해주세요`);
    }
    throw new Error(`Codeforces 응답 오류 (HTTP ${res.status})`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const title = extractTitle($, ref.index);
  if (!title) {
    throw new Error(
      `Codeforces 페이지에서 제목을 찾을 수 없어요 — 페이지 구조 변경 가능성. ` +
        `잠시 후 다시 시도해주세요`
    );
  }

  const content = extractStatement($);
  if (!content) {
    throw new Error(
      `Codeforces 페이지에서 문제 본문을 찾을 수 없어요 — 페이지 구조 변경 가능성`
    );
  }

  const rating = extractRating($);
  const exampleTestcases = extractExamples($);

  // path-safe slug — contestId-index-titleSlug 형식
  // 예: '1234-A-two-pointers'
  const slug = `${ref.contestId}-${ref.index}-${titleSlug(title)}`;

  return {
    platform: 'Codeforces',
    contestId: ref.contestId,
    index: ref.index,
    /** Problem union 호환 — '{contestId}{index}' 형식 (예: '1234A') */
    questionFrontendId: `${ref.contestId}${ref.index}`,
    title,
    titleSlug: slug,
    content,
    difficulty: rating,
    exampleTestcases,
    topicTags: [],
    codeSnippets: [],
    url: displayUrl,
  };
}
