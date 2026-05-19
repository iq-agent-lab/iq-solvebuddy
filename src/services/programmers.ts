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
import { session } from 'electron';
import { ProgrammersProblem } from '../types';

const BASE_URL = 'https://school.programmers.co.kr';
const PARTITION = 'persist:programmers';

const COMMON_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

// 임베드 세션 cookies — Lv 3+ 로그인 필요 문제 fetch 시 fallback
async function getProgrammersCookieHeader(): Promise<string> {
  try {
    const ses = session.fromPartition(PARTITION);
    const cookies = await ses.cookies.get({ domain: '.programmers.co.kr' });
    if (cookies.length === 0) {
      const alt = await ses.cookies.get({ domain: 'programmers.co.kr' });
      cookies.push(...alt);
    }
    if (cookies.length === 0) return '';
    return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  } catch {
    return '';
  }
}

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

// 난이도 — 다양한 selector 시도 + page HTML 안의 inline data 패턴까지
// 프로그래머스 페이지가 SPA(Nuxt) 기반이라 정적 HTML엔 selector가 안 잡힐 수 있음
// → script 안의 inline JSON state에서 level 추출
function extractDifficulty($: cheerio.CheerioAPI, rawHtml: string): string {
  // 1) 알려진 DOM selector들
  const candidates = [
    '.challenge-level',
    '.lesson-level',
    '.level',
    'span.level-text',
    'div.lesson-summary .level',
    '.challenge-meta .level',
    '.lesson-summary dd',
    '[data-level]',
  ];
  let raw = '';
  for (const sel of candidates) {
    const $el = $(sel).first();
    const dataLevel = $el.attr('data-level');
    if (dataLevel) {
      raw = `level ${dataLevel}`;
      break;
    }
    const t = $el.text().trim();
    if (t && /\d/.test(t)) {
      raw = t;
      break;
    }
  }
  // 2) 클래스명에 level 정보 (예: class="level-3")
  if (!raw) {
    const levelClass = $('[class*="level-"]').first().attr('class');
    if (levelClass) {
      const cm = levelClass.match(/level-(\d)/);
      if (cm) raw = `level ${cm[1]}`;
    }
  }
  // 3) page HTML 안의 inline JSON — '"level":N' / '"difficulty":N' 패턴
  // SPA initial state. false positive 방지 위해 lesson/challenge 컨텍스트 근처에서만
  if (!raw) {
    const m = rawHtml.match(/"level"\s*:\s*(\d+)/);
    if (m && parseInt(m[1], 10) > 0 && parseInt(m[1], 10) < 10) {
      raw = `level ${m[1]}`;
    }
  }
  const m = raw.match(/(?:level|lv\.?|레벨)\s*(\d)/i);
  if (m) return `Lv ${m[1]}`;
  if (raw) return raw;
  return 'Lv ?';
}

// starter code 한 줄로 lang 추정 — 페이지에 lang selector 정보 없을 때 fallback
// 프로그래머스 페이지가 SPA라 정적 HTML엔 lang state 노출 X
function detectLangFromCode(code: string): { lang: string; langSlug: string } {
  const trimmed = code.trim();
  // C/C++: #include 패턴
  if (/^\s*#include\s*<bits\/stdc\+\+/.test(trimmed)) return { lang: 'C++', langSlug: 'cpp' };
  if (/using\s+namespace\s+std\b/.test(trimmed) || /vector\s*<\s*\w+\s*>/.test(trimmed) || /std::/.test(trimmed)) {
    return { lang: 'C++', langSlug: 'cpp' };
  }
  if (/^\s*#include\s*<\w+\.h>/m.test(trimmed)) {
    // <stdio.h> 등 순수 C 헤더 — C++ 키워드 없으면 C
    return { lang: 'C', langSlug: 'c' };
  }
  if (/^\s*#include/.test(trimmed)) return { lang: 'C++', langSlug: 'cpp' };
  // Python
  if (/^\s*def\s+solution\s*\(/m.test(trimmed) || /^\s*from\s+\w+\s+import/m.test(trimmed) || /^\s*import\s+\w+/m.test(trimmed)) {
    return { lang: 'Python3', langSlug: 'python3' };
  }
  // Java
  if (/class\s+Solution\b/.test(trimmed) && /public\s+\w+\s+solution/.test(trimmed)) {
    return { lang: 'Java', langSlug: 'java' };
  }
  if (/public\s+class\s+/.test(trimmed)) return { lang: 'Java', langSlug: 'java' };
  // JavaScript
  if (/^\s*function\s+solution/m.test(trimmed) || /^\s*const\s+solution\s*=/m.test(trimmed)) {
    return { lang: 'JavaScript', langSlug: 'javascript' };
  }
  // Kotlin
  if (/^\s*fun\s+solution/m.test(trimmed) || /^\s*import\s+kotlin\./m.test(trimmed)) {
    return { lang: 'Kotlin', langSlug: 'kotlin' };
  }
  // Swift
  if (/^\s*func\s+solution.*->\s*\w+/m.test(trimmed) || /^\s*import\s+Foundation/m.test(trimmed)) {
    return { lang: 'Swift', langSlug: 'swift' };
  }
  // Rust
  if (/^\s*fn\s+solution.*->\s*\w+/m.test(trimmed)) return { lang: 'Rust', langSlug: 'rust' };
  // Go
  if (/^\s*package\s+main\b/m.test(trimmed) || /^\s*func\s+solution/m.test(trimmed)) {
    return { lang: 'Go', langSlug: 'go' };
  }
  // Ruby
  if (/^\s*def\s+solution.*\n.*end\b/m.test(trimmed)) return { lang: 'Ruby', langSlug: 'ruby' };
  // SQL
  if (/^\s*SELECT\b/im.test(trimmed) || /^\s*WITH\b/im.test(trimmed)) {
    return { lang: 'SQL', langSlug: 'mysql' };
  }
  // fallback
  return { lang: 'Python3', langSlug: 'python3' };
}

// starter code — ace editor / textarea에서 추출 시도
// 비로그인: default lang의 빈 starter만. 로그인 + 이전 풀이: 마지막 작성 코드.
// lang 감지: 페이지의 lang selector → fallback code heuristic
function extractCodeSnippets(
  $: cheerio.CheerioAPI
): Array<{ lang: string; langSlug: string; code: string }> {
  const snippets: Array<{ lang: string; langSlug: string; code: string }> = [];
  // 다양한 textarea selector
  const textareaCandidates = [
    'textarea#code-editor',
    'textarea[name="code"]',
    'textarea.code',
    'textarea#code',
    'textarea[data-code]',
  ];
  let code = '';
  for (const sel of textareaCandidates) {
    const t = $(sel).first().text();
    if (t && t.trim()) {
      code = t;
      break;
    }
  }
  if (!code.trim()) return snippets;

  // lang 추정 — 페이지의 lang selector / dropdown 시도, 못 찾으면 코드 heuristic
  const langSelectCandidates = [
    'select#language option[selected]',
    'select[name="language"] option[selected]',
    'select#code-language option[selected]',
    '.lang-selector .active',
    '[data-lang]:not([data-lang=""])',
  ];
  let langFromDom = '';
  for (const sel of langSelectCandidates) {
    const $el = $(sel).first();
    const dataLang = $el.attr('data-lang') || $el.attr('value');
    if (dataLang) {
      langFromDom = dataLang.toLowerCase();
      break;
    }
    const text = $el.text().trim().toLowerCase();
    if (text) {
      langFromDom = text;
      break;
    }
  }

  // DOM에서 잡은 lang이 있으면 정규화, 없으면 코드 heuristic
  let lang: string, langSlug: string;
  if (langFromDom) {
    const normalized = normalizeLangName(langFromDom);
    lang = normalized.lang;
    langSlug = normalized.langSlug;
  } else {
    const detected = detectLangFromCode(code);
    lang = detected.lang;
    langSlug = detected.langSlug;
  }

  snippets.push({ lang, langSlug, code });
  return snippets;
}

// 프로그래머스 lang 표시명 또는 keyword → 표준 (lang, langSlug)
function normalizeLangName(raw: string): { lang: string; langSlug: string } {
  const r = raw.toLowerCase().trim();
  if (r.includes('python')) return { lang: 'Python3', langSlug: 'python3' };
  if (r === 'cpp' || r.includes('c++')) return { lang: 'C++', langSlug: 'cpp' };
  if (r === 'java' || r.includes('java') && !r.includes('javascript')) return { lang: 'Java', langSlug: 'java' };
  if (r.includes('javascript') || r === 'js') return { lang: 'JavaScript', langSlug: 'javascript' };
  if (r.includes('typescript') || r === 'ts') return { lang: 'TypeScript', langSlug: 'typescript' };
  if (r.includes('kotlin')) return { lang: 'Kotlin', langSlug: 'kotlin' };
  if (r.includes('swift')) return { lang: 'Swift', langSlug: 'swift' };
  if (r.includes('go') || r === 'golang') return { lang: 'Go', langSlug: 'go' };
  if (r.includes('rust')) return { lang: 'Rust', langSlug: 'rust' };
  if (r.includes('ruby')) return { lang: 'Ruby', langSlug: 'ruby' };
  if (r.includes('scala')) return { lang: 'Scala', langSlug: 'scala' };
  if (r.includes('c#') || r.includes('csharp')) return { lang: 'C#', langSlug: 'csharp' };
  if (r === 'c' || r.includes(' c ') || r.endsWith(' c')) return { lang: 'C', langSlug: 'c' };
  if (r.includes('sql') || r.includes('mysql')) return { lang: 'SQL', langSlug: 'mysql' };
  // fallback
  return { lang: raw, langSlug: r.replace(/[^\w]/g, '').slice(0, 20) || 'python3' };
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

// 페이지 HTML을 fetch — 임베드 cookies 우선 사용 (Lv 3+ 로그인 필요 문제 대응)
// cookies 없거나 본문 못 받으면 비로그인 fetch fallback
async function fetchProgrammersHtml(url: string): Promise<{ html: string; usedCookies: boolean }> {
  const cookieHeader = await getProgrammersCookieHeader();
  const headers: Record<string, string> = { ...COMMON_HEADERS };
  if (cookieHeader) headers.Cookie = cookieHeader;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        `프로그래머스에서 문제를 찾을 수 없어요 (HTTP 404) — URL을 확인해주세요`
      );
    }
    if (res.status === 429) {
      throw new Error(`프로그래머스 요청 제한 (HTTP 429) — 잠시 후 다시 시도해주세요`);
    }
    throw new Error(`프로그래머스 응답 오류 (HTTP ${res.status})`);
  }
  return { html: await res.text(), usedCookies: Boolean(cookieHeader) };
}

export async function fetchProgrammersProblem(lessonId: string): Promise<ProgrammersProblem> {
  if (!/^\d+$/.test(lessonId)) {
    throw new Error(`프로그래머스 lessonId가 잘못됐어요: "${lessonId}" — 숫자만 가능`);
  }

  const url = `${BASE_URL}/learn/courses/30/lessons/${lessonId}`;

  const { html, usedCookies } = await fetchProgrammersHtml(url);
  const $ = cheerio.load(html);

  const title = extractTitle($);
  if (!title) {
    // cookies 사용했는데도 못 받으면 진짜 없거나 권한 부족, 미사용이면 로그인 안내
    const loginHint = usedCookies
      ? `페이지 구조 변경 가능성. 임베드 윈도우에서 해당 문제 페이지가 정상적으로 보이는지 확인해주세요`
      : `로그인 필요한 문제 (Lv 3+)일 수 있어요. 헤더 프로그래머스 버튼으로 임베드 윈도우 열고 로그인 후 다시 시도해주세요`;
    throw new Error(`프로그래머스 페이지에서 제목을 찾을 수 없어요 — ${loginHint}`);
  }

  const content = extractContent($);
  if (!content) {
    const loginHint = usedCookies
      ? `페이지 구조 변경 가능성`
      : `로그인이 필요한 문제일 수 있어요. 헤더 프로그래머스 버튼으로 임베드 열고 로그인 후 재시도`;
    throw new Error(`프로그래머스 페이지에서 문제 본문을 찾을 수 없어요 — ${loginHint}`);
  }

  const difficulty = extractDifficulty($, html);
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
