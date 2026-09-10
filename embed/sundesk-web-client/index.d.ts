/**
 * Type definitions for the embeddable SunDesk web client.
 */

export interface SunDeskEvent {
  /** e.g. 'mounted' | 'ready' | 'connecting' | 'connected' | 'error'
   *  | 'global-event' | 'destroyed' */
  type: string;
  [key: string]: unknown;
}

export interface MountOptions {
  /** Remote device id (SN). */
  sn?: string;
  /** Rendezvous server address, e.g. '172.16.1.31'. */
  host?: string;
  /** Licence key. */
  key?: string;
  /** 'remote' (default) or 'file'. */
  mode?: 'remote' | 'file';
  /** Click Connect automatically once the runtime is ready. */
  autoConnect?: boolean;
  /** Optional password (business side can supply later). */
  password?: string;
  /** Base URL for ogvjs / yuv / libopus assets. Default './assets/'. */
  assetBase?: string;
  /** Base URL for index.js / vendor.js / index.css. Default './'. */
  runtimeBase?: string;
  /** Custom stylesheet href (defaults to runtimeBase + 'index.css'). */
  cssHref?: string;
  /** Add an isolating class to the root node. */
  isolate?: boolean;
  /** Called for every runtime / lifecycle event. */
  onEvent?: (evt: SunDeskEvent) => void;
}

export interface SunDeskSession {
  /** The root element inserted into your container. */
  el: HTMLElement;
  /** Start a connection (uses opts.mode by default). */
  connect: (mode?: 'remote' | 'file') => void;
  /** Close the current session (back to connect screen). */
  close: () => void;
  /** Tear everything down and remove the root node. */
  destroy: () => void;
}

export function mountSunDesk(el: HTMLElement, opts?: MountOptions): SunDeskSession;
export default mountSunDesk;
