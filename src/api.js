// Client delle API di Kavita (versione 0.9.1.x).
// L'app è servita dallo stesso indirizzo di Kavita: /api viene inoltrato dal proxy.
import { leggi, scrivi } from './impostazioni.js'

const BASE = '/api/'

export class ErroreApi extends Error {
  constructor(messaggio, stato) { super(messaggio); this.stato = stato }
}

let utente = leggi('utente', null)
export const sessione = () => utente
function salvaUtente(u) {
  utente = u
  scrivi('utente', u)
}

function chiaveImmagini(u) {
  return u?.authKeys?.find(k => k.name === 'image-only')?.key || u?.apiKey || ''
}

export async function accedi(username, password) {
  const r = await fetch(BASE + 'Account/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (r.status === 401 || r.status === 400) throw new ErroreApi('Nome utente o password non corretti.', r.status)
  if (!r.ok) throw new ErroreApi('Il server non risponde. Riprova tra poco.', r.status)
  const u = await r.json()
  const ruoli = u.roles || []
  salvaUtente({
    id: u.id, username: u.username, token: u.token, refreshToken: u.refreshToken,
    chiaveImmagini: chiaveImmagini(u), ruoli,
    puoScaricare: ruoli.includes('Admin') || ruoli.includes('Download'),
  })
  return utente
}

export function esci() {
  salvaUtente(null)
}

let rinnovo = null
async function rinnovaToken() {
  if (!utente?.refreshToken) throw new ErroreApi('Sessione scaduta', 401)
  rinnovo ??= (async () => {
    const r = await fetch(BASE + 'Account/refresh-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: utente.token, refreshToken: utente.refreshToken }),
    })
    if (!r.ok) {
      salvaUtente(null)
      dispatchEvent(new Event('leggilo:sessione-scaduta'))
      throw new ErroreApi('Sessione scaduta', 401)
    }
    const t = await r.json()
    salvaUtente({ ...utente, token: t.token, refreshToken: t.refreshToken })
  })().finally(() => { rinnovo = null })
  return rinnovo
}

async function chiama(percorso, { metodo = 'GET', corpo, tipo = 'json', segnale } = {}, ripeti = true) {
  if (!utente) throw new ErroreApi('Accesso richiesto', 401)
  const headers = { Authorization: `Bearer ${utente.token}` }
  if (corpo !== undefined) headers['Content-Type'] = 'application/json'
  let r
  try {
    r = await fetch(BASE + percorso, {
      method: metodo, headers, signal: segnale,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw new ErroreApi('Non raggiungo il server. Sei collegato a Tailscale?', 0)
  }
  if (r.status === 401 && ripeti) {
    await rinnovaToken()
    return chiama(percorso, { metodo, corpo, tipo, segnale }, false)
  }
  if (!r.ok) throw new ErroreApi(`Errore del server (${r.status})`, r.status)
  if (tipo === 'blob') return r.blob()
  if (tipo === 'nessuno') return null
  const testo = await r.text()
  return testo ? JSON.parse(testo) : null
}

export const urlCopertina = seriesId =>
  `${BASE}Image/series-cover?seriesId=${seriesId}&apiKey=${encodeURIComponent(utente?.chiaveImmagini || '')}`

export async function librerie() {
  return chiama('Library/libraries')
}

// Tutte le serie (in una libreria di libri, una serie è di solito un libro)
export async function tutteLeSerie() {
  const filtro = {
    statements: [], combination: 1,
    sortOptions: { sortField: 1, isAscending: true }, limitTo: 0,
  }
  return chiama('Series/all-v2?PageNumber=1&PageSize=0', { metodo: 'POST', corpo: filtro })
}

export const serie = id => chiama(`Series/${id}`)
export const volumi = seriesId => chiama(`Series/volumes?seriesId=${seriesId}`)
export const dettaglioSerie = seriesId => chiama(`Series/metadata?seriesId=${seriesId}`).catch(() => null)
export const progresso = chapterId => chiama(`Reader/get-progress?chapterId=${chapterId}`)

export async function salvaProgresso(p) {
  return chiama('Reader/progress', { metodo: 'POST', corpo: p, tipo: 'nessuno' })
}

export async function scaricaCapitolo(chapterId, formato, segnale) {
  if (formato === 4 && !utente?.puoScaricare) {
    // Per i PDF Kavita offre anche un indirizzo di lettura che non richiede il permesso di download
    return chiama(`Reader/pdf?chapterId=${chapterId}&extractPdf=false`, { tipo: 'blob', segnale })
  }
  return chiama(`Download/chapter?chapterId=${chapterId}`, { tipo: 'blob', segnale })
}

// Autore ricavato dalla cartella: la libreria è organizzata come /libri/Autore/libro.epub
export function autoreDaCartella(s) {
  const p = (s.folderPath || s.lowestFolderPath || '').replace(/\\/g, '/').replace(/\/+$/, '')
  const nome = p.split('/').pop()
  if (!nome || nome === 'libri') return 'Senza autore'
  return nome
}
