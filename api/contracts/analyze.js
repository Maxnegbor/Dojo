/** Analyze habit-contract proof (photos and/or written text) and estimate who owes whom. */
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method not allowed' } })
    return
  }

  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : ''
  const headerKey = authHeader.replace(/^Bearer\s+/i, '').trim()
  const apiKey = process.env.OPENAI_API_KEY?.trim() || headerKey
  if (!apiKey) {
    res.status(501).json({
      error: {
        message:
          'Set OPENAI_API_KEY on the server, or connect ChatGPT in Settings so photos can be analyzed.',
      },
    })
    return
  }

  const body = req.body ?? {}
  const notes = typeof body.notes === 'string' ? body.notes.trim() : ''
  const rawImages = Array.isArray(body.images)
    ? body.images
    : typeof body.image === 'string'
      ? [body.image]
      : []
  const images = rawImages.filter(
    (url) => typeof url === 'string' && url.startsWith('data:image/'),
  ).slice(0, 4)

  if (images.length === 0 && !notes) {
    res.status(400).json({ error: { message: 'Add a photo or write the proof in text' } })
    return
  }

  const contract = body.contract ?? {}
  const person = body.person ?? {}
  const start = typeof contract.start_date === 'string' ? contract.start_date : ''
  const end = typeof contract.end_date === 'string' ? contract.end_date : ''
  const from = Date.parse(`${start}T12:00:00`)
  const to = Date.parse(`${end}T12:00:00`)
  const dayCount =
    Number.isFinite(from) && Number.isFinite(to) && to >= from
      ? Math.round((to - from) / 86_400_000) + 1
      : typeof contract.day_count === 'number'
        ? contract.day_count
        : null
  const prompt = {
    instruction:
      'Analyze this proof. Follow how_to_calculate exactly when it is present. If it is empty and the penalty is daily, apply it to each day in the proof and sum.',
    contract: {
      name: contract.name,
      goal: contract.goal,
      penalty_rule: contract.penalty,
      how_to_calculate:
        typeof contract.how_to_calculate === 'string' ? contract.how_to_calculate : '',
      person: person.name,
      start_date: start || null,
      end_date: end || null,
      day_count: dayCount,
    },
    written_proof: notes,
    photo_count: images.length,
    people: body.people ?? [],
    prior_proofs: body.proofs ?? [],
  }

  const content = [{ type: 'text', text: JSON.stringify(prompt) }]
  for (const url of images) {
    content.push({ type: 'image_url', image_url: { url } })
  }

  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_CONTRACTS_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 1400,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You referee habit contracts between friends. The person wrote the penalty rule and, separately, how to calculate it. If how_to_calculate is written, follow it exactly — it is the scoring method. Do not override it with a simpler reading of the penalty. Parse the penalty amount/rate exactly and do not invent a different rate. Proof may be photos, written text, or both. Use every photo and the written statement together. If a photo is a Screen Time screenshot, read hours and minutes carefully. Contracts often last a week or more, with one proof at the end covering every day — that is a batch of daily results, not one event. If how_to_calculate is empty and the rule is daily, per day, or uses a daily limit, score EVERY day in the proof on its own, then SUM. Example: "€5 if daily screentime exceeds 2 hours" and 7 days all over 2h → 7 × €5 = €35. Never collapse that to €5 once. Per-unit overage also applies per day, then sum. Only charge once for the whole window if the written instructions clearly say once per week, once per contract, or a single lump sum. penalty_due is the summed euro amount (0 if nothing is owed). penalty_calculation must list each scored day and the total. extracted should list each day\'s value. met_goal is true only if every scored day met the goal. Also estimate who owes whom from prior accepted proofs plus this result. Return JSON only: {"analysis":{"met_goal":true,"extracted":"","penalty_due":0,"penalty_calculation":"","explanation":"","confidence":0},"settlements":[{"from_person_id":"","to_person_id":"","amount":0}]}',
        },
        { role: 'user', content },
      ],
    }),
  })

  const text = await upstream.text()
  if (!upstream.ok) {
    res.status(upstream.status)
    res.setHeader('Content-Type', 'application/json')
    res.send(text)
    return
  }

  let parsedContent = ''
  try {
    const parsed = JSON.parse(text)
    parsedContent = parsed?.choices?.[0]?.message?.content?.trim() ?? ''
  } catch {
    parsedContent = ''
  }

  let result = {}
  try {
    result = parsedContent ? JSON.parse(parsedContent) : {}
  } catch {
    result = { analysis: { explanation: parsedContent, met_goal: null, extracted: '', penalty_due: 0, penalty_calculation: '', confidence: 0 }, settlements: [] }
  }

  res.status(200).json(result)
}
