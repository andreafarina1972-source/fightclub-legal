package expo.modules.socialvideoexport

import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

private const val TAG = "SocialVideoExport"

/**
 * Compone la Share Card di FightClub su un video/gif animato di sfondo, frame per
 * frame, e la incoda in un mp4 muto (H.264). Solo Android: vedi commento nel
 * brief — nessun equivalente iOS (AVAssetWriter) per ora, non buildabile/testabile
 * in questo ambiente di sviluppo.
 *
 * Percorso separato dalla composizione PNG statica (src/services/socialCardCompose.js,
 * via Skia): quella resta invariata per gli sfondi statici (foto).
 */
class SocialVideoExportModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SocialVideoExport")

    AsyncFunction("composeSocialVideo") { options: ComposeOptions ->
      composeSocialVideo(options)
    }
  }

  private fun uriToPath(uriStr: String): String {
    val uri = Uri.parse(uriStr)
    return uri.path ?: uriStr
  }

  private fun composeSocialVideo(options: ComposeOptions): String {
    val sourcePath = uriToPath(options.sourceUri)
    val cardPath = uriToPath(options.cardUri)
    val outputPath = uriToPath(options.outputUri)
    val isGif = sourcePath.substringAfterLast('.', "").lowercase() == "gif"

    val cardBitmap = BitmapFactory.decodeFile(cardPath)
      ?: throw SocialVideoExportException("Impossibile decodificare la card catturata: $cardPath")

    val frameSource: FrameSource = try {
      if (isGif) GifFrameSource(sourcePath, options.maxDurationMs.toLong())
      else VideoFrameSource(sourcePath, options.maxDurationMs.toLong(), options.canvasWidth, options.canvasHeight)
    } catch (e: Exception) {
      cardBitmap.recycle()
      throw SocialVideoExportException("Impossibile leggere lo sfondo animato: $sourcePath", e)
    }
    Log.d(
      TAG,
      "Sorgente ${if (isGif) "gif" else "video"} $sourcePath: " +
        "${frameSource.sourceWidth}x${frameSource.sourceHeight}, durata esportata ${frameSource.durationMs}ms"
    )

    val outputFile = File(outputPath)
    outputFile.parentFile?.mkdirs()
    if (outputFile.exists()) outputFile.delete()

    val compositor = FrameCompositor(
      canvasWidth = options.canvasWidth,
      canvasHeight = options.canvasHeight,
      cardBitmap = cardBitmap,
      cardX = options.cardX.toFloat(),
      cardY = options.cardY.toFloat(),
      cardWidth = options.cardWidth.toFloat(),
      cardHeight = options.cardHeight.toFloat(),
      veilAlpha = options.veilAlpha,
    )

    val encoder = try {
      VideoEncoder.create(
        outputPath = outputFile.absolutePath,
        width = options.canvasWidth,
        height = options.canvasHeight,
        fps = options.fps,
      )
    } catch (e: Exception) {
      compositor.release()
      frameSource.close()
      cardBitmap.recycle()
      throw SocialVideoExportException("Impossibile inizializzare l'encoder video su questo device", e)
    }

    try {
      // ⚠️ Verificato su device reale: l'input via Surface (vedi VideoEncoder)
      // timestampa ogni frame con l'istante REALE della POST, non un valore
      // deterministico — quindi se decodificare un frame sorgente
      // (MediaMetadataRetriever, specie con OPTION_CLOSEST) richiede più del
      // budget teorico (1/fps secondi), il tempo IN PIÙ finisce dentro il
      // video esportato: il risultato dura più a lungo del sorgente e sembra
      // al rallentatore. La sola attesa "se siamo in anticipo" (versione
      // precedente) non basta: se la decodifica è SISTEMATICAMENTE lenta non
      // recupera mai il ritardo. Soluzione: quando si accumula più di un
      // frame di ritardo, si salta il campione (si avanza nella sorgente
      // senza comporlo/incodarlo) invece di continuare ad accumulare tempo —
      // il video finale può risultare localmente meno fluido ma la durata
      // complessiva (quindi la velocità di riproduzione) resta corretta.
      val frameDurationMs = (1000.0 / options.fps).toLong().coerceAtLeast(1)
      val frameDurationNs = frameDurationMs * 1_000_000L
      var t = 0L
      var frameCount = 0
      var skippedCount = 0
      val loopStartNs = System.nanoTime()
      while (t < frameSource.durationMs) {
        val targetNs = t * 1_000_000L
        val elapsedNs = System.nanoTime() - loopStartNs
        if (elapsedNs < targetNs) {
          val waitNs = targetNs - elapsedNs
          Thread.sleep(waitNs / 1_000_000L, (waitNs % 1_000_000L).toInt())
        } else if (elapsedNs > targetNs + frameDurationNs) {
          t += frameDurationMs
          skippedCount++
          continue
        }
        val bgFrame = frameSource.frameAt(t)
        val composed = compositor.compose(bgFrame)
        encoder.drawFrame(composed)
        frameCount++
        t += frameDurationMs
      }
      Log.d(TAG, "$frameCount frame codificati, $skippedCount saltati per restare a ritmo, avvio finish()")
      encoder.finish()
    } catch (e: SocialVideoExportException) {
      throw e // già descrittiva (es. il controllo di sanità in VideoEncoder.finish()), non ri-avvolgere
    } catch (e: Exception) {
      throw SocialVideoExportException("Errore durante la composizione del video", e)
    } finally {
      compositor.release()
      frameSource.close()
      cardBitmap.recycle()
    }

    Log.d(TAG, "Output scritto: ${outputFile.absolutePath} (${outputFile.length()} byte)")
    return Uri.fromFile(outputFile).toString()
  }
}
