# Istruzioni Claude Code — Completare le traduzioni mancanti (i18n)

## Obiettivo
Diverse schermate contengono stringhe scritte a mano (hardcoded) che non passano
dal sistema di traduzioni. Vanno sostituite con chiamate a `t(...)` e le relative
chiavi vanno aggiunte ai dizionari di **tutte** le lingue supportate.

## Convenzione del progetto (IMPORTANTE — rispettarla)
Il progetto usa già il pattern:
```js
t("namespace.key") || "Testo di fallback"
```
(esempi reali già presenti in `RunningScreen`: `t("runningScreen.speed") || "Velocità"`).
Usare **sempre** questo pattern: chiave + fallback in italiano. Così anche se una
chiave manca in una lingua, l'UI non resta vuota.

## STEP 0 — Ispezionare il sistema i18n PRIMA di modificare
1. Aprire `src/i18n/index.js` e rilevare:
   - la **struttura** dei dizionari (oggetti per lingua: `it`, `en`, e le altre);
   - l'elenco delle **lingue supportate** (`SUPPORTED_LANGUAGES`);
   - i **namespace** già esistenti (es. `tabs.*`, `runningScreen.*`).
2. Aggiungere le nuove chiavi elencate sotto a **ogni** dizionario di lingua
   presente, seguendo la stessa struttura/nidificazione già in uso.
3. Fornisco i valori canonici in **italiano** e **inglese**. Per le altre lingue
   supportate, tradurre di conseguenza; se una lingua non è nota, inserire almeno
   il valore inglese come fallback (mai lasciare la chiave assente).

> Nota: alcune chiavi `runningScreen.*` esistono già (`speed`, `avgSpeed`). Non
> duplicarle: aggiungere solo quelle mancanti.

---

## STEP 1 — `src/screens/AthleteCardScreen.js` (nuova schermata: traduzioni totalmente assenti)
Importare `t` (`import { t } from "../i18n";`) e sostituire tutte le stringhe
UI con chiavi `athleteCard.*`. Lasciare invariato il marchio "FIGHTCLUB".

Stringhe → chiavi (namespace `athleteCard`):
| Testo attuale | Chiave |
|---|---|
| `TESSERA ATLETA` | `athleteCard.badge` |
| `Membro dal {anno}` | `athleteCard.memberSince` (usare interpolazione o `t(...) + " " + anno`) |
| `🥊 BOXING` / `🏃 RUNNING` | `athleteCard.boxing` / `athleteCard.running` |
| `Best Score` | `athleteCard.bestScore` |
| `Sessioni` | `athleteCard.sessions` |
| `Streak` | `athleteCard.streak` |
| `Tocca per aggiungere\nla tua foto` | `athleteCard.addPhoto` |
| `✎ Modifica nome` | `athleteCard.editName` |
| `✎ Crea la tua tessera` | `athleteCard.createCard` |
| `ENTRA` | `athleteCard.enter` |
| `IL TUO NOME` | `athleteCard.yourName` |
| `Il tuo nome da fighter` | `athleteCard.nameModalTitle` |
| `Es. El Toro` | `athleteCard.namePlaceholder` |
| `Annulla` | `common.cancel` (vedi STEP 8 — chiavi comuni) |
| `Salva` | `common.save` |
| `Rimuovere la foto?` | `athleteCard.removePhotoTitle` |
| `Rimuovi` | `common.remove` |
| `Non disponibile` | `common.unavailable` |
| `expo-image-picker richiede un development build.` | `athleteCard.pickerUnavailable` |
| `Permesso negato` | `common.permissionDenied` |
| `Consenti l'accesso alle foto per impostare la tua immagine.` | `athleteCard.photoPermission` |
| `Errore` | `common.error` |
| `Impossibile selezionare l'immagine.` | `athleteCard.photoError` |

Valori canonici:
```
athleteCard.badge         IT "TESSERA ATLETA"            EN "ATHLETE CARD"
athleteCard.memberSince   IT "Membro dal"               EN "Member since"
athleteCard.boxing        IT "🥊 BOXING"                 EN "🥊 BOXING"
athleteCard.running       IT "🏃 RUNNING"                EN "🏃 RUNNING"
athleteCard.bestScore     IT "Best Score"               EN "Best Score"
athleteCard.sessions      IT "Sessioni"                 EN "Sessions"
athleteCard.streak        IT "Streak"                   EN "Streak"
athleteCard.addPhoto      IT "Tocca per aggiungere\nla tua foto"  EN "Tap to add\nyour photo"
athleteCard.editName      IT "✎ Modifica nome"          EN "✎ Edit name"
athleteCard.createCard    IT "✎ Crea la tua tessera"    EN "✎ Create your card"
athleteCard.enter         IT "ENTRA"                    EN "ENTER"
athleteCard.yourName      IT "IL TUO NOME"              EN "YOUR NAME"
athleteCard.nameModalTitle IT "Il tuo nome da fighter"  EN "Your fighter name"
athleteCard.namePlaceholder IT "Es. El Toro"            EN "e.g. El Toro"
athleteCard.removePhotoTitle IT "Rimuovere la foto?"    EN "Remove photo?"
athleteCard.pickerUnavailable IT "expo-image-picker richiede un development build." EN "expo-image-picker requires a development build."
athleteCard.photoPermission IT "Consenti l'accesso alle foto per impostare la tua immagine." EN "Allow photo access to set your image."
athleteCard.photoError    IT "Impossibile selezionare l'immagine." EN "Could not select the image."
```

---

## STEP 2 — `src/screens/HomeScreen.js` (pulsante piano AI)
Riga ~340 e ~357:
```jsx
// PRIMA
<Text style={styles.aiCoachBtnText}>Vedi piano</Text>
...
<Text style={styles.primaryButtonText}>Genera piano AI</Text>

// DOPO
<Text style={styles.aiCoachBtnText}>{t("home.viewPlan") || "Vedi piano"}</Text>
...
<Text style={styles.primaryButtonText}>{t("home.generateAiPlan") || "Genera piano AI"}</Text>
```
Se anche il badge "AI Coach" (riga ~314) deve essere traducibile, usare
`t("home.aiCoach") || "AI Coach"`.

Valori:
```
home.viewPlan       IT "Vedi piano"        EN "View plan"
home.generateAiPlan IT "Genera piano AI"   EN "Generate AI plan"
home.aiCoach        IT "AI Coach"          EN "AI Coach"
```

---

## STEP 3 — `src/components/FightScoreBadge.js` + `src/services/fightScore.js` (badge fight score)
### 3a. In `FightScoreBadge.js` sostituire le stringhe hardcoded:
| Testo | Chiave |
|---|---|
| `FIGHT SCORE` | `fightScore.title` |
| `LIVE` | `fightScore.live` |
| `REST` | `fightScore.rest` |
| `IDLE` (fallback label) | `fightScore.idle` |
| `HR zone` | `fightScore.compHrZone` |
| `Cadenza` | `fightScore.compCadence` |
| `Costanza` | `fightScore.compConstancy` |
| `{ppm} colpi/min` | `fightScore.ppmUnit` → `` `${ppm} ${t("fightScore.ppmUnit") || "colpi/min"}` `` |

### 3b. In `fightScore.js`, la funzione `scoreLabel` restituisce etichette testuali
(`ELITE`, `FIGHTER`, `ACTIVE`, `WARM UP`, `IDLE`). Per renderle traducibili senza
rompere la logica, NON tradurre dentro `scoreLabel` (che deve restare una chiave
stabile), ma tradurre al momento della visualizzazione. Approccio consigliato:
mantenere `scoreLabel` che ritorna la chiave (es. `ELITE`) e, dove la si mostra,
usare una mappa `t("fightScore.level.elite")` ecc. In alternativa minima, avvolgere
il rendering con un helper:
```js
function tLevel(label) {
  const map = { "ELITE":"elite","FIGHTER":"fighter","ACTIVE":"active","WARM UP":"warmup","IDLE":"idle" };
  const k = map[label];
  return k ? (t(`fightScore.level.${k}`) || label) : label;
}
// uso: {isActive ? tLevel(label ?? "IDLE") : (t("fightScore.rest") || "REST")}
```

Valori:
```
fightScore.title         IT "FIGHT SCORE"   EN "FIGHT SCORE"
fightScore.live          IT "LIVE"          EN "LIVE"
fightScore.rest          IT "RIPOSO"        EN "REST"
fightScore.idle          IT "FERMO"         EN "IDLE"
fightScore.compHrZone    IT "Zona HR"       EN "HR zone"
fightScore.compCadence   IT "Cadenza"       EN "Cadence"
fightScore.compConstancy IT "Costanza"      EN "Consistency"
fightScore.ppmUnit       IT "colpi/min"     EN "punches/min"
fightScore.level.elite   IT "ELITE"         EN "ELITE"
fightScore.level.fighter IT "FIGHTER"       EN "FIGHTER"
fightScore.level.active  IT "ATTIVO"        EN "ACTIVE"
fightScore.level.warmup  IT "RISCALDAMENTO" EN "WARM UP"
fightScore.level.idle    IT "FERMO"         EN "IDLE"
```
> Se preferisci mantenere ELITE/FIGHTER come termini "brand" non tradotti, lascia
> i valori uguali in tutte le lingue: l'importante è che passino da `t()`.

---

## STEP 4 — `src/screens/RunningScreen.js` (badge andatura / FC)
Nei `PolarBadge` (righe ~282–320) sostituire le `label` hardcoded. Attenzione:
`label` è una prop passata al componente, quindi sostituire il valore stringa:
```jsx
// PRIMA → DOPO
label="Andatura"      → label={t("runningScreen.pace") || "Andatura"}
label="Pace media"    → label={t("runningScreen.avgPace") || "Pace media"}
label="Best km"       → label={t("runningScreen.bestKm") || "Best km"}
sub="migliore"        → sub={t("runningScreen.best") || "migliore"}
label="Freq. cardiaca"→ label={t("runningScreen.hr") || "Freq. cardiaca"}
label="HR min"        → label={t("runningScreen.hrMin") || "HR min"}
label="HR max"        → label={t("runningScreen.hrMax") || "HR max"}
```
(le chiavi `runningScreen.speed` e `runningScreen.avgSpeed` esistono già).

Valori:
```
runningScreen.pace     IT "Andatura"        EN "Pace"
runningScreen.avgPace  IT "Pace media"      EN "Avg pace"
runningScreen.bestKm   IT "Best km"         EN "Best km"
runningScreen.best     IT "migliore"        EN "best"
runningScreen.hr       IT "Freq. cardiaca"  EN "Heart rate"
runningScreen.hrMin    IT "HR min"          EN "HR min"
runningScreen.hrMax    IT "HR max"          EN "HR max"
```
> Verificare anche il sottotitolo hardcoded riga ~696
> ("Coach vocale: tempo • distanza • zona HR • pace") e tradurlo con
> `runningScreen.voiceCoachSubtitle` se deve essere localizzato.

---

## STEP 5 — `src/screens/HistoryScreen.js` (tasti anteprima / condividi / sfondo)
Sostituire le stringhe dei pulsanti della riga di condivisione:
```jsx
"Anteprima 👁️"        → t("history.preview") || "Anteprima 👁️"
"Condividi 📤"         → t("history.share") || "Condividi 📤"
"Generando..."        → t("history.sharing") || "Generando..."
"Aggiungi sfondo 🖼️"  → t("history.addBackground") || "Aggiungi sfondo 🖼️"
"Cambia sfondo 🖼️"    → t("history.changeBackground") || "Cambia sfondo 🖼️"
```
(se presenti anche i testi del modal anteprima e dell'hint, tradurli con lo stesso
namespace `history.*`).

Valori:
```
history.preview          IT "Anteprima 👁️"        EN "Preview 👁️"
history.share            IT "Condividi 📤"          EN "Share 📤"
history.sharing          IT "Generando..."         EN "Generating..."
history.addBackground    IT "Aggiungi sfondo 🖼️"   EN "Add background 🖼️"
history.changeBackground IT "Cambia sfondo 🖼️"     EN "Change background 🖼️"
```

---

## STEP 6 — `src/screens/AiCoachScreen.js` (traduzioni totalmente mancanti)
Importare `t` e tradurre **tutte** le stringhe UI visibili. Non passano da `t()`
attualmente. Esempi individuati (namespace `aiCoach.*`), ma applicare a ogni
letterale mostrato all'utente nel file:
| Testo | Chiave |
|---|---|
| `OGGI` | `aiCoach.today` |
| `Target` | `aiCoach.target` |
| (titoli sezione, pulsanti "Genera/Rigenera piano", stati vuoti, note coach, ecc.) | `aiCoach.*` |

Valori (di partenza, da estendere a tutte le stringhe reali del file):
```
aiCoach.today   IT "OGGI"     EN "TODAY"
aiCoach.target  IT "Target"   EN "Target"
```
> Poiché il file contiene molte stringhe, procedere sistematicamente: per ogni
> `<Text>...</Text>` con testo letterale (e ogni `Alert`/placeholder), creare una
> chiave `aiCoach.<nome>` con fallback italiano, e aggiungere IT/EN (+ altre
> lingue) al dizionario. Le stringhe dinamiche (nomi sessione, note generate
> dall'AI) NON vanno tradotte: sono contenuti, non UI.

---

## STEP 7 — `src/screens/SettingsScreen.js` (badge AI coach)
Individuare il badge/etichetta "AI Coach" nella schermata impostazioni e
sostituirlo con `t("settings.aiCoachBadge") || "AI Coach"` (o riusare
`home.aiCoach` se si preferisce un'unica chiave condivisa).
```
settings.aiCoachBadge  IT "AI Coach"  EN "AI Coach"
```
Tradurre anche eventuali etichette hardcoded vicine (titolo sezione, descrizione
provider) con namespace `settings.*` se risultano non localizzate.

---

## STEP 8 — Chiavi comuni riutilizzabili
Diverse stringhe si ripetono (Annulla, Salva, Errore, ecc.). Creare un namespace
`common.*` condiviso ed usarlo ovunque:
```
common.cancel           IT "Annulla"           EN "Cancel"
common.save             IT "Salva"             EN "Save"
common.remove           IT "Rimuovi"           EN "Remove"
common.error            IT "Errore"            EN "Error"
common.unavailable      IT "Non disponibile"   EN "Unavailable"
common.permissionDenied IT "Permesso negato"   EN "Permission denied"
```

---

## Verifica
1. **Controllo statico** dei file toccati:
   ```bash
   npx esbuild src/screens/AthleteCardScreen.js --loader:.js=jsx --bundle=false --outfile=/dev/null
   npx esbuild src/screens/HomeScreen.js --loader:.js=jsx --bundle=false --outfile=/dev/null
   npx esbuild src/components/FightScoreBadge.js --loader:.js=jsx --bundle=false --outfile=/dev/null
   npx esbuild src/services/fightScore.js --loader:.js=jsx --bundle=false --outfile=/dev/null
   npx esbuild src/screens/RunningScreen.js --loader:.js=jsx --bundle=false --outfile=/dev/null
   npx esbuild src/screens/HistoryScreen.js --loader:.js=jsx --bundle=false --outfile=/dev/null
   npx esbuild src/screens/AiCoachScreen.js --loader:.js=jsx --bundle=false --outfile=/dev/null
   npx esbuild src/screens/SettingsScreen.js --loader:.js=jsx --bundle=false --outfile=/dev/null
   npx esbuild src/i18n/index.js --loader:.js=jsx --bundle=false --outfile=/dev/null
   ```
2. **Coerenza chiavi:** verificare che ogni nuova chiave usata con `t()` esista in
   **tutti** i dizionari di lingua di `src/i18n/index.js` (nessuna chiave presente
   in una lingua e assente in un'altra).
3. **Test in app:** avviare l'app e cambiare lingua da Impostazioni; controllare
   schermata per schermata che i testi elencati cambino correttamente e che non
   compaiano né chiavi grezze (es. `athleteCard.enter`) né stringhe italiane
   residue quando la lingua è inglese.
4. **Fallback:** con una chiave volutamente rimossa da una lingua, l'UI deve
   mostrare il fallback italiano (grazie al pattern `t(...) || "..."`), non un
   vuoto.

## Riepilogo file toccati
| File | Cosa fare |
|---|---|
| `src/i18n/index.js` | Aggiungere tutte le nuove chiavi a ogni lingua supportata. |
| `src/screens/AthleteCardScreen.js` | Tradurre tutte le stringhe (`athleteCard.*` + `common.*`). |
| `src/screens/HomeScreen.js` | Pulsante "Genera piano AI", "Vedi piano", badge AI. |
| `src/components/FightScoreBadge.js` | Titolo, LIVE, REST, label livello, componenti barre. |
| `src/services/fightScore.js` | Rendere traducibili le label di livello (via helper). |
| `src/screens/RunningScreen.js` | Badge andatura, pace, best km, FC, HR min/max. |
| `src/screens/HistoryScreen.js` | Anteprima, Condividi, Aggiungi/Cambia sfondo. |
| `src/screens/AiCoachScreen.js` | Tradurre tutte le stringhe UI (`aiCoach.*`). |
| `src/screens/SettingsScreen.js` | Badge/etichette AI coach. |
