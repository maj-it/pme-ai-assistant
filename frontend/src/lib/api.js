const API = import.meta.env.VITE_API_URL || '/api'
const TOKEN = import.meta.env.VITE_DEMO_TOKEN || ''
const headers = () => ({ 'Content-Type': 'application/json', ...(TOKEN ? { 'x-demo-token': TOKEN } : {}) })

async function getJson(path) {
  const r = await fetch(`${API}${path}`, { headers: headers() })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}
export const getHealth = () => getJson('/health')
export const getDashboard = () => getJson('/dashboard')

// Flux NDJSON : un événement JSON par ligne (tool, tool_done, text, done, error)
export async function streamChat(message, history, onEvent, signal) {
  const res = await fetch(`${API}/chat/stream`, { method: 'POST', headers: headers(), body: JSON.stringify({ message, history }), signal })
  if (!res.ok) {
    let detail = ''
    try { const j = await res.json(); detail = typeof j.detail === 'string' ? j.detail : '' } catch {}
    throw new Error(detail || `Erreur serveur (${res.status})`)
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (line) onEvent(JSON.parse(line))
    }
  }
}
