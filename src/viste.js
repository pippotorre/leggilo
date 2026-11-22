// Schermate: libreria (libri del telefono e, se collegato, Kavita), collegamento a Kavita, schede dei libri
import { h, avviso, rotella, testoSemplice } from './util.js'
import { icone } from './icone.js'
import * as api from './api.js'
import * as locali from './locali.js'
import { schedeSalvate, salvaElenco, elencoSalvato, eliminaLibro, salvaLibro, chiediSpazioPersistente } from './offline.js'
import { applicaTema, temaAttivo } from './impostazioni.js'
import { VOCI_LEGGILO } from './voci-leggilo.js'
import { pannelloVoci } from './voci-ui.js'

const FORMATI = { 3: 'EPUB', 4: 'PDF', 1: 'Archivio', 0: 'Immagini' }
const logoUrl = './logo.svg'
const tornaIndietro = () => { location.hash = '#/' }

// ---------- Importazione dal telefono ----------

let selettore
export function scegliFile() {
  selettore?.remove()
  selettore = h('input', { type: 'file', multiple: true, accept: '.epub,.pdf,application/epub+zip,application/pdf', style: { display: 'none' } })
  selettore.onchange = async () => {
    const files = [...selettore.files]
    selettore.remove()
    if (!files.length) return
    const box = avviso(`Importo ${files.length === 1 ? '1 libro' : files.length + ' libri'}…`, null, 0)
    const r = await locali.importa(files, (i, n) => { box.firstChild.textContent = `Importo ${i} di ${n}…` })
    box.remove()
    const parti = []
    if (r.aggiunti.length) parti.push(r.aggiunti.length === 1 ? '1 libro aggiunto' : `${r.aggiunti.length} libri aggiunti`)
    if (r.saltati.length) parti.push(`${r.saltati.length} già presenti`)
    if (r.errori.length) parti.push(`${r.errori.length} non importati`)
    avviso(parti.join(', ') || 'Nessun libro importato', null, 5000)
    if (r.errori.length) console.warn('Importazione:', r.errori)
  }
  document.body.append(selettore)
  selettore.click()
}

// ---------- Collegamento a Kavita ----------

export function vistaCollegaKavita(app) {
  const errore = h('div', { class: 'errore', role: 'alert' })
  const indirizzo = h('input', { name: 'server', type: 'url', inputmode: 'url', autocapitalize: 'none', placeholder: 'https://leggilo.esempio.ts.net', value: api.indirizzoServer() && !api.stessaOrigine ? api.indirizzoServer() : '' })
  const utente = h('input', { name: 'username', autocomplete: 'username', autocapitalize: 'none', required: true, placeholder: 'pippo' })
  const password = h('input', { name: 'password', type: 'password', autocomplete: 'current-password', required: true })
  const invia = h('button', { class: 'btn btn-primario', type: 'submit' }, 'Collega')
  const form = h('form', {
    onsubmit: async e => {
      e.preventDefault()
      errore.textContent = ''
      invia.disabled = true
      invia.textContent = 'Collego…'
      try {
        await api.accedi(api.stessaOrigine ? '' : indirizzo.value, utente.value.trim(), password.value)
        avviso('Kavita collegato')
        location.hash = '#/'
      } catch (err) {
        errore.textContent = err.message
      } finally {
        invia.disabled = false
        invia.textContent = 'Collega'
      }
    },
  },
  h('img', { class: 'logo', src: logoUrl, alt: '' }),
  h('h1', {}, 'Collega Kavita'),
  h('p', {}, 'Facoltativo: aggiungi alla libreria i libri del tuo server Kavita.'),
  api.stessaOrigine ? null : h('label', { class: 'campo' }, 'Indirizzo del server', indirizzo),
  h('label', { class: 'campo' }, 'Nome utente', utente),
  h('label', { class: 'campo' }, 'Password', password),
  errore, invia,
  h('button', { class: 'btn', type: 'button', onclick: tornaIndietro }, 'Annulla'))
  app.replaceChildren(h('main', { class: 'login vista' }, form))
  ;(api.stessaOrigine ? utente : indirizzo).focus()
}

// ---------- Barra e menu ----------

function barraPrincipale({ titolo, indietro, menu, aggiungi }) {
  const b = h('header', { class: 'barra' })
  if (indietro) b.append(h('button', { class: 'btn-libreria', 'aria-label': 'Torna alla libreria', onclick: indietro }, h('span', { html: icone.indietro }), 'Libreria'))
  if (titolo) b.append(typeof titolo === 'string' ? h('div', { class: 'titolo' }, titolo) : titolo)
  else b.append(h('h1', {}, h('img', { src: logoUrl, alt: '' }), 'Leggilo'))
  if (aggiungi) b.append(h('button', { class: 'btn-icona', 'aria-label': 'Aggiungi libri dal telefono', title: 'Aggiungi libri', html: icone.piu, onclick: scegliFile }))
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

function menuPrincipale(ricarica) {
  const btn = h('button', { class: 'btn-icona', 'aria-label': 'Menu', 'aria-haspopup': 'true', html: icone.menu })
  btn.onclick = e => {
    e.stopPropagation()
    document.querySelector('.menu')?.remove()
    const u = api.sessione()
    const voce = (icona, testo, fn) => h('button', { role: 'menuitem', onclick: () => { m.remove(); fn() } }, h('span', { html: icone[icona] }), testo)
    const m = h('div', { class: 'menu', role: 'menu' },
      api.collegato() ? h('div', { class: 'info' }, `Kavita: ${u.username}`) : null,
      voce('piu', 'Aggiungi libri dal telefono', scegliFile),
      api.collegato()
        ? [voce('aggiorna', 'Aggiorna libreria Kavita', ricarica),
          voce('esci', 'Scollega Kavita', () => { api.esci(); avviso('Kavita scollegato'); ricarica() })]
        : voce('server', 'Collega un server Kavita', () => { location.hash = '#/kavita' }),
      voce('play', 'Voci di Leggilo', () => pannelloVoci()),
      voce('sole', 'Tema del sistema', () => { applicaTema(null); dispatchEvent(new Event('leggilo:tema')); avviso('Il tema ora segue il sistema') }),
      voce('info', 'Informazioni e privacy', () => { location.hash = '#/info' }),
    )
    document.body.append(m)
    setTimeout(() => document.addEventListener('click', () => m.remove(), { once: true }))
  }
  return btn
}

// ---------- Tessere dei libri ----------

const urlTemporanei = new Set()
function urlBlob(blob) {
  const u = URL.createObjectURL(blob)
  urlTemporanei.add(u)
  return u
}
function liberaUrl() { for (const u of urlTemporanei) URL.revokeObjectURL(u); urlTemporanei.clear() }

function copertina({ nome, src, avanzamento, salvato }) {
  const c = h('div', { class: 'copertina' })
  const segnaposto = h('div', { class: 'segnaposto' }, nome)
  c.append(segnaposto)
  if (src) {
    const img = h('img', { src, alt: '', loading: 'lazy', decoding: 'async' })
    img.onload = () => segnaposto.remove()
    img.onerror = () => img.remove()
    c.append(img)
  }
  if (avanzamento > 0) c.append(h('div', { class: 'avanzamento' }, h('i', { style: { width: Math.min(100, Math.round(avanzamento * 100)) + '%' } })))
  if (salvato) c.append(h('div', { class: 'offline', title: 'Disponibile offline', html: icone.nuvola }))
  return c
}

// Un libro, da qualunque fonte, nella forma usata dalla libreria
const daKavita = (s, salvati) => ({
  chiave: 'k' + s.id, fonte: 'kavita', nome: s.name, autore: s.autore, formato: s.format,
  avanzamento: s.pages ? (s.pagesRead || 0) / s.pages : 0, ultimaLettura: s.latestReadDate ? Date.parse(s.latestReadDate) : 0,
  src: api.urlCopertina(s.id), salvato: salvati.has(s.id), href: `#/libro/${s.id}`,
})
const daLocale = l => ({
  chiave: 'l' + l.id, fonte: 'locale', nome: l.nome, autore: l.autore || 'Senza autore', formato: l.formato,
  avanzamento: l.avanzamento || 0, ultimaLettura: l.letto || 0,
  src: l.copertina ? urlBlob(l.copertina) : null, salvato: false, href: `#/locale/${l.id}`,
})

function tessera(b) {
  return h('button', { class: 'libro', onclick: () => { location.hash = b.href }, 'aria-label': `${b.nome}, ${b.autore}` },
    copertina(b),
    h('div', { class: 'nome' }, b.nome),
    h('div', { class: 'formato' }, FORMATI[b.formato] || ''))
}

function perAutore(libri) {
  const gruppi = new Map()
  for (const b of libri) {
    if (!gruppi.has(b.autore)) gruppi.set(b.autore, [])
    gruppi.get(b.autore).push(b)
  }
  return [...gruppi.entries()].sort(([a], [b]) =>
    a === 'Senza autore' ? 1 : b === 'Senza autore' ? -1 : a.localeCompare(b, 'it', { sensitivity: 'base' }))
}

// ---------- Libreria ----------

export async function vistaLibreria(app) {
  const contenuto = h('div', { class: 'contenuto' })
  const ricarica = () => carica(true)
  app.replaceChildren(h('div', { class: 'vista' }, barraPrincipale({ menu: menuPrincipale(ricarica), aggiungi: true }), contenuto))

  const campo = h('input', { type: 'search', placeholder: 'Cerca titolo o autore', 'aria-label': 'Cerca', autocomplete: 'off' })
  const risultati = h('div')
  let kavita = []
  let locale = []
  let salvati = new Set()
  let caricamentoKavita = false

  function sezione(titolo, conta, ...figli) {
    return h('section', { class: 'sezione' }, h('h2', {}, titolo, conta ? h('span', { class: 'conta' }, conta) : null), ...figli)
  }
  const contaLibri = n => n === 1 ? '1 libro' : `${n} libri`

  function disegna() {
    liberaUrl()
    const q = campo.value.trim().toLowerCase()
    const libLocali = locale.map(daLocale)
    const libKavita = kavita.map(s => daKavita(s, salvati))
    const filtra = l => q ? l.filter(b => b.nome.toLowerCase().includes(q) || b.autore.toLowerCase().includes(q)) : l
    risultati.replaceChildren()

    if (!libLocali.length && !api.collegato()) {
      risultati.append(h('div', { class: 'benvenuto' },
        h('img', { src: logoUrl, alt: '' }),
        h('h2', {}, 'La tua libreria è vuota'),
        h('p', {}, 'Aggiungi i tuoi EPUB e PDF dal telefono: restano solo sul dispositivo e puoi leggerli o ascoltarli anche offline.'),
        h('button', { class: 'btn btn-primario', onclick: scegliFile }, h('span', { html: icone.piu }), 'Aggiungi libri'),
        h('button', { class: 'btn', onclick: () => { location.hash = '#/kavita' } }, h('span', { html: icone.server }), 'Collega un server Kavita')))
      return
    }

    const fL = filtra(libLocali), fK = filtra(libKavita)
    if (q && !fL.length && !fK.length) {
      risultati.append(h('div', { class: 'vuoto' }, `Nessun libro trovato per "${campo.value}".`))
      return
    }
    if (!q) {
      const inCorso = [...libLocali, ...libKavita].filter(b => b.avanzamento > 0 && b.avanzamento < 0.99)
        .sort((a, b) => b.ultimaLettura - a.ultimaLettura).slice(0, 12)
      if (inCorso.length) risultati.append(sezione('Continua a leggere', null, h('div', { class: 'scaffale' }, inCorso.map(tessera))))
    }
    const separaFonti = api.collegato() && libLocali.length
    if (fL.length) {
      if (separaFonti) risultati.append(h('h2', { class: 'fonte' }, h('span', { html: icone.telefono }), 'Sul telefono'))
      for (const [autore, libri] of perAutore(fL)) risultati.append(sezione(autore, contaLibri(libri.length), h('div', { class: 'griglia' }, libri.map(tessera))))
    }
    if (api.collegato()) {
      if (separaFonti && (fK.length || caricamentoKavita)) risultati.append(h('h2', { class: 'fonte' }, h('span', { html: icone.server }), 'Kavita'))
      if (caricamentoKavita && !kavita.length) risultati.append(rotella('Carico la libreria di Kavita…'))
      for (const [autore, libri] of perAutore(fK)) risultati.append(sezione(autore, contaLibri(libri.length), h('div', { class: 'griglia' }, libri.map(tessera))))
    }
  }

  async function caricaLocali() {
    locale = await locali.tutti()
    disegna()
  }

  async function carica(forza) {
    await caricaLocali()
    if (!api.collegato()) { kavita = []; disegna(); return }
    salvati = new Set((await schedeSalvate()).map(s => s.seriesId))
    const cache = elencoSalvato()
    if (cache && !forza) { kavita = cache; disegna() }
    caricamentoKavita = true
    disegna()
    try {
      const serie = await api.tutteLeSerie()
      kavita = (serie || []).map(s => ({
        id: s.id, name: s.name, sortName: s.sortName, format: s.format, pages: s.pages, pagesRead: s.pagesRead,
        latestReadDate: s.latestReadDate, libraryId: s.libraryId, autore: api.autoreDaCartella(s),
      }))
      salvaElenco(kavita)
      if (forza) avviso('Libreria aggiornata')
    } catch (e) {
      if (e.stato !== 401) avviso(kavita.length ? 'Kavita non raggiungibile: vedi l\'ultima libreria salvata' : e.message, null, 5000)
    }
    caricamentoKavita = false
    disegna()
  }

  campo.addEventListener('input', disegna)
  contenuto.append(h('label', { class: 'cerca' }, h('span', { html: icone.cerca }), campo), risultati)
  const suLocali = () => { if (document.body.contains(risultati)) caricaLocali() }
  addEventListener('leggilo:locali-cambiati', suLocali)
  await carica(false)
}

// ---------- Scheda di un libro del telefono ----------

export async function vistaLibroLocale(app, id) {
  const contenuto = h('div', { class: 'contenuto' }, rotella())
  app.replaceChildren(h('div', { class: 'vista' }, barraPrincipale({ titolo: ' ', indietro: tornaIndietro }), contenuto))
  const l = await locali.scheda(id)
  if (!l) { contenuto.replaceChildren(h('div', { class: 'vuoto' }, 'Questo libro non è più sul dispositivo.')); return }
  liberaUrl()
  const b = daLocale(l)
  const pct = Math.round((l.avanzamento || 0) * 100)
  const titolo = h('h2', {}, l.nome)
  const autore = h('div', { class: 'autore' }, l.autore || 'Senza autore')
  const peso = l.byte < 1048576 ? `${Math.max(1, Math.round(l.byte / 1024))} KB` : `${(l.byte / 1048576).toFixed(1)} MB`

  const modifica = () => {
    const t = h('input', { value: l.nome, 'aria-label': 'Titolo' })
    const a = h('input', { value: l.autore || '', 'aria-label': 'Autore' })
    const form = h('form', { class: 'modifica', onsubmit: async e => {
      e.preventDefault()
      l.nome = t.value.trim() || l.nome
      l.autore = a.value.trim() || 'Senza autore'
      await locali.aggiorna(id, { nome: l.nome, autore: l.autore })
      titolo.textContent = l.nome; autore.textContent = l.autore
      form.replaceWith(azioni)
      avviso('Salvato')
    } },
    h('label', { class: 'campo' }, 'Titolo', t), h('label', { class: 'campo' }, 'Autore', a),
    h('div', { class: 'azioni' }, h('button', { class: 'btn btn-primario', type: 'submit' }, 'Salva'), h('button', { class: 'btn', type: 'button', onclick: () => form.replaceWith(azioni) }, 'Annulla')))
    azioni.replaceWith(form)
    t.focus()
  }
  const azioni = h('div', { class: 'azioni' },
    h('button', { class: 'btn btn-primario', onclick: () => { location.hash = `#/leggi-locale/${id}` } }, h('span', { html: icone.libro }), pct > 0 && pct < 99 ? 'Continua' : 'Leggi'),
    h('button', { class: 'btn', onclick: modifica }, h('span', { html: icone.matita }), 'Modifica'),
    h('button', { class: 'btn', onclick: async () => {
      if (!confirm(`Eliminare "${l.nome}" dal telefono?`)) return
      await locali.elimina(id)
      avviso('Libro eliminato')
      location.hash = '#/'
    } }, h('span', { html: icone.cestino }), 'Elimina'))

  contenuto.replaceChildren(h('div', { class: 'scheda' },
    h('div', {}, copertina({ ...b, avanzamento: 0 })),
    h('div', {},
      titolo, autore,
      pct > 0 ? h('div', {}, h('div', { class: 'barra-avanzamento' }, h('i', { style: { width: pct + '%' } })), h('div', { class: 'piccolo', style: { marginTop: '6px' } }, pct >= 99 ? 'Letto' : `Letto al ${pct}%`)) : null,
      azioni,
      h('div', { class: 'piccolo' }, [FORMATI[l.formato], peso, 'sul telefono'].join(' · ')),
      h('div', { class: 'piccolo', style: { marginTop: '4px', wordBreak: 'break-all' } }, l.nomeFile))))
}

// ---------- Informazioni e privacy ----------

export function vistaInfo(app) {
  const versione = import.meta.env.VITE_VERSIONE || 'sviluppo'
  app.replaceChildren(h('div', { class: 'vista' }, barraPrincipale({ titolo: 'Informazioni', indietro: tornaIndietro }),
    h('div', { class: 'contenuto testo-info' },
      h('img', { class: 'logo-grande', src: logoUrl, alt: '' }),
      h('h2', {}, 'Leggilo'),
      h('p', {}, 'Leggi e ascolta i tuoi ebook EPUB e PDF. Versione ' + versione + '.'),
      h('h3', {}, 'Privacy'),
      h('p', {}, 'Leggilo non raccoglie dati personali, non usa pubblicità né strumenti di analisi e non ha un proprio server.'),
      h('p', {}, 'I libri che aggiungi dal telefono, la posizione di lettura e le impostazioni restano solo sul dispositivo. La lettura ad alta voce usa le voci installate sul dispositivo.'),
      h('p', {}, 'Se colleghi un server Kavita, Leggilo comunica solo con quel server, con le credenziali che inserisci, per mostrare i tuoi libri e salvare la posizione di lettura.'),
      h('p', {}, 'Puoi cancellare tutto eliminando i libri dall\'app o disinstallandola.'),
      h('h3', {}, 'Voci di Leggilo'),
      h('p', {}, 'Le voci si scaricano da Hugging Face solo quando le scegli e poi funzionano sul dispositivo. Motore: Piper (MIT), espeak-ng (GPL-3.0) e ONNX Runtime (MIT).'),
      VOCI_LEGGILO.map(v => h('p', {}, `${v.nome}: ${v.crediti}`)))))
}

// Capitoli (file) di una serie, dal più vecchio
export async function capitoliDi(seriesId) {
  const vol = await api.volumi(seriesId)
  return (vol || []).flatMap(v => (v.chapters || []).map(c => ({ ...c, volumeId: v.id })))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
}

export async function vistaLibro(app, seriesId) {
  const contenuto = h('div', { class: 'contenuto' }, rotella())
  app.replaceChildren(h('div', { class: 'vista' }, barraPrincipale({ titolo: ' ', indietro: tornaIndietro }), contenuto))

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
    h('div', {}, copertina({ nome: s.name, src: api.urlCopertina(s.id) })),
    h('div', {},
      h('h2', {}, s.name),
      h('div', { class: 'autore' }, autore),
      pct > 0 ? h('div', {}, h('div', { class: 'barra-avanzamento' }, h('i', { style: { width: pct + '%' } })), h('div', { class: 'piccolo', style: { marginTop: '6px' } }, pct >= 100 ? 'Letto' : `Letto al ${pct}%`)) : null,
      azioni,
      h('div', { class: 'piccolo' }, info),
      riassunto ? h('div', { class: 'riassunto' }, riassunto.split(/\n{2,}/).map(p => h('p', {}, p))) : null)))
}

