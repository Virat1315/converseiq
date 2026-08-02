/**
 * Call-screening domain model.
 *
 * The agent only ever captures RAW ANSWERS. All scoring and ranking happens
 * here, on the dashboard side, for two reasons:
 *
 *   1. An LLM asked to "give marks" produces different numbers for identical
 *      answers. Deterministic arithmetic does not.
 *   2. Criteria change after calls are made. Re-ranking twenty finished
 *      candidates against a new budget must not require re-calling anyone.
 */

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export type QuestionId = 'experience' | 'salary' | 'relocation' | 'notice';

export interface ScreeningQuestion {
  id: QuestionId;
  /** What the agent is instructed to ask. */
  ask: string;
  /** Column header in exports and the results table. */
  label: string;
}

/**
 * The full question bank. A campaign may enable at most MAX_QUESTIONS of these
 * — a screening call that runs longer than about a minute gets hung up on.
 */
export const QUESTIONS: ScreeningQuestion[] = [
  {
    id: 'experience',
    ask: 'How many years of relevant experience do you have?',
    label: 'Experience',
  },
  {
    id: 'salary',
    ask: 'What is your expected annual salary, in lakhs per annum?',
    label: 'Expected salary',
  },
  {
    id: 'relocation',
    ask: 'Are you open to relocating for this role?',
    label: 'Relocation',
  },
  {
    id: 'notice',
    ask: 'What is your notice period, and how soon could you start?',
    label: 'Notice period',
  },
];

export const MAX_QUESTIONS = 4;

// ---------------------------------------------------------------------------
// Campaign
// ---------------------------------------------------------------------------

export interface CampaignCriteria {
  /** Role being screened for, spoken by the agent. */
  role: string;
  company: string;
  /** Questions to ask, in order. At most MAX_QUESTIONS. */
  questions: QuestionId[];
  /** Budget ceiling in lakhs per annum. */
  maxBudgetLpa: number;
  /** Whether the role actually requires relocation. */
  relocationRequired: boolean;
  minYearsExperience: number;
  /** Longest notice period still workable, in days. */
  maxNoticeDays: number;
}

export const DEFAULT_CRITERIA: CampaignCriteria = {
  role: 'Product Manager',
  company: 'our company',
  questions: ['experience', 'salary', 'relocation', 'notice'],
  maxBudgetLpa: 30,
  relocationRequired: true,
  minYearsExperience: 3,
  maxNoticeDays: 60,
};

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export interface ScreeningAnswers {
  /** False when the candidate declined outright; nothing else is asked. */
  interested: boolean | null;
  yearsExperience: number | null;
  expectedSalaryLpa: number | null;
  openToRelocation: boolean | null;
  noticePeriodDays: number | null;
  /** Anything notable the agent heard. */
  notes?: string;
}

export const EMPTY_ANSWERS: ScreeningAnswers = {
  interested: null,
  yearsExperience: null,
  expectedSalaryLpa: null,
  openToRelocation: null,
  noticePeriodDays: null,
};

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface DimensionScore {
  id: QuestionId;
  label: string;
  /** 0..1 before weighting. null when the question went unanswered. */
  ratio: number | null;
  /** Points awarded out of `max`. */
  points: number;
  max: number;
  /** Short human explanation, shown in the breakdown. */
  detail: string;
}

export interface CandidateScore {
  /** 0..100. */
  total: number;
  dimensions: DimensionScore[];
  /** Enabled questions that were never answered. */
  unanswered: QuestionId[];
  /** True once every enabled question has an answer. */
  complete: boolean;
  verdict: 'strong' | 'possible' | 'weak' | 'declined' | 'no-data';
}

/** Linear falloff: full marks at or better than target, zero at `zeroAt`. */
function falloff(value: number, target: number, zeroAt: number): number {
  if (zeroAt === target) return value <= target ? 1 : 0;
  if (zeroAt > target) {
    // Lower is better (salary, notice period).
    if (value <= target) return 1;
    if (value >= zeroAt) return 0;
    return 1 - (value - target) / (zeroAt - target);
  }
  // Higher is better (experience).
  if (value >= target) return 1;
  if (value <= zeroAt) return 0;
  return (value - zeroAt) / (target - zeroAt);
}

/**
 * Score one candidate against the campaign.
 *
 * Enabled questions split 100 points evenly, so a three-question campaign is
 * still scored out of 100 and stays comparable with a four-question one.
 */
export function scoreCandidate(
  answers: ScreeningAnswers | null | undefined,
  criteria: CampaignCriteria
): CandidateScore {
  const enabled = criteria.questions.slice(0, MAX_QUESTIONS);
  const max = enabled.length > 0 ? 100 / enabled.length : 0;

  if (!answers) {
    return {
      total: 0,
      dimensions: [],
      unanswered: enabled,
      complete: false,
      verdict: 'no-data',
    };
  }

  // An explicit "not interested" outranks every other signal.
  if (answers.interested === false) {
    return {
      total: 0,
      dimensions: [],
      unanswered: [],
      complete: true,
      verdict: 'declined',
    };
  }

  const dimensions: DimensionScore[] = [];
  const unanswered: QuestionId[] = [];

  for (const id of enabled) {
    const label = QUESTIONS.find((q) => q.id === id)!.label;
    let ratio: number | null = null;
    let detail = 'Not answered';

    if (id === 'experience') {
      const v = answers.yearsExperience;
      if (v !== null && v !== undefined) {
        // Zero marks at "no experience at all"; full at the required minimum.
        ratio = falloff(v, criteria.minYearsExperience, 0);
        detail = `${v} yrs vs ${criteria.minYearsExperience} required`;
      }
    } else if (id === 'salary') {
      const v = answers.expectedSalaryLpa;
      if (v !== null && v !== undefined) {
        // Zero marks at 1.5x budget.
        ratio = falloff(v, criteria.maxBudgetLpa, criteria.maxBudgetLpa * 1.5);
        detail = `${v} LPA vs ${criteria.maxBudgetLpa} budget`;
      }
    } else if (id === 'relocation') {
      const v = answers.openToRelocation;
      if (v !== null && v !== undefined) {
        // If the role doesn't require moving, this can't count against anyone.
        ratio = criteria.relocationRequired ? (v ? 1 : 0) : 1;
        detail = criteria.relocationRequired
          ? v
            ? 'Willing to relocate'
            : 'Will not relocate'
          : 'Relocation not required';
      }
    } else if (id === 'notice') {
      const v = answers.noticePeriodDays;
      if (v !== null && v !== undefined) {
        ratio = falloff(v, criteria.maxNoticeDays, criteria.maxNoticeDays * 2);
        detail = `${v} days vs ${criteria.maxNoticeDays} acceptable`;
      }
    }

    if (ratio === null) unanswered.push(id);

    dimensions.push({
      id,
      label,
      ratio,
      points: ratio === null ? 0 : Math.round(ratio * max * 10) / 10,
      max: Math.round(max * 10) / 10,
      detail,
    });
  }

  const total = Math.round(dimensions.reduce((sum, d) => sum + d.points, 0));
  const complete = unanswered.length === 0;

  let verdict: CandidateScore['verdict'];
  if (dimensions.every((d) => d.ratio === null)) verdict = 'no-data';
  else if (total >= 75) verdict = 'strong';
  else if (total >= 45) verdict = 'possible';
  else verdict = 'weak';

  return { total, dimensions, unanswered, complete, verdict };
}

/**
 * Rank candidates best-match first.
 *
 * Ties break toward the more complete screening — a candidate who answered
 * everything is a safer bet than one who answered half and happened to match.
 */
export function rankCandidates<T extends { answers?: ScreeningAnswers | null }>(
  candidates: T[],
  criteria: CampaignCriteria
): Array<T & { score: CandidateScore; rank: number }> {
  return candidates
    .map((c) => ({ ...c, score: scoreCandidate(c.answers, criteria) }))
    .sort((a, b) => {
      if (b.score.total !== a.score.total) return b.score.total - a.score.total;
      const answeredA = a.score.dimensions.filter((d) => d.ratio !== null).length;
      const answeredB = b.score.dimensions.filter((d) => d.ratio !== null).length;
      return answeredB - answeredA;
    })
    .map((c, i) => ({ ...c, rank: i + 1 }));
}

export const VERDICT_LABEL: Record<CandidateScore['verdict'], string> = {
  strong: 'Strong match',
  possible: 'Possible',
  weak: 'Weak match',
  declined: 'Not interested',
  'no-data': 'No answers',
};

/**
 * The screening script handed to the agent, built from the campaign.
 *
 * This is what keeps the bot on task: it states exactly what to ask, in what
 * order, and forbids answering anything else.
 */
export function buildAgentInstructions(criteria: CampaignCriteria): string {
  const enabled = criteria.questions
    .slice(0, MAX_QUESTIONS)
    .map((id) => QUESTIONS.find((q) => q.id === id)!);

  const numbered = enabled.map((q, i) => `${i + 1}. ${q.ask}`).join('\n');

  return `You are a screening assistant calling about a ${criteria.role} role at ${criteria.company}.

Your ONLY job is to ask the ${enabled.length} questions below, in order, and record the answers.

${numbered}

RULES — follow these exactly:
- Ask ONE question at a time. Wait for the answer before asking the next.
- Keep every message to one short sentence. This is a phone call, not an essay.
- Do NOT answer questions about salary bands, benefits, interview rounds, the team, or the company. Say "I'm only collecting a few details right now — the recruiter will cover that" and continue with your next question.
- Do NOT invent details about the role, the company, or the process.
- Do NOT give feedback on their answers, and never tell them their score or whether they qualify.
- If they are not interested, thank them, call submit_screening with interested=false, and end the call.
- If they ask to speak to a human, use transfer_call.
- Once all ${enabled.length} questions are answered, call submit_screening with everything you collected, thank them briefly, and end the call.

Speak English, or Hindi if they do.`;
}
