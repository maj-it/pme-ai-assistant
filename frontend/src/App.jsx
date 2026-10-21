import React, { useCallback, useEffect, useRef, useState } from 'react'
import Chat from './components/Chat.jsx'
import Dashboard from './components/Dashboard.jsx'
import Icon from './components/Icon.jsx'
import { eur } from './lib/format.js'
import { getHealth, getDashboard, streamChat } from './lib/api.js'
import { uid } from './lib/format.js'
import { SUGGESTIONS } from './lib/suggestions.js'

const KEY = 'blc_assistant_v2'
const load = () => {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || '{}')
    const messages = (d.messages || []).map(m => (m.status === 'streaming' ? { ...m, status: 'stopped' } : m))
    return { messages, history: d.history || [] }
  } catch { return { messages: [], history: [] } }
}

const MODE = {
  ollama: { dot: 'bg-good', text: 'Ollama' },
  ollama_down: { dot: 'bg-bad', text: 'Ollama injoignable' },
  anthropic: { dot: 'bg-good', text: 'Claude connecté' },
  offline: { dot: 'bg-warn', text: 'Démo hors ligne' },
  down: { dot: 'bg-bad', text: 'Serveur injoignable' },
  loading: { dot: 'bg-mute', text: 'Connexion…' },
}

export default function App() {
  const init = useRef(load()).current
  const [messages, setMessages] = useState(init.messages)
  const [history, setHistory] = useState(init.history)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState('chat')
  const [mode, setMode] = useState('loading')
  const [model, setModel] = useState(null)
  const [snap, setSnap] = useState(null)
  const [dark, setDark] = useState(() => { try { return (localStorage.getItem('blc_theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark' } catch { return false } })
  const abort = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try { localStorage.setItem('blc_theme', dark ? 'dark' : 'light') } catch {}
  }, [dark])

  useEffect(() => {
    let alive = true
    const ping = () => getHealth().then(h => { if (!alive) return; setMode(h.mode === 'ollama' && !h.ready ? 'ollama_down' : h.mode); setModel(h.model) }).catch(() => alive && setMode('down'))
    ping()
    getDashboard().then(d => alive && setSnap(d.kpis)).catch(() => {})
    const t = setInterval(ping, 20000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  useEffect(() => {
    if (busy) return
    try { localStorage.setItem(KEY, JSON.stringify({ messages: messages.slice(-60), history })) } catch {}
  }, [messages, history, busy])

  useEffect(() => {
    const onKey = e => { if (e.key === '/' && tab === 'chat' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) { e.preventDefault(); inputRef.current?.focus() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab])

  const run = useCallback(async (text, baseHistory, baseMessages) => {
    const id = uid()
    const asst = { id, role: 'assistant', text: '', tools: [], status: 'streaming', historyBefore: baseHistory, userText: text, brk: false }
    setMessages([...baseMessages, { id: uid(), role: 'user', text }, asst])
    setBusy(true)
    const ctrl = new AbortController()
    abort.current = ctrl
    const patch = fn => setMessages(ms => ms.map(m => (m.id === id ? fn(m) : m)))
    try {
      await streamChat(text, baseHistory, ev => {
        if (ev.t === 'tool') patch(m => ({ ...m, brk: !!m.text, tools: [...m.tools, { id: ev.id, label: ev.label, source: ev.source, status: 'running' }] }))
        else if (ev.t === 'tool_done') patch(m => ({ ...m, tools: m.tools.map(t => (t.id === ev.id ? { ...t, status: 'done', label: ev.label || t.label, widget: ev.widget } : t)) }))
        else if (ev.t === 'text') patch(m => ({ ...m, text: m.text + (m.brk ? '\n\n' : '') + ev.d, brk: false }))
        else if (ev.t === 'done') setHistory(ev.history)
        else if (ev.t === 'error') patch(m => ({ ...m, error: ev.message }))
      }, ctrl.signal)
      patch(m => ({ ...m, status: 'done' }))
    } catch (e) {
      if (e.name === 'AbortError') patch(m => ({ ...m, status: 'stopped' }))
      else patch(m => ({ ...m, status: 'done', error: /fetch|network/i.test(e.message) ? 'Serveur injoignable. Vérifiez que le backend tourne (port 8000).' : e.message }))
    } finally {
      setBusy(false)
      abort.current = null
    }
  }, [])

  const send = useCallback(text => {
    if (busy) return
    setTab('chat')
    run(text, history, messages)
  }, [busy, history, messages, run])

  const regenerate = () => {
    if (busy) return
    const last = messages[messages.length - 1]
    if (last?.role !== 'assistant') return
    run(last.userText, last.historyBefore || [], messages.slice(0, -2))
  }
  const reset = () => { if (busy) abort.current?.abort(); setMessages([]); setHistory([]); try { localStorage.removeItem(KEY) } catch {} }
  const exportMd = () => {
    const md = messages.map(m => m.role === 'user' ? `**Vous**\n\n${m.text}` : `**Assistant**\n\n${m.text || ''}`).join('\n\n---\n\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }))
    a.download = `conversation-${new Date().toISOString().slice(0, 10)}.md`
    a.click(); URL.revokeObjectURL(a.href)
  }

  const m = MODE[mode]
  return (
    <div className="flex h-full flex-col bg-page text-ink">
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-card px-3 py-2.5 sm:px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand2 text-sm font-bold text-white">B</div>
        <div className="hidden min-w-0 sm:block">
          <div className="text-sm font-semibold leading-tight">PME AI Assistant</div>
          <div className="truncate text-[11px] text-mute">Propulsé par BLC Conseil · Sage 100 · Pipedrive · Agicap</div>
        </div>
        <nav className="ml-2 flex rounded-xl bg-soft p-1 text-xs font-semibold sm:ml-6" aria-label="Vues">
          {[['chat', 'Assistant', 'Assistant'], ['dash', 'Tableau de bord', 'Tableau']].map(([k, l, s]) => (
            <button key={k} onClick={() => setTab(k)} aria-current={tab === k} className={`whitespace-nowrap rounded-lg px-3 py-1.5 transition ${tab === k ? 'bg-card text-ink shadow-card' : 'text-mute hover:text-ink'}`}><span className="hidden sm:inline">{l}</span><span className="sm:hidden">{s}</span></button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] text-mute sm:flex"><i className={`h-2 w-2 rounded-full ${m.dot} ${mode === 'ollama' || mode === 'anthropic' ? 'animate-pulse' : ''}`} />{m.text}{mode === 'ollama' && model ? ` · ${model}` : ''}</span>
          {tab === 'chat' && messages.length > 0 && (
            <>
              <button onClick={exportMd} title="Exporter la conversation" aria-label="Exporter la conversation" className="rounded-lg p-2 text-mute hover:bg-soft hover:text-ink"><Icon name="download" /></button>
              <button onClick={reset} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-mute hover:bg-soft hover:text-ink"><Icon name="plus" className="h-3.5 w-3.5" /><span className="hidden sm:inline">Nouvelle conversation</span></button>
            </>
          )}
          <button onClick={() => setDark(d => !d)} title="Thème" aria-label="Changer de thème" className="rounded-lg p-2 text-mute hover:bg-soft hover:text-ink"><Icon name={dark ? 'sun' : 'moon'} /></button>
        </div>
      </header>

      {mode === 'ollama_down' && <div role="alert" className="bg-warn/10 px-4 py-2 text-center text-xs text-warn">Ollama ne répond pas : démarrez-le (<code>docker start ollama</code> ou <code>ollama serve</code>) et vérifiez qu'un modèle est installé (<code>ollama pull qwen2.5:7b</code>).</div>}
      {mode === 'down' && <div role="alert" className="bg-bad/10 px-4 py-2 text-center text-xs text-bad">Serveur injoignable : lancez le backend (<code>uvicorn main:app --port 8000</code>) puis rechargez.</div>}

      <div className="flex min-h-0 flex-1">
        {tab === 'chat' && (
          <aside className="scroll hidden w-72 shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-card p-4 lg:flex">
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-mute">Instantané</div>
              {snap ? (
                <div className="space-y-2">
                  {[['Trésorerie', eur(snap.solde), 'text-ink'], ['Impayés', eur(snap.total_impaye), 'text-bad'], ['Pipeline pondéré', eur(snap.pipeline_pondere), 'text-ink']].map(([l, v, c]) => (
                    <div key={l} className="flex items-baseline justify-between rounded-xl bg-soft px-3 py-2"><span className="text-xs text-mute">{l}</span><span className={`text-sm font-bold tnum ${c}`}>{v}</span></div>
                  ))}
                  <button onClick={() => setTab('dash')} className="w-full text-left text-xs font-semibold text-accent hover:underline">Voir le tableau de bord →</button>
                </div>
              ) : <div className="h-28 animate-pulse rounded-xl bg-soft" />}
            </div>
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-mute">Suggestions</div>
              <div className="flex flex-col gap-1.5">
                {SUGGESTIONS.map(s => (
                  <button key={s.q} onClick={() => send(s.q)} disabled={busy} className="rounded-xl px-3 py-2 text-left text-xs text-ink/80 hover:bg-soft disabled:opacity-50">{s.q}</button>
                ))}
              </div>
            </div>
            <div className="mt-auto rounded-xl border border-line p-3 text-xs">
              <div className="mb-1.5 font-semibold text-mute">Sources connectées</div>
              {['Sage 100 · factures', 'Pipedrive · clients, CRM', 'Agicap · trésorerie'].map(s => (
                <div key={s} className="flex items-center gap-2 py-0.5"><i className={`h-1.5 w-1.5 rounded-full ${mode === 'down' ? 'bg-bad' : 'bg-good'}`} />{s}</div>
              ))}
              <div className="mt-2 text-[11px] text-mute">Données simulées pour la démonstration.</div>
            </div>
          </aside>
        )}
        <main className="min-w-0 flex-1">
          {tab === 'chat'
            ? <Chat messages={messages} busy={busy} mode={mode} onSend={send} onStop={() => abort.current?.abort()} onRegenerate={regenerate} inputRef={inputRef} />
            : <Dashboard onAsk={send} />}
        </main>
      </div>
    </div>
  )
}
