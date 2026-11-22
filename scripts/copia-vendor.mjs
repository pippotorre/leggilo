// Copia in public/vendor i file binari delle voci di Leggilo (ONNX Runtime e fonemizzatore espeak),
// che vengono scaricati dal telefono solo quando si usa una voce di Leggilo.
import { mkdirSync, copyFileSync } from 'node:fs'
const dest = new URL('../public/vendor/', import.meta.url)
const copia = (da, a) => {
  const d = new URL(a, dest)
  mkdirSync(new URL('./', d), { recursive: true })
  copyFileSync(new URL(da, new URL('../node_modules/', import.meta.url)), d)
}
copia('onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', 'ort/ort-wasm-simd-threaded.wasm')
copia('onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', 'ort/ort-wasm-simd-threaded.mjs')
copia('@diffusionstudio/piper-wasm/build/piper_phonemize.wasm', 'piper/piper_phonemize.wasm')
copia('@diffusionstudio/piper-wasm/build/piper_phonemize.data', 'piper/piper_phonemize.data')
console.log('vendor copiati')
