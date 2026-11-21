// Lettore PDF basato su pdf.js: una pagina alla volta, adattata alla larghezza
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { h } from '../util.js'
import { frasi, riconosciLingua } from '../voce.js'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export async function apriPdf(contenitore, blob, { posizione, onPosizione, onTocco }) {
  const dati = new Uint8Array(await blob.arrayBuffer())
  const caricamento = pdfjs.getDocument({ data: dati })
  const doc = await caricamento.promise
  const totale = doc.numPages
  let pagina = Math.min(Math.max(1, posizione?.pagina || 1), totale)
  let zoom = 1
  let compito = null

  const area = h('div', { class: 'pdf-pagina' })
  const tela = h('canvas')
  area.append(tela)
  const sx = h('div', { class: 'zona-tocco sx', onclick: () => indietro() })
  const dx = h('div', { class: 'zona-tocco dx', onclick: () => avanti() })
  area.addEventListener('click', e => { if (e.target === area || e.target === tela) onTocco?.('centro') })
  contenitore.append(area, sx, dx)

  async function disegna() {
    compito?.cancel()
    const p = await doc.getPage(pagina)
    const base = p.getViewport({ scale: 1 })
    const larghezza = Math.min(900, Math.max(200, area.clientWidth - 16))
    const scala = (larghezza / base.width) * zoom
    const vp = p.getViewport({ scale: scala })
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    tela.width = Math.floor(vp.width * dpr)
    tela.height = Math.floor(vp.height * dpr)
    tela.style.width = Math.floor(vp.width) + 'px'
    tela.style.height = Math.floor(vp.height) + 'px'
    compito = p.render({ canvas: tela, viewport: p.getViewport({ scale: scala * dpr }) })
    try { await compito.promise } catch (e) { if (e?.name !== 'RenderingCancelledException') throw e }
    area.scrollTop = 0
    onPosizione?.({ pagina, totale, frazione: totale > 1 ? (pagina - 1) / (totale - 1) : 1 })
  }

  async function vai(n) {
    const nuova = Math.min(Math.max(1, n), totale)
    if (nuova === pagina && tela.width) return
    pagina = nuova
    await disegna()
  }
  const avanti = () => vai(pagina + 1)
  const indietro = () => vai(pagina - 1)

  // Scorrimento orizzontale col dito
  let x0 = null, y0 = null
  area.addEventListener('touchstart', e => { if (e.touches.length === 1) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY } }, { passive: true })
  area.addEventListener('touchend', e => {
    if (x0 == null || zoom !== 1) return
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0
    x0 = null
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) dx < 0 ? avanti() : indietro()
  })
  const tastiera = e => {
    if (e.key === 'ArrowLeft') indietro()
    else if (e.key === 'ArrowRight' || e.key === ' ') avanti()
  }
  document.addEventListener('keydown', tastiera)
  const ridimensiona = () => disegna()
  addEventListener('resize', ridimensiona)

  await disegna()

  const testoPagina = async n => {
    const p = await doc.getPage(n)
    const c = await p.getTextContent()
    return c.items.map(i => (i.str || '') + (i.hasEOL ? '\n' : ' ')).join('')
      .replace(/-\n(\p{Ll})/gu, '$1').replace(/\s*\n\s*/g, ' ')
  }

  let titolo
  try { titolo = (await doc.getMetadata())?.info?.Title } catch {}

  function sorgenteVoce() {
    let prossima = pagina
    return {
      async prossimo() {
        while (prossima <= totale) {
          const n = prossima++
          const segmenti = frasi(await testoPagina(n)).map(testo => ({ testo, dati: n }))
          if (segmenti.length) return { segmenti }
        }
        return null
      },
    }
  }

  return {
    tipo: 'pdf',
    lingua: 'it',
    async linguaAttuale() { return riconosciLingua(await testoPagina(pagina)) },
    titolo,
    indice: () => [],
    avanti, indietro, vai,
    vaiAFrazione: f => vai(Math.round(f * (totale - 1)) + 1),
    zoom: d => { zoom = Math.min(3, Math.max(1, zoom + d)); disegna() },
    impostaStile: () => {},
    sorgenteVoce,
    evidenziaFrase: seg => { if (seg?.dati && seg.dati !== pagina) vai(seg.dati) },
    togliEvidenza: () => {},
    haTesto: async () => (await testoPagina(pagina)).trim().length > 0,
    chiudi: () => { document.removeEventListener('keydown', tastiera); removeEventListener('resize', ridimensiona); compito?.cancel(); caricamento.destroy() },
  }
}
