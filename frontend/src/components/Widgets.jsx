import React, { useState } from 'react'
import Icon from './Icon.jsx'
import { CashChart, AgingChart, ProbBar } from './Charts.jsx'
import { eur, dateFr } from '../lib/format.js'

export const Card = ({ title, aside, children, className = '' }) => (
  <section className={`rounded-2xl border border-line bg-card p-4 shadow-card ${className}`}>
    {(title || aside) && (
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-mute">{title}</h3>
        {aside}
      </header>
    )}
    {children}
  </section>
)

const RISK = { 'élevé': 'bg-bad/15 text-bad', moyen: 'bg-warn/15 text-warn', faible: 'bg-good/15 text-good' }

export const Stat = ({ label, value, sub, tone }) => (
  <div className="rounded-xl bg-soft p-3">
    <div className="text-[11px] font-medium text-mute">{label}</div>
    <div className={`mt-0.5 text-lg font-bold tnum ${tone || 'text-ink'}`}>{value}</div>
    {sub && <div className="text-[11px] text-mute">{sub}</div>}
  </div>
)

function Kpis({ data: k }) {
  return (
    <Card title="Synthèse">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Trésorerie" value={eur(k.solde)} sub={`${String(k.autonomie_mois).replace('.', ',')} mois d'autonomie`} />
        <Stat label="Prévision 30 j" value={eur(k.prevision_30j)} sub="Agicap" tone="text-good" />
        <Stat label="Impayés" value={eur(k.total_impaye)} sub={`${k.factures_en_retard} factures`} tone="text-bad" />
        <Stat label="Pipeline pondéré" value={eur(k.pipeline_pondere)} sub={`${eur(k.pipeline_brut)} brut`} />
      </div>
    </Card>
  )
}

export function InvoicesTable({ rows, onAsk, compact }) {
  return (
    <div className="scroll overflow-x-auto">
      <table className="w-full min-w-[460px] border-collapse text-xs">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-mute">
            <th className="py-1.5 pr-2 font-medium">Facture</th><th className="px-2 font-medium">Client</th>
            <th className="px-2 text-right font-medium">Montant HT</th><th className="px-2 font-medium">Échéance</th>
            <th className="px-2 font-medium">Statut</th>{onAsk && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map(f => (
            <tr key={f.id} className="border-t border-line">
              <td className="py-2 pr-2 font-medium tnum">{f.id}</td>
              <td className="px-2">{f.client}</td>
              <td className="px-2 text-right font-semibold tnum">{eur(f.montant)}</td>
              <td className="px-2 tnum text-mute">{dateFr(f.echeance)}</td>
              <td className="px-2">
                {f.statut === 'en_retard' ? <span className={`rounded-full px-2 py-0.5 font-semibold ${RISK[f.risque]}`}>{f.jours_retard} j de retard</span>
                  : f.statut === 'payée' ? <span className="rounded-full bg-good/15 px-2 py-0.5 font-semibold text-good">Payée</span>
                  : <span className="rounded-full bg-soft px-2 py-0.5 font-medium text-mute">À échoir</span>}
              </td>
              {onAsk && (
                <td className="pl-2 text-right">
                  {f.statut === 'en_retard' && (
                    <button onClick={() => onAsk(`Rédige une relance pour ${f.client} (facture ${f.id})`)}
                      className="rounded-lg px-2 py-1 font-semibold text-accent hover:bg-accent/10">Relancer</button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Invoices({ data, onAsk }) {
  return (
    <Card title="Sage 100 · Factures" aside={<span className="text-xs font-semibold tnum">{data.nombre} · {eur(data.total)}</span>}>
      <InvoicesTable rows={data.factures} onAsk={onAsk} />
    </Card>
  )
}

function Aging({ data }) {
  return <Card title="Sage 100 · Balance âgée"><AgingChart data={data} height={110} /></Card>
}

function Cash({ data }) {
  const ok = !data.passage_sous_seuil
  return (
    <Card title="Agicap · Trésorerie projetée" aside={<span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ok ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad'}`}>{ok ? 'Au-dessus du seuil' : 'Passage sous le seuil'}</span>}>
      <CashChart points={data.points} seuil={data.seuil_securite} height={200} />
      <div className="mt-1 grid grid-cols-3 gap-2">
        <Stat label="Solde" value={eur(data.solde_actuel)} />
        <Stat label="Point bas" value={eur(data.point_bas.solde)} sub={dateFr(data.point_bas.date)} tone="text-warn" />
        <Stat label="Prévision 30 j" value={eur(data.prevision_30j)} tone="text-good" />
      </div>
      <p className="mt-2 text-[11px] text-mute">Projection hors nouvelles factures ; créances en retard pondérées par leur probabilité d'encaissement.</p>
    </Card>
  )
}

export function PipelineList({ rows }) {
  return (
    <div className="space-y-3">
      {rows.map(o => (
        <div key={o.id}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <div className="min-w-0"><span className="font-semibold">{o.client}</span><span className="text-mute"> · {o.etape}</span></div>
            <div className="shrink-0 font-semibold tnum">{eur(o.valeur)} <span className="text-mute">· {o.probabilite} %</span></div>
          </div>
          <ProbBar pct={o.probabilite} />
          <div className="mt-1 truncate text-[11px] text-mute">{o.titre}</div>
        </div>
      ))}
    </div>
  )
}

function Pipeline({ data }) {
  return (
    <Card title="Pipedrive · Pipeline" aside={<span className="text-xs font-semibold tnum">{eur(data.pondere)} pondéré</span>}>
      <PipelineList rows={data.opportunites} />
    </Card>
  )
}

function Client({ data, onAsk }) {
  const c = data.client
  return (
    <Card title="Pipedrive · Fiche client">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-base font-bold">{c.nom}</div>
          <div className="text-xs text-mute">{c.secteur} · {c.ville}</div>
          <div className="mt-1 text-xs">{c.contact} · <a className="text-accent" href={`mailto:${c.email}`}>{c.email}</a> · {c.telephone}</div>
        </div>
        <div className="flex gap-2">
          <Stat label="CA annuel" value={eur(c.ca_annuel)} />
          <Stat label="En retard" value={eur(data.encours_retard)} tone={data.encours_retard ? 'text-bad' : 'text-good'} />
        </div>
      </div>
      {data.factures.length > 0 && <div className="mt-3"><InvoicesTable rows={data.factures} onAsk={onAsk} /></div>}
    </Card>
  )
}

export function EmailDraft({ data }) {
  const [body, setBody] = useState(data.corps || '')
  const [edit, setEdit] = useState(false)
  const [done, setDone] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(`Objet : ${data.objet}\n\n${body}`); setDone(true); setTimeout(() => setDone(false), 1800) } catch {}
  }
  const href = `mailto:${data.destinataire_email}?subject=${encodeURIComponent(data.objet)}&body=${encodeURIComponent(body)}`
  return (
    <Card title="Brouillon d'email" aside={<span className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-semibold text-warn">Non envoyé</span>}>
      <dl className="space-y-1 text-xs">
        <div className="flex gap-2"><dt className="w-12 shrink-0 text-mute">À</dt><dd className="font-medium">{data.destinataire_nom ? `${data.destinataire_nom} · ` : ''}{data.destinataire_email}</dd></div>
        <div className="flex gap-2"><dt className="w-12 shrink-0 text-mute">Objet</dt><dd className="font-medium">{data.objet}</dd></div>
      </dl>
      {edit
        ? <textarea value={body} onChange={e => setBody(e.target.value)} rows={12} className="mt-3 w-full rounded-xl border border-line bg-soft p-3 text-sm leading-relaxed text-ink focus:outline-none focus:ring-2 focus:ring-accent/40" />
        : <div className="mt-3 whitespace-pre-wrap rounded-xl bg-soft p-3 text-sm leading-relaxed">{body}</div>}
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={href} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"><Icon name="mail" className="h-3.5 w-3.5" />Ouvrir dans ma messagerie</a>
        <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:bg-soft"><Icon name={done ? 'check' : 'copy'} className="h-3.5 w-3.5" />{done ? 'Copié' : 'Copier'}</button>
        <button onClick={() => setEdit(e => !e)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:bg-soft">{edit ? 'Terminer' : 'Modifier'}</button>
      </div>
    </Card>
  )
}

export default function Widget({ widget, onAsk }) {
  if (!widget) return null
  const { type, data } = widget
  return (
    <div className="animate-rise">
      {type === 'kpis' && <Kpis data={data} />}
      {type === 'invoices' && <Invoices data={data} onAsk={onAsk} />}
      {type === 'aging' && <Aging data={data} />}
      {type === 'cashflow' && <Cash data={data} />}
      {type === 'pipeline' && <Pipeline data={data} />}
      {type === 'client' && <Client data={data} onAsk={onAsk} />}
      {type === 'email' && <EmailDraft data={data} />}
    </div>
  )
}
