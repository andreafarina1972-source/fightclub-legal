# Brief: motore decisionale sul carico di allenamento

## Contesto

Progetto **FightClub**, React Native / Expo ~54, app per atleti di boxe e arti marziali.

L'integrazione salute è completata e verificata su dispositivo reale. Sono disponibili:

| Fonte | Contenuto |
|---|---|
| `trainingLoad.js` | CTL / ATL / TSB da TRIMP di Edwards, funzione pura |
| `recoveryBaseline.js` | HRV (ewma, sd, zToday, trend), FC a riposo (ewma, delta), sonno (durata, efficienza), peso (current, delta7d, delta28d), `confidence` per metrica |
| `athleteProfile.js` | `computeReadiness` esteso con `recovery`, profilo atleta, data gara |
| `aiCoach.js` | check-in soggettivo (fatica, sonno, dolori), buffer 90 giorni deduplicato per data |
| `HistoryContext.js` | storico sessioni |

Tutti calcoli puri, nessuna persistenza di stato derivato.

## Obiettivo

Un motore **deterministico** che, dai dati disponibili, produca una raccomandazione
esplicita sul carico odierno: progredire, mantenere, ridurre, riposare.

**L'AI non prende la decisione.** Il motore decide con regole esplicite; l'AI Coach
riceve solo la decisione già presa e la verbalizza. Motivo: le decisioni devono essere
riproducibili, spiegabili all'atleta e verificabili da te. Una raccomandazione generata
da un LLM non è nessuna delle tre cose.

---

## REGOLE NON NEGOZIABILI DEL PROGETTO

1. **File-first, patch-second.** Leggi il file reale prima di modificarlo, confronta
   con lo stato atteso, segnala discrepanze. **Mai riscritture integrali.**
2. **Non toccare** `ProGate` né la logica multi-provider dell'AI Coach.
3. **Barriera privacy**: nessun dato salute grezzo può raggiungere i provider AI.
   `assertNoRawHealthData` deve continuare a non trovare nulla. Al prompt va solo
   la decisione, mai i valori che la producono.
4. **Mai f-string Python per generare JS.** Concatenazione o heredoc `cat << 'ENDOFFILE'`.
5. **Validazione Babel** obbligatoria prima di presentare qualsiasi file JS/JSX.
6. **i18n**: nessuna stringa hardcodata. Italiano e inglese, fallback per le altre.
7. **Nessuna dipendenza npm** senza proporla e ottenere conferma.

---

## FASE 0 — Ricognizione (NESSUNA MODIFICA)

Solo lettura. Report, poi **stop**.

### Da riportare

1. **Firma esatta e output di `computeTrainingLoad`**: quali campi restituisce,
   se espone già ACWR o solo CTL/ATL/TSB, con quali costanti di tempo.
2. **Firma esatta e output di `computeReadiness`** dopo l'estensione: struttura di
   `state`, `score`, `advice`, `components`.
3. **Struttura di `computeRecoveryBaseline`**: conferma i campi e la semantica di
   `confidence` (per metrica e globale).
4. **Rilevamento fase di periodizzazione**: dove vive, cosa restituisce, come usa
   la data gara del profilo.
5. **Dove viene mostrato oggi il readiness**: conferma che non compare in nessuna
   schermata e che entra solo in `buildPrompt`.
6. **Struttura della home**: quali componenti la compongono, dove si potrebbe
   innestare una card senza stravolgerla.
7. **Segnala ogni discrepanza** rispetto a questa descrizione.

**Fermati qui.**

---

## FASE 1 — Il motore (dopo conferma)

Nuovo file `src/services/loadDecision.js`. **Funzione pura**, coerente con lo stile
del progetto: nessuna persistenza, nessuna I/O, nessuna dipendenza da `new Date()`
(l'ancora temporale è il record più recente).

```js
computeLoadDecision({
  trainingLoad,     // output di computeTrainingLoad
  readiness,        // output di computeReadiness
  baseline,         // output di computeRecoveryBaseline
  recoveryRecords,  // per le regole multi-giorno
  sessions,         // storico, per sparring e carico d'impatto
  phase,            // fase di periodizzazione
  srpe              // OPZIONALE, non ancora disponibile — vedi sotto
}) → {
  level: "progress" | "maintain" | "reduce" | "rest" | "learning",
  headline,         // chiave i18n, non testo
  reasons: [],      // array di { code, severity, detail } — codici, non frasi
  suggestedChange: { volumePct, intensityPct },
  confidence: "low" | "medium" | "high",
  flags: []         // es. "possible_illness", "insufficient_data"
}
```

### Il livello `learning` è obbligatorio

Se `baseline.confidence` è `"none"` o `"low"`, il motore **non prescrive**.
Restituisce `level: "learning"` con l'indicazione di quanti giorni mancano.

Motivo: un consiglio sbagliato dato con sicurezza nelle prime due settimane distrugge
la fiducia dell'atleta, e la fiducia si perde una volta sola. Meglio dichiarare
apertamente che il sistema sta imparando.

### Regole, in ordine di precedenza

Valutare dall'alto verso il basso; **la prima che scatta vince**. Le regole di
sicurezza precedono quelle di progressione.

| # | Condizione | Esito |
|---|---|---|
| 1 | HRV z < −1 per 3+ giorni consecutivi **E** FC a riposo > baseline +5% | `rest`, flag `possible_illness` |
| 2 | HRV z < −1.5 oggi **E** sonno < 6h **E** fatica soggettiva ≥ 4/5 | `rest` |
| 3 | Fase di scarico pre-gara attiva | `reduce`, volume −45%, intensità −7% |
| 4 | ACWR > 1.5 su uno qualsiasi degli assi disponibili | `reduce`, volume −25% |
| 5 | TSB < −30 | `reduce`, volume −20% |
| 6 | Sparring pesante nelle ultime 48h | `maintain`, flag `no_maximal_neural` |
| 7 | HRV trend in calo **E** TSB < −10 | `maintain` |
| 8 | Sonno medio < 6.5h su 3 giorni | `maintain` |
| 9 | TSB > +5 **E** HRV z > −0.5 **E** ACWR in 0.8–1.3 | `progress`, volume +5–8% |
| 10 | Nessuna delle precedenti | `maintain` |

**Ogni soglia va definita come costante nominata in cima al file**, con un commento
che ne spiega l'origine. Sono valori di partenza ragionevoli, non verità: andranno
tarati su dati reali.

### Note sulle singole regole

**Regola 1 — è la più importante.** HRV depresso persistente con FC a riposo elevata
è il pattern classico di infezione in incubazione. La raccomandazione non deve limitarsi
a "allenati meno": deve suggerire di considerare uno stato di malessere e, se persiste,
di sentire un medico. **Non diagnosticare**: segnalare un pattern, non una condizione.

**Regola 4 — ACWR.** Il rapporto carico acuto/cronico è un'euristica diffusa ma
contestata in letteratura: la soglia 1.5 non è una legge fisica. Usalo come segnale,
non come verdetto, e non farlo mai scattare da solo su `rest`.

**Regola 6 — sparring.** Cerca nelle sessioni degli ultimi 2 giorni quelle con
`impact.roundsSparring > 0` o tipo `sparring`. Se il campo non esiste ancora nello
storico, la regola non scatta: gestisci l'assenza senza errori.

**Regola 9 — progressione.** Il +5–8% è sul volume settimanale, non sulla singola
sessione. Non deve mai scattare se `confidence` è sotto `"medium"`.

### Taglio del peso — vincolo di sicurezza

Se `baseline.bodyWeight.delta7d` indica un calo superiore all'**1.5% del peso corporeo
a settimana**, aggiungi il flag `aggressive_weight_cut` e **non emettere mai `progress`**,
indipendentemente dalle altre condizioni.

Un atleta in deficit calorico ha recupero rallentato e HRV depresso per ragioni che non
c'entrano con l'allenamento: il motore leggerebbe male ogni segnale.

Il messaggio associato deve invitare a rivedere la traiettoria con un professionista,
mai fornire indicazioni su come accelerare il calo. Questa è l'area con maggiore
potenziale di danno di tutta l'app: gli utenti includono atleti giovani e il taglio peso
negli sport da combattimento è terreno di pratiche pericolose e disturbi alimentari.
Il sistema deve rifiutare traiettorie aggressive, non ottimizzarle.

### Input opzionale `srpe`

Non ancora disponibile. Progetta la firma perché lo accetti da subito:
se assente, le regole che lo userebbero semplicemente non scattano. Non scrivere
codice che presume la sua presenza, non simulare valori.

---

## FASE 2 — Superficie utente

**Decisione di prodotto da confermare con Andrea prima di implementare.**

Proposta: una card nella home, sopra il resto, con:
- il livello, in linguaggio naturale ("Oggi: mantieni")
- una riga di motivazione, dai `reasons` tradotti via i18n
- la variazione suggerita, se presente
- accesso a un dettaglio con il readiness score e i segnali che lo compongono

Vincoli:
- **Il readiness diventa visibile.** Oggi non lo è, ed è ciò che rende credibile la
  raccomandazione: un consiglio senza il numero che lo genera è un oracolo.
- Stato `learning` → messaggio onesto sui giorni mancanti, nessun consiglio.
- Nessun tono allarmistico. `rest` è un'indicazione, non un divieto.
- Nessuna stringa hardcodata.
- **`ProGate`**: da confermare con Andrea. Il readiness alimenta già funzioni
  visibili a tutti; mettere il motore dietro il paywall è coerente ("l'app ti dice
  quando aumentare il carico" è una promessa vendibile), ma è una scelta di prodotto.

---

## FASE 3 — Integrazione con l'AI Coach

`buildPrompt` riceve **la decisione**, non i dati:

```
✓ "Decisione carico: reduce. Motivi: acwr_elevated, low_tsb."
✗ "HRV 42ms (z −1.8), FC riposo 61, sonno 5h40"
```

I `reasons` passano come **codici**, non come valori. `assertNoRawHealthData` deve
continuare a non trovare nulla: verificalo esplicitamente con un test.

---

## Criteri di accettazione

- [ ] `computeLoadDecision` è una funzione pura, nessuna I/O, nessun `new Date()`
- [ ] `confidence` bassa → `level: "learning"`, nessuna prescrizione
- [ ] Precedenza delle regole rispettata: sicurezza prima di progressione
- [ ] Ogni soglia è una costante nominata e commentata
- [ ] Calo peso > 1.5%/settimana → `progress` mai emesso, flag presente
- [ ] Dati mancanti (sRPE assente, sparring assente, peso assente) → nessun errore,
      regole corrispondenti inattive
- [ ] Nessun `NaN` in nessun campo dell'output, in nessuno scenario
- [ ] Barriera privacy verificata con test dedicato
- [ ] `ProGate` e logica AI multi-provider immutati (`git diff`)
- [ ] Validazione Babel su ogni file modificato

## Test obbligatori

- Ogni regola scatta isolatamente sul suo caso
- Precedenza: due regole compatibili contemporaneamente → vince la più alta
- `confidence: "none"` → `learning`, indipendentemente da tutto il resto
- Atleta in taglio peso aggressivo con tutti i segnali positivi → mai `progress`
- Dati reali dallo storico di Andrea (31 giorni importati): riporta la decisione
  prodotta per ciascuno degli ultimi 14 giorni, così si valuta se le soglie
  producono raccomandazioni sensate o oscillano su rumore

L'ultimo test è il più importante: è l'unico modo per capire se le soglie sono tarate
o inventate.

---

## Procedura

1. Fase 0, report, **stop**
2. Conferma → Fase 1, `git diff`, **stop**
3. Conferma superficie utente con Andrea → Fase 2
4. Fase 3
