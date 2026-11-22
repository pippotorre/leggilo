// Libri importati dal dispositivo: restano solo sul telefono, nessun server
import { tx } from './offline.js'
import { leggi, scrivi } from './impostazioni.js'

const TAG_ZLIB = /\s*\([^()]*(z-lib|1lib)[^()]*\)/gi
const NON_AUTORE = /italian edition|edizione italiana|vol\.\s*\d/i

// Dal nome del file "Titolo (Autore) (Z-Library).epub" ricava titolo e autore
export function datiDaNomeFile(nome) {
  let base = nome.normalize('NFC').replace(/\.[^.]+$/, '').replace(TAG_ZLIB, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()
  let autore = ''
  const m = base.match(/^(.*)\(([^()]*)\)\s*$/)
  if (m && !NON_AUTORE.test(m[2])) {
    base = m[1].trim()
    autore = m[2].replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim()
    const pezzi = autore.split(',').map(x => x.trim())
    if (pezzi.length === 2 && pezzi.every(x => x.split(' ').length === 1)) autore = `${pezzi[1]} ${pezzi[0]}`
  }
  return { titolo: base, autore }
}

const testo = x => {
  if (!x) return ''
  if (typeof x === 'string') return x
  if (Array.isArray(x)) return x.map(testo).filter(Boolean).join(', ')
  if (x.name) return testo(x.name)
  const k = Object.keys(x)
  return k.length ? String(x[k[0]]) : ''
}

async function riduciImmagine(blob, larghezza = 360) {
  try {
    const bmp = await createImageBitmap(blob)
    const scala = Math.min(1, larghezza / bmp.width)
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scala); c.height = Math.round(bmp.height * scala)
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
    return await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.82))
  } catch { return blob }
}

function formatoDi(file, testa) {
  if (testa[0] === 0x25 && testa[1] === 0x50 && testa[2] === 0x44 && testa[3] === 0x46) return 4 // %PDF
  if (testa[0] === 0x50 && testa[1] === 0x4b) return 3 // ZIP (EPUB)
  if (/\.pdf$/i.test(file.name)) return 4
  if (/\.epub$/i.test(file.name)) return 3
  return null
}

async function analizzaEpub(file) {
  const { makeBook } = await import('foliate-js/view.js')
  const book = await makeBook(file)
  const md = book.metadata || {}
  let copertina = null
  try { const c = await book.getCover?.(); if (c) copertina = await riduciImmagine(c) } catch {}
  const lingua = Array.isArray(md.language) ? md.language[0] : md.language
  return { titolo: testo(md.title), autore: testo(md.author), lingua, copertina }
}

async function analizzaPdf(file) {
  const pdfjs = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  try {
    const doc = await task.promise
    let titolo = '', autore = ''
    try { const m = await doc.getMetadata(); titolo = m?.info?.Title || ''; autore = m?.info?.Author || '' } catch {}
    let copertina = null
    try {
      const p = await doc.getPage(1)
      const vp0 = p.getViewport({ scale: 1 })
      const vp = p.getViewport({ scale: 360 / vp0.width })
      const c = document.createElement('canvas')
      c.width = Math.round(vp.width); c.height = Math.round(vp.height)
      await p.render({ canvas: c, viewport: vp }).promise
      copertina = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.8))
    } catch {}
    return { titolo, autore, copertina, pagine: doc.numPages }
  } finally { task.destroy() }
}

// Importa i file scelti dall'utente. Ritorna { aggiunti, saltati, errori }
export async function importa(files, onAvanzamento) {
  const esistenti = await tutti()
  const risultato = { aggiunti: [], saltati: [], errori: [] }
  let i = 0
  for (const file of files) {
    onAvanzamento?.(++i, files.length, file.name)
    try {
      const testa = new Uint8Array(await file.slice(0, 4).arrayBuffer())
      const formato = formatoDi(file, testa)
      if (!formato) { risultato.errori.push(`${file.name}: formato non supportato`); continue }
      if (esistenti.some(e => e.nomeFile === file.name && e.byte === file.size)) { risultato.saltati.push(file.name); continue }
      const daNome = datiDaNomeFile(file.name)
      let dati = {}
      try { dati = formato === 3 ? await analizzaEpub(file) : await analizzaPdf(file) } catch {}
      // Il nome del file è spesso più affidabile dei metadati (titoli vuoti, "Unknown", ecc.)
      const titoloBuono = t => t && !/^(unknown|untitled|sconosciuto)/i.test(t) && !/\.(pdf|docx?|indd)$/i.test(t)
      const scheda = {
        id: crypto.randomUUID?.() || String(Date.now()) + Math.random().toString(16).slice(2),
        nome: titoloBuono(daNome.titolo) && daNome.autore ? daNome.titolo : (titoloBuono(dati.titolo) ? dati.titolo : daNome.titolo),
        autore: daNome.autore || dati.autore || 'Senza autore',
        formato, lingua: dati.lingua || '', copertina: dati.copertina || null,
        nomeFile: file.name, byte: file.size, aggiunto: Date.now(), avanzamento: 0, letto: null,
      }
      await tx('filelocali', 'readwrite', s => s.put(file, scheda.id))
      await tx('locali', 'readwrite', s => s.put(scheda, scheda.id))
      risultato.aggiunti.push(scheda)
    } catch (e) {
      risultato.errori.push(`${file.name}: ${e.message || 'errore'}`)
    }
  }
  try { await navigator.storage?.persist?.() } catch {}
  dispatchEvent(new Event('leggilo:locali-cambiati'))
  return risultato
}

export const tutti = () => tx('locali', 'readonly', s => s.getAll()).catch(() => [])
export const scheda = id => tx('locali', 'readonly', s => s.get(id)).catch(() => null)
export const file = id => tx('filelocali', 'readonly', s => s.get(id)).catch(() => null)

export async function aggiorna(id, modifiche) {
  const s = await scheda(id)
  if (!s) return
  await tx('locali', 'readwrite', st => st.put({ ...s, ...modifiche }, id))
}

export async function elimina(id) {
  await tx('filelocali', 'readwrite', s => s.delete(id))
  await tx('locali', 'readwrite', s => s.delete(id))
  scrivi('pos.L' + id, undefined)
  dispatchEvent(new Event('leggilo:locali-cambiati'))
}

export async function spazioUsato() {
  try { const e = await navigator.storage.estimate(); return e } catch { return null }
}

export const posizione = id => leggi('pos.L' + id, null)
