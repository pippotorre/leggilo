# Leggilo: diario di sviluppo

PWA per leggere e ascoltare gli ebook della libreria Kavita del serverino, su iOS e Android.
Qui non vanno mai scritte password, chiavi API o token.

Ultimo aggiornamento: 22 novembre 2026 (versione 0.3: Condividi → Leggilo).

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

Risposte di Pippo (22/11): distribuzione su store e ad amici; Kavita resta facoltativo (Pippo e famiglia lo collegano); GitHub Pages con dominio `leggilo.entratadisicurezza.com`; sincronizzazione non necessaria.

### Versione 0.2 (22 novembre 2026): libri del telefono + Kavita facoltativo

- **Importazione:** pulsante "+" e schermata di benvenuto; selettore di file (EPUB, PDF, più file insieme). Titolo e autore dal nome del file (`Titolo (Autore) (Z-Library)`, stessa logica di `ordina_libri.py`) oppure dai metadati; copertina dall'EPUB o dalla prima pagina del PDF, ridotta a 360 px. Doppioni (stesso nome e dimensione) saltati.
- **Archivio:** IndexedDB versione 2, archivi `locali` (scheda con copertina) e `filelocali` (file). Si chiede la memoria persistente.
- **Scheda del libro del telefono:** leggi/continua, modifica titolo e autore, elimina.
- **Libreria:** "Continua a leggere" con entrambe le fonti; sezioni "Sul telefono" e "Kavita" quando ci sono tutte e due; raggruppamento per autore; ricerca su entrambe.
- **Kavita facoltativo:** schermata "Collega Kavita" (`#/kavita`) con indirizzo del server, utente e password; nella versione del serverino (build con `VITE_KAVITA_STESSA_ORIGINE=1`, impostato nel Dockerfile) l'indirizzo non si chiede. Menu: collega/scollega, aggiorna.
- **CORS:** Kavita in produzione non manda intestazioni CORS, quindi il Caddy del serverino le aggiunge solo per l'origine pubblica (`ORIGINE_PUBBLICA`, predefinita `https://leggilo.entratadisicurezza.com`) e risponde alle richieste OPTIONS.
- **Informazioni e privacy** (`#/info`): testo pronto anche per gli store.
- **GitHub Pages:** workflow `pages.yml` (build e deploy a ogni push su `main`), `public/CNAME`, `public/.nojekyll`.
- Prove automatiche (Chrome, schermo da telefono): benvenuto, importazione di EPUB e PDF, doppioni, modifica, lettura PDF ed EPUB, voce, progressi locali, informazioni, collegamento a Kavita su un altro indirizzo con CORS, apertura di un libro Kavita, eliminazione; modalità serverino senza campo indirizzo.

Da fare dopo:
- [x] Android: ricevere i file con "Condividi → Leggilo" (versione 0.3)

### "Apri con Leggilo" su Android (22 novembre 2026, solo studio)

Domanda di Pippo: Android propone sempre le solite due app per aprire un EPUB, mai Leggilo.
- Il menu "Apri con" di Android elenca solo le app native che dichiarano di aprire quel tipo di file. Per le PWA esiste `file_handlers` nel manifest, ma Chrome lo supporta solo su computer (Windows, macOS, Linux, ChromeOS), non su Android.
- Con la PWA installata da Chrome si può comparire in **Condividi** (Web Share Target): dal file manager o da Download, Condividi → Leggilo importa il libro.
- Con l'app sul **Play Store (TWA)** si può comparire anche in **Apri con**: si aggiunge nel progetto Android un filtro per i file EPUB e PDF e una piccola parte di codice che passa il file alla PWA attraverso lo stesso meccanismo di Condividi.
- iPhone: né "Apri con" né Condividi verso una PWA; serve l'app nativa.

Decisione di Pippo (22/11): partire subito con Condividi; "Apri con" quando si prepara la TWA.

### Versione 0.3 (22 novembre 2026): Condividi → Leggilo

- `share_target` nel manifest: POST `multipart/form-data` a `./condividi`, campo `libri` (EPUB, PDF, `application/octet-stream` perché alcuni file manager non riconoscono gli EPUB).
- Service worker personalizzato (`src/sw.js`, vite-plugin-pwa in modalità `injectManifest`): stesse regole di prima (app offline, copertine in cache anche da un server su altro indirizzo, dati Kavita prima dalla rete) più la ricezione dei file condivisi, che vengono messi in un piccolo database (`leggilo-condivisi`) e passati all'app con un reindirizzamento a `#/condivisi`.
- L'app li importa: con un solo libro lo apre subito (anche se era già presente), con più libri torna alla libreria.
- Prova automatica: condivisione simulata con un POST verso il service worker (un EPUB, lo stesso di nuovo, due file); app offline dopo il primo avvio.
- Funziona solo con l'app **installata** da Chrome su Android (Installa app), non con il semplice segnalibro.
- [ ] Play Store come TWA (skill googleplay-store)
- [ ] App Store: serve un'app nativa (es. Capacitor) e l'account sviluppatore Apple
- [ ] Verificare se Chrome chiede il permesso "rete locale" quando la versione pubblica chiama il server Tailscale (indirizzo 100.x)

### Versione 0.3.1 (22 novembre 2026): ritorno alla libreria più chiaro

Segnalazione di Pippo: aperto un libro non era chiaro come tornare a tutti i libri.
- Nel lettore e nelle schede il pulsante in alto a sinistra è ora "← Libreria" (con testo) e porta sempre alla libreria, non più alla scheda del libro.
- La prima volta che si nascondono i comandi toccando il centro della pagina compare un suggerimento: "Tocca di nuovo al centro della pagina per i comandi e per tornare alla libreria".
