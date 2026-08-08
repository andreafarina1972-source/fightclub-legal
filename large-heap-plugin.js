// large-heap-plugin.js
// Expo Config Plugin — imposta android:largeHeap="true" sull'elemento
// <application> dell'AndroidManifest generato da `expo prebuild`.
//
// Perché serve: verificato su device reale (MediaTek, heap di default
// 256 MB) che l'app va in OutOfMemoryError quando l'utente seleziona un
// video come sfondo della share card, anche senza decodificarlo in JS —
// tra Skia, mappe, ads SDK e il resto, il file (spesso decine/centinaia di
// MB) e le sue metadata/thumbnail generate dal picker di sistema esauriscono
// l'heap di default. largeHeap è il meccanismo Android standard per app che
// maneggiano media pesanti (fotocamera, editor foto/video): non risolve
// eventuali leak, ma dà il margine che serve per questo caso d'uso.
//
// Utilizzo in app.json:
//   "plugins": ["./large-heap-plugin"]

const { withAndroidManifest } = require("@expo/config-plugins");

function setLargeHeap(androidManifest) {
  const app = androidManifest.manifest.application?.[0];
  if (!app) {
    console.log("⚠️ large-heap-plugin: <application> non trovato in AndroidManifest, largeHeap non impostato");
    return androidManifest;
  }
  app.$["android:largeHeap"] = "true";
  console.log("✅ large-heap-plugin: android:largeHeap=\"true\" impostato su <application>");
  return androidManifest;
}

module.exports = function withLargeHeap(config) {
  return withAndroidManifest(config, async (config) => {
    config.modResults = setLargeHeap(config.modResults);
    return config;
  });
};
