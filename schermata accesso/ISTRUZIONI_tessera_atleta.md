# Istruzioni Claude Code — Schermata "Tessera Atleta" d'ingresso (scenografica)

## Obiettivo
Aggiungere una schermata d'ingresso scenografica in stile **tessera atleta**
(variante card giocatore, foto a mezzobusto) mostrata **a ogni avvio** dell'app
prima della navigazione. L'utente vede la propria tessera con foto, nickname e
tre statistiche, e tocca **"ENTRA"** per proseguire alla Home.

- Nessuna autenticazione, nessun server: è puramente scenografica.
- Foto (via `expo-image-picker`, già in progetto) e nickname persistiti in
  `AsyncStorage`.
- Statistiche (best score / sessioni / streak) calcolate dallo storico sessioni.
- La tessera ricompare a ogni apertura (lo stato "entrato" non è persistito).

## Vincoli
- Nessuna nuova dipendenza (`expo-image-picker`, `react-native-safe-area-context`
  e `@react-native-async-storage/async-storage` sono già presenti). Nessun nuovo
  development build necessario.
- La modifica di foto/nome avviene **sulla tessera stessa** (autonoma). Non
  toccare `SettingsScreen`.

---

## Modifica 1 — NUOVO file `src/screens/AthleteCardScreen.js`
Creare il file con il contenuto allegato (`AthleteCardScreen.js`). In sintesi il
componente:
- riceve una prop `onEnter` (callback chiamata al tap su "ENTRA");
- al mount carica profilo (`getAthleteProfile`) e sessioni (`getSessions`) e
  calcola le statistiche;
- foto a mezzobusto 200×250 con bordo dorato e nome in sovrimpressione;
- tap sulla foto = scegli/cambia immagine, long-press = rimuovi;
- "✎ Modifica nome" apre un modal con `TextInput` per il nickname;
- disciplina (boxing/running) inferita dal tipo prevalente delle sessioni;
- statistiche: best fight score, numero sessioni, streak giorni consecutivi.

> Il file è completo e già verificato sintatticamente: va copiato così com'è in
> `src/screens/AthleteCardScreen.js`. Importa da `../services/storage` le funzioni
> `getSessions`, `getAthleteProfile`, `saveAthleteProfile` (le ultime due vanno
> aggiunte con la Modifica 2).

---

## Modifica 2 — `src/services/storage.js`
Aggiungere la chiave e le due funzioni per il profilo atleta, accanto alle altre
funzioni esportate (es. dopo `saveSessions`). NON modificare le funzioni esistenti.

```js
const ATHLETE_KEY = 'fightclub_athlete_profile';

export async function getAthleteProfile() {
  try {
    const json = await AsyncStorage.getItem(ATHLETE_KEY);
    return json ? JSON.parse(json) : null;
  } catch (e) {
    console.warn('Errore caricando profilo atleta', e);
    return null;
  }
}

export async function saveAthleteProfile(profile) {
  try {
    await AsyncStorage.setItem(ATHLETE_KEY, JSON.stringify(profile || {}));
  } catch (e) {
    console.warn('Errore salvando profilo atleta', e);
  }
}
```

> Verificare che in cima a `storage.js` sia già presente l'import di
> `AsyncStorage` (lo è: `import AsyncStorage from '@react-native-async-storage/async-storage';`).

---

## Modifica 3 — `App.js`
Mostrare la tessera prima della navigazione, dentro `AppInner`, tramite uno stato
locale non persistito (così ricompare a ogni avvio).

**3a.** Aggiornare l'import di React per includere `useState`:

```js
// PRIMA
import React, { useEffect } from "react";
// DOPO
import React, { useEffect, useState } from "react";
```

**3b.** Aggiungere l'import della schermata insieme agli altri import di screen
(es. sotto `import RootStackNavigator ...`):

```js
import AthleteCardScreen from "./src/screens/AthleteCardScreen";
```

**3c.** Dentro `function AppInner()`, aggiungere lo stato subito dopo
`const { lang, ready } = useLanguage();`:

```js
const [entered, setEntered] = useState(false);
```

**3d.** Nel `return` di `AppInner`, sostituire il blocco attuale:

```jsx
// PRIMA
                <StatusBar barStyle="light-content" backgroundColor="#050508" />
                <NavigationContainer theme={FightClubTheme} key={lang}>
                  <AppStack />
                </NavigationContainer>
```

```jsx
// DOPO
                <StatusBar barStyle="light-content" backgroundColor="#050508" />
                {!entered ? (
                  <AthleteCardScreen onEnter={() => setEntered(true)} />
                ) : (
                  <NavigationContainer theme={FightClubTheme} key={lang}>
                    <AppStack />
                  </NavigationContainer>
                )}
```

> La tessera resta dentro tutti i Provider e il `SafeAreaProvider`, quindi ha
> accesso allo storico e ai safe-area insets. Non va inserita nel navigator:
> è un "gate" prima del `NavigationContainer`.

---

## Verifica

### 1. Controllo statico (senza build)
```bash
npx esbuild src/screens/AthleteCardScreen.js --loader:.js=jsx --bundle=false --outfile=/dev/null
npx esbuild src/services/storage.js --loader:.js=jsx --bundle=false --outfile=/dev/null
npx esbuild App.js --loader:.js=jsx --bundle=false --outfile=/dev/null
```
Devono terminare senza errori. Nessuna dipendenza nuova → nessun nuovo dev build.

### 2. Test funzionale
1. **Avvio:** all'apertura dell'app compare la tessera atleta (non la Home).
   Con profilo vuoto: placeholder foto ("Tocca per aggiungere la tua foto") e
   "✎ Crea la tua tessera"; statistiche a "--"/0.
2. **Foto:** toccare la foto → permessi (prima volta) → galleria → scelta con
   ritaglio 4:5. L'immagine appare nella tessera. Long-press sulla foto →
   conferma → rimozione.
3. **Nome:** toccare "✎ Modifica nome" → modal con campo di testo → salvare →
   il nickname appare in sovrimpressione sulla foto.
4. **Persistenza:** chiudere e riaprire l'app → foto e nome sono ancora presenti
   (AsyncStorage). La tessera **ricompare** a ogni avvio (comportamento voluto).
5. **Statistiche:** con almeno una sessione nello storico, verificare che
   "Best Score" mostri il fight score massimo, "Sessioni" il conteggio totale e
   "Streak" i giorni consecutivi di allenamento fino a oggi.
6. **Disciplina:** con sessioni prevalentemente running, la chip mostra
   "🏃 RUNNING" (blu); altrimenti "🥊 BOXING" (rosso).
7. **Ingresso:** toccare "ENTRA" → si apre la navigazione normale (tab Home).
8. **Fallback:** su una build priva di `expo-image-picker`, toccando la foto
   compare l'alert "Non disponibile" senza crash; "ENTRA" funziona comunque.

### 3. Regressione
- Verificare che, dopo "ENTRA", tutte le tab e le funzioni esistenti (timer,
  workout, running, storico, condivisione fight card, impostazioni) funzionino
  come prima: il gate non modifica la navigazione, la incapsula soltanto.

---

## Riepilogo file
| File | Azione |
|---|---|
| `src/screens/AthleteCardScreen.js` | **Nuovo**: schermata tessera atleta scenografica (foto mezzobusto, nome, 3 statistiche, "ENTRA"). |
| `src/services/storage.js` | Modificato: aggiunte `getAthleteProfile` / `saveAthleteProfile` (+ chiave `ATHLETE_KEY`). Funzioni esistenti invariate. |
| `App.js` | Modificato: stato `entered` + gate che mostra la tessera prima del `NavigationContainer`. |

## Note / possibili evoluzioni
- Se in futuro vuoi spostare la modifica di foto/nome in **Impostazioni**: rimuovi
  dalla tessera il pressable "Modifica nome" e l'`onPress`/`onLongPress` sulla
  foto, e replica `getAthleteProfile`/`saveAthleteProfile` in `SettingsScreen`.
- Se vuoi rendere la tessera saltabile dopo la prima volta, si può persistere un
  flag in AsyncStorage e leggerlo per decidere se mostrarla — ma la scelta
  attuale ("sempre a ogni apertura") non richiede persistenza dello stato.
