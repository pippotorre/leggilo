// Lettura ad alta voce con le voci del dispositivo (Web Speech API).
// Si legge una frase alla volta: è più affidabile su iOS e Android e permette di evidenziare la frase.
import { leggi, scrivi, predefiniteVoce } from './impostazioni.js'
import { PREFISSO, voceLeggilo, voceScaricata, sintetizza } from './voci-leggilo.js'

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
  const { voce } = preferenzeVoce()
  // Voce di Leggilo (italiana): solo per i libri in italiano e se è già scaricata
  if (voce?.startsWith(PREFISSO) && (lingua || 'it').toLowerCase().startsWith('it')) {
    const v = voceLeggilo(voce)
    if (v && await voceScaricata(v)) return { leggilo: v, name: v.nome, lang: 'it-IT' }
  }
  const voci = await elencoVoci()
  const l = (lingua || 'it').toLowerCase().slice(0, 2)
  const stessaLingua = v => v.lang?.toLowerCase().replace('_', '-').startsWith(l)
  const salvata = voci.find(v => v.voiceURI === voce)
  // La voce scelta si usa per i libri nella sua lingua; per le altre lingue si sceglie da sola
  if (salvata && stessaLingua(salvata)) return salvata
  const stessa = voci.filter(stessaLingua)
  return stessa.find(v => /enhanced|premium|neural|natural/i.test(v.name)) || stessa.find(v => v.localService) || stessa[0] || voci[0] || null
}

// Riconosce la lingua del testo contando le parole più comuni.
// Serve perché molti EPUB dichiarano una lingua sbagliata (spesso "en") nei metadati.
const PAROLE = {
  it: ['il', 'lo', 'la', 'che', 'di', 'non', 'per', 'una', 'della', 'del', 'sono', 'è', 'con', 'gli', 'anche', 'come', 'nel', 'alla', 'questo', 'ma'],
  en: ['the', 'and', 'of', 'to', 'is', 'that', 'with', 'was', 'for', 'it', 'you', 'this', 'are', 'have', 'not', 'but', 'from', 'they', 'which', 'be'],
  fr: ['le', 'les', 'des', 'et', 'est', 'une', 'que', 'pour', 'dans', 'pas', 'qui', 'sur', 'au', 'avec', 'ce', 'sont', 'mais', 'nous', 'vous', 'aux'],
  es: ['el', 'los', 'las', 'y', 'que', 'en', 'una', 'por', 'con', 'para', 'es', 'del', 'se', 'no', 'pero', 'como', 'más', 'fue', 'está', 'muy'],
  de: ['der', 'die', 'und', 'das', 'ist', 'nicht', 'ein', 'eine', 'zu', 'mit', 'den', 'von', 'sich', 'auf', 'für', 'auch', 'dem', 'es', 'wir', 'aber'],
}
export function riconosciLingua(testo, riserva = 'it') {
  const parole = (testo || '').toLowerCase().match(/\p{L}+/gu)?.slice(0, 3000) ?? []
  if (parole.length < 30) return riserva
  let migliore = riserva, punti = 0
  for (const [lingua, elenco] of Object.entries(PAROLE)) {
    const set = new Set(elenco)
    const n = parole.reduce((t, w) => t + (set.has(w) ? 1 : 0), 0)
    if (n > punti) { punti = n; migliore = lingua }
  }
  return punti >= 5 ? migliore : riserva
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
    this.preparati = new Map()
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.attivo) tieniSchermoAcceso(true)
    })
  }

  // Da chiamare subito dentro il tocco dell'utente: su iPhone l'audio parte solo così
  sblocca() {
    this.audio ??= new Audio()
    this.audio.setAttribute('playsinline', '')
    if (!this.audioSbloccato) {
      this.audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
      this.audio.play().then(() => { this.audioSbloccato = true }).catch(() => {})
    }
  }

  #sintesi(i) {
    const seg = this.segmenti[i]
    if (!seg || !this.voce?.leggilo) return null
    if (!this.preparati.has(i)) {
      const { velocita } = preferenzeVoce()
      const p = sintetizza(this.voce.leggilo, seg.testo, velocita)
      p.catch(() => {})
      this.preparati.set(i, p)
    }
    return this.preparati.get(i)
  }

  async #parlaLeggilo(seg) {
    const gen = this.generazione
    let blob
    try {
      const attuale = this.#sintesi(this.indice)
      this.#sintesi(this.indice + 1)
      this.#sintesi(this.indice + 2)
      blob = await attuale
    } catch (e) {
      if (gen !== this.generazione) return
      this.ferma()
      this.#emetti('errore', 'La voce di Leggilo non funziona su questo dispositivo: scegli una voce del telefono.')
      return
    }
    if (gen !== this.generazione || !this.attivo) return
    const url = URL.createObjectURL(blob)
    this.audio.src = url
    this.audio.playbackRate = 1
    this.audio.onended = () => {
      URL.revokeObjectURL(url)
      if (gen !== this.generazione || !this.attivo) return
      this.preparati.delete(this.indice)
      this.indice++
      this.#parla()
    }
    this.#emetti('frase', seg)
    try { await this.audio.play() } catch {
      if (gen === this.generazione) { this.pausa(); this.#emetti('errore', 'Tocca Riprendi per avviare l\'audio.') }
    }
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
    this.preparati = new Map()
    this.indice = 0
    if (!this.segmenti.length) return this.#caricaBlocco()
    this.#parla()
  }

  #parla() {
    const gen = this.generazione
    const seg = this.segmenti[this.indice]
    if (!seg) return this.#caricaBlocco()
    if (this.voce?.leggilo) return this.#parlaLeggilo(seg)
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
    if (voceDisponibile) sintesi.cancel()
    this.audio?.pause()
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
    if (voceDisponibile) sintesi.cancel()
    this.audio?.pause()
    this.indice++
    if (this.attivo) this.#parla()
  }

  indietro() {
    if (!this.sorgente) return
    this.generazione++
    if (voceDisponibile) sintesi.cancel()
    this.audio?.pause()
    this.indice = Math.max(0, this.indice - 1)
    if (this.attivo) this.#parla()
  }

  async cambiaVoce() {
    this.voce = await scegliVoce(this.lingua)
    this.preparati = new Map()
    if (this.attivo) { this.generazione++; if (voceDisponibile) sintesi.cancel(); this.audio?.pause(); this.#parla() }
  }

  ferma() {
    this.generazione++
    const eraAttivo = this.attivo || this.inPausa
    this.attivo = false
    this.inPausa = false
    this.segmenti = []
    this.preparati = new Map()
    if (voceDisponibile) sintesi.cancel()
    this.audio?.pause()
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
