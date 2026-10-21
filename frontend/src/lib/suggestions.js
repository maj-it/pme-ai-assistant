export const SUGGESTIONS = [
  { icon: 'alert', title: 'Impayés', q: 'Quelles factures sont en retard ?', hint: 'Montants, retards, niveau de risque' },
  { icon: 'wallet', title: 'Trésorerie', q: 'Quel est mon solde de trésorerie et que prévois-tu sur 60 jours ?', hint: 'Solde, point bas, seuil de sécurité' },
  { icon: 'mail', title: 'Relance', q: 'Rédige une relance pour Mécanique Centrale SA', hint: 'Email prêt à envoyer, ton adapté' },
  { icon: 'funnel', title: 'Pipeline', q: 'Montre-moi le pipeline commercial', hint: 'Opportunités et valeur pondérée' },
  { icon: 'user', title: 'Client', q: 'Résume la situation de TechCorp', hint: 'Fiche, factures, historique' },
  { icon: 'chart', title: 'Point global', q: 'Fais-moi un point global sur mon activité', hint: 'Les 4 chiffres qui comptent' },
]

// Questions de suite proposées selon les résultats affichés
export function followups(msg) {
  const w = (msg.tools || []).map(t => t.widget).filter(Boolean)
  const has = t => w.find(x => x.type === t)
  const out = []
  const inv = has('invoices')
  if (inv) {
    const top = inv.data.factures.find(f => f.statut === 'en_retard')
    if (top) out.push(`Rédige une relance pour ${top.client} (facture ${top.id})`)
    out.push('Analyse ma balance âgée')
  }
  if (has('email')) out.push('Prépare aussi la relance pour la facture suivante la plus en retard')
  if (has('cashflow')) out.push('Quel impact si Mécanique Centrale paie avec 30 jours de retard ?')
  if (has('pipeline')) out.push('Quelle opportunité dois-je prioriser ?')
  if (has('kpis') || has('aging') || has('client')) out.push('Quelles factures sont en retard ?')
  if (!out.length) out.push('Quelles factures sont en retard ?', 'Fais-moi un point global sur mon activité')
  return [...new Set(out)].slice(0, 3)
}
