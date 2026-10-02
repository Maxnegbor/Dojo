import { rejectMissingSiteKey, siteChatBody, siteOpenAIKey } from './_openai.js'

/** Same-origin ChatGPT proxy. The site key stays on the server. */
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'content-type')
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method not allowed' } })
    return
  }

  const apiKey = siteOpenAIKey()
  if (!apiKey) {
    rejectMissingSiteKey(res)
    return
  }

  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(siteChatBody(req.body)),
  })

  const text = await upstream.text()
  res.status(upstream.status)
  res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json')
  res.send(text)
}
