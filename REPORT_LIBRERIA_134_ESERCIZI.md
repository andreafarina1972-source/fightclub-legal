# FightClub — Libreria 134 esercizi + Core Stability + max_tokens 4000

Report per Claude Code. Validato con `@babel/preset-react`: 3/3 file compilano, 12/12 controlli superati.

---

## 1. FILE

| File | Azione | Destinazione |
|------|--------|--------------|
| `exerciseLibrary.js` | MODIFICATO (53 → 134 esercizi, +categoria coreStability) | `src/services/exerciseLibrary.js` |
| `aiCoach.js` | MODIFICATO (max_tokens 4000, prompt core stability) | `src/services/aiCoach.js` |
| `SessionDetailScreen.js` | MODIFICATO (rendering tempo "slow") | `src/screens/SessionDetailScreen.js` |

Non modificati: `AiCoachScreen.js`, `RootStackNavigator.js`, `athleteProfile.js`, `AthleteProfileScreen.js`.

---

## 2. MODIFICHE

### 2.1 `aiCoach.js` — max_tokens 3000 → 4000
Tre punti aggiornati:
- Groq: `max_tokens: 4000`
- Gemini: `generationConfig: { maxOutputTokens: 4000, ... }`
- Anthropic: `max_tokens: 4000`

Motivo: le schede esercizi complete (5-6 sedute × 4-8 esercizi con sets/reps/load/rest/notes)
possono superare i 3000 token e venire troncate → JSON invalido.
Nessun residuo `3000` (le occorrenze `86400000` sono millisecondi/giorno, non toccate).

### 2.2 `exerciseLibrary.js` — 53 → 134 esercizi

| Categoria | Prima | Ora |
|-----------|-------|-----|
| `strength` (Forza / Pesi) | 12 | **28** |
| `plyometrics` (Pliometria / Potenza) | 9 | **18** |
| `coreStability` (**NUOVA**) | – | **18** |
| `core` (Core forza / resistenza) | 10 | **18** |
| `running` (Corsa) | 8 | **16** |
| `conditioning` (Condizionamento) | 6 | **16** |
| `boxing` (Pugilato) | 8 | **20** |
| **TOTALE** | **53** | **134** |

**Nuova categoria `coreStability`** — lavoro anti-movimento, distinto dal core forza/resistenza:
Pallof press (+ isometrico, mezzo inginocchiato), dead bug (+ con elastico), bird dog, plank,
RKC plank, plank laterale (+ reach), Copenhagen plank, suitcase carry, waiter walk, bear crawl,
stir the pot, landmine rotation, anti-rotation hold, chop in ginocchio.

Aggiunte rilevanti nelle altre categorie: lavoro di collo (neck harness) e polsi, Nordic curl,
landmine press, farmer's walk, kettlebell swing/snatch, sled push/drag, double under,
allunghi, intervalli 30/30, ripetute in salita, drill difensivi/contrattacco, clinch, reaction ball.

**Nuove API esportate:**
- `exerciseCount()` → numero totale esercizi (debug/statistiche).
- `findExercise()` migliorata: match esatto prioritario, poi parziale col nome **più lungo**
  (evita che "Plank" catturi "Plank laterale"). Verificato con test.

Schema invariato per ogni esercizio: `{ id, name, unit: "reps"|"time", tempo, cues, levels }`.
Nuovo valore `tempo: "slow"` per esercizi a esecuzione controllata (dead bug, ab wheel, Nordic curl).

### 2.3 `aiCoach.js` — prompt aggiornato per core stability
- Componente **E) CORE STABILITY** (anti-rotazione, anti-estensione, anti-flessione laterale, bracing)
  separata da **F) CORE FORZA/RESISTENZA e COLLO**. Il recupero diventa **G) RECUPERO**.
- Regole di volume: core stability esplicita per ogni livello; per avanzati "core stability in OGNI
  seduta di forza (2-3 esercizi anti-movimento)".
- Regola di dosaggio: core stability → `sets + durationSec` (isometrie 20-45s) o `sets + reps` lente.
- Regola finale: "Includi SEMPRE esercizi di CORE STABILITY nelle sedute di forza/potenza".

### 2.4 `SessionDetailScreen.js` — rendering tempo
`tempo: "slow"` ora mostra **"controllato"** invece di "tempo slow".
`"explosive"` → "esplosivo". Notazione numerica (es. "3-1-1") → "tempo 3-1-1".

---

## 3. IMPATTO SUL PROMPT (misurato)

| Livello | Esercizi disponibili | Menu nel prompt |
|---------|---------------------|-----------------|
| Principiante | 63 | ~308 token |
| Dilettante | 121 | ~595 token |
| Agonista / Professionista | 132 | ~644 token |

Il menu è filtrato per livello, quindi un principiante non riceve esercizi avanzati.
~644 token di input aggiuntivo sono sostenibili su tutti i provider.

---

## 4. CHECKLIST DI VERIFICA

### 4.1 Compilazione
- [ ] `exerciseLibrary.js`, `aiCoach.js`, `SessionDetailScreen.js` compilano (Metro/expo start)

### 4.2 max_tokens
- [ ] `aiCoach.js` contiene esattamente 2 × `max_tokens: 4000` (Groq, Anthropic)
- [ ] `aiCoach.js` contiene 1 × `maxOutputTokens: 4000` (Gemini)
- [ ] Nessun `max_tokens: 3000` o `maxOutputTokens: 3000` residuo

### 4.3 Libreria
- [ ] `EXERCISE_LIBRARY` ha 7 categorie incluse `coreStability`
- [ ] `CATEGORY_LABELS.coreStability === "Core Stability"`
- [ ] `exerciseCount()` ritorna 134
- [ ] Nessun `id` duplicato (verificato: nessuno)
- [ ] Tutti gli esercizi hanno `id, name, unit, cues, levels` (verificato: nessun campo mancante)
- [ ] Export: `EXERCISE_LIBRARY, CATEGORY_LABELS, buildExerciseMenu, findExercise, exerciseCount`

### 4.4 Prompt
- [ ] `aiCoach.js` contiene `CORE STABILITY: anti-rotazione`
- [ ] `aiCoach.js` contiene `Includi SEMPRE esercizi di CORE STABILITY`
- [ ] Componenti struttura settimanale: A→G (G = recupero)

### 4.5 Anti-regressione (devono restare)
- [ ] Multi-provider: `api.groq.com`, `generativelanguage.googleapis.com`, `api.anthropic.com`
- [ ] `STRUTTURA SETTIMANALE COMPLETA`, `formatWorkoutParams(workout, type)`
- [ ] `profileText`, `readinessText`, `periodText`, `energySystem`, `drills`, `rpeTarget`
- [ ] Schema output contiene `"exercises": [`
- [ ] `AiCoachScreen.js`: `<ProGate>`, SessionCard `Pressable` → `SessionDetail`
- [ ] `RootStackNavigator.js`: `SessionDetail`, `AthleteProfile`, `TrainingLoad`, `Badges`

### 4.6 Test funzionale
1. Profilo: Livello = Agonista, data match tra 4-6 settimane.
2. Genera piano → check-in.
3. Verifica che il piano contenga:
   - [ ] almeno una seduta di forza con **2-3 esercizi di core stability** (Pallof, dead bug, carry…)
   - [ ] esercizi vari, non ripetuti dalla settimana precedente
   - [ ] nessun troncamento del JSON (piano completo, tutte le sedute presenti)
4. Tap su una seduta di forza → Scheda seduta:
   - [ ] esercizi con dosaggio, carico, recupero
   - [ ] core stability isometrico mostra "3 x 30 min/sec" e "controllato" dove previsto
   - [ ] cue tecnici presenti sotto ogni esercizio

---

## 5. NOTE
- Nessuna nuova dipendenza npm.
- Se l'AI nomina un esercizio non in libreria, `findExercise` ritorna `null`: la UI mostra comunque
  dosaggio/carico/recupero dall'AI, senza cue e senza crash.
- Il menu esercizi nel prompt è generato da `buildExerciseMenu(volumeLevel)` e filtrato per livello.
- Con 4000 token di output il piano completo con schede non dovrebbe più troncarsi. Se accadesse su
  piani a 6 sedute molto dense, valutare 5000 (Groq supporta fino a 8000 su llama-3.3-70b).
