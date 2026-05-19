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
//
// ⚠️ Cloudflare 우회: Codeforces는 node fetch를 HTTP 403으로 차단 (일반 UA여도).
// → BrowserWindow에서 진짜 Chromium으로 로드 → outerHTML 추출.
// hidden 윈도우라 사용자 노출 없음. persist:codeforces 파티션으로 cookies/cache 재사용.

import * as cheerio from 'cheerio';
import { CodeforcesProblem } from '../types';
import { fetchHtmlViaBrowser } from './browserFetch';

const BASE_URL = 'https://codeforces.com';
const PARTITION = 'persist:codeforces';

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

// .tag-box 영역에서 rating + algorithmic tags 분리 추출
// rating: '*1500' / '★1500' / 'difficulty: 1500' 등 다양한 표기
// algorithmic tags: 'greedy', 'dp', 'implementation', ... (rating 매칭 안 된 것)
//
// 페이지 구조 차이 대응:
//   1) cheerio .tag-box 순회 (text + title attr 둘 다)
//   2) raw HTML regex fallback — cheerio가 못 잡는 nested anchor 등
//   3) page-wide pure digit span 검사 (last resort)
function extractRatingAndTags($: cheerio.CheerioAPI, rawHtml: string): { rating: string; tags: string[] } {
  const tags: string[] = [];
  let rating = '?';

  // 1) 모든 .tag-box 순회
  $('.tag-box').each((_i, el) => {
    const $el = $(el);
    const t = $el.text().trim();
    const title = $el.attr('title') || '';
    const fullText = `${t} ${title}`.toLowerCase();
    if (!t) return;

    // rating: text의 "*1500" / "★1500" / title의 "Difficulty: 1500"
    let ratingMatch =
      t.match(/[\*★]\s*(\d{3,4})/) ||
      title.match(/(?:difficulty|rating)\s*[:=]?\s*(\d{3,4})/i);
    if (!ratingMatch && /^\d{3,4}$/.test(t) && /difficulty|rating/i.test(fullText)) {
      ratingMatch = t.match(/(\d{3,4})/);
    }
    if (ratingMatch) {
      if (rating === '?') rating = `★${ratingMatch[1]}`;
      return;
    }

    // algorithmic tag: 알파/공백/하이픈, 길이 가드, rating 패턴 아님
    if (t.length > 0 && t.length < 40 && /^[a-z][a-z0-9\s\-]+$/i.test(t)) {
      tags.push(t.toLowerCase());
    }
  });

  // 2) cheerio가 못 잡은 경우 — raw HTML regex
  // CF는 종종 <span class="tag-box"><a href="/problemset?tags=...">*1500</a></span> 형태
  // cheerio가 anchor 내부 text 추출이 안 되는 경우 있어 raw regex로 fallback
  if (rating === '?') {
    const m =
      rawHtml.match(/class="[^"]*tag-box[^"]*"[^>]*>[\s\S]{0,200}?\*\s*(\d{3,4})/i) ||
      rawHtml.match(/title="\s*(?:difficulty|rating)[^"]*?(\d{3,4})\s*"/i);
    if (m) rating = `★${m[1]}`;
  }

  // 3) 마지막 fallback — page-wide '*NNN' 패턴 단독 (false positive 위험 낮음)
  // 별표 + 3~4 digit이 단독으로 페이지에 있을 가능성은 거의 rating
  if (rating === '?') {
    const m = rawHtml.match(/(?:^|\s|>)\*(\d{3,4})(?:<|\s|$)/);
    if (m) {
      const v = parseInt(m[1], 10);
      // CF rating 범위 800~3500
      if (v >= 800 && v <= 3500) rating = `★${m[1]}`;
    }
  }

  return { rating, tags };
}

// 입출력 예시는 statement HTML 안에 .sample-tests로 포함되어 있음
// translator가 그대로 활용하므로 별도 추출 안 함
function extractExamples(_$: cheerio.CheerioAPI): string {
  return '';
}

// Contest의 Division 번호 추출 — rating 없을 때 fallback에 활용
// CF contest 페이지 어디에든 "Codeforces Round 945 (Div. 2)" 같은 패턴이 있음.
// .rtable, .caption, .left, page title 등 여러 곳 시도 + raw HTML fallback.
//
// CF rating 가이드 (사용자 제공):
//   Div.4: 가장 쉬움 (C번도 단순 그리디)
//   Div.3: 초중급 (C, D번부터 BFS/DFS, 단순 DP)
//   Div.2: 대중적 (A,B 애드혹/수학, C부터 알고리즘 체급)
//   Div.1: 고수 전용 (A번이 Div.2 C-D 수준)
//
// 표시: "Div.2 C" 형태. rating 있으면 rating 우선 사용.
function extractDivision($: cheerio.CheerioAPI, rawHtml: string): string | null {
  // 1) DOM selector — sidebar의 contest 제목
  const candidates = [
    '.rtable a[href*="/contest/"]',
    '.caption.titled',
    'a[href*="/contest/"]:contains("Div")',
    'th.left',
    'title',
  ];
  for (const sel of candidates) {
    const elements = $(sel);
    for (let i = 0; i < elements.length; i++) {
      const t = $(elements[i]).text();
      const m = t.match(/Div\.?\s*(\d)/i);
      if (m) return `Div.${m[1]}`;
    }
  }
  // 2) raw HTML
  const m = rawHtml.match(/Div\.?\s*(\d)/i);
  if (m) return `Div.${m[1]}`;
  return null;
}

export async function fetchCodeforcesProblem(ref: CodeforcesProblemRef): Promise<CodeforcesProblem> {
  // problemset URL이 더 안정적 (contest URL은 진행 중이면 차단)
  const url = `${BASE_URL}/problemset/problem/${ref.contestId}/${ref.index}`;
  const displayUrl = url;

  // BrowserWindow로 로드 (Cloudflare 우회). 첫 호출 5초 정도, 재호출 1-2초
  let html: string;
  try {
    html = await fetchHtmlViaBrowser(url, PARTITION);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Codeforces 페이지 로드 실패: ${msg}`);
  }

  const $ = cheerio.load(html);

  // 페이지 자체에 "Statement is not available on English language" 또는 404 처리
  // BrowserWindow는 200 OK라도 본문이 에러 페이지일 수 있어 selector 기반 판단
  const pageNotFound =
    $('title').text().toLowerCase().includes('not found') ||
    $('body').text().toLowerCase().includes('codeforces did not respond');

  if (pageNotFound) {
    throw new Error(
      `Codeforces에서 문제 ${ref.contestId}${ref.index}를 찾을 수 없어요 — URL을 확인해주세요`
    );
  }

  const title = extractTitle($, ref.index);
  if (!title) {
    throw new Error(
      `Codeforces 페이지에서 제목을 찾을 수 없어요 — 페이지 구조 변경 또는 ` +
        `Cloudflare 챌린지 미통과 가능성. 잠시 후 다시 시도해주세요`
    );
  }

  const content = extractStatement($);
  if (!content) {
    throw new Error(
      `Codeforces 페이지에서 문제 본문을 찾을 수 없어요 — 페이지 구조 변경 가능성`
    );
  }

  const { rating, tags } = extractRatingAndTags($, html);
  const exampleTestcases = extractExamples($);

  // 난이도 결정 — rating 있으면 그대로, 없으면 Division + index로 fallback
  // 예: rating "★1500" / fallback "Div.2 C" / 둘 다 없으면 "?"
  let difficulty: string;
  if (rating !== '?') {
    difficulty = rating;
  } else {
    const div = extractDivision($, html);
    if (div) {
      difficulty = `${div} ${ref.index}`;
    } else {
      difficulty = '?';
    }
  }

  // tag → LeetCodeTag 형태로 변환 (Problem union이 같은 구조 공유)
  const topicTags = tags.map((name) => ({
    name,
    slug: name.replace(/\s+/g, '-'),
  }));

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
    difficulty,
    exampleTestcases,
    topicTags,
    codeSnippets: [],
    url: displayUrl,
  };
}
