// 임베드 윈도우 추상화 (v1.12+) — 4개 플랫폼 (LeetCode / AtCoder / Codeforces / Programmers)
// 공통 구조 추출:
//   - persist 세션 윈도우 생성
//   - chip 버튼 inject (page 안 console.log → main 캡처)
//   - URL pull/push 양방향
//   - 외부 링크는 shell.openExternal, 같은 도메인은 임베드 안에서
//
// 플랫폼별 차이:
//   - partition / window title / default URL / domain pattern
//   - chip 표시 조건 (문제 페이지 path regex)
//   - LeetCode만 lang hint script (시작 언어 자동 안내)
//   - sentinel 문자열 분리 (다른 플랫폼끼리 안 섞이게)
//
// 기존 4 × ~170 lines 중복 코드 → 1 × ~150 lines (factory) + 4 × ~20 lines (config) = ~230 lines로 압축.

import { BrowserWindow, session, shell, app, screen } from 'electron';

export interface EmbedConfig {
  /** 디버그/로그용 이름 (LeetCode / AtCoder / Codeforces / Programmers) */
  name: string;
  /** persist:atcoder 등 — 영속 세션 partition */
  partition: string;
  /** 기본 URL (홈 페이지) */
  defaultUrl: string;
  /** BrowserWindow title */
  windowTitle: string;
  /** 배경색 (FOUC 방지) */
  backgroundColor: string;
  /** URL이 이 플랫폼 도메인인지 판별 */
  isPlatformUrl: (url: string) => boolean;
  /** chip 버튼에서 메인으로 push할 때 sentinel 문자열 (플랫폼별 분리 필수) */
  pullSentinel: string;
  /**
   * chip이 보여야 하는 페이지 path 정규식 (JS 문자열)
   * 예: '/problems/[^/]+' (LeetCode) / '/contests/[^/]+/tasks/[^/]+' (AtCoder)
   * INJECT_SCRIPT 내부에서 RegExp 생성하므로 \\ escape 주의
   */
  problemPagePathPatternJs: string;
  /**
   * 추가 page-context JS — LeetCode lang hint 같은 platform-specific 로직.
   * 미지정 시 그냥 chip 만.
   */
  extraInjectScriptJs?: string;
  /** mainWindow getter (push 시 사용) — main/index.ts에서 주입 */
  mainWindowGetter: () => BrowserWindow | null;
  /** mainWindow 보장 (없으면 생성 + ready 대기) — main/index.ts에서 주입 */
  ensureMainWindow: (onReady: (win: BrowserWindow) => void) => void;
  /** showAndFocus 호출 — 메인 윈도우 포커스 */
  showAndFocus: () => void;
}

/**
 * INJECT_SCRIPT 생성 — 공통 chip 버튼 + 선택적 extra script.
 */
function buildInjectScript(config: EmbedConfig): string {
  // 변수명 collision 방지 — config name을 슬러그화해 prefix
  const idTag = config.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `
(() => {
  if (window.__IQ_SOLVEBUDDY_${idTag}_INJECTED__) return;
  window.__IQ_SOLVEBUDDY_${idTag}_INJECTED__ = true;

  const SENTINEL = ${JSON.stringify(config.pullSentinel)};
  const BTN_ID = '__iq_solvebuddy_${idTag}_pull_btn__';
  const PROBLEM_PATH_RE = new RegExp(${JSON.stringify(config.problemPagePathPatternJs)});

  function isProblemPage() {
    return PROBLEM_PATH_RE.test(location.pathname);
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
      console.log(SENTINEL + location.href);
      btn.textContent = '✓ solvebuddy로 보냄';
      setTimeout(() => { btn.textContent = '→ solvebuddy로 가져오기'; }, 1600);
    });
    document.body.appendChild(btn);
  }

  ${config.extraInjectScriptJs || '// no extra inject'}

  ensureBtn();
  ${config.extraInjectScriptJs ? 'ensureExtra && ensureExtra();' : ''}
  setInterval(() => {
    ensureBtn();
    ${config.extraInjectScriptJs ? 'ensureExtra && ensureExtra();' : ''}
  }, 1200);
})();
`;
}

export class EmbedController {
  private win: BrowserWindow | null = null;
  private injectScript: string;

  constructor(private config: EmbedConfig) {
    this.injectScript = buildInjectScript(config);
  }

  /** 임베드 윈도우 열기 (없으면 생성, 있으면 focus + URL 갱신) */
  open(url?: string): void {
    const targetUrl = url || this.config.defaultUrl;

    if (this.win && !this.win.isDestroyed()) {
      this.win.loadURL(targetUrl);
      this.win.show();
      this.win.focus();
      if (process.platform === 'darwin') app.focus({ steal: true });
      return;
    }

    const sess = session.fromPartition(this.config.partition);
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
    this.win = new BrowserWindow({
      width: Math.min(1400, Math.floor(sw * 0.7)),
      height: Math.min(1100, Math.floor(sh * 0.92)),
      title: this.config.windowTitle,
      backgroundColor: this.config.backgroundColor,
      webPreferences: {
        session: sess,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.win.loadURL(targetUrl);

    this.win.on('closed', () => {
      this.win = null;
    });

    // 외부 링크 → shell.openExternal, 같은 도메인 → 임베드 안에서
    this.win.webContents.setWindowOpenHandler(({ url: openUrl }) => {
      if (this.config.isPlatformUrl(openUrl)) {
        this.win?.loadURL(openUrl);
      } else {
        shell.openExternal(openUrl);
      }
      return { action: 'deny' };
    });

    // 페이지 로드 완료 + SPA 내부 라우팅 양쪽에서 inject
    const inject = () => {
      if (!this.win) return;
      this.win.webContents.executeJavaScript(this.injectScript).catch(() => {
        // 페이지 차단/접근 실패 시 무시 — 다음 navigate에서 재시도
      });
    };
    this.win.webContents.on('did-finish-load', inject);
    this.win.webContents.on('did-navigate-in-page', inject);

    // page console.log에서 sentinel 잡아 메인으로 pull
    this.win.webContents.on('console-message', (_event, _level, message) => {
      if (typeof message !== 'string') return;
      if (!message.startsWith(this.config.pullSentinel)) return;
      const pulled = message.slice(this.config.pullSentinel.length);
      this.pullToMain(pulled);
    });
  }

  /** 현재 임베드 URL → 메인 윈도우 input으로 전달 */
  pullCurrent(): void {
    if (!this.win || this.win.isDestroyed()) return;
    const url = this.win.webContents.getURL();
    this.pullToMain(url);
  }

  /** 현재 URL 조회 (같은 도메인 페이지면 반환, 다른 도메인이면 null) */
  getCurrentUrl(): string | null {
    if (!this.win || this.win.isDestroyed()) return null;
    const url = this.win.webContents.getURL();
    return this.config.isPlatformUrl(url) ? url : null;
  }

  /** 임베드 윈도우 핸들 (programmersSubmission이 ace editor 접근 등에 필요) */
  getWindow(): BrowserWindow | null {
    if (!this.win || this.win.isDestroyed()) return null;
    return this.win;
  }

  /** 내부: 메인 윈도우로 URL 전달 (필요 시 메인 윈도우 생성 후 ready 대기) */
  private pullToMain(url: string): void {
    if (!url || !this.config.isPlatformUrl(url)) return;
    const mainWin = this.config.mainWindowGetter();
    if (!mainWin) {
      this.config.ensureMainWindow((win) => {
        win.webContents.send('pull-problem', url);
        this.config.showAndFocus();
      });
      return;
    }
    this.config.showAndFocus();
    mainWin.webContents.send('pull-problem', url);
  }
}
