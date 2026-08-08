// src/components/SessionShareCard.js
//
// Componente React Native che genera una share card grafica per una sessione,
// in stile "fight poster" UFC: scheda ufficiale con placca punteggio,
// tale-of-the-tape delle statistiche e sfondo personalizzabile (foto o GIF).
//
// Viene catturata con react-native-view-shot e condivisa via expo-sharing.
// NB: se lo sfondo è una GIF, nell'anteprima a schermo si anima normalmente,
// ma la card condivisa/esportata sarà sempre un PNG statico (singolo frame),
// perché la cattura di view-shot produce un'istantanea.
//
// Uso:
//   <SessionShareCard ref={cardRef} session={session} backgroundUri={bgUri} />
//   const uri = await captureRef(cardRef, { format: "png", quality: 1 });
//   await Share.share({ url: uri });   // iOS
//   await Sharing.shareAsync(uri);     // Android

import React, { forwardRef } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { scoreColor, scoreLabel } from "../services/fightScore";

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────
function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function fmt(v, decimals = 0) {
  const n = safeNum(v);
  return n === 0 ? "--" : n.toFixed(decimals);
}

function fmtTime(seconds) {
  const s = Math.round(safeNum(seconds));
  if (s <= 0) return "--";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}:${String(sec).padStart(2, "0")}`;
  return `${sec}s`;
}

function sessionDurationSec(session) {
  return (
    safeNum(session?.totalSeconds) ||
    safeNum(session?.elapsed) ||
    safeNum(session?.durationSeconds) ||
    safeNum(session?.totalMinutes) * 60
  );
}

function sessionType(session) {
  const t = (session?.type || "workout").toLowerCase();
  if (t === "running") return "running";
  return "boxing";
}

function shortDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return ""; }
}

// Zona HR dominante dalle hrZones
function dominantZone(session) {
  const zones = session?.hrZones || session?.zones || {};
  const training = zones?.training || {};
  let best = null, bestSec = 0;
  for (const [key, val] of Object.entries(training)) {
    const sec = safeNum(val);
    if (sec > bestSec) { bestSec = sec; best = key; }
  }
  const map = { z1: "Z1 Recupero", z2: "Z2 Aerobico", z3: "Z3 Soglia", z4: "Z4 Lattacido", z5: "Z5 Massimale" };
  return best ? (map[best] || best.toUpperCase()) : null;
}

// Calcola % tempo in ogni zona
function zonePercents(session) {
  const zones = session?.hrZones || session?.zones || {};
  const training = zones?.training || {};
  const elapsed = safeNum(zones?.elapsed) || sessionDurationSec(session);
  if (elapsed <= 0) return [];

  const order = ["z1", "z2", "z3", "z4", "z5"];
  // Palette "fight poster": dal blu freddo al rosso/oro incandescente
  const colors = { z1: "#2D9CDB", z2: "#37E293", z3: "#FFCA28", z4: "#FF9500", z5: "#FF2E3E" };
  const labels = { z1: "Z1", z2: "Z2", z3: "Z3", z4: "Z4", z5: "Z5" };

  return order
    .map((k) => ({ key: k, sec: safeNum(training[k]), color: colors[k], label: labels[k] }))
    .filter((z) => z.sec > 0)
    .map((z) => ({ ...z, pct: Math.round((z.sec / elapsed) * 100) }));
}

// ─────────────────────────────────────────────────────────
// BARRA ZONE (power meter)
// ─────────────────────────────────────────────────────────
function ZoneStrip({ zones }) {
  if (!zones || zones.length === 0) return null;
  return (
    <View style={zoneSt.track}>
      {zones.map((z) => (
        <View key={z.key} style={{ flex: z.pct, backgroundColor: z.color }} />
      ))}
    </View>
  );
}
const zoneSt = StyleSheet.create({
  track: {
    flexDirection: "row",
    height: 8,
    borderRadius: 99,
    overflow: "hidden",
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.35)",
  },
});

// ─────────────────────────────────────────────────────────
// RIGA "TALE OF THE TAPE"
// ─────────────────────────────────────────────────────────
function TapeRow({ label, value, unit, last }) {
  if (value == null) return null;
  return (
    <View style={[tapeSt.row, last && { borderBottomWidth: 0 }]}>
      <Text style={tapeSt.label}>{label}</Text>
      <View style={tapeSt.valueRow}>
        <Text style={tapeSt.value}>{value}</Text>
        {unit ? <Text style={tapeSt.unit}>{unit}</Text> : null}
      </View>
    </View>
  );
}
const tapeSt = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(212,175,55,0.18)",
  },
  label: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  valueRow: { flexDirection: "row", alignItems: "flex-end", gap: 3 },
  value: { color: "#fff", fontSize: 15, fontWeight: "900" },
  unit: { color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: "700", marginBottom: 1 },
});

// ─────────────────────────────────────────────────────────
// PLACCA PUNTEGGIO (medaglione centrale stile cintura)
// ─────────────────────────────────────────────────────────
function ScorePlate({ label, value, suffix, ratingLabel, color }) {
  return (
    <View style={plateSt.wrap}>
      <View style={[plateSt.outerRing, { borderColor: color }]}>
        <View style={plateSt.innerRing}>
          <Text style={plateSt.plateLabel}>{label}</Text>
          <View style={plateSt.valueRow}>
            <Text style={[plateSt.value, { color }]}>{value}</Text>
            {suffix ? <Text style={plateSt.suffix}>{suffix}</Text> : null}
          </View>
          {ratingLabel ? (
            <View style={[plateSt.ratingChip, { borderColor: color, backgroundColor: color + "22" }]}>
              <Text style={[plateSt.ratingText, { color }]}>{ratingLabel}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}
const PLATE_SIZE = 152;
const plateSt = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", marginVertical: 4 },
  outerRing: {
    width: PLATE_SIZE,
    height: PLATE_SIZE,
    borderRadius: PLATE_SIZE / 2,
    borderWidth: 3,
    backgroundColor: "rgba(8,8,14,0.75)",
    alignItems: "center",
    justifyContent: "center",
  },
  innerRing: {
    width: PLATE_SIZE - 16,
    height: PLATE_SIZE - 16,
    borderRadius: (PLATE_SIZE - 16) / 2,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.55)",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  plateLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  valueRow: { flexDirection: "row", alignItems: "flex-end", gap: 2 },
  value: { fontSize: 44, fontWeight: "900", letterSpacing: -1, lineHeight: 48 },
  suffix: { color: "rgba(255,255,255,0.35)", fontSize: 14, fontWeight: "800", marginBottom: 6 },
  ratingChip: {
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 99,
    borderWidth: 1,
  },
  ratingText: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
});

// ─────────────────────────────────────────────────────────
// CARD PRINCIPALE  (forwardRef per captureRef)
// ─────────────────────────────────────────────────────────
const CARD_W = 380; // larghezza fissa per il PNG

/**
 * @param {object} props
 *   session       - dati sessione
 *   backgroundUri - uri locale (file:// o content://) di un'immagine o GIF
 *                   scelta dall'utente da usare come sfondo della card.
 *                   Se assente, viene usato uno sfondo scuro con banda diagonale.
 */
const SessionShareCard = forwardRef(function SessionShareCard({ session, backgroundUri }, ref) {
  if (!session) return null;

  const type       = sessionType(session);
  const isRunning  = type === "running";
  const dur        = sessionDurationSec(session);
  const punches    = safeNum(session?.punches);
  const avgHr      = safeNum(session?.avgHr);
  const calories   = safeNum(session?.calories);
  const vo2        = safeNum(session?.vo2MaxEstimate || session?.latestVo2 || 0);
  const fs         = safeNum(session?.fightScorePeak);
  const distKm     = safeNum(session?.distanceM) / 1000;
  const avgPaceSec = safeNum(session?.avgPaceSecPerKm);
  const workoutName = session?.workoutName || session?.name || (isRunning ? "Running" : "Boxing");
  const date       = shortDate(session?.date || session?.createdAt);
  const zones      = zonePercents(session);
  const domZone    = dominantZone(session);

  function fmtPace(sec) {
    if (!sec || sec <= 0) return "--";
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  // ── Placca centrale: Fight Score per boxing, VO2max/distanza per running ──
  let plate = null;
  if (!isRunning && fs > 0) {
    const color = scoreColor(fs);
    plate = { label: "Fight Score", value: String(Math.round(fs)), suffix: "/100", ratingLabel: scoreLabel(fs), color };
  } else if (isRunning && vo2 > 0) {
    plate = { label: "VO2 Max stimato", value: vo2.toFixed(1), suffix: "ml/kg/min", ratingLabel: null, color: "#FF2E3E" };
  } else if (isRunning && distKm > 0) {
    plate = { label: "Distanza", value: distKm.toFixed(2), suffix: "km", ratingLabel: null, color: "#FF2E3E" };
  }

  return (
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

      {/* Cornici angolari stile poster */}
      <View style={cardSt.cornerTL} />
      <View style={cardSt.cornerBR} />

      {/* CONTENUTO */}
      <View style={cardSt.content}>
        {/* RIBBON SUPERIORE */}
        <View style={cardSt.topRibbon}>
          <View style={cardSt.officialBadge}>
            <Text style={cardSt.officialBadgeText}>SCHEDA UFFICIALE</Text>
          </View>
          <Text style={cardSt.brand}>FIGHTCLUB</Text>
        </View>

        {/* TITOLO EVENTO */}
        <View style={cardSt.titleBlock}>
          <Text style={cardSt.eventName} numberOfLines={2}>{workoutName}</Text>
          <View style={cardSt.metaRow}>
            <Text style={cardSt.metaDate}>{date}</Text>
            <View style={cardSt.metaDot} />
            <View style={[cardSt.typeChip, isRunning && cardSt.typeChipRunning]}>
              <Text style={[cardSt.typeChipText, isRunning && { color: "#2D9CDB" }]}>
                {isRunning ? "🏃 RUNNING" : "🥊 BOXING"}
              </Text>
            </View>
          </View>
        </View>

        {/* PLACCA PUNTEGGIO */}
        {plate && (
          <ScorePlate
            label={plate.label}
            value={plate.value}
            suffix={plate.suffix}
            ratingLabel={plate.ratingLabel}
            color={plate.color}
          />
        )}

        {/* TALE OF THE TAPE */}
        <View style={cardSt.tape}>
          <Text style={cardSt.tapeTitle}>TALE OF THE TAPE</Text>
          <TapeRow label="Durata" value={fmtTime(dur)} />
          {isRunning ? (
            <>
              <TapeRow label="Distanza" value={distKm > 0 ? distKm.toFixed(2) : "--"} unit="km" />
              <TapeRow label="Pace media" value={fmtPace(avgPaceSec)} unit="min/km" />
            </>
          ) : (
            <>
              <TapeRow label="Colpi totali" value={punches > 0 ? punches.toLocaleString("it-IT") : "--"} />
              <TapeRow label="Calorie" value={fmt(calories)} unit="kcal" />
            </>
          )}
          {avgHr > 0 && <TapeRow label="FC media" value={Math.round(avgHr)} unit="bpm" />}
          {isRunning && vo2 > 0 && <TapeRow label="VO2 Max" value={vo2.toFixed(1)} unit="ml/kg/min" />}
          {domZone && <TapeRow label="Zona dominante" value={domZone} last />}
        </View>

        {/* BARRA ZONE HR */}
        {zones.length > 0 && (
          <View style={cardSt.zonesWrap}>
            <Text style={cardSt.zonesTitle}>Zone cardio</Text>
            <ZoneStrip zones={zones} />
            <View style={cardSt.zonesLegend}>
              {zones.map((z) => (
                <View key={z.key} style={cardSt.zoneLegendItem}>
                  <View style={[cardSt.zoneDot, { backgroundColor: z.color }]} />
                  <Text style={cardSt.zoneLegendText}>{z.label} {z.pct}%</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* FOOTER: banda promoter */}
      <View style={cardSt.footerBand}>
        <Text style={cardSt.footerText}>FIGHTCLUB.APP</Text>
        <Text style={cardSt.footerHash}>#FightScore #Boxing #Training</Text>
      </View>
    </View>
  );
});

export default SessionShareCard;

// ─────────────────────────────────────────────────────────
// STILI CARD
// ─────────────────────────────────────────────────────────
const cardSt = StyleSheet.create({
  card: {
    backgroundColor: "#050508",
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(212,175,55,0.45)",
  },

  // Fallback (nessuno sfondo utente): nero + bande diagonali rosse in stile poster
  fallbackBg: { backgroundColor: "#0A0A0F" },
  diagonalBandA: {
    position: "absolute",
    width: "180%",
    height: 90,
    backgroundColor: "rgba(255,46,62,0.10)",
    top: -20,
    left: -60,
    transform: [{ rotate: "-8deg" }],
  },
  diagonalBandB: {
    position: "absolute",
    width: "180%",
    height: 60,
    backgroundColor: "rgba(212,175,55,0.06)",
    bottom: 40,
    left: -80,
    transform: [{ rotate: "-8deg" }],
  },

  // Overlay per leggibilità sopra qualsiasi sfondo (foto o GIF)
  overlayTop: { backgroundColor: "rgba(4,4,8,0.55)" },
  overlayBottom: {
    top: "45%",
    backgroundColor: "rgba(2,2,6,0.35)",
  },

  cornerTL: {
    position: "absolute",
    top: 0, left: 0,
    width: 0, height: 0,
    borderTopWidth: 46,
    borderRightWidth: 46,
    borderTopColor: "rgba(255,46,62,0.85)",
    borderRightColor: "transparent",
  },
  cornerBR: {
    position: "absolute",
    bottom: 0, right: 0,
    width: 0, height: 0,
    borderBottomWidth: 34,
    borderLeftWidth: 34,
    borderBottomColor: "rgba(212,175,55,0.75)",
    borderLeftColor: "transparent",
  },

  content: { padding: 22, paddingTop: 24, gap: 14 },

  topRibbon: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  officialBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: "rgba(255,46,62,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,46,62,0.55)",
  },
  officialBadgeText: {
    color: "#FF6B78",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  brand: {
    color: "#D4AF37",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 2,
    fontStyle: "italic",
  },

  titleBlock: { gap: 6, alignItems: "center" },
  eventName: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.4,
    textTransform: "uppercase",
    textAlign: "center",
    fontStyle: "italic",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  metaDate: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "700" },
  metaDot: { width: 3, height: 3, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.3)" },
  typeChip: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 99,
    backgroundColor: "rgba(255,46,62,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,46,62,0.4)",
  },
  typeChipRunning: {
    backgroundColor: "rgba(45,156,219,0.15)",
    borderColor: "rgba(45,156,219,0.4)",
  },
  typeChipText: { color: "#FF6B78", fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },

  tape: {
    backgroundColor: "rgba(6,6,10,0.55)",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.3)",
  },
  tapeTitle: {
    color: "#D4AF37",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
    marginBottom: 6,
  },

  zonesWrap: { gap: 8 },
  zonesTitle: { color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8 },
  zonesLegend: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  zoneLegendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  zoneDot: { width: 7, height: 7, borderRadius: 99 },
  zoneLegendText: { color: "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: "700" },

  footerBand: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 22,
    backgroundColor: "rgba(255,46,62,0.9)",
  },
  footerText: { color: "#fff", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  footerHash: { color: "rgba(255,255,255,0.85)", fontSize: 9, fontWeight: "700" },
});
