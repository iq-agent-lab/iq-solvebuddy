// AtCoder submission 자동 fetch — 임베드 세션 cookies + HTML scraping
//
// AtCoder는 공식 GraphQL/REST API 없음 → 페이지 HTML 직접 scraping.
//
// 흐름:
//   1) 임베드 윈도우(`persist:atcoder` partition)의 cookies 가져옴 (REVEL_SESSION 등)
//   2) submission 목록 페이지 fetch (AC 상태 필터)
//      https://atcoder.jp/contests/{contestId}/submissions/me?f.Task={taskId}&f.Status=AC
//   3) 가장 최근 AC submission ID 추출 (tr 첫 줄)
//   4) submission detail 페이지 fetch + 코드 본문 추출
//      https://atcoder.jp/contests/{contestId}/submissions/{submissionId}
//   5) 언어 정보 추출 → 우리 langSlug로 매핑
//
// 인증 필요 — 임베드 윈도우에 로그인 안 되어 있으면 친절 에러.

import * as cheerio from 'cheerio';
import { session } from 'electron';

const BASE_URL = 'https://atcoder.jp';
const PARTITION = 'persist:atcoder';

async function getAtcoderCookies(): Promise<{ cookieHeader: string; csrf: string | null }> {
  const ses = session.fromPartition(PARTITION);
  const cookies = await ses.cookies.get({ domain: '.atcoder.jp' });
  if (cookies.length === 0) {
    const alt = await ses.cookies.get({ domain: 'atcoder.jp' });
    cookies.push(...alt);
  }
  if (cookies.length === 0) {
    return { cookieHeader: '', csrf: null };
  }
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  // AtCoder는 CSRF를 form input "csrf_token" 으로 전달 — 페이지에서 추출 (cookies 아님)
  return { cookieHeader, csrf: null };
}

// AtCoder language 표시명 → 우리 langSlug 매핑
// AtCoder는 언어명이 매우 다양 ("C++ 23 (gcc 12.2)", "Python (3.11.4)" 등)
// 정확한 매칭보다 substring 검사가 안전
function mapAtcoderLang(langName: string): { langSlug: string; langName: string } {
  const lower = langName.toLowerCase();
  // 순서 중요: 더 구체적인 것 먼저
  if (lower.includes('python') || lower.includes('pypy')) return { langSlug: 'python3', langName };
  if (lower.includes('c++') || lower.includes('cpp')) return { langSlug: 'cpp', langName };
  if (lower.includes('java') && !lower.includes('javascript')) return { langSlug: 'java', langName };
  if (lower.includes('javascript') || lower.includes('node')) return { langSlug: 'javascript', langName };
  if (lower.includes('typescript')) return { langSlug: 'typescript', langName };
  if (lower.includes('rust')) return { langSlug: 'rust', langName };
  if (lower.includes('kotlin')) return { langSlug: 'kotlin', langName };
  if (lower.includes('swift')) return { langSlug: 'swift', langName };
  if (lower.includes('go ') || lower === 'go' || lower.startsWith('go ')) return { langSlug: 'go', langName };
  if (lower.includes('ruby')) return { langSlug: 'ruby', langName };
  if (lower.includes('scala')) return { langSlug: 'scala', langName };
  if (lower.includes('c#') || lower.includes('csharp')) return { langSlug: 'csharp', langName };
  if (lower.includes('php')) return { langSlug: 'php', langName };
  if (lower === 'c' || lower.startsWith('c (')) return { langSlug: 'c', langName };
  // fallback: 원문 그대로 (drillthrough 사용자가 lang select에서 수동 매칭 가능)
  return { langSlug: lower.replace(/[^\w]/g, '').slice(0, 20), langName };
}

const COMMON_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9,ko;q=0.8',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

export async function fetchAtcoderSubmission(
  contestId: string,
  taskId: string
): Promise<{ code: string; langSlug: string; langName: string }> {
  const { cookieHeader } = await getAtcoderCookies();
  if (!cookieHeader) {
    throw new Error(
      `AtCoder에 로그인되어 있지 않아요 — 헤더 AtCoder 버튼으로 임베드 윈도우 열고 로그인해주세요`
    );
  }

  // 1) submission 목록 페이지 — AC 상태 필터
  const listUrl = `${BASE_URL}/contests/${contestId}/submissions/me?f.Task=${encodeURIComponent(taskId)}&f.Status=AC`;
  const listRes = await fetch(listUrl, {
    headers: { ...COMMON_HEADERS, Cookie: cookieHeader },
    redirect: 'follow',
  });
  if (!listRes.ok) {
    if (listRes.status === 302 || listRes.status === 401 || listRes.status === 403) {
      throw new Error(
        `AtCoder 인증 만료 — 헤더 AtCoder 버튼으로 다시 로그인해주세요`
      );
    }
    throw new Error(`AtCoder submission 목록 응답 오류 (HTTP ${listRes.status})`);
  }

  // 로그인 redirect 감지 (302 follow했으니 final URL이 /login)
  if (listRes.url.includes('/login')) {
    throw new Error(
      `AtCoder 로그인 필요 — 헤더 AtCoder 버튼으로 임베드 윈도우 열고 로그인해주세요`
    );
  }

  const listHtml = await listRes.text();
  const $list = cheerio.load(listHtml);

  // submission 표에서 가장 최근 AC submission ID 추출
  // AtCoder submission table: <table class="table">
  //   <tbody>
  //     <tr>
  //       ...
  //       <td><a href="/contests/{contestId}/submissions/{submissionId}">Detail</a></td>
  //     </tr>
  let submissionId: string | null = null;
  let langName: string = '';

  $list('table tbody tr').each((_i, tr) => {
    if (submissionId) return; // 첫 행만
    const $tr = $list(tr);
    // submission detail link 찾기
    const detailLink = $tr.find(`a[href*="/contests/${contestId}/submissions/"]`).first();
    const href = detailLink.attr('href');
    if (href) {
      const m = href.match(/\/submissions\/(\d+)/);
      if (m) submissionId = m[1];
    }
    // 언어 컬럼 — 보통 4번째 td 또는 .text-center가 아닌 일반 td
    // 안전하게 모든 td 중 알려진 lang keyword 포함하는 것 탐색
    $tr.find('td').each((_j, td) => {
      const t = $list(td).text().trim();
      if (!langName && /python|c\+\+|java|rust|go|kotlin|swift|ruby|scala|javascript|typescript/i.test(t)) {
        langName = t;
      }
    });
  });

  if (!submissionId) {
    throw new Error(
      `${contestId} / ${taskId}에 Accepted submission이 없어요 — AtCoder에서 먼저 풀이를 통과시키거나 직접 코드를 붙여넣기 해주세요`
    );
  }

  // 2) submission detail 페이지
  const detailUrl = `${BASE_URL}/contests/${contestId}/submissions/${submissionId}`;
  const detailRes = await fetch(detailUrl, {
    headers: { ...COMMON_HEADERS, Cookie: cookieHeader },
  });
  if (!detailRes.ok) {
    throw new Error(`AtCoder submission 상세 응답 오류 (HTTP ${detailRes.status})`);
  }

  const detailHtml = await detailRes.text();
  const $detail = cheerio.load(detailHtml);

  // 코드 본문 — <pre id="submission-code">...</pre>
  // AtCoder는 highlight.js 적용 후 자식 span들이라 .text()로 평면화
  const codeEl = $detail('#submission-code').first();
  if (!codeEl.length) {
    throw new Error(`AtCoder submission 코드를 찾을 수 없어요 — 페이지 구조 변경 가능성`);
  }
  const code = codeEl.text();
  if (!code.trim()) {
    throw new Error(`AtCoder submission 코드가 비어있어요`);
  }

  // 언어가 목록에서 못 잡혔으면 detail 페이지에서 다시 시도
  if (!langName) {
    // <th>Language</th><td>C++ 23 (gcc 12.2)</td> 패턴
    $detail('th').each((_i, th) => {
      if (langName) return;
      const label = $detail(th).text().trim().toLowerCase();
      if (label === 'language' || label === '言語') {
        const td = $detail(th).next('td');
        langName = td.text().trim();
      }
    });
  }

  const { langSlug, langName: mappedLangName } = mapAtcoderLang(langName || 'unknown');

  return {
    code,
    langSlug,
    langName: mappedLangName,
  };
}

/**
 * AtCoder에 로그인되어 있는지 cookies 기반 검사.
 * Accepted 사전 확인 등 다른 데서도 활용.
 */
export async function isAtcoderLoggedIn(): Promise<boolean> {
  const { cookieHeader } = await getAtcoderCookies();
  return Boolean(cookieHeader);
}

/**
 * AtCoder Accepted 사전 확인 — 풀이 업로드 전 AC submission 있는지 가벼운 체크.
 * fetchAtcoderSubmission 코드 재사용 (목록 페이지 1번만 fetch, detail 안 함).
 *
 * @returns true = AC 있음 / false = AC 없음 / null = 확인 불가 (미로그인 등)
 */
export async function hasAtcoderAccepted(
  contestId: string,
  taskId: string
): Promise<boolean | null> {
  const { cookieHeader } = await getAtcoderCookies();
  if (!cookieHeader) return null; // 미로그인 — 확인 불가, skip 처리

  const listUrl = `${BASE_URL}/contests/${contestId}/submissions/me?f.Task=${encodeURIComponent(taskId)}&f.Status=AC`;
  try {
    const res = await fetch(listUrl, {
      headers: { ...COMMON_HEADERS, Cookie: cookieHeader },
      redirect: 'follow',
    });
    if (!res.ok) return null; // 인증 만료 등 — 사용자 마찰 회피 위해 skip
    if (res.url.includes('/login')) return null;

    const html = await res.text();
    // 빠른 휴리스틱: AC submission 링크 1개 이상 있으면 OK
    return new RegExp(`/contests/${contestId}/submissions/\\d+`).test(html);
  } catch {
    return null;
  }
}
