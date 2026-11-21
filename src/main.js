import './style.css'
import { registerSW } from 'virtual:pwa-register'
import { sessione } from './api.js'
import { vistaAccesso, vistaLibreria, vistaLibro } from './viste.js'
import { vistaLettore, chiudiLettore } from './lettore.js'
import { svuotaCoda } from './offline.js'
import { avviso } from './util.js'
import { aggiornaThemeColor } from './impostazioni.js'

const app = document.getElementById('app')

function instrada() {
  const [percorso, query] = (location.hash.slice(1) || '/').split('?')
  const parti = percorso.split('/').filter(Boolean)
  const parametri = new URLSearchParams(query || '')
  document.querySelector('.menu')?.remove()
  document.querySelectorAll('.velo, .pannello').forEach(e => e.remove())
  if (parti[0] !== 'leggi') chiudiLettore()

  if (!sessione()) {
    if (parti[0] !== 'accedi') { location.replace('#/accedi'); return }
    return vistaAccesso(app, () => { location.hash = '#/' })
  }
  if (parti[0] === 'accedi') { location.replace('#/'); return }
  if (parti[0] === 'libro' && parti[1]) return vistaLibro(app, +parti[1])
  if (parti[0] === 'leggi' && parti[1]) return vistaLettore(app, +parti[1], +parametri.get('s') || null)
  window.scrollTo(0, 0)
  return vistaLibreria(app)
}

addEventListener('hashchange', instrada)
addEventListener('leggilo:sessione-scaduta', () => {
  avviso('Sessione scaduta: entra di nuovo')
  location.hash = '#/accedi'
})

aggiornaThemeColor()
instrada()
if (sessione()) svuotaCoda()

const aggiornaSW = registerSW({
  onNeedRefresh() {
    avviso('Nuova versione disponibile', { testo: 'Aggiorna', fn: () => aggiornaSW(true) }, 0)
  },
  onOfflineReady() {
    avviso('Leggilo è pronto anche offline')
  },
})
