# Brief: Share Card in formato verticale 1080×1920

## Contesto

Progetto **FightClub**: app React Native per atleti di boxe e arti marziali.
Stack: Expo ~54, React 19, React Native 0.81, EAS managed workflow, AsyncStorage.
Feature Pro esistenti protette da un wrapper `ProGate`. i18n su 25 lingue.

La app ha già una **Share Card** condivisibile dallo storico allenamenti. Oggi viene
generata con `captureRef` (`react-native-view-shot`) catturando la view visibile a schermo.

## Problema

L'immagine esportata eredita le proporzioni del layout su schermo. Caricandola su
TikTok, Instagram Reels o Stories il risultato è sbagliato: bande nere, crop automatico
della piattaforma, oppure elementi (logo, punteggio) coperti dall'interfaccia della app social.

## Obiettivo di questo intervento

Generare l'immagine di condivisione su un **canvas a dimensione fissa 1080×1920**,
indipendente dal dispositivo, con la card posizionata dentro la safe zone.

**L'animazione GIF/MP4 NON fa parte di questo intervento.** È una fase successiva.
Non implementarla, non aggiungere dipendenze video.

---

## REGOLE NON NEGOZIABILI

Queste regole derivano da errori già commessi su questo progetto. Rispettale alla lettera.

1. **File-first, patch-second.** Leggi sempre il file reale prima di modificarlo.
   Confronta lo stato effettivo con quello atteso e segnala ogni discrepanza.
   Applica patch mirate. **Mai riscritture integrali di file esistenti.**

2. **Non toccare** la logica multi-provider dell'AI Coach (Groq / Gemini / Anthropic)
   né il wrapper `ProGate`. In passato sono stati sovrascritti per errore.

3. **Mai generare file JavaScript tramite f-string Python** — i backtick vengono corrotti.
   Usa concatenazione di stringhe oppure heredoc `cat << 'ENDOFFILE'`.

4. **Operazioni binarie su file JS**: solo contenuto ASCII nei literal `b'...'`, e split
   CRLF-aware (`split(b'\r\n')` / `b'\r\n'.join`).

5. **Validazione sintattica obbligatoria** prima di presentare qualsiasi file JS/JSX:
   `@babel/parser` con `@babel/preset-react` (installato in `/tmp`). È il controllo autoritativo.

6. **i18n**: ogni stringa nuova visibile all'utente va aggiunta ai file di traduzione,
   mai hardcodata. Se non conosci la traduzione, usa l'italiano e l'inglese e lascia
   le altre lingue con il fallback esistente.

7. **Nessuna nuova dipendenza npm** senza averla prima proposta e ottenuto conferma.

---

## FASE 0 — Ricognizione (NESSUNA MODIFICA AL CODICE)

Esegui solo lettura. Al termine produci un report e **fermati in attesa di conferma**.

### Cosa cercare

```bash
grep -rn "captureRef\|ViewShot\|view-shot\|shareAsync\|Sharing\." . \
  --include=*.js --include=*.jsx --exclude-dir=node_modules
```

### Cosa riportare

1. **File coinvolti** — percorso di ciascuno e suo ruolo:
   - dove avviene la cattura (`captureRef`)
   - dove avviene la condivisione (`shareAsync` / `Share`)
   - il componente che disegna la card
   - dove l'utente sceglie lo sfondo

2. **Struttura della card**: dimensioni attuali (fisse o `%`/`flex`?), aspect ratio,
   se usa `Dimensions.get('window')` o valori hardcoded.

3. **Come arriva lo sfondo**: URI locale, `require()`, asset remoto? Formato accettato?

4. **Dipendenze già presenti** — verifica in `package.json`:
   - `@shopify/react-native-skia` → presente? versione?
   - `react-native-view-shot` → versione
   - `expo-file-system`, `expo-sharing` → versioni

5. **ProGate**: la Share Card è già dietro il paywall? Dove viene applicato il wrapper?

6. **Segnala esplicitamente** qualsiasi cosa che non corrisponde a questa descrizione.

---

## FASE 1 — Composizione a canvas fisso (dopo mia conferma)

### Specifica geometrica

```
Canvas                1080 × 1920 px (9:16)
Safe zone universale   900 × 1400 px centrata
                       → x da 90 a 990, y da 260 a 1660
```

Le fasce fuori dalla safe zone sono coperte dalla UI delle piattaforme:
Instagram Stories occupa i primi e gli ultimi 250 px; TikTok occupa 108 px in alto,
320 px in basso e 120 px sul lato destro (pulsanti like/commenti/condividi).

### Composizione, in ordine di disegno

**1. Sfondo — cover crop su tutto il canvas**

```js
const scale = Math.max(1080 / imgW, 1920 / imgH);
const drawW = imgW * scale;
const drawH = imgH * scale;
const dx = (1080 - drawW) / 2;
const dy = (1920 - drawH) / 2;
```

Nessuna banda nera: l'immagine riempie sempre l'intero frame, l'eccedenza esce dai bordi.

**2. Velo di leggibilità** — rettangolo nero `rgba(0,0,0,0.35)` su tutto il canvas.
Rendilo configurabile con una costante in cima al file, non hardcodato nel mezzo della logica.

**3. Card** — larghezza **880 px**, centrata orizzontalmente (x da 100 a 980).
Altezza proporzionale all'aspect ratio originale della card.
Centrata verticalmente nella safe zone: `cardCenterY = 960`.
Se l'altezza risultante supera 1400 px, riduci in scala finché non rientra.

### Implementazione

**Se `@shopify/react-native-skia` è già nel progetto** — è la strada preferita:

1. `captureRef` sulla card **con lo sfondo nascosto**, `format: 'png'`, `result: 'base64'`,
   forzando `width: 880` nelle opzioni → PNG con trasparenza
2. `Skia.Surface.MakeOffscreen(1080, 1920)`
3. `canvas.drawImageRect()` per sfondo (con la matematica sopra), velo, poi card
4. `makeImageSnapshot()` → `encodeToBase64()` → `expo-file-system` → `shareAsync`

**Se Skia NON è presente**: proponimi l'aggiunta prima di procedere. In alternativa,
implementa la composizione con una View React Native fuori schermo ad aspect ratio
fisso `9/16` catturata con `captureRef({ width: 1080, height: 1920 })`, e **segnala
nel report che questa strada è meno deterministica** perché il risultato dipende dal
`pixelRatio` del dispositivo.

### Preset di formato

Esponi il canvas come parametro, non come costante sparsa nel codice:

| Preset | Canvas | Uso |
|---|---|---|
| `story` | 1080 × 1920 | default — Stories, Reels, TikTok, Shorts |
| `feed` | 1080 × 1350 | feed Instagram (Meta privilegia il 4:5 sull'1:1) |
| `square` | 1080 × 1080 | WhatsApp, foto profilo |

La safe zone si applica al preset `story`. Per `feed` e `square` basta un margine
interno del 7% su ogni lato.

Nella UI: un selettore a tre voci, con `story` preselezionato.

---

## FASE 2 — NON ESEGUIRE ORA

Export MP4 animato tramite encoder hardware (AVAssetWriter / MediaCodec).
Si innesterà sulla stessa composizione della Fase 1. Non anticipare nulla,
non aggiungere dipendenze video, non predisporre "hook per il futuro".

---

## Criteri di accettazione (Fase 1)

- [ ] Il file esportato è esattamente 1080×1920 px su qualsiasi dispositivo
- [ ] Lo sfondo riempie l'intero frame, senza bande nere e senza deformazione
- [ ] Nessun testo o logo della card cade fuori dalla banda y 260–1660
- [ ] I tre preset producono le dimensioni dichiarate
- [ ] Le funzioni preesistenti della Share Card continuano a funzionare
- [ ] Nessuna stringa hardcodata: tutto passa da i18n
- [ ] Ogni file JS/JSX modificato passa la validazione Babel
- [ ] `ProGate` e la logica AI multi-provider risultano immutati (verificalo con `git diff`)

## Cosa NON fare

- Non riscrivere file interi
- Non "sistemare" codice fuori dallo scope di questo intervento
- Non rimuovere funzionalità che non capisci — chiedi
- Non implementare GIF o MP4
- Non modificare la preview su schermo se non è strettamente necessario:
  la composizione di export deve essere **separata** dalla view visibile

---

## Procedura

1. Esegui la **Fase 0** e presenta il report
2. **Fermati.** Attendi conferma
3. Solo dopo la conferma, procedi con la Fase 1
4. Presenta un `git diff` di ogni file modificato prima di considerare il lavoro concluso
