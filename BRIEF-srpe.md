# Brief: raccolta sRPE (carico neuromuscolare)

## Contesto

Progetto **FightClub**, React Native / Expo ~54, app per atleti di boxe e arti marziali.

Stato attuale: il carico di allenamento è calcolato **esclusivamente** dal TRIMP di
Edwards (`trainingLoad.js`), che richiede la frequenza cardiaca. Il motore decisionale
(`loadDecision.js`) consuma CTL/ATL/TSB derivati da lì.

L'app è in test presso atleti già allenati (CTL sopra la soglia `building_base`,
quindi tutte le regole del motore sono attive su di loro).

## Il problema

**Due buchi, entrambi sistematici:**

1. **Sessioni senza fascia cardio non esistono come carico.** Pesi, lavoro tecnico ai
   colpitori, palestra senza fascia: TRIMP non calcolabile, il CTL decade, il motore
   conclude che l'atleta si sta detrainando mentre si sta allenando.

2. **Il TRIMP è cieco al costo neuromuscolare.** Quattro round di sparring e quaranta
   minuti di corsa lenta possono produrre lo stesso TRIMP con un impatto incomparabile
   sul sistema nervoso. Su atleti che fanno sparring vero, l'errore è sistematico.

L'sRPE (Foster) risolve entrambi: `RPE × durata in minuti`, nessun sensore richiesto.

## Obiettivo di questo intervento

**Solo la raccolta e la persistenza.** Nessun consumo da parte del motore decisionale,
nessuna modifica a `trainingLoad.js`, `loadDecision.js` o `computeReadiness`.

Motivo: serve una baseline di ~28 giorni prima che l'asse neuromuscolare sia
utilizzabile. Implementare ora il consumo significherebbe scrivere codice che opera
su dati insufficienti per un mese.

**Il beneficio immediato è la copertura**: da domani ogni sessione produce un dato
di carico, anche senza fascia. La qualità decisionale arriva dopo.

---

## REGOLE NON NEGOZIABILI DEL PROGETTO

1. **File-first, patch-second.** Leggi il file reale prima di modificarlo, confronta
   con lo stato atteso, segnala discrepanze. **Mai riscritture integrali.**
2. **Non toccare** `ProGate` né la logica multi-provider dell'AI Coach.
3. **Barriera privacy**: `assertNoRawHealthData` deve continuare a non trovare nulla.
   L'sRPE non è un dato sanitario importato, ma non deve comunque entrare grezzo nei
   prompt: se un domani servirà, passerà come valore derivato.
4. **Mai f-string Python per generare JS.** Concatenazione o heredoc `cat << 'ENDOFFILE'`.
5. **Validazione Babel** obbligatoria prima di presentare qualsiasi file JS/JSX.
6. **i18n**: nessuna stringa hardcodata. Italiano e inglese, fallback per le altre.
7. **Convenzione data**: usa `localDateKey` da `src/services/dateKey.js`. È la
   convenzione unica della pipeline — un disallineamento UTC/locale ha già prodotto
   due bug in questo progetto.
8. **Nessuna dipendenza npm** senza proporla e ottenere conferma.

---

## FASE 0 — Ricognizione (NESSUNA MODIFICA)

Solo lettura. Report, poi **stop**.

### Da riportare

1. **Struttura del record sessione**: campi effettivi, dove viene normalizzato
   (`normalizeSessionShape` in `HistoryContext.js`), come viene persistito.
2. **Il flusso di fine sessione**: quale schermata chiude una sessione, cosa succede
   dopo il salvataggio, dove viene reindirizzato l'utente. Serve a capire dove
   innestare la richiesta.
3. **Tipi di sessione esistenti**: elenco dei valori di `type` effettivamente in uso
   nello storico e nel codice.
4. **Sessioni senza frequenza cardiaca**: esistono già nello storico? Come vengono
   trattate oggi da `computeTrainingLoad` — TSS zero, escluse, o altro?
5. **Notifiche**: il progetto usa già `expo-notifications` o simili? Con quale
   configurazione? (Serve per capire se la richiesta differita è praticabile senza
   aggiungere dipendenze.)
6. **Segnala ogni discrepanza** rispetto a questa descrizione.

**Fermati qui.**

---

## FASE 1 — Modello dati (dopo conferma)

### Campi da aggiungere al record sessione

Aggiunta **additiva**. I record storici restano validi con `rpe: null`.

```js
{
  // ...campi esistenti, invariati...
  rpe: 7,                    // Borg CR10, intero 0-10. null se non raccolto
  loadSrpe: 525,             // rpe * durationMin. null se rpe è null
  rpeCollectedAt: "2026-08-13T19:40:00+02:00",   // quando l'atleta ha risposto
  rpeDelayMin: 25            // minuti trascorsi dalla fine sessione alla risposta
}
```

`rpeDelayMin` serve a valutare la qualità del dato: un RPE raccolto a 2 minuti dalla
fine è meno affidabile di uno a 30. Non usarlo ora, ma registrarlo — non è
ricostruibile a posteriori.

### Durata

`loadSrpe` richiede la durata in minuti. **Verifica in Fase 0** come è rappresentata
nel record esistente e riusa quel campo, non crearne uno nuovo.

Se la durata non è presente per alcuni tipi di sessione, `loadSrpe` resta `null`
anche con `rpe` valorizzato: meglio un buco che un numero inventato.

### Nessun ricalcolo retroattivo

Non tentare di stimare l'RPE delle sessioni passate da altri campi. Un dato inventato
è peggio di un dato assente, e inquinerebbe la baseline futura.

---

## FASE 2 — Raccolta

### Il momento della richiesta è la decisione più importante

L'RPE va chiesto **20-30 minuti dopo la fine della sessione**. Chiesto subito,
l'atleta riporta l'intensità dell'ultimo esercizio invece di quella della sessione
intera, con una distorsione sistematica verso l'alto.

**Percorso primario: notifica differita.**
- pianificata a +25 minuti dalla fine sessione
- toccandola si apre direttamente la richiesta, senza passare dalla home
- se le notifiche sono negate, degrada al percorso secondario senza errori

**Percorso secondario: richiesta in-app.**
- alla successiva apertura dell'app, se esistono sessioni delle ultime 24h senza `rpe`
- non bloccante, sempre ignorabile
- **massimo una richiesta per sessione**: se l'atleta la ignora, non riproporla.
  Insistere è il modo più rapido per far smettere di rispondere.

Dopo 24 ore dalla fine sessione, la richiesta scade: il ricordo dell'intensità non è
più affidabile e il dato varrebbe poco.

### La scala

Borg CR10, 0-10, con etichette verbali — il numero da solo non è interpretabile in
modo uniforme:

| | |
|---|---|
| 0-1 | Riposo / molto leggero |
| 2-3 | Leggero |
| 4-5 | Moderato |
| 6-7 | Impegnativo |
| 8-9 | Molto impegnativo |
| 10 | Massimale |

La domanda deve riferirsi **alla sessione nel suo insieme**, non al momento più duro.
Formulazione tipo: "Quanto è stata impegnativa la sessione, nel complesso?"

Selezione con un tap singolo. Nessun campo di testo, nessuna conferma aggiuntiva:
ogni tap in più riduce il tasso di risposta.

### Se le notifiche non sono già configurate

**Proponi `expo-notifications` e attendi conferma prima di installare.**
In alternativa, implementa solo il percorso in-app: è meno efficace ma non introduce
dipendenze né richiede un permesso aggiuntivo. Segnala il compromesso.

---

## FASE 3 — Visibilità (minima)

L'atleta deve poter vedere e correggere il dato:

- l'RPE compare nel dettaglio sessione (`SessionDetailScreen`), accanto agli altri
  parametri
- modificabile a posteriori dal dettaglio, con ricalcolo di `loadSrpe`
- se modificato manualmente, `rpeCollectedAt` non cambia (resta il momento della
  prima risposta), ma segna la modifica con un flag `rpeEdited: true`

**Non aggiungere grafici, trend o statistiche sull'sRPE in questo intervento.**
Con pochi giorni di dati non direbbero nulla, e diventerebbero codice da rifare
quando arriverà la baseline vera.

---

## Fuori scope — NON implementare

- Consumo dell'sRPE da parte di `loadDecision.js`
- Baseline o EWMA sul carico neuromuscolare
- Modifiche a `trainingLoad.js`, `computeReadiness`, `computeLoadDecision`
- Il campo `impact` (round di sparring, colpi subiti): è un'altra aggiunta, separata
- Grafici o trend sull'sRPE

---

## Criteri di accettazione

- [ ] Record storici senza `rpe` continuano a funzionare ovunque, nessun errore
- [ ] `loadSrpe` è `null` quando `rpe` o la durata mancano, mai 0 o `NaN`
- [ ] Massimo una richiesta per sessione; ignorarla non la ripropone
- [ ] La richiesta scade dopo 24h
- [ ] Notifiche negate → percorso in-app, nessun errore mostrato
- [ ] `rpeDelayMin` registrato correttamente
- [ ] Date con `localDateKey`, mai `toISOString().slice(0,10)`
- [ ] `computeTrainingLoad` e `computeLoadDecision` producono output **identici** a
      prima su tutti i dati esistenti (verificalo, non assumerlo)
- [ ] `ProGate` e logica AI multi-provider immutati (`git diff`)
- [ ] Nessuna stringa hardcodata; validazione Babel su ogni file modificato

## Test

- Sessione con RPE → `loadSrpe` corretto
- Sessione senza durata → `loadSrpe` null con `rpe` valorizzato
- Record storico senza i nuovi campi → nessun errore in nessuna schermata
- Richiesta ignorata → non riproposta
- Sessione più vecchia di 24h → nessuna richiesta
- Backtest del motore prima/dopo: risultati identici (l'sRPE non deve ancora incidere)

---

## Procedura

1. Fase 0, report, **stop**
2. Conferma → Fase 1, `git diff`, **stop**
3. Conferma → Fase 2 (proponi `expo-notifications` se serve, attendi conferma)
4. Fase 3
