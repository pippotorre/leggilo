# Leggilo: diario di sviluppo

PWA per leggere e ascoltare gli ebook della libreria Kavita del serverino, su iOS e Android.
Qui non vanno mai scritte password, chiavi API o token.

Ultimo aggiornamento: 21 novembre 2026 (prima versione).

## Scelte

| Voce | Scelta |
|---|---|
| Nome | Leggilo (nome breve: Leggilo) |
| Hosting | Sul serverino, accanto a Kavita, con un suo ingresso Tailscale (`https://leggilo.bee-miaplacidus.ts.net`, nome da confermare). Un proxy serve la PWA e inoltra `/api` a Kavita: stessa origine, niente CORS |
| Backend | Le API di Kavita (`http://kavita:5000` nella rete Docker). Nessun database proprio |
| Accesso | Utente Kavita. Pippo può creare account per altri lettori |
| Dati | Posizione di lettura e preferiti su Kavita (condivisi con l'app Kavita); impostazioni (tema, voce, velocità, dimensione testo) sul dispositivo |
| Lettura vocale | Voci del telefono (Web Speech API). Limite noto: su iOS si ferma a schermo bloccato |
| Codice | Repository GitHub privato `pippotorre/leggilo` (solo codice, nessuna pubblicazione su GitHub Pages) |

## Prima versione

- Libreria con copertine, raggruppata per autore, con ricerca
- Lettore EPUB con dimensione testo e tema regolabili
- Lettore PDF
- Lettura ad alta voce: play/pausa, velocità, scelta della voce, frase evidenziata
- Ripresa dal punto in cui si era rimasti
- Libri scaricati per la lettura offline
- Sempre: installabile, funziona offline, tema chiaro/scuro con interruttore

## Stack

- Vite 8 + JavaScript (moduli ES, senza framework), `vite-plugin-pwa` per manifest e service worker
- EPUB: `foliate-js` (impaginazione, indice, TTS con segni per frase)
- PDF: `pdfjs-dist` (una pagina alla volta, adattata alla larghezza; testo estratto per la voce)
- Voce: Web Speech API, una frase per volta; Wake Lock per tenere lo schermo acceso durante l'ascolto; Media Session per i comandi di sistema
- Dati offline: IndexedDB (file dei libri e schede), localStorage (impostazioni, ultima libreria, posizione precisa, coda dei progressi)
- Server: container `leggilo` con Caddy (serve `dist/` e inoltra `/api/*` a `kavita:5000`), pubblicato da `ingresso-leggilo`

## API di Kavita usate (verificate sul sorgente v0.9.1.4)

| Uso | Endpoint |
|---|---|
| Accesso | `POST /api/Account/login`, `POST /api/Account/refresh-token` (JWT in `Authorization: Bearer`) |
| Libreria | `POST /api/Series/all-v2?PageNumber=1&PageSize=0` (PageSize 0 = tutte) |
| Scheda | `GET /api/Series/{id}`, `GET /api/Series/volumes?seriesId=`, `GET /api/Series/metadata?seriesId=` |
| Copertine | `GET /api/Image/series-cover?seriesId=&apiKey=` con la chiave `image-only` dell'utente |
| File | `GET /api/Download/chapter?chapterId=` (serve il ruolo Download); per i PDF senza quel ruolo `GET /api/Reader/pdf` |
| Progressi | `GET /api/Reader/get-progress?chapterId=`, `POST /api/Reader/progress` |

Note: per gli EPUB `pageNum` è l'indice (da 0) nell'ordine di lettura, come le sezioni di foliate; per i PDF è il numero di pagina da 1. L'autore viene dalla cartella della serie (`folderPath`), coerente con l'organizzazione `/libri/Autore/`.

## Struttura

| Percorso | Contenuto |
|---|---|
| `src/main.js` | Avvio, instradamento (`#/`, `#/libro/ID`, `#/leggi/CAPITOLO?s=SERIE`, `#/accedi`), avviso di aggiornamento |
| `src/api.js` | Client Kavita |
| `src/viste.js` | Accesso, libreria, scheda del libro |
| `src/lettore.js` | Schermata di lettura, progressi, pannelli testo/voce e indice |
| `src/reader/epub.js`, `src/reader/pdf.js` | Lettori |
| `src/voce.js` | Lettura ad alta voce |
| `src/offline.js` | IndexedDB e coda progressi |
| `deploy/` | Caddyfile, compose, ingresso Tailscale, `pubblica.sh` |

## Fatto

- [x] Logo (libro aperto con onde sonore) e palette "Carta e inchiostro"
- [x] API di Kavita verificate sul sorgente della versione installata (0.9.1.4)
- [x] Prima versione completa (vedi elenco sopra)
- [x] Prova automatica nel browser (Chrome, schermo da telefono) contro un Kavita finto: accesso, libreria, ricerca, salvataggio offline, EPUB, indice, impostazioni, voce (finta), PDF, tema scuro, apertura offline
- [x] Caddyfile validato e provato; costruzione pulita (`npm ci && npm run build`) verificata

## Da fare

- [ ] Installazione sul serverino e prova con il Kavita vero
- [x] Prima prova di Pippo sul telefono: voce con accento inglese → corretto (riconoscimento della lingua)
- [ ] Altre prove su iPhone e Android reali (voci, schermo bloccato, installazione)
- [ ] Fissare la versione dell'immagine Caddy e Node invece di `2-alpine` / `22-alpine`

## Decisioni

| Data | Decisione |
|---|---|
| 21/11/2026 | Nome "Leggilo", hosting sul serverino, più utenti con account Kavita, prima versione come proposto |
| 21/11/2026 | Palette "Carta e inchiostro" e logo libro con onde sonore |
| 21/11/2026 | JavaScript invece di TypeScript: meno strumenti da mantenere, nessun passaggio di compilazione dei tipi |
| 21/11/2026 | Il libro aperto viene salvato automaticamente sul dispositivo, così si continua anche offline |
| 21/11/2026 | Pubblicazione dal Mac con `deploy/pubblica.sh` (rsync + build sul server): il server non ha bisogno di credenziali GitHub |

| 21/11/2026 | Voce: la lingua del libro si riconosce dal testo, non dai metadati (molti EPUB dichiarano "en" anche se sono in italiano e veniva scelta una voce inglese). La voce scelta a mano si usa solo per i libri nella sua lingua |

## Problemi noti

- iOS: la voce si ferma con lo schermo bloccato o l'app in secondo piano. Durante l'ascolto Leggilo chiede di tenere lo schermo acceso (Wake Lock), che evita lo spegnimento automatico ma non il blocco manuale.
- PDF scansionati: senza testo, la voce non ha nulla da leggere (viene mostrato un avviso).
- Per scaricare gli EPUB l'utente Kavita deve avere il ruolo Download.

## Grafica

Logo: libro aperto con due onde sonore sopra, su quadrato arrotondato.

Palette "Carta e inchiostro":

| Variabile | Chiaro | Scuro |
|---|---|---|
| `--color-bg` | `#F7F3EC` | `#1C2230` |
| `--color-surface` | `#FFFCF6` | `#273042` |
| `--color-primary` | `#4F6D8A` | `#8FAECB` |
| `--color-accent` | `#C99545` | `#D9AE6A` |
| `--color-text` | `#2E2E3A` | `#E6E3DC` |

## Idea: app autonoma con i libri sul dispositivo (22 novembre 2026, solo studio)

Richiesta di Pippo: un'app che legge i libri presenti sul telefono, senza dipendere dal serverino, da poter distribuire ad altri.

- Già oggi impaginazione e voce girano sul telefono: il server fornisce solo il file (una volta) e salva i progressi. Il carico su Kavita è minimo.
- Il cambiamento vero è la **fonte dei libri**: importarli dal telefono (File, Download, "Apri con…") e tenerli nella memoria dell'app, invece di prenderli da Kavita.
- Strade: PWA pubblica "local-first" (Kavita facoltativo); PWA su Play Store come TWA (come le altre app di Pippo); app nativa (Capacitor) per App Store, "Apri con Leggilo" su iPhone e voce a schermo bloccato.
- Limiti PWA: su iPhone niente "Apri con" né accesso a cartelle, solo importazione con il selettore di file; su Android si può ricevere un file con "Condividi". Senza server non c'è sincronizzazione dei progressi tra dispositivi.

Stato: domande aperte a Pippo (distribuzione, Kavita facoltativo, hosting pubblico, sincronizzazione).
