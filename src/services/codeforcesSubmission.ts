// Codeforces submission 자동 fetch — 임베드 세션 cookies + HTML scraping
//
// CF API(`/api/user.status`)는 submission 메타데이터만 — 코드 본문은 페이지 scraping 필요.
// `/contest/{contestId}/my` 페이지에 사용자 제출 목록 (로그인 필요).
//
// 흐름:
//   1) `/contest/{contestId}/my` HTML fetch (browserFetch — Cloudflare + cookies 자동)
//   2) submission table에서 `problem index` 매칭 + `Accepted` verdict인 첫 행 ID 추출
//   3) `/contest/{contestId}/submission/{submissionId}` detail 페이지 fetch
//   4) `<pre id="program-source-text">` 본문 추출
//      - 일부 페이지는 `<ol><li>` 라인 wrapping — li.text() join \n 처리
//
// 인증 필요 — 미로그인 시 페이지가 login form으로 변환됨 (감지해서 친절 에러).
//
// 같은 partition 'persist:codeforces' — browserFetch와 cookies 공유.
// 임베드 윈도우에서 한 번 로그인하면 양쪽 모두 작동.

import * as cheerio from 'cheerio';
import { fetchHtmlViaBrowser } from './browserFetch';

const BASE_URL = 'https://codeforces.com';
const PARTITION = 'persist:codeforces';

// CF language 표시명 → 우리 langSlug 매핑
// CF: "GNU C++17 (64)", "Python 3", "PyPy 3-64", "Java 11", "Kotlin 1.7" 등
function mapCfLang(langName: string): { langSlug: string; langName: string } {
  const lower = langName.toLowerCase();
  // 순서 중요 — 더 구체적인 패턴 먼저
  if (lower.includes('pypy') || lower.includes('python')) return { langSlug: 'python3', langName };
  if (lower.includes('c++') || lower.includes('cpp')) return { langSlug: 'cpp', langName };
  if (lower.includes('java') && !lower.includes('javascript')) return { langSlug: 'java', langName };
  if (lower.includes('kotlin')) return { langSlug: 'kotlin', langName };
  if (lower.includes('rust')) return { langSlug: 'rust', langName };
  if (lower === 'go' || lower.startsWith('go ') || lower.includes(' go ')) return { langSlug: 'go', langName };
  if (lower.includes('c#') || lower.includes('csharp') || lower.includes('mono c#')) return { langSlug: 'csharp', langName };
  if (lower.includes('javascript') || lower.includes('node')) return { langSlug: 'javascript', langName };
  if (lower.includes('typescript')) return { langSlug: 'typescript', langName };
  if (lower.includes('ruby')) return { langSlug: 'ruby', langName };
  if (lower.includes('scala')) return { langSlug: 'scala', langName };
  if (lower.includes('php')) return { langSlug: 'php', langName };
  if (lower.includes('swift')) return { langSlug: 'swift', langName };
  if (lower === 'c' || lower.startsWith('gnu c ') || lower.startsWith('c (') || lower.startsWith('c11')) {
    return { langSlug: 'c', langName };
  }
  return { langSlug: lower.replace(/[^\w]/g, '').slice(0, 20), langName };
}

// 페이지가 미로그인 상태인지 감지 — CF는 미로그인 시 페이지 상단에 "Enter | Register" 표시
function isLoggedOut(html: string): boolean {
  // 페이지 헤더의 로그인/등록 링크 패턴
  return /href="\/enter[^"]*"\s+[^>]*>\s*Enter\s*<\/a>/i.test(html);
}

// submission detail 페이지에서 코드 추출
// CF는 `<pre id="program-source-text">` 안에 코드. 일부 페이지는 `<ol><li>` 라인 wrapping
function extractCode($: cheerio.CheerioAPI): string {
  const $pre = $('#program-source-text').first();
  if (!$pre.length) return '';

  const $items = $pre.find('ol > li, li');
  if ($items.length > 0) {
    // line별 wrapping — text() join \n
    return $items
      .map((_i, el) => $(el).text())
      .get()
      .join('\n');
  }

  // plain text (가장 흔한 케이스)
  return $pre.text();
}

export async function fetchCodeforcesSubmission(
  contestId: string,
  index: string
): Promise<{ code: string; langSlug: string; langName: string }> {
  // 1) my submissions 페이지
  const myUrl = `${BASE_URL}/contest/${contestId}/my`;

  let listHtml: string;
  try {
    listHtml = await fetchHtmlViaBrowser(myUrl, PARTITION);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Codeforces submission 목록 로드 실패: ${msg}`);
  }

  if (isLoggedOut(listHtml)) {
    throw new Error(
      `Codeforces에 로그인되어 있지 않아요 — 헤더 Codeforces 버튼으로 임베드 윈도우 열고 로그인해주세요`
    );
  }

  const $list = cheerio.load(listHtml);

  // 2) submission table에서 problem index + Accepted 매칭하는 첫 행 ID 추출
  // CF table.status-frame-datatable, 각 row에 data-submission-id 속성
  let submissionId: string | null = null;
  let langName: string = '';

  $list('table.status-frame-datatable tr').each((_i, tr) => {
    if (submissionId) return;
    const $tr = $list(tr);
    const subId = $tr.attr('data-submission-id');
    if (!subId) return;

    // 문제 컬럼: a[href*="/contest/{contestId}/problem/{index}"]
    // 또는 problem 컬럼 텍스트가 "A. Title" 형식 시작
    const problemLink = $tr.find(`a[href*="/contest/${contestId}/problem/${index}"]`);
    const problemText = $tr.find('td.id-cell, td').filter((_j, td) => {
      const t = $list(td).text().trim();
      return new RegExp(`^${index}\\.\\s+`, 'i').test(t);
    });
    if (!problemLink.length && !problemText.length) return;

    // verdict 컬럼: span.verdict-accepted 또는 'Accepted' 텍스트
    const verdictAccepted =
      $tr.find('span.verdict-accepted').length > 0 ||
      $tr.find('.status-cell, td').filter((_j, td) =>
        /\baccepted\b/i.test($list(td).text())
      ).length > 0;
    if (!verdictAccepted) return;

    submissionId = subId;

    // 언어 컬럼 — verdict 셀 이전, problem 셀 다음 td
    // 안전하게 모든 td 순회하며 언어명 패턴 검사
    $tr.find('td').each((_j, td) => {
      if (langName) return;
      const t = $list(td).text().trim();
      if (
        /(?:c\+\+|cpp|python|pypy|java|kotlin|rust|\bgo\b|ruby|scala|c#|csharp|javascript|node|typescript|swift|php|\bc11\b|gnu c)/i.test(
          t
        ) &&
        t.length < 50  // 언어 셀은 짧음 ("GNU C++17", "Python 3" 등)
      ) {
        langName = t;
      }
    });
  });

  if (!submissionId) {
    throw new Error(
      `Codeforces ${contestId}${index}에 Accepted submission이 없어요 — 먼저 풀이를 제출하거나 직접 코드를 붙여넣기 해주세요`
    );
  }

  // 3) submission detail 페이지에서 코드 추출
  const detailUrl = `${BASE_URL}/contest/${contestId}/submission/${submissionId}`;
  let detailHtml: string;
  try {
    detailHtml = await fetchHtmlViaBrowser(detailUrl, PARTITION);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Codeforces submission 상세 로드 실패: ${msg}`);
  }

  const $detail = cheerio.load(detailHtml);

  const code = extractCode($detail);
  if (!code.trim()) {
    throw new Error(
      `Codeforces submission 코드를 찾을 수 없어요 — 페이지 구조 변경 또는 권한 없음`
    );
  }

  // 언어가 목록에서 못 잡혔으면 detail 페이지에서 다시 시도
  if (!langName) {
    // detail 페이지엔 보통 "Language" 라벨 + 값. CF는 보통 .datatable에 표시
    $detail('th, .property-title').each((_i, el) => {
      if (langName) return;
      const label = $detail(el).text().trim().toLowerCase();
      if (label === 'language' || label === 'lang') {
        const next = $detail(el).next();
        langName = next.text().trim();
      }
    });
  }

  return {
    code,
    ...mapCfLang(langName || 'unknown'),
  };
}
