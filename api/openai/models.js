export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
    res.status(204).end()
    return
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: { message: 'Method not allowed' } })
    return
  }

  const auth = req.headers.authorization
  if (!auth || typeof auth !== 'string') {
    res.status(401).json({ error: { message: 'Missing OpenAI API key' } })
    return
  }

  const upstream = await fetch('https://api.openai.com/v1/models', {
    method: 'GET',
    headers: {
      Authorization: auth,
      Accept: 'application/json',
    },
  })

  const text = await upstream.text()
  res.status(upstream.status)
  res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json')
  res.send(text)
}
