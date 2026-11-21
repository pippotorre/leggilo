// Impostazioni salvate sul dispositivo (localStorage, con protezione dagli errori)
const PREF = 'leggilo.'
export function leggi(chiave, predefinito) {
  try {
    const v = localStorage.getItem(PREF + chiave)
    return v == null ? predefinito : JSON.parse(v)
  } catch { return predefinito }
}
export function scrivi(chiave, valore) {
  try {
    if (valore === undefined) localStorage.removeItem(PREF + chiave)
    else localStorage.setItem(PREF + chiave, JSON.stringify(valore))
  } catch { /* spazio pieno o modalità privata: si ignora */ }
}

export const predefiniteLettura = { dimensione: 100, interlinea: 1.6, margini: 'medi', tema: 'auto' }
export const predefiniteVoce = { voce: '', velocita: 1 }

// Tema dell'app: 'chiaro', 'scuro' oppure assente (segue il sistema)
export function applicaTema(tema) {
  const root = document.documentElement
  if (tema) root.dataset.tema = tema
  else delete root.dataset.tema
  try {
    if (tema) localStorage.setItem('leggilo.tema', tema)
    else localStorage.removeItem('leggilo.tema')
  } catch {}
  aggiornaThemeColor()
}
export function temaAttivo() {
  const t = document.documentElement.dataset.tema
  if (t) return t
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'scuro' : 'chiaro'
}
export function aggiornaThemeColor() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim()
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', bg || '#F7F3EC')
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', aggiornaThemeColor)
