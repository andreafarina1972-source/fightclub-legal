# FightClub — Upgrade AI Coach Professionale (A + B + C + D + E)

Documento di verifica per Claude Code. Elenca ogni file modificato/creato, cosa cambia,
e i controlli da eseguire. Tutti i file sono già stati validati con `@babel/preset-react` (5/5 compilano).

---

## 1. FILE COINVOLTI

| File | Azione | Destinazione |
|------|--------|--------------|
| `athleteProfile.js` | **NUOVO** | `src/services/athleteProfile.js` |
| `AthleteProfileScreen.js` | **NUOVO** | `src/screens/AthleteProfileScreen.js` |
| `aiCoach.js` | MODIFICATO (solo `buildPrompt`) | `src/services/aiCoach.js` |
| `AiCoachScreen.js` | MODIFICATO (9 patch) | `src/screens/AiCoachScreen.js` |
| `RootStackNavigator.js` | MODIFICATO (+1 screen) | `src/navigation/RootStackNavigator.js` |

**IMPORTANTE — cosa NON è stato toccato (da verificare che sia ancora presente):**
- `aiCoach.js`: logica multi-provider Groq/Gemini/Anthropic (`AI_PROVIDERS`, `detectProvider`,
  chiamate a `api.groq.com`, `generativelanguage.googleapis.com`, `api.anthropic.com`) — INTATTA.
- `AiCoachScreen.js`: wrapper `<ProGate title="AI Coach" fullscreen>`, import `t` da i18n,
  `SafeAreaView` da `react-native-safe-area-context` — INTATTI.
- `RootStackNavigator.js`: screen `TrainingLoad` e `Badges` — INTATTI.

---

## 2. COSA IMPLEMENTA OGNI BLOCCO

### A — Profilo atleta esteso
- **`athleteProfile.js`**: `saveAthleteProfile`, `loadAthleteProfile`, `profileCompleteness`,
  costanti `WEIGHT_CATEGORIES`, `GUARD_TYPES`, `LEVELS`.
- Storage: AsyncStorage key `fightclub_athlete_profile_v1`.
- Campi: `weightCategory, yearsExperience, fights, guard, level, nextMatchDate, goal`.
- **`AthleteProfileScreen.js`**: form con chip selezionabili + campi numerici + data match + obiettivo.

### B — Readiness score
- **`athleteProfile.js` → `computeReadiness({ tsb, hrTrend, checkIn, atl })`**.
- Ritorna `{ score:0-100, state, color, advice, components }`.
- Stati: `Recovery, Fresh, Ready, High Performance, Accumulated Fatigue, Overreaching, Risk of Overtraining`.
- Calcolato in `AiCoachScreen.handleCheckInDone` e passato a `generateAiPlan`.

### C — Periodizzazione
- **`athleteProfile.js` → `computePeriodization(nextMatchDate)`**.
- Ritorna `{ phase, weeksToMatch, focus, intensity, volume }`.
- Fasi: Preparazione generale → specifica/intensificazione → pre-competizione/picco → taper → competizione → transizione.
- Calcolata in `athleteData` (AiCoachScreen) dalla data match del profilo.

### D — Prompt professionale (aiCoach.js → buildPrompt)
- System prompt: preparatore olimpico con 7 principi obbligatori.
- Nuovi blocchi nel prompt: `profileText`, `readinessText`, `periodText`, `loadText`.
- Schema output ESTESO per ogni sessione: `energySystem`, `physiologicalObjective`,
  `drills[]`, `rpeTarget`, oltre a `intensityTarget`, `workout`, `tssEstimate`, `coachNote`.
- Nuovi campi top-level: `periodizationPhase`, `intensityDistribution`.
- Mantiene le "REGOLE DI VOLUME PER LIVELLO" già presenti.

### E — Carico interno
- **`athleteProfile.js`**: `edwardsTRIMP(trainingZones)`, `sessionRPELoad(rpe, durationMin)`,
  `weeklyInternalLoad(sessions, days)`.
- `weeklyInternalLoad(sessions, 7)` calcolato in `athleteData` e passato al prompt (`internalLoad`).
- NB: dipende da `session.hrZones.training` (sessioni con fascia HR). Sessioni senza HR non contribuiscono.

---

## 3. PATCH DETTAGLIATE — AiCoachScreen.js

1. Import da `../services/athleteProfile`: `loadAthleteProfile, computeReadiness, computePeriodization, weeklyInternalLoad`.
2. Nuovo stato: `const [athleteProfile, setAthleteProfile] = useState(null)`.
3. `useEffect` iniziale: aggiunge `loadAthleteProfile().then(setAthleteProfile)`.
4. `athleteData` (useMemo): aggiunge `profile`, `periodization`, `internalLoad`, `goal` con fallback profilo;
   dependency array aggiornata con `athleteProfile`.
5. `handleCheckInDone`: calcola `readiness` con `computeReadiness(...)` e la passa a `doGenerate({..., readiness})`.
6. Banner profilo/periodizzazione (Pressable → `navigation.navigate("AthleteProfile")`) dopo la KPI row.
7. `SessionCard`: rende `energySystem` (pill), `physiologicalObjective`, `drills[]` (lista), `rpeTarget` (badge).
8. Stili `scStyles`: `energyPill, energyText, drillsBox, drillItem, rpeBadge, rpeText`.
9. Stili `styles`: `profileBanner, profileBannerLabel, profileBannerSub, profileBannerArrow`.

---

## 4. CHECKLIST DI VERIFICA (Claude Code)

### 4.1 File presenti
- [ ] `src/services/athleteProfile.js` esiste
- [ ] `src/screens/AthleteProfileScreen.js` esiste

### 4.2 Import risolti
- [ ] `AiCoachScreen.js` importa da `../services/athleteProfile` (4 funzioni)
- [ ] `RootStackNavigator.js` importa `AthleteProfileScreen`

### 4.3 Regressioni da NON introdurre
- [ ] `aiCoach.js` contiene ancora `AI_PROVIDERS`, `detectProvider`, `api.groq.com`, `generativelanguage.googleapis.com`, `api.anthropic.com`
- [ ] `aiCoach.js` esporta ancora: `generateAiPlan, loadAiPlan, saveCheckIn, loadCheckIns, isPlanCurrentWeek, getTodaySession, formatWorkoutParams, setApiKey, loadApiKey, clearApiKey, setProvider, loadProvider`
- [ ] `AiCoachScreen.js` contiene ancora `<ProGate title="AI Coach" fullscreen>`
- [ ] `RootStackNavigator.js` contiene ancora screen `TrainingLoad` e `Badges`

### 4.4 Nuovi campi prompt (aiCoach.js)
- [ ] `buildPrompt` contiene `energySystem`, `drills`, `rpeTarget`, `physiologicalObjective`
- [ ] `buildPrompt` contiene `profileText`, `readinessText`, `periodText`
- [ ] system prompt contiene "preparatore atletico di livello olimpico"

### 4.5 Compilazione
- [ ] `npx expo start` / Metro bundler senza errori sui 5 file
- [ ] Nessun warning "unresolved import"

### 4.6 Test funzionale in app
- [ ] AI Coach → banner azzurro in alto visibile
- [ ] Tap banner → apre "Profilo Atleta"
- [ ] Compila profilo (categoria peso, livello, data match es. 2026-09-15) → Salva → torna indietro
- [ ] Banner ora mostra la fase di periodizzazione + settimane al match
- [ ] Genera piano → check-in → il piano mostra per ogni sessione: sistema energetico (⚡), drill (lista •), RPE badge
- [ ] Con readiness bassa (fatica 5, sonno 1, dolori intensi) il piano è più orientato al recupero

---

## 5. DIPENDENZE
Nessuna nuova dipendenza npm. Usa solo:
- `@react-native-async-storage/async-storage` (già presente)
- componenti React Native base

---

## 6. NOTE
- `athleteProfile.nextMatchDate` è testo `YYYY-MM-DD`. Validazione minima; input errato → periodizzazione "Preparazione generale".
- `computeReadiness` funziona anche senza check-in (usa default 0.7 sulle componenti soggettive) ma è pensato per essere chiamato col check-in.
- Edwards TRIMP richiede `hrZones.training` in secondi per zona (z1..z5).
