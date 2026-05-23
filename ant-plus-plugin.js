// ant-plus-plugin.js
// Expo Config Plugin per react-native-ant-plus (managed workflow)
//
// Aggiunge nell'AndroidManifest di Android 11+ la voce <queries>
// necessaria a interrogare il servizio ANT+ Plugin di Garmin/Dynastream.
//
// Utilizzo in app.json:
//   "plugins": [
//     ["./ant-plus-plugin"]
//   ]

const { withAndroidManifest } = require("@expo/config-plugins");

function addAntPlusQuery(androidManifest) {
  const manifest = androidManifest.manifest;

  // Inizializza <queries> se non esiste
  if (!manifest.queries) {
    manifest.queries = [];
  }

  // Cerca se la voce è già presente (idempotente)
  const queriesBlock = manifest.queries[0] || {};
  if (!queriesBlock.package) {
    queriesBlock.package = [];
  }

  const alreadyAdded = queriesBlock.package.some(
    (p) => p.$?.["android:name"] === "com.dsi.ant.plugins.antplus"
  );

  if (!alreadyAdded) {
    queriesBlock.package.push({
      $: { "android:name": "com.dsi.ant.plugins.antplus" },
    });
    manifest.queries[0] = queriesBlock;
    console.log("✅ ant-plus-plugin: aggiunto <queries> per com.dsi.ant.plugins.antplus");
  }

  return androidManifest;
}

module.exports = function withAntPlus(config) {
  return withAndroidManifest(config, async (config) => {
    config.modResults = addAntPlusQuery(config.modResults);
    return config;
  });
};