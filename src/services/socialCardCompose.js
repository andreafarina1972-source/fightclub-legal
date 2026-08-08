// src/services/socialCardCompose.js
//
// Compone la Share Card (già catturata come PNG trasparente) dentro un
// canvas a dimensione fissa, indipendente dal dispositivo, pensato per i
// formati verticali dei social (Stories, Reels, TikTok, Shorts) o per il
// feed (post 4:5) e per i formati quadrati (WhatsApp, foto profilo).
//
// Il canvas viene disegnato offscreen con @shopify/react-native-skia:
//   1. sfondo dell'utente (foto) in "cover crop" — riempie sempre l'intero
//      frame, senza bande nere: l'eccedenza esce dai bordi
//   2. velo scuro di leggibilità sopra lo sfondo
//   3. la card (già catturata come PNG trasparente da SessionShareCard)
//      centrata dentro la safe zone del preset scelto, ridotta in scala
//      se la sua altezza eccede lo spazio disponibile
//
// Nessuna dipendenza da React: prende in input i base64 già pronti (la
// cattura della card resta responsabilità del chiamante, vedi
// useSocialCardExport) e restituisce il base64 del PNG finale.
//
// NB: l'animazione GIF/MP4 NON fa parte di questo modulo (fase successiva).

// Lazy require, coerente con gli altri moduli che avvolgono dipendenze
// native opzionali (es. useShareSession, useTransparentCardExport): evita
// crash in ambienti dove il modulo nativo non è ancora linkato.
function getSkia() {
  try { return require("@shopify/react-native-skia"); }
  catch { return null; }
}

// ─────────────────────────────────────────────────────────
// PRESET DI FORMATO
// ─────────────────────────────────────────────────────────
export const SOCIAL_PRESETS = {
  story:  { width: 1080, height: 1920 }, // default — Stories, Reels, TikTok, Shorts
  feed:   { width: 1080, height: 1350 }, // feed Instagram (Meta privilegia il 4:5 sull'1:1)
  square: { width: 1080, height: 1080 }, // WhatsApp, foto profilo
};

// Safe zone universale del preset "story": le fasce fuori da qui sono
// coperte dall'interfaccia di Instagram Stories/Reels e TikTok.
const STORY_SAFE_ZONE = { x: 90, y: 260, width: 900, height: 1400 };
const STORY_CARD_WIDTH = 880;
const STORY_CARD_CENTER_Y = 960;

// feed/square non hanno una safe zone nota fissa: margine interno uniforme.
const FEED_SQUARE_MARGIN_RATIO = 0.07;

// Velo di leggibilità sopra lo sfondo: costante in cima al file, non
// hardcodata nel mezzo della logica.
const VEIL_COLOR = "rgba(0,0,0,0.35)";

// Colore di fallback quando l'utente non ha scelto uno sfondo custom
// (coerente con lo sfondo scuro di SessionShareCard).
const FALLBACK_BG_COLOR = "#050508";

// ─────────────────────────────────────────────────────────
// GEOMETRIA CARD per preset
// ─────────────────────────────────────────────────────────
// Per il preset scelto: larghezza target della card e riquadro (centro +
// altezza massima) in cui deve stare.
function getCardBox(preset, canvasW, canvasH) {
  if (preset === "story") {
    return {
      width: STORY_CARD_WIDTH,
      maxHeight: STORY_SAFE_ZONE.height,
      centerX: canvasW / 2,
      centerY: STORY_CARD_CENTER_Y,
    };
  }
  // feed / square: margine interno del 7% su ogni lato
  const marginX = canvasW * FEED_SQUARE_MARGIN_RATIO;
  const marginY = canvasH * FEED_SQUARE_MARGIN_RATIO;
  return {
    width: canvasW - marginX * 2,
    maxHeight: canvasH - marginY * 2,
    centerX: canvasW / 2,
    centerY: canvasH / 2,
  };
}

// Larghezza (px) a cui catturare la card (view-shot) per il preset scelto:
// esattamente la larghezza che finirà sul canvas, così non si ingrandisce
// mai un'immagine più piccola del necessario (perdita di nitidezza) né se
// ne cattura una più grande del dovuto (spreco).
export function getCardCaptureWidth(preset) {
  const { width: canvasW, height: canvasH } = SOCIAL_PRESETS[preset] || SOCIAL_PRESETS.story;
  return Math.round(getCardBox(preset, canvasW, canvasH).width);
}

// Placement finale (px assoluti sul canvas) della card catturata, dati i suoi
// pixel reali (cardPixelWidth/Height = dimensioni del PNG già catturato via
// captureRef con width = getCardCaptureWidth(preset)). Estratta come funzione
// a sé perché serve sia al percorso PNG statico (Skia, qui sotto) sia al
// percorso video (il modulo nativo Android riceve queste coordinate già
// risolte, invece di duplicare la logica di preset/safe-zone in Kotlin).
export function getCardPlacement(preset, cardPixelWidth, cardPixelHeight) {
  const { width: canvasW, height: canvasH } = SOCIAL_PRESETS[preset] || SOCIAL_PRESETS.story;
  const box = getCardBox(preset, canvasW, canvasH);

  let width = box.width;
  let height = (cardPixelHeight / cardPixelWidth) * width;
  if (height > box.maxHeight) {
    const shrink = box.maxHeight / height;
    height = box.maxHeight;
    width = width * shrink;
  }
  return {
    x: box.centerX - width / 2,
    y: box.centerY - height / 2,
    width,
    height,
  };
}

// Alpha del velo (0-255) equivalente a VEIL_COLOR, per il percorso nativo
// Android che non parla CSS rgba().
export const VEIL_ALPHA_255 = Math.round(0.35 * 255);

// Tempo massimo per il caricamento dello sfondo prima di rinunciare e usare
// il fallback scuro. Necessario perché Skia.Data.fromURI, quando l'uri punta
// a un file non più presente su disco (es. cache di expo-image-picker
// svuotata dal sistema mentre lo sfondo restava salvato in AsyncStorage),
// non rigetta la Promise: resta sospesa a tempo indeterminato, e senza
// timeout la UI di export rimarrebbe bloccata su "Componendo..." per sempre.
const BACKGROUND_LOAD_TIMEOUT_MS = 4000;

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

async function loadSkiaImage(Skia, uri) {
  try {
    const data = await withTimeout(Skia.Data.fromURI(uri), BACKGROUND_LOAD_TIMEOUT_MS);
    return data ? Skia.Image.MakeImageFromEncoded(data) : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────
// COMPOSIZIONE
// ─────────────────────────────────────────────────────────
/**
 * @param {object} params
 *   cardBase64    - PNG (con alpha) della card già catturata via captureRef,
 *                   larghezza = getCardCaptureWidth(preset)
 *   backgroundUri - uri locale (file:// / content://) dello sfondo scelto
 *                   dall'utente, oppure null/undefined per il fallback scuro
 *   preset        - "story" | "feed" | "square"
 * @returns {Promise<string>} base64 del PNG finale, dimensione fissa del preset
 */
export async function composeSocialCard({ cardBase64, backgroundUri, preset = "story" }) {
  const SkiaModule = getSkia();
  if (!SkiaModule) throw new Error("skia-unavailable");
  const { Skia, ImageFormat } = SkiaModule;

  const { width: canvasW, height: canvasH } = SOCIAL_PRESETS[preset] || SOCIAL_PRESETS.story;

  const surface = Skia.Surface.MakeOffscreen(canvasW, canvasH);
  if (!surface) throw new Error("skia-surface-failed");
  const canvas = surface.getCanvas();

  // 1. SFONDO — cover crop su tutto il canvas (nessuna banda nera)
  const bgImage = backgroundUri ? await loadSkiaImage(Skia, backgroundUri) : null;
  if (bgImage) {
    const imgW = bgImage.width();
    const imgH = bgImage.height();
    const scale = Math.max(canvasW / imgW, canvasH / imgH);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const dx = (canvasW - drawW) / 2;
    const dy = (canvasH - drawH) / 2;
    canvas.drawImageRect(
      bgImage,
      Skia.XYWHRect(0, 0, imgW, imgH),
      Skia.XYWHRect(dx, dy, drawW, drawH),
      Skia.Paint()
    );
  } else {
    const bgPaint = Skia.Paint();
    bgPaint.setColor(Skia.Color(FALLBACK_BG_COLOR));
    canvas.drawRect(Skia.XYWHRect(0, 0, canvasW, canvasH), bgPaint);
  }

  // 2. VELO di leggibilità
  const veilPaint = Skia.Paint();
  veilPaint.setColor(Skia.Color(VEIL_COLOR));
  canvas.drawRect(Skia.XYWHRect(0, 0, canvasW, canvasH), veilPaint);

  // 3. CARD — centrata nella safe zone del preset, ridotta in scala se
  //    l'altezza risultante eccede lo spazio disponibile
  const cardData = Skia.Data.fromBase64(cardBase64);
  const cardImage = cardData ? Skia.Image.MakeImageFromEncoded(cardData) : null;
  if (!cardImage) throw new Error("card-decode-failed");

  const cw = cardImage.width();
  const ch = cardImage.height();
  const placement = getCardPlacement(preset, cw, ch);

  canvas.drawImageRect(
    cardImage,
    Skia.XYWHRect(0, 0, cw, ch),
    Skia.XYWHRect(placement.x, placement.y, placement.width, placement.height),
    Skia.Paint()
  );

  const snapshot = surface.makeImageSnapshot();
  return snapshot.encodeToBase64(ImageFormat.PNG);
}
