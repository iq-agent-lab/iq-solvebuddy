// 사용자의 통과된 코드를 받아 가독성 개선 + 한국어 주석 + 회고 마크다운 생성

import Anthropic from '@anthropic-ai/sdk';
import { Problem } from '../types';
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

export function resetAnnotatorClient() {
  _client = null;
}

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

function buildPrompt(
  problem: Problem,
  translation: string,
  code: string,
  language: string
): string {
  return `너는 알고리즘 코드 리뷰어야. 다음은 사용자가 LeetCode "${problem.title}" 문제를 통과한 ${language} 코드야.
이 코드를 가독성 측면에서 개선하고 한국어 주석을 달아주되, **알고리즘 로직과 동작은 100% 동일**해야 해.

[문제 (한국어 번역)]
${translation}

[원본 코드 (${language})]
\`\`\`${language}
${code}
\`\`\`

다음 마크다운 형식으로만 출력해줘 (앞뒤 설명/코드펜스 없이 바로 본문):

# 풀이 회고

## 핵심 아이디어

(2~4문장으로 이 풀이의 본질을 설명. "왜 이 방법이 작동하는가"를 중심으로)

## 사용된 자료구조 / 알고리즘

- (예: 해시 맵, 투 포인터, DP, BFS 등)

## 복잡도 분석

- **시간 복잡도**: O(?)
  - (왜 그런지 짧은 설명)
- **공간 복잡도**: O(?)
  - (왜 그런지 짧은 설명)

## 개선된 코드

\`\`\`${language}
(여기에 가독성을 개선한 코드. 규칙:
- 알고리즘 로직 절대 변경 금지 (동작 100% 동일)
- 의미 없는 변수명 개선 (i → leftPointer 등)
- 핵심 단계마다 한국어 한 줄 주석 추가
- 필요시 메서드 추출로 가독성 향상 (단, 동작 동일 유지)
- 매직 넘버는 상수로 추출)
\`\`\`

## 다른 접근

(가능한 다른 풀이 1~2가지를 짧게 설명. 코드는 안 적어도 됨. 각 접근의 트레이드오프 포함)

## 비슷한 문제

- (LeetCode 번호와 제목 형태로 2~3개 추천)

---

규칙:
1. 위 형식 외 다른 출력 금지 (코드 펜스로 전체 감싸지 마)
2. 한국어로 작성하되, 자료구조/알고리즘명은 영어 병기 가능
3. 코드 내 주석도 한국어
4. 변수명/메서드명 자체는 영어 (camelCase 유지)`;
}

export type StreamCallback = (snapshot: string) => void;

function extractText(content: Array<{ type: string }>): string {
  return content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim();
}

export async function annotateCode(
  problem: Problem,
  translation: string,
  code: string,
  language: string,
  onStream?: StreamCallback
): Promise<string> {
  return withRetry(async () => {
    if (onStream) {
      const stream = client().messages.stream({
        model: MODEL,
        max_tokens: 4000,
        messages: [{ role: 'user', content: buildPrompt(problem, translation, code, language) }],
      });
      stream.on('text', (_delta, snapshot) => {
        onStream(snapshot);
      });
      const final = await stream.finalMessage();
      const text = extractText(final.content as Array<{ type: string }>);
      if (!text) throw new Error('회고 생성 결과가 비어있습니다');
      return text;
    }

    // non-streaming fallback
    const response = await client().messages.create({
      model: MODEL,
      max_tokens: 4000,
      messages: [{ role: 'user', content: buildPrompt(problem, translation, code, language) }],
    });
    const text = extractText(response.content as Array<{ type: string }>);
    if (!text) throw new Error('회고 생성 결과가 비어있습니다');
    return text;
  });
}
