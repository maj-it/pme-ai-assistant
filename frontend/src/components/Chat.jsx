import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import Markdown from './Markdown.jsx'
import Widget from './Widgets.jsx'
import { SUGGESTIONS, followups } from '../lib/suggestions.js'

function ToolChip({ t }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1 text-[11px] text-mute animate-rise">
      {t.status === 'running'
        ? <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        : <Icon name="check" className="h-3 w-3 text-good" />}
      <span className="font-medium text-ink">{t.label}</span>
      {t.source && <span className="hidden sm:inline">· {t.source}</span>}
    </span>
  )
}

function Thinking() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-2" aria-label="Claude réfléchit">
      {[0, 1, 2].map(i => <span key={i} className="h-1.5 w-1.5 animate-dots rounded-full bg-mute" style={{ animationDelay: `${i * 0.16}s` }} />)}
    </div>
  )
}

function Avatar({ user }) {
  return user
    ? <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-page"><Icon name="user" className="h-4 w-4" /></div>
    : <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand2 text-[11px] font-bold text-white">IA</div>
}

function Assistant({ m, last, busy, onAsk, onRegenerate }) {
  const [copied, setCopied] = useState(false)
  const streaming = m.status === 'streaming'
  const widgets = (m.tools || []).filter(t => t.widget)
  const allDone = (m.tools || []).every(t => t.status === 'done')
  const copy = async () => { try { await navigator.clipboard.writeText(m.text); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {} }
  return (
    <div className="flex gap-3 animate-rise">
      <Avatar />
      <div className="min-w-0 flex-1 space-y-3">
        {m.tools?.length > 0 && <div className="flex flex-wrap gap-1.5">{m.tools.map(t => <ToolChip key={t.id} t={t} />)}</div>}
        {widgets.map(t => <Widget key={t.id} widget={t.widget} onAsk={onAsk} />)}
        {streaming && !m.text && allDone && <Thinking />}
        {m.text && (
          <div className="rounded-2xl rounded-tl-md border border-line bg-card px-4 py-3 text-sm leading-relaxed shadow-card">
            <Markdown>{m.text}</Markdown>
            {streaming && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-blink bg-accent" />}
          </div>
        )}
        {m.error && <div role="alert" className="rounded-xl border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{m.error}</div>}
        {m.status === 'stopped' && <div className="text-xs text-mute">Réponse interrompue.</div>}
        {!streaming && (m.text || m.error) && (
          <div className="flex flex-wrap items-center gap-1 text-mute">
            {m.text && <button onClick={copy} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-soft"><Icon name={copied ? 'check' : 'copy'} className="h-3.5 w-3.5" />{copied ? 'Copié' : 'Copier'}</button>}
            {last && <button onClick={onRegenerate} disabled={busy} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-soft disabled:opacity-40"><Icon name="refresh" className="h-3.5 w-3.5" />Régénérer</button>}
          </div>
        )}
        {last && !streaming && !m.error && !busy && (
          <div className="flex flex-wrap gap-2">
            {followups(m).map(q => (
              <button key={q} onClick={() => onAsk(q)} className="rounded-full border border-line bg-card px-3 py-1.5 text-xs font-medium text-accent hover:border-accent/50 hover:bg-accent/5">{q}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Empty({ onAsk, mode }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center px-4 pt-10 text-center sm:pt-16 animate-rise">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand2 text-xl font-bold text-white shadow-card">B</div>
      <h2 className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl">Que souhaitez-vous piloter aujourd'hui ?</h2>
      <p className="mt-2 max-w-xl text-sm text-mute">Posez une question sur vos factures, vos clients ou votre trésorerie. L'assistant interroge vos outils, calcule, et prépare les actions.</p>
      <div className="mt-8 grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SUGGESTIONS.map(s => (
          <button key={s.q} onClick={() => onAsk(s.q)} className="group rounded-2xl border border-line bg-card p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:border-accent/50">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent"><Icon name={s.icon} /></span>
            <div className="mt-3 text-sm font-semibold">{s.title}</div>
            <div className="mt-0.5 text-xs text-mute">{s.hint}</div>
          </button>
        ))}
      </div>
      {mode === 'offline' && <p className="mt-6 max-w-md text-xs text-mute">Mode démo hors ligne : réponses prédéfinies. Ajoutez une clé API côté serveur pour activer Claude.</p>}
    </div>
  )
}

function Composer({ busy, onSend, onStop, inputRef }) {
  const [v, setV] = useState('')
  const fit = el => { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px' }
  const submit = () => { const t = v.trim(); if (!t || busy) return; onSend(t); setV(''); requestAnimationFrame(() => inputRef.current && fit(inputRef.current)) }
  return (
    <div className="shrink-0 border-t border-line bg-card/80 px-3 py-3 backdrop-blur sm:px-4">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-card p-2 shadow-card focus-within:border-accent/60">
          <textarea ref={inputRef} rows={1} value={v} onChange={e => { setV(e.target.value); fit(e.target) }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } }}
            placeholder="Posez votre question…" aria-label="Votre question" maxLength={1500}
            className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-ink placeholder:text-mute focus:outline-none" />
          {busy
            ? <button onClick={onStop} aria-label="Arrêter" className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-page"><Icon name="stop" className="h-4 w-4" /></button>
            : <button onClick={submit} disabled={!v.trim()} aria-label="Envoyer" className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white transition disabled:opacity-30"><Icon name="send" className="h-4 w-4" /></button>}
        </div>
        <p className="mt-1.5 text-center text-[11px] text-mute">Entrée pour envoyer · Maj+Entrée pour un saut de ligne · données de démonstration fictives</p>
      </div>
    </div>
  )
}

export default function Chat({ messages, busy, mode, onSend, onStop, onRegenerate, inputRef }) {
  const box = useRef(null)
  const stick = useRef(true)
  useEffect(() => {
    const el = box.current
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight })
  }, [messages])
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={box} onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140 }} className="scroll min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-4">
        {messages.length === 0
          ? <Empty onAsk={onSend} mode={mode} />
          : (
            <div className="mx-auto flex max-w-3xl flex-col gap-6" aria-live="polite">
              {messages.map((m, i) => m.role === 'user'
                ? (
                  <div key={m.id} className="flex flex-row-reverse gap-3 animate-rise">
                    <Avatar user />
                    <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-gradient-to-br from-brand to-brand2 px-4 py-2.5 text-sm text-white shadow-card">{m.text}</div>
                  </div>)
                : <Assistant key={m.id} m={m} last={i === messages.length - 1} busy={busy} onAsk={onSend} onRegenerate={onRegenerate} />)}
            </div>)}
      </div>
      <Composer busy={busy} onSend={onSend} onStop={onStop} inputRef={inputRef} />
    </div>
  )
}
