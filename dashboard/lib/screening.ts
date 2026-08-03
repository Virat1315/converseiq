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

export type QuestionId = 'experience' | 'skills' | 'salary' | 'relocation' | 'notice';

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
    id: 'skills',
    ask: 'Tell me briefly about your background — and what are the top five skills you would say you are strongest in?',
    label: 'Skills match',
  },
  {
    id: 'salary',
    // Worded to cover both stipends and salaries, since the same campaign shape
    // is used for intern and full-time roles.
    ask: 'What stipend or salary are you expecting, in lakhs per annum?',
    label: 'Expected pay',
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

// Five is the ceiling. The skills question earns its place because it is the
// only open one — the rest are a number or a yes/no.
export const MAX_QUESTIONS = 5;

// ---------------------------------------------------------------------------
// Campaign
// ---------------------------------------------------------------------------

export interface CampaignCriteria {
  /** Role being screened for, spoken by the agent. */
  role: string;
  company: string;
  /** Questions to ask, in order. At most MAX_QUESTIONS. */
  questions: QuestionId[];
  /**
   * Skills the role actually wants. Candidate answers are matched against these
   * to score the `skills` question — an empty list makes it unscoreable.
   */
  desiredSkills: string[];
  /** Budget ceiling in lakhs per annum. */
  maxBudgetLpa: number;
  /** Whether the role actually requires relocation. */
  relocationRequired: boolean;
  minYearsExperience: number;
  /** Longest notice period still workable, in days. */
  maxNoticeDays: number;
  /** The language offered alongside English, as a BCP-47 tag. */
  language: string;
  /** Human name for that language, used in the script. */
  languageLabel: string;
}

export const DEFAULT_CRITERIA: CampaignCriteria = {
  role: 'Product Management Intern',
  company: 'XYZ Company',
  questions: ['experience', 'skills', 'salary', 'relocation', 'notice'],
  desiredSkills: [
    'product sense',
    'user research',
    'data analysis',
    'communication',
    'SQL',
  ],
  // Intern-scale defaults: a stipend rather than a salary, and interns are
  // usually available quickly with little prior experience.
  maxBudgetLpa: 6,
  relocationRequired: true,
  minYearsExperience: 1,
  maxNoticeDays: 30,
  language: 'hi-IN',
  languageLabel: 'Hindi',
};

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export interface ScreeningAnswers {
  /** False when the candidate declined outright; nothing else is asked. */
  interested: boolean | null;
  yearsExperience: number | null;
  /** The candidate's own top skills, in their words. */
  topSkills?: string[] | null;
  expectedSalaryLpa: number | null;
  openToRelocation: boolean | null;
  noticePeriodDays: number | null;
  /** Background the candidate gave, plus anything else notable. */
  notes?: string;
}

/** One spoken turn, as recorded by the agent. */
export interface TranscriptLine {
  role: 'agent' | 'candidate';
  text: string;
  at?: string;
}

export const EMPTY_ANSWERS: ScreeningAnswers = {
  interested: null,
  yearsExperience: null,
  topSkills: null,
  expectedSalaryLpa: null,
  openToRelocation: null,
  noticePeriodDays: null,
};

// ---------------------------------------------------------------------------
// Skill matching
// ---------------------------------------------------------------------------

/** Lowercase, strip punctuation, collapse whitespace. */
function normalizeSkill(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9+#. ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Two skills count as the same if they normalise equal, or if one contains the
 * other — "analytics" should match "product analytics", and "sql" should match
 * "writing SQL queries".
 *
 * Containment is only allowed from 3 characters up, or short tokens produce
 * nonsense matches ("go" inside "google docs").
 */
function skillsEqual(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 3 && b.includes(a)) return true;
  if (b.length >= 3 && a.includes(b)) return true;
  return false;
}

export interface SkillMatch {
  matched: string[];
  missing: string[];
  /** Candidate skills that weren't asked for — not penalised, just noted. */
  extra: string[];
  ratio: number;
}

/** Which of the role's desired skills the candidate actually claimed. */
export function matchSkills(claimed: string[], desired: string[]): SkillMatch {
  const c = claimed.map(normalizeSkill).filter(Boolean);
  const d = desired.map(normalizeSkill).filter(Boolean);

  const matched = desired.filter((_, i) => c.some((x) => skillsEqual(x, d[i])));
  const missing = desired.filter((_, i) => !c.some((x) => skillsEqual(x, d[i])));
  const extra = claimed.filter((_, i) => !d.some((y) => skillsEqual(c[i], y)));

  return {
    matched,
    missing,
    extra,
    ratio: d.length === 0 ? 0 : matched.length / d.length,
  };
}

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
  /** Only set for the skills dimension, for the matched/missing chips. */
  skills?: SkillMatch;
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
  /** Matched none of the role's wanted skills — caps the verdict. */
  noSkillOverlap?: boolean;
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

  // Rank ties break toward the more complete screening, so a candidate who
  // answered everything beats one who answered half and happened to match.

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
    let skills: SkillMatch | undefined;

    if (id === 'skills') {
      const claimed = answers.topSkills;
      if (claimed && claimed.length > 0) {
        skills = matchSkills(claimed, criteria.desiredSkills);
        if (criteria.desiredSkills.length === 0) {
          // Nothing to match against — award full marks rather than punish the
          // candidate for a campaign that never listed what it wants.
          ratio = 1;
          detail = `${claimed.length} skills given, none required`;
        } else {
          ratio = skills.ratio;
          detail = `${skills.matched.length} of ${criteria.desiredSkills.length} wanted skills`;
        }
      }
    } else if (id === 'experience') {
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
      skills,
    });
  }

  const total = Math.round(dimensions.reduce((sum, d) => sum + d.points, 0));
  const complete = unanswered.length === 0;

  let verdict: CandidateScore['verdict'];
  if (dimensions.every((d) => d.ratio === null)) verdict = 'no-data';
  else if (total >= 75) verdict = 'strong';
  else if (total >= 45) verdict = 'possible';
  else verdict = 'weak';

  // Skills are one dimension among several, so a candidate with none of the
  // role's skills can still clear 75 by being cheap, available and willing to
  // move. That is not a strong match for the job — cap the label so they stay
  // visible without heading the shortlist.
  const skillDim = dimensions.find((d) => d.id === 'skills');
  const noSkillOverlap =
    skillDim !== undefined &&
    skillDim.ratio === 0 &&
    criteria.desiredSkills.length > 0;

  if (noSkillOverlap && verdict === 'strong') verdict = 'possible';

  return { total, dimensions, unanswered, complete, verdict, noSkillOverlap };
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
 * Placeholder shown in the Campaign preview, where no real candidate exists yet.
 */
export const SAMPLE_CANDIDATE_NAME = 'Priya';

/**
 * The screening script handed to the agent.
 *
 * This is what keeps the bot on task: it states exactly what to say, what to
 * ask, in what order, and forbids answering anything else.
 *
 * `candidateName` is injected per call so the agent can greet the person by
 * name. An imported row with no name column falls back to the phone number,
 * which must never be read out — pass undefined instead.
 */
export function buildAgentInstructions(
  criteria: CampaignCriteria,
  candidateName?: string
): string {
  const enabled = criteria.questions
    .slice(0, MAX_QUESTIONS)
    .map((id) => QUESTIONS.find((q) => q.id === id)!);

  const numbered = enabled.map((q, i) => `${i + 1}. ${q.ask}`).join('\n');

  const wantsSkills = enabled.some((q) => q.id === 'skills');
  const name = candidateName?.trim();
  const greetBy = name ? `${name} by name` : 'them';
  const thanksExample = name
    ? `"Thank you so much, ${name} — someone from our team will be in touch soon!"`
    : `"Thank you so much — someone from our team will be in touch soon!"`;

  return `You are calling ${name || 'a candidate'} on behalf of ${criteria.company}, about a ${criteria.role} opening at ${criteria.company}.

TONE: warm, upbeat and genuinely excited about the role. Sound like a friendly person who is happy to be calling — never flat, robotic or formal.

OPENING — do this first, before anything else:
- Greet ${greetBy}.
- Say you are calling from ${criteria.company} about a ${criteria.role} opening there.
- Say WHY you are calling them: their profile came through for this role, and you need a few quick details to pass to the recruiter. An unexpected call is unsettling until the person knows what it is about and that it is short.
- Ask whether they would be more comfortable continuing in English or ${criteria.languageLabel || 'Hindi'}, and then speak that language for the rest of the call.
Keep the opening to two or three short sentences.

If at any point they ask why you are calling, who gave them their number, or how long this will take, answer plainly: ${criteria.company} is hiring for the ${criteria.role} role, their profile came up as a potential fit, and you have ${enabled.length} quick questions that take about a minute. That is context about the call itself, so it is always allowed — it is the only thing you may explain.

Then ask the ${enabled.length} questions below, in order:

${numbered}

RULES — follow these exactly:
- Ask ONE question at a time. Wait for the answer before asking the next.
- Keep every message to one or two short sentences. This is a phone call, not an essay.${
    wantsSkills
      ? `
- On the skills question, let them talk. If they name fewer than five skills, ask once for the rest — "and what else would you put in your top five?" — then move on with whatever they gave.
- Record their skills in THEIR OWN WORDS. Do not translate them into the skills you think we want, and do not add any they did not say.
- Do NOT tell them which skills the role is looking for, and do NOT hint that an answer was a good or bad match.`
      : ''
  }
- Do NOT answer questions about stipend or salary bands, benefits, interview rounds, the team, or the company. Say "I'm only collecting a few details right now — the recruiter will cover all of that" and move on to your next question.
- Do NOT invent details about the role, the company, or the process.
- Do NOT give feedback on their answers, and never tell them their score or whether they qualify.
- If they are not interested, thank them warmly, call submit_screening with interested=false, and end the call.
- If they ask to speak to a human, use transfer_call.

CLOSING:
- Once all ${enabled.length} questions are answered, call submit_screening with everything you collected.
- Then say one short, warm thank you — something like ${thanksExample} — and end the call.
- Say the thank you ONCE. Do not ask anything else after it, and do not keep talking.`;
}
