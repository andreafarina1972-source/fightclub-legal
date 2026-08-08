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

const { withAndroidManifest, withProjectBuildGradle } = require("@expo/config-plugins");

// react-native-ant-plus dichiara la sua dipendenza AAR locale (antpluginlib_3-8-0)
// tramite un flatDir nel proprio build.gradle, ma con l'autolinking/version-catalog
// di Expo quel flatDir non basta: va dichiarato anche nel build.gradle di root,
// altrimenti la build fallisce con "Could not find :antpluginlib_3-8-0:".
function addAntPlusFlatDir(buildGradle) {
  const marker = "react-native-ant-plus/android/antplugin";
  if (buildGradle.includes(marker)) return buildGradle; // idempotente

  const flatDirBlock = `    flatDir {\n      dirs "$rootDir/../node_modules/react-native-ant-plus/android/antplugin"\n    }\n`;

  if (buildGradle.includes("allprojects {") && buildGradle.includes("repositories {")) {
    // inserisce il flatDir come ultima voce del primo blocco "repositories {" dentro "allprojects"
    const allprojectsIdx = buildGradle.indexOf("allprojects {");
    const reposIdx = buildGradle.indexOf("repositories {", allprojectsIdx);
    const closeIdx = buildGradle.indexOf("\n  }", reposIdx);
    if (reposIdx !== -1 && closeIdx !== -1) {
      return buildGradle.slice(0, closeIdx) + "\n" + flatDirBlock + buildGradle.slice(closeIdx);
    }
  }

  console.log("⚠️ ant-plus-plugin: impossibile individuare allprojects/repositories in build.gradle, flatDir non aggiunto automaticamente");
  return buildGradle;
}

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
  config = withAndroidManifest(config, async (config) => {
    config.modResults = addAntPlusQuery(config.modResults);
    return config;
  });
  config = withProjectBuildGradle(config, (config) => {
    if (config.modResults.language === "groovy") {
      config.modResults.contents = addAntPlusFlatDir(config.modResults.contents);
    }
    return config;
  });
  return config;
};