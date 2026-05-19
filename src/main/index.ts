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
  setAtcoderOpener,
  setAtcoderUrlGetter,
  setPullCurrentAtcoderUrl,
  setCodeforcesOpener,
  setCodeforcesUrlGetter,
  setPullCurrentCodeforcesUrl,
  setProgrammersOpener,
  setProgrammersUrlGetter,
  setPullCurrentProgrammersUrl,
  setProgrammersWindowGetter,
  setShortcutGetter,
} from './ipc';
import { decryptProcessEnvSecrets, migrateSecretsIfNeeded } from './settings';
import { checkForUpdates } from './update';
import { prewarmAtcoderModels } from '../services/atcoderModels';
import { closeAllBrowserFetchWindows } from '../services/browserFetch';
import { setProgrammersWindowGetterForLevel } from '../services/programmers';
import { EmbedController } from './embedWindow';

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
let tray: Tray | null = null;
// 4개 플랫폼 임베드 윈도우 state는 EmbedController(embedWindow.ts)가 own (아래 controllers 선언 참고)
let isQuitting = false;
let activeShortcut: string | null = null;

// LeetCode URL 판별
function isLeetCodeUrl(url: string): boolean {
  return /^https?:\/\/(?:www\.)?leetcode\.(?:com|cn)/i.test(url);
}

// AtCoder URL 판별
function isAtcoderUrl(url: string): boolean {
  return /^https?:\/\/(?:www\.)?atcoder\.jp/i.test(url);
}

// Codeforces URL 판별
function isCodeforcesUrl(url: string): boolean {
  return /^https?:\/\/(?:www\.)?codeforces\.com/i.test(url);
}

// Programmers URL 판별
function isProgrammersUrl(url: string): boolean {
  return /^https?:\/\/(?:[a-z0-9-]+\.)?programmers\.co\.kr/i.test(url);
}

// 외부/embedded 라우팅
function routeUrl(url: string) {
  if (isLeetCodeUrl(url)) {
    openLeetCodeWindow(url);
  } else if (isAtcoderUrl(url)) {
    openAtcoderWindow(url);
  } else if (isCodeforcesUrl(url)) {
    openCodeforcesWindow(url);
  } else if (isProgrammersUrl(url)) {
    openProgrammersWindow(url);
  } else if (url.startsWith('http://') || url.startsWith('https://')) {
    shell.openExternal(url);
  }
}

// ─── 임베드 윈도우 (v1.12+ EmbedController 추상화) ─────────────────
// 4개 플랫폼 공통 로직(persist 윈도우/INJECT_SCRIPT chip/URL pull-push)은
// src/main/embedWindow.ts의 EmbedController. 여기는 plat별 config + thin wrapper.

// LeetCode lang hint — 'extraInjectScriptJs' 옵션으로 page-context에 inject.
// ensureExtra()를 EmbedController가 주기적으로 호출 (chip ensureBtn과 함께)
const LEETCODE_LANG_HINT_JS = `
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
      '<strong style="color:#cc785c;font-size:12px;letter-spacing:0.04em;">SOLVEBUDDY</strong>' +
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
        if (attempts > 25) clearInterval(interval);
        return;
      }
      clearInterval(interval);
      const current = (langBtn.textContent || '').trim();
      if (current === display) return;
      langBtn.click();
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

  function ensureExtra() {
    const m = location.hash.match(/leetbuddy-lang=([\\w-]+)/);
    if (!m) return;
    const targetLang = m[1].toLowerCase();
    if (window.__IQ_LEETBUDDY_LANG__ === targetLang) return;
    window.__IQ_LEETBUDDY_LANG__ = targetLang;
    const display = LANG_DISPLAY[targetLang] || targetLang;
    showLangToast(targetLang, display);
    trySwitchLang(display);
  }
`;

// mainWindow getter / ensureMainWindow — controller에 주입
// (showAndFocus는 아래 정의 — arrow function으로 closure 사용해 forward reference OK)
function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

function ensureMainWindow(onReady: (win: BrowserWindow) => void): void {
  if (mainWindow) {
    onReady(mainWindow);
    return;
  }
  createWindow();
  const win = mainWindow as BrowserWindow | null;
  win?.once('ready-to-show', () => {
    win.show();
    win.webContents.once('did-finish-load', () => onReady(win));
  });
}

// 4개 플랫폼 controller — same config structure
const embedControllers = {
  LeetCode: new EmbedController({
    name: 'leetcode',
    partition: 'persist:leetcode',
    defaultUrl: 'https://leetcode.com/',
    windowTitle: 'LeetCode',
    backgroundColor: '#1a1a1a',
    isPlatformUrl: isLeetCodeUrl,
    pullSentinel: 'IQ_LEETBUDDY_PULL::',
    problemPagePathPatternJs: '/problems/[^/]+',
    extraInjectScriptJs: LEETCODE_LANG_HINT_JS,
    mainWindowGetter: getMainWindow,
    ensureMainWindow,
    showAndFocus: () => showAndFocus(),
  }),
  AtCoder: new EmbedController({
    name: 'atcoder',
    partition: 'persist:atcoder',
    defaultUrl: 'https://atcoder.jp/home',
    windowTitle: 'AtCoder',
    backgroundColor: '#ffffff',
    isPlatformUrl: isAtcoderUrl,
    pullSentinel: 'IQ_SOLVEBUDDY_AC_PULL::',
    problemPagePathPatternJs: '/contests/[^/]+/tasks/[^/]+',
    mainWindowGetter: getMainWindow,
    ensureMainWindow,
    showAndFocus: () => showAndFocus(),
  }),
  Codeforces: new EmbedController({
    name: 'codeforces',
    partition: 'persist:codeforces',
    defaultUrl: 'https://codeforces.com/',
    windowTitle: 'Codeforces',
    backgroundColor: '#ffffff',
    isPlatformUrl: isCodeforcesUrl,
    pullSentinel: 'IQ_SOLVEBUDDY_CF_PULL::',
    problemPagePathPatternJs:
      '/(?:contest/\\d+/problem/[A-Z]\\d*|problemset/problem/\\d+/[A-Z]\\d*)',
    mainWindowGetter: getMainWindow,
    ensureMainWindow,
    showAndFocus: () => showAndFocus(),
  }),
  Programmers: new EmbedController({
    name: 'programmers',
    partition: 'persist:programmers',
    defaultUrl: 'https://school.programmers.co.kr/learn/challenges',
    windowTitle: '프로그래머스',
    backgroundColor: '#ffffff',
    isPlatformUrl: isProgrammersUrl,
    pullSentinel: 'IQ_SOLVEBUDDY_PG_PULL::',
    problemPagePathPatternJs: '/learn/courses/\\d+/lessons/\\d+',
    mainWindowGetter: getMainWindow,
    ensureMainWindow,
    showAndFocus: () => showAndFocus(),
  }),
};

// thin wrappers — ipc.ts의 setLeetCodeOpener 등이 함수 reference로 받으므로 유지.
// 또한 routeUrl이 함수 이름으로 호출하므로 wrapper가 필요.
function openLeetCodeWindow(url?: string): void { embedControllers.LeetCode.open(url); }
function getCurrentLeetCodeUrl(): string | null { return embedControllers.LeetCode.getCurrentUrl(); }
function pullCurrentLeetCodeUrl(): void { embedControllers.LeetCode.pullCurrent(); }

function openAtcoderWindow(url?: string): void { embedControllers.AtCoder.open(url); }
function getCurrentAtcoderUrl(): string | null { return embedControllers.AtCoder.getCurrentUrl(); }
function pullCurrentAtcoderUrl(): void { embedControllers.AtCoder.pullCurrent(); }

function openCodeforcesWindow(url?: string): void { embedControllers.Codeforces.open(url); }
function getCurrentCodeforcesUrl(): string | null { return embedControllers.Codeforces.getCurrentUrl(); }
function pullCurrentCodeforcesUrl(): void { embedControllers.Codeforces.pullCurrent(); }

function openProgrammersWindow(url?: string): void { embedControllers.Programmers.open(url); }
function getCurrentProgrammersUrl(): string | null { return embedControllers.Programmers.getCurrentUrl(); }
function pullCurrentProgrammersUrl(): void { embedControllers.Programmers.pullCurrent(); }
function getProgrammersWindow(): BrowserWindow | null { return embedControllers.Programmers.getWindow(); }

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
    title: 'Solve Buddy',
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
      label: 'Solve Buddy 보이기',
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

  tray.setToolTip(`Solve Buddy${accelLabel ? ` (${accelLabel})` : ''}`);
  tray.setContextMenu(menu);
  tray.on('click', toggleWindow);
}

// ─── 표준 메뉴바 ──────────────────────────────
function createAppMenu() {
  const isMac = process.platform === 'darwin';
  const menu = Menu.buildFromTemplate([
    ...(isMac
      ? [{
          label: 'Solve Buddy',
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
  setAtcoderOpener(openAtcoderWindow);
  setAtcoderUrlGetter(getCurrentAtcoderUrl);
  setPullCurrentAtcoderUrl(pullCurrentAtcoderUrl);
  setCodeforcesOpener(openCodeforcesWindow);
  setCodeforcesUrlGetter(getCurrentCodeforcesUrl);
  setPullCurrentCodeforcesUrl(pullCurrentCodeforcesUrl);
  setProgrammersOpener(openProgrammersWindow);
  setProgrammersUrlGetter(getCurrentProgrammersUrl);
  setPullCurrentProgrammersUrl(pullCurrentProgrammersUrl);
  setProgrammersWindowGetter(getProgrammersWindow);
  // programmers.ts의 level 추출 fallback도 같은 윈도우 활용
  setProgrammersWindowGetterForLevel(getProgrammersWindow);
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
