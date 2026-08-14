// src/services/rpeNotifications.js
//
// sRPE (BRIEF-srpe.md, Fase 2) — percorso primario di raccolta: notifica
// locale a +25 minuti dalla fine sessione (Foster: 20-30 min, il ricordo
// dell'ultimo esercizio distorce verso l'alto se chiesto subito). Toccando
// la notifica si apre direttamente la richiesta (vedi RpePromptModal.js),
// senza passare dalla home.
//
// Se le notifiche sono negate o il modulo non è disponibile (es. Expo Go),
// degrada SEMPRE silenziosamente: nessun errore, il percorso secondario
// (scansione in-app nelle 24h, in RpePromptModal.js) copre comunque quelle
// sessioni finché la finestra di 24h non scade.

import { t } from "../i18n";

// Lazy require: stesso pattern di ProContext.js/HistoryScreen.js per
// moduli nativi opzionali — non deve mai far crashare l'app se il modulo
// non è linkato (Expo Go non supporta le notifiche locali da SDK 53+).
function getNotifications() {
  try { return require("expo-notifications"); }
  catch { return null; }
}

const RPE_DELAY_MIN = 25; // Foster, vedi brief — non configurabile qui
const CHANNEL_ID = "rpe-prompt";
const DATA_KIND = "rpe_prompt";

let configured = false;

// Da chiamare una volta all'avvio (App.js). Canale Android richiesto da
// Android 8+ per una notifica visibile con l'importanza giusta — senza,
// la notifica può comunque partire ma su un canale generico non garantito.
export async function configureRpeNotifications() {
  if (configured) return;
  const Notifications = getNotifications();
  if (!Notifications) return;
  configured = true;

  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: t("rpe.notifChannel") || "Richiesta sforzo percepito",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch {
    // silenzioso per costruzione — vedi commento in testa al file
  }
}

// Richiede il permesso solo qui, la prima volta che serve davvero (mai
// all'avvio dell'app, prima che l'atleta capisca perché). Non ripropone
// se già negato in modo permanente (canAskAgain: false) — OS-level, non
// serve gestirlo esplicitamente oltre a non richiamare requestPermissionsAsync.
async function ensurePermission(Notifications) {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === "granted") return true;
    if (current.status === "denied" && current.canAskAgain === false) return false;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.status === "granted";
  } catch {
    return false;
  }
}

/**
 * Pianifica la richiesta RPE per `session` a +25 minuti da session.date
 * (timestamp di fine/salvataggio — tutte le schermate che chiamano
 * addSession lo scrivono lì, vedi HistoryContext.js). Fire-and-forget:
 * il chiamante (addSession) non deve mai attendere né gestire un fallimento
 * qui — qualunque errore o permesso negato si traduce in "nessuna notifica",
 * mai in un'eccezione propagata.
 *
 * Restituisce l'identifier della notifica pianificata (stringa), o null se
 * non è stata pianificata per qualunque motivo. Il chiamante lo persiste su
 * session.rpeNotificationId (vedi HistoryContext.js) così una cancellazione
 * successiva (RPE raccolto o richiesta ignorata) può essere esplicita —
 * vedi cancelRpeNotification sotto.
 */
export async function scheduleRpeNotification(session) {
  const Notifications = getNotifications();
  if (!Notifications || !session?.id) return null;

  try {
    await configureRpeNotifications();
    const granted = await ensurePermission(Notifications);
    if (!granted) return null;

    const sessionEndMs = Date.parse(session.date || "");
    if (!Number.isFinite(sessionEndMs)) return null;

    const triggerMs = sessionEndMs + RPE_DELAY_MIN * 60000;
    const secondsFromNow = Math.round((triggerMs - Date.now()) / 1000);
    // Già scaduto (non dovrebbe succedere: si schedula subito dopo
    // addSession) — il percorso in-app resta comunque disponibile finché
    // non si superano le 24h dalla fine sessione.
    if (secondsFromNow <= 0) return null;

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: t("rpe.notifTitle") || "Quanto è stata impegnativa?",
        body: t("rpe.notifBody") || "Un tap per registrare lo sforzo della sessione appena conclusa.",
        data: { sessionId: session.id.toString(), kind: DATA_KIND },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsFromNow,
        channelId: CHANNEL_ID,
      },
    });
    return notificationId ?? null;
  } catch {
    // silenzioso per costruzione — vedi commento in testa al file
    return null;
  }
}

/**
 * Cancella una notifica RPE già pianificata, dato l'identifier restituito
 * da scheduleRpeNotification (session.rpeNotificationId). Chiamata quando
 * l'RPE è stato raccolto (setSessionRpe) o la richiesta è stata ignorata
 * esplicitamente (markRpePrompted/"Salta") — senza, la notifica arriverebbe
 * comunque a chiedere lo sforzo di una sessione già valutata o già rifiutata.
 * Fire-and-forget e silenziosa per costruzione: se la notifica è già
 * scattata (identifier non più valido) o il modulo non è disponibile, non
 * c'è nulla da fare — non un errore.
 */
export async function cancelRpeNotification(notificationId) {
  const Notifications = getNotifications();
  if (!Notifications || !notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // silenzioso per costruzione — vedi commento in testa al file
  }
}

// Tap su una notifica RPE mentre l'app è già in esecuzione (foreground o
// background, non cold start — per quello vedi getInitialRpeNotificationSessionId
// sotto). Restituisce una funzione di cleanup per l'useEffect chiamante.
export function subscribeRpeNotificationResponse(onSessionId) {
  const Notifications = getNotifications();
  if (!Notifications) return () => {};

  let sub;
  try {
    sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data;
      if (data?.kind === DATA_KIND && data?.sessionId) onSessionId(data.sessionId);
    });
  } catch {
    return () => {};
  }
  return () => { try { sub?.remove(); } catch {} };
}

// Cold start: l'app era chiusa ed è stata aperta toccando la notifica —
// il listener sopra non lo cattura (non è ancora sottoscritto in tempo),
// va controllato esplicitamente una volta all'avvio.
export async function getInitialRpeNotificationSessionId() {
  const Notifications = getNotifications();
  if (!Notifications) return null;
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    const data = response?.notification?.request?.content?.data;
    if (data?.kind === DATA_KIND && data?.sessionId) return data.sessionId;
  } catch {}
  return null;
}
