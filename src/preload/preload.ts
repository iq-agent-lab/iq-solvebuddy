// 메인 프로세스의 IPC를 renderer에 안전하게 노출

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  fetchProblem: (input: string) => ipcRenderer.invoke('fetch-problem', input),
  uploadSolution: (payload: {
    problem: unknown;
    translation: string;
    code: string;
    language: string;
  }) => ipcRenderer.invoke('upload-solution', payload),
  checkConfig: () => ipcRenderer.invoke('check-config'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: Record<string, string>) =>
    ipcRenderer.invoke('save-settings', settings),
  openLeetCode: (url?: string) => ipcRenderer.invoke('open-leetcode', url),
  getLeetCodeUrl: () => ipcRenderer.invoke('get-leetcode-url'),
  pullLeetCodeUrl: () => ipcRenderer.invoke('pull-leetcode-url'),
  openAtcoder: (url?: string) => ipcRenderer.invoke('open-atcoder', url),
  getAtcoderUrl: () => ipcRenderer.invoke('get-atcoder-url'),
  pullAtcoderUrl: () => ipcRenderer.invoke('pull-atcoder-url'),
  openCodeforces: (url?: string) => ipcRenderer.invoke('open-codeforces', url),
  getCodeforcesUrl: () => ipcRenderer.invoke('get-codeforces-url'),
  pullCodeforcesUrl: () => ipcRenderer.invoke('pull-codeforces-url'),
  openProgrammers: (url?: string) => ipcRenderer.invoke('open-programmers', url),
  getProgrammersUrl: () => ipcRenderer.invoke('get-programmers-url'),
  pullProgrammersUrl: () => ipcRenderer.invoke('pull-programmers-url'),
  fetchSubmission: (
    payload:
      | string  // legacy: titleSlug (LeetCode)
      | { platform: 'LeetCode'; titleSlug: string }
      | { platform: 'AtCoder'; contestId: string; taskId: string }
      | { platform: 'Codeforces'; contestId: string; index: string }
      | { platform: 'Programmers'; lessonId: string }
  ) => ipcRenderer.invoke('fetch-submission', payload),
  hasAcceptedSubmission: (
    payload:
      | string  // legacy: LeetCode titleSlug
      | { platform: 'LeetCode'; titleSlug: string }
      | { platform: 'AtCoder'; contestId: string; taskId: string }
      | { platform: 'Codeforces'; contestId: string; index: string }
  ) => ipcRenderer.invoke('has-accepted-submission', payload),
  confirmUploadWithoutAccepted: (
    payload: string | { platform: 'LeetCode' | 'AtCoder' | 'Codeforces'; label: string }
  ) => ipcRenderer.invoke('confirm-upload-without-accepted', payload),
  updateRetrospective: (payload: {
    problem: unknown;
    language: string;
    annotated: string;
  }) => ipcRenderer.invoke('update-retrospective', payload),
  backfillFromGithub: () => ipcRenderer.invoke('backfill-from-github'),
  migrateLegacyFolders: () => ipcRenderer.invoke('migrate-legacy-folders'),
  createRepo: () => ipcRenderer.invoke('create-repo'),
  verifyGithub: () => ipcRenderer.invoke('verify-github'),

  onFetchProgress: (cb: (stage: string) => void) => {
    const handler = (_e: unknown, stage: string) => cb(stage);
    ipcRenderer.on('fetch-progress', handler);
    return () => ipcRenderer.removeListener('fetch-progress', handler);
  },
  onUploadProgress: (cb: (stage: string) => void) => {
    const handler = (_e: unknown, stage: string) => cb(stage);
    ipcRenderer.on('upload-progress', handler);
    return () => ipcRenderer.removeListener('upload-progress', handler);
  },
  onPullProblem: (cb: (url: string) => void) => {
    const handler = (_e: unknown, url: string) => cb(url);
    ipcRenderer.on('pull-problem', handler);
    return () => ipcRenderer.removeListener('pull-problem', handler);
  },
  onTranslateStream: (cb: (html: string) => void) => {
    const handler = (_e: unknown, html: string) => cb(html);
    ipcRenderer.on('translate-stream', handler);
    return () => ipcRenderer.removeListener('translate-stream', handler);
  },
  onAnnotateStream: (cb: (html: string) => void) => {
    const handler = (_e: unknown, html: string) => cb(html);
    ipcRenderer.on('annotate-stream', handler);
    return () => ipcRenderer.removeListener('annotate-stream', handler);
  },
  onUpdateAvailable: (cb: (info: { tag: string; url: string }) => void) => {
    const handler = (_e: unknown, info: { tag: string; url: string }) => cb(info);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },
});
