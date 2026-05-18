// Electron 메인 프로세스
// v0.2.4: embedded LeetCode 윈도우, 영속 세션, 링크 인터셉트, 강건한 단축키

import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  screen,
  globalShortcut,
  shell,
  session,
} from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';
import {
  registerIpcHandlers,
  setLeetCodeOpener,
  setLeetCodeUrlGetter,
  setPullCurrentLeetCodeUrl,
  setShortcutGetter,
} from './ipc';
import { decryptProcessEnvSecrets, migrateSecretsIfNeeded } from './settings';
import { checkForUpdates } from './update';
import { prewarmAtcoderModels } from '../services/atcoderModels';
import { closeAllBrowserFetchWindows } from '../services/browserFetch';

// ─── userData 경로 호환성 ─────────────────────────────────────
// v1.0+ 도구 이름이 iq-solvebuddy로 바뀌었지만, Electron의 userData 경로는
// app.getName() 기반 — productName이 바뀌면 폴더도 바뀜.
// 그러면 기존 사용자의 .env(API 키) / cache / persist:leetcode 세션이 모두 손실됨.
// → setName으로 명시적으로 'iq-leetbuddy' 유지 (data 손실 방지, 사용자에게 invisible)
// 단 어떤 path 조회보다 먼저 호출되어야 함.
app.setName('iq-leetbuddy');

// .env 로드 — 패키지 모드는 userData, dev 모드는 프로젝트 루트
function loadEnv() {
  const envFile = app.isPackaged
    ? path.join(app.getPath('userData'), '.env')
    : path.join(__dirname, '../../.env');
  dotenv.config({ path: envFile });
}

let mainWindow: BrowserWindow | null = null;
let leetcodeWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let activeShortcut: string | null = null;

// LeetCode URL 판별
function isLeetCodeUrl(url: string): boolean {
  return /^https?:\/\/(?:www\.)?leetcode\.(?:com|cn)/i.test(url);
}

// 외부/embedded 라우팅
function routeUrl(url: string) {
  if (isLeetCodeUrl(url)) {
    openLeetCodeWindow(url);
  } else if (url.startsWith('http://') || url.startsWith('https://')) {
    shell.openExternal(url);
  }
}

// ─── LeetCode embedded 윈도우 ──────────────────────────────

// 임베드 페이지 → 메인 프로세스 통신용 sentinel
// preload 없이 사용자 페이지 console.log를 console-message 이벤트로 캡처
const PULL_SENTINEL = 'IQ_LEETBUDDY_PULL::';

// 문제 페이지에 표시할 플로팅 버튼 주입 스크립트 (self-contained, idempotent)
const INJECT_SCRIPT = `
(() => {
  if (window.__IQ_LEETBUDDY_INJECTED__) return;
  window.__IQ_LEETBUDDY_INJECTED__ = true;

  const SENTINEL = ${JSON.stringify(PULL_SENTINEL)};
  const BTN_ID = '__iq_leetbuddy_pull_btn__';

  function isProblemPage() {
    return /\\/problems\\/[^\\/]+/.test(location.pathname);
  }

  function ensureBtn() {
    let btn = document.getElementById(BTN_ID);
    if (!isProblemPage()) {
      if (btn) btn.remove();
      return;
    }
    if (btn) return;
    if (!document.body) return;

    btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.textContent = '→ solvebuddy로 가져오기';
    btn.style.cssText = [
      'position:fixed',
      'bottom:24px',
      'right:24px',
      'z-index:2147483647',
      'padding:10px 18px',
      'background:linear-gradient(135deg,#cc785c,#b06547)',
      'color:#fff',
      'border:none',
      'border-radius:999px',
      'font-size:13px',
      'font-weight:600',
      'font-family:-apple-system,system-ui,BlinkMacSystemFont,sans-serif',
      'letter-spacing:-0.01em',
      'cursor:pointer',
      'box-shadow:0 6px 20px rgba(204,120,92,0.45),inset 0 0 0 1px rgba(255,255,255,0.12)',
      'transition:transform 0.15s ease,box-shadow 0.15s ease',
      'user-select:none',
      '-webkit-app-region:no-drag',
    ].join(';');
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'translateY(-1px)';
      btn.style.boxShadow = '0 8px 24px rgba(204,120,92,0.55),inset 0 0 0 1px rgba(255,255,255,0.18)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'translateY(0)';
      btn.style.boxShadow = '0 6px 20px rgba(204,120,92,0.45),inset 0 0 0 1px rgba(255,255,255,0.12)';
    });
    btn.addEventListener('click', () => {
      // console.log를 main 프로세스가 console-message 이벤트로 캡처
      console.log(SENTINEL + location.href);
      btn.textContent = '✓ solvebuddy로 보냄';
      setTimeout(() => { btn.textContent = '→ solvebuddy로 가져오기'; }, 1600);
    });
    document.body.appendChild(btn);
  }

  // ─── lang hint: 메인에서 '원문' 클릭 시 hash로 전달된 lang을 안내 + 자동 선택 시도 ───
  // LeetCode UI 변경에 fragile하므로 best-effort. 실패해도 토스트는 표시.
  const LANG_DISPLAY = {
    python3:'Python3', python:'Python', java:'Java',
    cpp:'C++', c:'C', csharp:'C#',
    javascript:'JavaScript', typescript:'TypeScript',
    go:'Go', golang:'Go', kotlin:'Kotlin', rust:'Rust',
    swift:'Swift', ruby:'Ruby', scala:'Scala', php:'PHP',
    dart:'Dart', elixir:'Elixir', erlang:'Erlang',
  };
  const ALL_DISPLAYS = Object.values(LANG_DISPLAY);

  function showLangToast(targetLang, display) {
    const TOAST_ID = '__iq_leetbuddy_lang_toast__';
    const existing = document.getElementById(TOAST_ID);
    if (existing) existing.remove();
    if (!document.body) return;

    const toast = document.createElement('div');
    toast.id = TOAST_ID;
    toast.style.cssText = [
      'position:fixed','top:64px','right:24px','z-index:2147483646',
      'padding:12px 16px','background:rgba(20,18,16,0.96)','color:#fff',
      'border-radius:10px','font-size:13px',
      'font-family:-apple-system,system-ui,sans-serif',
      'box-shadow:0 8px 24px rgba(0,0,0,0.5)','max-width:300px','line-height:1.55',
      'border-left:3px solid #cc785c','transition:opacity 0.4s ease',
    ].join(';');
    toast.innerHTML =
      '<div style="display:flex;align-items:baseline;gap:6px;margin-bottom:4px;">' +
      '<strong style="color:#cc785c;font-size:12px;letter-spacing:0.04em;">LEETBUDDY</strong>' +
      '<span style="color:rgba(255,255,255,0.5);font-size:11px;">선택된 시작 언어</span>' +
      '</div>' +
      '<div style="font-size:15px;font-weight:600;margin-bottom:4px;">' + display + '</div>' +
      '<div style="opacity:0.6;font-size:11px;">에디터 좌측 상단 lang 드롭다운에서 직접 변경 가능</div>';
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; }, 5500);
    setTimeout(() => toast.remove(), 6000);
  }

  function trySwitchLang(display) {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const buttons = Array.from(document.querySelectorAll('button'));
      let langBtn = null;
      for (const b of buttons) {
        const txt = (b.textContent || '').trim();
        if (ALL_DISPLAYS.includes(txt)) { langBtn = b; break; }
      }
      if (!langBtn) {
        if (attempts > 25) clearInterval(interval); // ~7.5s
        return;
      }
      clearInterval(interval);
      const current = (langBtn.textContent || '').trim();
      if (current === display) return; // 이미 맞음
      langBtn.click();
      // 드롭다운 옵션 클릭 (열린 후 약간 대기)
      setTimeout(() => {
        const items = document.querySelectorAll('[role="option"], [role="menuitem"], li, [role="button"]');
        for (const item of items) {
          if ((item.textContent || '').trim() === display) {
            item.click();
            break;
          }
        }
      }, 220);
    }, 300);
  }

  function ensureLangHint() {
    const m = location.hash.match(/leetbuddy-lang=([\\w-]+)/);
    if (!m) return;
    const targetLang = m[1].toLowerCase();
    if (window.__IQ_LEETBUDDY_LANG__ === targetLang) return;
    window.__IQ_LEETBUDDY_LANG__ = targetLang;

    const display = LANG_DISPLAY[targetLang] || targetLang;
    showLangToast(targetLang, display);
    trySwitchLang(display);
  }

  // SPA navigation (history pushState) 대응: 초기 + interval 폴링
  ensureBtn();
  ensureLangHint();
  setInterval(() => { ensureBtn(); ensureLangHint(); }, 1200);
})();
`;

function injectPullButton(win: BrowserWindow) {
  win.webContents.executeJavaScript(INJECT_SCRIPT).catch(() => {
    // 페이지 로드 실패/접근 차단 시 무시 — 다음 navigate에서 다시 시도
  });
}

function openLeetCodeWindow(url: string = 'https://leetcode.com/') {
  if (leetcodeWindow && !leetcodeWindow.isDestroyed()) {
    leetcodeWindow.loadURL(url);
    leetcodeWindow.show();
    leetcodeWindow.focus();
    if (process.platform === 'darwin') app.focus({ steal: true });
    return;
  }

  // 영속 세션 - 한 번 로그인하면 다음 실행까지 유지
  const lcSession = session.fromPartition('persist:leetcode');

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  leetcodeWindow = new BrowserWindow({
    width: Math.min(1400, Math.floor(sw * 0.7)),
    height: Math.min(1100, Math.floor(sh * 0.92)),
    title: 'LeetCode',
    backgroundColor: '#1a1a1a',
    webPreferences: {
      session: lcSession,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  leetcodeWindow.loadURL(url);

  leetcodeWindow.on('closed', () => {
    leetcodeWindow = null;
  });

  // LeetCode 안의 외부 링크는 외부 브라우저로
  leetcodeWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    if (isLeetCodeUrl(openUrl)) {
      leetcodeWindow?.loadURL(openUrl);
    } else {
      shell.openExternal(openUrl);
    }
    return { action: 'deny' };
  });

  // 페이지 로드 완료 + SPA 내부 라우팅 양쪽 모두에서 버튼 주입
  leetcodeWindow.webContents.on('did-finish-load', () => {
    if (leetcodeWindow) injectPullButton(leetcodeWindow);
  });
  leetcodeWindow.webContents.on('did-navigate-in-page', () => {
    if (leetcodeWindow) injectPullButton(leetcodeWindow);
  });

  // 페이지 console.log에서 sentinel을 잡아서 메인으로 pull
  // Electron 33 시그니처: (event, level, message, line, sourceId)
  leetcodeWindow.webContents.on(
    'console-message',
    (_event, _level, message) => {
      if (typeof message !== 'string') return;
      if (!message.startsWith(PULL_SENTINEL)) return;
      const url = message.slice(PULL_SENTINEL.length);
      pullToMainWindow(url);
    }
  );
}

// 임베드 LeetCode 윈도우의 현재 URL을 메인 윈도우 input으로 밀어넣음
// 푸시(임베드 버튼/메뉴) + 풀(메인 보조 버튼) 양방향에서 호출
function pullToMainWindow(url: string) {
  if (!url || !isLeetCodeUrl(url)) return;
  if (!mainWindow) {
    createWindow();
    const win = mainWindow as BrowserWindow | null;
    win?.once('ready-to-show', () => {
      win.show();
      // 첫 로드라면 DOM이 listener를 붙이기 전이라 메시지가 유실될 수 있음 → did-finish-load 대기
      win.webContents.once('did-finish-load', () => {
        win.webContents.send('pull-problem', url);
      });
      showAndFocus();
    });
    return;
  }
  showAndFocus();
  mainWindow.webContents.send('pull-problem', url);
}

// 메뉴/단축키/메인 input 보조 버튼에서 공통으로 부름
function pullCurrentLeetCodeUrl() {
  if (!leetcodeWindow || leetcodeWindow.isDestroyed()) return;
  const url = leetcodeWindow.webContents.getURL();
  pullToMainWindow(url);
}

function getCurrentLeetCodeUrl(): string | null {
  if (!leetcodeWindow || leetcodeWindow.isDestroyed()) return null;
  const url = leetcodeWindow.webContents.getURL();
  return isLeetCodeUrl(url) ? url : null;
}

// ─── 메인 윈도우 ──────────────────────────────
function createWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = Math.min(1100, Math.max(840, Math.floor(sw * 0.55)));
  const winHeight = Math.min(1100, Math.max(800, Math.floor(sh * 0.92)));

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    minWidth: 720,
    minHeight: 600,
    show: false,
    title: 'iq-solvebuddy',
    backgroundColor: '#0f0e0d',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // 메인 윈도우 안에서 우리 file:// 외 navigation은 모두 차단하고 라우팅
  // 이게 핵심: 원문 링크 클릭해도 solvebuddy UI가 안 사라짐
  mainWindow.webContents.on('will-navigate', (event, navUrl) => {
    if (navUrl.startsWith('file://')) return;
    event.preventDefault();
    routeUrl(navUrl);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    routeUrl(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// ─── 강제 활성화 (단축키, 트레이 클릭에서 사용) ──────────────────────────────
function showAndFocus() {
  if (!mainWindow) {
    createWindow();
    const win = mainWindow as BrowserWindow | null;
    win?.once('ready-to-show', () => {
      win?.show();
      win?.focus();
    });
    return;
  }

  if (!mainWindow.isVisible()) mainWindow.show();

  // macOS에서 background app이 강제로 앞으로 나오는 트릭:
  // 1) alwaysOnTop true (잠깐 최상위로)
  // 2) focus + moveTop
  // 3) alwaysOnTop false (붙박이 해제)
  mainWindow.setAlwaysOnTop(true);
  mainWindow.focus();
  if (process.platform === 'darwin') {
    app.focus({ steal: true });
  }
  mainWindow.moveTop();
  mainWindow.setAlwaysOnTop(false);
}

function toggleWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
  } else {
    showAndFocus();
  }
}

// ─── 단축키 등록 (fallback chain) ──────────────────────────────
function registerShortcuts() {
  // 충돌 가능성 낮은 순으로 시도
  const candidates = [
    'CmdOrCtrl+Alt+L',   // 1순위: Cmd+Option+L
    'CmdOrCtrl+Alt+B',   // 2순위: B for Buddy
    'CmdOrCtrl+Alt+J',   // 3순위
    'CmdOrCtrl+Shift+L', // 4순위 (Safari Reading List와 충돌)
  ];

  for (const sc of candidates) {
    try {
      const ok = globalShortcut.register(sc, showAndFocus);
      if (ok && globalShortcut.isRegistered(sc)) {
        activeShortcut = sc;
        console.log(`[shortcut] registered: ${sc}`);
        return;
      }
    } catch (e) {
      console.warn(`[shortcut] ${sc} 시도 실패:`, e);
    }
  }
  console.warn('[shortcut] 모든 단축키 등록 실패');
}

// ─── 트레이 ──────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  let image = nativeImage.createFromPath(iconPath);
  if (!image.isEmpty()) {
    image = image.resize({ width: 18, height: 18 });
    image.setTemplateImage(false);
  }
  tray = new Tray(image);

  const accelLabel = activeShortcut || '';

  const menu = Menu.buildFromTemplate([
    {
      label: 'iq-solvebuddy 보이기',
      accelerator: activeShortcut || undefined,
      click: showAndFocus,
    },
    {
      label: 'LeetCode 열기 (로그인)',
      click: () => openLeetCodeWindow(),
    },
    { type: 'separator' },
    {
      label: '종료',
      accelerator: 'Cmd+Q',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip(`iq-solvebuddy${accelLabel ? ` (${accelLabel})` : ''}`);
  tray.setContextMenu(menu);
  tray.on('click', toggleWindow);
}

// ─── 표준 메뉴바 ──────────────────────────────
function createAppMenu() {
  const isMac = process.platform === 'darwin';
  const menu = Menu.buildFromTemplate([
    ...(isMac
      ? [{
          label: 'iq-solvebuddy',
          submenu: [
            { role: 'about' as const },
            { type: 'separator' as const },
            { role: 'hide' as const },
            { role: 'hideOthers' as const },
            { role: 'unhide' as const },
            { type: 'separator' as const },
            { role: 'quit' as const },
          ],
        }]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'solvebuddy 보이기/포커스',
          accelerator: activeShortcut || undefined,
          click: showAndFocus,
        },
        {
          label: 'LeetCode 열기',
          click: () => openLeetCodeWindow(),
        },
        {
          label: '임베드 LeetCode → leetbuddy 입력으로',
          accelerator: 'CmdOrCtrl+Shift+Return',
          click: pullCurrentLeetCodeUrl,
        },
        { type: 'separator' as const },
        { role: 'reload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' as const }, { role: 'close' as const }],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

// ─── 부트스트랩 ──────────────────────────────
app.whenReady().then(async () => {
  loadEnv(); // app.isPackaged + app.getPath('userData') 사용 가능 시점

  // 시크릿(API_KEY/TOKEN)이 OS keychain encrypted면 process.env에 평문으로 복호화
  // legacy .env의 평문 시크릿은 그대로 두고, 다음 줄의 migration이 자동으로 암호화
  decryptProcessEnvSecrets();

  // 평문 시크릿 있으면 OS keychain encrypted로 자동 마이그레이션 (best-effort)
  await migrateSecretsIfNeeded();

  // macOS Dock 아이콘 명시 (개발 모드에서도 코랄 행성 보이게)
  // 패키징된 앱은 .icns가 자동 사용됨
  if (process.platform === 'darwin' && app.dock) {
    const iconPath = path.join(__dirname, '../../build/icon.png');
    try {
      const dockImage = nativeImage.createFromPath(iconPath);
      if (!dockImage.isEmpty()) {
        app.dock.setIcon(dockImage);
      }
    } catch {
      // 무시 - 패키지된 앱은 어차피 .icns 사용
    }
  }

  registerShortcuts(); // 트레이/메뉴 빌드 전에 단축키 등록

  // IPC에 의존성 주입
  setLeetCodeOpener(openLeetCodeWindow);
  setLeetCodeUrlGetter(getCurrentLeetCodeUrl);
  setPullCurrentLeetCodeUrl(pullCurrentLeetCodeUrl);
  setShortcutGetter(() => activeShortcut);

  createAppMenu();
  createWindow();
  createTray();
  registerIpcHandlers();

  mainWindow?.once('ready-to-show', () => {
    mainWindow?.show();
    // 부팅 후 비동기 update 체크 (dev에선 skip됨)
    checkForUpdates(mainWindow);
    // AtCoder difficulty rating 모델 background prewarm — 첫 AtCoder fetch 대기 시간 제거
    // 5~10MB JSON gzip — 5초 정도. 실패해도 silent (점수만 표시되어도 무해)
    prewarmAtcoderModels();
  });

  app.on('activate', () => {
    if (!mainWindow) createWindow();
    else mainWindow.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // 트레이 상주
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  // hidden BrowserWindow pool 정리 (메모리 누수 방지)
  closeAllBrowserFetchWindows();
});
