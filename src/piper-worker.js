// Worker: fonemi con espeak-ng (WebAssembly) e voce con ONNX Runtime, tutto sul dispositivo
import * as ort from 'onnxruntime-web/wasm'
import codiceFonemi from '@diffusionstudio/piper-wasm/build/piper_phonemize.js?raw'

let base, fonemizzatore, risposta
const sessioni = new Map()
const configurazioni = new Map()

async function daCache(url) {
  const c = await caches.open('leggilo-voci')
  const r = await c.match(url)
  if (!r) throw new Error('Voce non scaricata')
  return r
}

async function preparaFonemi() {
  if (fonemizzatore) return fonemizzatore
  const crea = new Function(codiceFonemi + '\nreturn createPiperPhonemize')()
  fonemizzatore = await crea({
    print: d => risposta?.(JSON.parse(d)),
    printErr: () => {},
    locateFile: u => new URL(u.endsWith('.wasm') ? 'vendor/piper/piper_phonemize.wasm' : 'vendor/piper/piper_phonemize.data', base).href,
  })
  return fonemizzatore
}

function fonemi(testo, lingua) {
  return new Promise((ok, ko) => {
    risposta = ok
    try { fonemizzatore.callMain(['-l', lingua, '--input', JSON.stringify([{ text: testo }]), '--espeak_data', '/espeak-ng-data']) } catch (e) { ko(e) }
  })
}

async function sessione(modello) {
  if (!sessioni.has(modello)) {
    sessioni.clear() // una voce alla volta in memoria
    ort.env.wasm.wasmPaths = new URL('vendor/ort/', base).href
    ort.env.wasm.numThreads = 1
    const cfg = await (await daCache(modello + '.json')).json()
    const dati = await (await daCache(modello)).arrayBuffer()
    sessioni.set(modello, await ort.InferenceSession.create(dati, { executionProviders: ['wasm'] }))
    configurazioni.set(modello, cfg)
  }
  return { s: sessioni.get(modello), cfg: configurazioni.get(modello) }
}

function wav(pcm, sr) {
  const v = new DataView(new ArrayBuffer(44 + pcm.length * 2))
  const scrivi = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  scrivi(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); scrivi(8, 'WAVE'); scrivi(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true)
  v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); scrivi(36, 'data'); v.setUint32(40, pcm.length * 2, true)
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 32767, true)
  return v.buffer
}

// Le richieste si eseguono una alla volta
let coda = Promise.resolve()
self.onmessage = ({ data }) => {
  coda = coda.then(async () => {
    try {
      base = data.base
      await preparaFonemi()
      const { s, cfg } = await sessione(data.modello)
      const r = await fonemi(data.testo, cfg.espeak?.voice || 'it')
      const map = cfg.phoneme_id_map
      const id = p => map[p]?.[0]
      const ids = [id('^'), id('_')]
      for (const p of r.phonemes) { const x = id(p); if (x != null) ids.push(x, id('_')) }
      ids.push(id('$'))
      const { noise_scale = 0.667, length_scale = 1, noise_w = 0.8 } = cfg.inference || {}
      const feeds = {
        input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
        input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
        scales: new ort.Tensor('float32', Float32Array.from([noise_scale, length_scale / (data.velocita || 1), noise_w]), [3]),
      }
      if (s.inputNames.includes('sid')) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]), [1])
      const out = await s.run(feeds)
      const buf = wav(out[s.outputNames[0]].data, cfg.audio.sample_rate)
      self.postMessage({ id: data.id, wav: buf }, [buf])
    } catch (e) {
      self.postMessage({ id: data.id, errore: e?.message || String(e) })
    }
  })
}
