// src/screens/AthleteProfileScreen.js
//
// Profilo atleta esteso — dati inseriti una volta che potenziano l'AI Coach.

import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView,
  Pressable, TextInput, Alert, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  loadAthleteProfile, saveAthleteProfile,
  WEIGHT_CATEGORIES, GUARD_TYPES, LEVELS,
  translateWeightCategory, translateGuard, translateLevel,
} from "../services/athleteProfile";
import { t } from "../i18n";

// ─── Selettore a chip orizzontale ────────────────────────
// `translateLabel` traduce SOLO il testo mostrato: il valore salvato/confrontato
// (opt) resta sempre la stringa italiana canonica delle costanti in athleteProfile.js.
function ChipSelect({ label, options, value, onSelect, translateLabel }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          {options.map((opt) => {
            const active = value === opt;
            return (
              <Pressable
                key={opt}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => onSelect(active ? null : opt)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {translateLabel ? translateLabel(opt) : opt}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Conversione data: storage interno ISO (YYYY-MM-DD) <-> display gg/mm/aaaa ──
// (computePeriodization usa new Date(nextMatchDate): richiede ISO per un parsing affidabile)
function isoToDisplay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function displayToIso(display) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display || "");
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const day = Number(dd), month = Number(mm);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return `${yyyy}-${mm}-${dd}`;
}

// Auto-inserisce le barre mentre l'utente digita (ddmmyyyy -> gg/mm/aaaa)
function formatDateTyping(raw) {
  const digits = raw.replace(/[^0-9]/g, "").slice(0, 8);
  if (digits.length > 4) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return digits;
}

// ─── Campo data gg/mm/aaaa ────────────────────────────────
function DateField({ value, onChangeIso }) {
  const [display, setDisplay] = useState(() => isoToDisplay(value));

  useEffect(() => {
    setDisplay(isoToDisplay(value));
  }, [value]);

  return (
    <TextInput
      value={display}
      onChangeText={(t) => {
        const formatted = formatDateTyping(t);
        setDisplay(formatted);
        if (formatted.length === 10) {
          onChangeIso(displayToIso(formatted));
        } else if (formatted.length === 0) {
          onChangeIso(null);
        }
      }}
      placeholder="15/09/2026"
      placeholderTextColor="#555"
      style={styles.dateInput}
      keyboardType="number-pad"
      maxLength={10}
    />
  );
}

// ─── Campo numerico ──────────────────────────────────────
function NumberField({ label, value, onChange, placeholder, suffix }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.numRow}>
        <TextInput
          value={value != null ? String(value) : ""}
          onChangeText={(t) => {
            const cleaned = t.replace(/[^0-9]/g, "");
            onChange(cleaned === "" ? null : Number(cleaned));
          }}
          placeholder={placeholder}
          placeholderTextColor="#555"
          keyboardType="number-pad"
          style={styles.numInput}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

export default function AthleteProfileScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAthleteProfile().then((p) => {
      // Scarta valori di nextMatchDate non ISO (es. residui di input pre-formattazione)
      const validDate = typeof p.nextMatchDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.nextMatchDate);
      setProfile(validDate ? p : { ...p, nextMatchDate: null });
    });
  }, []);

  if (!profile) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <Text style={styles.loading}>{t("athleteProfile.loading") || "Caricamento…"}</Text>
      </SafeAreaView>
    );
  }

  const set = (key) => (val) => setProfile((p) => ({ ...p, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAthleteProfile(profile);
      Alert.alert(
        t("athleteProfile.savedAlertTitle") || "Salvato",
        t("athleteProfile.savedAlertBody") || "Profilo atleta aggiornato. L'AI Coach ne terrà conto nel prossimo piano.",
      );
      navigation?.goBack?.();
    } catch {
      Alert.alert(
        t("athleteProfile.errorAlertTitle") || "Errore",
        t("athleteProfile.errorAlertBody") || "Impossibile salvare il profilo.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{t("athleteProfile.title") || "Profilo Atleta"}</Text>
        <Text style={styles.sub}>
          {t("athleteProfile.subtitle") || "Questi dati vengono inseriti una volta e trasformano la qualità del piano AI."}
        </Text>

        {/* Categoria peso */}
        <View style={styles.card}>
          <ChipSelect
            label={t("athleteProfile.weightCategoryLabel") || "Categoria di peso"}
            options={WEIGHT_CATEGORIES}
            value={profile.weightCategory}
            onSelect={set("weightCategory")}
            translateLabel={translateWeightCategory}
          />
        </View>

        {/* Guardia */}
        <View style={styles.card}>
          <ChipSelect
            label={t("athleteProfile.guardLabel") || "Guardia"}
            options={GUARD_TYPES}
            value={profile.guard}
            onSelect={set("guard")}
            translateLabel={translateGuard}
          />
        </View>

        {/* Livello */}
        <View style={styles.card}>
          <ChipSelect
            label={t("athleteProfile.levelLabel") || "Livello agonistico"}
            options={LEVELS}
            value={profile.level}
            onSelect={set("level")}
            translateLabel={translateLevel}
          />
        </View>

        {/* Esperienza + incontri */}
        <View style={styles.card}>
          <View style={styles.rowFields}>
            <View style={{ flex: 1 }}>
              <NumberField
                label={t("athleteProfile.yearsExperienceLabel") || "Anni di esperienza"}
                value={profile.yearsExperience}
                onChange={set("yearsExperience")}
                placeholder="0"
                suffix={t("athleteProfile.yearsSuffix") || "anni"}
              />
            </View>
            <View style={{ flex: 1 }}>
              <NumberField
                label={t("athleteProfile.fightsLabel") || "Incontri disputati"}
                value={profile.fights}
                onChange={set("fights")}
                placeholder="0"
                suffix={t("athleteProfile.fightsSuffix") || "match"}
              />
            </View>
          </View>
        </View>

        {/* Data prossimo match */}
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>{t("athleteProfile.nextMatchLabel") || "Data prossimo match (opzionale)"}</Text>
          <Text style={styles.hint}>
            {t("athleteProfile.nextMatchHint") || "Formato GG/MM/AAAA. Attiva la periodizzazione automatica (base → picco → taper)."}
          </Text>
          <DateField value={profile.nextMatchDate} onChangeIso={set("nextMatchDate")} />
        </View>

        {/* Obiettivo */}
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>{t("athleteProfile.goalLabel") || "Obiettivo (opzionale)"}</Text>
          <TextInput
            value={profile.goal || ""}
            onChangeText={(txt) => set("goal")(txt || null)}
            placeholder={t("athleteProfile.goalPlaceholder") || "Es. vincere i regionali, migliorare la resistenza…"}
            placeholderTextColor="#555"
            style={styles.goalInput}
            multiline
          />
        </View>

        <Pressable style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveBtnText}>
            {saving ? (t("athleteProfile.saveButtonSaving") || "Salvataggio…") : (t("athleteProfile.saveButtonIdle") || "Salva profilo")}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: "#050508" },
  scroll: { padding: 16, gap: 12, paddingBottom: 40 },
  loading:{ color: "#888", textAlign: "center", marginTop: 40 },
  title:  { color: "#fff", fontSize: 24, fontWeight: "900" },
  sub:    { color: "rgba(255,255,255,0.45)", fontSize: 13, marginTop: -6, marginBottom: 4, lineHeight: 18 },

  card:   { backgroundColor: "#0D0D14", borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 14, gap: 8 },
  fieldLabel: { color: "#fff", fontSize: 14, fontWeight: "700" },
  hint:   { color: "rgba(255,255,255,0.4)", fontSize: 11, lineHeight: 15 },

  chipRow:  { flexDirection: "row", gap: 8, paddingVertical: 2 },
  chip:     { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  chipActive: { backgroundColor: "rgba(55,226,147,0.14)", borderColor: "rgba(55,226,147,0.4)" },
  chipText:   { color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: "#37E293", fontWeight: "800" },

  rowFields: { flexDirection: "row", gap: 14 },
  numRow:   { flexDirection: "row", alignItems: "center", gap: 8 },
  numInput: { flex: 1, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 16, fontWeight: "700", paddingVertical: 10, paddingHorizontal: 12 },
  suffix:   { color: "rgba(255,255,255,0.4)", fontSize: 13, fontWeight: "600" },

  dateInput: { backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 16, fontWeight: "700", paddingVertical: 10, paddingHorizontal: 12, marginTop: 4 },
  goalInput: { backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 14, paddingVertical: 10, paddingHorizontal: 12, minHeight: 60, textAlignVertical: "top" },

  saveBtn: { backgroundColor: "#37E293", borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 6 },
  saveBtnText: { color: "#050508", fontSize: 16, fontWeight: "900" },
});
