// Claude API로 문제 HTML을 깔끔한 한국어 마크다운으로 변환
// LeetCode (영어 원문): 번역
// Programmers (한국어 원문): 정리만 (번역 X, 마크다운 형식 정돈)

import Anthropic from '@anthropic-ai/sdk';
import { LeetCodeProblem, ProgrammersProblem, AtCoderProblem, CodeforcesProblem, Problem } from '../types';
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

// AtCoder — 영어(또는 일본어) 원문 → 한국어 번역. LeetCode prompt와 유사하지만
// statement에 score / time limit 등이 statement 안에 포함되어 있어 그대로 살림.
function buildAtcoderPrompt(problem: AtCoderProblem): string {
  const langLabel = problem.statementLang === 'ja' ? '일본어' : problem.statementLang === 'en' ? '영어' : '영어/일본어';
  const sourceLangRule =
    problem.statementLang === 'ja'
      ? '원문이 일본어 — 자연스러운 한국어로 번역. 알고리즘 용어는 영어 병기 가능 (예: "동적 계획법(DP)").'
      : '원문이 영어 — 자연스러운 한국어로 번역. 알고리즘 용어는 영어 그대로 또는 한국어 병기.';

  return `너는 AtCoder 문제를 한국어로 옮기는 번역가야. 다음 문제(${langLabel} 원문)를 자연스러운 한국어 마크다운으로 변환해줘.

[메타]
- 콘테스트: ${problem.contestId}
- Task ID: ${problem.taskId}
- 제목: ${problem.title}
- 점수: ${problem.difficulty}

[원문 HTML]
${problem.content}

다음 형식으로만 출력해줘 (코드 블록이나 추가 설명 없이 바로 마크다운 본문):

# ${problem.taskId}. ${problem.title}

> **${problem.difficulty}** · ${problem.contestId} · [원문](${problem.url})

## 문제

(원문을 매끄러운 한국어로 옮긴 본문. HTML 태그는 마크다운으로 변환)

## 제약 조건

(Constraints / 制約 섹션을 불릿으로)

## 입출력

(Input / 入力 형식 설명 + Output / 出力 형식 설명)

## 입출력 예시

### Example 1
\`\`\`
Input: ...
Output: ...
\`\`\`
**설명**: ...

(예시 모두 포함 — Sample Input/Output 또는 入力例/出力例)

---

규칙:
1. ${sourceLangRule}
2. 변수명, 함수명, 자료구조명(예: array, hash map)은 영어 그대로
3. 수식은 \`$...$\` 또는 \`$$...$$\` (AtCoder는 KaTeX 사용 — 원문 형식 그대로 보존)
4. 어색한 직역 금지 (예: "당신은 주어집니다" 같은 표현 X)
5. **이미지 보존**: \`<img src="...">\` 있으면 \`![설명](URL)\` 마크다운으로. URL 변경/단축 금지
6. 마크다운 외 다른 설명/주석 추가 금지`;
}

// Codeforces — 영어 원문 → 한국어 번역. statement HTML이 .problem-statement 전체로
// 헤더(time/memory limit) + body + .sample-tests + .note 다 포함.
function buildCodeforcesPrompt(problem: CodeforcesProblem): string {
  return `너는 Codeforces 문제를 한국어로 옮기는 번역가야. 다음 영어 원문을 자연스러운 한국어 마크다운으로 변환해줘.

[메타]
- 콘테스트: ${problem.contestId}
- Problem index: ${problem.index}
- 제목: ${problem.title}
- 난이도(rating): ${problem.difficulty}

[원문 HTML — .problem-statement 전체]
${problem.content}

다음 형식으로만 출력해줘 (코드 블록이나 추가 설명 없이 바로 마크다운 본문):

# ${problem.contestId}${problem.index}. ${problem.title}

> **${problem.difficulty}** · CF ${problem.contestId} · [원문](${problem.url})

## 문제

(원문 description을 매끄러운 한국어로. HTML 태그는 마크다운으로 변환)

## 입력

(Input 형식 설명)

## 출력

(Output 형식 설명)

## 제약 조건

- (time limit, memory limit, 입력 범위 등 불릿)

## 입출력 예시

### Example 1
\`\`\`
Input: ...
Output: ...
\`\`\`
**설명**: ... (Note 영역이 있으면 여기에)

(sample-tests 안의 모든 예시 포함)

---

규칙:
1. 영어 원문을 자연스러운 한국어로 번역. 어색한 직역 금지
2. 변수명, 함수명, 자료구조명(예: array, hash map)은 영어 그대로
3. 수식은 \`$...$\` 또는 \`$$...$$\` (Codeforces는 MathJax — 원문 형식 보존)
4. **이미지 보존**: \`<img src="...">\`가 있으면 \`![설명](URL)\` 마크다운으로. URL 변경 금지
5. .sample-tests 안의 .input/.output 영역을 정확히 입출력 예시로 변환
6. .note 영역이 있으면 "## 노트" 또는 입출력 예시의 "**설명**" 으로 통합
7. 마크다운 외 다른 설명/주석 추가 금지`;
}

export async function translateProblem(
  problem: Problem,
  onStream?: StreamCallback
): Promise<string> {
  // platform 분기:
  //   LeetCode/AtCoder/Codeforces는 영어→한국어 번역
  //   Programmers는 정리(원문 한국어 보존)
  let prompt: string;
  if (problem.platform === 'Programmers') {
    prompt = buildProgrammersPrompt(problem as ProgrammersProblem);
  } else if (problem.platform === 'AtCoder') {
    prompt = buildAtcoderPrompt(problem as AtCoderProblem);
  } else if (problem.platform === 'Codeforces') {
    prompt = buildCodeforcesPrompt(problem as CodeforcesProblem);
  } else {
    prompt = buildPrompt(problem as LeetCodeProblem);
  }

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
