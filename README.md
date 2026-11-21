# Leggilo

PWA per leggere e ascoltare gli ebook (EPUB e PDF) della libreria Kavita del serverino, da iPhone, Android e computer.

- Accesso con l'utente Kavita; posizione di lettura salvata su Kavita (la ritrovi anche nell'app Kavita)
- Libreria per autore con ricerca e "Continua a leggere"
- Lettore EPUB (foliate-js) con dimensione del testo, interlinea, margini e tema carta/notte
- Lettore PDF (pdf.js)
- Lettura ad alta voce con le voci del dispositivo, frase evidenziata, velocità e voce regolabili
- Libri salvati sul dispositivo per la lettura offline
- Installabile come app e utilizzabile offline

## Come funziona sul server

```
telefono ──Tailscale──> ingresso-leggilo ──> leggilo (Caddy: app + /api) ──> kavita:5000
```

Il container `leggilo` serve l'app e inoltra `/api` a Kavita, quindi app e API hanno lo stesso indirizzo: `https://leggilo.bee-miaplacidus.ts.net`.

## Prima installazione

**1. Mac: scarica il codice** (una volta sola)
```bash
git clone https://github.com/pippotorre/leggilo ~/Developer/leggilo
```

**2. Mac: copia sul server e avvia**
```bash
cd ~/Developer/leggilo && sh deploy/pubblica.sh
```
La prima volta la costruzione richiede qualche minuto.

**3. Server: aggiungi l'ingresso Tailscale**
```bash
cd ~/sistemista/ingresso
cp compose.yaml compose.yaml.bak-$(date +%F)
mkdir -p serve/leggilo && cp ~/leggilo/deploy/serve-leggilo.json serve/leggilo/serve.json
python3 ~/leggilo/deploy/aggiungi-ingresso.py
docker compose config --quiet && docker compose up -d ingresso-leggilo
sleep 15 && docker logs ingresso-leggilo 2>&1 | grep -i -m1 'login.tailscale'
```
Apri il link e approva; poi nella console Tailscale, macchina `leggilo` → **Disable key expiry**.

**4. Telefono:** apri `https://leggilo.bee-miaplacidus.ts.net`, entra con l'utente Kavita e aggiungi l'app alla schermata Home (Safari: Condividi → Aggiungi a Home; Chrome: menu → Installa app).

## Aggiornamenti

Dal Mac, dopo `git pull`: `sh deploy/pubblica.sh`. L'app mostra "Nuova versione disponibile – Aggiorna".

## Permessi in Kavita

Per scaricare gli EPUB l'utente deve avere il ruolo **Download** (l'amministratore lo ha già). Per i PDF basta l'accesso alla libreria.

## Sviluppo

```bash
npm install
KAVITA_URL=https://ebook.bee-miaplacidus.ts.net npm run dev
```
Il server di sviluppo inoltra `/api` a `KAVITA_URL`. Le icone si rigenerano da `public/logo.svg` con `npm run icone` (serve `rsvg-convert`).

Il diario del progetto è in [SVILUPPO.md](SVILUPPO.md).
