// release-signing-plugin.js
// Expo Config Plugin — inietta la firma di release (keystore di upload per
// Google Play) nel progetto Android generato da `expo prebuild`.
//
// Perché serve: la cartella android/ è rigenerata a ogni `expo prebuild` (è
// in .gitignore, vedi /android in .gitignore) e per default usa la keystore
// di debug anche per le build "release" — non pubblicabile su Play Store.
// Questo plugin, ad ogni prebuild:
//   1. copia release-upload.jks (root del progetto) dentro android/app/
//   2. aggiunge un signingConfigs.release al build.gradle dell'app
//   3. imposta buildTypes.release a usare quella firma invece del debug
//
// Le credenziali NON sono in questo file: vengono lette da
// release-signing.properties (root, gitignored). Se quel file manca (es. CI
// pubblico, o un altro sviluppatore senza le credenziali), il plugin non fa
// nulla e la build "release" resta firmata col keystore di debug — utile per
// non rompere build locali di chi non ha le chiavi, ma NON va bene per
// pubblicare: prima di caricare su Play Console verificare che questo plugin
// abbia effettivamente trovato le credenziali (log in console durante prebuild).

const fs = require("fs");
const path = require("path");
const { withAppBuildGradle, withDangerousMod } = require("@expo/config-plugins");

const PROPS_FILENAME = "release-signing.properties";

function readReleaseSigningProps(projectRoot) {
  const propsPath = path.join(projectRoot, PROPS_FILENAME);
  if (!fs.existsSync(propsPath)) return null;

  const text = fs.readFileSync(propsPath, "utf8");
  const out = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }

  const required = ["RELEASE_STORE_FILE", "RELEASE_KEY_ALIAS", "RELEASE_STORE_PASSWORD", "RELEASE_KEY_PASSWORD"];
  if (!required.every((k) => out[k])) return null;
  return out;
}

// Copia la keystore dentro android/app/ perché il build.gradle dell'app la
// referenzia con un path relativo al modulo (file('release-upload.jks')).
function withReleaseKeystoreCopy(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const props = readReleaseSigningProps(projectRoot);
      if (!props) {
        console.log("ℹ️ release-signing-plugin: release-signing.properties non trovato, salto la firma di release (resta il debug keystore).");
        return config;
      }
      const src = path.join(projectRoot, props.RELEASE_STORE_FILE);
      if (!fs.existsSync(src)) {
        console.log(`⚠️ release-signing-plugin: keystore ${props.RELEASE_STORE_FILE} non trovata in root, salto.`);
        return config;
      }
      const destDir = path.join(config.modRequest.platformProjectRoot, "app");
      const dest = path.join(destDir, props.RELEASE_STORE_FILE);
      fs.copyFileSync(src, dest);
      console.log("✅ release-signing-plugin: keystore di release copiata in android/app/");
      return config;
    },
  ]);
}

function withReleaseSigningGradle(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") return config;

    const projectRoot = config.modRequest.projectRoot;
    const props = readReleaseSigningProps(projectRoot);
    if (!props) return config;

    let contents = config.modResults.contents;
    const marker = "// release-signing-plugin: signingConfigs.release";
    if (contents.includes(marker)) return config; // idempotente

    // 1) Aggiunge signingConfigs.release accanto al debug esistente.
    const debugSigningBlock = `signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`;

    if (!contents.includes(debugSigningBlock)) {
      console.log("⚠️ release-signing-plugin: blocco signingConfigs atteso non trovato, build.gradle non modificato. Verifica manualmente prima di pubblicare.");
      return config;
    }

    const withReleaseConfig = `signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        ${marker}
        release {
            storeFile file('${props.RELEASE_STORE_FILE}')
            storePassword '${props.RELEASE_STORE_PASSWORD}'
            keyAlias '${props.RELEASE_KEY_ALIAS}'
            keyPassword '${props.RELEASE_KEY_PASSWORD}'
        }
    }`;

    contents = contents.replace(debugSigningBlock, withReleaseConfig);

    // 2) Nel buildType "release", usa signingConfigs.release invece del debug.
    const releaseBuildTypeMarker = "release {\n            // Caution! In production, you need to generate your own keystore file.";
    const relIdx = contents.indexOf(releaseBuildTypeMarker);
    if (relIdx === -1) {
      console.log("⚠️ release-signing-plugin: buildTypes.release atteso non trovato, signingConfig non riassegnato. Verifica manualmente.");
    } else {
      const oldSigningLine = "            signingConfig signingConfigs.debug";
      const lineIdx = contents.indexOf(oldSigningLine, relIdx);
      if (lineIdx !== -1) {
        contents = contents.slice(0, lineIdx) + "            signingConfig signingConfigs.release" + contents.slice(lineIdx + oldSigningLine.length);
      }
    }

    config.modResults.contents = contents;
    console.log("✅ release-signing-plugin: signingConfigs.release iniettato in android/app/build.gradle");
    return config;
  });
}

module.exports = function withReleaseSigning(config) {
  config = withReleaseKeystoreCopy(config);
  config = withReleaseSigningGradle(config);
  return config;
};
