// Lettura ad alta voce con le voci del dispositivo (Web Speech API).
// Si legge una frase alla volta: è più affidabile su iOS e Android e permette di evidenziare la frase.
import { leggi, scrivi, predefiniteVoce } from './impostazioni.js'

const sintesi = window.speechSynthesis
export const voceDisponibile = !!sintesi && typeof SpeechSynthesisUtterance !== 'undefined'

export function elencoVoci() {
  return new Promise(ok => {
    if (!voceDisponibile) return ok([])
    const v = sintesi.getVoices()
    if (v.length) return ok(v)
    const t = setTimeout(() => ok(sintesi.getVoices()), 1500)
    sintesi.addEventListener('voiceschanged', () => { clearTimeout(t); ok(sintesi.getVoices()) }, { once: true })
  })
}

export const preferenzeVoce = () => ({ ...predefiniteVoce, ...leggi('voce', {}) })
export const salvaPreferenzeVoce = p => scrivi('voce', { ...preferenzeVoce(), ...p })

// Sceglie la voce: quella salvata, altrimenti la migliore per la lingua del libro
export async function scegliVoce(lingua = 'it') {
  const voci = await elencoVoci()
  const { voce } = preferenzeVoce()
  const salvata = voci.find(v => v.voiceURI === voce)
  if (salvata) return salvata
  const l = (lingua || 'it').toLowerCase().slice(0, 2)
  const stessa = voci.filter(v => v.lang?.toLowerCase().startsWith(l))
  return stessa.find(v => /enhanced|premium|neural|natural/i.test(v.name)) || stessa.find(v => v.localService) || stessa[0] || voci[0] || null
}

// Divide un testo in frasi
export function frasi(testo, lingua = 'it') {
  const pulito = testo.replace(/\s+/g, ' ').trim()
  if (!pulito) return []
  if (typeof Intl.Segmenter === 'function') {
    return Array.from(new Intl.Segmenter(lingua, { granularity: 'sentence' }).segment(pulito), s => s.segment.trim()).filter(Boolean)
  }
  return pulito.match(/[^.!?…]+[.!?…]*\s*/g)?.map(s => s.trim()).filter(Boolean) ?? [pulito]
}

let blocco = null
async function tieniSchermoAcceso(si) {
  try {
    if (si && 'wakeLock' in navigator && !blocco) {
      blocco = await navigator.wakeLock.request('screen')
      blocco.addEventListener('release', () => { blocco = null })
    } else if (!si && blocco) { await blocco.release(); blocco = null }
  } catch { blocco = null }
}

/**
 * Lettore di frasi. Riceve i blocchi di testo da una "sorgente":
 *   sorgente.prossimo() -> Promise<{ segmenti: [{testo, dati}] } | null>
 * e chiama onFrase(segmento) quando inizia a leggere una frase.
 */
export class Lettore extends EventTarget {
  constructor() {
    super()
    this.attivo = false
    this.segmenti = []
    this.indice = 0
    this.generazione = 0
    this.voce = null
    this.lingua = 'it'
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.attivo) tieniSchermoAcceso(true)
    })
  }

  async avvia(sorgente, { lingua, titolo, autore } = {}) {
    this.ferma()
    this.sorgente = sorgente
    this.lingua = lingua || 'it'
    this.voce = await scegliVoce(this.lingua)
    this.attivo = true
    this.#mediaSession(titolo, autore)
    tieniSchermoAcceso(true)
    this.#emetti('stato')
    await this.#caricaBlocco()
  }

  async #caricaBlocco() {
    const gen = this.generazione
    const b = await this.sorgente.prossimo()
    if (gen !== this.generazione || !this.attivo) return
    if (!b) { this.ferma(); this.#emetti('fine'); return }
    this.segmenti = b.segmenti.filter(s => s.testo.trim())
    this.indice = 0
    if (!this.segmenti.length) return this.#caricaBlocco()
    this.#parla()
  }

  #parla() {
    const gen = this.generazione
    const seg = this.segmenti[this.indice]
    if (!seg) return this.#caricaBlocco()
    const { velocita } = preferenzeVoce()
    const u = new SpeechSynthesisUtterance(seg.testo)
    if (this.voce) { u.voice = this.voce; u.lang = this.voce.lang } else u.lang = this.lingua
    u.rate = velocita
    u.onstart = () => { if (gen === this.generazione) this.#emetti('frase', seg) }
    u.onend = () => {
      if (gen !== this.generazione || !this.attivo) return
      this.indice++
      this.#parla()
    }
    u.onerror = e => {
      if (gen !== this.generazione) return
      if (e.error === 'interrupted' || e.error === 'canceled') return
      this.indice++
      this.#parla()
    }
    // Alcuni browser non chiamano onstart: si evidenzia comunque
    this.#emetti('frase', seg)
    sintesi.speak(u)
  }

  pausa() {
    if (!this.attivo) return
    this.generazione++
    this.attivo = false
    this.inPausa = true
    sintesi.cancel()
    tieniSchermoAcceso(false)
    this.#emetti('stato')
  }

  riprendi() {
    if (!this.inPausa || !this.sorgente) return
    this.inPausa = false
    this.attivo = true
    this.generazione++
    tieniSchermoAcceso(true)
    this.#emetti('stato')
    this.#parla()
  }

  avanti() {
    if (!this.sorgente) return
    this.generazione++
    sintesi.cancel()
    this.indice++
    if (this.attivo) this.#parla()
  }

  indietro() {
    if (!this.sorgente) return
    this.generazione++
    sintesi.cancel()
    this.indice = Math.max(0, this.indice - 1)
    if (this.attivo) this.#parla()
  }

  async cambiaVoce() {
    this.voce = await scegliVoce(this.lingua)
    if (this.attivo) { this.generazione++; sintesi.cancel(); this.#parla() }
  }

  ferma() {
    this.generazione++
    const eraAttivo = this.attivo || this.inPausa
    this.attivo = false
    this.inPausa = false
    this.segmenti = []
    if (voceDisponibile) sintesi.cancel()
    tieniSchermoAcceso(false)
    if (eraAttivo) this.#emetti('stato')
  }

  #emetti(tipo, dettaglio) { this.dispatchEvent(new CustomEvent(tipo, { detail: dettaglio })) }

  #mediaSession(titolo, autore) {
    if (!('mediaSession' in navigator)) return
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: titolo || 'Leggilo', artist: autore || '', album: 'Leggilo' })
      navigator.mediaSession.setActionHandler('play', () => this.riprendi())
      navigator.mediaSession.setActionHandler('pause', () => this.pausa())
      navigator.mediaSession.setActionHandler('nexttrack', () => this.avanti())
      navigator.mediaSession.setActionHandler('previoustrack', () => this.indietro())
    } catch {}
  }
}
