// Renderer에서 호출하는 IPC 핸들러

import { ipcMain, WebContents, dialog, BrowserWindow, shell } from 'electron';
import { fetchAndTranslate, annotateAndUpload } from '../services/pipeline';
import { resetTranslatorClient } from '../services/translator';
import { resetAnnotatorClient } from '../services/annotator';
import { resetGithubClient, createRepoIfMissing, verifyConnection, fetchIndexFromGithub, updateRetrospective, migrateLegacyLeetCodeFolders } from '../services/github';
import { fetchRecentAcceptedSubmission, hasAcceptedSubmission } from '../services/leetcode';
import { fetchAtcoderSubmission, hasAtcoderAccepted } from '../services/atcoderSubmission';
import { fetchCodeforcesSubmission, hasCodeforcesAccepted } from '../services/codeforcesSubmission';
import { fetchProgrammersSubmissionFromWindow } from '../services/programmersSubmission';
import { Problem } from '../types';
import { renderMarkdown } from '../services/markdown';
import { getSettingsView, saveSettings, isKeychainAvailable, AppSettings } from './settings';

// streaming snapshot을 markdown → HTML로 변환해서 renderer에 push.
// throttle (120ms) + 순차 처리(renderPromise chain)로 race / 부하 회피.
function makeStreamForwarder(channel: string, sender: WebContents) {
  let pending = '';
  let timer: NodeJS.Timeout | null = null;
  let renderPromise: Promise<void> = Promise.resolve();

  const flush = () => {
    timer = null;
    const md = pending;
    renderPromise = renderPromise.then(async () => {
      if (!md) return;
      try {
        const html = await renderMarkdown(md);
        if (!sender.isDestroyed()) sender.send(channel, html);
      } catch {
        // marked가 incomplete markdown에서 throw하면 무시 (다음 flush에서 재시도)
      }
    });
  };

  const onStream = (snapshot: string) => {
    pending = snapshot;
    if (timer) return;
    timer = setTimeout(flush, 120);
  };

  const cleanup = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return { onStream, cleanup };
}

let leetcodeOpener: ((url?: string) => void) | null = null;
let leetcodeUrlGetter: (() => string | null) | null = null;
let pullCurrentUrl: (() => void) | null = null;
let atcoderOpener: ((url?: string) => void) | null = null;
let atcoderUrlGetter: (() => string | null) | null = null;
let pullCurrentAtcoderUrl: (() => void) | null = null;
let codeforcesOpener: ((url?: string) => void) | null = null;
let codeforcesUrlGetter: (() => string | null) | null = null;
let pullCurrentCodeforcesUrl: (() => void) | null = null;
let programmersOpener: ((url?: string) => void) | null = null;
let programmersUrlGetter: (() => string | null) | null = null;
let pullCurrentProgrammersUrl: (() => void) | null = null;
let programmersWindowGetter: (() => BrowserWindow | null) | null = null;
let shortcutGetter: (() => string | null) | null = null;

export function setLeetCodeOpener(fn: (url?: string) => void) {
  leetcodeOpener = fn;
}

export function setLeetCodeUrlGetter(fn: () => string | null) {
  leetcodeUrlGetter = fn;
}

export function setPullCurrentLeetCodeUrl(fn: () => void) {
  pullCurrentUrl = fn;
}

export function setAtcoderOpener(fn: (url?: string) => void) {
  atcoderOpener = fn;
}

export function setAtcoderUrlGetter(fn: () => string | null) {
  atcoderUrlGetter = fn;
}

export function setPullCurrentAtcoderUrl(fn: () => void) {
  pullCurrentAtcoderUrl = fn;
}

export function setCodeforcesOpener(fn: (url?: string) => void) {
  codeforcesOpener = fn;
}

export function setCodeforcesUrlGetter(fn: () => string | null) {
  codeforcesUrlGetter = fn;
}

export function setPullCurrentCodeforcesUrl(fn: () => void) {
  pullCurrentCodeforcesUrl = fn;
}

export function setProgrammersOpener(fn: (url?: string) => void) {
  programmersOpener = fn;
}

export function setProgrammersUrlGetter(fn: () => string | null) {
  programmersUrlGetter = fn;
}

export function setPullCurrentProgrammersUrl(fn: () => void) {
  pullCurrentProgrammersUrl = fn;
}

// programmersSubmission이 임베드 윈도우에 webContents.executeJavaScript 하기 위해
export function setProgrammersWindowGetter(fn: () => BrowserWindow | null) {
  programmersWindowGetter = fn;
}

export function setShortcutGetter(fn: () => string | null) {
  shortcutGetter = fn;
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function getStatus(err: unknown): number | null {
  const e = err as { status?: number };
  return typeof e?.status === 'number' ? e.status : null;
}

export function registerIpcHandlers() {
  ipcMain.handle('fetch-problem', async (event, input: string) => {
    const send = (stage: string) => event.sender.send('fetch-progress', stage);
    const { onStream, cleanup } = makeStreamForwarder('translate-stream', event.sender);
    try {
      const result = await fetchAndTranslate(input, send, onStream);
      cleanup();
      return { ok: true, ...result };
    } catch (err) {
      cleanup();
      return { ok: false, error: toErrorMessage(err), status: getStatus(err) };
    }
  });

  ipcMain.handle('upload-solution', async (event, payload) => {
    const send = (stage: string) => event.sender.send('upload-progress', stage);
    const { onStream, cleanup } = makeStreamForwarder('annotate-stream', event.sender);
    try {
      const result = await annotateAndUpload(payload, send, onStream);
      cleanup();
      return { ok: true, ...result };
    } catch (err) {
      cleanup();
      return { ok: false, error: toErrorMessage(err), status: getStatus(err) };
    }
  });

  ipcMain.handle('create-repo', async () => {
    try {
      const result = await createRepoIfMissing();
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: toErrorMessage(err), status: getStatus(err) };
    }
  });

  ipcMain.handle('check-config', async () => {
    return {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      github: !!(
        process.env.GITHUB_TOKEN &&
        process.env.GITHUB_OWNER &&
        process.env.GITHUB_REPO
      ),
      owner: process.env.GITHUB_OWNER || '',
      repo: process.env.GITHUB_REPO || '',
      shortcut: shortcutGetter ? shortcutGetter() : null,
      keychain: isKeychainAvailable(),
    };
  });

  // ── 설정 (시크릿은 노출하지 않고 hasXxx 플래그로) ──
  ipcMain.handle('get-settings', async () => {
    return getSettingsView();
  });

  // ── GitHub 연결 진단 (토큰 + 레포 존재 확인) ──
  ipcMain.handle('verify-github', async () => {
    try {
      const result = await verifyConnection();
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: toErrorMessage(err), status: getStatus(err) };
    }
  });

  // ── 설정 저장 ──
  ipcMain.handle('save-settings', async (_event, settings: AppSettings) => {
    try {
      await saveSettings(settings);
      // 클라이언트 캐시 무효화 → 새 키 즉시 반영
      resetTranslatorClient();
      resetAnnotatorClient();
      resetGithubClient();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: toErrorMessage(err) };
    }
  });

  // ── LeetCode embedded 윈도우 열기 ──
  ipcMain.handle('open-leetcode', async (_event, url?: string) => {
    if (leetcodeOpener) leetcodeOpener(url);
    return { ok: true };
  });

  // ── AtCoder embedded 윈도우 열기 (v1.4+ submission 자동 fetch 위해) ──
  ipcMain.handle('open-atcoder', async (_event, url?: string) => {
    if (atcoderOpener) atcoderOpener(url);
    return { ok: true };
  });

  // ── Codeforces embedded 윈도우 열기 (v1.5+ submission 자동 fetch 위해) ──
  // partition 'persist:codeforces' — browserFetch와 cookies 공유 (한 번 로그인하면 양쪽 모두 활용)
  ipcMain.handle('open-codeforces', async (_event, url?: string) => {
    if (codeforcesOpener) codeforcesOpener(url);
    return { ok: true };
  });

  // ── Programmers embedded 윈도우 열기 (v1.6+ submission 자동 fetch + Lv 3+ 로그인 필요 문제) ──
  // partition 'persist:programmers' — programmers.ts의 fetchProgrammersHtml과 cookies 공유
  ipcMain.handle('open-programmers', async (_event, url?: string) => {
    if (programmersOpener) programmersOpener(url);
    return { ok: true };
  });

  // ── 4개 플랫폼 모두 임베드 — 외부 브라우저 fallback 채널은 noop ──
  // (legacy 호환을 위해 채널은 유지하되 사용처 없음)
  ipcMain.handle('open-platform-site', async () => {
    return { ok: false, error: '모든 플랫폼이 v1.6부터 임베드 윈도우로 동작합니다' };
  });

  // ── 임베드 LeetCode 윈도우의 현재 URL 조회 (메인 input '가져오기' 보조 버튼용) ──
  ipcMain.handle('get-leetcode-url', async () => {
    const url = leetcodeUrlGetter ? leetcodeUrlGetter() : null;
    return { ok: !!url, url };
  });

  // ── 임베드 LeetCode 윈도우 URL을 메인 input으로 끌어오기 (자동 fetch 트리거) ──
  ipcMain.handle('pull-leetcode-url', async () => {
    if (pullCurrentUrl) {
      pullCurrentUrl();
      return { ok: true };
    }
    return { ok: false };
  });

  // ── 임베드 AtCoder 윈도우 URL 조회 ──
  ipcMain.handle('get-atcoder-url', async () => {
    const url = atcoderUrlGetter ? atcoderUrlGetter() : null;
    return { ok: !!url, url };
  });

  // ── 임베드 AtCoder 윈도우 URL을 메인 input으로 끌어오기 ──
  ipcMain.handle('pull-atcoder-url', async () => {
    if (pullCurrentAtcoderUrl) {
      pullCurrentAtcoderUrl();
      return { ok: true };
    }
    return { ok: false };
  });

  // ── 임베드 Codeforces 윈도우 URL 조회 ──
  ipcMain.handle('get-codeforces-url', async () => {
    const url = codeforcesUrlGetter ? codeforcesUrlGetter() : null;
    return { ok: !!url, url };
  });

  // ── 임베드 Codeforces 윈도우 URL을 메인 input으로 끌어오기 ──
  ipcMain.handle('pull-codeforces-url', async () => {
    if (pullCurrentCodeforcesUrl) {
      pullCurrentCodeforcesUrl();
      return { ok: true };
    }
    return { ok: false };
  });

  // ── 임베드 Programmers 윈도우 URL 조회 ──
  ipcMain.handle('get-programmers-url', async () => {
    const url = programmersUrlGetter ? programmersUrlGetter() : null;
    return { ok: !!url, url };
  });

  // ── 임베드 Programmers 윈도우 URL을 메인 input으로 끌어오기 ──
  ipcMain.handle('pull-programmers-url', async () => {
    if (pullCurrentProgrammersUrl) {
      pullCurrentProgrammersUrl();
      return { ok: true };
    }
    return { ok: false };
  });

  // ── 플랫폼별 submission 자동 가져오기 (LeetCode/AtCoder) ──
  // payload 형태로 일반화 — 플랫폼별 다른 식별자 (titleSlug vs contestId+taskId) 수용
  ipcMain.handle('fetch-submission', async (_event, payload: unknown) => {
    try {
      // 하위 호환: 옛 호출 형태 fetchSubmission(titleSlug: string)도 수용
      if (typeof payload === 'string') {
        const result = await fetchRecentAcceptedSubmission(payload);
        return { ok: true, ...result };
      }
      const p = payload as
        | { platform: 'LeetCode'; titleSlug: string }
        | { platform: 'AtCoder'; contestId: string; taskId: string }
        | { platform: 'Codeforces'; contestId: string; index: string }
        | { platform: 'Programmers'; lessonId: string };
      if (p.platform === 'AtCoder') {
        const result = await fetchAtcoderSubmission(p.contestId, p.taskId);
        return { ok: true, ...result };
      }
      if (p.platform === 'Codeforces') {
        const result = await fetchCodeforcesSubmission(p.contestId, p.index);
        return { ok: true, ...result };
      }
      if (p.platform === 'Programmers') {
        const win = programmersWindowGetter ? programmersWindowGetter() : null;
        const result = await fetchProgrammersSubmissionFromWindow(win, p.lessonId);
        return { ok: true, ...result };
      }
      // default: LeetCode
      const result = await fetchRecentAcceptedSubmission(
        (p as { titleSlug: string }).titleSlug
      );
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: toErrorMessage(err) };
    }
  });

  // ── GitHub 풀이 레포의 root README 인덱스 backfill ──
  // 다른 디바이스 / v0.5 이전 풀이를 localStorage stats에 가져오는 용도
  ipcMain.handle('backfill-from-github', async () => {
    try {
      const result = await fetchIndexFromGithub();
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: toErrorMessage(err) };
    }
  });

  // ── 업로드 직전 Accepted submission 확인 (LC / AC / CF) ──
  // true = Accepted 있음, false = 없음, null = 확인 불가 (미로그인/API fail — silent skip)
  // payload union — 플랫폼별 식별자 다름. PG는 호출 안 함 (사전 확인 미지원)
  // string 인자도 backward-compat (legacy LeetCode 호출)
  ipcMain.handle('has-accepted-submission', async (_event, payload: unknown) => {
    try {
      if (typeof payload === 'string') {
        const accepted = await hasAcceptedSubmission(payload);
        return { accepted };
      }
      const p = payload as
        | { platform: 'LeetCode'; titleSlug: string }
        | { platform: 'AtCoder'; contestId: string; taskId: string }
        | { platform: 'Codeforces'; contestId: string; index: string };
      if (p.platform === 'AtCoder') {
        const accepted = await hasAtcoderAccepted(p.contestId, p.taskId);
        return { accepted };
      }
      if (p.platform === 'Codeforces') {
        const accepted = await hasCodeforcesAccepted(p.contestId, p.index);
        return { accepted };
      }
      // default: LeetCode
      const accepted = await hasAcceptedSubmission(
        (p as { titleSlug: string }).titleSlug
      );
      return { accepted };
    } catch {
      return { accepted: null };
    }
  });

  // ── Accepted 없을 때 사용자에게 native confirm — "그래도 업로드?" ──
  // 플랫폼별 문제 ID 표시. dialog.showMessageBox + "다시 묻지 않음" 체크박스.
  ipcMain.handle('confirm-upload-without-accepted', async (event, payload: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { proceed: false, dontAskAgain: false };

    // payload — string (legacy LC titleSlug) 또는 { platform, label } 형태
    let problemLabel = '';
    let platformLabel = '원문 사이트';
    if (typeof payload === 'string') {
      problemLabel = payload;
      platformLabel = 'LeetCode';
    } else if (payload && typeof payload === 'object') {
      const p = payload as { platform?: string; label?: string };
      problemLabel = p.label || '';
      if (p.platform === 'AtCoder') platformLabel = 'AtCoder';
      else if (p.platform === 'Codeforces') platformLabel = 'Codeforces';
      else if (p.platform === 'LeetCode') platformLabel = 'LeetCode';
    }

    const result = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['취소', '그래도 업로드'],
      defaultId: 0,
      cancelId: 0,
      title: `${platformLabel} 통과 기록이 없어요`,
      message: `이 문제("${problemLabel}")에 Accepted submission이 없어요.`,
      detail:
        'Solve Buddy는 통과한 풀이를 학습 자산화하는 도구입니다.\n\n' +
        `${platformLabel}에서 먼저 풀이를 통과시키는 게 권장 흐름이지만, ` +
        '본인이 다른 곳에서 풀었거나 의도된 업로드라면 그대로 진행 가능합니다.\n\n' +
        '풀이 레포 관리는 사용자 자유.',
      checkboxLabel: '다시 묻지 않음 (설정에서 언제든 다시 켤 수 있음)',
      checkboxChecked: false,
    });
    return {
      proceed: result.response === 1,
      dontAskAgain: !!result.checkboxChecked,
    };
  });

  // ── v0.9 legacy 풀이 자동 마이그레이션 (root NNNN-slug → LeetCode/NNNN-slug) ──
  ipcMain.handle('migrate-legacy-folders', async () => {
    try {
      const result = await migrateLegacyLeetCodeFolders();
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: toErrorMessage(err), status: getStatus(err) };
    }
  });

  // ── 회고 사후 편집 — RETROSPECTIVE.md만 새 commit ──
  ipcMain.handle(
    'update-retrospective',
    async (
      _event,
      payload: { problem: Problem; language: string; annotated: string }
    ) => {
      try {
        const result = await updateRetrospective(payload);
        return { ok: true, ...result };
      } catch (err) {
        return { ok: false, error: toErrorMessage(err), status: getStatus(err) };
      }
    }
  );
}
