const NB = ' '
export const eur = (n, d = 0) => (n < 0 ? '−' : '') + Math.abs(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/ | /g, NB) + NB + '€'
export const keur = (n) => `${Math.round(n / 1000)}${NB}k€`
export const dateFr = (iso, opts = { day: '2-digit', month: 'short' }) => new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('fr-FR', opts)
export const uid = () => Math.random().toString(36).slice(2, 10)
