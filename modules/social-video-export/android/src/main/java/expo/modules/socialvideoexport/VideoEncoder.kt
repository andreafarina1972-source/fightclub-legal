package expo.modules.socialvideoexport

import android.graphics.Bitmap
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.util.Log
import android.view.Surface

private const val TAG = "SocialVideoExport"

/**
 * Encoder H.264 basato su Surface (createInputSurface() + Canvas.lockCanvas()),
 * non byte-buffer/Image.
 *
 * ⚠️ Verificato su device reale (MediaTek, encoder Codec2 "c2.mtk.avc.encoder"):
 * la modalità byte-buffer con getInputImage() accettava tutti i frame senza
 * errori ma produceva un mp4 di 0 byte — nessuna eccezione, fallimento
 * silenzioso. È un'incompatibilità nota di alcuni encoder Codec2 con
 * quell'API. Il percorso Surface è quello primario/più testato di
 * MediaCodec (lo stesso di registrazione camera/schermo) e in più elimina
 * la conversione manuale RGB→YUV: il consumer della Surface la fa
 * internamente.
 *
 * Nota sul pacing: lockCanvas()/unlockCanvasAndPost() timestampa ogni frame
 * con l'istante reale della POST (nessun controllo esplicito del PTS come
 * con l'input a byte buffer) — per questo il chiamante (vedi
 * SocialVideoExportModule) deve "ritmare" le chiamate a drawFrame() in tempo
 * quasi reale invece di produrle il più veloce possibile.
 */
internal class VideoEncoder(outputPath: String) {
  private val codec: MediaCodec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
  private lateinit var inputSurface: Surface
  private val muxer = MediaMuxer(outputPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
  private var trackIndex = -1
  private var muxerStarted = false
  private val bufferInfo = MediaCodec.BufferInfo()
  private var encodedFrameCount = 0
  private var totalBytesWritten = 0L

  private fun configure(width: Int, height: Int, fps: Int, bitrate: Int) {
    val fmt = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
      setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
      setInteger(MediaFormat.KEY_BIT_RATE, bitrate)
      setInteger(MediaFormat.KEY_FRAME_RATE, fps)
      setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2)
    }
    codec.configure(fmt, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    inputSurface = codec.createInputSurface()
    codec.start()
    Log.d(TAG, "Encoder Surface configurato ${width}x$height fps=$fps bitrate=$bitrate")
  }

  /** Disegna un frame sulla Surface di input e lo "posta". Drena prima
   *  l'output disponibile (non bloccante), così i buffer non si accumulano
   *  mentre se ne producono altri. */
  fun drawFrame(bitmap: Bitmap) {
    drainEncoder(endOfStream = false)
    val canvas = inputSurface.lockCanvas(null)
    try {
      canvas.drawBitmap(bitmap, 0f, 0f, null)
    } finally {
      inputSurface.unlockCanvasAndPost(canvas)
    }
  }

  fun finish() {
    codec.signalEndOfInputStream()
    drainEncoder(endOfStream = true)
    codec.stop()
    codec.release()
    inputSurface.release()
    if (muxerStarted) muxer.stop()
    muxer.release()

    Log.d(TAG, "Encoding completato: $encodedFrameCount campioni, $totalBytesWritten byte totali")
    if (encodedFrameCount == 0 || totalBytesWritten < 1024) {
      // Nessuna eccezione durante la pipeline, ma il risultato è comunque
      // inutilizzabile: meglio segnalarlo esplicitamente che restituire un
      // mp4 da pochi byte spacciandolo per riuscito.
      throw SocialVideoExportException(
        "Video generato vuoto o troppo piccolo ($totalBytesWritten byte, $encodedFrameCount campioni): probabile incompatibilità dell'encoder su questo device"
      )
    }
  }

  private fun drainEncoder(endOfStream: Boolean) {
    while (true) {
      val outputIndex = codec.dequeueOutputBuffer(bufferInfo, 10_000)
      when {
        outputIndex == MediaCodec.INFO_TRY_AGAIN_LATER -> {
          if (!endOfStream) return
        }
        outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
          check(!muxerStarted) { "Formato di output dell'encoder cambiato due volte" }
          trackIndex = muxer.addTrack(codec.outputFormat)
          muxer.start()
          muxerStarted = true
          Log.d(TAG, "Muxer avviato, formato: ${codec.outputFormat}")
        }
        outputIndex >= 0 -> {
          val encodedData = codec.getOutputBuffer(outputIndex)
            ?: throw IllegalStateException("Output buffer $outputIndex nullo")
          if ((bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) {
            bufferInfo.size = 0
          }
          if (bufferInfo.size != 0) {
            check(muxerStarted) { "Muxer non ancora avviato" }
            encodedData.position(bufferInfo.offset)
            encodedData.limit(bufferInfo.offset + bufferInfo.size)
            muxer.writeSampleData(trackIndex, encodedData, bufferInfo)
            encodedFrameCount++
            totalBytesWritten += bufferInfo.size
          }
          codec.releaseOutputBuffer(outputIndex, false)
          if ((bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) return
        }
        else -> return
      }
    }
  }

  companion object {
    fun create(outputPath: String, width: Int, height: Int, fps: Int, bitrate: Int = 6_000_000): VideoEncoder {
      val encoder = VideoEncoder(outputPath)
      encoder.configure(width, height, fps, bitrate)
      return encoder
    }
  }
}
