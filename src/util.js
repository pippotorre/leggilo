// Piccole utilità per costruire l'interfaccia
import { icone } from './icone.js'
export function h(tag, attrs = {}, ...figli) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue
    if (k === 'class') el.className = v
    else if (k === 'html') el.innerHTML = v
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v)
    else el.setAttribute(k, v === true ? '' : v)
  }
  for (const f of figli.flat()) if (f != null && f !== false) el.append(f instanceof Node ? f : document.createTextNode(String(f)))
  return el
}

export function avviso(testo, azione, durata = 4000) {
  const box = document.getElementById('avvisi')
  // Al massimo due avvisi visibili: si toglie il più vecchio che non è "fisso"
  const vecchi = [...box.children].filter(e => !e.dataset.fisso)
  if (box.children.length >= 2 && vecchi.length) vecchi[0].remove()
  const el = h('div', { class: 'avviso', role: 'status' }, h('span', {}, testo))
  if (azione) el.append(h('button', { onclick: () => { el.remove(); azione.fn() } }, azione.testo))
  if (!durata) el.dataset.fisso = '1'
  box.append(el)
  if (durata) setTimeout(() => el.remove(), durata)
  return el
}

export function debounce(fn, ms) {
  let t
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms) }
}

export function rotella(testo = 'Carico…') {
  return h('div', { class: 'carica' }, h('div', { class: 'rotella' }), h('span', {}, testo))
}

// Testo senza HTML (i riassunti di Kavita possono contenere tag)
export function testoSemplice(html) {
  const d = new DOMParser().parseFromString(html || '', 'text/html')
  return d.body.textContent || ''
}

export function apriPannello(...contenuto) {
  const velo = h('div', { class: 'velo' })
  const chiudi = () => { velo.remove(); pannello.remove(); document.removeEventListener('keydown', esc) }
  const esc = e => { if (e.key === 'Escape') chiudi() }
  const pannello = h('div', { class: 'pannello', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'maniglia' }),
    h('button', { class: 'btn-icona chiudi-pannello', 'aria-label': 'Chiudi', html: icone.chiudi, onclick: () => chiudi() }),
    ...contenuto)
  velo.onclick = chiudi
  document.addEventListener('keydown', esc)
  document.body.append(velo, pannello)
  return chiudi
}
