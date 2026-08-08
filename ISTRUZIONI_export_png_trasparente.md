# Istruzioni Claude Code — Aggiunta "Esporta PNG trasparente" (per montaggio video)

## Obiettivo
Aggiungere una **seconda opzione di condivisione** alla fight card, senza
toccare quella attuale:

- **Opzione A (già esistente, NON modificare il comportamento):** condivide la
  card come PNG statico *con* lo sfondo scelto (foto/GIF congelata su un frame).
- **Opzione B (NUOVA):** esporta la card come **PNG con sfondo trasparente**
  (solo il contenuto: placca, tale-of-the-tape, statistiche, bande, footer),
  così l'utente può portarla in un'app di montaggio (CapCut, InShot, Storie IG)
  e sovrapporla a un proprio video per ottenere una clip animata. Nessun server,
  nessuna nuova dipendenza.

## Vincoli
- **NON rompere** il flusso attuale: `useShareSession` e la card statica con
  sfondo devono restare invariati nel comportamento.
- Nessuna nuova dipendenza: si riusano `react-native-view-shot`, `expo-sharing`,
  `expo-media-library` (già installati).
- Il nuovo pulsante va **dentro il modal di anteprima** (`ShareCardPreviewModal`),
  come azione secondaria, per non affollare la riga pulsanti di `HistoryScreen`.
- `HistoryScreen.js` **non va modificato**.

---

## Modifica 1 — `src/components/SessionShareCard.js`
### Aggiungere una prop `transparent` che rende la card senza sfondo e senza velo scuro.

**1a.** Cambiare la firma del componente per accettare `transparent` (default `false`):

```js
// PRIMA
const SessionShareCard = forwardRef(function SessionShareCard({ session, backgroundUri }, ref) {

// DOPO
const SessionShareCard = forwardRef(function SessionShareCard({ session, backgroundUri, transparent = false }, ref) {
```

**1b.** Nel `return`, modificare il contenitore radice e il blocco sfondo/overlay.
Sostituire il blocco che va dall'apertura del `<View ref={ref} ...>` fino alle due
righe di overlay scuro:

```jsx
// PRIMA
    <View ref={ref} style={[cardSt.card, { width: CARD_W }]} collapsable={false}>
      {/* SFONDO: immagine/GIF utente oppure fallback scuro con banda diagonale */}
      {backgroundUri ? (
        <Image source={{ uri: backgroundUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, cardSt.fallbackBg]}>
          <View style={cardSt.diagonalBandA} />
          <View style={cardSt.diagonalBandB} />
        </View>
      )}

      {/* OVERLAY scuro per leggibilità testo sopra lo sfondo */}
      <View style={[StyleSheet.absoluteFillObject, cardSt.overlayTop]} />
      <View style={[StyleSheet.absoluteFillObject, cardSt.overlayBottom]} />
```

```jsx
// DOPO
    <View
      ref={ref}
      style={[cardSt.card, { width: CARD_W }, transparent && cardSt.cardTransparent]}
      collapsable={false}
    >
      {/* SFONDO: in modalità trasparente NON si disegna nulla (canale alpha vuoto) */}
      {!transparent &&
        (backgroundUri ? (
          <Image source={{ uri: backgroundUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, cardSt.fallbackBg]}>
            <View style={cardSt.diagonalBandA} />
            <View style={cardSt.diagonalBandB} />
          </View>
        ))}

      {/* OVERLAY scuro per leggibilità: SOLO quando c'è uno sfondo (non in modalità trasparente) */}
      {!transparent && <View style={[StyleSheet.absoluteFillObject, cardSt.overlayTop]} />}
      {!transparent && <View style={[StyleSheet.absoluteFillObject, cardSt.overlayBottom]} />}
```

**1c.** Rendere leggibili i testi "liberi" quando manca il velo scuro. In modalità
trasparente i pannelli `tape`, la placca e le chip mantengono già il loro sfondo
semi-opaco, quindi restano leggibili. Vanno rinforzati solo i testi che poggiano
direttamente sull'area trasparente: `brand`, `metaDate`, `zonesTitle`,
`zoneLegendText` (l'`eventName` ha già un'ombra).

Applicare `transparent && cardSt.shadowText` allo `style` di quei quattro testi.
Esempio per `brand` (fare lo stesso per gli altri tre):

```jsx
// PRIMA
<Text style={cardSt.brand}>FIGHTCLUB</Text>
// DOPO
<Text style={[cardSt.brand, transparent && cardSt.shadowText]}>FIGHTCLUB</Text>
```

```jsx
<Text style={[cardSt.metaDate, transparent && cardSt.shadowText]}>{date}</Text>
...
<Text style={[cardSt.zonesTitle, transparent && cardSt.shadowText]}>Zone cardio</Text>
...
<Text style={[cardSt.zoneLegendText, transparent && cardSt.shadowText]}>{z.label} {z.pct}%</Text>
```

**1d.** Aggiungere in fondo, dentro `const cardSt = StyleSheet.create({ ... })`,
due nuovi stili:

```js
  cardTransparent: {
    backgroundColor: "transparent",
  },
  shadowText: {
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
```

> Nota: il bordo dorato del contenitore (`card.borderColor`) va **mantenuto** anche
> in trasparente: funge da cornice quando la card viene sovrapposta a un video.

---

## Modifica 2 — NUOVO file `src/hooks/useTransparentCardExport.js`
Hook gemello di `useShareSession`, ma cattura la card in modalità trasparente e la
condivide/salva come PNG con alpha. Non modifica `useShareSession`.

```js
// src/hooks/useTransparentCardExport.js
//
// Cattura la SessionShareCard in modalità `transparent` (sfondo alpha) e la
// condivide come PNG trasparente, pensato per essere importato in un'app di
// montaggio video (CapCut, InShot, Storie IG) e sovrapposto a un video/GIF
// per ottenere una clip animata. Nessun server, nessuna dipendenza nuova.
//
// Utilizzo:
//   const { transparentRef, handleExport, exporting } = useTransparentCardExport(session);
//   <SessionShareCard ref={transparentRef} session={session} transparent />
//   <Pressable onPress={handleExport}>...</Pressable>

import { useRef, useState, useCallback } from "react";
import { Alert } from "react-native";

function getCaptureRef() {
  try { return require("react-native-view-shot").captureRef; }
  catch { return null; }
}
function getSharing() {
  try { return require("expo-sharing"); }
  catch { return null; }
}
function getMediaLibrary() {
  try { return require("expo-media-library"); }
  catch { return null; }
}

export function useTransparentCardExport(session) {
  const transparentRef = useRef(null);
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (exporting || !transparentRef.current) return;

    const captureRef = getCaptureRef();
    if (!captureRef) {
      Alert.alert("Non disponibile", "react-native-view-shot richiede un development build.");
      return;
    }

    setExporting(true);
    try {
      // format png = canale alpha preservato; la card ha sfondo trasparente,
      // quindi il PNG risultante avrà lo sfondo effettivamente trasparente.
      const uri = await captureRef(transparentRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });

      // Percorso consigliato: condividere il FILE (lo passa integro all'app di
      // montaggio, mantenendo la trasparenza).
      const Sharing = getSharing();
      if (Sharing && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          dialogTitle: "Esporta la card trasparente (per montaggio video)",
          UTI: "public.png", // iOS
        });
      } else {
        // Fallback: salva nella libreria foto (il PNG conserva l'alpha)
        const MediaLibrary = getMediaLibrary();
        if (MediaLibrary) {
          const { status } = await MediaLibrary.requestPermissionsAsync();
          if (status === "granted") {
            await MediaLibrary.saveToLibraryAsync(uri);
            Alert.alert("Salvata!", "La card trasparente è stata salvata nelle foto.");
          } else {
            Alert.alert("Permesso negato", "Abilita l'accesso alle foto nelle impostazioni.");
          }
        }
      }
    } catch (e) {
      console.log("❌ Export trasparente error:", e?.message);
      Alert.alert("Errore", "Impossibile esportare la card trasparente.");
    } finally {
      setExporting(false);
    }
  }, [exporting, session]);

  return { transparentRef, handleExport, exporting };
}
```

---

## Modifica 3 — `src/components/ShareCardPreviewModal.js`
Aggiungere, **dentro il modal**, un'istanza nascosta della card in modalità
trasparente + un pulsante secondario "Esporta PNG trasparente". Non toccare la
preview scalata esistente né gli altri pulsanti.

**3a.** Import in cima al file:

```js
import { useTransparentCardExport } from "../hooks/useTransparentCardExport";
```

**3b.** Dentro il componente, dopo la riga `const insets = useSafeAreaInsets();`
(o comunque tra gli hook iniziali), agganciare il nuovo hook:

```js
const { transparentRef, handleExport, exporting } = useTransparentCardExport(session);
```

**3c.** Rendere l'istanza nascosta trasparente. Metterla subito dentro il
`<View style={st.backdrop}>` (o dentro lo `sheet`), fuori dallo ScrollView, così
non è visibile ma è catturabile. IMPORTANTE: **senza** `backgroundUri` e con
`transparent`:

```jsx
{/* Istanza nascosta in modalità trasparente, solo per la cattura PNG alpha */}
<View style={{ position: "absolute", left: -9999, top: 0, opacity: 0 }} pointerEvents="none">
  <SessionShareCard ref={transparentRef} session={session} transparent />
</View>
```

**3d.** Nel blocco `<View style={st.actions}>`, aggiungere il pulsante di export
**dopo** il pulsante "Condividi" (resta l'azione principale in verde). Poi, sotto
il blocco actions, un breve hint:

```jsx
<Pressable
  style={[st.exportBtn, exporting && { opacity: 0.6 }]}
  onPress={handleExport}
  disabled={exporting}
>
  <Text style={st.exportBtnText}>
    {exporting ? "Esporto..." : "🎬 Esporta PNG trasparente"}
  </Text>
</Pressable>
```

E subito dopo la chiusura di `</View>` del blocco `actions`:

```jsx
<Text style={st.exportHint}>
  Per un video animato: apri il PNG in CapCut, InShot o nelle Storie, mettilo
  sopra un tuo video ed esporta la clip.
</Text>
```

**3e.** Aggiungere gli stili nel `StyleSheet.create` del modal:

```js
  exportBtn: {
    flexBasis: "100%",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
  },
  exportBtnText: { color: "rgba(255,255,255,0.9)", fontWeight: "800", fontSize: 13 },
  exportHint: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    lineHeight: 15,
    paddingHorizontal: 20,
    paddingTop: 8,
    textAlign: "center",
  },
```

> Il pulsante "Condividi 📤" verde resta l'azione principale (Opzione A, card con
> sfondo). L'export trasparente (Opzione B) è volutamente uno stile neutro/secondario.

---

## Verifica

### 1. Controllo statico (senza build)
```bash
npx esbuild src/components/SessionShareCard.js --loader:.js=jsx --bundle=false --outfile=/dev/null
npx esbuild src/components/ShareCardPreviewModal.js --loader:.js=jsx --bundle=false --outfile=/dev/null
npx esbuild src/hooks/useTransparentCardExport.js --loader:.js=jsx --bundle=false --outfile=/dev/null
```
Devono terminare senza errori. Nessuna nuova dipendenza da installare, nessun
nuovo modulo nativo → **non serve un nuovo development build** (view-shot,
expo-sharing e expo-media-library sono già presenti).

### 2. Regressione — Opzione A invariata
1. Aprire una sessione, impostare uno sfondo (foto o GIF), toccare **Condividi 📤**:
   deve uscire il PNG statico **con** lo sfondo, esattamente come prima.
2. Ripetere senza sfondo custom: deve uscire il PNG col fallback scuro a bande.
   → Nessuna differenza rispetto al comportamento precedente.

### 3. Opzione B — export trasparente
1. Aprire **Anteprima** su una sessione → nel modal compare il nuovo pulsante
   **"🎬 Esporta PNG trasparente"** con l'hint sotto.
2. Toccarlo → deve aprirsi il foglio di condivisione di sistema con un file PNG.
3. **Verifica trasparenza reale:** salvare/inviare il PNG e aprirlo in un editor
   (o metterlo sopra uno sfondo colorato in un'app foto). Devono vedersi solo i
   contenuti della card (placca, statistiche, bande, footer, bordo dorato) mentre
   lo **sfondo è trasparente** — nessun rettangolo nero, nessun velo grigio.
4. **Leggibilità:** mettere il PNG sopra un video/immagine **chiara**. I testi
   liberi (marchio, data, titolo zone, legenda) devono restare leggibili grazie
   all'ombra; i pannelli (tape/placca) restano leggibili per il loro fondo scuro.
5. **Test end-to-end reale:** importare il PNG in CapCut o nelle Storie IG,
   sovrapporlo a un video e verificare che l'esportazione produca una clip con la
   card ferma sopra il video in movimento.

### 4. Varianti dati
- **Boxing:** la placca mostra il Fight Score; il tale-of-the-tape mostra colpi,
  cadenza, round, miglior round, calorie.
- **Running:** la placca mostra VO2max (o distanza); il tape mostra distanza,
  pace media, km migliore, calorie.
  → Verificare che entrambe rendano correttamente anche in modalità trasparente.

### 5. Fallback
- Se testato su una build priva di `react-native-view-shot`, toccando "Esporta"
  deve comparire l'alert "Non disponibile" senza crash.

---

## Riepilogo file
| File | Azione |
|---|---|
| `src/components/SessionShareCard.js` | Modificato: nuova prop `transparent` (sfondo alpha, niente velo, ombre testi). Comportamento con sfondo invariato. |
| `src/hooks/useTransparentCardExport.js` | **Nuovo**: cattura+condivisione del PNG trasparente. |
| `src/components/ShareCardPreviewModal.js` | Modificato: istanza nascosta `transparent` + pulsante "Esporta PNG trasparente" + hint. |
| `src/hooks/useShareSession.js` | **Invariato**. |
| `src/screens/HistoryScreen.js` | **Invariato**. |
