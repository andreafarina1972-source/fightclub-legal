# FightClub — Report di verifica AI Coach (preparazione atletica completa)

Documento per Claude Code. Elenca ogni modifica recente e i controlli da eseguire.
Tutti i file sono già stati validati con `@babel/preset-react` (compilano). Questo report
serve a Claude Code per un controllo indipendente prima del build.

---

## 1. CONTESTO

L'AI Coach generava piani "banali" (sola boxe, pochi round). Sono stati fatti due upgrade:

1. **Lettura profilo atleta** → il livello (Agonista/Professionista) determina il volume.
2. **Preparazione atletica completa** → il piano non è più solo boxe: integra corsa, forza,
   condizionamento metabolico, core e mobilità, recupero.

---

## 2. FILE COINVOLTI (ultimo intervento)

| File | Azione | Destinazione | Righe |
|------|--------|--------------|-------|
| `aiCoach.js` | MODIFICATO (`buildPrompt`, `formatWorkoutParams`) | `src/services/aiCoach.js` | 508 |
| `AiCoachScreen.js` | MODIFICATO (call site `formatWorkoutParams`) | `src/screens/AiCoachScreen.js` | 569 |
| `HomeScreen.js` | MODIFICATO (call site `formatWorkoutParams`) | `src/screens/HomeScreen.js` | 548 |

File dei precedenti step (già in progetto, NON ri-modificati ora ma da verificare presenti):
`athleteProfile.js` (services, 291 righe), `AthleteProfileScreen.js` (screens, 271 righe),
`RootStackNavigator.js` (navigation, 103 righe).

---

## 3. COSA È CAMBIATO IN QUESTO INTERVENTO

### 3.1 `aiCoach.js` → `buildPrompt` (variabile `volumeRules`)
Riscritta. Ora impone una STRUTTURA SETTIMANALE COMPLETA con 6 componenti:
- A) Pugilato tecnico/tattico (ombra, sacco, pao, sparring)
- B) Condizionamento metabolico specifico (circuiti, bag intervals)
- C) Corsa / roadwork (fondo aerobico Z2 + ripetute/interval)
- D) Forza e potenza (pesi, pliometria, potenza del colpo)
- E) Core e mobilità (stabilità, collo, prevenzione infortuni)
- F) Recupero attivo

Volume per livello aggiornato: principiante 3-4 sedute, intermedio 4-5, avanzato 5-6 con
possibili doppie sessioni e programma completo (boxe + corsa + forza + core + recupero).

### 3.2 `aiCoach.js` → schema output JSON
Aggiunto campo `"durationMin": 0` a ogni sessione. Regola: le sedute boxe usano `workout`
(round/rest/rounds); corsa/forza/condizionamento/recupero usano `durationMin` e lasciano `rounds` a 0.

### 3.3 `aiCoach.js` → `formatWorkoutParams(workout, type)`
Firma cambiata: ora accetta un secondo parametro `type`.
- boxe con rounds > 0 → `"N round x M' | riposo K'"`
- altri tipi con durationMin → `"X min"`
- nessun dato → stringa vuota (riga nascosta). Risolve il bug `"0 round x ?"`.

### 3.4 Call site aggiornati
- `AiCoachScreen.js`: `formatWorkoutParams(session.workout, session.type)` + rendering condizionale
  che nasconde la riga se la stringa è vuota.
- `HomeScreen.js`: `formatWorkoutParams(aiTodaySession.workout, aiTodaySession.type)`.

---

## 4. CHECKLIST DI VERIFICA (Claude Code)

### 4.1 Compilazione
- [ ] `aiCoach.js`, `AiCoachScreen.js`, `HomeScreen.js` compilano senza errori (Metro/expo start)
- [ ] Nessun import irrisolto

### 4.2 Nuovo contenuto prompt (`aiCoach.js`)
- [ ] `buildPrompt` contiene la stringa `STRUTTURA SETTIMANALE COMPLETA`
- [ ] Contiene le componenti: `CORSA / ROADWORK`, `FORZA E POTENZA`, `CORE E MOBILITA`
- [ ] Schema output contiene `"durationMin": 0`
- [ ] Regola finale: "Il programma DEVE includere corsa, forza/potenza e core/mobilita', non solo boxe"

### 4.3 `formatWorkoutParams`
- [ ] Firma `formatWorkoutParams(workout, type)` (due parametri)
- [ ] Contiene il ramo `isBoxing`
- [ ] Per type diverso da boxing e rounds=0, NON ritorna "0 round x ?"

### 4.4 Call site
- [ ] `AiCoachScreen.js` chiama `formatWorkoutParams(session.workout, session.type)`
- [ ] `AiCoachScreen.js` nasconde la riga workout se la stringa è vuota (rendering condizionale)
- [ ] `HomeScreen.js` chiama `formatWorkoutParams(aiTodaySession.workout, aiTodaySession.type)`

### 4.5 Regressioni da NON introdurre (devono restare presenti)
- [ ] `aiCoach.js`: multi-provider intatto → `AI_PROVIDERS`, `detectProvider`, `api.groq.com`,
      `generativelanguage.googleapis.com`, `api.anthropic.com`
- [ ] `aiCoach.js` esporta ancora TUTTE queste funzioni:
      `AI_PROVIDERS, detectProvider, setApiKey, loadApiKey, clearApiKey, setProvider, loadProvider,
      saveAiPlan, loadAiPlan, clearAiPlan, saveCheckIn, loadCheckIns, generateAiPlan,
      isPlanCurrentWeek, getTodaySession, formatWorkoutParams`
- [ ] Campi `energySystem`, `physiologicalObjective`, `drills`, `rpeTarget` ancora nello schema
- [ ] `AiCoachScreen.js`: wrapper `<ProGate title="AI Coach" fullscreen>` intatto
- [ ] `AiCoachScreen.js`: profilo/readiness/periodizzazione intatti
      (`loadAthleteProfile`, `computeReadiness`, `computePeriodization`, `weeklyInternalLoad`)
- [ ] `RootStackNavigator.js`: screen `TrainingLoad`, `Badges`, `AthleteProfile` presenti

### 4.6 Catena lettura profilo (già verificata, ricontrollare)
- [ ] `AthleteProfileScreen.js` salva `set("level")` + `saveAthleteProfile`
- [ ] `athleteProfile.js` LEVELS = Principiante, Dilettante, Dilettante elite, Agonista, Professionista
- [ ] `AiCoachScreen.js` carica profilo (`loadAthleteProfile().then(setAthleteProfile)`) e lo passa
      in `athleteData.profile`
- [ ] `aiCoach.js buildPrompt`: `profile.level` → regex `/agonist|profession|elite|avanz/` → volumeLevel

Mappatura attesa livello → volume:
```
Principiante      -> principiante  (3-4 sedute)
Dilettante        -> intermedio    (4-5 sedute)
Dilettante elite  -> avanzato      (5-6 sedute, completo)
Agonista          -> avanzato      (5-6 sedute, completo)
Professionista    -> avanzato      (5-6 sedute, completo)
```

---

## 5. TEST FUNZIONALE IN APP

1. Impostazioni AI Coach: inserire API key (Groq `gsk_...` gratuito consigliato).
2. AI Coach → banner in alto → Profilo Atleta → Livello = **Agonista**, data match tra 4-6 settimane → Salva.
3. AI Coach → Genera piano → check-in.
4. Verificare che il piano contenga:
   - [ ] sedute di **boxe** (8-12 round) con drill specifici
   - [ ] almeno **1-2 sedute di corsa** (fondo + ripetute) con durata in minuti
   - [ ] almeno **2 sedute di forza/potenza** con esercizi nei drill
   - [ ] lavoro di **core/mobilità** e **1 recupero**
   - [ ] nessuna seduta mostra `"0 round x ?"` (le non-boxe mostrano "X min" o niente)
5. Check readiness: con fatica 5 / sonno 1 / dolori intensi il piano deve ridurre carico
   (comportamento voluto, non errore).

---

## 6. NOTE TECNICHE
- Nessuna nuova dipendenza npm.
- Le sedute non-boxe (corsa/forza) non sono eseguibili dal timer a round: sono informative
  (drill + durata). Il timer resta per le sedute boxe.
- Edwards TRIMP nel carico interno richiede `session.hrZones.training` (sessioni con fascia HR).
- Chiavi AsyncStorage: profilo `fightclub_athlete_profile_v1`, piano `fightclub_ai_plan_v1`,
  api key `fightclub_api_key_v1`, provider `fightclub_ai_provider_v1`.
