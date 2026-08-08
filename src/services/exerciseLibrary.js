// src/services/exerciseLibrary.js
//
// Libreria di esercizi REALI per la preparazione atletica del pugile.
// L'AI Coach seleziona da questa libreria e dosa serie/ripetizioni/recupero
// in base a livello, readiness e fase. La UI arricchisce ogni esercizio
// con esecuzione corretta e cue tecnici presi da qui.
//
// Categorie:
//   strength      - forza / pesi
//   plyometrics   - pliometria / potenza
//   coreStability - core stability (anti-rotazione, anti-estensione, bracing)
//   core          - core forza / resistenza
//   running       - corsa / roadwork
//   conditioning  - condizionamento metabolico
//   boxing        - pugilato tecnico / specifico
//
// unit:  "reps" (ripetizioni) | "time" (durata)
// tempo: notazione eccentrica-isometrica-concentrica (es. "3-1-1") o "explosive" | "slow"

import { EXERCISE_TRANSLATIONS, CATEGORY_LABELS_I18N } from "./exerciseLibraryTranslations";
import { getLanguage } from "../i18n";

export const EXERCISE_LIBRARY = {
  // ══════════════════════════════════════════════════════════
  // FORZA / PESI
  // ══════════════════════════════════════════════════════════
  strength: [
    { id: "back_squat", name: "Back Squat", unit: "reps", tempo: "3-1-1",
      cues: "Schiena neutra, ginocchia in linea coi piedi, scendi sotto il parallelo, spingi coi talloni.",
      levels: ["intermedio", "avanzato"] },
    { id: "front_squat", name: "Front Squat", unit: "reps", tempo: "3-1-1",
      cues: "Gomiti alti, busto eretto, core attivo. Forza specifica e postura di guardia.",
      levels: ["avanzato"] },
    { id: "goblet_squat", name: "Goblet Squat", unit: "reps", tempo: "3-1-1",
      cues: "Manubrio al petto, busto eretto, scendi controllato. Ideale per imparare lo schema.",
      levels: ["principiante", "intermedio"] },
    { id: "bulgarian_split", name: "Bulgarian split squat", unit: "reps", tempo: "3-1-1",
      cues: "Piede posteriore su panca, scendi verticale, spingi col tallone anteriore. Forza monopodalica.",
      levels: ["intermedio", "avanzato"] },
    { id: "deadlift", name: "Stacco da terra", unit: "reps", tempo: "2-1-2",
      cues: "Bilanciere vicino alle tibie, schiena neutra, spingi il pavimento, blocca anche e ginocchia insieme.",
      levels: ["intermedio", "avanzato"] },
    { id: "romanian_dl", name: "Stacco rumeno (RDL)", unit: "reps", tempo: "3-1-1",
      cues: "Anca indietro, gambe quasi tese, senti l'allungamento dei femorali, schiena neutra.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "trap_bar_dl", name: "Stacco con trap bar", unit: "reps", tempo: "2-1-2",
      cues: "Posizione neutra delle mani, meno stress lombare. Ottimo per la forza generale.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "single_leg_dl", name: "Stacco monopodalico", unit: "reps", tempo: "3-1-1",
      cues: "Su una gamba, anca indietro, bacino stabile. Equilibrio e catena posteriore.",
      levels: ["intermedio", "avanzato"] },
    { id: "bench_press", name: "Panca piana", unit: "reps", tempo: "2-1-1",
      cues: "Scapole retratte, piedi a terra, discesa controllata al petto, spinta esplosiva.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "incline_bench", name: "Panca inclinata", unit: "reps", tempo: "2-1-1",
      cues: "Inclinazione 30-45 gradi, discesa alla clavicola. Enfasi su spalle e alto pettorale.",
      levels: ["intermedio", "avanzato"] },
    { id: "db_press", name: "Distensioni manubri", unit: "reps", tempo: "2-1-1",
      cues: "Controllo in discesa, spinta piena. Coinvolge i stabilizzatori.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "floor_press", name: "Floor press", unit: "reps", tempo: "2-1-1",
      cues: "A terra, gomiti toccano il pavimento, spinta. Forza di spinta nel range del colpo.",
      levels: ["intermedio", "avanzato"] },
    { id: "overhead_press", name: "Military press", unit: "reps", tempo: "2-1-1",
      cues: "Core e glutei contratti, bilanciere sopra la testa, non inarcare la schiena.",
      levels: ["intermedio", "avanzato"] },
    { id: "push_press", name: "Push press", unit: "reps", tempo: "explosive",
      cues: "Slancio di gambe + spinta sopra la testa. Trasferisce potenza dal basso verso l'alto.",
      levels: ["avanzato"] },
    { id: "landmine_press", name: "Landmine press", unit: "reps", tempo: "2-0-1",
      cues: "Bilanciere ad angolo, spinta diagonale con rotazione del busto. Molto specifico per il diretto.",
      levels: ["intermedio", "avanzato"] },
    { id: "pull_up", name: "Trazioni alla sbarra", unit: "reps", tempo: "2-1-2",
      cues: "Presa prona, scapole depresse, mento sopra la sbarra, discesa controllata.",
      levels: ["intermedio", "avanzato"] },
    { id: "lat_pulldown", name: "Lat machine", unit: "reps", tempo: "2-1-2",
      cues: "Tira verso il petto, scapole basse, non dondolare. Alternativa alle trazioni.",
      levels: ["principiante", "intermedio"] },
    { id: "barbell_row", name: "Rematore con bilanciere", unit: "reps", tempo: "2-1-2",
      cues: "Busto a 45 gradi, tira verso l'ombelico, gomiti stretti, schiena neutra.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "db_row", name: "Rematore con manubrio", unit: "reps", tempo: "2-1-2",
      cues: "Un braccio alla volta, busto stabile, tira verso l'anca. Anti-rotazione implicita.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "face_pull", name: "Face pull", unit: "reps", tempo: "2-1-2",
      cues: "Cavo all'altezza del viso, gomiti alti, extraruota le spalle. Salute della spalla.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "walking_lunge", name: "Affondi camminati", unit: "reps", tempo: "2-0-2",
      cues: "Passo lungo, ginocchio posteriore verso terra, busto eretto, spinta col tallone anteriore.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "step_up", name: "Step up su box", unit: "reps", tempo: "2-0-2",
      cues: "Sali spingendo solo con la gamba sul box, discesa controllata. Forza unilaterale.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "hip_thrust", name: "Hip thrust", unit: "reps", tempo: "2-1-2",
      cues: "Spinta di anca, contrai i glutei in alto, mento verso il petto. Potenza di anca.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "nordic_curl", name: "Nordic hamstring curl", unit: "reps", tempo: "slow",
      cues: "Discesa lentissima resistendo, caviglie bloccate. Prevenzione infortuni femorali.",
      levels: ["intermedio", "avanzato"] },
    { id: "calf_raise", name: "Calf raise", unit: "reps", tempo: "2-1-2",
      cues: "Sali sulle punte con pausa in alto. Caviglie forti per il footwork.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "farmer_walk", name: "Farmer's walk", unit: "time",
      cues: "Cammina con carichi pesanti, spalle basse, core teso. Grip e stabilita' globale.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "neck_harness", name: "Lavoro di collo (neck)", unit: "reps", tempo: "slow",
      cues: "Flesso-estensioni controllate del collo con resistenza leggera. Fondamentale per incassare.",
      levels: ["intermedio", "avanzato"] },
    { id: "wrist_curl", name: "Wrist curl / estensori polso", unit: "reps", tempo: "2-1-2",
      cues: "Flesso-estensione del polso con carico leggero. Protegge i polsi dai colpi.",
      levels: ["principiante", "intermedio", "avanzato"] },
  ],

  // ══════════════════════════════════════════════════════════
  // PLIOMETRIA / POTENZA
  // ══════════════════════════════════════════════════════════
  plyometrics: [
    { id: "box_jump", name: "Box jump", unit: "reps", tempo: "explosive",
      cues: "Salto esplosivo sul box, atterraggio morbido con ginocchia flesse, scendi con controllo.",
      levels: ["intermedio", "avanzato"] },
    { id: "broad_jump", name: "Salto in lungo da fermo", unit: "reps", tempo: "explosive",
      cues: "Carica con anche e caviglie, proiettati in avanti, atterraggio ammortizzato.",
      levels: ["intermedio", "avanzato"] },
    { id: "depth_jump", name: "Depth jump", unit: "reps", tempo: "explosive",
      cues: "Scendi dal box, tocca terra e rimbalza subito verso l'alto. Minimo tempo di contatto.",
      levels: ["avanzato"] },
    { id: "cmj", name: "Counter movement jump", unit: "reps", tempo: "explosive",
      cues: "Contromovimento rapido e salto verticale massimale. Misura e allena la potenza.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "squat_jump", name: "Squat jump", unit: "reps", tempo: "explosive",
      cues: "Dallo squat, salto verticale massimale. Potenza degli arti inferiori.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "mb_slam", name: "Medicine ball slam", unit: "reps", tempo: "explosive",
      cues: "Palla sopra la testa, slam a terra con tutto il corpo. Potenza esplosiva del tronco.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "mb_rot_throw", name: "Lancio rotazionale med ball", unit: "reps", tempo: "explosive",
      cues: "Rotazione anca-tronco, lancio laterale contro il muro. Simula la potenza del gancio.",
      levels: ["intermedio", "avanzato"] },
    { id: "mb_chest_throw", name: "Chest pass esplosivo med ball", unit: "reps", tempo: "explosive",
      cues: "Spinta esplosiva dal petto contro il muro. Potenza del diretto.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "mb_overhead_throw", name: "Lancio sopra la testa med ball", unit: "reps", tempo: "explosive",
      cues: "Estensione totale del corpo, lancio in avanti. Catena cinetica completa.",
      levels: ["intermedio", "avanzato"] },
    { id: "clap_pushup", name: "Piegamenti pliometrici", unit: "reps", tempo: "explosive",
      cues: "Spinta esplosiva, stacca le mani da terra, atterraggio controllato. Potenza di spinta.",
      levels: ["avanzato"] },
    { id: "plyo_pushup_box", name: "Piegamenti pliometrici su box", unit: "reps", tempo: "explosive",
      cues: "Mani sul box, spinta esplosiva. Versione progressiva del clap push-up.",
      levels: ["intermedio", "avanzato"] },
    { id: "pogo_jumps", name: "Pogo jumps", unit: "reps", tempo: "explosive",
      cues: "Saltelli rigidi sulle caviglie, minimo tempo a terra, come una molla. Reattivita'.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "lateral_bound", name: "Balzi laterali", unit: "reps", tempo: "explosive",
      cues: "Spinta laterale su una gamba, atterra sull'altra e stabilizza. Footwork esplosivo.",
      levels: ["intermedio", "avanzato"] },
    { id: "skater_jump", name: "Skater jumps", unit: "reps", tempo: "explosive",
      cues: "Balzi laterali ampi alternati, come un pattinatore. Coordinazione e potenza laterale.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "tuck_jump", name: "Tuck jump", unit: "reps", tempo: "explosive",
      cues: "Salto verticale portando le ginocchia al petto. Potenza e core.",
      levels: ["intermedio", "avanzato"] },
    { id: "hurdle_hops", name: "Balzi sugli ostacoli", unit: "reps", tempo: "explosive",
      cues: "Superamento di ostacoli bassi in serie, contatti rapidi. Reattivita' e ritmo.",
      levels: ["intermedio", "avanzato"] },
    { id: "single_leg_hop", name: "Balzi monopodalici", unit: "reps", tempo: "explosive",
      cues: "Balzi su una gamba in avanti, atterraggio stabile. Forza reattiva unilaterale.",
      levels: ["avanzato"] },
    { id: "band_punch", name: "Colpi con elastico", unit: "reps", tempo: "explosive",
      cues: "Diretti e ganci contro resistenza elastica, massima velocita'. Potenza specifica del colpo.",
      levels: ["principiante", "intermedio", "avanzato"] },
  ],

  // ══════════════════════════════════════════════════════════
  // CORE STABILITY (anti-movimento, bracing)
  // ══════════════════════════════════════════════════════════
  coreStability: [
    { id: "pallof_press", name: "Pallof press", unit: "reps", tempo: "2-2-2",
      cues: "Cavo laterale, spingi avanti resistendo alla rotazione. Anti-rotazione pura, chiave per il pugile.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "pallof_iso", name: "Pallof press isometrico", unit: "time",
      cues: "Mantieni le braccia estese resistendo alla trazione laterale. Bracing sotto tensione.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "half_kneel_pallof", name: "Pallof in mezzo inginocchiato", unit: "reps", tempo: "2-2-2",
      cues: "In ginocchio su una gamba, resisti alla rotazione. Stabilita' del bacino e anti-rotazione.",
      levels: ["intermedio", "avanzato"] },
    { id: "dead_bug", name: "Dead bug", unit: "reps", tempo: "slow",
      cues: "Schiena a terra, estendi braccio e gamba opposti mantenendo la lombare aderente. Anti-estensione.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "dead_bug_band", name: "Dead bug con elastico", unit: "reps", tempo: "slow",
      cues: "Come il dead bug, con elastico che tira le braccia. Aumenta la richiesta anti-estensione.",
      levels: ["intermedio", "avanzato"] },
    { id: "bird_dog", name: "Bird dog", unit: "reps", tempo: "slow",
      cues: "Quadrupedia, estendi braccio e gamba opposti, bacino stabile. Coordinazione e stabilita'.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "plank", name: "Plank", unit: "time",
      cues: "Corpo in linea, addome e glutei contratti, non far cadere il bacino. Respira.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "rkc_plank", name: "RKC plank", unit: "time",
      cues: "Plank con massima contrazione volontaria di tutto il corpo per 10-20s. Bracing estremo.",
      levels: ["intermedio", "avanzato"] },
    { id: "side_plank", name: "Plank laterale", unit: "time",
      cues: "Corpo in linea sul fianco, anca alta, spalla sopra il gomito. Anti-flessione laterale.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "side_plank_reach", name: "Plank laterale con reach", unit: "reps", tempo: "slow",
      cues: "Dal plank laterale, passa il braccio sotto il corpo e torna. Anti-rotazione dinamica.",
      levels: ["intermedio", "avanzato"] },
    { id: "copenhagen_plank", name: "Copenhagen plank", unit: "time",
      cues: "Plank laterale con gamba superiore su panca. Adduttori e stabilita' del bacino.",
      levels: ["avanzato"] },
    { id: "suitcase_carry", name: "Suitcase carry", unit: "time",
      cues: "Cammina con un solo carico laterale, busto dritto senza inclinarti. Anti-flessione laterale.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "waiter_walk", name: "Waiter walk (overhead carry)", unit: "time",
      cues: "Cammina con peso sopra la testa a braccio teso. Stabilita' di spalla e core.",
      levels: ["intermedio", "avanzato"] },
    { id: "bear_crawl", name: "Bear crawl", unit: "time",
      cues: "Quadrupedia con ginocchia sollevate, avanza lentamente senza oscillare il bacino.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "stir_the_pot", name: "Stir the pot (fitball)", unit: "reps", tempo: "slow",
      cues: "Plank con avambracci sulla fitball, disegna cerchi lenti. Anti-estensione dinamica.",
      levels: ["intermedio", "avanzato"] },
    { id: "landmine_rotation", name: "Landmine rotation", unit: "reps", tempo: "2-0-2",
      cues: "Bilanciere ad angolo, ruota il busto controllando l'anca. Controllo rotazionale.",
      levels: ["intermedio", "avanzato"] },
    { id: "anti_rot_hold", name: "Anti-rotation hold con elastico", unit: "time",
      cues: "Braccia estese, resisti alla rotazione dell'elastico. Isometria anti-rotazione.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "tall_kneel_chop", name: "Chop in ginocchio", unit: "reps", tempo: "2-0-2",
      cues: "In ginocchio, taglio diagonale al cavo. Separazione tra bacino e torace.",
      levels: ["intermedio", "avanzato"] },
  ],

  // ══════════════════════════════════════════════════════════
  // CORE (forza / resistenza)
  // ══════════════════════════════════════════════════════════
  core: [
    { id: "hollow_hold", name: "Hollow hold", unit: "time",
      cues: "Zona lombare a terra, gambe e spalle sollevate, corpo a barca. Tensione totale.",
      levels: ["intermedio", "avanzato"] },
    { id: "hollow_rock", name: "Hollow rock", unit: "reps", tempo: "2-0-2",
      cues: "Dalla posizione hollow, dondola avanti e indietro mantenendo la forma.",
      levels: ["avanzato"] },
    { id: "russian_twist", name: "Russian twist", unit: "reps", tempo: "2-0-2",
      cues: "Busto inclinato, ruota il tronco lato-lato con controllo. Rotazione del core.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "hanging_leg", name: "Sollevamento gambe alla sbarra", unit: "reps", tempo: "2-1-2",
      cues: "Appeso, solleva le gambe tese o piegate senza dondolare. Controllo addominale.",
      levels: ["intermedio", "avanzato"] },
    { id: "hanging_knee", name: "Ginocchia al petto alla sbarra", unit: "reps", tempo: "2-1-2",
      cues: "Appeso, porta le ginocchia al petto controllando la discesa. Progressione del leg raise.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "toes_to_bar", name: "Toes to bar", unit: "reps", tempo: "explosive",
      cues: "Appeso, porta le punte alla sbarra. Forza e coordinazione addominale.",
      levels: ["avanzato"] },
    { id: "ab_wheel", name: "Ab wheel rollout", unit: "reps", tempo: "slow",
      cues: "Rullo in avanti mantenendo il core teso, non inarcare la schiena. Torna con controllo.",
      levels: ["avanzato"] },
    { id: "woodchopper", name: "Woodchopper al cavo", unit: "reps", tempo: "2-0-2",
      cues: "Taglio diagonale alto-basso ruotando il tronco. Potenza rotazionale specifica.",
      levels: ["intermedio", "avanzato"] },
    { id: "reverse_crunch", name: "Reverse crunch", unit: "reps", tempo: "2-1-2",
      cues: "Porta il bacino verso il petto arrotolando, non spingere con le gambe.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "v_up", name: "V-up", unit: "reps", tempo: "2-0-2",
      cues: "Solleva contemporaneamente busto e gambe formando una V. Addominali completi.",
      levels: ["intermedio", "avanzato"] },
    { id: "flutter_kicks", name: "Flutter kicks", unit: "time",
      cues: "Gambe tese sollevate, forbici alternate, lombare a terra. Resistenza addominale.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "sit_up_mb", name: "Sit-up con medicine ball", unit: "reps", tempo: "2-0-2",
      cues: "Sit-up completo con palla al petto o lancio al partner. Forza dinamica del tronco.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "cable_crunch", name: "Crunch al cavo", unit: "reps", tempo: "2-1-2",
      cues: "In ginocchio al cavo, arrotola la colonna verso il basso. Sovraccarico progressivo.",
      levels: ["intermedio", "avanzato"] },
    { id: "oblique_crunch", name: "Crunch obliquo", unit: "reps", tempo: "2-1-2",
      cues: "Crunch con rotazione, gomito al ginocchio opposto. Obliqui.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "superman", name: "Superman", unit: "time",
      cues: "Prono, solleva braccia e gambe. Estensori della schiena, bilancia il lavoro addominale.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "back_extension", name: "Iperestensioni", unit: "reps", tempo: "2-1-2",
      cues: "Estensione controllata alla panca romana. Catena posteriore e lombari.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "mb_partner_pass", name: "Passaggi med ball con partner", unit: "reps", tempo: "explosive",
      cues: "Sit-up con passaggio della palla. Core dinamico e reattivo.",
      levels: ["intermedio", "avanzato"] },
    { id: "mb_abs_toss", name: "Med ball sull'addome (incassare)", unit: "reps", tempo: "2-0-0",
      cues: "Il partner lascia cadere la palla sull'addome contratto. Abitua a incassare i colpi al corpo.",
      levels: ["avanzato"] },
  ],

  // ══════════════════════════════════════════════════════════
  // CORSA / ROADWORK
  // ══════════════════════════════════════════════════════════
  running: [
    { id: "long_easy", name: "Fondo lento aerobico", unit: "time",
      cues: "Ritmo conversazionale in Z2, costruisce la base aerobica e il recupero tra i round.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "long_run", name: "Lungo (long run)", unit: "time",
      cues: "Uscita lunga a ritmo facile. Costruisce resistenza generale e capillarizzazione.",
      levels: ["intermedio", "avanzato"] },
    { id: "tempo_run", name: "Corsa a ritmo soglia (tempo run)", unit: "time",
      cues: "Ritmo sostenuto controllato alla soglia anaerobica. Alza la capacita' di reggere l'intensita'.",
      levels: ["intermedio", "avanzato"] },
    { id: "progressive", name: "Corsa progressiva", unit: "time",
      cues: "Parti lento e aumenta gradualmente fino a ritmo sostenuto. Controllo del ritmo.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "fartlek", name: "Fartlek", unit: "time",
      cues: "Alternanza libera di tratti veloci e lenti. Simula i cambi di ritmo del combattimento.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "rep_200", name: "Ripetute 200m", unit: "reps",
      cues: "200m veloci con recupero. Velocita' e tolleranza lattacida.",
      levels: ["intermedio", "avanzato"] },
    { id: "rep_400", name: "Ripetute 400m", unit: "reps",
      cues: "400m veloci con recupero attivo tra le prove. Potenza aerobica e tolleranza al lattato.",
      levels: ["intermedio", "avanzato"] },
    { id: "rep_800", name: "Ripetute 800m", unit: "reps",
      cues: "800m a ritmo sostenuto con recupero. VO2max e resistenza specifica.",
      levels: ["intermedio", "avanzato"] },
    { id: "rep_1000", name: "Ripetute 1000m", unit: "reps",
      cues: "1000m a ritmo gara-5km con recupero. VO2max e resistenza specifica.",
      levels: ["intermedio", "avanzato"] },
    { id: "interval_30_30", name: "Intervalli 30/30", unit: "time",
      cues: "30s veloce / 30s lento ripetuti. Potenza aerobica con volume elevato.",
      levels: ["intermedio", "avanzato"] },
    { id: "hill_repeats", name: "Ripetute in salita", unit: "reps",
      cues: "Salite brevi e intense, discesa di recupero. Forza specifica e potenza.",
      levels: ["intermedio", "avanzato"] },
    { id: "sprint_30", name: "Sprint 30m", unit: "reps",
      cues: "Scatti massimali brevi con recupero completo. Potenza alattacida ed esplosivita'.",
      levels: ["intermedio", "avanzato"] },
    { id: "sprint_60", name: "Sprint 60m", unit: "reps",
      cues: "Scatti massimali con recupero completo. Velocita' e potenza.",
      levels: ["avanzato"] },
    { id: "shuttle_run", name: "Navette (shuttle run)", unit: "reps",
      cues: "Corsa avanti-indietro con cambi di direzione. Agilita', accelerazioni e decelerazioni.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "recovery_jog", name: "Corsa rigenerante", unit: "time",
      cues: "Corsa molto lenta e breve. Favorisce il recupero attivo senza aggiungere carico.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "strides", name: "Allunghi (strides)", unit: "reps",
      cues: "80-100m progressivi fino a quasi massimale, tecnica pulita. Attivazione neuromuscolare.",
      levels: ["principiante", "intermedio", "avanzato"] },
  ],

  // ══════════════════════════════════════════════════════════
  // CONDIZIONAMENTO METABOLICO
  // ══════════════════════════════════════════════════════════
  conditioning: [
    { id: "bag_intervals", name: "Sacco intervallato", unit: "time",
      cues: "Alternare esplosivita' massimale (15s) e tecnica di recupero (45s). Condizionamento specifico.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "circuit_metcon", name: "Circuito metabolico", unit: "time",
      cues: "Stazioni a rotazione (burpee, jump, colpi, core) senza pausa. Resistenza alla fatica.",
      levels: ["intermedio", "avanzato"] },
    { id: "battle_ropes", name: "Battle ropes", unit: "time",
      cues: "Onde continue con le corde, core stabile. Resistenza di spalle e potenza aerobica.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "burpees", name: "Burpee", unit: "reps",
      cues: "Squat, piega, salto esplosivo. Condizionamento total-body.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "assault_bike", name: "Assault bike intervallato", unit: "time",
      cues: "Intervalli ad alta intensita' e recupero. Condizionamento a basso impatto articolare.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "rower_intervals", name: "Vogatore intervallato", unit: "time",
      cues: "Intervalli al remoergometro. Coinvolge tutto il corpo, poco impatto.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "jump_rope", name: "Corda", unit: "time",
      cues: "Saltelli fluidi sulle punte, spalle rilassate. Coordinazione, footwork e capacita' aerobica.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "jump_rope_dbl", name: "Corda - double under", unit: "reps", tempo: "explosive",
      cues: "Doppio giro di corda per salto. Coordinazione avanzata e potenza di caviglia.",
      levels: ["intermedio", "avanzato"] },
    { id: "sled_push", name: "Sled push", unit: "reps",
      cues: "Spinta della slitta con busto basso e passi potenti. Forza-resistenza delle gambe.",
      levels: ["intermedio", "avanzato"] },
    { id: "sled_drag", name: "Sled drag", unit: "reps",
      cues: "Trazione della slitta camminando o correndo. Catena posteriore e condizionamento.",
      levels: ["intermedio", "avanzato"] },
    { id: "kb_swing", name: "Kettlebell swing", unit: "reps", tempo: "explosive",
      cues: "Spinta di anca esplosiva, kettlebell all'altezza delle spalle, core teso. Potenza e condizionamento.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "kb_snatch", name: "Kettlebell snatch", unit: "reps", tempo: "explosive",
      cues: "Strappo esplosivo del kettlebell sopra la testa. Potenza e resistenza.",
      levels: ["avanzato"] },
    { id: "thruster", name: "Thruster", unit: "reps", tempo: "explosive",
      cues: "Front squat + push press in un movimento fluido. Condizionamento intenso total-body.",
      levels: ["intermedio", "avanzato"] },
    { id: "mountain_climber", name: "Mountain climber", unit: "time",
      cues: "In plank, ginocchia alternate al petto rapidamente. Core e cardio.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "tabata_bodyweight", name: "Tabata a corpo libero", unit: "time",
      cues: "20s max / 10s pausa x8. Protocollo breve ad altissima intensita'.",
      levels: ["intermedio", "avanzato"] },
    { id: "hiit_circuit", name: "Circuito HIIT boxe", unit: "time",
      cues: "Alternanza colpi al sacco e esercizi a corpo libero ad alta intensita'.",
      levels: ["intermedio", "avanzato"] },
  ],

  // ══════════════════════════════════════════════════════════
  // PUGILATO TECNICO / SPECIFICO
  // ══════════════════════════════════════════════════════════
  boxing: [
    { id: "shadow", name: "Ombra (shadow boxing)", unit: "time",
      cues: "Movimento fluido, tecnica pulita, visualizza l'avversario. Riscaldamento e tecnica.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "shadow_weights", name: "Ombra con pesetti", unit: "time",
      cues: "Ombra con manubri leggeri (0.5-1kg), tecnica invariata. Resistenza delle spalle.",
      levels: ["intermedio", "avanzato"] },
    { id: "shadow_mirror", name: "Ombra allo specchio", unit: "time",
      cues: "Controlla guardia, postura e traiettorie allo specchio. Correzione tecnica.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "heavy_bag", name: "Sacco pesante", unit: "time",
      cues: "Colpi pieni e ben portati, ruota le anche, torna sempre in guardia.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "bag_combos", name: "Sacco - combinazioni", unit: "time",
      cues: "Combinazioni predefinite di 3-5 colpi con uscita. Automatismi tecnici.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "bag_power", name: "Sacco - colpi di potenza", unit: "reps", tempo: "explosive",
      cues: "Singoli colpi massimali con pausa. Potenza pura, non resistenza.",
      levels: ["intermedio", "avanzato"] },
    { id: "pad_work", name: "Pao / colpitori", unit: "time",
      cues: "Combinazioni chiamate dal maestro, precisione e ritmo, difesa dopo ogni combinazione.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "pad_reaction", name: "Pao a reazione", unit: "time",
      cues: "Il maestro chiama a sorpresa, rispondi il piu' rapidamente possibile. Tempo di reazione.",
      levels: ["intermedio", "avanzato"] },
    { id: "double_end", name: "Double-end bag", unit: "time",
      cues: "Palla reattiva: timing, precisione e schivate. Coordinazione occhio-mano.",
      levels: ["intermedio", "avanzato"] },
    { id: "speed_bag", name: "Speed bag", unit: "time",
      cues: "Ritmo costante, spalle su, sviluppa timing e resistenza delle spalle.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "sparring_cond", name: "Sparring condizionato", unit: "time",
      cues: "Sparring con regole (es. solo diretti, o solo difesa). Applicazione tecnica in sicurezza.",
      levels: ["intermedio", "avanzato"] },
    { id: "sparring_free", name: "Sparring libero", unit: "time",
      cues: "Combattimento controllato a intensita' concordata. Solo con supervisione.",
      levels: ["avanzato"] },
    { id: "sparring_tech", name: "Sparring tecnico leggero", unit: "time",
      cues: "Sparring a bassa intensita' focalizzato sulla tecnica, non sulla potenza.",
      levels: ["intermedio", "avanzato"] },
    { id: "footwork_drill", name: "Drill di footwork", unit: "time",
      cues: "Spostamenti, entrate e uscite, angoli. Mobilita' e gestione della distanza.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "ladder_drill", name: "Scaletta di agilita'", unit: "time",
      cues: "Sequenze rapide di piedi nella scaletta. Coordinazione e rapidita' podalica.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "slip_rope", name: "Slip rope (corda schivate)", unit: "time",
      cues: "Schivate sotto la corda tesa avanzando e indietreggiando. Difesa e gambe.",
      levels: ["principiante", "intermedio", "avanzato"] },
    { id: "defense_drill", name: "Drill difensivi", unit: "time",
      cues: "Parate, schivate, slip e rolling con partner. Reattivita' difensiva.",
      levels: ["intermedio", "avanzato"] },
    { id: "counter_drill", name: "Drill di contrattacco", unit: "time",
      cues: "Difesa seguita da immediata risposta. Timing del contrattacco.",
      levels: ["intermedio", "avanzato"] },
    { id: "clinch_work", name: "Lavoro in clinch", unit: "time",
      cues: "Gestione della corta distanza, controllo e uscite. Situazione di gara.",
      levels: ["intermedio", "avanzato"] },
    { id: "reaction_ball", name: "Reaction ball / tennis ball drill", unit: "time",
      cues: "Reazione a stimoli imprevedibili. Tempo di reazione e coordinazione.",
      levels: ["principiante", "intermedio", "avanzato"] },
  ],
};

// Nomi categoria leggibili
export const CATEGORY_LABELS = {
  strength:      "Forza / Pesi",
  plyometrics:   "Pliometria / Potenza",
  coreStability: "Core Stability",
  core:          "Core",
  running:       "Corsa",
  conditioning:  "Condizionamento",
  boxing:        "Pugilato",
};

/** Etichetta categoria nella lingua corrente (fallback italiano se non tradotta). */
export function getCategoryLabel(cat) {
  const lang = getLanguage();
  return (CATEGORY_LABELS_I18N[lang] && CATEGORY_LABELS_I18N[lang][cat]) || CATEGORY_LABELS[cat];
}

function localizeExercise(e, cat) {
  const lang = getLanguage();
  const tr = EXERCISE_TRANSLATIONS[lang] && EXERCISE_TRANSLATIONS[lang][e.id];
  return {
    ...e,
    name: (tr && tr.name) || e.name,
    cues: (tr && tr.cues) || e.cues,
    category: cat,
    categoryLabel: getCategoryLabel(cat),
  };
}

// Normalizza livello del profilo verso le fasce della libreria
function normalizeLevel(level) {
  const l = String(level || "").toLowerCase();
  if (/agonist|profession|elite|avanz/.test(l)) return "avanzato";
  if (/dilettant|intermed/.test(l)) return "intermedio";
  return "principiante";
}

/**
 * Costruisce un "menu" compatto di esercizi disponibili filtrato per livello,
 * da inserire nel prompt AI. Solo i nomi, raggruppati per categoria.
 */
export function buildExerciseMenu(level) {
  const lv = normalizeLevel(level);
  const lines = [];
  for (const cat of Object.keys(EXERCISE_LIBRARY)) {
    const names = EXERCISE_LIBRARY[cat]
      .filter(e => e.levels.includes(lv))
      .map(e => e.name);
    if (names.length) {
      lines.push(CATEGORY_LABELS[cat] + ": " + names.join(", "));
    }
  }
  return lines.join("\n");
}

/** Trova un esercizio della libreria dal nome (match tollerante). */
export function findExercise(name) {
  if (!name) return null;
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = norm(name);
  if (!target) return null;

  // 1) match esatto
  for (const cat of Object.keys(EXERCISE_LIBRARY)) {
    for (const e of EXERCISE_LIBRARY[cat]) {
      if (norm(e.name) === target) {
        return localizeExercise(e, cat);
      }
    }
  }
  // 2) match parziale (il piu' lungo vince, evita falsi positivi tipo "plank" su "side plank")
  let best = null, bestLen = 0;
  for (const cat of Object.keys(EXERCISE_LIBRARY)) {
    for (const e of EXERCISE_LIBRARY[cat]) {
      const en = norm(e.name);
      if (en.includes(target) || target.includes(en)) {
        if (en.length > bestLen) {
          bestLen = en.length;
          best = localizeExercise(e, cat);
        }
      }
    }
  }
  return best;
}

/** Conteggio totale esercizi (utile per debug/statistiche). */
export function exerciseCount() {
  return Object.keys(EXERCISE_LIBRARY)
    .reduce((n, cat) => n + EXERCISE_LIBRARY[cat].length, 0);
}
