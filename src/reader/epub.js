// Lettore EPUB basato su foliate-js
import 'foliate-js/view.js'
import { riconosciLingua } from '../voce.js'

const MARGINI = { stretti: { gap: '4%', margin: '32px' }, medi: { gap: '7%', margin: '48px' }, ampi: { gap: '11%', margin: '64px' } }

function cssLibro({ dimensione, interlinea, colori }) {
  return `
    @namespace epub "http://www.idpf.org/2007/ops";
    html { color-scheme: ${colori.scuro ? 'dark' : 'light'}; font-size: ${dimensione}% !important; }
    html, body { background: transparent !important; color: ${colori.testo} !important; }
    body * { color: inherit; background-color: transparent; }
    a:link, a:visited { color: ${colori.link} !important; }
    p, li, blockquote, dd {
      line-height: ${interlinea} !important; text-align: justify;
      -webkit-hyphens: auto; hyphens: auto; widows: 2; orphans: 2;
    }
    [align="left"] { text-align: left; } [align="right"] { text-align: right; } [align="center"] { text-align: center; }
    pre { white-space: pre-wrap !important; }
    img, svg { max-width: 100%; height: auto; }
    ::selection { background: ${colori.evidenzia}; color: inherit; }
    aside[epub|type~="footnote"], aside[epub|type~="endnote"], aside[epub|type~="note"], aside[epub|type~="rearnote"] { display: none; }
  `
}


// Converte l'SSML prodotto da foliate in frasi con il loro "mark"
function segmentiDaSSML(ssml) {
  const doc = new DOMParser().parseFromString(ssml, 'application/xml')
  const segmenti = []
  let corrente = { testo: '', dati: null }
  const visita = nodo => {
    for (const n of nodo.childNodes) {
      if (n.nodeType === 3 || n.nodeType === 4) corrente.testo += n.textContent
      else if (n.nodeType === 1) {
        const nome = n.localName
        if (nome === 'mark') {
          if (corrente.testo.trim()) segmenti.push(corrente)
          corrente = { testo: '', dati: n.getAttribute('name') }
        } else if (nome === 'break') corrente.testo += ' '
        else visita(n)
      }
    }
  }
  visita(doc.documentElement)
  if (corrente.testo.trim()) segmenti.push(corrente)
  return segmenti.map(s => ({ ...s, testo: s.testo.replace(/\s+/g, ' ').trim() }))
}

export async function apriEpub(contenitore, blob, { posizione, onPosizione, onTocco, impostazioni }) {
  const view = document.createElement('foliate-view')
  contenitore.append(view)
  const file = blob instanceof File ? blob : new File([blob], 'libro.epub', { type: 'application/epub+zip' })
  await view.open(file)

  const applicaStile = imp => {
    const m = MARGINI[imp.margini] || MARGINI.medi
    view.renderer.setAttribute('flow', 'paginated')
    view.renderer.setAttribute('gap', m.gap)
    view.renderer.setAttribute('margin', m.margin)
    view.renderer.setAttribute('max-inline-size', '680px')
    view.renderer.setAttribute('max-column-count', '2')
    view.renderer.setStyles?.(cssLibro(imp))
  }
  applicaStile(impostazioni)

  view.addEventListener('load', ({ detail: { doc } }) => {
    doc.addEventListener('click', e => {
      if (e.target.closest?.('a')) return
      const sel = doc.getSelection?.()
      if (sel && !sel.isCollapsed) return
      onTocco?.('centro')
    })
    doc.addEventListener('keydown', tastiera)
  })
  view.addEventListener('relocate', ({ detail }) => {
    onPosizione?.({
      indice: detail.section?.current ?? 0,
      sezioni: detail.section?.total ?? 1,
      frazione: detail.fraction ?? 0,
      cfi: detail.cfi,
      capitolo: detail.tocItem?.label?.trim() || '',
      range: detail.range,
    })
  })
  const tastiera = e => {
    if (e.key === 'ArrowLeft') view.goLeft()
    else if (e.key === 'ArrowRight' || e.key === ' ') view.goRight()
  }
  document.addEventListener('keydown', tastiera)

  // Posizione iniziale: CFI locale se c'è, altrimenti la sezione salvata su Kavita
  try {
    if (posizione?.cfi) await view.init({ lastLocation: posizione.cfi })
    else if (posizione?.indice > 0) await view.goTo(posizione.indice)
    else await view.init({ showTextStart: true })
  } catch {
    await view.init({ showTextStart: true })
  }

  const linguaDichiarata = (Array.isArray(view.book.metadata?.language) ? view.book.metadata.language[0] : view.book.metadata?.language) || 'it'
  // Lingua riconosciuta dal testo della sezione aperta (i metadati sono spesso sbagliati)
  const linguaTesto = () => {
    const doc = view.renderer.getContents()[0]?.doc
    return riconosciLingua(doc?.body?.textContent?.slice(0, 20000), linguaDichiarata.slice(0, 2))
  }

  // Sorgente per la lettura ad alta voce
  function sorgenteVoce() {
    let primo = true
    return {
      async prossimo() {
        let ssml
        if (primo) {
          primo = false
          await view.initTTS('sentence')
          const range = view.lastLocation?.range
          ssml = range ? view.tts.from(range) : view.tts.start()
        } else {
          ssml = view.tts.next()
        }
        while (!ssml) {
          const { index } = view.renderer.getContents()[0] ?? {}
          if (index == null || index >= view.book.sections.length - 1) return null
          await view.renderer.nextSection()
          await view.initTTS('sentence')
          ssml = view.tts.start()
        }
        return { segmenti: segmentiDaSSML(ssml) }
      },
    }
  }

  return {
    tipo: 'epub',
    get lingua() { return linguaTesto() },
    titolo: view.book.metadata?.title,
    indice: () => view.book.toc ?? [],
    vaiA: href => view.goTo(href),
    vaiAFrazione: f => view.goToFraction(f),
    avanti: () => view.goRight(),
    indietro: () => view.goLeft(),
    impostaStile: applicaStile,
    sorgenteVoce,
    evidenziaFrase: seg => { if (seg?.dati != null) view.tts?.setMark(seg.dati) },
    togliEvidenza: () => view.deselect?.(),
    chiudi: () => { document.removeEventListener('keydown', tastiera); view.close(); view.remove() },
  }
}
