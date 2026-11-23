import type { MimikDesktopApi } from './preload/index';
import type { MimikOverlayApi } from './preload/overlay';

declare global {
  interface ImportMetaEnv {
    readonly COMMAND?: string;
    readonly BROWSER?: string;
  }

  interface Window {
    mimik: MimikDesktopApi;
    mimikOverlay: MimikOverlayApi;
  }
}
