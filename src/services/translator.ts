// Claude API로 문제 HTML을 깔끔한 한국어 마크다운으로 변환
// LeetCode (영어 원문): 번역
// Programmers (한국어 원문): 정리만 (번역 X, 마크다운 형식 정돈)

import Anthropic from '@anthropic-ai/sdk';
import { LeetCodeProblem, ProgrammersProblem, Problem } from '../types';
import { withRetry } from '../util/language';

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다 — ⚙️ 설정에서 입력해주세요');
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export function resetTranslatorClient() {
  _client = null;
}

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

function buildPrompt(problem: LeetCodeProblem): string {
  const tags = problem.topicTags.map((t) => t.name).join(', ');
  return `너는 LeetCode 문제를 한국어로 옮기는 번역가야. 다음 문제를 자연스러운 한국어 마크다운으로 변환해줘.

[메타]
- 문제 번호: ${problem.questionFrontendId}
- 제목: ${problem.title}
- 난이도: ${problem.difficulty}
- 태그: ${tags}

[원문 HTML]
${problem.content}

[원문 예시 입출력]
${problem.exampleTestcases}

다음 형식으로만 출력해줘 (코드 블록이나 추가 설명 없이 바로 마크다운 본문):

# ${problem.questionFrontendId}. ${problem.title}

> **${problem.difficulty}** · ${tags} · [원문](https://leetcode.com/problems/${problem.titleSlug}/)

## 문제

(원문을 매끄러운 한국어로 옮긴 본문. HTML 태그는 마크다운으로 변환)

## 입출력 예시

### Example 1
\`\`\`
Input: ...
Output: ...
\`\`\`
**설명**: ...

(예시가 여러 개면 모두 포함)

## 제약 조건

- (constraints를 불릿으로)

---

규칙:
1. 변수명, 함수명, 클래스명, 자료구조명(예: array, hash map)은 영어 그대로 두기. 단, 자연스러우면 한국어 병기 가능 (예: "해시 맵(hash map)")
2. 수식은 \`$...$\` 또는 코드 백틱 사용
3. 영어 원문의 뉘앙스를 살리되 자연스러운 한국어 문장
4. 어색한 직역 금지 (예: "당신은 주어집니다" 같은 표현 X)
5. **이미지는 반드시 보존**: 원문 HTML에 \`<img src="...">\`가 있으면 마크다운 \`![설명](원본URL)\` 형식으로 변환. URL은 절대 변경/단축하지 말 것. alt 텍스트는 한국어로 짧게 (예: "예시 1 다이어그램")
6. 마크다운 외 다른 설명/주석 추가 금지`;
}

export type StreamCallback = (snapshot: string) => void;

function extractText(content: Array<{ type: string }>): string {
  return content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim();
}

// Programmers — 한국어 원문이라 *번역*이 아닌 *정리* 모드.
// 원문 한국어 그대로 보존 + HTML 태그를 깔끔한 마크다운으로 변환 + 메타 헤더 추가.
function buildProgrammersPrompt(problem: ProgrammersProblem): string {
  return `너는 프로그래머스 문제 본문을 정리하는 도우미야. 다음 한국어 원문 HTML을 깔끔한 마크다운으로 정리해줘.

[메타]
- 문제 번호: ${problem.lessonId}
- 제목: ${problem.title}
- 난이도: ${problem.difficulty}
- 원문: ${problem.url}

[원문 HTML]
${problem.content}

다음 형식으로만 출력해줘 (코드 블록이나 추가 설명 없이 바로 마크다운 본문):

# ${problem.title}

> **${problem.difficulty}** · [원문](${problem.url})

## 문제

(원문 본문을 한국어 그대로 보존 + HTML 태그는 마크다운으로 변환. 번역하지 말 것 — 한국어 원문 유지)

## 입출력 예시

(원문에 있는 테이블이나 예시를 마크다운 표 또는 코드블록으로)

## 제한사항

(원문에 있으면 불릿으로)

---

규칙:
1. **번역 금지** — 원문이 한국어이므로 그대로 유지. 영어/일본어 등으로 옮기지 말 것
2. HTML 태그(<p>, <code>, <table> 등)만 마크다운으로 변환
3. 변수명/함수명/자료구조명은 원문 그대로
4. 수식은 \`$...$\` 또는 코드 백틱
5. **이미지 보존**: \`<img src="...">\`가 있으면 \`![설명](URL)\` 마크다운으로. URL 변경/단축 금지
6. SQL 문제도 동일 — 본문 + 예시 테이블 그대로 마크다운 변환
7. 마크다운 외 다른 설명/주석 추가 금지`;
}

export async function translateProblem(
  problem: Problem,
  onStream?: StreamCallback
): Promise<string> {
  // platform 분기 — LeetCode는 번역, Programmers는 정리
  const prompt =
    problem.platform === 'Programmers'
      ? buildProgrammersPrompt(problem as ProgrammersProblem)
      : buildPrompt(problem as LeetCodeProblem);

  return withRetry(async () => {
    if (onStream) {
      const stream = client().messages.stream({
        model: MODEL,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });
      stream.on('text', (_delta, snapshot) => {
        onStream(snapshot);
      });
      const final = await stream.finalMessage();
      const text = extractText(final.content as Array<{ type: string }>);
      if (!text) throw new Error('번역 결과가 비어있습니다');
      return text;
    }

    // non-streaming fallback
    const response = await client().messages.create({
      model: MODEL,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = extractText(response.content as Array<{ type: string }>);
    if (!text) throw new Error('번역 결과가 비어있습니다');
    return text;
  });
}
