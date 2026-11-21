// Schermata di lettura: EPUB o PDF, progressi, impostazioni e lettura ad alta voce
import { h, avviso, rotella, debounce } from './util.js'
import { icone } from './icone.js'
import * as api from './api.js'
import { fileLibro, schedaSalvata, salvaLibro, inviaProgresso, posizioneLocale, salvaPosizioneLocale, chiediSpazioPersistente } from './offline.js'
import { leggi, scrivi, predefiniteLettura, applicaTema, temaAttivo } from './impostazioni.js'
import { Lettore, voceDisponibile, elencoVoci, preferenzeVoce, salvaPreferenzeVoce } from './voce.js'
import { capitoliDi } from './viste.js'
import { coloriTema } from './temi.js'

const lettoreVoce = voceDisponibile ? new Lettore() : null
let chiusuraCorrente = null

export function chiudiLettore() {
  chiusuraCorrente?.()
  chiusuraCorrente = null
}

async function recuperaScheda(chapterId, seriesId) {
  const salvata = await schedaSalvata(chapterId)
  try {
    const sid = seriesId || salvata?.seriesId
    const [s, capitoli] = await Promise.all([api.serie(sid), capitoliDi(sid)])
    const c = capitoli.find(x => x.id === chapterId)
    if (!c) throw new Error('Libro non trovato')
    const autore = (leggi('elenco', []) || []).find(x => x.id === sid)?.autore || api.autoreDaCartella(s)
    return { chapterId, seriesId: sid, volumeId: c.volumeId, libraryId: s.libraryId, nome: s.name, autore, formato: c.files?.[0]?.format ?? s.format, pagine: c.pages }
  } catch (e) {
    if (salvata) return salvata
    throw e
  }
}

export async function vistaLettore(app, chapterId, seriesId) {
  chiudiLettore()
  const imp = { ...predefiniteLettura, ...leggi('lettura', {}) }
  const pagina = h('div', { class: 'pagina' }, rotella('Apro il libro…'))
  const titolo = h('div', { class: 'titolo' }, '')
  const stato = h('div', { class: 'stato' }, '')
  const fraseBox = h('div', { class: 'frase-letta', hidden: true })
  const btnAscolta = h('button', { class: 'btn-ascolta', 'aria-label': 'Ascolta' }, h('span', { html: icone.play }), h('span', {}, 'Ascolta'))
  const btnIndice = h('button', { class: 'btn-icona', 'aria-label': 'Indice', html: icone.indice })
  const btnTesto = h('button', { class: 'btn-icona', 'aria-label': 'Testo e voce', html: icone.testo })
  const btnPrima = h('button', { class: 'btn-icona', 'aria-label': 'Pagina precedente', html: icone.indietro })
  const btnDopo = h('button', { class: 'btn-icona', 'aria-label': 'Pagina successiva', html: icone.indietro, style: { transform: 'scaleX(-1)' } })
  const radice = h('div', { class: 'lettore vista' },
    h('header', { class: 'barra' },
      h('button', { class: 'btn-icona', 'aria-label': 'Torna alla libreria', html: icone.indietro, onclick: () => esci() }),
      titolo, btnIndice, btnTesto),
    pagina, fraseBox,
    h('footer', { class: 'piede' }, btnPrima, stato, voceDisponibile ? btnAscolta : null, btnDopo))
  app.replaceChildren(radice)

  let scheda, controller, ultimaPosizione
  const esci = () => { location.hash = scheda ? `#/libro/${scheda.seriesId}` : '#/' }

  // Progressi
  const inviaAKavita = debounce(() => {
    if (!ultimaPosizione) return
    inviaProgresso(progressoKavita(ultimaPosizione))
  }, 3000)
  const salvaLocale = debounce(p => salvaPosizioneLocale(chapterId, p), 400)

  function progressoKavita(p) {
    let pageNum
    if (controller.tipo === 'pdf') pageNum = p.pagina
    else {
      const ultima = p.indice >= (p.sezioni || 1) - 1 && p.frazione > 0.995
      pageNum = ultima ? (scheda.pagine || p.sezioni) : p.indice
    }
    return { libraryId: scheda.libraryId, seriesId: scheda.seriesId, volumeId: scheda.volumeId, chapterId, pageNum, bookScrollId: null }
  }

  function aggiornaPosizione(p) {
    ultimaPosizione = p
    const pct = Math.round((p.frazione || 0) * 100)
    stato.textContent = controller?.tipo === 'pdf' || p.pagina
      ? `Pagina ${p.pagina} di ${p.totale}`
      : [p.capitolo, `${pct}%`].filter(Boolean).join(' · ')
    salvaLocale(controller?.tipo === 'pdf' || p.pagina ? { pagina: p.pagina } : { cfi: p.cfi, indice: p.indice })
    inviaAKavita()
  }


  try {
    scheda = await recuperaScheda(chapterId, seriesId)
    titolo.textContent = scheda.nome
    document.title = `${scheda.nome} · Leggilo`
    let blob = await fileLibro(chapterId)
    if (!blob) {
      pagina.replaceChildren(rotella('Scarico il libro…'))
      blob = await api.scaricaCapitolo(chapterId, scheda.formato)
      // Il libro aperto resta sul dispositivo, così si può continuare anche offline
      chiediSpazioPersistente()
      salvaLibro(scheda, blob).catch(() => {})
    }

    // Posizione: la più recente tra quella del dispositivo e quella di Kavita
    const locale = posizioneLocale(chapterId)
    let server = null
    try { server = await api.progresso(chapterId) } catch {}
    const quandoServer = server?.lastModifiedUtc ? Date.parse(server.lastModifiedUtc) : 0
    const usaLocale = locale && (!server || (locale.quando || 0) >= quandoServer - 5000)

    pagina.replaceChildren()
    const comuni = {
      impostazioni: { ...imp, colori: coloriTema(temaAttivo() === 'scuro') },
      onTocco: () => radice.classList.toggle('immerso'),
      onPosizione: p => aggiornaPosizione(p),
    }
    if (scheda.formato === 4) {
      const { apriPdf } = await import('./reader/pdf.js')
      const pag = usaLocale ? locale.pagina : (server?.pageNum || 1)
      controller = await apriPdf(pagina, blob, { ...comuni, posizione: { pagina: pag } })
      btnIndice.hidden = true
    } else {
      const { apriEpub } = await import('./reader/epub.js')
      const posizione = usaLocale ? { cfi: locale.cfi, indice: locale.indice } : { indice: server?.pageNum || 0 }
      controller = await apriEpub(pagina, blob, { ...comuni, posizione })
    }
  } catch (e) {
    pagina.replaceChildren(h('div', { class: 'vuoto' }, e.stato === 403
      ? 'Il tuo utente non ha il permesso di scaricare i libri. Chiedi di attivare "Download" in Kavita.'
      : (e.message || 'Non riesco ad aprire il libro.')))
    return
  }

  btnPrima.onclick = () => lettoreVoce?.attivo ? lettoreVoce.indietro() : controller.indietro()
  btnDopo.onclick = () => lettoreVoce?.attivo ? lettoreVoce.avanti() : controller.avanti()

  // Lettura ad alta voce
  const aggiornaAscolta = () => {
    const attivo = lettoreVoce?.attivo
    btnAscolta.classList.toggle('attivo', !!attivo)
    btnAscolta.firstChild.innerHTML = attivo ? icone.pausa : icone.play
    btnAscolta.lastChild.textContent = attivo ? 'Pausa' : (lettoreVoce?.inPausa ? 'Riprendi' : 'Ascolta')
    btnPrima.setAttribute('aria-label', attivo ? 'Frase precedente' : 'Pagina precedente')
    btnDopo.setAttribute('aria-label', attivo ? 'Frase successiva' : 'Pagina successiva')
    if (!attivo && !lettoreVoce?.inPausa) { fraseBox.hidden = true; controller?.togliEvidenza() }
  }
  const suFrase = e => {
    controller.evidenziaFrase(e.detail)
    if (controller.tipo === 'pdf') { fraseBox.hidden = false; fraseBox.textContent = e.detail.testo }
  }
  const suFine = () => avviso('Fine del libro')
  if (lettoreVoce) {
    lettoreVoce.addEventListener('stato', aggiornaAscolta)
    lettoreVoce.addEventListener('frase', suFrase)
    lettoreVoce.addEventListener('fine', suFine)
    btnAscolta.onclick = async () => {
      if (lettoreVoce.attivo) return lettoreVoce.pausa()
      if (lettoreVoce.inPausa) return lettoreVoce.riprendi()
      if (controller.haTesto && !(await controller.haTesto())) {
        avviso('Questa pagina non contiene testo leggibile (forse è una scansione).', null, 5000)
      }
      lettoreVoce.avvia(controller.sorgenteVoce(), { lingua: controller.lingua, titolo: scheda.nome, autore: scheda.autore })
    }
  }

  btnTesto.onclick = () => pannelloImpostazioni(controller, imp)
  btnIndice.onclick = () => pannelloIndice(controller)

  const suTema = () => controller.impostaStile({ ...imp, colori: coloriTema(temaAttivo() === 'scuro') })
  addEventListener('leggilo:tema', suTema)

  chiusuraCorrente = () => {
    if (ultimaPosizione) inviaProgresso(progressoKavita(ultimaPosizione))
    if (lettoreVoce) {
      lettoreVoce.ferma()
      lettoreVoce.removeEventListener('stato', aggiornaAscolta)
      lettoreVoce.removeEventListener('frase', suFrase)
      lettoreVoce.removeEventListener('fine', suFine)
    }
    removeEventListener('leggilo:tema', suTema)
    controller?.chiudi()
    document.title = 'Leggilo'
  }
}

function apriPannello(...contenuto) {
  const velo = h('div', { class: 'velo' })
  const chiudi = () => { velo.remove(); pannello.remove(); document.removeEventListener('keydown', esc) }
  const esc = e => { if (e.key === 'Escape') chiudi() }
  const pannello = h('div', { class: 'pannello', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'maniglia' }),
    h('button', { class: 'btn-icona chiudi-pannello', 'aria-label': 'Chiudi', html: icone.chiudi, onclick: () => chiudi() }),
    ...contenuto)
  velo.onclick = chiudi
  document.addEventListener('keydown', esc)
  document.body.append(velo, pannello)
  return chiudi
}

function scelte(opzioni, valore, onScegli) {
  const box = h('div', { class: 'scelte' })
  const disegna = v => {
    box.replaceChildren(...opzioni.map(([val, etichetta]) =>
      h('button', { 'aria-pressed': String(val === v), onclick: () => { onScegli(val); disegna(val) } }, etichetta)))
  }
  disegna(valore)
  return box
}

async function pannelloImpostazioni(controller, imp) {
  const applica = () => {
    scrivi('lettura', { dimensione: imp.dimensione, interlinea: imp.interlinea, margini: imp.margini })
    controller.impostaStile({ ...imp, colori: coloriTema(temaAttivo() === 'scuro') })
  }
  const sezioni = []
  if (controller.tipo === 'epub') {
    const etDim = h('span', { class: 'piccolo', style: { minWidth: '44px', textAlign: 'right' } }, imp.dimensione + '%')
    const dim = h('input', { type: 'range', min: 70, max: 200, step: 10, value: imp.dimensione, 'aria-label': 'Dimensione del testo' })
    dim.oninput = () => { imp.dimensione = +dim.value; etDim.textContent = dim.value + '%'; applica() }
    const etInt = h('span', { class: 'piccolo', style: { minWidth: '44px', textAlign: 'right' } }, imp.interlinea.toFixed(1))
    const int = h('input', { type: 'range', min: 1.2, max: 2.2, step: 0.1, value: imp.interlinea, 'aria-label': 'Interlinea' })
    int.oninput = () => { imp.interlinea = +int.value; etInt.textContent = (+int.value).toFixed(1); applica() }
    sezioni.push(
      h('h3', {}, 'Dimensione del testo'), h('div', { class: 'riga' }, h('span', { html: icone.meno, style: { width: '20px' } }), dim, etDim),
      h('h3', {}, 'Interlinea'), h('div', { class: 'riga' }, int, etInt),
      h('h3', {}, 'Margini'), scelte([['stretti', 'Stretti'], ['medi', 'Medi'], ['ampi', 'Ampi']], imp.margini, v => { imp.margini = v; applica() }))
  } else {
    sezioni.push(h('h3', {}, 'Zoom'), h('div', { class: 'riga' },
      h('button', { class: 'btn', onclick: () => controller.zoom(-0.25) }, h('span', { html: icone.meno }), 'Riduci'),
      h('button', { class: 'btn', onclick: () => controller.zoom(0.25) }, h('span', { html: icone.piu }), 'Ingrandisci')))
  }
  sezioni.push(h('h3', {}, 'Tema'), scelte([['chiaro', 'Carta'], ['scuro', 'Notte']], temaAttivo(), v => { applicaTema(v); dispatchEvent(new Event('leggilo:tema')) }))

  if (voceDisponibile) {
    const voci = await elencoVoci()
    const pref = preferenzeVoce()
    const lingua = (controller.lingua || 'it').slice(0, 2).toLowerCase()
    const ordinate = [...voci].sort((a, b) => {
      const pa = a.lang?.toLowerCase().startsWith(lingua) ? 0 : 1, pb = b.lang?.toLowerCase().startsWith(lingua) ? 0 : 1
      return pa - pb || a.name.localeCompare(b.name)
    })
    const sel = h('select', { 'aria-label': 'Voce' },
      h('option', { value: '' }, 'Automatica'),
      ordinate.map(v => h('option', { value: v.voiceURI, selected: v.voiceURI === pref.voce }, `${v.name} (${v.lang})`)))
    sel.onchange = () => { salvaPreferenzeVoce({ voce: sel.value }); lettoreVoce?.cambiaVoce() }
    const etVel = h('span', { class: 'piccolo', style: { minWidth: '44px', textAlign: 'right' } }, pref.velocita.toFixed(1) + '×')
    const vel = h('input', { type: 'range', min: 0.6, max: 2, step: 0.1, value: pref.velocita, 'aria-label': 'Velocità di lettura' })
    vel.oninput = () => { etVel.textContent = (+vel.value).toFixed(1) + '×' }
    vel.onchange = () => { salvaPreferenzeVoce({ velocita: +vel.value }); lettoreVoce?.cambiaVoce() }
    sezioni.push(h('h3', {}, 'Voce'), h('div', { class: 'riga' }, sel),
      h('h3', {}, 'Velocità della voce'), h('div', { class: 'riga' }, vel, etVel))
  }
  apriPannello(...sezioni)
}

function pannelloIndice(controller) {
  const voci = controller.indice()
  if (!voci.length) { avviso('Questo libro non ha un indice'); return }
  let chiudi
  const lista = h('nav', { class: 'indice', 'aria-label': 'Indice' })
  const aggiungi = (items, sub) => {
    for (const it of items) {
      lista.append(h('a', { href: '#', class: sub ? 'sub' : '', onclick: e => { e.preventDefault(); controller.vaiA(it.href); chiudi() } }, it.label?.trim() || '—'))
      if (it.subitems?.length) aggiungi(it.subitems, true)
    }
  }
  aggiungi(voci, false)
  chiudi = apriPannello(h('h3', {}, 'Indice'), lista)
}
