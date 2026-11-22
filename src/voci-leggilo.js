// Voci neurali di Leggilo (Piper): si scaricano una volta e funzionano offline
const HF = 'https://huggingface.co/'
export const VOCI_LEGGILO = [
  {
    id: 'paola', nome: 'Paola', genere: 'femminile', qualita: 'naturale', mb: 63,
    modello: HF + 'rhasspy/piper-voices/resolve/main/it/it_IT/paola/medium/it_IT-paola-medium.onnx',
    crediti: 'Voce "paola" (Piper, rhasspy/piper-voices, licenza MIT; dati CC0).',
  },
  {
    id: 'serena', nome: 'Serena', genere: 'femminile', qualita: 'molto naturale, ma lenta: può fare pause tra le frasi', mb: 114,
    modello: HF + 'committa/it_IT-serena-high/resolve/main/it_IT-serena-high.onnx',
    crediti: 'Voce "it_IT-serena-high" di Marco Baccarani, Committa (committa.it), huggingface.co/committa/it_IT-serena-high, licenza CC BY 4.0.',
  },
  {
    id: 'riccardo', nome: 'Riccardo', genere: 'maschile', qualita: 'semplice', mb: 28,
    modello: HF + 'rhasspy/piper-voices/resolve/main/it/it_IT/riccardo/x_low/it_IT-riccardo-x_low.onnx',
    crediti: 'Voce "riccardo" (Piper, rhasspy/piper-voices, licenza MIT; dati M-AILABS Speech Dataset).',
  },
]
export const PREFISSO = 'leggilo:'
export const voceLeggilo = id => VOCI_LEGGILO.find(v => PREFISSO + v.id === id || v.id === id)
const CACHE = 'leggilo-voci'

export async function voceScaricata(v) {
  try {
    const c = await caches.open(CACHE)
    return !!(await c.match(v.modello)) && !!(await c.match(v.modello + '.json'))
  } catch { return false }
}

export async function scaricaVoce(v, onAvanzamento, segnale) {
  const c = await caches.open(CACHE)
  const cfg = await fetch(v.modello + '.json', { signal: segnale })
  if (!cfg.ok) throw new Error('Download non riuscito')
  const r = await fetch(v.modello, { signal: segnale })
  if (!r.ok || !r.body) throw new Error('Download non riuscito')
  const totale = +r.headers.get('Content-Length') || v.mb * 1048576
  const lettore = r.body.getReader()
  const pezzi = []
  let ricevuti = 0
  for (;;) {
    const { done, value } = await lettore.read()
    if (done) break
    pezzi.push(value)
    ricevuti += value.length
    onAvanzamento?.(Math.min(1, ricevuti / totale))
  }
  try { await navigator.storage?.persist?.() } catch {}
  await c.put(v.modello + '.json', cfg)
  await c.put(v.modello, new Response(new Blob(pezzi), { headers: { 'Content-Type': 'application/octet-stream' } }))
  // Prepara anche i file del motore, così la voce funziona subito offline
  await Promise.all(['vendor/ort/ort-wasm-simd-threaded.wasm', 'vendor/ort/ort-wasm-simd-threaded.mjs', 'vendor/piper/piper_phonemize.wasm', 'vendor/piper/piper_phonemize.data']
    .map(u => fetch(new URL(u, document.baseURI)).catch(() => {})))
}

export async function eliminaVoce(v) {
  const c = await caches.open(CACHE)
  await c.delete(v.modello)
  await c.delete(v.modello + '.json')
}

// ---------- Sintesi nel worker ----------
let worker, prossimo = 1
const attese = new Map()
function lavoratore() {
  if (worker) return worker
  worker = new Worker(new URL('./piper-worker.js', import.meta.url), { type: 'module' })
  worker.onmessage = ({ data }) => {
    const a = attese.get(data.id)
    if (!a) return
    attese.delete(data.id)
    data.errore ? a.ko(new Error(data.errore)) : a.ok(data)
  }
  worker.onerror = e => { for (const a of attese.values()) a.ko(new Error(e.message || 'Errore della voce')); attese.clear(); worker = null }
  return worker
}

// Restituisce un Blob WAV con la frase letta
export function sintetizza(v, testo, velocita = 1) {
  const id = prossimo++
  return new Promise((ok, ko) => {
    attese.set(id, { ok: d => ok(new Blob([d.wav], { type: 'audio/wav' })), ko })
    lavoratore().postMessage({ id, modello: v.modello, testo, velocita, base: document.baseURI })
  })
}
