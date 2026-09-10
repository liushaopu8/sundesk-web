/**
 * SunDesk Web Client — embeddable wrapper (no source changes).
 *
 * Wraps the unmodified SunDesk web build (`./runtime/index.js` + `vendor.js` + `index.css`)
 * so any host page (e.g. TMS) can mount the full remote-desktop UI into a container.
 *
 * Usage (ESM):
 *   import { mountSunDesk } from 'sundesk-web-client'
 *   import 'sundesk-web-client/style.css'
 *
 *   const session = mountSunDesk(document.getElementById('host'), {
 *     sn: 'DEVICE_SN',              // device / remote id
 *     host: '172.16.1.31',          // rendezvous server
 *     key: '...',                   // licence key
 *     mode: 'remote',               // 'remote' | 'file'
 *     autoConnect: true,
 *     assetBase: '/sundesk-assets/',// where ogvjs/yuv/libopus live
 *     onEvent: (e) => console.log(e),
 *   })
 *   session.close()
 *
 * Assets that CANNOT be inlined live in ./assets and must be served over HTTP(S)
 * at the path given by `assetBase`. They are copied next to this file by default.
 */

const DEFAULT_ASSET_BASE = './assets/';

// 环境默认值（TMS 只需传 sn；host/key 在此内置，可被 opts 覆盖）。
// 与独立版 flutter/web/index.html 中的默认服务器/key 保持一致。
const DEFAULT_HOST = '172.16.1.31';
const DEFAULT_KEY = 'FSagyj6JvIpUf6xKzIKB1F3u1+xzUFuMT1sjry5zOyo=';

/** Normalize asset base to always end with '/'. */
function normBase(b) {
  const s = b || DEFAULT_ASSET_BASE;
  return s.endsWith('/') ? s : s + '/';
}

/** Build a detached script tag that resolves relative to a base URL. */
function loadScript(src, asModule) {
  return new Promise((resolve) => {
    if (document.querySelector('script[data-sundesk-src="' + src + '"]')) return resolve();
    const el = document.createElement('script');
    if (asModule) {
      el.type = 'module';
      el.crossOrigin = 'anonymous';
    }
    el.src = src;
    el.async = false;
    el.dataset.sundeskSrc = src;
    el.onload = () => resolve();
    el.onerror = () => {
      console.error('[sundesk-embed] failed to load script:', src);
      resolve();
    };
    document.head.appendChild(el);
  });
}

/** Inject the stylesheet that ships with the lib, unless already present. */
function ensureCss(cssHref) {
  if (!cssHref) return;
  if (document.querySelector('link[data-sundesk-css="1"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = cssHref;
  link.dataset.sundeskCss = '1';
  document.head.appendChild(link);
}

let runtimePromise = null;

/** Load ogv.js / yuv-canvas (required) then the app bundle. Idempotent. */
function loadRuntime(assetBase, runtimeBase) {
  if (runtimePromise) return runtimePromise;
  runtimePromise = (async () => {
    // ogv.js and yuv-canvas must exist as globals BEFORE the app bundle runs.
    await loadScript(assetBase + 'ogvjs-1.8.6/ogv.js');
    await loadScript(assetBase + 'yuv-canvas-1.2.6.js');
    // The app bundle is an ES module importing ./vendor.js (resolved relative to
    // its own URL), so it must be loaded as type="module".
    await loadScript(runtimeBase + 'index.js', true);
  })();
  return runtimePromise;
}

/**
 * Mount the SunDesk web client into `el`.
 *
 * @param {HTMLElement} el
 * @param {object} [opts]
 * @param {string} [opts.sn]          remote device id
 * @param {string} [opts.host]        rendezvous server address
 * @param {string} [opts.key]         licence key
 * @param {string} [opts.mode]        'remote' (default) | 'file'
 * @param {boolean} [opts.autoConnect] click Connect automatically on mount
 * @param {string} [opts.password]    optional password to auto-submit
 * @param {string} [opts.assetBase]   base URL for ogvjs/yuv/libopus assets
 * @param {string} [opts.runtimeBase] base URL for index.js/vendor.js/index.css
 * @param {(evt: object) => void} [opts.onEvent] event callback
 * @returns {{ el: HTMLElement, connect: Function, close: Function, destroy: Function }}
 */
export function mountSunDesk(el, opts = {}) {
  if (!el) throw new Error('mountSunDesk: container element is required');
  if (window.__SUNDESK_INSTANCE__) {
    const prev = window.__SUNDESK_INSTANCE__;
    try { prev.destroy(); } catch (e) { /* ignore */ }
  }

  const assetBase = normBase(opts.assetBase);
  const runtimeBase = normBase(opts.runtimeBase);

  // Make the asset base visible to the runtime (workers/wasm resolve against it).
  window.__SUNDESK_ASSET_BASE__ = assetBase;

  // Persist config where the runtime reads it from.
  const host = opts.host || DEFAULT_HOST;
  const key = opts.key || DEFAULT_KEY;
  if (opts.sn) localStorage.setItem('id', opts.sn);
  localStorage.setItem('custom-rendezvous-server', host);
  localStorage.setItem('relay-server', host);
  if (key) localStorage.setItem('key', key);

  // Event bridge: the runtime calls window.onGlobalEvent(json). We wrap it so the
  // host gets every event, then keep whatever handler was installed before.
  const prevOnGlobalEvent = typeof window.onGlobalEvent === 'function' ? window.onGlobalEvent : null;
  const emit = (type, payload) => {
    const evt = Object.assign({ type: type }, payload || {});
    try { opts.onEvent && opts.onEvent(evt); } catch (e) { console.error('[sundesk-embed] onEvent threw:', e); }
    try { window.dispatchEvent(new CustomEvent('sundesk-event', { detail: evt })); } catch (e) { /* ignore */ }
  };
  window.onGlobalEvent = (message) => {
    try { emit('global-event', typeof message === 'string' ? JSON.parse(message) : message); }
    catch (e) { /* ignore */ }
    if (prevOnGlobalEvent) { try { prevOnGlobalEvent(message); } catch (e) { /* ignore */ } }
  };

  // Container the unmodified runtime renders into (#app).
  const root = document.createElement('div');
  root.className = 'sundesk-root' + (opts.isolate ? ' sundesk-isolate' : '');
  root.id = 'app';
  el.appendChild(root);

  ensureCss(opts.cssHref || (runtimeBase + 'index.css'));

  emit('mounted', { sn: opts.sn || '' });

  const api = {
    el: root,
    connect: (mode) => { try { window.connect && window.connect(mode || opts.mode || 'remote'); } catch (e) { console.error(e); } },
    close: () => { try { window.cancel && window.cancel(); } catch (e) { /* ignore */ } },
    destroy: () => {
      try { window.cancel && window.cancel(); } catch (e) { /* ignore */ }
      window.onGlobalEvent = prevOnGlobalEvent;
      try { root.remove(); } catch (e) { /* ignore */ }
      if (window.__SUNDESK_INSTANCE__ === api) window.__SUNDESK_INSTANCE__ = undefined;
      emit('destroyed', {});
    },
  };
  window.__SUNDESK_INSTANCE__ = api;

  // Kick off loading; the app bundle picks up #app on execution.
  loadRuntime(assetBase, runtimeBase).then(() => {
    emit('ready', {});
    if (opts.autoConnect && opts.sn) {
      setTimeout(() => api.connect(opts.mode), 0);
    }
  });

  return api;
}

export default mountSunDesk;
