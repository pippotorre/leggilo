// Colori del testo del libro per i due temi
export function coloriTema(scuro) {
  return scuro
    ? { scuro: true, bg: '#1C2230', testo: '#E6E3DC', link: '#8FAECB', evidenzia: 'rgba(217, 174, 106, 0.45)' }
    : { scuro: false, bg: '#F7F3EC', testo: '#2E2E3A', link: '#4F6D8A', evidenzia: 'rgba(201, 149, 69, 0.35)' }
}
