import React, { useEffect, useState } from 'react'
import { getDashboard } from '../lib/api.js'
import { Card, InvoicesTable, PipelineList } from './Widgets.jsx'
import { CashChart, AgingChart, MonthlyChart } from './Charts.jsx'
import { eur, dateFr } from '../lib/format.js'

function Kpi({ label, value, sub, tone = 'text-ink', bar }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-card p-4 shadow-card">
      <span className={`absolute inset-y-0 left-0 w-1 ${bar}`} />
      <div className="text-xs font-medium text-mute">{label}</div>
      <div className={`mt-1 text-2xl font-bold tracking-tight tnum ${tone}`}>{value}</div>
      <div className="mt-0.5 text-xs text-mute">{sub}</div>
    </div>
  )
}

export default function Dashboard({ onAsk }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState(false)
  useEffect(() => { getDashboard().then(setD).catch(() => setErr(true)) }, [])

  if (err) return <div className="p-8 text-sm text-bad">Serveur injoignable : lancez le backend (port 8000) puis rechargez.</div>
  if (!d) return (
    <div className="mx-auto grid max-w-6xl gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map(i => <div key={i} className="h-28 animate-pulse rounded-2xl bg-soft" />)}
    </div>
  )
  const k = d.kpis
  return (
    <div className="scroll h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        <div>
          <h2 className="text-xl font-bold">Tableau de bord</h2>
          <p className="text-xs text-mute">Données simulées Sage 100 · Pipedrive · Agicap — au {dateFr(k.date, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Trésorerie" value={eur(k.solde)} sub={`${String(k.autonomie_mois).replace('.', ',')} mois d'autonomie`} bar="bg-accent" />
          <Kpi label="Prévision à 30 jours" value={eur(k.prevision_30j)} sub={`+${eur(k.prevision_30j - k.solde)} vs aujourd'hui`} tone="text-good" bar="bg-good" />
          <Kpi label="Impayés" value={eur(k.total_impaye)} sub={`${k.factures_en_retard} factures · ${k.retard_moyen_jours} j de retard moyen`} tone="text-bad" bar="bg-bad" />
          <Kpi label="Pipeline pondéré" value={eur(k.pipeline_pondere)} sub={`${eur(k.pipeline_brut)} brut · ${k.opportunites} offres`} bar="bg-accent2" />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Trésorerie projetée · 60 jours" className="lg:col-span-2"
            aside={<button onClick={() => onAsk('Que penses-tu de ma trésorerie sur les 60 prochains jours ?')} className="text-xs font-semibold text-accent hover:underline">Analyser avec l'IA</button>}>
            <CashChart points={d.forecast.points} seuil={d.forecast.seuil} />
            <p className="mt-1 text-[11px] text-mute">Point bas {eur(d.forecast.point_bas.solde)} le {dateFr(d.forecast.point_bas.date).replace(/\.$/, '')}. Hors nouvelles factures ; créances en retard pondérées par leur probabilité d'encaissement.</p>
          </Card>
          <Card title="Balance âgée des créances"
            aside={<button onClick={() => onAsk('Analyse ma balance âgée')} className="text-xs font-semibold text-accent hover:underline">Analyser</button>}>
            <AgingChart data={d.aging} />
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Factures en retard" className="lg:col-span-2"
            aside={<button onClick={() => onAsk('Prépare les relances pour toutes les factures en retard, par ordre de priorité')} className="text-xs font-semibold text-accent hover:underline">Tout relancer avec l'IA</button>}>
            <InvoicesTable rows={d.retards} onAsk={onAsk} />
          </Card>
          <Card title="Pipeline commercial"
            aside={<button onClick={() => onAsk('Quelle opportunité dois-je prioriser ?')} className="text-xs font-semibold text-accent hover:underline">Prioriser</button>}>
            <PipelineList rows={d.pipeline.opportunites} />
          </Card>
        </div>

        <Card title="Flux mensuels" aside={<span className="flex items-center gap-3 text-[11px] text-mute"><i className="inline-block h-2 w-2 rounded-sm bg-good/80" />Encaissements<i className="inline-block h-2 w-2 rounded-sm bg-mute/40" />Décaissements</span>}>
          <MonthlyChart mois={k.mois} />
          <p className="mt-1 text-[11px] text-mute">* mois en cours, prévisionnel.</p>
        </Card>
      </div>
    </div>
  )
}
