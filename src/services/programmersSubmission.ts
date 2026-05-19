// 프로그래머스 submission 자동 fetch — 2단계 fallback:
//
// 1순위: 임베드 윈도우의 ace editor 직접 추출 (가장 정확 — 사용자가 작성 중인 코드 그대로)
//        webContents.executeJavaScript로 ace.edit(el).getValue() 호출
//
// 2순위: 페이지 HTML에서 사용자 마지막 코드 추출 (임베드 없거나 다른 페이지일 때)
//        로그인 cookies로 fetch하면 페이지 HTML에 사용자 마지막 작성 코드가 inject됨
//        — programmers.ts의 fetchProgrammersHtml + extractCodeSnippets 재사용
//
// LeetCode/AtCoder/CF와 다른 점:
//   - 공식 submission API 없음
//   - "통과한" 코드와 "마지막 작성" 코드의 구분 어려움 (프로그래머스는 채점 기록 페이지 따로 있지만 비공식 API)
//   - 단순화: 마지막 작성 코드(통과 여부 무관)를 그대로 가져옴

import { BrowserWindow } from 'electron';
import * as cheerio from 'cheerio';
import { session } from 'electron';

// ace editor의 mode ID → 우리 langSlug 매핑
// 프로그래머스 ace mode 예: "ace/mode/python", "ace/mode/java", "ace/mode/c_cpp"
function mapAceMode(aceMode: string): string {
  const m = aceMode.match(/ace\/mode\/(.+)/);
  if (!m) return aceMode;
  const mode = m[1].toLowerCase();
  if (mode === 'python' || mode === 'python3') return 'python3';
  if (mode === 'c_cpp' || mode === 'cpp' || mode === 'c++') return 'cpp';
  if (mode === 'java') return 'java';
  if (mode === 'javascript') return 'javascript';
  if (mode === 'typescript') return 'typescript';
  if (mode === 'kotlin') return 'kotlin';
  if (mode === 'swift') return 'swift';
  if (mode === 'golang' || mode === 'go') return 'go';
  if (mode === 'ruby') return 'ruby';
  if (mode === 'scala') return 'scala';
  if (mode === 'csharp' || mode === 'c#') return 'csharp';
  if (mode === 'rust') return 'rust';
  if (mode === 'mysql' || mode === 'sql' || mode === 'pgsql' || mode === 'sqlserver') return 'mysql';
  if (mode === 'c') return 'c';
  return mode;
}

// 페이지 HTML fetch — programmers.ts와 동일 cookies + textarea 추출 패턴
// 임베드 윈도우 없거나 ace editor 비었을 때 fallback
async function fetchPageCodeViaCookies(
  lessonId: string
): Promise<{ code: string; langSlug: string; langName: string } | null> {
  try {
    const ses = session.fromPartition('persist:programmers');
    const cookies = await ses.cookies.get({ domain: '.programmers.co.kr' });
    if (cookies.length === 0) {
      const alt = await ses.cookies.get({ domain: 'programmers.co.kr' });
      cookies.push(...alt);
    }
    if (cookies.length === 0) return null;
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

    const url = `https://school.programmers.co.kr/learn/courses/30/lessons/${lessonId}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Cookie: cookieHeader,
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);

    const candidates = [
      'textarea#code-editor',
      'textarea[name="code"]',
      'textarea.code',
      'textarea#code',
    ];
    let code = '';
    for (const sel of candidates) {
      const t = $(sel).first().text();
      if (t && t.trim()) {
        code = t;
        break;
      }
    }
    if (!code.trim()) return null;

    // lang heuristic
    const lower = code.trim();
    let langSlug = 'python3';
    let langName = 'Python3';
    if (/^\s*#include\s*<bits\/stdc\+\+/.test(lower) || /using\s+namespace\s+std\b/.test(lower) || /vector\s*</.test(lower)) {
      langSlug = 'cpp';
      langName = 'C++';
    } else if (/^\s*#include\s*<\w+\.h>/m.test(lower)) {
      langSlug = 'c';
      langName = 'C';
    } else if (/^\s*def\s+solution/m.test(lower)) {
      langSlug = 'python3';
      langName = 'Python3';
    } else if (/class\s+Solution\b/.test(lower) || /public\s+class/.test(lower)) {
      langSlug = 'java';
      langName = 'Java';
    } else if (/^\s*function\s+solution/m.test(lower)) {
      langSlug = 'javascript';
      langName = 'JavaScript';
    } else if (/^\s*fun\s+solution/m.test(lower)) {
      langSlug = 'kotlin';
      langName = 'Kotlin';
    } else if (/^\s*SELECT\b/im.test(lower) || /^\s*WITH\b/im.test(lower)) {
      langSlug = 'mysql';
      langName = 'SQL';
    }
    return { code, langSlug, langName };
  } catch {
    return null;
  }
}

/**
 * 프로그래머스 submission 추출 — 2단계 fallback.
 *
 * @param win 임베드 윈도우 (없으면 cookies fallback)
 * @param lessonId 현재 풀고 있는 lessonId
 */
export async function fetchProgrammersSubmissionFromWindow(
  win: BrowserWindow | null,
  lessonId: string
): Promise<{ code: string; langSlug: string; langName: string }> {
  // 1순위: 임베드 윈도우의 ace editor 직접 추출 (해당 lessonId 페이지 떠있어야)
  const tryAceEditor = async (): Promise<{ code: string; langSlug: string; langName: string } | null> => {
    if (!win || win.isDestroyed()) return null;
    const currentUrl = win.webContents.getURL();
    const urlPattern = new RegExp(`/learn/courses/\\d+/lessons/${lessonId}(?:[/?#]|$)`);
    if (!urlPattern.test(currentUrl)) return null;

    try {
      const extracted = (await win.webContents.executeJavaScript(
        `
        (function() {
          try {
            if (typeof window.ace === 'undefined') {
              return { code: '', mode: '', error: 'ace 미로드' };
            }
            var candidates = ['.ace_editor', '#code-editor', '#editor', 'div[id^="editor"]'];
            var el = null;
            for (var i = 0; i < candidates.length; i++) {
              el = document.querySelector(candidates[i]);
              if (el) break;
            }
            if (!el) return { code: '', mode: '', error: '에디터 DOM 없음' };
            var editor = window.ace.edit(el);
            var sess = editor.getSession();
            var code = editor.getValue() || '';
            var mode = sess.getMode().$id || '';
            return { code: code, mode: mode, error: '' };
          } catch (e) {
            return { code: '', mode: '', error: String((e && e.message) || e) };
          }
        })()
        `,
        true
      )) as { code: string; mode: string; error: string };
      if (extracted.error || !extracted.code.trim()) return null;
      const langSlug = mapAceMode(extracted.mode || '');
      return { code: extracted.code, langSlug, langName: extracted.mode || langSlug };
    } catch {
      return null;
    }
  };

  const aceResult = await tryAceEditor();
  if (aceResult) return aceResult;

  // 2순위: 페이지 HTML cookies fetch (로그인 + 마지막 작성 코드 inject)
  const pageResult = await fetchPageCodeViaCookies(lessonId);
  if (pageResult) return pageResult;

  // 둘 다 실패 — 가능한 원인별 친절 에러
  if (!win || win.isDestroyed()) {
    throw new Error(
      `프로그래머스 코드를 가져올 수 없어요. 헤더 프로그래머스 버튼으로 임베드 윈도우 열고 ${lessonId} 문제 페이지에서 코드 작성 후 다시 시도해주세요 (또는 임베드에서 한 번 로그인이라도 해주세요 — 페이지 HTML에서 마지막 코드 추출 가능)`
    );
  }
  const currentUrl = win.webContents.getURL();
  const urlPattern = new RegExp(`/learn/courses/\\d+/lessons/${lessonId}(?:[/?#]|$)`);
  if (!urlPattern.test(currentUrl)) {
    throw new Error(
      `임베드 윈도우가 ${lessonId} 문제 페이지에 없고 cookies fetch도 실패했어요. 임베드에서 ${lessonId} 페이지로 이동 후 다시 시도해주세요`
    );
  }
  throw new Error(
    `프로그래머스 ace editor 또는 페이지에서 코드를 찾지 못했어요 — 임베드에서 코드 작성 후 다시 시도하거나, 통과한 풀이가 있다면 페이지 새로고침 후 재시도`
  );
}
