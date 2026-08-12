# Brief: integrazione dati di recupero da HealthKit / Health Connect

## Contesto

Progetto **FightClub**: app React Native per atleti di boxe e arti marziali.
Stack: Expo ~54, React 19, React Native 0.81, EAS managed workflow, AsyncStorage,
BLE/ANT+ per fasce cardio, i18n su 25 lingue.
Feature Pro protette dal wrapper `ProGate`. AI Coach multi-provider (Groq / Gemini / Anthropic).

L'app ha già: Training Load (CTL/ATL/TSB), TRIMP di Edwards, readiness score,
rilevamento fase di periodizzazione, profilo atleta (categoria di peso, esperienza,
record, guardia, data gara, obiettivo), storico sessioni completo.

## Obiettivo

Importare da Apple Health e Android Health Connect **esclusivamente i dati di recupero**
che l'app non produce già, per alimentare il futuro motore decisionale sul carico.

## SCOPE — leggere con attenzione

### DA IMPORTARE (sola lettura)

| Dato | HealthKit | Health Connect |
|---|---|---|
| HRV | `heartRateVariabilitySDNN` | `HeartRateVariabilityRmssd` |
| FC a riposo | `restingHeartRate` | `RestingHeartRate` |
| Sonno | `sleepAnalysis` | `SleepSession` |
| Peso corporeo | `bodyMass` | `Weight` |

### DA NON IMPORTARE — TASSATIVO

- **Nessun workout / sessione di allenamento.** L'app ha già il proprio sistema di
  registrazione sessioni. Importarli produrrebbe doppio conteggio del carico.
  Non richiedere il permesso workout, non leggere `Workout` / `ExerciseSession`,
  non scrivere codice di deduplica: la funzione semplicemente non esiste.
- Nessuna scrittura verso HealthKit / Health Connect. **Sola lettura.**
- Niente passi, calorie, distanze, VO2max, SpO2, temperatura, dati mestruali,
  glicemia, pressione, cartelle cliniche.

Richiedi **solo** i quattro permessi della tabella sopra. Ogni permesso in più
riduce la percentuale di utenti che accettano.

---

## PRIVACY — VINCOLO ARCHITETTURALE

**I dati salute non lasciano mai il dispositivo.**

- Nessuna trasmissione a server, analytics, crash reporter o provider AI
- Non includere dati salute grezzi nei prompt verso Groq / Gemini / Anthropic
- Se in futuro l'AI Coach dovrà commentare il recupero, riceverà solo la **decisione
  già calcolata on-device** (es. `"readiness": "low"`), mai i valori sottostanti
- Non loggare valori salute con `console.log` nemmeno in sviluppo
- Escludi le chiavi salute da eventuali backup cloud o funzioni di export/condivisione

Sono dati della categoria particolare (art. 9 GDPR) e le policy di Apple e Google
ne vietano l'uso pubblicitario e la cessione a terzi.

---

## REGOLE NON NEGOZIABILI DEL PROGETTO

1. **File-first, patch-second.** Leggi il file reale prima di modificarlo, confronta
   con lo stato atteso, segnala discrepanze. **Mai riscritture integrali.**
2. **Non toccare** la logica multi-provider dell'AI Coach né il wrapper `ProGate`.
3. **Mai generare JS con f-string Python** (i backtick si corrompono).
   Usa concatenazione o heredoc `cat << 'ENDOFFILE'`.
4. **Operazioni binarie su file JS**: solo ASCII nei literal `b'...'`,
   split CRLF-aware (`split(b'\r\n')` / `b'\r\n'.join`).
5. **Validazione Babel obbligatoria** (`@babel/preset-react` in `/tmp`) prima di
   presentare qualsiasi file JS/JSX.
6. **i18n**: nessuna stringa hardcodata. Aggiungi italiano e inglese, lascia le altre
   lingue al fallback esistente.
7. **Nessuna dipendenza npm** senza averla prima proposta e ottenuto conferma.

---

## FASE 0 — Ricognizione (NESSUNA MODIFICA)

Solo lettura. Al termine, report e **stop in attesa di conferma**.

### Da ispezionare

```bash
grep -rn "readiness\|TRIMP\|CTL\|ATL\|TSB\|trainingLoad" . \
  --include=*.js --include=*.jsx --exclude-dir=node_modules

grep -rn "AsyncStorage" . --include=*.js --include=*.jsx --exclude-dir=node_modules | head -40
```

### Da riportare

1. **Dove vive il readiness score**: file, formula attuale, quali input consuma.
2. **Dove vivono CTL/ATL/TSB**: file, come vengono persistiti, con quale cadenza ricalcolati.
3. **Convenzione chiavi AsyncStorage**: prefissi usati, granularità (per giorno? per mese?
   per record?), eventuale wrapper/servizio di storage centralizzato.
4. **Struttura del record sessione**: campi esistenti, dove viene salvato.
5. **Profilo atleta**: dove sta, contiene già il peso corporeo? Con storico o valore singolo?
6. **`package.json`**: versione Expo esatta, `minSdkVersion` se già impostato in
   `expo-build-properties`, presenza di `expo-dev-client`.
7. **`app.json` / `app.config.js`**: elenco plugin attuali, permessi Android già dichiarati.
8. **Dove viene applicato `ProGate`** e come si verifica lo stato Pro.
9. **Segnala ogni discrepanza** rispetto a questa descrizione.

**Fermati qui.**

---

## FASE 1 — Livello di astrazione (dopo conferma)

### Dipendenze da proporre

- `react-native-health-connect` + `expo-health-connect` (config plugin) — Android
- `@kingstinct/react-native-healthkit` — iOS

Nessuna delle due funziona in Expo Go: serve dev client (già presente per BLE/ANT+).
Android richiede `minSdkVersion 26` e un intent filter per la schermata permessi.

**Proponi, non installare.** Attendi conferma.

### Interfaccia unificata

Crea `services/health/healthProvider.js` come unica porta d'accesso. Il resto
dell'app non deve mai sapere da quale piattaforma arriva il dato.

```js
{
  isAvailable(): Promise<boolean>
  getGrantedPermissions(): Promise<string[]>
  requestPermissions(): Promise<boolean>
  readRecoveryData(fromDate, toDate): Promise<DailyRecovery[]>
}
```

Tre implementazioni dietro l'interfaccia: `healthKit.js` (iOS),
`healthConnect.js` (Android), `noop.js` (piattaforma non supportata o permessi negati —
restituisce array vuoto senza lanciare eccezioni).

### Formato normalizzato

```js
{
  date: "2026-08-11",
  hrv: { value: 62.4, metric: "rmssd" | "sdnn" },   // null se assente
  restingHr: 48,                                     // bpm, null se assente
  sleep: {
    totalMin: 452,
    inBedMin: 488,
    efficiency: 0.926,        // totalMin / inBedMin
    awakenings: 3,
    startedAt: "2026-08-10T23:14:00+02:00"
  },
  bodyWeight: 71.2,                                  // kg, null se assente
  source: "healthkit" | "healthconnect"
}
```

### PUNTO CRITICO — HRV: metriche non intercambiabili

Apple espone **SDNN**, Health Connect espone **rMSSD**. Sono grandezze diverse,
non convertibili con un fattore fisso, e su iOS il campionamento è sporadico
(sessioni Respirazione), non notturno strutturato.

**Regole:**
- Salva sempre `metric` accanto al valore
- Mantieni **baseline separate per metrica**
- A valle usa **solo lo z-score** rispetto alla baseline della stessa metrica,
  mai il valore assoluto
- Se `metric` cambia (l'utente passa da iPhone ad Android), **resetta la baseline**
  e riparti dalla fase di apprendimento

### Sonno

Usa `totalMin`, `efficiency` e `awakenings`. **Non usare le fasi**
(REM / profondo / leggero): la loro accuratezza da PPG e accelerometro è modesta
e varia molto tra dispositivi. Se decidi comunque di memorizzarle, non farle
entrare in nessuna decisione sul carico.

Se ci sono più sessioni di sonno nella stessa notte (sonno frammentato, sonnellini),
aggrega quelle che si sovrappongono alla finestra notturna e scarta i sonnellini diurni.

### Attribuzione al giorno

Una notte a cavallo di mezzanotte va attribuita al **giorno del risveglio**.
Chi dorme dalle 23:14 alle 06:46 dell'11 agosto ha il record datato `2026-08-11`.
Applica la stessa convenzione a HRV e FC a riposo (misurati al risveglio).

---

## FASE 2 — Persistenza e merge (stessa sessione, dopo la Fase 1)

### Storage

Segui la convenzione già presente nel progetto (vedi report Fase 0).
Se non esiste una convenzione, usa una chiave per mese, non per giorno:

```
@fc:recovery:2026-08 → { "2026-08-11": {...}, "2026-08-12": {...} }
```

Motivo: leggere 30 giorni con chiavi giornaliere significa 30 chiamate asincrone.

### Precedenza dei dati

Il check-in manuale e i dati importati coesistono. Regola:

- **Il valore inserito a mano dall'utente vince sempre** sul valore importato
- L'import non sovrascrive mai un campo compilato manualmente
- Ogni campo porta la propria provenienza, non solo il record

### Sincronizzazione

- All'apertura dell'app, se sono passate più di 4 ore dall'ultima sync
- Finestra: ultimi 7 giorni (recupera eventuali buchi, non tutto lo storico)
- Al primo collegamento: import retroattivo di 30 giorni per costruire una baseline iniziale
- Fallimento silenzioso: nessun alert bloccante, l'app funziona comunque

### Interfaccia

Nelle impostazioni, una sezione dedicata con:
- Toggle di collegamento, con elenco esplicito di cosa viene letto
- Indicazione esplicita che i dati restano sul dispositivo
- Stato ultima sincronizzazione
- **Pulsante di scollegamento che elimina anche i dati importati** già memorizzati

---

## Il check-in manuale resta il percorso primario

L'integrazione health è un **moltiplicatore per chi possiede il dispositivo**,
non un requisito. Molti utenti si allenano con fascia toracica e nessun orologio da notte.

L'app deve restare pienamente funzionale con il solo inserimento manuale.
Non degradare l'esperienza di chi non collega nulla, non mostrare stati "incompleti"
o inviti insistenti al collegamento.

---

## Criteri di accettazione

- [ ] Nessun permesso workout richiesto; nessuna lettura di sessioni di allenamento
- [ ] Solo i quattro tipi di dato in scope; nessuna scrittura verso le piattaforme
- [ ] Nessun dato salute in rete, log, analytics o prompt AI (verificalo con `git diff`)
- [ ] `hrv.metric` sempre valorizzato; baseline separate per metrica
- [ ] Notte a cavallo di mezzanotte attribuita al giorno del risveglio
- [ ] Il valore manuale non viene mai sovrascritto dall'import
- [ ] Lo scollegamento rimuove i dati importati
- [ ] Permessi negati → `noop`, nessun crash, app pienamente utilizzabile
- [ ] `ProGate` e logica AI multi-provider immutati (`git diff`)
- [ ] Nessuna stringa hardcodata; validazione Babel superata su ogni file modificato

## Cosa NON fare

- Non implementare il motore decisionale sul carico (fase successiva)
- Non modificare il calcolo di readiness, TRIMP, CTL/ATL/TSB esistenti
- Non importare workout, in nessuna forma
- Non riscrivere file interi, non "sistemare" codice fuori scope
- Non rimuovere funzionalità che non capisci — chiedi

---

## Procedura

1. Esegui la **Fase 0**, presenta il report
2. **Fermati.** Attendi conferma
3. Proponi le dipendenze, attendi conferma
4. Procedi con Fase 1 e Fase 2
5. Presenta il `git diff` di ogni file modificato prima di considerare concluso il lavoro
