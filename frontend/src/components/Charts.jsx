import React, { useEffect, useId, useRef, useState } from 'react'
import { eur, keur, dateFr } from '../lib/format.js'

function useWidth() {
  const ref = useRef(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

// Courbe de trésorerie projetée avec seuil de sécurité, point bas et survol
export function CashChart({ points, seuil, height = 230 }) {
  const [ref, W] = useWidth()
  const [hover, setHover] = useState(null)
  const gid = useId().replace(/:/g, '')
  const H = height, L = 46, R = 12, T = 14, B = 26
  const vals = points.map(p => p.solde)
  const rawLo = Math.min(...vals) * 0.9, rawHi = Math.max(...vals) * 1.05
  const step = [2000, 5000, 10000, 20000, 50000].find(s => (rawHi - rawLo) / s <= 4) || 100000
  const lo = Math.floor(rawLo / step) * step, hi = Math.ceil(rawHi / step) * step
  const seuilVisible = seuil >= lo
  const x = i => L + (i / (points.length - 1)) * (W - L - R)
  const y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.solde).toFixed(1)}`).join(' ')
  const area = `${line} L${x(points.length - 1)},${H - B} L${x(0)},${H - B} Z`
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, k) => lo + k * step)
  const low = points.reduce((m, p) => (p.solde < m.solde ? p : m), points[0])
  const li = points.indexOf(low)
  const xt = [0, 15, 30, 45, 60].filter(d => d < points.length)
  const onMove = e => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - r.left - L) / (W - L - R)) * (points.length - 1))
    setHover(Math.max(0, Math.min(points.length - 1, i)))
  }
  const hp = hover != null ? points[hover] : null
  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {W > 0 && (
        <svg width={W} height={H} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Projection de trésorerie sur 60 jours">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity=".28" />
              <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="rgb(var(--line))" />
              <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill="rgb(var(--mute))">{keur(t)}</text>
            </g>
          ))}
          {seuilVisible && <line x1={L} x2={W - R} y1={y(seuil)} y2={y(seuil)} stroke="rgb(var(--warn))" strokeDasharray="5 4" />}
          <text x={W - R} y={seuilVisible ? y(seuil) - 5 : H - B - 6} textAnchor="end" fontSize="10.5" fill="rgb(var(--warn))">{seuilVisible ? `Seuil de sécurité · ${keur(seuil)}` : `Seuil de sécurité ${keur(seuil)} : très en dessous`}</text>
          <path d={area} fill={`url(#${gid})`} />
          <path d={line} fill="none" stroke="rgb(var(--accent))" strokeWidth="2.2" strokeLinejoin="round" />
          <line x1={x(30)} x2={x(30)} y1={T} y2={H - B} stroke="rgb(var(--line))" strokeDasharray="2 4" />
          <text x={x(30) + 5} y={T + 9} fontSize="10" fill="rgb(var(--mute))">J+30 · prévision Agicap</text>
          <circle cx={x(li)} cy={y(low.solde)} r="4" fill="rgb(var(--card))" stroke="rgb(var(--bad))" strokeWidth="2" />
          {xt.map(d => <text key={d} x={x(d)} y={H - 7} textAnchor={d === 0 ? 'start' : d === 60 ? 'end' : 'middle'} fontSize="10.5" fill="rgb(var(--mute))">{d === 0 ? "Aujourd'hui" : dateFr(points[d].date)}</text>)}
          {hp && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="rgb(var(--mute))" strokeOpacity=".5" />
              <circle cx={x(hover)} cy={y(hp.solde)} r="4.5" fill="rgb(var(--accent))" stroke="rgb(var(--card))" strokeWidth="2" />
            </g>
          )}
        </svg>
      )}
      {hp && (
        <div className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs shadow-card tnum"
          style={{ left: Math.min(Math.max(x(hover), 70), W - 70), top: 0 }}>
          <div className="text-mute">{dateFr(hp.date, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
          <div className="font-semibold text-ink">{eur(hp.solde)}</div>
        </div>
      )}
    </div>
  )
}

const AGING_COLOR = { a_echoir: 'rgb(var(--accent))', j1_10: '#eab308', j11_30: '#f97316', j31_60: 'rgb(var(--bad))', j60p: '#991b1b' }

// Balance âgée : histogramme des créances par tranche de retard
export function AgingChart({ data, height = 150 }) {
  const max = Math.max(...data.map(d => d.montant), 1)
  return (
    <div className="flex items-end gap-3" style={{ height: height + 38 }} role="img" aria-label="Créances par ancienneté">
      {data.map(d => (
        <div key={d.key} className="flex flex-1 flex-col items-center justify-end gap-1">
          <div className="text-[11px] font-semibold text-ink tnum">{d.montant ? eur(d.montant) : '—'}</div>
          <div className="w-full rounded-t-md transition-all" style={{ height: Math.max((d.montant / max) * height, d.montant ? 4 : 2), background: d.montant ? AGING_COLOR[d.key] : 'rgb(var(--line))' }} title={`${d.nombre} facture(s)`} />
          <div className="text-[11px] text-mute">{d.label}</div>
        </div>
      ))}
    </div>
  )
}

// Encaissements / décaissements mensuels
export function MonthlyChart({ mois, height = 130 }) {
  const max = Math.max(...mois.flatMap(m => [m.encaissements, m.decaissements]))
  return (
    <div className="flex items-end gap-4" style={{ height: height + 40 }} role="img" aria-label="Flux mensuels">
      {mois.map(m => (
        <div key={m.mois} className="flex flex-1 flex-col items-center justify-end gap-1.5">
          <div className="flex w-full items-end justify-center gap-1" style={{ height }}>
            <div className="w-1/2 max-w-[26px] rounded-t bg-good/80" style={{ height: (m.encaissements / max) * height }} title={`Encaissements ${eur(m.encaissements)}`} />
            <div className="w-1/2 max-w-[26px] rounded-t bg-mute/40" style={{ height: (m.decaissements / max) * height }} title={`Décaissements ${eur(m.decaissements)}`} />
          </div>
          <div className="text-[11px] text-mute">{m.mois.replace(' (prévu)', '*')}</div>
          <div className={`text-[11px] font-semibold tnum ${m.solde >= 0 ? 'text-good' : 'text-bad'}`}>{m.solde >= 0 ? '+' : ''}{keur(m.solde)}</div>
        </div>
      ))}
    </div>
  )
}

export function ProbBar({ pct }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-soft">
      <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent2" style={{ width: `${pct}%` }} />
    </div>
  )
}
