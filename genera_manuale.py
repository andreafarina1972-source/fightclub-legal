import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether, Image
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# Colori
VERDE = colors.HexColor('#00E5A0')
NERO = colors.HexColor('#111111')
GRIGIO = colors.HexColor('#555555')
GRIGIO_CHIARO = colors.HexColor('#F5F5F5')
BIANCO = colors.white

W, H = A4

# Screenshot helpers
_SS_DIR = os.path.dirname(os.path.abspath(__file__))
_SS_SUFFIX = '_b09d2af16a020aa0a1361b658d10a9c3.jpg'
_SS_ASPECT = 2412 / 1080  # portrait aspect ratio of device screenshots

def ss(timestamp, w=4.5*cm):
    """Return an Image flowable for a device screenshot."""
    path = os.path.join(_SS_DIR, f'Screenshot_2026-06-19-{timestamp}{_SS_SUFFIX}')
    return Image(path, width=w, height=w * _SS_ASPECT)


# Stili
def stili():
    return {
        'titolo_sezione': ParagraphStyle(
            'titolo_sezione',
            fontName='Helvetica-Bold',
            fontSize=22,
            textColor=NERO,
            spaceAfter=4,
        ),
        'sottotitolo': ParagraphStyle(
            'sottotitolo',
            fontName='Helvetica',
            fontSize=11,
            textColor=GRIGIO,
            spaceAfter=14,
        ),
        'h2': ParagraphStyle(
            'h2',
            fontName='Helvetica-Bold',
            fontSize=13,
            textColor=VERDE,
            spaceBefore=14,
            spaceAfter=6,
        ),
        'body': ParagraphStyle(
            'body',
            fontName='Helvetica',
            fontSize=10,
            textColor=NERO,
            leading=15,
            spaceAfter=4,
        ),
        'bullet': ParagraphStyle(
            'bullet',
            fontName='Helvetica',
            fontSize=10,
            textColor=NERO,
            leading=15,
            leftIndent=14,
            spaceAfter=3,
            bulletIndent=4,
        ),
        'nota': ParagraphStyle(
            'nota',
            fontName='Helvetica',
            fontSize=10,
            textColor=GRIGIO,
            leading=14,
            spaceBefore=8,
            spaceAfter=8,
        ),
        'label': ParagraphStyle(
            'label',
            fontName='Helvetica',
            fontSize=9,
            textColor=GRIGIO,
        ),
        'valore': ParagraphStyle(
            'valore',
            fontName='Helvetica-Bold',
            fontSize=16,
            textColor=VERDE,
        ),
        'card_titolo': ParagraphStyle(
            'card_titolo',
            fontName='Helvetica-Bold',
            fontSize=10,
            textColor=NERO,
        ),
        'card_body': ParagraphStyle(
            'card_body',
            fontName='Helvetica',
            fontSize=9,
            textColor=GRIGIO,
            leading=13,
        ),
        'bold': ParagraphStyle(
            'bold',
            fontName='Helvetica-Bold',
            fontSize=10,
            textColor=NERO,
            leading=15,
            leftIndent=14,
            spaceAfter=2,
        ),
    }

S = stili()

def sep():
    return HRFlowable(width='100%', thickness=0.5, color=colors.HexColor('#DDDDDD'),
                      spaceAfter=10, spaceBefore=4)

def bullet(testo):
    return Paragraph(f'• {testo}', S['bullet'])

def h2(testo):
    return Paragraph(testo, S['h2'])

def body(testo):
    return Paragraph(testo, S['body'])

def nota(testo):
    return Paragraph(f'💡 {testo}', S['nota'])

def card_row(items):
    """Riga di card uguali. items = [(label, valore, colore_valore), ...]"""
    celle = []
    for label, valore, colore in items:
        celle.append([
            Paragraph(label, S['label']),
            Paragraph(valore, ParagraphStyle('v', fontName='Helvetica-Bold',
                      fontSize=16, textColor=colore)),
        ])
    t = Table([celle], colWidths=[None] * len(items), hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#DDDDDD')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#DDDDDD')),
        ('BACKGROUND', (0,0), (-1,-1), GRIGIO_CHIARO),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    return t

def badge_card(nome, descr, colore=VERDE):
    return Table(
        [[Paragraph(f'<font color="#{colore.hexval()[2:]}">▌</font> <b>{nome}</b>', S['card_titolo']),
          Paragraph(descr, S['card_body'])]],
        colWidths=[4*cm, 12*cm],
    )

def sezione_header(numero, titolo, sottotitolo_testo):
    return [
        Paragraph(f'{numero}. {titolo}', S['titolo_sezione']),
        Paragraph(sottotitolo_testo, S['sottotitolo']),
        sep(),
        Spacer(1, 6),
    ]

def with_ss(content_list, timestamp, img_width=4.5*cm):
    """2-column table: [text content] | [device screenshot]"""
    img = ss(timestamp, w=img_width)
    text_w = 16*cm - img_width - 0.4*cm
    t = Table([[content_list, img]], colWidths=[text_w, img_width])
    t.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (0,0), 6),
        ('LEFTPADDING', (1,0), (1,0), 6),
        ('RIGHTPADDING', (1,0), (1,0), 0),
    ]))
    return t


def build():
    doc = SimpleDocTemplate(
        'FightClub_Manuale.pdf',
        pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
        title='FightClub — Manuale Utente',
        author='FightClub App',
    )

    story = []

    # ── COVER ────────────────────────────────────────────────────────────────
    from reportlab.platypus.flowables import Flowable

    class CoverPage(Flowable):
        def wrap(self, aw, ah):
            return aw, ah
        def draw(self):
            c = self.canv
            c.saveState()
            c.setFillColor(NERO)
            c.rect(0, 0, W, H, fill=1, stroke=0)
            c.setFillColor(VERDE)
            c.rect(0, 0, W, 1*cm, fill=1, stroke=0)
            c.rect(0, H - 0.6*cm, W, 0.6*cm, fill=1, stroke=0)
            c.setFont('Helvetica-Bold', 72)
            c.setFillColor(VERDE)
            c.drawString(2*cm, H - 6*cm, 'FIGHT')
            c.setFillColor(BIANCO)
            c.drawString(2*cm, H - 9.5*cm, 'CLUB')
            c.setFont('Helvetica', 14)
            c.setFillColor(GRIGIO)
            c.drawString(2*cm, H - 11.5*cm, 'Manuale Utente — App di Allenamento per Boxe e Running')
            c.setFont('Helvetica-Bold', 11)
            c.setFillColor(VERDE)
            c.drawString(2*cm, H - 14*cm, 'CARATTERISTICHE PRINCIPALI')
            features = [
                'Timer boxe professionale con Fight Score live',
                'AI Coach — piani settimanali personalizzati (Groq · Gemini · Anthropic)',
                'Monitoraggio Running con GPS e zone cardio',
                'Training Load CTL/ATL/TSB — modello Banister',
                '22 Badge sbloccabili · Storico sessioni completo',
                'Fascia cardio Bluetooth · Sensor ANT+',
                'Voice Coach multilingua · 20+ lingue',
            ]
            c.setFont('Helvetica', 11)
            c.setFillColor(BIANCO)
            y = H - 15.5*cm
            for f in features:
                c.drawString(2*cm, y, f'✓  {f}')
                y -= 0.75*cm
            c.restoreState()

    story.append(CoverPage())
    story.append(PageBreak())

    # ── 1. PANORAMICA ────────────────────────────────────────────────────────
    story += sezione_header(1, "Panoramica dell'App",
                            "FightClub è un'app di allenamento progettata per pugili e atleti di arti marziali.")
    story.append(body(
        "FightClub combina timer professionali, analisi fisiologica avanzata e intelligenza artificiale "
        "per aiutarti a migliorare le tue prestazioni. Tutte le funzionalità operano offline; "
        "la connessione Internet è necessaria solo per l'AI Coach."
    ))
    story.append(Spacer(1, 10))
    story.append(h2('Schermate principali — barra Tab'))
    story.append(body('Accessibili direttamente dalla barra di navigazione in basso:'))
    story.append(Spacer(1, 4))

    tab_screens = [
        ('Home',         'Dashboard con prossimo allenamento AI, ultima sessione, VO2max stimato, stato HR e pulsanti rapidi'),
        ('Timer',        'Timer boxe completo con Fight Score live, rilevamento colpi, zone cardio e feedback AI'),
        ('Veloce',       'Timer rapido senza configurazione — seleziona preset round/riposo e premi START'),
        ('Workout',      'Libreria workout salvati: avvia, crea o elimina allenamenti personalizzati'),
        ('Allena',       'Sessione live con visualizzazione zone cardio metaboliche e di training in tempo reale'),
        ('Running',      'Tracciamento GPS con mappa OpenStreetMap, distanza, pace e zone cardio'),
        ('Storico',      'Revisione sessioni passate: grafici zone, metriche, condivisione card e replay rotta'),
        ('AI Coach',     'Piano settimanale generato dall\'IA con sessioni, intensità target, note coach e check-in'),
        ('Impostazioni', 'Profilo atleta, fascia cardio BLE, audio, voce coach, chiave API, lingua'),
    ]

    tab_data = [[
        Paragraph('<b>Tab</b>', S['card_titolo']),
        Paragraph('<b>Funzione</b>', S['card_titolo']),
    ]]
    for nome, descr in tab_screens:
        tab_data.append([
            Paragraph(f'<b>{nome}</b>', S['body']),
            Paragraph(f'<font color="#555555">{descr}</font>', S['card_body']),
        ])
    tab_table = Table(tab_data, colWidths=[2.8*cm, 13.2*cm])
    tab_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#EEEEEE')),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#DDDDDD')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#DDDDDD')),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))
    story.append(tab_table)

    story.append(Spacer(1, 12))
    story.append(h2('Schermate secondarie — accesso contestuale'))
    story.append(body('Si aprono da bottoni specifici nelle schermate principali:'))
    story.append(Spacer(1, 4))

    modal_screens = [
        ('Workout Builder',     'Home / Workout',    'Crea o modifica template: nome, preparazione, round, riposo, cicli'),
        ('Timer personalizzato','Home',              'Configura ed esegui un timer one-shot senza salvarlo come workout'),
        ('Workout Run',         'Workout',           'Esegue un template salvato con fase di preparazione, round multipli e cicli'),
        ('Replay percorso',     'Storico',           'Riproduce il GPS della corsa su mappa con cursore animato e HR/pace live'),
        ('Bluetooth',           'Impostazioni',      'Scansiona e accoppia fasce cardiache BLE (Polar, Garmin, Wahoo, Suunto…)'),
        ('Microfono',           'Impostazioni',      'Testa il rilevamento colpi via microfono con slider di sensibilità'),
        ('Calibrazione colpi',  'Impostazioni',      'Calibra l\'algoritmo di rilevamento colpi registrando campioni audio guidati'),
        ('VO2 Test',            'Impostazioni',      'Misura il VO2max tramite test progressivo integrato o Cooper test (12 min)'),
    ]

    modal_data = [[
        Paragraph('<b>Schermata</b>', S['card_titolo']),
        Paragraph('<b>Accesso da</b>', S['card_titolo']),
        Paragraph('<b>Funzione</b>', S['card_titolo']),
    ]]
    for nome, accesso, descr in modal_screens:
        modal_data.append([
            Paragraph(f'<b>{nome}</b>', S['body']),
            Paragraph(f'<font color="#00E5A0">{accesso}</font>', S['card_body']),
            Paragraph(f'<font color="#555555">{descr}</font>', S['card_body']),
        ])
    modal_table = Table(modal_data, colWidths=[4*cm, 2.8*cm, 9.2*cm])
    modal_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#EEEEEE')),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#DDDDDD')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#DDDDDD')),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))
    story.append(modal_table)

    story.append(Spacer(1, 14))
    story.append(h2('FightClub Free vs Pro'))
    story.append(body(
        'FightClub è utilizzabile gratuitamente. Alcune funzionalità avanzate sono riservate '
        'agli abbonati <b>FightClub Pro</b> (contrassegnate da un lucchetto 🔒 nell\'app):'
    ))
    story.append(Spacer(1, 4))
    for t in [
        '<b>Free</b> — Timer boxe e Veloce, Workout Builder, Running con GPS, storico sessioni base, banner pubblicitari',
        '<b>Pro</b> — Fight Score e zone cardio nello storico, VO2max e Training Load, AI Coach, Badge, '
        'condivisione Fight Card, foto/nome personalizzati sulla tessera atleta, nessuna pubblicità',
    ]:
        story.append(bullet(t))
    story.append(Spacer(1, 6))
    story.append(body(
        '<b>Prezzi:</b> 3,49 €/mese oppure 15,99 €/anno, con 14 giorni di prova gratuita su entrambi i piani. '
        'L\'abbonamento è gestito tramite Google Play e disdicibile in qualsiasi momento dalle impostazioni dello Store.'
    ))

    # ── Galleria schermate (pagina dedicata) ─────────────────────────────────
    story.append(PageBreak())
    story.append(h2('Galleria schermate'))
    story.append(body('Anteprima di tutte le schermate principali dell\'app:'))
    story.append(Spacer(1, 8))

    gallery_items = [
        ('21-49-57-29', 'Home'),
        ('21-50-02-06', 'Timer'),
        ('21-50-06-23', 'Timer Veloce'),
        ('21-50-09-75', 'Allenamenti'),
        ('21-50-14-21', 'Allena'),
        ('21-50-21-43', 'Running'),
        ('21-50-34-43', 'Storico'),
        ('21-50-37-66', 'AI Coach'),
        ('21-50-41-04', 'Impostazioni'),
    ]
    IMG_W = 3.0 * cm
    IMG_H = IMG_W * _SS_ASPECT
    COL_W = 16*cm / 3
    label_style = ParagraphStyle('gl', fontName='Helvetica-Bold', fontSize=9,
                                 textColor=NERO, alignment=TA_CENTER,
                                 spaceBefore=4, spaceAfter=6)

    gallery_data = []
    for i in range(0, 9, 3):
        row_imgs = []
        row_labels = []
        for j in range(3):
            ts, name = gallery_items[i + j]
            img = ss(ts, w=IMG_W)
            img.hAlign = 'CENTER'
            row_imgs.append(img)
            row_labels.append(Paragraph(name, label_style))
        gallery_data.append(row_imgs)
        gallery_data.append(row_labels)

    gal_table = Table(gallery_data, colWidths=[COL_W, COL_W, COL_W])
    gal_table.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(gal_table)

    story.append(PageBreak())

    # ── 2. TIMER BOXE ────────────────────────────────────────────────────────
    story += sezione_header(2, 'Timer Boxe', 'Schermata principale per gli allenamenti con i guantoni.')

    # "Come iniziare" affiancato allo screenshot del Timer
    timer_intro = [
        h2('Come iniziare'),
        bullet('Seleziona o crea un workout dalla scheda Workout'),
        bullet('Premi START per avviare il timer'),
        bullet('Il gong suona all\'inizio e alla fine di ogni round'),
        bullet('Il Voice Coach annuncia ogni round nella tua lingua'),
        bullet('Al termine, la sessione viene salvata automaticamente'),
        Spacer(1, 8),
        body('<font color="#00E5A0"><b>In basso</b></font>: il pannello Fight Score mostra '
             'in tempo reale HR Zone, Cadenza colpi e Costanza. '
             'I pulsanti START / STOP controllano il round corrente.'),
    ]
    story.append(with_ss(timer_intro, '21-50-02-06', img_width=5*cm))

    story.append(h2('Fight Score™  (0 – 100)'))
    story.append(body(
        'Il Fight Score è un indice composito in tempo reale che misura la qualità '
        'dell\'allenamento su tre componenti:'
    ))
    story.append(Spacer(1, 6))
    story.append(card_row([
        ('HR Score', '0 – 40', colors.HexColor('#E53935')),
        ('Pace Score', '0 – 40', colors.HexColor('#FB8C00')),
        ('Constancy', '0 – 20', colors.HexColor('#43A047')),
    ]))
    story.append(Spacer(1, 8))
    for t in [
        '<b>HR Score</b> — zona cardio mantenuta durante i round',
        '<b>Pace Score</b> — cadenza colpi (pugni al minuto)',
        '<b>Constancy</b> — premia il bilanciamento tra HR Score e Pace Score',
        '<b>Punteggio finale:</b> 80–100 = Eccellente | 60–79 = Buono | &lt;60 = Da migliorare',
    ]:
        story.append(bullet(t))

    story.append(h2('Zone cardio monitorate'))
    zone = [
        ('Z1 Recupero', '&lt; 60% HRmax', 'blu chiaro'),
        ('Z2 Aerobico', '60–70% HRmax', 'verde'),
        ('Z3 Soglia', '70–80% HRmax', 'giallo'),
        ('Z4 Lattacido', '80–90% HRmax', 'arancione'),
        ('Z5 Massimale', '&gt; 90% HRmax', 'rosso'),
    ]
    for z, perc, colore in zone:
        story.append(bullet(f'<b>{z}</b>  {perc}  —  {colore}'))

    story.append(h2('Timer Veloce — preset pronti all\'uso'))

    # Timer Veloce affiancato allo screenshot
    veloce_intro = [
        body('La scheda <b>Veloce</b> permette di avviare immediatamente una sessione senza '
             'creare un workout. Seleziona un preset e premi START.'),
        Spacer(1, 6),
        bullet('<b>3:00 / 1:00</b> — Standard boxe (3 round da 3 min, riposo 1 min)'),
        bullet('<b>2:00 / 1:00</b> — Tecnico (round più corti per lavoro tecnico)'),
        bullet('<b>1:30 / 1:00</b> — HIIT (alta intensità con recupero breve)'),
        bullet('<b>5:00 / 1:00</b> — Resistenza (round lunghi)'),
        bullet('<b>6:00 / 1:00</b> e <b>8:00 / 1:00</b> — Resistenza estrema'),
        Spacer(1, 6),
        body('Il numero di round è regolabile con i tasti <b>−</b> e <b>+</b>. '
             'Il Fight Score viene calcolato anche in questa modalità.'),
    ]
    story.append(with_ss(veloce_intro, '21-50-06-23', img_width=5*cm))

    story.append(PageBreak())

    # ── 3. WORKOUT BUILDER ───────────────────────────────────────────────────
    story += sezione_header(3, 'Workout Builder', 'Crea allenamenti personalizzati e salvali nella libreria.')

    # Workout Builder affiancato allo screenshot Allenamenti
    wb_intro = [
        h2('Libreria allenamenti'),
        body('La scheda <b>Allenamenti</b> mostra tutti i workout salvati. '
             'Tocca <b>+ Crea nuovo workout</b> per aprire il Workout Builder '
             'e configurare un allenamento personalizzato.'),
        Spacer(1, 8),
        h2('Parametri configurabili'),
        bullet('Nome workout'),
        bullet('Preparazione iniziale (secondi)'),
        bullet('Durata round (secondi)'),
        bullet('Riposo tra round (secondi)'),
        bullet('Numero round'),
        bullet('Numero cicli — per allenamenti a blocchi'),
        bullet('Riposo tra cicli (secondi)'),
    ]
    story.append(with_ss(wb_intro, '21-50-09-75', img_width=5*cm))

    story.append(Spacer(1, 10))
    esempio = Table([[Paragraph(
        '💡  <b>Esempio:</b> 4 round × 3 min / 1 min riposo × 3 cicli / 3 min riposo tra cicli = <b>36 round totali</b>',
        ParagraphStyle('n', fontName='Helvetica', fontSize=10, textColor=GRIGIO, leading=14)
    )]], colWidths=[16*cm])
    esempio.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), GRIGIO_CHIARO),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#DDDDDD')),
        ('TOPPADDING', (0,0), (0,0), 8),
        ('BOTTOMPADDING', (0,0), (0,0), 8),
        ('LEFTPADDING', (0,0), (0,0), 10),
    ]))
    story.append(esempio)

    story.append(h2('Workout Run'))
    story.append(body(
        'Avviando un workout dalla libreria si accede alla modalità Workout Run, '
        'con timer dedicato, rilevamento colpi e zone cardio identici al Timer principale.'
    ))
    story.append(PageBreak())

    # ── 4. RUNNING ───────────────────────────────────────────────────────────
    story += sezione_header(4, 'Running', 'Tracciamento GPS della corsa con analisi fisiologica completa.')

    running_intro = [
        h2('Dati tracciati in tempo reale'),
        bullet('Velocità istantanea (km/h) e andatura (min/km)'),
        bullet('Pace media e best km della sessione corrente'),
        bullet('Frequenza cardiaca, HR min e HR max'),
        bullet('Zone cardio in tempo reale (Z1–Z5)'),
        bullet('Mappa percorso GPS con OpenStreetMap (Leaflet)'),
        bullet('Tempo totale e distanza percorsa'),
        Spacer(1, 6),
        body('<font color="#00E5A0"><b>Coach vocale:</b></font> annuncia periodicamente '
             'tempo, distanza, zona HR e pace durante la corsa.'),
    ]
    story.append(with_ss(running_intro, '21-50-21-43', img_width=5*cm))

    story.append(h2('Dati salvati al termine'))
    for t in [
        'Distanza (km) e pace media/istantanea (min/km)',
        'Zone cardio in tempo reale (Z1–Z5)',
        'VO2max stimato con metodo Firstbeat (tramite fascia cardio)',
        'Altimetria e mappa rotta GPS',
        'Calorie consumate',
        'TSS (Training Stress Score) della sessione',
    ]:
        story.append(bullet(t))

    story.append(h2('Replay rotta'))
    story.append(body(
        'Dalla schermata History puoi rivivere ogni corsa in modalità replay: '
        'la mappa anima il percorso mostrando HR e pace in ogni punto.'
    ))
    story.append(PageBreak())

    # ── 5. CARDIO & SENSORI ──────────────────────────────────────────────────
    story += sezione_header(5, 'Cardio & Sensori', 'Collegamento a fasce cardiache e sensori esterni.')
    story.append(h2('Fascia Bluetooth (BLE)'))
    for t in [
        'Protocollo standard BLE Heart Rate (UUID 0x180D)',
        'Compatibile con Polar, Garmin, Wahoo, Suunto e la maggior parte delle fasce BLE',
        'Connessione dalla schermata Impostazioni → Cardio',
        'HR live visibile nella Home e durante tutti gli allenamenti',
    ]:
        story.append(bullet(t))

    story.append(h2('Sensori ANT+ (opzionale)'))
    for t in [
        'Supporto tramite adattatore ANT+ USB-OTG per Android',
        'Compatibile con fasce ANT+ standard',
        'Configurabile in Impostazioni → Sensori ANT+',
    ]:
        story.append(bullet(t))

    story.append(h2('HRmax e profilo atleta'))
    for t in [
        'HRmax configurabile manualmente in Impostazioni',
        'Alternativa: calcolato automaticamente da età (220 − età)',
        'VO2max misurato con test progressivo integrato (schermata VO2 Test)',
    ]:
        story.append(bullet(t))
    story.append(PageBreak())

    # ── 6. AI COACH ─────────────────────────────────────────────────────────
    story += sezione_header(6, 'AI Coach', 'Piano settimanale personalizzato generato dall\'intelligenza artificiale.')

    ai_intro = [
        h2('Come funziona'),
        body(
            'L\'AI Coach analizza i tuoi dati fisiologici (CTL, ATL, TSB, VO2max, Fight Score, '
            'aderenza) e genera un piano settimanale di 4–5 sessioni adattato al tuo stato di '
            'forma attuale. In alto vengono mostrati CTL, TSB, VO2 e la streak di allenamento.'
        ),
        Spacer(1, 8),
        body('Il piano include per ogni sessione:'),
        bullet('Focus settimanale — obiettivo fisiologico principale'),
        bullet('Sessioni con round, riposo, durata e stima TSS'),
        bullet('Target intensità (es. Z3 70–80% HRmax)'),
        bullet('Note tattiche del coach (tecnica, focus mentale)'),
        bullet('Check-in soggettivo: fatica, sonno, dolori muscolari'),
    ]
    story.append(with_ss(ai_intro, '21-50-37-66', img_width=5*cm))

    story.append(h2('Provider AI supportati'))
    story.append(Spacer(1, 6))
    provider_data = [
        [Paragraph('Groq', S['label']),
         Paragraph('Gemini', S['label']),
         Paragraph('Anthropic', S['label'])],
        [Paragraph('<b>Gratuito</b>', ParagraphStyle('p', fontName='Helvetica-Bold', fontSize=14, textColor=VERDE)),
         Paragraph('<b>Gratuito</b>', ParagraphStyle('p', fontName='Helvetica-Bold', fontSize=14, textColor=VERDE)),
         Paragraph('<b>A pagamento</b>', ParagraphStyle('p', fontName='Helvetica-Bold', fontSize=14, textColor=GRIGIO))],
    ]
    t = Table(provider_data, colWidths=[5.3*cm]*3)
    t.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#DDDDDD')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#DDDDDD')),
        ('BACKGROUND', (0,0), (-1,-1), GRIGIO_CHIARO),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t)
    story.append(Spacer(1, 8))
    for t in [
        '<b>Groq</b> (Llama 3.3 70B) — GRATUITO, nessuna carta di credito richiesta',
        '<b>Gemini 2.0 Flash</b> — GRATUITO, nessuna carta di credito richiesta',
        '<b>Anthropic Claude Sonnet</b> — richiede credito prepagato (pay-per-use)',
    ]:
        story.append(bullet(t))

    story.append(Spacer(1, 8))
    consiglio = Table([[Paragraph(
        '💡  <b>Consigliato: Groq</b> — gratuito, veloce, qualità eccellente. Registrazione in 2 minuti.',
        ParagraphStyle('n', fontName='Helvetica', fontSize=10, textColor=GRIGIO, leading=14)
    )]], colWidths=[16*cm])
    consiglio.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), GRIGIO_CHIARO),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#DDDDDD')),
        ('TOPPADDING', (0,0), (0,0), 8),
        ('BOTTOMPADDING', (0,0), (0,0), 8),
        ('LEFTPADDING', (0,0), (0,0), 10),
    ]))
    story.append(consiglio)

    story.append(h2('Configurazione chiave API'))
    for t in [
        'Vai in Impostazioni → AI Coach',
        'Seleziona il provider desiderato',
        'Incolla la chiave API nel campo dedicato',
        'Premi Salva — la chiave viene rilevata automaticamente dal formato',
        'La chiave è memorizzata localmente sul dispositivo (non inviata a server terzi)',
    ]:
        story.append(bullet(t))

    story.append(h2('Lingua'))
    story.append(body(
        'Il piano viene generato nella lingua attiva dell\'app '
        '(italiano, inglese, spagnolo, francese, tedesco).'
    ))
    story.append(PageBreak())

    # ── 7. TRAINING LOAD ─────────────────────────────────────────────────────
    story += sezione_header(7, 'Training Load — CTL / ATL / TSB',
                            'Modello Banister per la gestione del carico di allenamento.')
    story.append(h2('Le tre metriche'))
    story.append(body(
        'Il modello CTL/ATL/TSB (Coggan 2003, Banister 1991) quantifica adattamento, fatica e '
        'forma atletica usando medie mobili esponenziali del TSS sessione per sessione.'
    ))
    story.append(Spacer(1, 6))
    story.append(card_row([
        ('CTL (Fitness)', 'τ = 42 gg', colors.HexColor('#2196F3')),
        ('ATL (Fatica)', 'τ = 7 gg', colors.HexColor('#E53935')),
        ('TSB (Forma)', 'CTL − ATL', VERDE),
    ]))
    story.append(Spacer(1, 8))
    for t in [
        '<b>CTL</b> (Chronic Training Load) — media mobile a 42 giorni del TSS',
        '<b>ATL</b> (Acute Training Load) — media mobile a 7 giorni del TSS',
        '<b>TSB</b> (Training Stress Balance) = CTL − ATL',
    ]:
        story.append(bullet(t))

    story.append(h2('Interpretazione TSB'))
    tsb_righe = [
        ('TSB > +10', 'Ottimale — pronto per sessioni ad alta intensità o gara'),
        ('TSB 0 – 10', 'Fresco — puoi aumentare il carico'),
        ('TSB −10 – 0', 'Carico normale — monitorare la fatica'),
        ('TSB −20 – −10', 'Affaticamento medio — privilegiare recupero attivo'),
        ('TSB < −20', 'Sovrallenamento — recupero prioritario'),
    ]
    for tsb, desc in tsb_righe:
        story.append(Paragraph(
            f'<font color="#00E5A0"><b>{tsb}</b></font>  →  {desc}',
            ParagraphStyle('tsb', fontName='Helvetica', fontSize=10, leading=16,
                           leftIndent=14, spaceAfter=3)
        ))

    story.append(h2('TSS sessione'))
    story.append(body(
        'Il TSS (Training Stress Score) viene calcolato automaticamente al termine di ogni sessione '
        'in base a durata, intensità media e zona cardio. Se non è disponibile la fascia cardio, '
        'vengono usate stime basate sul tipo di allenamento.'
    ))

    story.append(h2('Grafico'))
    story.append(body(
        'La schermata Training Load mostra il grafico SVG di CTL, ATL e TSB '
        'con intervalli selezionabili: 28, 90 e 180 giorni.'
    ))
    story.append(PageBreak())

    # ── 8. BADGE ─────────────────────────────────────────────────────────────
    story += sezione_header(8, 'Badge e Achievement', '22 badge sbloccabili organizzati in 6 categorie.')

    categorie = {
        'COLPI': ([
            ('Primo Sangue', '500 colpi totali'),
            ('Ganci di Ferro', '5.000 colpi totali'),
            ('Machine Gun', '10.000 colpi totali'),
            ('Iron Mike', '50.000 colpi totali'),
            ('Esplosione', '100 colpi in un singolo round'),
        ], colors.HexColor('#E53935')),
        'STREAK': ([
            ('Sul Fuoco', '3 giorni consecutivi di allenamento'),
            ('Settimana di Fuoco', '7 giorni consecutivi di allenamento'),
            ('Mese Infuocato', '30 giorni consecutivi di allenamento'),
            ('Demone', '100 giorni consecutivi di allenamento'),
        ], colors.HexColor('#FB8C00')),
        'VO2MAX': ([
            ('Fiato Atletico', 'Raggiungi un VO2max ≥ 45 ml/kg/min'),
            ('Motore da Gara', 'Raggiungi un VO2max ≥ 50 ml/kg/min'),
            ('Élite', 'Raggiungi un VO2max ≥ 60 ml/kg/min (livello professionista)'),
        ], colors.HexColor('#2196F3')),
        'SESSIONI & ROUND': ([
            ('Inizio', 'Completa 10 sessioni di allenamento'),
            ('Veterano', 'Completa 50 sessioni di allenamento'),
            ('Campione', 'Completa 200 sessioni di allenamento'),
            ('Cento Round', 'Completa 100 round totali'),
            ('Il Ring è Casa Mia', 'Completa 500 round totali'),
            ('Mille Minuti', 'Raggiungi 1.000 minuti di allenamento totale'),
        ], colors.HexColor('#9C27B0')),
        'RUNNING': ([
            ('Mezza Gara', 'Percorri 50 km totali in running'),
            ('Cento Km', 'Percorri 100 km totali in running'),
        ], colors.HexColor('#00BCD4')),
        'FIGHT SCORE': ([
            ('Fighter', 'Raggiungi un Fight Score ≥ 75 in una sessione'),
            ('Elite Fighter', 'Raggiungi un Fight Score ≥ 90 in una sessione'),
        ], colors.HexColor('#FF4081')),
    }

    for cat, (badges, colore) in categorie.items():
        story.append(Paragraph(cat, ParagraphStyle(
            'cat', fontName='Helvetica-Bold', fontSize=12,
            textColor=colore, spaceBefore=12, spaceAfter=6
        )))
        for nome, descr in badges:
            t = Table(
                [[Paragraph('▌', ParagraphStyle('barra', fontName='Helvetica-Bold',
                            fontSize=20, textColor=colore)),
                  [Paragraph(f'<b>{nome}</b>', S['card_titolo']),
                   Paragraph(descr, S['card_body'])]]],
                colWidths=[0.5*cm, 15.5*cm],
            )
            t.setStyle(TableStyle([
                ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                ('TOPPADDING', (0,0), (-1,-1), 3),
                ('BOTTOMPADDING', (0,0), (-1,-1), 3),
            ]))
            story.append(t)

    story.append(PageBreak())

    # ── 9. STORICO SESSIONI E GRAFICI ────────────────────────────────────────
    story += sezione_header(9, 'Storico Sessioni e Grafici',
                            'Come vengono calcolati i dati mostrati nella schermata History.')

    storico_intro = [
        body(
            'La schermata <b>Storico</b> mostra il riepilogo generale in cima '
            '(sessioni totali, minuti, colpi, kcal) e la lista delle sessioni salvate. '
            'Tocca una sessione per vedere i dettagli, condividerla o eliminarla.'
        ),
        Spacer(1, 8),
        body(
            'La schermata History mostra due livelli di dati: le <b>card individuali</b> di ogni sessione '
            'e i <b>grafici di tendenza</b> calcolati sull\'insieme delle sessioni. '
            'La logica di aggregazione varia a seconda della metrica.'
        ),
        Spacer(1, 8),
        h2('Metriche per sessione singola'),
        body('Questi valori si riferiscono esclusivamente alla singola sessione:'),
        bullet('<b>Zone cardio</b> (metabolica e training) — accumulate a 1 Hz durante l\'allenamento'),
        bullet('<b>Calorie</b> — calcolate su durata e intensità della sessione'),
        bullet('<b>Fight Score</b> — indice composito della singola sessione'),
        bullet('<b>Trend Cardio / PPR / Performance</b> — un punto grafico per sessione'),
    ]
    story.append(with_ss(storico_intro, '21-50-34-43', img_width=5*cm))

    story.append(h2('Metriche aggregate per giornata'))
    story.append(body(
        'Il <b>TSS giornaliero</b> viene calcolato sommando il TSS di tutte le sessioni '
        'dello stesso giorno. Su questa somma vengono poi calcolati CTL, ATL e TSB:'
    ))
    story.append(Spacer(1, 6))

    agg_data = [
        [Paragraph('<b>Metrica</b>', S['card_titolo']),
         Paragraph('<b>Aggregazione</b>', S['card_titolo']),
         Paragraph('<b>Formula</b>', S['card_titolo'])],
        [Paragraph('TSS', S['body']),
         Paragraph('Somma per giornata', S['body']),
         Paragraph('durata × intensità² × 1,5', S['card_body'])],
        [Paragraph('CTL (Fitness)', S['body']),
         Paragraph('Media mobile 42 giorni', S['body']),
         Paragraph('EMA con τ = 42 gg', S['card_body'])],
        [Paragraph('ATL (Fatica)', S['body']),
         Paragraph('Media mobile 7 giorni', S['body']),
         Paragraph('EMA con τ = 7 gg', S['card_body'])],
        [Paragraph('TSB (Forma)', S['body']),
         Paragraph('Giornaliero', S['body']),
         Paragraph('CTL − ATL', S['card_body'])],
    ]
    t = Table(agg_data, colWidths=[4*cm, 6*cm, 6*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#EEEEEE')),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#DDDDDD')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#DDDDDD')),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t)
    story.append(Spacer(1, 10))

    story.append(body(
        '<b>Esempio:</b> se esegui una sessione di boxe (TSS 40) e una corsa (TSS 35) '
        'nella stessa giornata, il Training Load conta un TSS giornaliero di <b>75</b>. '
        'Le due sessioni restano però separate nelle card dello storico.'
    ))

    story.append(h2('Riepilogo visivo'))
    riepilogo = [
        [Paragraph('<b>Schermata</b>', S['card_titolo']),
         Paragraph('<b>Dato mostrato</b>', S['card_titolo']),
         Paragraph('<b>Base di calcolo</b>', S['card_titolo'])],
        [Paragraph('History — card sessione', S['body']),
         Paragraph('Zone cardio, calorie, Fight Score', S['body']),
         Paragraph('Sessione singola', S['card_body'])],
        [Paragraph('History — MiniLineChart', S['body']),
         Paragraph('Cardio trend, PPR, Performance', S['body']),
         Paragraph('Un punto per sessione', S['card_body'])],
        [Paragraph('Training Load — grafico', S['body']),
         Paragraph('CTL / ATL / TSB', S['body']),
         Paragraph('TSS aggregato per giorno', S['card_body'])],
    ]
    t2 = Table(riepilogo, colWidths=[5*cm, 6*cm, 5*cm])
    t2.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#EEEEEE')),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#DDDDDD')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#DDDDDD')),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t2)

    story.append(PageBreak())

    # ── 10. CONDIVISIONE ─────────────────────────────────────────────────────
    story += sezione_header(10, 'Condivisione Sessioni', 'Genera e condividi la tua Fight Card in stile poster UFC.')
    story.append(body(
        'Dalla schermata Storico, ogni sessione ha tre pulsanti: <b>Anteprima 👁️</b>, '
        '<b>Condividi 📤</b> e <b>Aggiungi/Cambia sfondo 🖼️</b>. La card generata è in stile '
        '"fight poster" ufficiale, con placca punteggio centrale, tale-of-the-tape e banda promoter.'
    ))
    story.append(Spacer(1, 6))
    story.append(h2('Dati mostrati nella card'))
    for t in [
        'Placca centrale: Fight Score (boxe) oppure VO2max stimato/distanza (running)',
        'Durata, colpi totali, cadenza (colpi/min), round, miglior round (boxe)',
        'Distanza, pace media, km migliore, calorie (running)',
        'FC media, FC massima, zona cardio dominante',
        'Grafico zone cardio (Z1–Z5)',
        'Data e nome workout, hashtag #FightClub #Boxing #Training',
    ]:
        story.append(bullet(t))
    story.append(Spacer(1, 8))
    story.append(h2('Sfondo personalizzato'))
    story.append(body(
        'Dal pulsante \'Aggiungi sfondo\' puoi scegliere una foto (o una GIF) dalla galleria da usare come '
        'sfondo della card, con overlay scuro per mantenere leggibili i testi. Tieni premuto il pulsante '
        'per rimuovere lo sfondo e tornare al fallback scuro con bande diagonali. '
        'Nota: se lo sfondo scelto è una GIF, nell\'anteprima si anima normalmente, ma il file condiviso '
        'resta sempre un\'immagine statica (limite tecnico della cattura schermo).'
    ))
    story.append(Spacer(1, 8))
    story.append(h2('Esporta PNG trasparente (per montaggio video)'))
    story.append(body(
        'Nel modal di Anteprima è disponibile anche \'🎬 Esporta PNG trasparente\': genera la stessa card '
        'ma con sfondo completamente trasparente (solo placca, statistiche e bande). Il PNG può essere '
        'importato in un\'app di montaggio (CapCut, InShot, Storie Instagram) e sovrapposto a un video '
        'proprio per ottenere una clip animata con i dati dell\'allenamento in sovraimpressione.'
    ))
    story.append(Spacer(1, 8))
    story.append(body(
        'In entrambi i casi la card viene condivisa tramite il sistema nativo del dispositivo '
        '(WhatsApp, Instagram, email…). Se la condivisione non è disponibile, il file viene salvato '
        'automaticamente nella galleria foto.'
    ))
    story.append(PageBreak())

    # ── 11. IMPOSTAZIONI ─────────────────────────────────────────────────────
    story += sezione_header(11, 'Impostazioni', 'Personalizza ogni aspetto dell\'app.')

    imp_intro = [
        h2('Lingua'),
        body('Oltre 25 lingue disponibili dal menu a tendina in cima alla schermata Impostazioni. '
             'Cambiando lingua si aggiornano anche gli annunci del Voice Coach.'),
        Spacer(1, 6),
        h2('Voce coach'),
        body('Abilita o disabilita gli annunci vocali all\'inizio di ogni round. '
             'Il coach parla nella lingua selezionata.'),
        Spacer(1, 6),
        h2('Profilo Atleta'),
        bullet('Età — per il calcolo automatico di HRmax (220 − età)'),
        bullet('HRmax manuale — sovrascrive il calcolo automatico'),
        bullet('Peso corporeo — per il calcolo delle calorie'),
    ]
    story.append(with_ss(imp_intro, '21-50-41-04', img_width=5*cm))

    story.append(h2('Profili Audio'))

    # Seconda colonna Impostazioni (audio + sensibilità) affiancata allo screenshot
    imp_audio = [
        body('Tre profili predefiniti selezionabili con un tap:'),
        bullet('<b>SILENZIOSO</b> — nessun suono'),
        bullet('<b>COACHING</b> — gong, beep e voce coach'),
        bullet('<b>FIGHT</b> — tutti i suoni attivi al massimo'),
        Spacer(1, 6),
        h2('Sensibilità colpi'),
        body('Regola la soglia del microfono per il rilevamento automatico dei colpi. '
             'Consiglio: 20–55% per ridurre i falsi positivi.'),
        bullet('Stato: <b>CALIBRATO</b> — sensore pronto all\'uso'),
        bullet('Premi <b>Calibra</b> per ricalibrazione guidata'),
    ]
    story.append(with_ss(imp_audio, '21-50-47-14', img_width=5*cm))

    story.append(h2('AI Coach — Chiave API'))

    imp_api = [
        body('Seleziona il provider AI e incolla la tua API key:'),
        bullet('<b>Groq (Gratuito)</b> — registrati su console.groq.com'),
        bullet('<b>Gemini (Gratuito)</b> — registrati su aistudio.google.com'),
        bullet('<b>Anthropic Claude</b> — pay-per-use (richiede credito prepagato)'),
        Spacer(1, 6),
        body('La chiave viene riconosciuta automaticamente dal prefisso '
             '(<i>gsk_</i>=Groq, <i>AIza</i>=Gemini, <i>sk-</i>=Anthropic). '
             'Usa <b>Mostra/Nascondi</b> per sicurezza, <b>Rimuovi</b> per cancellarla.'),
        Spacer(1, 6),
        h2('Fascia Cardio'),
        body('Stato DISCONNECTED → tocca <b>Connetti</b> per scansionare i dispositivi BLE vicini '
             'e accoppiare la tua fascia cardio.'),
    ]
    story.append(with_ss(imp_api, '21-50-52-32', img_width=5*cm))

    story.append(PageBreak())

    # ── 12. GUIDA RAPIDA ─────────────────────────────────────────────────────
    story += sezione_header(12, 'Guida Rapida — Primi Passi', '')

    passi = [
        ('1. Configura il profilo', [
            'Vai in Impostazioni → inserisci età e peso',
            'Imposta HRmax manualmente oppure lascia il calcolo automatico',
        ]),
        ('2. Collega la fascia cardio  (opzionale ma consigliato)', [
            'Accendi la fascia cardio Bluetooth',
            'Vai in Impostazioni → Cardio → Scansiona',
            'Tocca il dispositivo per connetterti',
        ]),
        ('3. Il tuo primo allenamento', [
            'Scheda Timer → premi START',
            'Oppure Scheda Veloce → seleziona un preset → premi START',
            'Il timer conta i round, suona il gong, mostra le zone cardio',
            'Al termine, salva la sessione',
        ]),
        ('4. Configura l\'AI Coach', [
            'Registrati su console.groq.com (gratis, 2 minuti)',
            'Genera un\'API key gratuita',
            'Incollala in Impostazioni → AI Coach → Salva',
            'Vai nella schermata AI Coach → Genera Piano',
        ]),
        ('5. Monitora i progressi', [
            'Home → Training Load mostra CTL/ATL/TSB aggiornato',
            'Scheda History → tutte le sessioni con statistiche dettagliate',
            'Badges → achievement sbloccati',
            'Training Load → grafico 28/90/180 giorni',
        ]),
    ]
    for titolo, voci in passi:
        story.append(Paragraph(titolo, ParagraphStyle(
            'passo', fontName='Helvetica-Bold', fontSize=12,
            textColor=VERDE, spaceBefore=12, spaceAfter=6
        )))
        for v in voci:
            story.append(bullet(v))

    story.append(Spacer(1, 14))
    consiglio2 = Table([[Paragraph(
        '💡  <b>Consiglio:</b> allena almeno 3 volte a settimana per avere dati sufficienti '
        'a far funzionare al meglio l\'AI Coach e il modello Training Load.',
        ParagraphStyle('n', fontName='Helvetica', fontSize=10, textColor=GRIGIO, leading=14)
    )]], colWidths=[16*cm])
    consiglio2.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), GRIGIO_CHIARO),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#DDDDDD')),
        ('TOPPADDING', (0,0), (0,0), 8),
        ('BOTTOMPADDING', (0,0), (0,0), 8),
        ('LEFTPADDING', (0,0), (0,0), 10),
    ]))
    story.append(consiglio2)

    # ── FOOTER ───────────────────────────────────────────────────────────────
    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica', 8)
        canvas.setFillColor(GRIGIO)
        canvas.drawString(2*cm, 1.2*cm, 'FightClub App — Manuale Utente v1.0')
        canvas.drawRightString(W - 2*cm, 1.2*cm, f'Pagina {doc.page - 1}')
        canvas.restoreState()

    def prima_pagina(canvas, doc):
        pass  # cover senza footer

    doc.build(story, onFirstPage=prima_pagina, onLaterPages=footer)
    print('PDF generato con successo.')


if __name__ == '__main__':
    build()
