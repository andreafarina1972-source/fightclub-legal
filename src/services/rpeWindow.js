// src/services/rpeWindow.js
//
// sRPE (BRIEF-srpe.md) — finestra di raccolta condivisa fra i percorsi che
// possono chiedere/mostrare l'RPE di una sessione: notifica differita e
// scansione in-app (RpePromptModal.js), azione manuale "Aggiungi RPE" nello
// Storico (HistoryScreen.js). Unica definizione per evitare due soglie che
// potrebbero disallinearsi.
//
// Oltre questa finestra dalla fine sessione, il ricordo dell'intensità non è
// più affidabile (brief): meglio nessun dato che uno inventato a posteriori.
export const RPE_WINDOW_HOURS = 24;

export function isWithinRpeWindow(session) {
  const ms = Date.parse(session?.date || "");
  if (!Number.isFinite(ms)) return false;
  return Date.now() - ms <= RPE_WINDOW_HOURS * 3600 * 1000;
}
