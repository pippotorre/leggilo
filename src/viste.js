// Schermate: accesso, libreria e scheda del libro
import { h, avviso, rotella, testoSemplice } from './util.js'
import { icone } from './icone.js'
import * as api from './api.js'
import { schedeSalvate, salvaElenco, elencoSalvato, eliminaLibro, salvaLibro, chiediSpazioPersistente } from './offline.js'
import { applicaTema, temaAttivo } from './impostazioni.js'

const FORMATI = { 3: 'EPUB', 4: 'PDF', 1: 'Archivio', 0: 'Immagini' }
const logoUrl = './logo.svg'

export function vistaAccesso(app, dopo) {
  const errore = h('div', { class: 'errore', role: 'alert' })
  const utente = h('input', { name: 'username', autocomplete: 'username', autocapitalize: 'none', required: true, placeholder: 'pippo' })
  const password = h('input', { name: 'password', type: 'password', autocomplete: 'current-password', required: true })
  const invia = h('button', { class: 'btn btn-primario', type: 'submit' }, 'Entra')
  const form = h('form', {
    onsubmit: async e => {
      e.preventDefault()
      errore.textContent = ''
      invia.disabled = true
      invia.textContent = 'Accesso…'
      try {
        await api.accedi(utente.value.trim(), password.value)
        dopo()
      } catch (err) {
        errore.textContent = err.message
      } finally {
        invia.disabled = false
        invia.textContent = 'Entra'
      }
    },
  },
  h('img', { class: 'logo', src: logoUrl, alt: '' }),
  h('h1', {}, 'Leggilo'),
  h('p', {}, 'Entra con il tuo account Kavita'),
  h('label', { class: 'campo' }, 'Nome utente', utente),
  h('label', { class: 'campo' }, 'Password', password),
  errore, invia)
  app.replaceChildren(h('main', { class: 'login vista' }, form))
  utente.focus()
}

function barraPrincipale({ titolo, indietro, menu }) {
  const b = h('header', { class: 'barra' })
  if (indietro) b.append(h('button', { class: 'btn-icona', 'aria-label': 'Indietro', html: icone.indietro, onclick: indietro }))
  if (titolo) b.append(typeof titolo === 'string' ? h('div', { class: 'titolo' }, titolo) : titolo)
  else b.append(h('h1', {}, h('img', { src: logoUrl, alt: '' }), 'Leggilo'))
  b.append(pulsanteTema())
  if (menu) b.append(menu)
  return b
}

export function pulsanteTema() {
  const btn = h('button', { class: 'btn-icona', 'aria-label': 'Cambia tema' })
  const aggiorna = () => { btn.innerHTML = temaAttivo() === 'scuro' ? icone.sole : icone.luna }
  btn.onclick = () => { applicaTema(temaAttivo() === 'scuro' ? 'chiaro' : 'scuro'); aggiorna(); dispatchEvent(new Event('leggilo:tema')) }
  aggiorna()
  return btn
}

function menuUtente(ricarica) {
  const btn = h('button', { class: 'btn-icona', 'aria-label': 'Menu', 'aria-haspopup': 'true', html: icone.menu })
  btn.onclick = e => {
    e.stopPropagation()
    document.querySelector('.menu')?.remove()
    const u = api.sessione()
    const m = h('div', { class: 'menu', role: 'menu' },
      h('div', { class: 'info' }, `Collegato come ${u?.username}`),
      h('button', { role: 'menuitem', onclick: () => { m.remove(); ricarica() } }, h('span', { html: icone.aggiorna }), 'Aggiorna libreria'),
      h('button', { role: 'menuitem', onclick: () => { m.remove(); applicaTema(null); dispatchEvent(new Event('leggilo:tema')); avviso('Il tema ora segue il sistema') } }, h('span', { html: icone.sole }), 'Tema del sistema'),
      h('button', { role: 'menuitem', onclick: () => { api.esci(); location.hash = '#/accedi' } }, h('span', { html: icone.esci }), 'Esci'),
    )
    document.body.append(m)
    setTimeout(() => document.addEventListener('click', () => m.remove(), { once: true }))
  }
  return btn
}

function copertina(s, { salvato } = {}) {
  const c = h('div', { class: 'copertina' })
  const segnaposto = h('div', { class: 'segnaposto' }, s.name)
  c.append(segnaposto)
  const img = h('img', { src: api.urlCopertina(s.id), alt: '', loading: 'lazy', decoding: 'async' })
  img.onload = () => segnaposto.remove()
  img.onerror = () => img.remove()
  c.append(img)
  if (s.pages && s.pagesRead > 0) {
    const pct = Math.min(100, Math.round((s.pagesRead / s.pages) * 100))
    c.append(h('div', { class: 'avanzamento' }, h('i', { style: { width: pct + '%' } })))
  }
  if (salvato) c.append(h('div', { class: 'offline', title: 'Salvato sul dispositivo', html: icone.nuvola }))
  return c
}

function tessera(s, salvati) {
  return h('button', { class: 'libro', onclick: () => { location.hash = `#/libro/${s.id}` }, 'aria-label': `${s.name}, ${s.autore}` },
    copertina(s, { salvato: salvati.has(s.id) }),
    h('div', { class: 'nome' }, s.name),
    h('div', { class: 'formato' }, FORMATI[s.format] || ''))
}

export async function vistaLibreria(app) {
  const contenuto = h('div', { class: 'contenuto' })
  const ricarica = () => carica(true)
  app.replaceChildren(h('div', { class: 'vista' }, barraPrincipale({ menu: menuUtente(ricarica) }), contenuto))

  const campo = h('input', { type: 'search', placeholder: 'Cerca titolo o autore', 'aria-label': 'Cerca', autocomplete: 'off' })
  const risultati = h('div')
  let elenco = []
  let salvati = new Set()

  function disegna() {
    const q = campo.value.trim().toLowerCase()
    const filtrati = q ? elenco.filter(s => s.name.toLowerCase().includes(q) || s.autore.toLowerCase().includes(q)) : elenco
    risultati.replaceChildren()
    if (!elenco.length) {
      risultati.append(h('div', { class: 'vuoto' }, 'La libreria è vuota. Aggiungi dei libri in Kavita e aggiornala.'))
      return
    }
    if (!filtrati.length) {
      risultati.append(h('div', { class: 'vuoto' }, `Nessun libro trovato per "${campo.value}".`))
      return
    }
    if (!q) {
      const inCorso = elenco.filter(s => s.pagesRead > 0 && s.pagesRead < s.pages)
        .sort((a, b) => (b.latestReadDate || '').localeCompare(a.latestReadDate || '')).slice(0, 12)
      if (inCorso.length) {
        risultati.append(h('section', { class: 'sezione' }, h('h2', {}, 'Continua a leggere'),
          h('div', { class: 'scaffale' }, inCorso.map(s => tessera(s, salvati)))))
      }
    }
    const gruppi = new Map()
    for (const s of filtrati) {
      if (!gruppi.has(s.autore)) gruppi.set(s.autore, [])
      gruppi.get(s.autore).push(s)
    }
    const autori = [...gruppi.keys()].sort((a, b) =>
      a === 'Senza autore' ? 1 : b === 'Senza autore' ? -1 : a.localeCompare(b, 'it', { sensitivity: 'base' }))
    for (const a of autori) {
      const libri = gruppi.get(a)
      risultati.append(h('section', { class: 'sezione' },
        h('h2', {}, a, h('span', { class: 'conta' }, libri.length === 1 ? '1 libro' : `${libri.length} libri`)),
        h('div', { class: 'griglia' }, libri.map(s => tessera(s, salvati)))))
    }
  }

  async function carica(forza) {
    salvati = new Set((await schedeSalvate()).map(s => s.seriesId))
    const cache = elencoSalvato()
    if (cache && !forza) { elenco = cache; disegna() }
    else if (!cache) risultati.replaceChildren(rotella('Carico la libreria…'))
    try {
      const serie = await api.tutteLeSerie()
      elenco = (serie || []).map(s => ({
        id: s.id, name: s.name, sortName: s.sortName, format: s.format, pages: s.pages, pagesRead: s.pagesRead,
        latestReadDate: s.latestReadDate, libraryId: s.libraryId, autore: api.autoreDaCartella(s),
      }))
      salvaElenco(elenco)
      disegna()
      if (forza) avviso('Libreria aggiornata')
    } catch (e) {
      if (e.stato === 401) return
      if (!elenco.length) risultati.replaceChildren(h('div', { class: 'vuoto' }, e.message))
      else avviso('Sei offline: vedi l\'ultima libreria salvata')
    }
  }

  campo.addEventListener('input', disegna)
  contenuto.append(h('label', { class: 'cerca' }, h('span', { html: icone.cerca }), campo), risultati)
  addEventListener('leggilo:offline-cambiato', () => carica(false), { once: true })
  await carica(false)
}

// Capitoli (file) di una serie, dal più vecchio
export async function capitoliDi(seriesId) {
  const vol = await api.volumi(seriesId)
  return (vol || []).flatMap(v => (v.chapters || []).map(c => ({ ...c, volumeId: v.id })))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
}

export async function vistaLibro(app, seriesId) {
  const contenuto = h('div', { class: 'contenuto' }, rotella())
  app.replaceChildren(h('div', { class: 'vista' }, barraPrincipale({ titolo: ' ', indietro: () => history.length > 1 ? history.back() : (location.hash = '#/') }), contenuto))

  const dalElenco = (elencoSalvato() || []).find(s => s.id === seriesId)
  let s, capitoli, meta
  try {
    ;[s, capitoli, meta] = await Promise.all([api.serie(seriesId), capitoliDi(seriesId), api.dettaglioSerie(seriesId)])
  } catch (e) {
    // Offline: si usano le schede dei libri salvati
    const schede = (await schedeSalvate()).filter(x => x.seriesId === seriesId)
    if (!schede.length) { contenuto.replaceChildren(h('div', { class: 'vuoto' }, e.message)); return }
    s = { id: seriesId, name: schede[0].nome, pages: schede[0].pagine, pagesRead: dalElenco?.pagesRead || 0, format: schede[0].formato, libraryId: schede[0].libraryId }
    capitoli = schede.map(x => ({ id: x.chapterId, volumeId: x.volumeId, format: x.formato, pages: x.pagine, files: [{ format: x.formato, bytes: x.byte }] }))
  }
  const autore = dalElenco?.autore || meta?.writers?.[0]?.name || api.autoreDaCartella(s)
  const salvate = new Map((await schedeSalvate()).map(x => [x.chapterId, x]))
  const pct = s.pages ? Math.round(((s.pagesRead || 0) / s.pages) * 100) : 0

  const azioni = h('div', { class: 'azioni' })
  const disegnaAzioni = () => {
    azioni.replaceChildren()
    capitoli.forEach((c, i) => {
      const formato = FORMATI[c.files?.[0]?.format ?? c.format] || ''
      const etichetta = capitoli.length > 1 ? ` (${formato})` : ''
      azioni.append(h('button', { class: 'btn btn-primario', onclick: () => { location.hash = `#/leggi/${c.id}?s=${seriesId}` } },
        h('span', { html: icone.libro }), (pct > 0 && pct < 100 && i === 0 ? 'Continua' : 'Leggi') + etichetta))
      if (salvate.has(c.id)) {
        azioni.append(h('button', { class: 'btn', onclick: async () => { await eliminaLibro(c.id); salvate.delete(c.id); disegnaAzioni(); avviso('Tolto dal dispositivo') } },
          h('span', { html: icone.cestino }), 'Togli dal dispositivo' + etichetta))
      } else {
        const b = h('button', { class: 'btn', onclick: async () => {
          b.disabled = true; b.lastChild.textContent = 'Salvo…'
          try {
            const formatoN = c.files?.[0]?.format ?? s.format
            const blob = await api.scaricaCapitolo(c.id, formatoN)
            await chiediSpazioPersistente()
            const scheda = { chapterId: c.id, seriesId, volumeId: c.volumeId, libraryId: s.libraryId, nome: s.name, autore, formato: formatoN, pagine: c.pages }
            await salvaLibro(scheda, blob)
            salvate.set(c.id, scheda)
            avviso('Salvato: potrai leggerlo anche offline')
          } catch (e) {
            avviso(e.stato === 403 ? 'Il tuo utente non ha il permesso di scaricare. Chiedi di attivare "Download" in Kavita.' : e.message, null, 6000)
          }
          disegnaAzioni()
        } }, h('span', { html: icone.scarica }), 'Salva offline' + etichetta)
        azioni.append(b)
      }
    })
  }
  disegnaAzioni()

  const peso = capitoli[0]?.files?.[0]?.bytes
  const info = [FORMATI[s.format], s.pages ? `${s.pages} ${s.format === 4 ? 'pagine' : 'sezioni'}` : null, peso ? (peso < 1048576 ? `${Math.max(1, Math.round(peso / 1024))} KB` : `${(peso / 1048576).toFixed(1)} MB`) : null].filter(Boolean).join(' · ')
  const riassunto = testoSemplice(meta?.summary)

  contenuto.replaceChildren(h('div', { class: 'scheda' },
    h('div', {}, copertina(s)),
    h('div', {},
      h('h2', {}, s.name),
      h('div', { class: 'autore' }, autore),
      pct > 0 ? h('div', {}, h('div', { class: 'barra-avanzamento' }, h('i', { style: { width: pct + '%' } })), h('div', { class: 'piccolo', style: { marginTop: '6px' } }, pct >= 100 ? 'Letto' : `Letto al ${pct}%`)) : null,
      azioni,
      h('div', { class: 'piccolo' }, info),
      riassunto ? h('div', { class: 'riassunto' }, riassunto.split(/\n{2,}/).map(p => h('p', {}, p))) : null)))
}

