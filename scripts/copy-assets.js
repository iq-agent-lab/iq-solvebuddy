// 빌드 후 HTML/CSS/JS/assets를 dist/로 복사
const fs = require('fs');
const path = require('path');

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`  ✓ ${src} → ${dest}`);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else {
      fs.copyFileSync(s, d);
      console.log(`  ✓ ${s} → ${d}`);
    }
  }
}

console.log('Copying assets...');
copyFile('src/renderer/index.html', 'dist/renderer/index.html');
copyFile('src/renderer/styles.css', 'dist/renderer/styles.css');
// renderer.ts는 tsc가 dist/renderer/renderer.js로 컴파일 (수동 복사 불필요)
copyDir('assets', 'dist/assets');

// ─── renderer.js 후처리 ────────────────────────────────────────────
// renderer.ts에 import type 한 줄만 있어도 tsc(commonjs target)는
//   "use strict";
//   Object.defineProperty(exports, "__esModule", { value: true });
// 코드를 prepend함. browser context엔 module system이 없어 exports가 undefined
// → ReferenceError 발생 → renderer.js 전체 실행 중단 → 모든 listener 등록 실패
// → 패키지 모드에서 버튼들이 안 먹는 증상.
//
// 해결: 컴파일 후 그 두 줄을 제거. 함수/타입에 영향 없음 (import type는 이미 erase).
(function postProcessRendererJs() {
  const rendererPath = path.join('dist', 'renderer', 'renderer.js');
  if (!fs.existsSync(rendererPath)) return;
  let content = fs.readFileSync(rendererPath, 'utf-8');
  const before = content.length;
  content = content.replace(
    /^"use strict";\s*\nObject\.defineProperty\(exports, "__esModule", \{ value: true \}\);\s*\n/,
    '"use strict";\n'
  );
  if (content.length !== before) {
    fs.writeFileSync(rendererPath, content, 'utf-8');
    console.log(`  ✓ dist/renderer/renderer.js — commonjs init 제거 (browser context 호환)`);
  }
})();

// highlight.js vendor 파일 — CDN 안 쓰고 로컬 번들 (CSP 깔끔, 오프라인 OK)
copyFile(
  'node_modules/@highlightjs/cdn-assets/highlight.min.js',
  'dist/vendor/highlight.min.js'
);
// hljs dark + light 둘 다 복사 — theme 변경 시 dynamic link href 토글
copyFile(
  'node_modules/@highlightjs/cdn-assets/styles/atom-one-dark.min.css',
  'dist/vendor/highlight-theme-dark.css'
);
copyFile(
  'node_modules/@highlightjs/cdn-assets/styles/atom-one-light.min.css',
  'dist/vendor/highlight-theme-light.css'
);

// CodeMirror 5 — 코드 에디터 (통과 코드 입력란)
// UMD bundle이라 번들러 없이 <script>로 include 가능
// dist/vendor/codemirror/ 구조:
//   codemirror.js + codemirror.css (core)
//   theme/material-darker.css (dark 테마)
//   mode/<lang>.js (각 언어 syntax)
//   addon/edit/matchbrackets.js + closebrackets.js
//   addon/display/placeholder.js
const cmRoot = 'node_modules/codemirror';
copyFile(`${cmRoot}/lib/codemirror.js`, 'dist/vendor/codemirror/codemirror.js');
copyFile(`${cmRoot}/lib/codemirror.css`, 'dist/vendor/codemirror/codemirror.css');
// dark / light 둘 다 복사 — theme 변경 시 CodeMirror.setOption('theme', ...)으로 dynamic
copyFile(`${cmRoot}/theme/material-darker.css`, 'dist/vendor/codemirror/theme/material-darker.css');
copyFile(`${cmRoot}/theme/material.css`, 'dist/vendor/codemirror/theme/material.css');

// 언어 모드 — LeetCode에서 자주 쓰는 것 위주
// clike: C, C++, Java, C#, Kotlin, Scala 모두 포함
// dart는 clike 의존 → clike 먼저 로드되어야
const cmModes = ['clike', 'python', 'javascript', 'go', 'rust', 'swift', 'ruby', 'dart'];
for (const m of cmModes) {
  copyFile(`${cmRoot}/mode/${m}/${m}.js`, `dist/vendor/codemirror/mode/${m}.js`);
}

// addon: 괄호 매칭, 자동 닫기, placeholder
copyFile(`${cmRoot}/addon/edit/matchbrackets.js`, 'dist/vendor/codemirror/addon/matchbrackets.js');
copyFile(`${cmRoot}/addon/edit/closebrackets.js`, 'dist/vendor/codemirror/addon/closebrackets.js');
copyFile(`${cmRoot}/addon/display/placeholder.js`, 'dist/vendor/codemirror/addon/placeholder.js');
copyFile(`${cmRoot}/addon/selection/active-line.js`, 'dist/vendor/codemirror/addon/active-line.js');

// v1.12+ addon: 검색 (Cmd+F) + 코드 fold (큰 블록 접기) + jump-to-line
copyFile(`${cmRoot}/addon/dialog/dialog.js`, 'dist/vendor/codemirror/addon/dialog.js');
copyFile(`${cmRoot}/addon/dialog/dialog.css`, 'dist/vendor/codemirror/addon/dialog.css');
copyFile(`${cmRoot}/addon/search/searchcursor.js`, 'dist/vendor/codemirror/addon/searchcursor.js');
copyFile(`${cmRoot}/addon/search/search.js`, 'dist/vendor/codemirror/addon/search.js');
copyFile(`${cmRoot}/addon/search/jump-to-line.js`, 'dist/vendor/codemirror/addon/jump-to-line.js');
copyFile(`${cmRoot}/addon/fold/foldcode.js`, 'dist/vendor/codemirror/addon/foldcode.js');
copyFile(`${cmRoot}/addon/fold/foldgutter.js`, 'dist/vendor/codemirror/addon/foldgutter.js');
copyFile(`${cmRoot}/addon/fold/foldgutter.css`, 'dist/vendor/codemirror/addon/foldgutter.css');
copyFile(`${cmRoot}/addon/fold/brace-fold.js`, 'dist/vendor/codemirror/addon/brace-fold.js');
copyFile(`${cmRoot}/addon/fold/indent-fold.js`, 'dist/vendor/codemirror/addon/indent-fold.js');
copyFile(`${cmRoot}/addon/fold/comment-fold.js`, 'dist/vendor/codemirror/addon/comment-fold.js');

// ─── KaTeX (수식 렌더링) ──────────────────────────────────────────
// marked-katex-extension가 main 프로세스에서 HTML로 변환 (KaTeX HTML+CSS span 구조).
// renderer는 katex.min.css와 폰트(woff2)만 있으면 즉시 렌더링.
// 폰트는 url(fonts/...) 상대 경로라 dist/vendor/katex/fonts/ 구조 보존 필요.
copyFile('node_modules/katex/dist/katex.min.css', 'dist/vendor/katex/katex.min.css');
copyDir('node_modules/katex/dist/fonts', 'dist/vendor/katex/fonts');

console.log('Done.');
