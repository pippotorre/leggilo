// Libri ricevuti da "Condividi": il service worker li deposita qui, l'app li importa
const DB = 'leggilo-condivisi'

function apri() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore('file', { autoIncrement: true })
    r.onsuccess = () => ok(r.result)
    r.onerror = () => ko(r.error)
  })
}

export async function salvaCondivisi(files) {
  const db = await apri()
  await new Promise((ok, ko) => {
    const t = db.transaction('file', 'readwrite')
    for (const f of files) t.objectStore('file').add(f)
    t.oncomplete = ok
    t.onerror = () => ko(t.error)
  })
  db.close()
}

// Restituisce i file in attesa e li toglie dalla coda
export async function prendiCondivisi() {
  const db = await apri()
  const files = await new Promise((ok, ko) => {
    const t = db.transaction('file', 'readwrite')
    const st = t.objectStore('file')
    const req = st.getAll()
    req.onsuccess = () => { st.clear(); }
    t.oncomplete = () => ok(req.result || [])
    t.onerror = () => ko(t.error)
  })
  db.close()
  return files
}
