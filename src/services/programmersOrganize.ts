// 프로그래머스 정리 모드 — LLM API 호출 없이 cheerio + turndown으로 HTML → markdown 직접 변환
//
// 사용자 명시 요청 (v1.8.0+): 프로그래머스는 원문이 이미 한국어 → 번역 불필요.
// "정리" (HTML → markdown 변환 + 메타 헤더 추가)만 필요하면 LLM도 사실 불필요.
//
// 장점:
//   - 즉시 변환 (LLM streaming 5초+ → 즉시)
//   - API 비용 X
//   - 원문 정확 보존 (LLM의 paraphrasing 위험 X)
//
// 단점:
//   - LLM처럼 자연스럽게 다듬어주진 못함 (1:1 변환)
//   - 표/이미지/수식은 turndown + 후처리로 처리
//
// LeetCode/AtCoder/CF는 영어→한국어 번역 필요라 LLM 유지.

import TurndownService from 'turndown';
// @ts-expect-error — turndown-plugin-gfm은 타입 정의 없음
import { gfm, tables } from 'turndown-plugin-gfm';
import { ProgrammersProblem } from '../types';

// turndown service — singleton 재사용 (생성 비용 절감)
let _td: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (_td) return _td;
  _td = new TurndownService({
    headingStyle: 'atx',         // # H1 (setext 대신 ATX)
    codeBlockStyle: 'fenced',    // ```lang ... ``` 형식
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
    hr: '---',
    br: '  \n',
  });

  // GFM (GitHub Flavored Markdown) — 표/취소선 등
  _td.use(gfm);
  _td.use(tables);

  // 커스텀 rule: 프로그래머스가 종종 사용하는 <code> 안의 변수명을 백틱으로
  // (turndown 기본도 처리하지만 인라인 code 안의 nested 처리 보강)
  _td.addRule('inlineCode', {
    filter: ['code'],
    replacement: (content, node) => {
      // 부모가 pre면 fenced code block (별도 rule)
      const parent = (node as HTMLElement).parentElement;
      if (parent && parent.tagName === 'PRE') return content;
      // 백틱 안에 백틱 들어가면 ``으로
      const tickCount = (content.match(/`+/g) || []).reduce(
        (max, t) => Math.max(max, t.length),
        0
      );
      const wrap = '`'.repeat(tickCount + 1);
      return `${wrap}${content}${wrap}`;
    },
  });

  // 이미지 — alt 보존 + URL 그대로
  _td.addRule('image', {
    filter: 'img',
    replacement: (_content, node) => {
      const el = node as HTMLElement;
      const alt = el.getAttribute('alt') || '';
      const src = el.getAttribute('src') || '';
      if (!src) return '';
      return `![${alt}](${src})`;
    },
  });

  return _td;
}

/**
 * 프로그래머스 문제 HTML → 한국어 markdown.
 * LLM 호출 없이 turndown 기반 변환 + 메타 헤더 추가.
 *
 * @returns 완성된 마크다운 문자열 (LLM 출력과 같은 구조)
 */
export function organizeProgrammersMarkdown(problem: ProgrammersProblem): string {
  const td = getTurndown();

  // 본문 HTML → markdown (turndown)
  let bodyMd = '';
  try {
    bodyMd = td.turndown(problem.content || '');
  } catch (e) {
    // turndown 실패 시 raw HTML fallback (사용자가 알아볼 수 있게)
    bodyMd = `*변환 실패 — 원본 HTML:*\n\n\`\`\`html\n${problem.content}\n\`\`\``;
  }

  // 메타 헤더 + 본문 — LLM prompt 출력 형식과 동일
  const header = `# ${problem.title}

> **${problem.difficulty}** · [원문](${problem.url})

## 문제

`;

  return `${header}${bodyMd.trim()}\n`;
}
