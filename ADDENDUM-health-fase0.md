# Addendum al brief Health — allineamento al report Fase 0

Questo documento **modifica** `BRIEF-health-integration.md` sulla base della ricognizione.
Dove i due divergono, **vale questo**. Tutto ciò che non è menzionato qui resta invariato:
in particolare restano validi lo scope (nessun workout), i vincoli privacy, le regole
non negoziabili del progetto e i criteri di accettazione.

---

## GATE — non procedere senza conferma esplicita

`minSdkVersion` attuale: **24**. Health Connect richiede **26**.

Alzarlo esclude Android 7.0/7.1 dall'intera app, non solo dalla feature.
**Non installare `expo-build-properties` né modificare `app.json` finché Andrea non
ha verificato la distribuzione API level in Play Console e dato conferma.**

Se la conferma non arriva, implementa **solo il percorso iOS** e lascia
`healthConnect.js` come stub che restituisce `isAvailable() → false`.
L'architettura a provider (vedi sotto) rende questo scenario indolore.

---

## Correzione 1 — Baseline calcolate on-demand

**Il brief diceva**: calcolare le baseline in scrittura e persistere uno snapshot giornaliero.

**Sostituire con**: baseline calcolate on-demand, come funzioni pure.

Motivo: `computeTrainingLoad(sessions, days)` e `computeReadiness({...})` sono già
funzioni pure ricalcolate a ogni chiamata, senza persistenza. Uno snapshot persistito
sarebbe l'unico stato derivato dell'app, con i relativi problemi di invalidazione.

Nuovo modulo `src/services/health/recoveryBaseline.js`:

```js
computeRecoveryBaseline(recoveryRecords, days = 28) → {
  hrv:       { metric, ewma, sd, zToday, trend, sampleCount },
  restingHr: { ewma, deltaToday, sampleCount },
  sleep:     { meanTotalMin, meanEfficiency, sampleCount },
  bodyWeight:{ current, delta7d, delta28d, sampleCount },
  confidence: "none" | "low" | "medium" | "high"
}
```

`confidence` in base al numero di campioni **della metrica specifica** (non del record):
`< 7 → none`, `7–13 → low`, `14–27 → medium`, `>= 28 → high`.
È il campo che permetterà al futuro motore decisionale di astenersi su dati insufficienti.

Usa **EWMA**, non media a finestra fissa: la finestra fissa produce salti artificiali
quando un valore estremo esce dalla finestra.

Costo trascurabile: 90 record piccoli contro i 180 giorni di sessioni che
`computeTrainingLoad` già scorre a ogni chiamata.

---

## Correzione 2 — Storage a chiave singola

**Il brief diceva**: una chiave per mese (`@fc:recovery:2026-08`).

**Sostituire con**: chiave singola versionata, coerente con `fightclub_sessions_v1`.

```
fightclub_recovery_v1 → [ { date, hrv, restingHr, sleep, bodyWeight, sources }, ... ]
```

- Array ordinato per data crescente, **finestra scorrevole a 90 giorni**
- Un solo record per data (chiave logica `date`)
- Includi una `LEGACY_KEYS = []` vuota fin da subito, per coerenza con il pattern
  di `HistoryContext.js` e per rendere banale un'eventuale futura migrazione

Motivo: non esiste alcun precedente per lo schema mensile, mentre la chiave unica
versionata con lista legacy è il pattern consolidato del progetto. 90 record piccoli
non giustificano una struttura più complessa.

---

## Correzione 3 — Il check-in esistente è il punto di innesto

**Il brief trattava il check-in manuale come qualcosa da progettare.** Esiste già:
`fightclub_checkin_v1` in `src/services/aiCoach.js`, campi `fatigue / sleep / soreness`
(scala 1-5 o `none/mild/severe`), che alimentano `computeReadiness` in
`src/services/athleteProfile.js`.

**Non creare un percorso parallelo.** I dati importati diventano input aggiuntivi
della stessa funzione.

### 3a. Estendere il buffer del check-in — PRECONDIZIONE

Il buffer conserva **gli ultimi 14 elementi**. Una baseline HRV ne richiede almeno 28,
preferibilmente 60.

- Porta il cap a **90 elementi**
- Migra lo storico esistente senza perdite (i 14 record attuali restano)
- Verifica che nessun consumatore assuma `length <= 14` (cerca indici hardcodati,
  `slice(-14)`, grafici a 14 punti)

Va fatto **prima** di scrivere `recoveryBaseline.js`, altrimenti la baseline nasce
troncata e nessuno se ne accorge.

### 3b. Estendere `computeReadiness` — additivo, non sostitutivo

Firma attuale: `computeReadiness({ tsb, hrTrend, checkIn, atl })`
Pesi attuali: TSB 22%, trend HR 18%, sonno 22%, fatica 22%, dolori 16%.

**Non riscrivere la funzione.** Aggiungi un parametro opzionale `recovery`:

```js
computeReadiness({ tsb, hrTrend, checkIn, atl, recovery })
```

- `recovery` assente o `confidence: "none"` → comportamento **identico a oggi**,
  bit per bit. Nessuna regressione per chi non collega nulla.
- `recovery` presente con confidence sufficiente → i dati oggettivi entrano
  come contributo aggiuntivo

**Non modificare i pesi esistenti in questo intervento.** Proponi lo schema di
ponderazione aggiornato in un commento o in un documento separato, e attendi conferma.
Cambiare la formula del readiness significa cambiare un numero che l'utente già vede
e su cui ha costruito aspettative: va fatto consapevolmente, non come effetto collaterale.

### 3c. Precedenza fra manuale e importato

Il campo `sleep` esiste in entrambe le fonti: soggettivo nel check-in (1-5),
oggettivo dall'import (minuti, efficienza). **Sono grandezze diverse, non sostituibili.**

- Tienili **separati**, non fondere né convertire
- Il soggettivo continua ad alimentare la componente che alimenta oggi
- L'oggettivo entra come contributo distinto
- Un atleta può dormire 8 ore e sentirsi a pezzi: è informazione, non contraddizione da risolvere

Per HRV, FC a riposo e peso vale la regola generale: **il valore inserito a mano vince**,
l'import non sovrascrive mai un campo compilato dall'utente. Traccia la provenienza
per campo, non per record:

```js
sources: { hrv: "healthkit", restingHr: "manual", bodyWeight: "healthconnect" }
```

---

## Correzione 4 — Peso corporeo: nessuno dei due profili

Il report segnala due moduli che esportano entrambi `saveAthleteProfile`:
`src/services/storage.js` (chiave `fightclub_athlete_profile`) e
`src/services/athleteProfile.js` (chiave `fightclub_athlete_profile_v1`).

**Non toccare né l'uno né l'altro.** Il peso corporeo è una serie temporale e vive nel
record recovery giornaliero, dove è già previsto.

Il peso corrente si ottiene come valore derivato da `computeRecoveryBaseline`
(`bodyWeight.current`), non come campo di profilo. Questo evita di intervenire su due
moduli che hanno già un conflitto di naming latente.

Se in futuro servirà una **categoria di peso obiettivo** (dato statico, non serie),
quella andrà in `athleteProfile.js` accanto a categoria e data gara — ma è fuori scope.

---

## Da chiarire prima della Fase 2

Il report cita una chiave `hrRest` fra quelle sparse negli screen.

**Verifica e riporta**: cosa contiene, chi la scrive, chi la legge.
Se è una FC a riposo inserita manualmente, entra in conflitto diretto con `restingHr`
importato e la regola di precedenza va applicata a quella, non a un campo nuovo.

Non creare un secondo campo per lo stesso dato prima di aver chiarito questo punto.

---

## Ordine di esecuzione

1. Verifica `hrRest` → riporta (lettura, nessuna modifica)
2. **Gate minSdk** → attendi conferma di Andrea
3. Estendi il buffer check-in a 90 elementi + migrazione → `git diff`, presenta
4. `services/health/` — interfaccia provider + implementazioni + `noop`
5. Persistenza `fightclub_recovery_v1` + sync
6. `recoveryBaseline.js` (funzione pura)
7. `computeReadiness` — parametro `recovery` opzionale, additivo
8. UI impostazioni (collegamento, stato, scollegamento con cancellazione dati)

Presenta un `git diff` a ogni passo. Non accorpare i passi 3 e 7: toccano codice
esistente e vanno rivisti separatamente.

## Criterio di accettazione aggiuntivo

- [ ] Con `recovery` assente, `computeReadiness` restituisce **esattamente** i valori
      di prima dell'intervento. Verificalo su almeno 3 casi reali dallo storico.
