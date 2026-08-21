import "./style.css";
import "./connection";
import * as globals from "./globals";

// JS 核心（globals.js/connection.ts）期望的全局回调，原由 Flutter host（web_model.dart）安装。
// TS 精简 UI 独立运行时必须自己补上，否则连接成功后 pushEvent/onRgba 会抛 ReferenceError。
// 交互事件已通过 conn.setMsgbox/setDraw 走本地回调，这里基本是 no-op + 调试日志。
window.onGlobalEvent = (message) => {
  console.debug('[sundesk] onGlobalEvent:', message);
};
window.onRgba = () => {}; // TS UI 用自带 YUVCanvas player 绘制，忽略核心的 rgba 通道
window.onRegisteredEvent = () => {};

const app = document.querySelector('#app');

if (app) {
  app.innerHTML = `
  <div id="connect" style="text-align: center"><table style="display: inline-block">
    <tr><td><span>Host: </span></td><td><input id="host" /></td></tr>
    <tr><td><span>Key: </span></td><td><input id="key" /></td></tr>
    <tr><td><span>Id: </span></td><td><input id="id" /></td></tr>
    <tr><td></td><td><button onclick="connect();">Connect</button></td></tr>
  </table></div>
  <div id="password" style="display: none;">
    <input type="password" id="password" />
    <button id="confirm" onclick="confirm()">Confirm</button>
    <button id="cancel" onclick="cancel();">Cancel</button>
  </div>
  <div id="status" style="display: none;">
    <div id="text" style="line-height: 2em"></div>
    <button id="cancel" onclick="cancel();">Cancel</button>
  </div>
  <div id="canvas" style="display: none;">
    <button id="cancel" onclick="cancel();">Cancel</button>
    <canvas id="player"></canvas>
    <canvas id="test-yuv-decoder-canvas"></canvas>
  </div>
`;

  let player;
  window.init();

  document.body.onload = () => {
    const host = document.querySelector('#host');
    host.value = localStorage.getItem('custom-rendezvous-server');
    const id = document.querySelector('#id');
    id.value = localStorage.getItem('id');
    const key = document.querySelector('#key');
    key.value = localStorage.getItem('key');
    player = YUVCanvas.attach(document.getElementById('player'));
    bindRemoteInput();
    // globals.sendOffCanvas(document.getElementById('player'));
  };

  // ---------- 远程输入（原由 Flutter UI 层监听，TS UI 需自行绑定） ----------
  let remoteW = 0, remoteH = 0; // 远程分辨率（首帧起记录，鼠标坐标换算用）

  function onRemoteFrame(display, frame) {
    if (frame && frame.format) {
      remoteW = frame.format.displayWidth || frame.format.width || 0;
      remoteH = frame.format.displayHeight || frame.format.height || 0;
    }
    player.drawFrame(frame);
  }

  // DOM KeyboardEvent.key → RustDesk 键名（KEY_MAP 中的 VK_* 或单字符）
  const KEY_NAMES = {
    Enter: 'VK_RETURN', ' ': 'VK_SPACE', Backspace: 'VK_BACK', Tab: 'VK_TAB',
    Escape: 'VK_ESCAPE', Delete: 'VK_DELETE', Insert: 'VK_INSERT',
    Home: 'VK_HOME', End: 'VK_END', PageUp: 'VK_PRIOR', PageDown: 'VK_NEXT',
    ArrowUp: 'VK_UP', ArrowDown: 'VK_DOWN', ArrowLeft: 'VK_LEFT', ArrowRight: 'VK_RIGHT',
    CapsLock: 'VK_CAPITAL', Shift: 'VK_SHIFT', Control: 'VK_CONTROL', Alt: 'VK_MENU',
    Meta: 'Meta', Pause: 'VK_PAUSE', PrintScreen: 'VK_SNAPSHOT',
    F1: 'VK_F1', F2: 'VK_F2', F3: 'VK_F3', F4: 'VK_F4', F5: 'VK_F5', F6: 'VK_F6',
    F7: 'VK_F7', F8: 'VK_F8', F9: 'VK_F9', F10: 'VK_F10', F11: 'VK_F11', F12: 'VK_F12',
  };
  const NUMPAD_KEYS = {
    Decimal: 'VK_DECIMAL', Add: 'VK_ADD', Subtract: 'VK_SUBTRACT',
    Multiply: 'VK_MULTIPLY', Divide: 'VK_DIVIDE',
  };

  function toRustKeyName(e) {
    if (e.code && e.code.startsWith('Numpad')) {
      const n = e.code.slice('Numpad'.length);
      if (/^[0-9]$/.test(n)) return 'VK_NUMPAD' + n;
      if (NUMPAD_KEYS[n]) return NUMPAD_KEYS[n];
    }
    if (KEY_NAMES[e.key]) return KEY_NAMES[e.key];
    if (e.key && e.key.length === 1) return e.key; // 可打印字符
    return '';
  }

  function keyPayload(e, extra) {
    const p = Object.assign({ name: toRustKeyName(e) }, extra);
    if (e.altKey) p.alt = 'true';
    if (e.ctrlKey) p.ctrl = 'true';
    if (e.shiftKey) p.shift = 'true';
    if (e.metaKey) p.command = 'true';
    return p;
  }

  function bindRemoteInput() {
    const cv = document.getElementById('player');

    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    const mousePos = (e) => {
      const r = cv.getBoundingClientRect();
      const x = Math.round((e.clientX - r.left) / r.width * (remoteW || r.width));
      const y = Math.round((e.clientY - r.top) / r.height * (remoteH || r.height));
      return { x: String(x), y: String(y) };
    };
    const mouseBtn = (e) => (e.button === 2 ? 'right' : e.button === 1 ? 'wheel' : 'left');

    cv.addEventListener('mousemove', (e) => {
      const p = mousePos(e);
      const msg = JSON.stringify({ x: p.x, y: p.y });
      console.debug('[sundesk] send_mouse', msg);
      window.setByName('send_mouse', msg);
    });
    cv.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const p = mousePos(e);
      const msg = JSON.stringify({ type: 'down', buttons: mouseBtn(e), x: p.x, y: p.y });
      console.debug('[sundesk] send_mouse', msg);
      window.setByName('send_mouse', msg);
    });
    cv.addEventListener('mouseup', (e) => {
      e.preventDefault();
      const p = mousePos(e);
      const msg = JSON.stringify({ type: 'up', buttons: mouseBtn(e), x: p.x, y: p.y });
      console.debug('[sundesk] send_mouse', msg);
      window.setByName('send_mouse', msg);
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const msg = JSON.stringify({ type: 'wheel', buttons: 'wheel', y: String(Math.round(e.deltaY)) });
      console.debug('[sundesk] send_mouse', msg);
      window.setByName('send_mouse', msg);
    });

    // 键盘：输入框聚焦时（填 Host/Key/Id）不转发
    const isInput = (e) => e.target && e.target.tagName === 'INPUT';
    document.addEventListener('keydown', (e) => {
      if (isInput(e)) return;
      const name = toRustKeyName(e);
      if (!name) return;
      e.preventDefault();
      const msg = JSON.stringify(keyPayload(e, e.repeat ? { press: 'true' } : { down: 'true' }));
      console.debug('[sundesk] input_key', msg);
      window.setByName('input_key', msg);
    });
    document.addEventListener('keyup', (e) => {
      if (isInput(e)) return;
      const name = toRustKeyName(e);
      if (!name) return;
      const msg = JSON.stringify(keyPayload(e, {}));
      console.debug('[sundesk] input_key', msg);
      window.setByName('input_key', msg);
    });
  }

  window.connect = () => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const host = document.querySelector('#host');
    localStorage.setItem('custom-rendezvous-server', host.value);
    const id = document.querySelector('#id');
    localStorage.setItem('id', id.value);
    const key = document.querySelector('#key');
    localStorage.setItem('key', key.value);
    const func = async () => {
      const conn = globals.newConn();
      conn.setMsgbox(msgbox);
      conn.setDraw(onRemoteFrame);
      document.querySelector('div#status').style.display = 'block';
      document.querySelector('div#connect').style.display = 'none';
      document.querySelector('div#text').innerHTML = 'Connecting ...';
      await conn.start(id.value);
    };
    func();
  }

  let passwordPromptActive = false;
  function msgbox(type, title, text) {
    if (!globals.getConn()) return;
    if (type == 'input-password') {
      passwordPromptActive = true;
      document.querySelector('div#status').style.display = 'none';
      document.querySelector('div#password').style.display = 'block';
    } else if (passwordPromptActive) {
      // 密码确认框激活期间，忽略 connecting/首帧等消息，防止密码框被顶掉
      console.debug('[sundesk] msgbox suppressed (password prompt active):', type, title, text);
      return;
    } else if (!type) {
      document.querySelector('div#canvas').style.display = 'block';
      document.querySelector('div#password').style.display = 'none';
      document.querySelector('div#status').style.display = 'none';
    } else if (type == 'error') {
      document.querySelector('div#status').style.display = 'block';
      document.querySelector('div#canvas').style.display = 'none';
      document.querySelector('div#text').innerHTML = '<div style="color: red; font-weight: bold;">' + text + '</div>';
    } else {
      document.querySelector('div#password').style.display = 'none';
      document.querySelector('div#status').style.display = 'block';
      document.querySelector('div#text').innerHTML = '<div style="font-weight: bold;">' + text + '</div>';
    }
  }

  window.cancel = () => {
    passwordPromptActive = false;
    globals.close();
    document.querySelector('div#connect').style.display = 'block';
    document.querySelector('div#password').style.display = 'none';
    document.querySelector('div#status').style.display = 'none';
    document.querySelector('div#canvas').style.display = 'none';
  }

  window.confirm = () => {
    passwordPromptActive = false;
    const password = document.querySelector('input#password').value;
    if (password) {
      document.querySelector('div#password').style.display = 'none';
      globals.getConn().login(password);
    }
  }
}