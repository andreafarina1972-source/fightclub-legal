# FightClub — Scheda esercizi completa (libreria reale + AI)

Report per Claude Code. Aggiunge una vera scheda di lavoro con esercizi reali
(pesi, pliometria, corsa, core, condizionamento) con serie, ripetizioni, recupero,
carico e tempo di esecuzione. Tutti i file validati con `@babel/preset-react` (5/5 compilano).

---

## 1. FILE

| File | Azione | Destinazione |
|------|--------|--------------|
| `exerciseLibrary.js` | **NUOVO** | `src/services/exerciseLibrary.js` |
| `SessionDetailScreen.js` | **NUOVO** | `src/screens/SessionDetailScreen.js` |
| `aiCoach.js` | MODIFICATO | `src/services/aiCoach.js` |
| `AiCoachScreen.js` | MODIFICATO | `src/screens/AiCoachScreen.js` |
| `RootStackNavigator.js` | MODIFICATO | `src/navigation/RootStackNavigator.js` |

---

## 2. ARCHITETTURA (ibrida: libreria + AI)

- **`exerciseLibrary.js`**: ~60 esercizi reali in 6 categorie (strength, plyometrics, core,
  running, conditioning, boxing). Ogni esercizio ha `id, name, unit (reps|time), tempo, cues, levels`.
  - `buildExerciseMenu(level)`: menu compatto filtrato per livello, inserito nel prompt.
  - `findExercise(name)`: match tollerante nome → dati libreria (per arricchire la UI).
  - `EXERCISE_LIBRARY`, `CATEGORY_LABELS` esportati.
- **`aiCoach.js`**: il prompt include la lista "ESERCIZI DISPONIBILI" (solo esercizi reali del
  livello). Lo schema output aggiunge `exercises: [{ name, sets, reps, durationSec, restSec, load, notes }]`.
  L'AI SCEGLIE dalla libreria e DOSA volume/intensità in base a livello, readiness, fase.
- **`SessionDetailScreen.js`**: scheda completa. Per ogni esercizio mostra dosaggio (serie×reps o
  durata), carico, recupero, tempo di esecuzione e cue tecnici (presi dalla libreria via `findExercise`).
- **`AiCoachScreen.js`**: la `SessionCard` diventa `Pressable`; se la seduta ha esercizi/drill mostra
  "Vedi scheda completa ›" e naviga a `SessionDetail` passando la sessione.
- **`RootStackNavigator.js`**: nuovo screen `SessionDetail`.

---

## 3. CHECKLIST DI VERIFICA

### 3.1 Compilazione
- [ ] I 5 file compilano (Metro/expo start senza errori)

### 3.2 Nuove funzionalità
- [ ] `exerciseLibrary.js` esporta `EXERCISE_LIBRARY, CATEGORY_LABELS, buildExerciseMenu, findExercise`
- [ ] `aiCoach.js` importa `buildExerciseMenu` da `./exerciseLibrary`
- [ ] `aiCoach.js` prompt contiene `ESERCIZI DISPONIBILI` + `exerciseMenu`
- [ ] `aiCoach.js` schema output contiene `"exercises": [`
- [ ] `SessionDetailScreen.js` legge `route.params.session` e usa `findExercise`
- [ ] `AiCoachScreen.js`: `SessionCard` è `Pressable`, naviga a `SessionDetail`
- [ ] `RootStackNavigator.js`: screen `SessionDetail` presente

### 3.3 Anti-regressione (devono restare)
- [ ] `aiCoach.js`: multi-provider (`api.groq.com`, `generativelanguage.googleapis.com`, `api.anthropic.com`)
- [ ] `aiCoach.js`: `STRUTTURA SETTIMANALE COMPLETA` + `formatWorkoutParams(workout, type)`
- [ ] `aiCoach.js`: `profileText`, `readinessText`, `periodText`, `energySystem`, `drills`, `rpeTarget`
- [ ] `AiCoachScreen.js`: `<ProGate title="AI Coach" fullscreen>`, profilo/readiness/periodizzazione
- [ ] `RootStackNavigator.js`: `AthleteProfile`, `TrainingLoad`, `Badges`

### 3.4 Test funzionale
1. Profilo atleta: Livello = Agonista, data match tra 4-6 settimane.
2. Genera piano → check-in.
3. Nel piano, una seduta di forza/pliometria/corsa deve mostrare "Vedi scheda completa ›".
4. Tap sulla seduta → si apre "Scheda seduta" con:
   - [ ] elenco esercizi numerati
   - [ ] dosaggio (es. "4 x 6-8" o "3 x 40s")
   - [ ] carico (es. "75% 1RM"), recupero (es. "rec 90\""), tempo (es. "tempo 3-1-1" o "esplosivo")
   - [ ] cue tecnici sotto ogni esercizio
5. Le sedute boxe mostrano round + drill; le sedute forza/corsa mostrano la scheda esercizi.

---

## 4. NOTE
- Nessuna nuova dipendenza npm.
- `max_tokens` è già 3000 (Groq/Anthropic) e `maxOutputTokens` 3000 (Gemini): sufficiente per le schede.
  Se le schede risultassero troncate su piani molto lunghi, alzare a 4000.
- Se l'AI usa un nome esercizio non in libreria, `findExercise` non trova i cue: la UI mostra comunque
  dosaggio/carico/recupero forniti dall'AI (nessun crash). Per garantire cue sempre presenti, l'AI è
  istruito a scegliere SOLO dalla lista.
- Le sedute non-boxe restano informative (scheda), non eseguibili dal timer a round.
