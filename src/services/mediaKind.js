// src/services/mediaKind.js
//
// Rilevamento del tipo di sfondo scelto dall'utente a partire dalla sua uri
// (estensione file), per instradare la card verso il percorso PNG statico o
// quello video animato. Vedi useSocialCardExport (instradamento export) e
// SessionShareCard (anteprima: <Image> vs <Video>).

const VIDEO_EXTENSIONS = ["mp4", "mov", "m4v", "3gp", "3gpp", "webm", "mkv"];

function extensionOf(uri) {
  if (!uri) return "";
  const clean = String(uri).split("?")[0];
  return clean.substring(clean.lastIndexOf(".") + 1).toLowerCase();
}

export function isVideoUri(uri) {
  return VIDEO_EXTENSIONS.includes(extensionOf(uri));
}

export function isGifUri(uri) {
  return extensionOf(uri) === "gif";
}

// true se lo sfondo è animato (video o gif): va composto con il percorso
// export video nativo (Android) invece del PNG statico Skia.
export function isAnimatedUri(uri) {
  return isVideoUri(uri) || isGifUri(uri);
}
