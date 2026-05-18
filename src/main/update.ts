// 새 버전 알림 — GitHub Releases API polling
//
// electron-updater (자동 다운로드 + install)는 macOS unsigned 앱에선
// squirrel.mac 코드 서명 요구로 fail. 우회 복잡 + cert 비용.
// 대신 단순 polling으로 가치 90% 보존:
//   - 부팅 시 latest release 조회
//   - 현재 버전과 비교 → 새 버전이면 renderer에 'update-available' IPC
//   - renderer는 footer에 "v0.x.x 업데이트 가능" + Releases 링크 표시
//   - 클릭 시 사용자가 Releases 페이지에서 zip 받음 (현재 흐름과 동일)

import { app, BrowserWindow } from 'electron';

const RELEASES_API = 'https://api.github.com/repos/iq-agent-lab/iq-solvebuddy/releases/latest';

interface ReleaseInfo {
  tag: string;
  url: string;
}

// "v0.4.1" / "0.4.1" → [0, 4, 1]
function parseVersion(tag: string): number[] {
  return tag.replace(/^v/i, '').split('.').map((s) => parseInt(s, 10) || 0);
}

// a > b: 1, a < b: -1, a === b: 0
function compareVersions(a: string, b: string): number {
  const av = parseVersion(a);
  const bv = parseVersion(b);
  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i++) {
    const d = (av[i] || 0) - (bv[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

export async function checkForUpdates(mainWindow: BrowserWindow | null): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  // dev 모드는 skip — 패키지 모드에서만 의미 있음
  if (!app.isPackaged) return;

  try {
    const res = await fetch(RELEASES_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'iq-solvebuddy',
      },
    });
    if (!res.ok) return; // 네트워크 오류 / rate limit 등은 silent

    const data = (await res.json()) as {
      tag_name?: string;
      html_url?: string;
    };
    const latestTag = data.tag_name;
    if (!latestTag) return;

    const currentVersion = app.getVersion();
    if (compareVersions(latestTag, currentVersion) <= 0) return; // 최신이거나 더 높음

    const info: ReleaseInfo = {
      tag: latestTag,
      url: data.html_url || 'https://github.com/iq-agent-lab/iq-solvebuddy/releases/latest',
    };

    // renderer가 ready된 후 전송 (윈도우가 hidden일 수 있어 listener만 등록)
    if (mainWindow.webContents.isLoading()) {
      mainWindow.webContents.once('did-finish-load', () => {
        if (!mainWindow.isDestroyed()) mainWindow.webContents.send('update-available', info);
      });
    } else {
      mainWindow.webContents.send('update-available', info);
    }
  } catch {
    // fetch 실패 / JSON 파싱 실패 등 모두 silent — 풀이 흐름엔 영향 없음
  }
}
