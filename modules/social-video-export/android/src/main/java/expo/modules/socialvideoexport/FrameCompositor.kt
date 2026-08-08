package expo.modules.socialvideoexport

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF

/**
 * Compone un singolo frame di output: sfondo (cover-crop, stesso identico calcolo
 * di composeSocialCard in socialCardCompose.js) + velo di leggibilità + card
 * centrata. La geometria della card arriva già risolta dal chiamante JS.
 */
internal class FrameCompositor(
  private val canvasWidth: Int,
  private val canvasHeight: Int,
  private val cardBitmap: Bitmap,
  cardX: Float,
  cardY: Float,
  cardWidth: Float,
  cardHeight: Float,
  veilAlpha: Int,
) {
  private val output = Bitmap.createBitmap(canvasWidth, canvasHeight, Bitmap.Config.ARGB_8888)
  private val canvas = Canvas(output)
  private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
  private val veilPaint = Paint().apply { color = Color.argb(veilAlpha, 0, 0, 0) }
  private val fallbackPaint = Paint().apply { color = Color.parseColor("#050508") }
  private val fullRect = RectF(0f, 0f, canvasWidth.toFloat(), canvasHeight.toFloat())
  private val cardDst = RectF(cardX, cardY, cardX + cardWidth, cardY + cardHeight)

  /**
   * Compone e restituisce il bitmap del frame. Il bitmap restituito è di proprietà
   * del compositor (riusato a ogni chiamata): il chiamante deve consumarlo subito
   * (es. passarlo all'encoder) e non conservarne il riferimento.
   */
  fun compose(bgFrame: Bitmap?): Bitmap {
    canvas.drawRect(fullRect, fallbackPaint)
    if (bgFrame != null && bgFrame.width > 0 && bgFrame.height > 0) {
      val scale = maxOf(
        canvasWidth.toFloat() / bgFrame.width,
        canvasHeight.toFloat() / bgFrame.height
      )
      val drawW = bgFrame.width * scale
      val drawH = bgFrame.height * scale
      val dx = (canvasWidth - drawW) / 2f
      val dy = (canvasHeight - drawH) / 2f
      canvas.drawBitmap(bgFrame, null, RectF(dx, dy, dx + drawW, dy + drawH), bgPaint)
    }
    canvas.drawRect(fullRect, veilPaint)
    canvas.drawBitmap(cardBitmap, null, cardDst, bgPaint)
    return output
  }

  fun release() {
    output.recycle()
  }
}
