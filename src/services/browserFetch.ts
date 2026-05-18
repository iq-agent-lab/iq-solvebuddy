// BrowserWindow 기반 HTML fetch — Cloudflare bot protection 우회용
//
// 일반 node fetch는 User-Agent + IP 기반으로 Cloudflare가 차단 (HTTP 403).
// Electron BrowserWindow는 진짜 Chromium이라 JS 챌린지 통과 + 모든 fetch 헤더 자연스러움.
//
// 비용: 첫 호출 시 BrowserWindow 생성 ~500ms, loadURL ~1-3s. 같은 partition으로 윈도우
// 재사용해 후속 fetch는 ~500ms (페이지 캐시 활용).
//
// 사용처:
//   - Codeforces (Cloudflare 적용)
//   - 향후 AtCoder/Programmers submission auto-fetch도 같은 패턴
//
// hidden 윈도우 — 사용자 노출 없음. show: false.

import { BrowserWindow } from 'electron';

const windowPool = new Map<string, BrowserWindow>();

function getOrCreateWindow(partition: string): BrowserWindow {
  const existing = windowPool.get(partition);
  if (existing && !existing.isDestroyed()) {
    return existing;
  }

  const win = new BrowserWindow({
    show: false,
    width: 1024,
    height: 768,
    webPreferences: {
      partition,
      offscreen: false,
      // 임의 URL 로드라 contextIsolation/sandbox 켜둠 (스크래핑만 하므로 IPC 불필요)
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // 메모리 누수 방지 — destroyed 시 pool에서 제거
  win.on('closed', () => {
    if (windowPool.get(partition) === win) {
      windowPool.delete(partition);
    }
  });

  windowPool.set(partition, win);
  return win;
}

/**
 * URL을 hidden BrowserWindow에서 로드 후 최종 HTML 반환.
 * Cloudflare JS challenge / bot protection 통과.
 *
 * @param url 가져올 URL
 * @param partition 'persist:codeforces' 등. 같은 partition 재사용으로 cookies + cache 공유
 * @param timeoutMs 로드 timeout (default 15s)
 */
export async function fetchHtmlViaBrowser(
  url: string,
  partition: string,
  timeoutMs: number = 15000
): Promise<string> {
  const win = getOrCreateWindow(partition);

  // 타임아웃 가드 — Cloudflare 챌린지가 영영 안 끝나는 케이스 방어
  const loadPromise = win.loadURL(url);
  const timeoutPromise = new Promise<void>((_resolve, reject) => {
    setTimeout(() => reject(new Error(`로드 타임아웃 (${timeoutMs}ms 초과)`)), timeoutMs);
  });

  await Promise.race([loadPromise, timeoutPromise]);

  // Cloudflare는 챌린지 페이지 → 자동 redirect되어 진짜 페이지 도착 (보통 1-3s)
  // loadURL이 챌린지 페이지에서 끝났을 수도 있으니 한 번 더 대기
  // did-finish-load 이벤트가 다시 발생할 때까지 (또는 짧은 대기)
  await new Promise((resolve) => setTimeout(resolve, 800));

  const html = await win.webContents.executeJavaScript(
    'document.documentElement.outerHTML',
    true
  );

  return html;
}

/**
 * 앱 종료 시 모든 hidden 윈도우 정리.
 */
export function closeAllBrowserFetchWindows(): void {
  for (const win of windowPool.values()) {
    if (!win.isDestroyed()) {
      win.destroy();
    }
  }
  windowPool.clear();
}
