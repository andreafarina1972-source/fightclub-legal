# Informativa sulla Privacy — FightClub

**Ultimo aggiornamento:** 9 luglio 2026

Questa informativa descrive come l'app **FightClub** ("l'App"), sviluppata da **Andrea Farina** ("noi", "lo Sviluppatore"), tratta i dati degli utenti ("tu", "l'utente").

---

## 1. Principio generale: l'App è locale

FightClub è progettata per funzionare **senza un server proprio**. Lo Sviluppatore **non gestisce alcun database, backend o servizio cloud** e **non ha accesso** ai dati che generi usando l'App (sessioni di allenamento, statistiche, foto, percorsi GPS, frequenza cardiaca).

Tutti questi dati restano **memorizzati esclusivamente sul tuo dispositivo** (tramite storage locale dell'app) fino a quando:
- li elimini tu stesso dall'App (es. cancellazione cronologia nella schermata Storico);
- disinstalli l'App, che rimuove automaticamente tutti i dati locali.

Nessuna copia di backup viene inviata automaticamente a server esterni dallo Sviluppatore.

## 2. Dati trattati esclusivamente in locale

| Dato | A cosa serve | Dove viene salvato |
|---|---|---|
| Nome/nickname e foto profilo (tessera atleta) | Personalizzazione dell'App | Solo sul dispositivo |
| Cronologia sessioni di allenamento (durata, colpi, calorie, punteggio) | Statistiche, badge, grafici | Solo sul dispositivo |
| Frequenza cardiaca (da fascia Bluetooth/ANT+) | Calcolo zone cardio, Fight Score, VO2 max | Solo sul dispositivo, in tempo reale |
| Percorso GPS durante la corsa | Tracciamento distanza/percorso, replay mappa | Solo sul dispositivo |
| Audio del microfono (per il conteggio colpi) | Rilevare i colpi tramite il suono in tempo reale | **Non registrato né salvato**: l'audio viene analizzato istantaneamente (livello sonoro) e scartato subito dopo, non viene mai memorizzato come file né trasmesso |
| Impostazioni app (lingua, sensibilità, età, ecc.) | Funzionamento dell'App | Solo sul dispositivo |

## 3. Dati condivisi con servizi di terze parti

Alcune funzionalità dell'App si appoggiano a servizi esterni indipendenti dallo Sviluppatore. Quando li usi, quei servizi ricevono dati secondo le proprie policy:

### 3.1 Google AdMob (banner pubblicitari)
Nelle schermate gratuite, l'App mostra banner pubblicitari tramite Google AdMob. AdMob può raccogliere l'identificativo pubblicitario del dispositivo e altri dati tecnici per mostrare annunci (eventualmente personalizzati, in base alle tue impostazioni privacy del dispositivo).
Informativa AdMob: https://policies.google.com/privacy

**I dati di salute e fitness (frequenza cardiaca, VO2 max, carico di allenamento, Fight Score) non vengono mai condivisi con AdMob né utilizzati per personalizzare gli annunci pubblicitari.** Restano confinati al dispositivo, oppure — solo se attivi tu la funzione AI Coach — inviati esclusivamente al provider AI scelto (sezione 3.3).

### 3.2 RevenueCat (gestione abbonamento Pro)
Se acquisti o gestisci l'abbonamento FightClub Pro, i dati relativi all'acquisto (identificativo utente anonimo, stato dell'abbonamento) sono trattati da RevenueCat per validare e gestire la sottoscrizione presso Google Play.
Informativa RevenueCat: https://www.revenuecat.com/privacy

### 3.3 Provider di intelligenza artificiale (funzione "AI Coach")
Se scegli di usare la funzione **AI Coach**, devi inserire tu stesso una chiave API personale (Groq, Google Gemini o Anthropic, a tua scelta) nelle Impostazioni. Quando generi un piano di allenamento, l'App invia **direttamente dal tuo dispositivo** al provider scelto alcuni dati derivati dal tuo storico allenamenti, necessari a generare il piano: carico di allenamento (CTL/ATL/TSB), VO2 max stimato, Fight Score medio, andamento della frequenza cardiaca, numero di sessioni, ed eventuali risposte al check-in soggettivo (fatica, sonno, dolori).

Questi dati **non passano da un server dello Sviluppatore**: vanno dal tuo dispositivo al provider AI da te scelto, usando la tua chiave personale. Il trattamento di questi dati da parte del provider è regolato dalla sua informativa:
- Groq: https://groq.com/privacy-policy/
- Google Gemini: https://policies.google.com/privacy
- Anthropic: https://www.anthropic.com/legal/privacy

Se non usi la funzione AI Coach (o non inserisci una chiave API), nessun dato viene inviato a questi provider.

## 4. Permessi richiesti dall'App e motivazione

| Permesso | Perché serve |
|---|---|
| Posizione (in primo piano) | Tracciare il percorso e la distanza durante una sessione di corsa |
| Posizione (in background) | Continuare a tracciare il percorso mentre lo schermo è spento o altre app sono in uso durante la corsa. Il tracciamento si interrompe quando esci dalla sessione/dall'App |
| Bluetooth (scansione/connessione) | Collegare fasce cardio esterne (cardiofrequenzimetro) |
| Microfono | Rilevare i colpi tramite il suono durante l'allenamento (analisi in tempo reale, nessuna registrazione salvata — vedi sezione 2) |
| Accesso alle foto | Permetterti di scegliere una foto per la tessera atleta o per personalizzare le fight card da condividere |
| Rete/internet | Necessario solo per: banner pubblicitari, validazione abbonamento, funzione AI Coach (se attivata). Il resto dell'App funziona offline |

Puoi negare i permessi non essenziali dalle impostazioni del dispositivo: le funzioni collegate (es. GPS, fascia cardio) semplicemente non saranno disponibili.

## 5. Conservazione e cancellazione dei dati

FightClub non applica alcuna scadenza automatica: i dati restano sul dispositivo **a tempo indeterminato**, finché non li elimini tu con una delle azioni seguenti.

| Cosa vuoi eliminare | Come farlo in FightClub |
|---|---|
| Cronologia allenamenti | Storico → Svuota — rimuove sessioni, statistiche e badge collegati |
| Tessera atleta (nome, foto) | Modificabile o svuotabile dalla schermata tessera atleta |
| Chiave AI Coach | Impostazioni → AI Coach — rimuovi la chiave API per revocare l'invio dati al provider scelto |
| Abbonamento Pro | Google Play Store → Abbonamenti — gestisci o disdici; i dati dell'acquisto restano con RevenueCat secondo la loro policy |
| Assolutamente tutto | Disinstalla FightClub dal dispositivo: rimuove ogni dato locale in modo permanente e immediato |

## 6. Minori

FightClub non è rivolta specificamente a minori di 13 anni e non raccoglie consapevolmente dati di bambini. I dati dell'App restano esclusivamente sul dispositivo; l'unica eccezione è la funzione opzionale AI Coach (sezione 3.3), che — solo se attivata volontariamente inserendo una chiave API personale — invia alcuni dati di allenamento al provider AI scelto per generare un piano personalizzato.

**Importante:** poiché lo Sviluppatore non gestisce un proprio server e non ha accesso ai dati presenti sul dispositivo, non può eliminare da remoto i dati locali di nessun utente, minore o meno. Se un genitore ritiene che il proprio figlio abbia usato l'App in modo improprio, la rimozione va effettuata **direttamente sul dispositivo del minore**, seguendo i passaggi della sezione 5 (Storico → Svuota; disinstallazione per rimuovere tutto). Se il minore ha attivato l'AI Coach, rimuovi la chiave API dalle Impostazioni per interrompere l'invio di dati al provider scelto. Per la parte di dati eventualmente trattata da RevenueCat (solo in caso di acquisto in-app) puoi contattarci (sezione 11) e faremo da tramite con il servizio; per qualsiasi altra domanda scrivici pure, ma non possiamo eliminare da remoto dati che non abbiamo né vediamo.

## 7. Sicurezza

Poiché i dati restano sul dispositivo, la loro sicurezza dipende principalmente dalle protezioni del tuo dispositivo (blocco schermo, aggiornamenti di sistema). I dati inviati ai servizi terzi (sezione 3) viaggiano tramite connessioni cifrate (HTTPS) verso quei provider.

## 8. Base giuridica e i tuoi diritti (utenti UE/SEE/Regno Unito)

Trattiamo i tuoi dati sulle seguenti basi giuridiche, a seconda del caso:
- **Esecuzione del contratto d'uso**: dati necessari al funzionamento dell'App che scegli di usare (es. cronologia allenamenti, gestione dell'abbonamento tramite RevenueCat).
- **Consenso**: dati trattati solo se attivi tu una funzione opzionale — permessi di sistema (posizione, Bluetooth, microfono, foto), condivisione con il provider AI Coach, ID pubblicitario per AdMob (gestibile anche dalle impostazioni privacy del dispositivo). Puoi revocare il consenso in qualsiasi momento disattivando il permesso o la funzione corrispondente.

Se ti trovi nello Spazio Economico Europeo, nel Regno Unito o in Svizzera, hai diritto a: accesso ai tuoi dati, rettifica, cancellazione, limitazione del trattamento, portabilità, opposizione, e revoca del consenso in qualsiasi momento. Poiché la quasi totalità dei dati resta solo sul tuo dispositivo, puoi esercitare la maggior parte di questi diritti direttamente dall'App (sezione 5); per la porzione di dati trattata dai servizi terzi (sezione 3), contattaci o rivolgiti direttamente a quel servizio.

Hai inoltre diritto di proporre reclamo a un'autorità di controllo. In Italia: **Garante per la protezione dei dati personali** — www.garanteprivacy.it.

## 9. Utenti negli Stati Uniti

Se risiedi in uno stato USA con leggi sulla privacy specifiche (es. California - CCPA/CPRA), puoi comunque esercitare i tuoi diritti contattandoci ai recapiti sotto. Poiché lo Sviluppatore non gestisce un proprio database di dati personali (dato il funzionamento locale dell'App), la maggior parte delle richieste relative ai dati raccolti va indirizzata direttamente ai servizi terzi elencati alla sezione 3 per la porzione di dati che li riguarda.

## 10. Modifiche a questa informativa

Questa informativa può essere aggiornata in caso di modifiche all'App o agli obblighi normativi. La data di "ultimo aggiornamento" in cima al documento riflette la versione corrente.

## 11. Contatti

Per domande su questa informativa o sui tuoi dati:
**fightclubapp99@gmail.com**
