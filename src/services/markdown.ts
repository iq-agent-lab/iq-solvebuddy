// 마크다운 → HTML 변환 + KaTeX 수식 렌더링
// marked는 v9+부터 ESM-only라서 dynamic import로 우회
// (TS의 commonjs 컴파일은 await import()을 require()로 변환하므로 Function 트릭 필요)
//
// KaTeX (marked-katex-extension): $...$ inline, $$...$$ block 수식을 KaTeX HTML로
// 변환. CSS는 renderer index.html에서 katex.min.css load. 폰트는 dist/vendor/katex/

const importDynamic = new Function('s', 'return import(s)') as (s: string) => Promise<any>;

let _marked: any = null;

async function getMarked() {
  if (_marked) return _marked;
  const mod = await importDynamic('marked');
  // marked v12+는 named export, v4-v5는 default export 둘 다 가능
  _marked = mod.marked || mod.default;

  if (_marked.setOptions) {
    _marked.setOptions({
      gfm: true,
      breaks: false,
    });
  }

  // KaTeX extension 등록 — $...$ / $$...$$ 자동 렌더링
  // throwOnError: false → 잘못된 LaTeX는 원본 텍스트 그대로 출력 (앱 크래시 방지)
  try {
    const katexMod = await importDynamic('marked-katex-extension');
    const markedKatex = katexMod.default || katexMod;
    _marked.use(
      markedKatex({
        throwOnError: false,
        output: 'html', // mathml 모드는 일부 브라우저 호환성 이슈
      })
    );
  } catch (e) {
    // KaTeX 로드 실패해도 마크다운 자체는 작동해야 함
    console.error('[markdown] KaTeX extension 로드 실패:', e);
  }

  return _marked;
}

export async function renderMarkdown(md: string): Promise<string> {
  const m = await getMarked();
  if (typeof m === 'function') return m(md);
  if (typeof m.parse === 'function') return m.parse(md);
  throw new Error('marked 라이브러리를 로드하지 못했습니다');
}
