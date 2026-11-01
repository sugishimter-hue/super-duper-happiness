// AI 직원들의 두뇌: Claude API 호출 (API 키가 없으면 데모 모드로 동작)
import Anthropic from '@anthropic-ai/sdk';
import { SECRETARY } from './seed.js';

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
export const DEMO = process.argv.includes('--demo') || process.env.DEMO_MODE === '1' || !process.env.ANTHROPIC_API_KEY;

const client = DEMO ? null : new Anthropic();

// ───────────────────────── 공통 규칙 ─────────────────────────
const COMPANY_RULES = `
[회사 공통 업무 규칙]
- 모든 결과물은 "초안"이며, 대표가 결재한 뒤에만 외부(고객·SNS·기관)로 나간다. 직접 발송했다고 말하지 않는다.
- 금융·보험: 분석과 정보 정리까지만 한다. 특정 상품 가입 권유, 수익·보장 확정 표현, 단정적 투자 조언은 쓰지 않는다.
- 개인정보: 주민등록번호, 계좌·카드번호 같은 민감정보는 요구하거나 기록하지 않는다. 필요하면 "[고객명]"처럼 자리표시를 쓴다.
- 얼굴분석·심리 상담: 참고 자료 수준으로 쓰고, 의학적·심리 진단처럼 단정하지 않는다.
- 사실을 모르면 지어내지 말고 "[확인 필요: ...]"로 표시한다.
- 한국어로, 바로 복사해서 쓸 수 있게 제목·소제목·목록·표(마크다운)로 깔끔하게 정리한다.
`.trim();

function ownerBlock(owner) {
  return `[대표 정보]\n${owner.name} ${owner.title} (${owner.company})\n${owner.profile}`;
}

function knowledgeBlock(knowledge) {
  if (!knowledge.length) return '';
  return '[회사 지식창고 - 업무에 참고]\n' + knowledge.map((k) => `■ ${k.title}\n${k.content}`).join('\n\n');
}

function systemFor(employee, ctx) {
  return [
    `당신은 ${ctx.owner.name} 대표의 1인 기업에서 일하는 AI 직원 "${employee.name}"입니다. 직무: ${employee.dept} ${employee.role}.`,
    `[나의 업무 지침서]\n${employee.guide}`,
    ownerBlock(ctx.owner),
    COMPANY_RULES,
    knowledgeBlock(ctx.knowledge),
  ]
    .filter(Boolean)
    .join('\n\n');
}

// ───────────────────────── Claude 호출 ─────────────────────────
async function callClaude({ system, messages, effort = 'medium', format }) {
  let res;
  try {
    res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort, ...(format ? { format } : {}) },
      system,
      messages,
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error('API 키가 올바르지 않습니다. .env 의 ANTHROPIC_API_KEY 를 확인해 주세요.');
    if (err instanceof Anthropic.RateLimitError) throw new Error('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
    if (err instanceof Anthropic.APIConnectionError) throw new Error('AI 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.');
    if (err instanceof Anthropic.APIError) throw new Error(`AI 오류 (${err.status}): ${err.message}`);
    throw err;
  }
  if (res.stop_reason === 'refusal') {
    throw new Error('AI가 이 요청은 처리할 수 없다고 응답했습니다. 지시 내용을 바꿔서 다시 시도해 주세요.');
  }
  let text = res.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  if (res.stop_reason === 'max_tokens') text += '\n\n…(분량이 길어 여기서 잘렸습니다. "이어서 써 줘"로 수정 요청하세요)';
  return text;
}

// ───────────────────────── 1) 비서실장: 업무 분배 ─────────────────────────
export async function planOrder(orderText, ctx) {
  const staff = ctx.employees;
  if (DEMO) return demoPlan(orderText, staff);

  const roster = staff.map((e) => `- ${e.id}: ${e.name} (${e.dept} ${e.role}) — ${e.guide}`).join('\n');
  const schema = {
    type: 'object',
    properties: {
      summary: { type: 'string', description: '대표에게 보고할 한두 문장의 분배 요약' },
      assignments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            employee_id: { type: 'string', enum: staff.map((e) => e.id) },
            title: { type: 'string', description: '업무 제목 (20자 이내)' },
            instructions: { type: 'string', description: '그 직원에게 줄 구체적인 작업 지시' },
          },
          required: ['employee_id', 'title', 'instructions'],
          additionalProperties: false,
        },
      },
    },
    required: ['summary', 'assignments'],
    additionalProperties: false,
  };

  const system = [
    `당신은 ${ctx.owner.name} 대표의 AI 비서실장 "${SECRETARY.name}"입니다.`,
    '대표의 지시를 읽고, 실제로 필요한 작업만 골라 1~6개로 나눈 뒤 가장 알맞은 직원에게 배정합니다.',
    '각 지시는 그 직원 혼자 읽어도 바로 일할 수 있게 대상·분량·형식·마감 같은 조건을 구체적으로 씁니다. 대표 지시에 없는 사실은 지어내지 않습니다.',
    `[직원 명단]\n${roster}`,
    ownerBlock(ctx.owner),
    knowledgeBlock(ctx.knowledge),
  ]
    .filter(Boolean)
    .join('\n\n');

  const text = await callClaude({
    system,
    messages: [{ role: 'user', content: `대표 지시: ${orderText}` }],
    effort: 'medium',
    format: { type: 'json_schema', schema },
  });
  const plan = JSON.parse(text);
  plan.assignments = plan.assignments.filter((a) => staff.some((e) => e.id === a.employee_id));
  if (!plan.assignments.length) throw new Error('배정할 직원을 찾지 못했습니다.');
  return plan;
}

// ───────────────────────── 2) 직원: 업무 수행 ─────────────────────────
export async function doTask(task, employee, ctx) {
  if (DEMO) return demoResult(task, employee);

  const messages = [
    {
      role: 'user',
      content: `[대표 원 지시]\n${task.orderText}\n\n[비서실장이 나에게 배정한 업무: ${task.title}]\n${task.instructions}`,
    },
  ];
  // 수정 요청이 있었다면 이전 결과물과 피드백을 이어서 전달
  for (const h of task.history) {
    messages.push({ role: 'assistant', content: h.result });
    messages.push({ role: 'user', content: `[대표 수정 요청]\n${h.feedback}\n\n수정 요청을 반영한 전체 결과물을 다시 작성해 주세요.` });
  }
  return callClaude({ system: systemFor(employee, ctx), messages, effort: 'medium' });
}

// ───────────────────────── 3) 비서실장: 아침 브리핑 ─────────────────────────
export async function makeBriefing(ctx) {
  const tasks = ctx.tasks;
  const nameOf = (id) => ctx.employees.find((e) => e.id === id)?.name ?? '퇴사한 직원';
  const count = (s) => tasks.filter((t) => t.status === s).length;
  const lines = tasks
    .filter((t) => t.status !== 'done' && t.status !== 'rejected')
    .map((t) => `- [${t.status}] ${t.title} (담당 ${nameOf(t.employeeId)})`)
    .join('\n');

  if (DEMO) {
    return [
      `☀️ 좋은 아침입니다, ${ctx.owner.name} 대표님!`,
      '',
      `• 결재 대기 ${count('review')}건 · 작업 중 ${count('working')}건 · 완료 ${count('done')}건`,
      count('review') ? '• 결재함에 확인하실 결과물이 있습니다. 먼저 살펴봐 주세요.' : '• 지금 결재할 건은 없습니다. 오늘 맡기실 일을 지시해 주세요.',
      '',
      '(데모 모드 브리핑입니다. API 키를 넣으면 비서실장이 우선순위와 제안을 직접 정리합니다.)',
    ].join('\n');
  }

  const today = new Date().toLocaleDateString('ko-KR', { dateStyle: 'full', timeZone: 'Asia/Seoul' });
  return callClaude({
    system: `당신은 ${ctx.owner.name} 대표의 AI 비서실장 "${SECRETARY.name}"입니다. 짧고 다정하게, 하지만 핵심만 보고합니다.\n\n${ownerBlock(ctx.owner)}`,
    messages: [
      {
        role: 'user',
        content:
          `오늘은 ${today}입니다. 아래 업무 현황으로 아침 브리핑을 써 주세요. ` +
          `구성: 인사 한 줄 → 현황 숫자 → 오늘 꼭 처리할 3가지(결재 대기 우선) → 대표님께 드리는 제안 1가지. 10줄 이내.\n\n` +
          `결재대기 ${count('review')} / 작업중 ${count('working')} / 완료 ${count('done')} / 오류 ${count('error')}\n${lines || '(진행 중인 업무 없음)'}`,
      },
    ],
    effort: 'low',
  });
}

// ───────────────────────── 데모 모드 ─────────────────────────
function demoPlan(orderText, staff) {
  const scored = staff
    .map((e) => ({ e, score: e.keywords.filter((k) => orderText.toLowerCase().includes(k.toLowerCase())).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((x) => x.e);
  const picked = scored.length ? scored : [staff.find((e) => e.id === 'proposal') ?? staff[0]];
  return {
    summary: `[데모] 지시를 ${picked.length}개 업무로 나눠 ${picked.map((e) => e.name).join(', ')}에게 배정했습니다.`,
    assignments: picked.map((e) => ({
      employee_id: e.id,
      title: `${e.role} 업무`,
      instructions: `대표 지시 "${orderText}"에 대해 ${e.role} 관점의 결과물 초안을 작성하세요.`,
    })),
  };
}

async function demoResult(task, employee) {
  await new Promise((r) => setTimeout(r, 1500 + Math.random() * 2500));
  const rev = task.history.length ? `\n\n> ✏️ 수정 반영 (${task.history.length}차): ${task.history.at(-1).feedback}` : '';
  return `# ${task.title}\n\n**담당:** ${employee.emoji} ${employee.name} (${employee.role})${rev}\n\n## 작업 지시\n${task.instructions}\n\n## 결과물 (데모)\n- 지금은 **데모 모드**라서 예시 결과물이 표시됩니다.\n- \`.env\` 파일에 \`ANTHROPIC_API_KEY\`를 넣고 다시 실행하면 이 직원이 실제로 업무를 처리합니다.\n\n---\n*최종 확인과 발송은 대표님 결재 후 진행됩니다.*`;
}
