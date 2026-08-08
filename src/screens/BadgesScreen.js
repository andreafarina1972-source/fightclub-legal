// src/screens/BadgesScreen.js
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHistoryData } from "../context/HistoryContext";
import { computeBadges, computeStats, BADGE_DEFINITIONS } from "../services/badgeEngine";
import ProGate from "../components/ProGate";
import { t } from "../i18n";

// ─────────────────────────────────────────────────────────
// BARRA DI PROGRESSO
// ─────────────────────────────────────────────────────────
function ProgressBar({ value, color }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <View style={pbStyles.track}>
      <View style={[pbStyles.fill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}
const pbStyles = StyleSheet.create({
  track: { height: 4, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 99, overflow: "hidden", marginTop: 6 },
  fill:  { height: "100%", borderRadius: 99 },
});

// ─────────────────────────────────────────────────────────
// SINGOLO BADGE
// ─────────────────────────────────────────────────────────
const TIER_COLORS = {
  1: "#8E8E99",   // grigio — bronzo
  2: "#2D9CDB",   // blu — argento
  3: "#FF9500",   // arancio — oro
  4: "#FF4D6D",   // rosso — leggendario
};

function BadgeCard({ badge }) {
  const { unlocked, icon, label, desc, progress, progressLabel, tier } = badge;
  const color = unlocked ? (TIER_COLORS[tier] || "#37E293") : "#333";
  const textColor = unlocked ? "#fff" : "rgba(255,255,255,0.35)";

  return (
    <View style={[cardStyles.card, unlocked && cardStyles.cardUnlocked, { borderColor: unlocked ? color + "44" : "rgba(255,255,255,0.06)" }]}>
      <Text style={[cardStyles.icon, !unlocked && cardStyles.iconLocked]}>{icon}</Text>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[cardStyles.label, { color: textColor }]}>{label}</Text>
        <Text style={cardStyles.desc}>{desc}</Text>
        {!unlocked && (
          <>
            <ProgressBar value={progress} color={TIER_COLORS[tier] || "#37E293"} />
            <Text style={cardStyles.progressLabel}>{progressLabel}</Text>
          </>
        )}
      </View>
      {unlocked && (
        <View style={[cardStyles.check, { borderColor: color }]}>
          <Text style={[cardStyles.checkText, { color }]}>✓</Text>
        </View>
      )}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#0D0D14",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  cardUnlocked: { backgroundColor: "#0F1018" },
  icon:       { fontSize: 30, opacity: 0.35 },
  iconLocked: { opacity: 0.2 },
  label:      { fontSize: 14, fontWeight: "800" },
  desc:       { fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 16 },
  progressLabel: { fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: "600", marginTop: 2 },
  check:      { width: 26, height: 26, borderRadius: 99, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  checkText:  { fontSize: 13, fontWeight: "900" },
});

// ─────────────────────────────────────────────────────────
// BANNER STREAK
// ─────────────────────────────────────────────────────────
function StreakBanner({ currentStreak, longestStreak }) {
  if (currentStreak === 0) {
    return (
      <View style={streakStyles.card}>
        <Text style={streakStyles.icon}>❄️</Text>
        <View>
          <Text style={streakStyles.label}>{t("badges.noStreak") || "Nessuno streak attivo"}</Text>
          <Text style={streakStyles.sub}>{t("badges.noStreakSub") || "Allena oggi per iniziare!"}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={[streakStyles.card, { borderColor: "rgba(255,149,0,0.3)" }]}>
      <Text style={streakStyles.icon}>🔥</Text>
      <View style={{ flex: 1 }}>
        <Text style={streakStyles.label}>
          <Text style={streakStyles.value}>{currentStreak}</Text>
          {" "}{t("badges.streakDays") || "giorni consecutivi"}
        </Text>
        <Text style={streakStyles.sub}>{t("badges.streakRecord", { n: longestStreak }) || `Record personale: ${longestStreak} giorni`}</Text>
      </View>
    </View>
  );
}

const streakStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#0D0D14",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 16,
  },
  icon:  { fontSize: 32 },
  label: { color: "#fff", fontSize: 15, fontWeight: "700" },
  value: { color: "#FF9500", fontSize: 22, fontWeight: "900" },
  sub:   { color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 2 },
});

// ─────────────────────────────────────────────────────────
// KPI RAPIDI
// ─────────────────────────────────────────────────────────
function StatPill({ label, value }) {
  return (
    <View style={pillStyles.pill}>
      <Text style={pillStyles.value}>{value}</Text>
      <Text style={pillStyles.label}>{label}</Text>
    </View>
  );
}

const pillStyles = StyleSheet.create({
  pill:  { flex: 1, backgroundColor: "#0D0D14", borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 12, alignItems: "center", gap: 2 },
  value: { color: "#37E293", fontSize: 20, fontWeight: "900" },
  label: { color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: "600", textAlign: "center" },
});

// ─────────────────────────────────────────────────────────
// SCHERMATA PRINCIPALE
// ─────────────────────────────────────────────────────────
export default function BadgesScreen() {
  const { sessions, vo2Measurements } = useHistoryData();
  const [activeCategory, setActiveCategory] = useState("all");

  const CATEGORIES = [
    { key: "all",      label: t("badges.cat.all") || "Tutti" },
    { key: "punches",  label: t("badges.cat.punches") || "Colpi" },
    { key: "streak",   label: t("badges.cat.streak") || "Streak" },
    { key: "vo2",      label: t("badges.cat.vo2") || "VO2max" },
    { key: "sessions", label: t("badges.cat.sessions") || "Sessioni" },
    { key: "running",  label: t("badges.cat.running") || "Running" },
    { key: "score",    label: t("badges.cat.score") || "Fight Score" },
  ];

  const badges = useMemo(
    () => computeBadges(sessions, vo2Measurements),
    [sessions, vo2Measurements]
  );

  const stats = useMemo(
    () => computeStats(sessions, vo2Measurements),
    [sessions, vo2Measurements]
  );

  // Ordine: prima sbloccati, poi per progress desc
  const filtered = useMemo(() => {
    const list = activeCategory === "all"
      ? badges
      : badges.filter((b) => b.category === activeCategory);
    return [...list].sort((a, b) => {
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
      return b.progress - a.progress;
    });
  }, [badges, activeCategory]);

  const unlockedCount = badges.filter((b) => b.unlocked).length;
  const totalCount    = badges.length;

  return (
    <ProGate title={t("badges.title") || "Badge"} fullscreen>
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* HEADER */}
        <Text style={styles.title}>{t("badges.title") || "Badge e Progressi"}</Text>
        <Text style={styles.sub}>{unlockedCount} / {totalCount} {t("badges.unlockedCount") || "badge sbloccati"}</Text>

        {/* BARRA GLOBALE */}
        <View style={styles.globalBarWrap}>
          <View style={styles.globalBarTrack}>
            <View style={[styles.globalBarFill, { width: `${Math.round(unlockedCount / totalCount * 100)}%` }]} />
          </View>
          <Text style={styles.globalBarLabel}>{Math.round(unlockedCount / totalCount * 100)}%</Text>
        </View>

        {/* STREAK BANNER */}
        <StreakBanner
          currentStreak={stats.currentStreak}
          longestStreak={stats.longestStreak}
        />

        {/* KPI RAPIDI */}
        <View style={styles.pillRow}>
          <StatPill label={t("badges.statPunches") || "Colpi totali"}  value={stats.totalPunches.toLocaleString()} />
          <StatPill label={t("badges.statSessions") || "Sessioni"}      value={stats.totalSessions} />
          <StatPill label={t("badges.statKm") || "km corsa"}      value={stats.totalRunningKm.toFixed(0)} />
          <StatPill label={t("badges.statVo2") || "VO2max"}        value={stats.maxVo2 > 0 ? stats.maxVo2 : "--"} />
        </View>

        {/* FILTRO CATEGORIA */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
          <View style={styles.catRow}>
            {CATEGORIES.map((cat) => {
              const count = cat.key === "all"
                ? badges.filter((b) => b.unlocked).length
                : badges.filter((b) => b.category === cat.key && b.unlocked).length;
              const total = cat.key === "all"
                ? badges.length
                : badges.filter((b) => b.category === cat.key).length;
              const active = activeCategory === cat.key;
              return (
                <Pressable
                  key={cat.key}
                  style={[styles.catBtn, active && styles.catBtnActive]}
                  onPress={() => setActiveCategory(cat.key)}
                >
                  <Text style={[styles.catLabel, active && styles.catLabelActive]}>
                    {cat.label}
                  </Text>
                  <Text style={[styles.catCount, active && styles.catCountActive]}>
                    {count}/{total}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {/* LISTA BADGE */}
        {filtered.length === 0 ? (
          <Text style={styles.empty}>{t("badges.emptyCategory") || "Nessun badge in questa categoria."}</Text>
        ) : (
          <View style={styles.badgeList}>
            {filtered.map((b) => (
              <BadgeCard key={b.id} badge={b} />
            ))}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
    </ProGate>
  );
}

const styles = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: "#050508" },
  scroll: { padding: 16, gap: 14, paddingBottom: 40 },
  title: { color: "#fff", fontSize: 24, fontWeight: "900" },
  sub:   { color: "rgba(255,255,255,0.45)", fontSize: 14, fontWeight: "600", marginTop: -8 },

  globalBarWrap:  { flexDirection: "row", alignItems: "center", gap: 10 },
  globalBarTrack: { flex: 1, height: 6, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 99, overflow: "hidden" },
  globalBarFill:  { height: "100%", backgroundColor: "#37E293", borderRadius: 99 },
  globalBarLabel: { color: "#37E293", fontSize: 13, fontWeight: "800", width: 36, textAlign: "right" },

  pillRow: { flexDirection: "row", gap: 8 },

  catScroll: { marginHorizontal: -16 },
  catRow:    { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
  catBtn:    { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", alignItems: "center", gap: 2 },
  catBtnActive: { backgroundColor: "rgba(55,226,147,0.1)", borderColor: "rgba(55,226,147,0.35)" },
  catLabel:  { color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: "700" },
  catLabelActive: { color: "#37E293" },
  catCount:  { color: "rgba(255,255,255,0.3)", fontSize: 11, fontWeight: "600" },
  catCountActive: { color: "rgba(55,226,147,0.7)" },

  badgeList: { gap: 10 },
  empty:     { color: "rgba(255,255,255,0.3)", textAlign: "center", paddingVertical: 24, fontSize: 14 },
});