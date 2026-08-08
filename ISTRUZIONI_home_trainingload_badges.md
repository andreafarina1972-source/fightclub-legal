# Istruzioni Claude Code — Rendere raggiungibili Training Load e Badge dalla Home

## Obiettivo
`TrainingLoadScreen` e `BadgesScreen` sono complete e funzionanti ma **non
registrate in alcun navigator**, quindi oggi sono irraggiungibili. Vanno:
1. registrate nello stack di navigazione;
2. collegate a due punti d'ingresso nella **Home** (griglia "Azioni rapide").

Il gating Pro è **già applicato** dentro le due schermate (wrapper `ProGate`
fullscreen aggiunto in precedenza): un utente Free che le apre vedrà il lucchetto
con la CTA al Paywall. Quindi **non serve gating aggiuntivo** sui pulsanti Home:
i punti d'ingresso restano visibili a tutti e il blocco avviene dentro la
schermata. Nessun'altra modifica al gating.

---

## Contesto di navigazione (già verificato)
Struttura annidata: `App.js` → `AppStack` → `RootStackNavigator` ("Root") →
`RootNavigator` (tab bar, dove vive `HomeScreen`).

Le schermate di dettaglio (WorkoutBuilder, CustomTimer, Bluetooth, RunningReplay,
ecc.) sono registrate in **`RootStackNavigator`**, ed è lì che vanno registrate
anche Training Load e Badge. Dalla Home (che è in una tab) si raggiungono con il
pattern già usato nel progetto per "CustomTimer"/"TimerRun":
```js
const nav = navigation.getParent?.() || navigation;
nav.navigate("TrainingLoad");
```

---

## STEP 1 — Registrare le due schermate in `src/navigation/RootStackNavigator.js`

**1a.** Aggiungere gli import insieme agli altri import di schermate:
```js
import TrainingLoadScreen from "../screens/TrainingLoadScreen";
import BadgesScreen from "../screens/BadgesScreen";
```

**1b.** Aggiungere due `Stack.Screen` dentro lo `Stack.Navigator` (es. subito dopo
il blocco `RunningReplay`, prima della chiusura `</Stack.Navigator>`):
```jsx
<Stack.Screen
  name="TrainingLoad"
  component={TrainingLoadScreen}
  options={{ title: "Training Load" }}
/>

<Stack.Screen
  name="Badges"
  component={BadgesScreen}
  options={{ title: "Badge" }}
/>
```
> Il native stack mostra un header con titolo e freccia "indietro", coerente con
> le altre schermate di dettaglio. Le due schermate hanno già un proprio titolo
> in-content: se la doppia intestazione risulta ridondante, si può togliere il
> titolo interno oppure impostare `options={{ headerShown: false }}` (in tal caso
> su Android resta il tasto hardware per tornare indietro).

---

## STEP 2 — Aggiungere i punti d'ingresso in `src/screens/HomeScreen.js`

**2a.** Nella griglia "Azioni rapide" (`<View style={styles.quickRow}>`, intorno
alla riga 398), aggiungere due `QuickAction` **dopo** quello "Custom Timer":
```jsx
// ... dopo l'ultimo QuickAction esistente (customTimer), aggiungere:
<QuickAction
  icon="pulse-outline"
  label={t("home.trainingLoad") || "Carico"}
  onPress={() => { const nav = navigation.getParent?.() || navigation; nav.navigate("TrainingLoad"); }}
/>
<QuickAction
  icon="trophy-outline"
  label={t("home.badges") || "Badge"}
  onPress={() => { const nav = navigation.getParent?.() || navigation; nav.navigate("Badges"); }}
/>
```

**2b.** La griglia passa da 4 a 6 voci: farla andare a capo su due righe da 3.
Modificare i due stili in fondo al file:
```js
// PRIMA
quickRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
quickAction: { alignItems: "center", flex: 1 },

// DOPO
quickRow: { flexDirection: "row", flexWrap: "wrap", rowGap: 14, marginTop: 6 },
quickAction: { alignItems: "center", width: "33.333%" },
```
> Risultato: due righe pulite da 3 icone (Timer libero · Crea workout · Storico /
> Timer personalizzato · Carico · Badge). Le etichette sono corte e rientrano.

---

## STEP 3 — Chiavi i18n dei pulsanti Home
Aggiungere in `src/i18n/index.js`, in **tutte** le lingue supportate, le due
chiavi delle etichette Home:
```
home.trainingLoad   IT "Carico"   EN "Load"
home.badges         IT "Badge"    EN "Badges"
```

---

## STEP 4 — Tradurre le stringhe interne di `TrainingLoadScreen` e `BadgesScreen`
Entrambe le schermate hanno il testo scritto a mano in italiano: va portato tutto
sotto `t(...)` con il pattern del progetto `t("chiave") || "fallback italiano"`,
e le chiavi vanno aggiunte a **tutte** le lingue del dizionario.

### 4.0 — Prima di modificare
1. Aprire `src/i18n/index.js` e rilevare la **struttura** dei dizionari e
   l'elenco completo delle **lingue supportate** (`SUPPORTED_LANGUAGES`).
2. Aggiungere le chiavi sotto elencate a **ogni** lingua presente, rispettando la
   nidificazione già in uso (namespace `trainingLoad.*` e `badges.*`).
3. Fornisco i valori in **italiano** (IT) e **inglese** (EN). Per le altre lingue
   supportate tradurre di conseguenza; se una lingua non è nota, inserire almeno
   il valore **inglese** (mai lasciare la chiave assente in una lingua).
4. In `TrainingLoadScreen.js` è già importato `t`. In `BadgesScreen.js` **non**
   lo è: aggiungere `import { t } from "../i18n";`.

> Nota su valori dinamici: numeri, date, sigle come "CTL/ATL/TSB", "TSS", "bpm",
> "km", "VO2max" NON vanno tradotti. Le sigle possono restare, ma le loro
> **etichette descrittive** (es. "Fitness", "Fatica", "Forma") sì.

---

### 4a — `src/screens/TrainingLoadScreen.js`
Sostituire ogni stringa letterale con `t(...) || "fallback"`. Mappa completa
(namespace `trainingLoad`):

| Testo attuale | Chiave | IT | EN |
|---|---|---|---|
| `Training Load` (titolo) | `trainingLoad.title` | "Training Load" | "Training Load" |
| `Fitness · Fatica · Forma` | `trainingLoad.subtitle` | "Fitness · Fatica · Forma" | "Fitness · Fatigue · Form" |
| `4 sett.` | `trainingLoad.win4w` | "4 sett." | "4 wks" |
| `3 mesi` | `trainingLoad.win3m` | "3 mesi" | "3 mos" |
| `6 mesi` | `trainingLoad.win6m` | "6 mesi" | "6 mos" |
| `CTL — Fitness` | `trainingLoad.ctlLabel` | "CTL — Fitness" | "CTL — Fitness" |
| `Media 42 giorni` | `trainingLoad.ctlSub` | "Media 42 giorni" | "42-day average" |
| `ATL — Fatica` | `trainingLoad.atlLabel` | "ATL — Fatica" | "ATL — Fatigue" |
| `Media 7 giorni` | `trainingLoad.atlSub` | "Media 7 giorni" | "7-day average" |
| `TSB — Forma` | `trainingLoad.tsbLabel` | "TSB — Forma" | "TSB — Form" |
| `TSS settimana` | `trainingLoad.weeklyTss` | "TSS settimana" | "Weekly TSS" |
| `Carico 7 giorni` | `trainingLoad.weeklyTssSub` | "Carico 7 giorni" | "7-day load" |
| `Ultimo TSS` | `trainingLoad.lastTss` | "Ultimo TSS" | "Last TSS" |
| `Sessione recente` | `trainingLoad.lastTssSub` | "Sessione recente" | "Recent session" |
| `Servono almeno 2 sessioni in date diverse per visualizzare il grafico.` | `trainingLoad.chartEmpty` | (invariato IT) | "At least 2 sessions on different dates are needed to show the chart." |
| `Come leggere i valori` | `trainingLoad.guideTitle` | "Come leggere i valori" | "How to read the values" |
| `CTL (Fitness)` | `trainingLoad.guideCtlLabel` | "CTL (Fitness)" | "CTL (Fitness)" |
| desc CTL | `trainingLoad.guideCtlDesc` | "Sale lentamente con settimane di allenamento costante. Obiettivo: crescita progressiva." | "Rises slowly with weeks of consistent training. Goal: steady growth." |
| `ATL (Fatica)` | `trainingLoad.guideAtlLabel` | "ATL (Fatica)" | "ATL (Fatigue)" |
| desc ATL | `trainingLoad.guideAtlDesc` | "Reagisce rapidamente al carico. Alta dopo sessioni intense, scende in 1-2 giorni di riposo." | "Reacts quickly to load. High after hard sessions, drops within 1-2 rest days." |
| `TSB (Forma)` | `trainingLoad.guideTsbLabel` | "TSB (Forma)" | "TSB (Form)" |
| desc TSB | `trainingLoad.guideTsbDesc` | "Positivo = sei fresco. Negativo = sei affaticato. Ideale per gara: TSB tra +5 e +15." | "Positive = fresh. Negative = fatigued. Race-ready: TSB between +5 and +15." |
| nota TSS | `trainingLoad.guideNote` | "Il TSS di ogni sessione combina: durata, intensità HR, volume colpi e Fight Score. Una sessione di 45 min in zona 4 con 200 colpi vale circa 65-75 TSS." | "Each session's TSS combines duration, HR intensity, punch volume and Fight Score. A 45-min zone-4 session with 200 punches is worth about 65-75 TSS." |

**Etichette dei consigli sullo stato di forma** (funzione `StatusBanner`, oggetto
`advice`) — namespace `trainingLoad.advice.*`:
| Chiave stato | Chiave i18n | IT | EN |
|---|---|---|---|
| `peak` | `trainingLoad.advice.peak` | "Sei in forma ottimale. Ideale per gara o sparring intenso." | "You're peaking. Ideal for a race or hard sparring." |
| `fresh` | `trainingLoad.advice.fresh` | "Sei fresco. Puoi aumentare il carico questa settimana." | "You're fresh. You can increase load this week." |
| `load` | `trainingLoad.advice.load` | "Carico normale. Mantieni il ritmo e monitora il recupero." | "Normal load. Keep the pace and watch recovery." |
| `fatigue` | `trainingLoad.advice.fatigue` | "Affaticamento medio. Inserisci una sessione di recupero attivo." | "Moderate fatigue. Add an active recovery session." |
| `overreach` | `trainingLoad.advice.overreach` | "Sovrallenamento. Riduci il carico per almeno 3-4 giorni." | "Overreaching. Reduce load for at least 3-4 days." |
| `unknown` | `trainingLoad.advice.unknown` | "Dati insufficienti. Aggiungi sessioni per calcolare la forma." | "Not enough data. Add sessions to compute form." |

> In `StatusBanner`, sostituire l'oggetto `advice` con lookup su `t()`, es.:
> ```js
> const advice = {
>   peak:    t("trainingLoad.advice.peak")    || "Sei in forma ottimale...",
>   fresh:   t("trainingLoad.advice.fresh")   || "Sei fresco...",
>   load:    t("trainingLoad.advice.load")    || "Carico normale...",
>   fatigue: t("trainingLoad.advice.fatigue") || "Affaticamento medio...",
>   overreach: t("trainingLoad.advice.overreach") || "Sovrallenamento...",
>   unknown: t("trainingLoad.advice.unknown") || "Dati insufficienti...",
> };
> ```

**Legenda grafico** (funzione `ChartLegend`) — namespace `trainingLoad.legend.*`:
| Testo | Chiave | IT | EN |
|---|---|---|---|
| `CTL — Fitness (42gg)` | `trainingLoad.legend.ctl` | "CTL — Fitness (42gg)" | "CTL — Fitness (42d)" |
| `ATL — Fatica (7gg)` | `trainingLoad.legend.atl` | "ATL — Fatica (7gg)" | "ATL — Fatigue (7d)" |
| `TSB — Forma (CTL - ATL)` | `trainingLoad.legend.tsb` | "TSB — Forma (CTL - ATL)" | "TSB — Form (CTL - ATL)" |

> Anche le etichette `label` di `tsbStatus()` (in `src/services/trainingLoad.js`)
> compaiono a video (`StatusBanner` e KPI). Se sono stringhe hardcoded, rendere
> traducibili con lo stesso approccio dello STEP fight score (chiave stabile +
> `t()` al momento della visualizzazione), namespace `trainingLoad.status.*`.
> Verificare il contenuto di `tsbStatus` e aggiungere le chiavi corrispondenti.

---

### 4b — `src/screens/BadgesScreen.js`
Aggiungere `import { t } from "../i18n";` e sostituire le stringhe. Mappa
(namespace `badges`):

| Testo attuale | Chiave | IT | EN |
|---|---|---|---|
| `Badge e Progressi` (titolo) | `badges.title` | "Badge e Progressi" | "Badges & Progress" |
| `{n} / {tot} badge sbloccati` | `badges.unlockedCount` | "badge sbloccati" | "badges unlocked" |
| `Nessuno streak attivo` | `badges.noStreak` | "Nessuno streak attivo" | "No active streak" |
| `Allena oggi per iniziare!` | `badges.noStreakSub` | "Allena oggi per iniziare!" | "Train today to start!" |
| `giorni consecutivi` | `badges.streakDays` | "giorni consecutivi" | "day streak" |
| `Record personale: {n} giorni` | `badges.streakRecord` | "Record personale:" + n + "giorni" | "Personal best:" + n + "days" |
| `Colpi totali` | `badges.statPunches` | "Colpi totali" | "Total punches" |
| `Sessioni` | `badges.statSessions` | "Sessioni" | "Sessions" |
| `km corsa` | `badges.statKm` | "km corsa" | "run km" |
| `VO2max` | `badges.statVo2` | "VO2max" | "VO2max" |
| `Nessun badge in questa categoria.` | `badges.emptyCategory` | (invariato IT) | "No badges in this category." |

**Categorie** (array `CATEGORIES`) — namespace `badges.cat.*`:
| Testo | Chiave | IT | EN |
|---|---|---|---|
| `Tutti` | `badges.cat.all` | "Tutti" | "All" |
| `Colpi` | `badges.cat.punches` | "Colpi" | "Punches" |
| `Streak` | `badges.cat.streak` | "Streak" | "Streak" |
| `VO2max` | `badges.cat.vo2` | "VO2max" | "VO2max" |
| `Sessioni` | `badges.cat.sessions` | "Sessioni" | "Sessions" |
| `Running` | `badges.cat.running` | "Running" | "Running" |
| `Fight Score` | `badges.cat.score` | "Fight Score" | "Fight Score" |

> Nel `CATEGORIES` mantenere `key` invariato (serve al filtro) e tradurre solo il
> `label`, es. `{ key: "punches", label: t("badges.cat.punches") || "Colpi" }`.

> **Definizioni badge** (`icon/label/desc` da `BADGE_DEFINITIONS` in
> `src/services/badgeEngine.js`): sono il contenuto vero dei badge (nomi e
> descrizioni). Verificare se sono hardcoded in italiano; in tal caso, per
> tradurli, aggiungere per ogni badge chiavi `badges.def.<id>.label` e
> `badges.def.<id>.desc` e leggerle in `BadgeCard`. È l'intervento più corposo:
> se si preferisce, si può rimandare e tradurre in questa fase solo la UICodice
> di contorno (titoli, categorie, KPI, streak), lasciando i nomi dei badge come
> seconda iterazione. Segnalare la scelta fatta.

---

## Verifica

### 1. Controllo statico
```bash
npx esbuild src/navigation/RootStackNavigator.js --loader:.js=jsx --bundle=false --outfile=/dev/null
npx esbuild src/screens/HomeScreen.js --loader:.js=jsx --bundle=false --outfile=/dev/null
npx esbuild src/screens/TrainingLoadScreen.js --loader:.js=jsx --bundle=false --outfile=/dev/null
npx esbuild src/screens/BadgesScreen.js --loader:.js=jsx --bundle=false --outfile=/dev/null
npx esbuild src/i18n/index.js --loader:.js=jsx --bundle=false --outfile=/dev/null
```

**Coerenza chiavi:** verificare che ogni nuova chiave `trainingLoad.*`, `badges.*`
e `home.trainingLoad`/`home.badges` esista in **tutte** le lingue del dizionario
(nessuna presente in una lingua e assente in un'altra).

### 2. Test funzionale
1. Aprire la Home → nella sezione "Azioni rapide" compaiono due nuove icone:
   **Carico** (pulse) e **Badge** (trophy), su una seconda riga.
2. **Utente Pro:** toccare "Carico" → si apre `TrainingLoadScreen` con grafico
   CTL/ATL/TSB, KPI e guida. Toccare "Badge" → si apre `BadgesScreen` con streak,
   barra di completamento e lista badge. Il tasto "indietro" riporta alla Home.
3. **Utente Free:** toccando "Carico" o "Badge" si apre la schermata ma mostra il
   `ProGate` con lucchetto e CTA "Prova 14 giorni gratis" → tap → Paywall.
   (Comportamento già implementato: verificare solo che funzioni end-to-end.)
4. Cambiando lingua da Impostazioni, le etichette "Carico"/"Badge" si traducono.

### 3. Traduzioni interne
- Aprire Training Load e Badge in **inglese**: verificare che titoli, KPI, guida,
  consigli sullo stato di forma, legenda, categorie, banner streak e stati vuoti
  siano tutti tradotti e che non compaiano né chiavi grezze (es.
  `trainingLoad.title`) né italiano residuo.
- Con la lingua italiana, tutto resta in italiano (fallback compresi).

### 4. Regressione
- La griglia "Azioni rapide" resta allineata e leggibile con 6 voci su due righe.
- Le 4 azioni preesistenti funzionano come prima.
- I calcoli (CTL/ATL/TSB, filtri categoria badge) non cambiano: sono stati toccati
  solo i testi visibili, non la logica.

---

## Riepilogo file
| File | Azione |
|---|---|
| `src/navigation/RootStackNavigator.js` | Registrate le rotte `TrainingLoad` e `Badges`. |
| `src/screens/HomeScreen.js` | +2 `QuickAction` (Carico, Badge) e griglia a due righe. |
| `src/screens/TrainingLoadScreen.js` | Tutte le stringhe UI sotto `t()` (`trainingLoad.*`). |
| `src/screens/BadgesScreen.js` | +import `t`; tutte le stringhe UI sotto `t()` (`badges.*`). |
| `src/services/trainingLoad.js` | (se necessario) label `tsbStatus` traducibili. |
| `src/services/badgeEngine.js` | (opzionale, 2ª iterazione) nomi/desc badge traducibili. |
| `src/i18n/index.js` | +tutte le chiavi `home.*`, `trainingLoad.*`, `badges.*` in ogni lingua. |

## Nota
Il gating Pro delle due schermate è già presente (ProGate fullscreen): questo
intervento le rende solo **raggiungibili**. Dopo, entrambe le feature Pro promesse
(analisi del carico e badge/gamification) saranno finalmente accessibili
all'utente, con il blocco corretto per i Free.
