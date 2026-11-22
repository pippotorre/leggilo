import './style.css'
import { registerSW } from 'virtual:pwa-register'
import { collegato } from './api.js'
import { vistaCollegaKavita, vistaLibreria, vistaLibro, vistaLibroLocale, vistaInfo } from './viste.js'
import { vistaLettore, chiudiLettore } from './lettore.js'
import { svuotaCoda } from './offline.js'
import { avviso, h, rotella } from './util.js'
import { prendiCondivisi } from './condivisi-db.js'
import * as locali from './locali.js'
import { aggiornaThemeColor } from './impostazioni.js'

const app = document.getElementById('app')

function instrada() {
  const [percorso, query] = (location.hash.slice(1) || '/').split('?')
  const parti = percorso.split('/').filter(Boolean)
  const parametri = new URLSearchParams(query || '')
  document.querySelector('.menu')?.remove()
  document.querySelectorAll('.velo, .pannello').forEach(e => e.remove())
  if (parti[0] !== 'leggi' && parti[0] !== 'leggi-locale') chiudiLettore()

  if (parti[0] === 'condivisi') return importaCondivisi(parametri.has('errore'))
  if (parti[0] === 'kavita' || parti[0] === 'accedi') return vistaCollegaKavita(app)
  if (parti[0] === 'info') return vistaInfo(app)
  if (parti[0] === 'locale' && parti[1]) return vistaLibroLocale(app, parti[1])
  if (parti[0] === 'leggi-locale' && parti[1]) return vistaLettore(app, { tipo: 'locale', id: parti[1] })
  if (parti[0] === 'libro' && parti[1]) return collegato() ? vistaLibro(app, +parti[1]) : location.replace('#/')
  if (parti[0] === 'leggi' && parti[1]) return vistaLettore(app, { tipo: 'kavita', chapterId: +parti[1], seriesId: +parametri.get('s') || null })
  window.scrollTo(0, 0)
  return vistaLibreria(app)
}

// Libri arrivati da "Condividi → Leggilo": si importano e, se è uno solo, si apre subito
async function importaCondivisi(errore) {
  app.replaceChildren(h('div', { class: 'vista', style: { height: '100vh' } }, rotella('Aggiungo il libro…')))
  if (errore) avviso('Non sono riuscito a ricevere il file condiviso.', null, 6000)
  let files = []
  try { files = await prendiCondivisi() } catch {}
  if (!files.length) { location.replace('#/'); return }
  const r = await locali.importa(files)
  if (r.errori.length) avviso(`${r.errori.length === 1 ? 'Un file non è' : r.errori.length + ' file non sono'} EPUB o PDF`, null, 6000)
  let daAprire = r.aggiunti.length === 1 && !r.saltati.length ? r.aggiunti[0] : null
  if (!daAprire && !r.aggiunti.length && r.saltati.length === 1) {
    const f = files.find(x => x.name === r.saltati[0])
    daAprire = (await locali.tutti()).find(l => l.nomeFile === f?.name && l.byte === f?.size)
  }
  if (r.aggiunti.length > 1) avviso(`${r.aggiunti.length} libri aggiunti`)
  location.replace(daAprire ? `#/leggi-locale/${daAprire.id}` : '#/')
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
