// Renderer에서 호출하는 IPC 핸들러

import { ipcMain, WebContents, dialog, BrowserWindow } from 'electron';
import { fetchAndTranslate, annotateAndUpload } from '../services/pipeline';
import { resetTranslatorClient } from '../services/translator';
import { resetAnnotatorClient } from '../services/annotator';
import { resetGithubClient, createRepoIfMissing, verifyConnection, fetchIndexFromGithub, updateRetrospective, migrateLegacyLeetCodeFolders } from '../services/github';
import { fetchRecentAcceptedSubmission, hasAcceptedSubmission } from '../services/leetcode';
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

  // ── 임베드 LeetCode 세션으로 이 문제의 최근 Accepted submission 자동 가져오기 ──
  ipcMain.handle('fetch-submission', async (_event, titleSlug: string) => {
    try {
      const result = await fetchRecentAcceptedSubmission(titleSlug);
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

  // ── 업로드 직전 LeetCode Accepted submission 확인 ──
  // true = Accepted 있음, false = 없음(submission 0 또는 fail만 있음),
  // null = 확인 불가 (로그인/네트워크/API fail — silent skip)
  ipcMain.handle('has-accepted-submission', async (_event, titleSlug: string) => {
    const accepted = await hasAcceptedSubmission(titleSlug);
    return { accepted };
  });

  // ── Accepted 없을 때 사용자에게 native confirm — "그래도 업로드?" ──
  // dialog.showMessageBox 사용 — Electron native modal (custom HTML 대비 단순/안정).
  // "다시 묻지 않음" 체크박스 추가 — true면 renderer가 settings 토글 OFF로 전환.
  ipcMain.handle('confirm-upload-without-accepted', async (event, titleSlug: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { proceed: false, dontAskAgain: false };
    const result = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['취소', '그래도 업로드'],
      defaultId: 0,
      cancelId: 0,
      title: 'LeetCode Accepted submission이 없어요',
      message: `이 문제("${titleSlug}")에 Accepted submission이 없어요.`,
      detail:
        'iq-solvebuddy는 통과한 풀이를 학습 자산화하는 도구입니다.\n\n' +
        'LeetCode에서 먼저 풀이를 통과시키는 게 권장 흐름이지만, ' +
        '본인이 다른 곳에서 풀었거나 의도된 업로드라면 그대로 진행 가능합니다.\n\n' +
        '풀이 레포 관리는 사용자 자유.',
      checkboxLabel: '다시 묻지 않음 (설정에서 언제든 다시 켤 수 있음)',
      checkboxChecked: false,
    });
    return {
      proceed: result.response === 1, // 1 = "그래도 업로드"
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
