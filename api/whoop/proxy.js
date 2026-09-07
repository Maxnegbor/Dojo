/** Same-origin proxy so the browser can call the WHOOP developer API without CORS. */
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
    res.status(204).end()
    return
  }

  if (req.method !== 'GET' && req.method !== 'DELETE') {
    res.status(405).json({ error: { message: 'Method not allowed' } })
    return
  }

  const auth = req.headers.authorization
  if (!auth || typeof auth !== 'string') {
    res.status(401).json({ error: { message: 'Missing WHOOP access token' } })
    return
  }

  const rawPath = req.query.path
  const path = Array.isArray(rawPath) ? rawPath[0] : String(rawPath || '')
  if (!path.startsWith('v2/')) {
    res.status(400).json({ error: { message: 'Invalid WHOOP path' } })
    return
  }

  const incoming = new URL(req.url, 'http://localhost')
  incoming.searchParams.delete('path')
  const search = incoming.searchParams.toString()
  const upstreamUrl = `https://api.prod.whoop.com/developer/${path}${search ? `?${search}` : ''}`

  const upstream = await fetch(upstreamUrl, {
    method: req.method,
    headers: {
      Authorization: auth,
      Accept: 'application/json',
    },
  })

  const text = await upstream.text()
  res.status(upstream.status)
  if (text) {
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json')
    res.send(text)
    return
  }
  res.end()
}
