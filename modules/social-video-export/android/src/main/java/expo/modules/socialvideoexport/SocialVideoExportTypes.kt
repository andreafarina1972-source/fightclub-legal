package expo.modules.socialvideoexport

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/**
 * Parametri per composeSocialVideo. La geometria della card (cardX/Y/W/H) arriva
 * già risolta dal lato JS (vedi src/services/socialCardCompose.js →
 * getCardPlacement), così la logica dei preset/safe-zone resta in un unico posto:
 * qui il nativo fa solo "pixel pushing" (decodifica sorgente, compone, incoda).
 */
class ComposeOptions : Record {
  @Field val sourceUri: String = ""
  @Field val cardUri: String = ""
  @Field val outputUri: String = ""
  @Field val canvasWidth: Int = 1080
  @Field val canvasHeight: Int = 1920
  @Field val cardX: Double = 0.0
  @Field val cardY: Double = 0.0
  @Field val cardWidth: Double = 0.0
  @Field val cardHeight: Double = 0.0
  @Field val veilAlpha: Int = 89 // ~0.35 * 255, coerente con VEIL_COLOR in socialCardCompose.js
  @Field val maxDurationMs: Double = 15000.0
  @Field val fps: Int = 12
}

internal class SocialVideoExportException(message: String, cause: Throwable? = null) :
  CodedException(message, cause)
