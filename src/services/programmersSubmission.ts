// 프로그래머스 submission 자동 fetch — 임베드 윈도우의 ace editor 직접 추출
//
// LeetCode/AtCoder/CF와 다른 패턴:
//   - 공식 submission API 없음
//   - 문제 페이지 HTML에 사용자 마지막 작성 코드가 들어있지 않음 (서버 사이드 inject 없음)
//   - 사용자가 임베드 윈도우에서 코드 작성한 상태 그대로 ace editor에 있음
//
// 따라서 임베드 윈도우의 webContents에서 JS 실행 → ace editor.getValue() 직접 추출.
// 사용자 workflow:
//   1. 헤더 프로그래머스 버튼으로 임베드 열기
//   2. 로그인 + 문제 페이지로 이동
//   3. 코드 작성 (또는 통과)
//   4. 메인 윈도우 돌아와서 step-3 "↩ 프로그래머스에서 가져오기"
//   5. 임베드 윈도우의 ace editor 값 자동 fill
//
// 임베드 윈도우가 없거나 다른 페이지(홈 등)에 있으면 친절 에러.

import { BrowserWindow } from 'electron';

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

/**
 * 임베드 프로그래머스 윈도우의 현재 페이지에서 ace editor 값 + 언어 추출.
 *
 * @param win 임베드 윈도우 (없으면 null)
 * @param lessonId 현재 풀고 있는 lessonId — URL 검증용
 */
export async function fetchProgrammersSubmissionFromWindow(
  win: BrowserWindow | null,
  lessonId: string
): Promise<{ code: string; langSlug: string; langName: string }> {
  if (!win || win.isDestroyed()) {
    throw new Error(
      `프로그래머스 임베드 윈도우가 열려있지 않아요 — 헤더 프로그래머스 버튼으로 먼저 열고 ${lessonId} 문제 페이지로 이동해주세요`
    );
  }

  const currentUrl = win.webContents.getURL();
  // 현재 임베드가 해당 lessonId의 문제 페이지인지 검증
  // URL 형태: /learn/courses/30/lessons/{lessonId} 또는 ?... 등
  const urlPattern = new RegExp(`/learn/courses/\\d+/lessons/${lessonId}(?:[/?#]|$)`);
  if (!urlPattern.test(currentUrl)) {
    throw new Error(
      `현재 임베드 윈도우가 ${lessonId} 문제 페이지에 있지 않아요 — 임베드에서 해당 문제로 이동 후 다시 시도해주세요`
    );
  }

  // executeJavaScript로 ace editor 값 추출
  // ace.edit(el)은 같은 el에 두 번 호출해도 안전 (싱글톤 캐시)
  // 페이지가 ace 라이브러리 로드 안 했으면 빈 결과 → 친절 에러
  const extracted = (await win.webContents.executeJavaScript(
    `
    (function() {
      try {
        if (typeof window.ace === 'undefined') {
          return { code: '', mode: '', error: 'ace 미로드' };
        }
        // 페이지의 ace editor div — 여러 candidate 시도
        var candidates = [
          '.ace_editor',
          '#code-editor',
          '#editor',
          'div[id^="editor"]',
        ];
        var el = null;
        for (var i = 0; i < candidates.length; i++) {
          el = document.querySelector(candidates[i]);
          if (el) break;
        }
        if (!el) {
          return { code: '', mode: '', error: '에디터 DOM 없음' };
        }
        var editor = window.ace.edit(el);
        var session = editor.getSession();
        var code = editor.getValue() || '';
        var mode = session.getMode().$id || '';
        return { code: code, mode: mode, error: '' };
      } catch (e) {
        return { code: '', mode: '', error: String((e && e.message) || e) };
      }
    })()
    `,
    true
  )) as { code: string; mode: string; error: string };

  if (extracted.error) {
    throw new Error(
      `프로그래머스 ace editor 접근 실패: ${extracted.error}. 문제 페이지를 새로고침 후 다시 시도해주세요`
    );
  }
  if (!extracted.code.trim()) {
    throw new Error(
      `프로그래머스 ace editor가 비어있어요 — 코드를 작성한 상태에서 다시 시도해주세요`
    );
  }

  const langSlug = mapAceMode(extracted.mode || '');
  return {
    code: extracted.code,
    langSlug,
    langName: extracted.mode || langSlug,
  };
}
