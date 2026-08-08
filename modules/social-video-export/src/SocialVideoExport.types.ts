// Parametri per composeSocialVideo. Vedi android/.../SocialVideoExportTypes.kt
// per il record nativo corrispondente (stessi nomi di campo).
export type ComposeSocialVideoOptions = {
  /** uri (file://) del video o della gif da usare come sfondo animato */
  sourceUri: string;
  /** uri (file://) del PNG della card già catturato lato JS (con alpha) */
  cardUri: string;
  /** uri (file://) di destinazione del mp4 risultante */
  outputUri: string;
  canvasWidth: number;
  canvasHeight: number;
  /** geometria della card sul canvas, già risolta lato JS (getCardPlacement) */
  cardX: number;
  cardY: number;
  cardWidth: number;
  cardHeight: number;
  /** opacità del velo scuro, 0-255 (~89 = 0.35 di opacità) */
  veilAlpha?: number;
  /** durata massima esportata dalla sorgente, in millisecondi (default 15000) */
  maxDurationMs?: number;
  /** frame al secondo dell'output (default 12) */
  fps?: number;
};
