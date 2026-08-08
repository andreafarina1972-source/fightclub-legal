package expo.modules.socialvideoexport

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Movie
import android.media.MediaMetadataRetriever
import android.os.Build
import android.util.Log
import java.io.FileInputStream

private const val TAG = "SocialVideoExport"

// Tetto massimo (px) per il lato di decodifica, indipendentemente da quanto
// servirebbe per coprire il canvas senza ingrandimento: limita il costo
// massimo di decodifica anche nei casi peggiori (sorgente 4K+ orizzontale
// dentro un canvas verticale, dove servirebbe quasi la risoluzione nativa
// per non ingrandire — vedi calcolo in requiredDecodeWidth). Senza questo
// tetto una sorgente 8K orizzontale annullerebbe il guadagno di velocità.
private const val MAX_DECODE_DIMENSION = 1920

/**
 * Sorgente di frame (video o gif animata) da cui estrarre bitmap ARGB a intervalli
 * regolari, fino a un massimo di [durationMs]. I frame vengono ricampionati alla
 * cadenza richiesta dal chiamante (FrameSource non "riproduce" in tempo reale,
 * fornisce solo il frame più vicino a un istante richiesto).
 */
internal interface FrameSource {
  /** Durata effettiva da esportare (già limitata al cap), in millisecondi. */
  val durationMs: Long
  val sourceWidth: Int
  val sourceHeight: Int

  /** Bitmap del frame più vicino a [timeMs]. Il chiamante non deve tenerne un
   *  riferimento a lungo termine: alcune implementazioni riusano lo stesso buffer. */
  fun frameAt(timeMs: Long): Bitmap?

  fun close()
}

internal class VideoFrameSource(
  path: String,
  maxDurationMs: Long,
  canvasWidth: Int,
  canvasHeight: Int,
) : FrameSource {
  private val retriever = MediaMetadataRetriever()
  override val durationMs: Long
  override val sourceWidth: Int
  override val sourceHeight: Int
  private val decodeWidth: Int
  private val decodeHeight: Int

  init {
    retriever.setDataSource(path)
    val fullDurationMs = retriever
      .extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
      ?.toLongOrNull() ?: 0L
    durationMs = if (fullDurationMs in 1 until maxDurationMs) fullDurationMs else maxDurationMs

    val rotation = retriever
      .extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)
      ?.toIntOrNull() ?: 0
    val w = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
    val h = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
    // getFrameAtTime restituisce già il frame ruotato correttamente, ma le
    // dimensioni riportate nei metadati sono a volte quelle "pre-rotazione":
    // se la rotazione è di 90/270° le scambiamo per il calcolo del cover-crop.
    if (rotation == 90 || rotation == 270) {
      sourceWidth = h; sourceHeight = w
    } else {
      sourceWidth = w; sourceHeight = h
    }

    // Quanto serve decodificare per riempire il canvas senza ingrandire (blur):
    // per il cover-crop, la larghezza di decodifica minima per evitare
    // ingrandimenti è max(canvasWidth, canvasHeight * aspectSorgente). Non
    // basta un taglio "lato più lungo": una sorgente orizzontale (16:9) dentro
    // un canvas verticale (9:16, es. Storie) ha bisogno di quasi tutta
    // l'altezza nativa per coprire il canvas, non della larghezza. Il tetto
    // MAX_DECODE_DIMENSION resta comunque un limite massimo per non annullare
    // il guadagno di velocità su sorgenti enormi in quel caso limite.
    val aspect = sourceWidth.toFloat() / sourceHeight.toFloat().coerceAtLeast(1f)
    val requiredDecodeWidth = maxOf(canvasWidth, (canvasHeight * aspect).toInt())
    val targetDecodeWidth = requiredDecodeWidth
      .coerceAtMost(MAX_DECODE_DIMENSION)
      .coerceAtMost(sourceWidth) // mai più della risoluzione nativa
      .coerceAtLeast(1)
    if (targetDecodeWidth < sourceWidth) {
      decodeWidth = targetDecodeWidth
      decodeHeight = (targetDecodeWidth / aspect).toInt().coerceAtLeast(1)
    } else {
      decodeWidth = sourceWidth
      decodeHeight = sourceHeight
    }
    Log.d(
      TAG,
      "VideoFrameSource: sorgente ${sourceWidth}x$sourceHeight, canvas ${canvasWidth}x$canvasHeight " +
        "→ decodifica a ${decodeWidth}x$decodeHeight"
    )
  }

  override fun frameAt(timeMs: Long): Bitmap? {
    // getScaledFrameAtTime (API 27+) decodifica direttamente alla risoluzione
    // richiesta invece di decodificare a piena risoluzione sorgente e poi
    // scartare il lavoro — molto più veloce su sorgenti 4K/8K. Sotto API 27
    // (rara nel 2026) si torna alla decodifica a piena risoluzione.
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      retriever.getScaledFrameAtTime(timeMs * 1000, MediaMetadataRetriever.OPTION_CLOSEST, decodeWidth, decodeHeight)
    } else {
      retriever.getFrameAtTime(timeMs * 1000, MediaMetadataRetriever.OPTION_CLOSEST)
    }
  }

  override fun close() {
    retriever.release()
  }
}

internal class GifFrameSource(path: String, maxDurationMs: Long) : FrameSource {
  private val movie: Movie
  override val durationMs: Long
  override val sourceWidth: Int
  override val sourceHeight: Int
  private val frameBitmap: Bitmap
  private val frameCanvas: Canvas
  private val loopDurationMs: Int

  init {
    val bytes = FileInputStream(path).use { it.readBytes() }
    @Suppress("DEPRECATION") // android.graphics.Movie è deprecata ma resta funzionante;
    // nessuna libreria di decodifica GIF è già presente nel progetto e non vogliamo
    // aggiungerne una solo per questo.
    movie = Movie.decodeByteArray(bytes, 0, bytes.size)
      ?: throw IllegalArgumentException("Impossibile decodificare la GIF: $path")

    sourceWidth = movie.width().coerceAtLeast(1)
    sourceHeight = movie.height().coerceAtLeast(1)
    loopDurationMs = movie.duration().takeIf { it > 0 } ?: 1000
    durationMs = if (loopDurationMs < maxDurationMs) loopDurationMs.toLong() else maxDurationMs

    frameBitmap = Bitmap.createBitmap(sourceWidth, sourceHeight, Bitmap.Config.ARGB_8888)
    frameCanvas = Canvas(frameBitmap)
  }

  override fun frameAt(timeMs: Long): Bitmap {
    movie.setTime((timeMs % loopDurationMs).toInt())
    frameBitmap.eraseColor(0)
    movie.draw(frameCanvas, 0f, 0f)
    return frameBitmap
  }

  override fun close() {
    // Movie non possiede risorse native da rilasciare esplicitamente.
  }
}
