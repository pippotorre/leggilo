import './style.css'
import { registerSW } from 'virtual:pwa-register'
import { collegato } from './api.js'
import { vistaCollegaKavita, vistaLibreria, vistaLibro, vistaLibroLocale, vistaInfo } from './viste.js'
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
  if (parti[0] !== 'leggi' && parti[0] !== 'leggi-locale') chiudiLettore()

  if (parti[0] === 'kavita' || parti[0] === 'accedi') return vistaCollegaKavita(app)
  if (parti[0] === 'info') return vistaInfo(app)
  if (parti[0] === 'locale' && parti[1]) return vistaLibroLocale(app, parti[1])
  if (parti[0] === 'leggi-locale' && parti[1]) return vistaLettore(app, { tipo: 'locale', id: parti[1] })
  if (parti[0] === 'libro' && parti[1]) return collegato() ? vistaLibro(app, +parti[1]) : location.replace('#/')
  if (parti[0] === 'leggi' && parti[1]) return vistaLettore(app, { tipo: 'kavita', chapterId: +parti[1], seriesId: +parametri.get('s') || null })
  window.scrollTo(0, 0)
  return vistaLibreria(app)
}

addEventListener('hashchange', instrada)
addEventListener('leggilo:sessione-scaduta', () => {
  avviso('Sessione di Kavita scaduta: collegati di nuovo', { testo: 'Collega', fn: () => { location.hash = '#/kavita' } }, 8000)
})

aggiornaThemeColor()
instrada()
if (collegato()) svuotaCoda()

const aggiornaSW = registerSW({
  onNeedRefresh() {
    avviso('Nuova versione disponibile', { testo: 'Aggiorna', fn: () => aggiornaSW(true) }, 0)
  },
  onOfflineReady() {
    avviso('Leggilo è pronto anche offline')
  },
})
