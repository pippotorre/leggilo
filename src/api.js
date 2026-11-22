// Client delle API di Kavita (versione 0.9.1.x). Kavita è facoltativo.
// Sul serverino l'app è servita dallo stesso indirizzo (/api inoltrato dal proxy);
// nella versione pubblica l'indirizzo del server si inserisce al collegamento.
import { leggi, scrivi } from './impostazioni.js'

export const stessaOrigine = import.meta.env.VITE_KAVITA_STESSA_ORIGINE === '1'
let server = leggi('server', stessaOrigine ? location.origin : '')
const base = () => server.replace(/\/+$/, '') + '/api/'
export const indirizzoServer = () => server

export function normalizzaIndirizzo(url) {
  let u = (url || '').trim()
  if (!u) return ''
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u
  try { return new URL(u).origin } catch { return '' }
}

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

export async function accedi(indirizzo, username, password) {
  const nuovo = stessaOrigine && !indirizzo ? location.origin : normalizzaIndirizzo(indirizzo)
  if (!nuovo) throw new ErroreApi('Indirizzo del server non valido.', 0)
  let r
  try {
    r = await fetch(nuovo + '/api/Account/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    })
  } catch {
    throw new ErroreApi('Non raggiungo il server. Controlla l\'indirizzo e, se serve, che Tailscale sia attivo.', 0)
  }
  if (r.status === 401 || r.status === 400) throw new ErroreApi('Nome utente o password non corretti.', r.status)
  if (!r.ok) throw new ErroreApi('Il server non risponde. Riprova tra poco.', r.status)
  const u = await r.json()
  server = nuovo
  scrivi('server', server)
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
  scrivi('elenco', undefined)
}

export const collegato = () => !!(utente && server)

let rinnovo = null
async function rinnovaToken() {
  if (!utente?.refreshToken) throw new ErroreApi('Sessione scaduta', 401)
  rinnovo ??= (async () => {
    const r = await fetch(base() + 'Account/refresh-token', {
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
  if (!utente || !server) throw new ErroreApi('Kavita non collegato', 401)
  const headers = { Authorization: `Bearer ${utente.token}` }
  if (corpo !== undefined) headers['Content-Type'] = 'application/json'
  let r
  try {
    r = await fetch(base() + percorso, {
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
  `${base()}Image/series-cover?seriesId=${seriesId}&apiKey=${encodeURIComponent(utente?.chiaveImmagini || '')}`

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
