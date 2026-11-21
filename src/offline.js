// Libri salvati sul dispositivo (IndexedDB) e coda dei progressi da inviare a Kavita
import { leggi, scrivi } from './impostazioni.js'
import { salvaProgresso } from './api.js'

const DB = 'leggilo'
let db

function apri() {
  if (db) return db
  db = new Promise((ok, ko) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => {
      r.result.createObjectStore('file')    // chiave: chapterId -> Blob
      r.result.createObjectStore('schede')  // chiave: chapterId -> dati del libro
    }
    r.onsuccess = () => ok(r.result)
    r.onerror = () => ko(r.error)
  })
  return db
}

async function tx(store, modo, fn) {
  const d = await apri()
  return new Promise((ok, ko) => {
    const t = d.transaction(store, modo)
    const req = fn(t.objectStore(store))
    t.oncomplete = () => ok(req?.result)
    t.onerror = () => ko(t.error)
    t.onabort = () => ko(t.error)
  })
}

export async function salvaLibro(scheda, blob) {
  await tx('file', 'readwrite', s => s.put(blob, scheda.chapterId))
  await tx('schede', 'readwrite', s => s.put({ ...scheda, byte: blob.size, salvato: Date.now() }, scheda.chapterId))
  dispatchEvent(new Event('leggilo:offline-cambiato'))
}
export const fileLibro = chapterId => tx('file', 'readonly', s => s.get(chapterId)).catch(() => null)
export const schedaSalvata = chapterId => tx('schede', 'readonly', s => s.get(chapterId)).catch(() => null)
export const schedeSalvate = () => tx('schede', 'readonly', s => s.getAll()).catch(() => [])
export async function eliminaLibro(chapterId) {
  await tx('file', 'readwrite', s => s.delete(chapterId))
  await tx('schede', 'readwrite', s => s.delete(chapterId))
  dispatchEvent(new Event('leggilo:offline-cambiato'))
}

export async function chiediSpazioPersistente() {
  try { await navigator.storage?.persist?.() } catch {}
}

// Ultimo elenco dei libri, per mostrare la libreria anche senza rete
export const salvaElenco = elenco => scrivi('elenco', elenco)
export const elencoSalvato = () => leggi('elenco', null)

// Posizione precisa (CFI per gli EPUB) salvata sul dispositivo
export const posizioneLocale = chapterId => leggi('pos.' + chapterId, null)
export const salvaPosizioneLocale = (chapterId, pos) => scrivi('pos.' + chapterId, { ...pos, quando: Date.now() })

// Progressi non ancora inviati (es. lettura offline): si tiene l'ultimo per capitolo
export async function inviaProgresso(p) {
  try {
    await salvaProgresso(p)
    togliDallaCoda(p.chapterId)
  } catch (e) {
    const coda = leggi('coda', {})
    coda[p.chapterId] = p
    scrivi('coda', coda)
  }
}
function togliDallaCoda(id) {
  const coda = leggi('coda', {})
  if (coda[id]) { delete coda[id]; scrivi('coda', coda) }
}
export async function svuotaCoda() {
  const coda = leggi('coda', {})
  for (const p of Object.values(coda)) {
    try { await salvaProgresso(p); togliDallaCoda(p.chapterId) } catch { return }
  }
}
addEventListener('online', svuotaCoda)
