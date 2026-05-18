// LeetCode GraphQL 공개 엔드포인트로 문제 메타 fetch
// 로그인 불필요 (공개 데이터만 사용)
//
// leetcode.com vs leetcode.cn:
//   leetcode.cn은 Cloudflare bot protection 뒤에 있어 단순 GraphQL 접근 시 HTTP 403
//   ("Just a moment...") 반환. 우회하려면 브라우저 JS challenge 통과 필요 → 복잡.
//   → cn URL을 받아도 com endpoint로 fetch. 대부분 문제가 com/cn slug 공유하므로 동작.
//   cn-only 문제(매우 드물게)는 404로 fail.
//
// submission fetch (Round D):
//   임베드 LeetCode 윈도우의 영속 세션 cookies를 활용해 인증된 GraphQL 호출.
//   LEETCODE_SESSION + csrftoken 두 cookies 필요. submission API는 비공식이라
//   schema 변경 risk 있음.

import { session } from 'electron';
import { LeetCodeProblem } from '../types';

const GRAPHQL_URL = 'https://leetcode.com/graphql/';

const QUESTION_QUERY = `
query questionData($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionFrontendId
    title
    titleSlug
    content
    difficulty
    exampleTestcases
    topicTags { name slug }
    codeSnippets { lang langSlug code }
  }
}
`;

// frontendId(예: "1") → titleSlug 해결용 — searchKeywords로 검색 후 정확 매칭
const SEARCH_QUERY = `
query problemsetQuestionList($filters: QuestionListFilterInput) {
  problemsetQuestionList: questionList(
    categorySlug: "all-code-essentials"
    limit: 20
    skip: 0
    filters: $filters
  ) {
    questions: data {
      questionFrontendId
      titleSlug
      title
    }
  }
}
`;

async function graphqlRequest(
  body: object,
  titleSlugForReferer?: string
): Promise<any> {
  const referer = titleSlugForReferer
    ? `https://leetcode.com/problems/${titleSlugForReferer}/`
    : `https://leetcode.com/`;
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Referer: referer,
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    if (res.status === 429) {
      throw new Error(`LeetCode 요청 제한 (HTTP 429) — 잠시 후 다시 시도해주세요`);
    }
    if (res.status >= 500) {
      throw new Error(`LeetCode 서버 응답 오류 (HTTP ${res.status}) — 잠시 후 다시 시도해주세요`);
    }
    throw new Error(`LeetCode 응답 오류 (HTTP ${res.status})`);
  }

  const json = (await res.json()) as {
    data?: any;
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new Error(`LeetCode GraphQL: ${json.errors.map((e) => e.message).join('; ')}`);
  }
  return json.data;
}

export async function fetchProblem(titleSlug: string): Promise<LeetCodeProblem> {
  const data = await graphqlRequest(
    { query: QUESTION_QUERY, variables: { titleSlug } },
    titleSlug
  );
  if (!data?.question) {
    throw new Error(
      `LeetCode에서 "${titleSlug}" 문제를 찾을 수 없어요 — URL 또는 문제 이름을 확인해주세요`
    );
  }
  // v1.0+ platform discriminator 명시 — Problem union type narrowing 안정성
  return { platform: 'LeetCode', ...(data.question as LeetCodeProblem) };
}

// ─── submission 자동 가져오기 (Round D) ─────────────────────────
// LeetCode는 인증된 GraphQL로 사용자별 submission list 제공.
// 임베드 LeetCode 윈도우(persist:leetcode 파티션)의 cookies 활용 → CSRF + session.

const SUBMISSION_LIST_QUERY = `
query submissionList($offset: Int!, $limit: Int!, $questionSlug: String!) {
  questionSubmissionList(
    offset: $offset
    limit: $limit
    questionSlug: $questionSlug
  ) {
    submissions {
      id
      statusDisplay
      lang
      langName
      timestamp
    }
  }
}
`;

const SUBMISSION_DETAIL_QUERY = `
query submissionDetails($submissionId: Int!) {
  submissionDetails(submissionId: $submissionId) {
    code
    lang { name verboseName }
    statusCode
  }
}
`;

async function getLeetCodeCookies(): Promise<{ cookieHeader: string; csrf: string | null }> {
  const lcSession = session.fromPartition('persist:leetcode');
  const cookies = await lcSession.cookies.get({ domain: '.leetcode.com' });
  if (cookies.length === 0) {
    // .leetcode.com 도메인이 비어있으면 그냥 leetcode.com도 시도
    const alt = await lcSession.cookies.get({ domain: 'leetcode.com' });
    if (alt.length === 0) return { cookieHeader: '', csrf: null };
    cookies.push(...alt);
  }
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const csrf = cookies.find((c) => c.name === 'csrftoken')?.value || null;
  return { cookieHeader, csrf };
}

async function authedGraphqlRequest(
  body: object,
  cookieHeader: string,
  csrf: string,
  titleSlug: string
): Promise<any> {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
      'X-CSRFToken': csrf,
      Referer: `https://leetcode.com/problems/${titleSlug}/submissions/`,
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 403 || res.status === 401) {
      throw new Error(
        `LeetCode 인증 만료 — 임베드 LeetCode 윈도우(헤더 LeetCode 버튼)에서 다시 로그인해주세요`
      );
    }
    throw new Error(`LeetCode submission API 오류 (HTTP ${res.status})`);
  }
  const json = (await res.json()) as { data?: any; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(`LeetCode submission: ${json.errors.map((e) => e.message).join('; ')}`);
  }
  return json.data;
}

// 회고 작성 전 가벼운 확인 — Accepted submission 존재 여부만 (코드는 fetch X).
// 반환값:
//   true  — Accepted 1개 이상 있음
//   false — submission 있지만 Accepted 없음 (또는 submission 0개)
//   null  — 확인 불가 (로그인 안 됨 / API fail / 세션 만료) → silent skip
export async function hasAcceptedSubmission(titleSlug: string): Promise<boolean | null> {
  try {
    const { cookieHeader, csrf } = await getLeetCodeCookies();
    if (!cookieHeader || !csrf) return null;
    const data = await authedGraphqlRequest(
      { query: SUBMISSION_LIST_QUERY, variables: { offset: 0, limit: 20, questionSlug: titleSlug } },
      cookieHeader,
      csrf,
      titleSlug
    );
    const submissions = (data?.questionSubmissionList?.submissions || []) as Array<{
      statusDisplay: string;
    }>;
    return submissions.some((s) => s.statusDisplay === 'Accepted');
  } catch {
    return null;
  }
}

export async function fetchRecentAcceptedSubmission(
  titleSlug: string
): Promise<{ code: string; langSlug: string; langName: string } | null> {
  const { cookieHeader, csrf } = await getLeetCodeCookies();
  if (!cookieHeader || !csrf) {
    throw new Error(
      `LeetCode 로그인 정보가 없어요 — 헤더의 LeetCode 버튼으로 임베드 윈도우 열고 로그인 후 다시 시도해주세요`
    );
  }

  // 1) 최근 submission list 가져오기
  const listData = await authedGraphqlRequest(
    {
      query: SUBMISSION_LIST_QUERY,
      variables: { offset: 0, limit: 20, questionSlug: titleSlug },
    },
    cookieHeader,
    csrf,
    titleSlug
  );
  const submissions = (listData?.questionSubmissionList?.submissions || []) as Array<{
    id: string;
    statusDisplay: string;
    lang: string;
    langName: string;
    timestamp: string;
  }>;

  const accepted = submissions.find((s) => s.statusDisplay === 'Accepted');
  if (!accepted) {
    throw new Error(
      `이 문제의 최근 Accepted submission이 없어요 — LeetCode에서 먼저 풀어주세요`
    );
  }

  // 2) submission detail (code) 가져오기
  const detailData = await authedGraphqlRequest(
    {
      query: SUBMISSION_DETAIL_QUERY,
      variables: { submissionId: parseInt(accepted.id, 10) },
    },
    cookieHeader,
    csrf,
    titleSlug
  );
  const detail = detailData?.submissionDetails as
    | { code: string; lang: { name: string; verboseName: string }; statusCode: number }
    | undefined;
  if (!detail?.code) {
    throw new Error(`submission 코드를 가져올 수 없어요 — LeetCode 응답 형식 변경 가능성`);
  }

  return {
    code: detail.code,
    langSlug: accepted.lang,
    langName: accepted.langName || detail.lang.verboseName,
  };
}

// frontendId(예: "1") → titleSlug 해결
// searchKeywords로 검색 후 정확히 일치하는 frontendId의 titleSlug 반환
export async function resolveTitleSlugByFrontendId(frontendId: string): Promise<string> {
  const data = await graphqlRequest({
    query: SEARCH_QUERY,
    variables: { filters: { searchKeywords: frontendId } },
  });
  const questions = data?.problemsetQuestionList?.questions as Array<{
    questionFrontendId: string;
    titleSlug: string;
    title: string;
  }> | undefined;

  if (!questions || questions.length === 0) {
    throw new Error(
      `LeetCode에서 문제 #${frontendId}을(를) 찾을 수 없어요 — 번호를 확인해주세요`
    );
  }

  // 정확히 같은 frontendId 매칭 (searchKeywords는 부분 매칭이라 "1" 검색 시 "10", "100"도 나옴)
  const exact = questions.find((q) => q.questionFrontendId === frontendId);
  if (!exact) {
    throw new Error(
      `LeetCode에서 문제 #${frontendId}을(를) 찾을 수 없어요 — 번호를 확인해주세요`
    );
  }
  return exact.titleSlug;
}
