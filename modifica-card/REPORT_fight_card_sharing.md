# Report modifiche — Fight Card in stile UFC per la condivisione allenamenti

## Obiettivo
Trasformare la share card degli allenamenti (usata in `HistoryScreen`) in una
card in stile "fight poster" UFC (placca punteggio, tale-of-the-tape,
banda promoter) con la possibilità per l'utente di caricare uno sfondo
personalizzato (foto o GIF), e aggiungere una schermata di anteprima prima
della condivisione effettiva.

Nessuna logica di calcolo (fight score, HR zones, ecc.) è stata toccata:
le modifiche riguardano solo presentazione/UX della condivisione.

---

## File nuovi

| File | Percorso di destinazione nel progetto | Descrizione |
|---|---|---|
| `useShareBackground.js` | `src/hooks/useShareBackground.js` | Hook che gestisce selezione (`expo-image-picker`), persistenza (AsyncStorage) e rimozione dello sfondo custom della card. Espone `{ backgroundUri, loading, pickBackground, removeBackground }`. |
| `ShareCardPreviewModal.js` | `src/components/ShareCardPreviewModal.js` | Modal a comparsa dal basso che mostra la `SessionShareCard` reale (scalata a schermo) prima della condivisione, con pulsanti per cambiare/rimuovere lo sfondo e condividere. |

## File modificati

| File | Percorso nel progetto | Modifica |
|---|---|---|
| `SessionShareCard.js` | `src/components/SessionShareCard.js` | Riscrittura grafica completa in stile fight poster (placca punteggio circolare, tale-of-the-tape, banda promoter, angoli a bandiera). Aggiunto prop `backgroundUri` per lo sfondo custom (Image a piena card + overlay scuro per leggibilità). Mantenuta la stessa interfaccia dati (`session`) e lo stesso `ref` per `captureRef`. |
| `storage.js` | `src/services/storage.js` | Aggiunte `getShareBackground()`, `saveShareBackground(uri)`, `clearShareBackground()` — persistono l'URI dello sfondo in AsyncStorage sotto la chiave `fightclub_share_bg`. |
| `HistoryScreen.js` | `src/screens/HistoryScreen.js` | `ShareButton` ora mostra 3 azioni per sessione: **Anteprima 👁️**, **Condividi 📤**, **Aggiungi/Cambia sfondo 🖼️** (con long-press per rimuoverlo). Aggiunto stato `previewVisible` e integrazione di `ShareCardPreviewModal`. Aggiunti/aggiornati stili in `shareStyles`. |
| `package.json` | root | Aggiunta dipendenza `"expo-image-picker": "~17.0.8"` (compatibile con Expo SDK 54 già in uso). |
| `app.json` | root | Aggiunto plugin `expo-image-picker` con `photosPermission` in italiano, nell'array `expo.plugins`. |

---

## Dipendenza nativa da installare

`expo-image-picker` è un modulo nativo: **richiede un nuovo development
build**, non funziona nel client Expo Go generico già installato.

```bash
# dalla root del progetto, dopo aver sostituito package.json/app.json
npx expo install expo-image-picker

# rigenerare il development build (EAS)
eas build --profile development --platform android
eas build --profile development --platform ios
# oppure in locale, se configurato:
npx expo run:android
npx expo run:ios
```

---

## Note di design / limiti noti

- **GIF come sfondo**: nell'anteprima (sia nel modal sia a schermo) l'immagine
  animata gira normalmente. Il file condiviso/esportato è però sempre un
  **PNG statico** (singolo frame), perché `react-native-view-shot` cattura
  un'istantanea del componente. Questo è un limite intrinseco della cattura
  di viste native, non risolvibile lato JS.
- Lo sfondo scelto è **globale per l'utente** (una sola immagine salvata),
  non per singola sessione: cambiandolo da una sessione, cambia per tutte.
  Se serve uno sfondo per-sessione, va cambiata la chiave di storage da
  singola stringa a mappa `{ [sessionId]: uri }`.
- Il picker richiede il permesso di accesso alle foto: su iOS il testo
  mostrato è quello in `app.json` → `plugins → expo-image-picker →
  photosPermission`; su Android è gestito dal plugin stesso.

---

## Istruzioni di verifica

### 1. Verifica statica (senza build)
```bash
# Controllo sintattico rapido di tutti i file toccati
npx esbuild src/components/SessionShareCard.js --loader:.js=jsx --bundle=false --outfile=/dev/null
npx esbuild src/components/ShareCardPreviewModal.js --loader:.js=jsx --bundle=false --outfile=/dev/null
npx esbuild src/hooks/useShareBackground.js --loader:.js=jsx --bundle=false --outfile=/dev/null
npx esbuild src/services/storage.js --loader:.js=jsx --bundle=false --outfile=/dev/null
npx esbuild src/screens/HistoryScreen.js --loader:.js=jsx --bundle=false --outfile=/dev/null

# Verifica che package.json e app.json siano JSON validi
node -e "JSON.parse(require('fs').readFileSync('package.json'))"
node -e "JSON.parse(require('fs').readFileSync('app.json'))"
```
Tutti i comandi devono terminare senza errori (nessun output = OK per i
controlli `node -e`; esbuild stampa "⚡ Done" se non trova errori di sintassi).

### 2. Verifica delle dipendenze
```bash
npx expo install --check
```
Deve confermare che `expo-image-picker` è alla versione compatibile con
l'SDK del progetto (nessun warning di mismatch).

### 3. Build di sviluppo
- Generare un nuovo development build (vedi comandi sopra) e installarlo su
  device/simulatore: **obbligatorio**, la vecchia build non contiene il
  modulo nativo `expo-image-picker`.

### 4. Test funzionale manuale — schermata Storico allenamenti
1. Aprire una sessione con dati sufficienti (colpi, HR media, fight score
   per boxing; distanza/pace/VO2max per running) → verificare che compaiano
   3 pulsanti: **Anteprima 👁️**, **Condividi 📤**, **Aggiungi sfondo 🖼️**.
2. **Anteprima senza sfondo custom**: toccare "Anteprima" → deve aprirsi il
   modal con la card in stile fight poster su sfondo scuro con bande
   diagonali rosse (fallback), placca punteggio centrale, tale-of-the-tape
   e banda rossa in fondo con "FIGHTCLUB.APP".
3. **Aggiunta sfondo**: dal modal (o dalla schermata) toccare "Aggiungi
   sfondo" → deve comparire il selettore permessi (prima volta) poi la
   galleria di sistema. Scegliere una foto: la card nel modal deve
   aggiornarsi mostrando l'immagine come sfondo con overlay scuro
   leggibile sopra.
4. **Sfondo GIF**: ripetere il punto 3 scegliendo una GIF animata dalla
   galleria → verificare che si animi nell'anteprima del modal.
5. **Persistenza sfondo**: chiudere il modal, uscire e rientrare nella
   schermata Storico (o riavviare l'app) → riaprendo "Anteprima" su
   qualunque sessione lo sfondo scelto deve essere ancora presente
   (persistito via AsyncStorage).
6. **Rimozione sfondo**: tenere premuto il pulsante "Cambia sfondo" nella
   lista sessioni (oppure usare "Rimuovi sfondo" nel modal) → la card deve
   tornare al fallback scuro con bande diagonali.
7. **Condivisione**: dal modal o dalla lista, toccare "Condividi" → deve
   aprirsi il foglio di condivisione di sistema con un PNG generato al
   volo; verificare visivamente che il PNG condiviso rispecchi l'anteprima
   vista nel modal (con l'ultimo frame della GIF se era selezionata una
   GIF).
8. **Sessione running vs boxing**: verificare che per una sessione running
   la placca centrale mostri VO2max (o distanza se VO2max assente) invece
   del Fight Score, e che il tale-of-the-tape mostri Distanza/Pace media
   al posto di Colpi/Calorie.
9. **Permesso negato**: negare il permesso foto quando richiesto →
   verificare comparsa di un alert "Permesso negato" senza crash dell'app.
10. **Fallback senza dev build**: se testato per errore su una build che
    non include `expo-image-picker` (es. vecchia build di produzione),
    toccando "Aggiungi sfondo" deve comparire l'alert "Non disponibile"
    invece di un crash.

### 5. Regressione
- Verificare che la condivisione funzioni ancora correttamente per sessioni
  **senza** sfondo custom impostato (comportamento pre-esistente,
  fallback grafico).
- Verificare che le altre funzionalità di `HistoryScreen` (filtri, grafici,
  selezione multipla, eliminazione sessioni) non siano state impattate,
  dato che le modifiche sono isolate al blocco `ShareButton` e agli stili
  `shareStyles`.
