import { getOpenAIApiKey, getOpenAIModel } from '@/lib/openaiStore'
import { OpenAIApiError } from '@/lib/openaiApi'
import type {
  HabitContract,
  HabitContractPerson,
  HabitContractProof,
  HabitContractProofAnalysis,
  HabitContractSettlement,
} from '@/types'

export interface HabitContractAnalyzeInput {
  imageDataUrls: string[]
  notes?: string
  contract: HabitContract
  person: HabitContractPerson
  people: HabitContractPerson[]
  contracts: HabitContract[]
  proofs: HabitContractProof[]
  excludeProofId?: string
}

export interface HabitContractAnalyzeResult {
  analysis: HabitContractProofAnalysis
  settlements: HabitContractSettlement[]
}

function asAnalysis(raw: unknown): HabitContractProofAnalysis {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const met =
    record.met_goal === true ? true : record.met_goal === false ? false : null
  const penaltyRaw = Number(record.penalty_due)
  const penalty_due = Number.isFinite(penaltyRaw)
    ? Math.max(0, Math.round(penaltyRaw * 100) / 100)
    : 0
  return {
    met_goal: met,
    extracted: typeof record.extracted === 'string' ? record.extracted : '',
    penalty_due,
    penalty_calculation:
      typeof record.penalty_calculation === 'string' ? record.penalty_calculation : '',
    explanation: typeof record.explanation === 'string' ? record.explanation : '',
    confidence: Math.min(1, Math.max(0, Number(record.confidence) || 0)),
  }
}

function compactProofs(proofs: HabitContractProof[]) {
  return proofs.map((proof) => ({
    id: proof.id,
    contract_id: proof.contract_id,
    person_id: proof.person_id,
    date: proof.date,
    status: proof.status,
    analysis: proof.analysis,
    notes: proof.notes,
    photo_count: proof.image_data_urls.length,
  }))
}

export async function analyzeHabitContractProof(
  input: HabitContractAnalyzeInput,
): Promise<HabitContractAnalyzeResult> {
  const payload = {
    images: input.imageDataUrls,
    notes: input.notes ?? '',
    contract: {
      ...input.contract,
      day_count: inclusiveDayCount(input.contract.start_date, input.contract.end_date),
    },
    person: input.person,
    people: input.people.map(({ id, name }) => ({ id, name })),
    contracts: input.contracts.map((contract) => ({
      id: contract.id,
      person_ids: contract.person_ids,
      name: contract.name,
      goal: contract.goal,
      penalty: contract.penalty,
      how_to_calculate: contract.how_to_calculate,
      start_date: contract.start_date,
      end_date: contract.end_date,
    })),
    proofs: compactProofs(
      input.excludeProofId
        ? input.proofs.filter((proof) => proof.id !== input.excludeProofId)
        : input.proofs,
    ),
  }

  try {
    const res = await fetch('/api/contracts/analyze', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      const body = (await res.json()) as {
        analysis?: unknown
        settlements?: HabitContractSettlement[]
      }
      return {
        analysis: asAnalysis(body.analysis),
        settlements: Array.isArray(body.settlements) ? body.settlements : [],
      }
    }
    if (res.status !== 404 && res.status !== 501) {
      let message = 'Could not analyze this proof'
      try {
        const err = (await res.json()) as { error?: { message?: string } }
        if (err.error?.message) message = err.error.message
      } catch {
        /* ignore */
      }
      throw new OpenAIApiError(message, res.status)
    }
  } catch (error) {
    if (error instanceof OpenAIApiError) throw error
  }

  return analyzeWithUserOpenAI(input)
}

function userContent(input: HabitContractAnalyzeInput) {
  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  > = [{ type: 'text', text: buildUserPrompt(input) }]
  for (const url of input.imageDataUrls) {
    content.push({ type: 'image_url', image_url: { url } })
  }
  return content
}

async function analyzeWithUserOpenAI(
  input: HabitContractAnalyzeInput,
): Promise<HabitContractAnalyzeResult> {
  const apiKey = getOpenAIApiKey()
  if (!apiKey) {
    throw new OpenAIApiError(
      'Connect ChatGPT in Settings → Integrations, or set OPENAI_API_KEY for the analyze API.',
      401,
    )
  }

  const res = await fetch('/api/openai', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: getOpenAIModel(),
      temperature: 0.2,
      max_tokens: 1400,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent(input) },
      ],
    }),
  })

  const payload = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[]
    error?: { message?: string }
  } | null

  if (!res.ok) {
    throw new OpenAIApiError(
      payload?.error?.message || 'ChatGPT could not read this proof',
      res.status,
    )
  }

  const content = payload?.choices?.[0]?.message?.content?.trim()
  if (!content) throw new OpenAIApiError('ChatGPT returned an empty analysis', 502)

  let parsed: unknown = {}
  try {
    parsed = JSON.parse(content) as unknown
  } catch {
    parsed = {}
  }
  const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  return {
    analysis: asAnalysis(record.analysis ?? parsed),
    settlements: Array.isArray(record.settlements)
      ? (record.settlements as HabitContractSettlement[])
      : [],
  }
}

export const SYSTEM_PROMPT = `You referee habit contracts between friends.
The person wrote a penalty (the rate/amount) and how_to_calculate (the scoring method). Parse both exactly. Do not invent a different rate.
Proof may be photos, written text, or both. Use every photo and the written statement together.
If a photo is a Screen Time screenshot, read hours and minutes carefully.

Contracts often last a week or more, with one proof at the end covering every day. That is a batch of daily results, not one event.
If how_to_calculate is written, follow it exactly — it is the scoring method. Do not override it with a simpler reading of the penalty.
If how_to_calculate is empty: if the rule is daily, per day, or uses a daily limit, score EVERY day in the proof on its own, then SUM.
Example: "€5 if daily screentime exceeds 2 hours" and 7 days all over 2h → 7 × €5 = €35. Never collapse that to €5 once.
Per-unit overage ("€1 per 10 minutes over 2h") also applies per day, then sum.
Only charge once for the whole window if the written instructions clearly say once per week, once per contract, or a single lump sum.

penalty_due is the summed euro amount (0 if nothing is owed).
penalty_calculation must list each scored day and the total, e.g. "Mon 4h46 (>2h) €5 + Tue 7h08 €5 + … = 7 × €5 = €35".
extracted should list each day's value.
met_goal is true only if every scored day met the goal.
Also estimate the household ledger from prior accepted proofs plus this new result.
Return JSON only.`

function inclusiveDayCount(start: string, end: string | null): number | null {
  if (!start || !end) return null
  const from = Date.parse(`${start}T12:00:00`)
  const to = Date.parse(`${end}T12:00:00`)
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null
  return Math.round((to - from) / 86_400_000) + 1
}

function contractPayload(input: HabitContractAnalyzeInput) {
  return {
    name: input.contract.name,
    goal: input.contract.goal,
    penalty_rule: input.contract.penalty,
    how_to_calculate: input.contract.how_to_calculate,
    person: input.person.name,
    start_date: input.contract.start_date,
    end_date: input.contract.end_date,
    day_count: inclusiveDayCount(input.contract.start_date, input.contract.end_date),
  }
}

function buildUserPrompt(input: HabitContractAnalyzeInput): string {
  return JSON.stringify(
    {
      instruction:
        'Analyze this proof for the contract below. Follow how_to_calculate exactly when it is present. Return {"analysis":{"met_goal":true|false|null,"extracted":"","penalty_due":0,"penalty_calculation":"","explanation":"","confidence":0},"settlements":[{"from_person_id":"","to_person_id":"","amount":0}]}',
      contract: contractPayload(input),
      written_proof: input.notes ?? '',
      photo_count: input.imageDataUrls.length,
      people: input.people.map(({ id, name }) => ({ id, name })),
      prior_proofs: compactProofs(
        input.excludeProofId
          ? input.proofs.filter((proof) => proof.id !== input.excludeProofId)
          : input.proofs,
      ),
    },
    null,
    2,
  )
}
