// Gestione delle voci di Leggilo: elenco, download con avanzamento, eliminazione, prova
import { h, avviso, apriPannello } from './util.js'
import { icone } from './icone.js'
import { VOCI_LEGGILO, PREFISSO, voceScaricata, scaricaVoce, eliminaVoce, sintetizza } from './voci-leggilo.js'
import { preferenzeVoce, salvaPreferenzeVoce } from './voce.js'

export async function gruppoVociLeggilo(scelta) {
  const scaricate = []
  for (const v of VOCI_LEGGILO) if (await voceScaricata(v)) scaricate.push(v)
  if (!scaricate.length) return null
  return h('optgroup', { label: 'Voci di Leggilo' },
    scaricate.map(v => h('option', { value: PREFISSO + v.id, selected: PREFISSO + v.id === scelta }, `${v.nome} (${v.genere})`)))
}

let prova = null
async function ascoltaProva(v, btn) {
  prova?.pause()
  btn.disabled = true
  const testo = `Ciao, sono ${v.nome}. Posso leggerti i tuoi libri, anche senza connessione.`
  try {
    const blob = await sintetizza(v, testo, preferenzeVoce().velocita)
    prova = new Audio(URL.createObjectURL(blob))
    await prova.play()
  } catch (e) {
    avviso('Non riesco a usare questa voce su questo dispositivo.', null, 5000)
  } finally { btn.disabled = false }
}

export function pannelloVoci(onCambio) {
  const lista = h('div', { class: 'lista-voci' })
  const disegna = async () => {
    const pref = preferenzeVoce()
    lista.replaceChildren()
    for (const v of VOCI_LEGGILO) {
      const ok = await voceScaricata(v)
      const attiva = pref.voce === PREFISSO + v.id
      const barra = h('div', { class: 'barra-avanzamento', hidden: true }, h('i', { style: { width: '0%' } }))
      const azioni = h('div', { class: 'azioni-voce' })
      if (ok) {
        const ascolta = h('button', { class: 'btn', 'aria-label': `Ascolta ${v.nome}` }, h('span', { html: icone.play }), 'Prova')
        ascolta.onclick = () => ascoltaProva(v, ascolta)
        azioni.append(
          attiva ? h('span', { class: 'etichetta' }, 'In uso')
            : h('button', { class: 'btn btn-primario', onclick: () => { salvaPreferenzeVoce({ voce: PREFISSO + v.id }); avviso(`Voce: ${v.nome}`); disegna(); onCambio?.() } }, 'Usa'),
          ascolta,
          h('button', { class: 'btn-icona', 'aria-label': `Elimina ${v.nome}`, html: icone.cestino, onclick: async () => {
            await eliminaVoce(v)
            if (attiva) salvaPreferenzeVoce({ voce: '' })
            avviso(`${v.nome} eliminata`); disegna(); onCambio?.()
          } }))
      } else {
        const scarica = h('button', { class: 'btn' }, h('span', { html: icone.scarica }), `Scarica ${v.mb} MB`)
        scarica.onclick = async () => {
          scarica.disabled = true; barra.hidden = false
          try {
            await scaricaVoce(v, f => { barra.firstChild.style.width = Math.round(f * 100) + '%'; scarica.lastChild.textContent = `${Math.round(f * 100)}%` })
            salvaPreferenzeVoce({ voce: PREFISSO + v.id })
            avviso(`${v.nome} è pronta e funziona anche offline`)
            onCambio?.()
          } catch {
            avviso('Download non riuscito. Controlla la connessione e riprova.', null, 5000)
          }
          disegna()
        }
        azioni.append(scarica)
      }
      lista.append(h('div', { class: 'voce' + (attiva ? ' attiva' : '') },
        h('div', {}, h('div', { class: 'nome-voce' }, v.nome), h('div', { class: 'piccolo' }, `Italiano, ${v.genere} · ${v.qualita}`)),
        azioni, barra))
    }
  }
  disegna()
  apriPannello(
    h('h3', {}, 'Voci di Leggilo'),
    h('p', { class: 'piccolo', style: { margin: '0 0 8px' } }, 'Voci naturali in italiano che funzionano sul telefono, anche offline. Si scaricano una volta sola.'),
    lista,
    h('p', { class: 'piccolo', style: { marginTop: '14px' } }, 'Su telefoni meno recenti queste voci possono partire con qualche secondo di ritardo e consumare più batteria.'))
}
