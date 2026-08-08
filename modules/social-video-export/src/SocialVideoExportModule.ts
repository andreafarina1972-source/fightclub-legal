import { NativeModule, requireNativeModule } from "expo";

import { ComposeSocialVideoOptions } from "./SocialVideoExport.types";

declare class SocialVideoExportModule extends NativeModule {
  /** Compone lo sfondo animato + velo + card in un mp4 e restituisce il suo uri. */
  composeSocialVideo(options: ComposeSocialVideoOptions): Promise<string>;
}

// Solo Android: su altre piattaforme il modulo nativo non esiste, requireNativeModule
// lancerebbe — i chiamanti (useSocialCardExport) devono verificare Platform.OS
// prima di usarlo, esattamente come fanno già gli altri require lazy nel progetto.
export default requireNativeModule<SocialVideoExportModule>("SocialVideoExport");
