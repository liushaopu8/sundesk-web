import "./style.css";
import "./connection";
import * as globals from "./globals";
import * as localfs from "./localfs";

// JS 核心（globals.js/connection.ts）期望的全局回调，原由 Flutter host（web_model.dart）安装。
// TS 精简 UI 独立运行时必须自己补上，否则连接成功后 pushEvent/onRgba 会抛 ReferenceError。
// 交互事件已通过 conn.setMsgbox/setDraw 走本地回调，这里基本是 no-op + 调试日志。
window.onGlobalEvent = (message) => {
  try {
    const evt = typeof message === 'string' ? JSON.parse(message) : message;
    if (evt?.name === 'chat') {
      window.sundeskOnChat?.(evt.text ?? '');
    } else if (evt?.name === 'peer_info') {
      // pushEvent 经 jsonfyForDart 把非字符串值 JSON.stringify 了，platform 实际是 '"Android"'
      const platform = String(evt.platform ?? '').replace(/"/g, '');
      const nav = window.sundeskMobileNav;
      if (nav && platform === 'Android') nav.show();
      else if (nav) nav.hide();
      // 手机/键盘/显示器菜单的可见性依赖 peer_info，刷新胶囊
      window.sbRefreshAll?.();
    } else {
      console.debug('[sundesk] onGlobalEvent:', evt);
    }
  } catch (e) {
    console.debug('[sundesk] onGlobalEvent:', message);
  }
};
window.onRgba = () => {}; // TS UI 用自带 YUVCanvas player 绘制，忽略核心的 rgba 通道
window.onRegisteredEvent = () => {};

  // 线性图标（Lucide 风格，18px / stroke 2）
  const ICONS = {
    back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>',
    up: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>',
    refresh: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>',
    home: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>',
    plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
    trash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/></svg>',
    eye: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
    send: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
    receive: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>',
    folder: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  };
  const iconBtn = (icon, fn, title, extra = '') =>
    `<button class="fm-icon" onclick="${fn}" title="${title}" ${extra}>${ICONS[icon]}</button>`;

  const app = document.querySelector('#app');

if (app) {
  app.innerHTML = `
  <div id="connect" style="text-align: center">
    <table style="display: inline-block">
    <tr><td><span>Host: </span></td><td><input id="host" /></td></tr>
    <tr><td><span>Key: </span></td><td><input id="key" /></td></tr>
    <tr><td><span>Id: </span></td><td><input id="id" /></td></tr>
    <tr><td></td><td style="padding-top: 8px;">
      <div class="connect-split">
        <button id="connect-btn" onclick="connect();">连接</button>
        <button id="mode-toggle" onclick="toggleModeDropdown(event)" title="更多连接方式" aria-label="更多连接方式">▾</button>
        <div id="mode-dropdown" style="display: none;">
          <div class="mode-opt" onclick="connect('file')">文件传输</div>
        </div>
      </div>
    </td></tr>
  </table></div>
  <div id="password" style="display: none;">
    <div id="password-hint" style="color: red; font-weight: bold; margin-bottom: 6px;"></div>
    <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
      <input type="password" id="password" style="flex: 1;" />
      <button id="toggle-password" type="button" onclick="togglePassword()" style="cursor: pointer; padding: 4px 8px;">👁</button>
    </div>
    <button id="confirm" onclick="confirmLogin()">Confirm</button>
    <button id="cancel" onclick="cancel();">Cancel</button>
  </div>
  <div id="status" style="display: none;">
    <div id="text" style="line-height: 2em"></div>
    <button id="cancel" onclick="cancel();">Cancel</button>
  </div>
  <div id="canvas" style="display: none;">
    <canvas id="player"></canvas>
    <canvas id="test-yuv-decoder-canvas"></canvas>
    <!-- 移动端悬浮导航条：对齐 Flutter Windows DraggableMobileActions：Back / Home / Recent + 隐藏箭头，可拖拽、位置持久化，仅 Android 被控端显示 -->
    <div id="nav-bar" class="nav-bar" title="移动端导航键（Back/Home/最近任务）">
      <button class="nav-btn" type="button" data-nav="back" title="返回 Back">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      </button>
      <button class="nav-btn" type="button" data-nav="home" title="主屏 Home">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
      </button>
      <button class="nav-btn" type="button" data-nav="recent" title="最近任务 Recent apps">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
      </button>
      <span class="nav-sep"></span>
      <button class="nav-btn nav-hide" type="button" data-nav="hide" title="隐藏导航条（顶部工具条手机图标可唤回）">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg>
      </button>
    </div>
  </div>
  <div id="session-bar">
    <div class="sb-pill" id="sb-pill"></div>
    <div id="sb-chat" class="sb-chat" style="display: none;">
      <div class="sb-chat-head">文字聊天 Chat</div>
      <div id="sb-chat-msgs" class="sb-chat-msgs"></div>
      <div class="sb-chat-input">
        <input id="sb-chat-text" placeholder="输入消息..." />
        <button type="button" onclick="sundeskSendChat()">发送</button>
      </div>
    </div>
    <div class="sb-menu" id="sb-menu"></div>
  </div>
  <div id="filemgr" style="display: none; text-align: left; max-width: 1440px; margin: 0 auto;">
    <div class="fm-head">
      <div style="font-weight: bold;">文件传输 - <span id="filemgr-id"></span></div>
      <div><button onclick="cancel();">断开</button></div>
    </div>
    <div class="fm-grid">
      <!-- 本地栏（对齐 Flutter Windows FileManagerView：栏头平台图标 + 名称，面包屑 + 工具栏 + 列表） -->
      <div class="fm-pane">
        <div class="fm-pane-head"><span class="fm-plat fm-plat-local"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg></span><span class="fm-pane-name">本地计算机</span></div>
        <div class="fm-crumb" id="loc-crumb"></div>
        <div class="fm-toolbar">
          ${iconBtn('back', 'locBack()', '返回')}
          ${iconBtn('up', 'locUp()', '父目录')}
          <input type="search" id="loc-search" placeholder="搜索/跳转路径" oninput="locApplyFilter()" />
          <button class="fm-pick" onclick="locPick()" title="选择/授权本地文件夹（Chrome/Edge）">${ICONS.folder.replace('width="18"', 'width="14"')} 选择文件夹</button>
          ${iconBtn('refresh', 'locRefresh()', '刷新')}
        </div>
        <div class="fm-actions">
          <span class="fm-action-cluster">
            ${iconBtn('home', 'locHome()', '默认目录')}
            ${iconBtn('plus', 'locMkdir()', '新建文件夹')}
            ${iconBtn('trash', 'locDelete()', '删除所选')}
            ${iconBtn('check', 'locToggleSelectAll()', '全选/取消全选')}
            <label class="fm-hidden"><input type="checkbox" id="loc-hidden" onchange="locRefresh()" /> 显示隐藏</label>
          </span>
          <button class="fm-primary" onclick="locSend()" title="上传所选到远程当前目录">发送 ${ICONS.send.replace('width="18"', 'width="14"')}</button>
        </div>
        <table class="fm-list">
          <thead><tr>
            <th class="fm-cb"></th>
            <th class="fm-sortable" data-sort="name" onclick="locSort('name')">名称</th>
            <th class="fm-sortable" data-sort="mt" onclick="locSort('mt')">修改时间</th>
            <th class="fm-sortable fm-num" data-sort="size" onclick="locSort('size')">大小</th>
          </tr></thead>
          <tbody id="loc-list"></tbody>
        </table>
        <div class="fm-status" id="loc-status"></div>
      </div>
      <!-- 远程栏 -->
      <div class="fm-pane">
        <div class="fm-pane-head"><span class="fm-plat fm-plat-android"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg></span><span class="fm-pane-name">远程计算机</span></div>
        <div class="fm-crumb" id="fm-crumb"></div>
        <div class="fm-toolbar">
          ${iconBtn('back', 'fmBack()', '返回')}
          ${iconBtn('up', 'fmUp()', '父目录')}
          <input type="search" id="fm-search" placeholder="搜索/跳转路径" oninput="fmApplyFilter()" />
          ${iconBtn('refresh', 'fmRefresh()', '刷新')}
        </div>
        <div class="fm-actions">
          <button class="fm-primary" onclick="fmReceive()" title="发送所选到本地当前目录">发送 ${ICONS.receive.replace('width="18"', 'width="14"')}</button>
          <span class="fm-action-cluster">
            ${iconBtn('home', 'fmHome()', '默认目录')}
            ${iconBtn('plus', 'fmMkdir()', '新建文件夹')}
            ${iconBtn('trash', 'fmDelete()', '删除所选')}
            ${iconBtn('check', 'fmToggleSelectAll()', '全选/取消全选')}
            <label class="fm-hidden"><input type="checkbox" id="fm-hidden" onchange="fmRefresh()" /> 显示隐藏</label>
          </span>
        </div>
        <table class="fm-list">
          <thead><tr>
            <th class="fm-cb"></th>
            <th class="fm-sortable" data-sort="name" onclick="fmSort('name')">名称</th>
            <th class="fm-sortable" data-sort="mt" onclick="fmSort('mt')">修改时间</th>
            <th class="fm-sortable fm-num" data-sort="size" onclick="fmSort('size')">大小</th>
          </tr></thead>
          <tbody id="fm-list"></tbody>
        </table>
        <div class="fm-status" id="fm-status"></div>
      </div>
      <!-- 传输栏（对齐 Windows statusList，常驻第三栏） -->
      <div class="fm-pane" id="fm-transfers-pane">
        <div class="fm-pane-title">传输中</div>
        <div id="filemgr-transfers"><div class="fm-transfers-empty">暂无传输任务</div></div>
      </div>
    </div>
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

    // 键盘：输入框聚焦时（填 Host/Key/Id/搜索框）不转发
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

  window.connect = (mode) => {
    // 每次连接从头开始：复位密码框状态（连接中断时 flag 可能残留，会抑制后续连接的首帧）
    passwordPromptActive = false;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const host = document.querySelector('#host');
    localStorage.setItem('custom-rendezvous-server', host.value);
    const id = document.querySelector('#id');
    localStorage.setItem('id', id.value);
    const key = document.querySelector('#key');
    localStorage.setItem('key', key.value);
    // 连接模式：主按钮默认远程控制；下拉项传 'file' 走文件传输（甫总 2026-08-24）
    currentMode = mode || 'remote';
    const func = async () => {
      const conn = globals.newConn();
      conn.setMsgbox(msgbox);
      conn.setDraw(onRemoteFrame);
      conn.setFileResponse(onFileResponse);
      document.querySelector('div#status').style.display = 'block';
      document.querySelector('div#connect').style.display = 'none';
      document.querySelector('div#text').innerHTML = 'Connecting ...';
      await conn.start(id.value, mode);
    };
    func();
  }

  // ============ 文件传输 UI（step3：本地 | 远程 | 传输中 三栏） ============
  let currentMode = 'remote';
  let passwordPromptActive = false;

  // kiosk 模式自动填充密码（甫总 2026-08-25）：不再让客户在网页上输密码，
  // 收到密码请求时直接携带此密码登录。密码被拒（re-input-password）则回退弹框人工输入。
  // 注意：JS 明文可见，仅限公开展示用设备，勿用于敏感设备。
  const KIOSK_PASSWORD = 'SunDesk@2026';

  // ---- 连接方式下拉（甫总 2026-08-24）：默认=远程控制；下拉=文件传输（后续扩展） ----
  window.toggleModeDropdown = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const dd = document.querySelector('#mode-dropdown');
    if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
  };
  document.addEventListener('click', (e) => {
    // 点击下拉外部时关闭
    const dd = document.querySelector('#mode-dropdown');
    if (dd && dd.style.display !== 'none' && e.target && !e.target.closest('.connect-split')) {
      dd.style.display = 'none';
    }
  });

  // ---- 通用工具 ----
  function fmtSize(n) {
    if (n === undefined || n === null) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
    return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }
  function fmtTime(t) {
    if (!t) return '';
    try { return new Date(t * 1000).toLocaleString(); } catch (e) { return ''; }
  }
  function isDir(e) { return e.entry_type === 0 || e.entry_type === 2 || e.entry_type === 3; }
  function fmJoin(dir, name) {
    if (!dir) return '/' + name;
    const sep = dir.includes('\\') ? '\\' : '/';
    if (dir.endsWith(sep)) return dir + name;
    return dir + sep + name;
  }
  function parentPath(p) {
    if (!p || p === '/') return null;
    const sep = p.includes('\\') ? '\\' : '/';
    const t = p.replace(/[\\/]+$/, '');
    const idx = t.lastIndexOf(sep);
    return idx <= 0 ? sep : t.substring(0, idx);
  }

  // ---- 远程栏状态 ----
  let fmPath = '';           // 当前远程路径（首次加载根后为绝对路径）
  let fmEntries = [];        // 当前目录条目（原始）
  let fmFiltered = [];       // 搜索过滤后的条目
  let fmSelected = new Set(); // 选中的名称
  let fmSortKey = 'name', fmSortDesc = false;
  let fmHistory = [];        // 返回历史

  function fmSetStatus(s) {
    const el = document.querySelector('#fm-status');
    if (el) el.textContent = s;
  }
  function fmApplyFilter() {
    const q = (document.querySelector('#fm-search')?.value || '').trim().toLowerCase();
    fmFiltered = q ? fmEntries.filter(e => e.name.toLowerCase().includes(q)) : fmEntries.slice();
    fmRender();
  }
  function fmSorted() {
    const arr = fmFiltered.slice();
    arr.sort((a, b) => {
      const da = isDir(a) ? 0 : 1, db = isDir(b) ? 0 : 1;
      if (da !== db) return da - db;
      let r;
      if (fmSortKey === 'size') r = (a.size || 0) - (b.size || 0);
      else if (fmSortKey === 'mt') r = (a.modified_time || 0) - (b.modified_time || 0);
      else r = a.name.localeCompare(b.name);
      return fmSortDesc ? -r : r;
    });
    return arr;
  }

  async function fmLoad(path, pushHistory = true) {
    const conn = globals.getConn();
    if (!conn) return;
    if (pushHistory && fmPath) fmHistory.push(fmPath);
    const showHidden = document.querySelector('#fm-hidden')?.checked;
    fmSetStatus('读取目录中…');
    try {
      const dir = await conn.readRemoteDir(path, !!showHidden);
      fmPath = dir.path || path;
      fmEntries = (dir.entries || []).slice();
      fmApplyFilter();
      fmSetStatus(fmEntries.length + ' 项');
    } catch (e) {
      fmSetStatus('读取失败: ' + (e?.message || e));
    }
  }

  // ---- 面包屑（对齐 Windows buildBread：路径段可点逐级跳转） ----
  function crumbHtml(segs, onClickName) {
    if (!segs.length) return '';
    let html = '';
    segs.forEach((s, i) => {
      if (i > 0) html += '<span class="fm-crumb-sep">/</span>';
      if (i === segs.length - 1) {
        html += '<span class="fm-crumb-cur" title="' + escAttr(s) + '">' + escHtml(s) + '</span>';
      } else {
        html += '<a data-crumb-idx="' + i + '">' + escHtml(s) + '</a>';
      }
    });
    return html;
  }
  function escHtml(s) { return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
  function escAttr(s) { return escHtml(s).replace(/"/g, '&quot;'); }

  function renderFmCrumb() {
    const box = document.querySelector('#fm-crumb');
    if (!box) return;
    if (!fmPath) { box.innerHTML = ''; return; }
    const segs = fmPath.split(/[\\/]/).filter(Boolean);
    box.innerHTML = '<a data-crumb-root="1" title="根目录">⌂</a>' + (segs.length ? '<span class="fm-crumb-sep">/</span>' : '') + crumbHtml(segs);
    box.querySelectorAll('a[data-crumb-idx]').forEach(a => a.onclick = () => {
      const idx = Number(a.dataset.crumbIdx);
      const isWinDrive = /^[A-Za-z]:$/.test(segs[0]);
      let p;
      if (isWinDrive) p = segs[0] + '\\' + segs.slice(1, idx + 1).join('\\');
      else p = '/' + segs.slice(0, idx + 1).join('/');
      fmLoad(p);
    });
    const root = box.querySelector('a[data-crumb-root]');
    if (root) root.onclick = () => fmLoad('/');
  }

  function renderLocCrumb() {
    const box = document.querySelector('#loc-crumb');
    if (!box) return;
    const rootName = locHandle ? (locHandle.name || '已授权目录') : '本地';
    const segs = locPath.slice();
    box.innerHTML = '<a data-loc-root="1" title="授权根目录">⌂ ' + escHtml(rootName) + '</a>' + (segs.length ? '<span class="fm-crumb-sep">/</span>' : '') + crumbHtml(segs);
    box.querySelectorAll('a[data-crumb-idx]').forEach(a => a.onclick = () => {
      locPath = locPath.slice(0, Number(a.dataset.crumbIdx) + 1);
      locSelected.clear(); locRefresh();
    });
    const root = box.querySelector('a[data-loc-root]');
    if (root) root.onclick = () => { locPath = []; locSelected.clear(); locRefresh(); };
  }

  function fmRender() {
    // 当前路径作为搜索框占位提示（甫总 2026-08-24）
    renderFmCrumb();
    const search = document.querySelector('#fm-search');
    if (search) search.placeholder = fmPath || '/';
    const tbody = document.querySelector('#fm-list');
    tbody.innerHTML = '';
    const rows = fmSorted();
    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.textContent = '（空目录）';
      td.style.cssText = 'color:#94a3b8; text-align:center; padding:16px;';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    for (const e of rows) {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      const cb = document.createElement('td');
      cb.className = 'fm-cb';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = fmSelected.has(e.name);
      chk.onclick = (ev) => ev.stopPropagation();
      chk.onchange = () => {
        if (chk.checked) fmSelected.add(e.name); else fmSelected.delete(e.name);
        fmRender();
      };
      cb.appendChild(chk);
      const tdName = document.createElement('td');
      const icon = isDir(e)
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg> '
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg> ';
      tdName.innerHTML = icon;
      tdName.appendChild(document.createTextNode(e.name));
      tdName.style.cssText = 'word-break: break-all;';
      const tdMt = document.createElement('td');
      tdMt.className = 'fm-muted';
      tdMt.textContent = fmtTime(e.modified_time);
      const tdSize = document.createElement('td');
      tdSize.className = 'fm-muted fm-num';
      tdSize.textContent = isDir(e) ? '' : fmtSize(e.size);
      if (isDir(e)) {
        tr.ondblclick = () => fmOpen(e.name);
        tr.onclick = () => fmOpen(e.name);
      }
      tr.appendChild(cb);
      tr.appendChild(tdName);
      tr.appendChild(tdMt);
      tr.appendChild(tdSize);
      tbody.appendChild(tr);
    }
  }

  function fmOpen(name) { fmLoad(fmJoin(fmPath, name)); }
  window.fmBack = () => {
    const prev = fmHistory.pop();
    if (prev !== undefined) fmLoad(prev, false);
  };
  window.fmUp = () => {
    const p = parentPath(fmPath);
    if (p !== null) fmLoad(p);
  };
  window.fmHome = () => fmLoad('');
  window.fmRefresh = () => fmLoad(fmPath, false);
  window.fmSort = (k) => {
    if (fmSortKey === k) fmSortDesc = !fmSortDesc;
    else { fmSortKey = k; fmSortDesc = false; }
    fmRender();
  };
  window.fmMkdir = async () => {
    const name = prompt('新建文件夹名称:');
    if (!name) return;
    const conn = globals.getConn();
    if (!conn) return;
    fmSetStatus('创建中…');
    try {
      await conn.createRemoteDir(fmJoin(fmPath, name));
      fmSetStatus('已创建: ' + name);
      fmRefresh();
    } catch (e) {
      fmSetStatus('创建失败: ' + (e?.message || e));
    }
  };
  window.fmToggleSelectAll = () => {
    const all = fmSorted();
    const allSelected = all.length > 0 && all.every(e => fmSelected.has(e.name));
    if (allSelected) {
      all.forEach(e => fmSelected.delete(e.name));
    } else {
      all.forEach(e => fmSelected.add(e.name));
    }
    fmRender();
  };
  window.fmDelete = async () => {
    if (!fmSelected.size) { fmSetStatus('未选择任何条目'); return; }
    const n = fmSelected.size;
    if (!confirm('确定删除远程的 ' + n + ' 个条目？（目录递归删除，不可恢复）')) return;
    const conn = globals.getConn();
    if (!conn) return;
    const targets = [];
    fmSelected.forEach(name => {
      const e = fmEntries.find(x => x.name === name);
      if (e) targets.push({ full: fmJoin(fmPath, name), isDir: isDir(e) });
    });
    fmSelected.clear();
    fmRender();
    fmSetStatus('删除中…');
    // 带回执：成功/失败都明确反馈（Android 端权限不足等会回 error）
    const results = await Promise.allSettled(
      targets.map(t => conn.removeRemotePath(t.full, t.isDir, true))
    );
    const ok = results.filter(r => r.status === 'fulfilled').length;
    const fails = results.filter(r => r.status === 'rejected');
    fmSetStatus(fails.length
      ? '删除: 成功 ' + ok + '，失败 ' + fails.length + '（' + (fails[0].reason?.message || '未知原因') + '）'
      : '已删除 ' + ok + ' 个条目');
    fmRefresh();
  };
  window.fmReceive = () => {
    const conn = globals.getConn();
    if (!conn) return;
    if (!fmSelected.size) { fmSetStatus('未选择任何条目'); return; }
    console.info('[sundesk-dl] fmReceive click: selected=', [...fmSelected], 'fmPath=', fmPath);
    const includeHidden = !!document.querySelector('#fm-hidden')?.checked;
    fmSelected.forEach(name => {
      const full = fmJoin(fmPath, name);
      const { id, promise } = conn.downloadRemotePath(full, includeHidden);
      console.info('[sundesk-dl] queued job', id, full);
      const row = ensureTransferRow(id, name, 'down');
      row.dataset.target = full;
      promise.then(() => {
        finishTransferRow(id, name, true);
        fmSetStatus('下载完成: ' + name);
      }).catch((e) => {
        finishTransferRow(id, name, false, e?.message || String(e));
        fmSetStatus('下载失败: ' + name + ' - ' + (e?.message || e));
      });
    });
  };

  // ---- 本地栏状态 ----
  let locHandle = null;     // 授权目录句柄
  let locPath = [];         // 当前路径（根目录下的 name 数组）
  let locEntries = [];
  let locFiltered = [];
  let locSelected = new Set();
  let locSortKey = 'name', locSortDesc = false;
  let locHistory = [];

  function locSetStatus(s) {
    const el = document.querySelector('#loc-status');
    if (el) el.textContent = s;
  }
  function locCrumb() {
    if (!locHandle) return '未授权本地目录，点「选择文件夹」';
    const root = locHandle.name || '已授权目录';
    return '本地: ' + (locPath.length ? root + '/' + locPath.join('/') : root);
  }
  function locApplyFilter() {
    const q = (document.querySelector('#loc-search')?.value || '').trim().toLowerCase();
    locFiltered = q ? locEntries.filter(e => e.name.toLowerCase().includes(q)) : locEntries.slice();
    locRender();
  }
  function locSorted() {
    const arr = locFiltered.slice();
    arr.sort((a, b) => {
      const da = a.kind === 'dir' ? 0 : 1, db = b.kind === 'dir' ? 0 : 1;
      if (da !== db) return da - db;
      let r;
      if (locSortKey === 'size') r = (a.size || 0) - (b.size || 0);
      else if (locSortKey === 'mt') r = (a.modifiedTime || 0) - (b.modifiedTime || 0);
      else r = a.name.localeCompare(b.name);
      return locSortDesc ? -r : r;
    });
    return arr;
  }

  async function locRefresh() {
    if (!locHandle) { locSetStatus('未授权本地目录，点击「选择文件夹」'); locRender(); return; }
    locSetStatus('读取中…');
    try {
      const entries = await localfs.listDir(locHandle, locPath);
      locEntries = entries;
      locApplyFilter();
      locSetStatus(locEntries.length + ' 项');
    } catch (e) {
      locSetStatus('读取失败: ' + (e?.message || e));
    }
  }

  function locRender() {
    // 当前路径作为搜索框占位提示（甫总 2026-08-24）
    renderLocCrumb();
    const search = document.querySelector('#loc-search');
    if (search) search.placeholder = locCrumb();
    const tbody = document.querySelector('#loc-list');
    tbody.innerHTML = '';
    if (!locHandle) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.textContent = localfs.isLocalFSSupported()
        ? '点击「选择文件夹」授权后即可浏览/管理本地目录'
        : '当前浏览器不支持本地目录浏览（需 Chrome/Edge），发送请用文件选择';
      td.style.cssText = 'color:#94a3b8; text-align:center; padding:16px;';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    const rows = locSorted();
    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.textContent = '（空目录）';
      td.style.cssText = 'color:#94a3b8; text-align:center; padding:16px;';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    for (const e of rows) {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      const cb = document.createElement('td');
      cb.className = 'fm-cb';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = locSelected.has(e.name);
      chk.onclick = (ev) => ev.stopPropagation();
      chk.onchange = () => {
        if (chk.checked) locSelected.add(e.name); else locSelected.delete(e.name);
        locRender();
      };
      cb.appendChild(chk);
      const tdName = document.createElement('td');
      const icon = e.kind === 'dir'
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg> '
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg> ';
      tdName.innerHTML = icon;
      tdName.appendChild(document.createTextNode(e.name));
      tdName.style.cssText = 'word-break: break-all;';
      const tdMt = document.createElement('td');
      tdMt.className = 'fm-muted';
      tdMt.textContent = fmtTime(e.modifiedTime);
      const tdSize = document.createElement('td');
      tdSize.className = 'fm-muted fm-num';
      tdSize.textContent = e.kind === 'dir' ? '' : fmtSize(e.size);
      if (e.kind === 'dir') {
        tr.ondblclick = () => locOpen(e.name);
        tr.onclick = () => locOpen(e.name);
      }
      tr.appendChild(cb);
      tr.appendChild(tdName);
      tr.appendChild(tdMt);
      tr.appendChild(tdSize);
      tbody.appendChild(tr);
    }
  }

  function locOpen(name) {
    if (locHistory[locHistory.length - 1]?.join('/') !== locPath.join('/')) {
      locHistory.push(locPath.slice());
    }
    locPath.push(name);
    locSelected.clear();
    locRefresh();
  }
  window.locPick = async () => {
    if (!localfs.isLocalFSSupported()) {
      locSetStatus('当前浏览器不支持（需 Chrome/Edge），发送请直接用文件选择');
      return;
    }
    locSetStatus('等待授权…');
    const ok = await localfs.pickRootDir();
    if (!ok) { locSetStatus('未选择目录或授权失败'); return; }
    locHandle = await localfs.getRootHandle();
    locPath = [];
    locSelected.clear();
    locHistory = [];
    locRefresh();
  };
  window.locHome = async () => {
    if (!locHandle) { locPick(); return; }
    locPath = [];
    locSelected.clear();
    locRefresh();
  };
  window.locBack = () => {
    const prev = locHistory.pop();
    if (prev) { locPath = prev; locSelected.clear(); locRefresh(); }
  };
  window.locUp = () => {
    if (!locPath.length) return;
    locPath.pop();
    locSelected.clear();
    locRefresh();
  };
  window.locRefresh = () => locRefresh();
  window.locApplyFilter = () => locApplyFilter();
  window.fmApplyFilter = () => fmApplyFilter();
  window.locSort = (k) => {
    if (locSortKey === k) locSortDesc = !locSortDesc;
    else { locSortKey = k; locSortDesc = false; }
    locRender();
  };
  window.locMkdir = async () => {
    if (!locHandle) { locSetStatus('请先选择本地文件夹'); return; }
    const name = prompt('新建文件夹名称:');
    if (!name) return;
    const ok = await localfs.mkdir(locHandle, locPath, name);
    locSetStatus(ok ? '已创建' : '创建失败（重名或无权限）');
    if (ok) setTimeout(locRefresh, 300);
  };
  window.locDelete = async () => {
    if (!locHandle) { locSetStatus('请先选择本地文件夹'); return; }
    if (!locSelected.size) { locSetStatus('未选择任何条目'); return; }
    const n = locSelected.size;
    if (!confirm('确定删除本地的 ' + n + ' 个条目？（目录递归删除，不可恢复）')) return;
    let okAll = true;
    for (const name of locSelected) {
      const e = locEntries.find(x => x.name === name);
      if (!e) continue;
      const ok = await localfs.removeEntry(locHandle, locPath, name, e.kind);
      if (!ok) okAll = false;
    }
    locSelected.clear();
    locSetStatus(okAll ? '已删除' : '部分删除失败');
    locRefresh();
  };
  window.locToggleSelectAll = () => {
    const all = locSorted();
    const allSelected = all.length > 0 && all.every(e => locSelected.has(e.name));
    if (allSelected) {
      all.forEach(e => locSelected.delete(e.name));
    } else {
      all.forEach(e => locSelected.add(e.name));
    }
    locRender();
  };

  // 递归收集本地文件（目录上传：文件名用相对路径，服务端按路径重建子目录）
  async function locCollectFiles(path, prefix, out) {
    const entries = await localfs.listDir(locHandle, path);
    for (const e of entries) {
      const rel = prefix ? prefix + '/' + e.name : e.name;
      if (e.kind === 'dir') {
        await locCollectFiles([...path, e.name], rel, out);
      } else {
        const data = await localfs.readFile(locHandle, [...path, e.name]);
        out.push({ name: rel, size: data.length, modifiedTime: e.modifiedTime, data });
      }
    }
  }

  window.locSend = async () => {
    const conn = globals.getConn();
    if (!conn) return;
    if (!locSelected.size) { locSetStatus('未选择任何条目'); return; }
    if (!locHandle) { locSetStatus('请先选择本地文件夹'); return; }
    if (!fmPath) { locSetStatus('远程目录未就绪'); return; }
    const selected = locEntries.filter(e => locSelected.has(e.name));
    locSetStatus('准备上传…');
    try {
      const files = [];
      for (const e of selected) {
        if (e.kind === 'dir') {
          await locCollectFiles([...locPath, e.name], e.name, files);
        } else {
          const data = await localfs.readFile(locHandle, [...locPath, e.name]);
          files.push({ name: e.name, size: data.length, modifiedTime: e.modifiedTime, data });
        }
      }
      if (!files.length) { locSetStatus('没有可上传的文件'); return; }
      const { id, promise } = conn.uploadRemotePath(fmPath, files);
      const firstName = files.length === 1 ? files[0].name : files[0].name + ' 等 ' + files.length + ' 个文件';
      ensureTransferRow(id, firstName, 'up');
      promise.then(() => {
        finishTransferRow(id, firstName, true);
        locSetStatus('上传完成: ' + files.length + ' 个文件');
        setTimeout(fmRefresh, 600);
      }).catch((e) => {
        finishTransferRow(id, firstName, false, e?.message || String(e));
        locSetStatus('上传失败: ' + (e?.message || e));
      });
    } catch (e) {
      locSetStatus('上传准备失败: ' + (e?.message || e));
    }
  };

  // ---- 传输栏 ----
  let transferCount = 0;

  function refreshTransfersPane() {
    // 对齐 Windows：传输栏常驻；无任务时显示占位
    const box = document.querySelector('#filemgr-transfers');
    if (box && transferCount === 0) {
      box.innerHTML = '<div class="fm-transfers-empty">暂无传输任务</div>';
    }
  }
  function ensureTransferRow(id, name, kind) {
    transferCount++;
    let row = document.querySelector('#transfer-' + id);
    if (row) { row.querySelector('.t-name').textContent = name; return row; }
    const empty = document.querySelector('#filemgr-transfers .fm-transfers-empty');
    if (empty) empty.remove();
    // 方向箭头对齐 Windows statusList getIcon：上传=向上，下载=向下
    const arrow = kind === 'up'
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>';
    row = document.createElement('div');
    row.id = 'transfer-' + id;
    row.className = 'fm-transfer-row';
    row.innerHTML =
      '<div style="display:flex;justify-content:space-between;gap:6px;align-items:center;">' +
      '<span class="t-dir" style="color:#024eff;display:inline-flex;">' + arrow + '</span>' +
      '<span class="t-name" style="word-break:break-all;flex:1;"></span>' +
      '<span class="t-pct" style="white-space:nowrap;">0%</span>' +
      '<button class="t-cancel" title="取消">✕</button></div>' +
      '<div class="t-bar-wrap"><div class="t-bar" style="width:0%;"></div></div>' +
      '<div class="t-meta"></div>';
    row.querySelector('.t-name').textContent = name;
    row.querySelector('.t-cancel').onclick = () => {
      const conn = globals.getConn();
      if (conn) conn.cancelTransfer(id);
      row.dataset.cancelled = '1';
      row.querySelector('.t-meta').textContent = '已取消';
      row.querySelector('.t-cancel').disabled = true;
    };
    document.querySelector('#filemgr-transfers').appendChild(row);
    refreshTransfersPane();
    return row;
  }
  function updateTransferRow(id, name, received, total) {
    const row = document.querySelector('#transfer-' + id);
    if (!row) return;
    const pct = total > 0 ? Math.min(100, Math.round(received / total * 100)) : 0;
    row.querySelector('.t-name').textContent = name;
    row.querySelector('.t-pct').textContent = pct + '%';
    row.querySelector('.t-bar').style.width = pct + '%';
    row.querySelector('.t-meta').textContent = fmtSize(received) + (total ? ' / ' + fmtSize(total) : '');
  }
  function finishTransferRow(id, name, ok, errMsg) {
    transferCount = Math.max(0, transferCount - 1);
    const row = document.querySelector('#transfer-' + id);
    if (!row) return;
    // 用户主动取消：保持「已取消」状态，不被 reject 的失败提示覆盖
    if (row.dataset.cancelled === '1') return;
    row.querySelector('.t-pct').textContent = ok ? '✓ 完成' : '✗ 失败';
    row.querySelector('.t-bar').style.width = '100%';
    row.querySelector('.t-bar').style.background = ok ? '#16A34A' : '#DC2626';
    row.querySelector('.t-meta').textContent = ok ? '完成' : (errMsg || '未知错误');
    const btn = row.querySelector('.t-cancel');
    if (btn) btn.disabled = true;
  }

  // ---- 文件响应钩子（dir/digest/block/done/error 的核心处理在 connection.ts） ----
  function onFileResponse(fr) {
    if (fr.error) console.warn('[sundesk] file error', fr.error);
    if (fr.done && !fr.done.id) console.debug('[sundesk] file op done', fr.done);
  }

  function bindTransferProgress(conn) {
    conn.onDownloadProgress = (jobId, fileName, received, total) => {
      updateTransferRow(jobId, fileName, received, total);
    };
    conn.onUploadProgress = (jobId, fileName, sent, total) => {
      updateTransferRow(jobId, fileName, sent, total);
    };
    // 下载完成保存：本地已授权 → 写入【当前浏览的本地目录】（不是授权根目录）；
    // 未授权则返回 false，走浏览器下载（保留原文件名）。
    conn.onDownloadFile = async (jobId, relPath, blob) => {
      console.info('[sundesk-dl] save hook: locHandle=', !!locHandle, 'locPath=', JSON.stringify(locPath), 'file=', relPath, blob.size, 'bytes');
      if (!locHandle) return false;
      const parts = [...locPath, ...relPath.split('/').filter(Boolean)];
      if (!parts.length) return false;
      const ok = await localfs.writeFile(locHandle, parts, new Uint8Array(await blob.arrayBuffer()));
      console.info('[sundesk-dl] writeFile ->', ok, parts.join('/'));
      if (ok) {
        const row = document.querySelector('#transfer-' + jobId);
        if (row) row.querySelector('.t-meta').textContent = '已保存到本地: ' + parts.join('/');
        locRefresh();
      }
      return ok;
    };
    // 空目录 / 仅隐藏文件：探测完成后给个准确提示
    conn.onEmptyDownload = (path, hidden) => {
      const fm = document.querySelector('#fm-status');
      if (fm) fm.textContent = hidden > 0
        ? '目标仅含 ' + hidden + ' 个隐藏文件（勾选「显示隐藏」后发送可包含）'
        : '空文件夹，无文件可下载';
    };
  }

  // 进入文件传输会话时自动恢复上次授权的本地目录（IndexedDB 句柄）
  async function restoreLocalRoot() {
    if (!localfs.isLocalFSSupported()) { locRefresh(); return; }
    locHandle = await localfs.getRootHandle();
    locRefresh();
  }

  function msgbox(type, title, text) {
    if (!globals.getConn()) return;
    // 文件传输会话就绪：显示文件管理器，隐藏其他面板
    if (type == 'file-ready') {
      passwordPromptActive = false;
      document.querySelector('div#status').style.display = 'none';
      document.querySelector('div#password').style.display = 'none';
      const idVal = localStorage.getItem('id') || '';
      document.querySelector('#filemgr-id').textContent = idVal;
      document.querySelector('#filemgr').style.display = 'block';
      // 复位传输栏与选择状态
      document.querySelector('#filemgr-transfers').innerHTML = '';
      transferCount = 0;
      refreshTransfersPane();
      fmSelected.clear();
      locSelected.clear();
      locPath = [];
      locHistory = [];
      bindTransferProgress(globals.getConn());
      restoreLocalRoot();
      fmPath = '';
      fmLoad('');
      return;
    }
    if (type == 're-input-password' || type == 'session-login-re-password') {
      // 密码被拒重输（含 kiosk 自动密码不对）：清空输入框并弹框让用户手动输入
      passwordPromptActive = true;
      document.querySelector('input#password').value = '';
      const hint = document.querySelector('#password-hint');
      if (hint) hint.textContent = (title || text) ? (title + (text ? ' ' + text : '')) : '';
      document.querySelector('div#status').style.display = 'none';
      document.querySelector('div#password').style.display = 'block';
    } else if (type == 'input-password' || type == 'session-login-password') {
      // kiosk 自动填充：不弹密码框，直接带硬编码密码登录；失败由服务端 re-input-password 兜底
      passwordPromptActive = true; // 抑制中间消息，直到首帧到达清掉
      const conn = globals.getConn();
      try {
        console.debug('[sundesk] kiosk autopass: auto login with hardcoded password');
        conn.login({ password: KIOSK_PASSWORD });
        console.debug('[sundesk] kiosk autopass: login() returned without throw');
        return;
      } catch (e) {
        console.error('[sundesk] kiosk autopass: login() THREW:', e);
        // 连接可能已死（ws 关闭）：回退弹框，让用户走手动流程
        document.querySelector('div#status').style.display = 'none';
        document.querySelector('div#password').style.display = 'block';
      }
    } else if (!type) {
      // 首帧到达 = 连接真正成功（含人工审批无密码模式：空登录直接被接受）
      // 此时清掉密码框状态并显示画面，密码框只是"闪现"
      passwordPromptActive = false;
      const hint = document.querySelector('#password-hint');
      if (hint) hint.textContent = '';
      document.querySelector('div#canvas').style.display = 'block';
      {
        const _cv0 = document.querySelector('div#canvas');
        if (!_cv0.dataset.viewStyle) _cv0.dataset.viewStyle = globals.getConn()?.getZoomMode() || 'adaptive';
      }
      document.querySelector('div#password').style.display = 'none';
      document.querySelector('div#status').style.display = 'none';
      SB.show();
    } else if (passwordPromptActive) {
      // 密码框激活期间：只抑制中间状态消息（connecting/success 等），
      // 不抑制首帧（上面已处理），也不影响 error（下面会显示）
      console.debug('[sundesk] msgbox suppressed (password prompt active):', type, title, text);
      return;
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

  window.togglePassword = () => {
    const input = document.querySelector('input#password');
    const btn = document.querySelector('#toggle-password');
    if (!input || !btn) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.textContent = show ? '🙈' : '👁';
  }

  // ============ 会话内悬浮工具栏（顶部居中胶囊，参照 Flutter remote_toolbar） ============
  // 菜单注册机制：后续功能（control/display/monitor/chat）通过 sbRegisterMenu 挂载
  const SB = (() => {
    const bar = document.getElementById('session-bar');
    const pill = document.getElementById('sb-pill');
    const menu = document.getElementById('sb-menu');
    const menus = {};   // id -> { icon, title, getItems() }
    let pinned = false;
    let openId = null;
    let hideTimer = null;

    const ICONS = {
      pin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>',
      close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
    };

    function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

    function renderPill() {
      // order 越小越靠左；未指定按注册顺序排在后面
      const list = Object.entries(menus)
        .map(([id, m]) => ({ id, m }))
        .filter(({ m }) => !m.visible || m.visible())
        .sort((a, b) => (a.m.order ?? 100) - (b.m.order ?? 100));
      let html = '';
      for (const { id, m } of list) {
        html += `<button class="sb-btn" data-menu="${esc(id)}" title="${esc(m.title)}">${m.icon}</button>`;
      }
      html += `<span class="sb-sep"></span>`;
      html += `<button class="sb-btn ${pinned ? 'sb-on' : ''}" data-act="pin" title="${pinned ? '取消钉住' : '钉住工具栏'}">${ICONS.pin}</button>`;
      html += `<button class="sb-btn sb-close" data-act="close" title="断开连接">${ICONS.close}</button>`;
      pill.innerHTML = html;
    }

    function closeMenu() {
      openId = null;
      menu.style.display = 'none';
      menu.innerHTML = '';
      pill.querySelectorAll('.sb-btn').forEach(b => b.classList.remove('sb-on'));
    }

    function openMenuPanel(id) {
      const m = menus[id];
      if (!m) return;
      if (openId === id) { closeMenu(); scheduleHide(); return; }
      openId = id;
      const items = m.getItems() || [];
      let html = '';
      for (const it of items) {
        if (it.divider) { html += '<div class="sb-divider"></div>'; continue; }
        const checked = it.checked ? '<span class="sb-check">✓</span>' : '<span class="sb-check"></span>';
        const disabled = it.disabled ? ' sb-disabled' : '';
        html += `<div class="sb-item${disabled}" data-idx="${items.indexOf(it)}">${checked}<span class="sb-label">${esc(it.label)}</span></div>`;
      }
      menu.innerHTML = html;
      menu.style.display = 'block';
      menu.querySelectorAll('.sb-item').forEach((el) => {
        el.addEventListener('click', () => {
          const idx = Number(el.dataset.idx);
          const it = items[idx];
          if (!it || it.disabled) return;
          if (it.onClick) it.onClick();
          // 动态菜单（状态可能变化）：点击后重渲染；onClick 返回 true 则保持打开
          if (it.keepOpen) renderOpenMenu(); else { closeMenu(); scheduleHide(); }
        });
      });
      pill.querySelectorAll('.sb-btn').forEach(b => b.classList.toggle('sb-on', b.dataset.menu === id));
      scheduleHide.cancel();
    }

    function renderOpenMenu() { if (openId) openMenuPanel(openId); }

    function reveal() {
      scheduleHide.cancel();
      bar.classList.add('sb-show');
    }
    function chatPanelOpen() {
      const p = document.getElementById('sb-chat');
      return !!p && p.style.display !== 'none';
    }
    function scheduleHide() {
      scheduleHide.cancel();
      // 聊天面板打开时也保持工具栏可见，避免输入时工具栏滑走
      if (pinned || openId || chatPanelOpen()) return;
      hideTimer = setTimeout(() => bar.classList.remove('sb-show'), 700);
    }
    scheduleHide.cancel = () => { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } };

    pill.addEventListener('click', (e) => {
      const btn = e.target.closest('.sb-btn');
      if (!btn) return;
      e.stopPropagation();
      if (btn.dataset.act === 'pin') {
        pinned = !pinned;
        renderPill();
        pinned ? reveal() : scheduleHide();
      } else if (btn.dataset.act === 'close') {
        closeMenu();
        window.cancel();
      } else if (btn.dataset.menu === 'chat') {
        closeMenu();
        window.sundeskToggleChatPanel?.();
      } else if (btn.dataset.menu === 'mobile') {
        // 手机图标：开关悬浮导航条（同 Windows toggle overlay）
        const nav = window.sundeskMobileNav;
        if (nav) nav.isShown() ? nav.hide() : nav.show();
        closeMenu();
      } else if (btn.dataset.menu) {
        openMenuPanel(btn.dataset.menu);
      }
    });
    menu.addEventListener('mouseenter', reveal);
    menu.addEventListener('mouseleave', scheduleHide);
    bar.addEventListener('mouseenter', reveal);
    bar.addEventListener('mouseleave', scheduleHide);
    // 鼠标移到屏幕顶部边缘唤出工具栏
    document.addEventListener('mousemove', (e) => {
      const inSession = document.querySelector('div#canvas')?.style.display === 'block';
      if (!inSession) return;
      if (e.clientY <= 24) reveal();
    });
    // 点击菜单外部关闭
    document.addEventListener('mousedown', (e) => {
      if (openId && !bar.contains(e.target)) { closeMenu(); scheduleHide(); }
    });

    renderPill();
    return {
      registerMenu(id, icon, title, getItems, opts = {}) {
        menus[id] = { icon, title, getItems, visible: opts.visible, order: opts.order };
        renderPill();
      },
      show() { bar.classList.add('sb-show'); scheduleHide(); },
      hide() { pinned = false; closeMenu(); bar.classList.remove('sb-show'); renderPill(); },
      refresh() { renderPill(); renderOpenMenu(); },
    };
  })();
  window.sbRegisterMenu = SB.registerMenu;
  window.sbRefreshMenu = SB.refresh;
  window.sbRefreshAll = SB.refresh;

  // ============ 移动端悬浮导航条（对齐 Flutter Windows DraggableMobileActions） ============
  // 仅被控端为 Android 时出现；Back/Home/Recent 三键 + 隐藏箭头；可拖拽到屏幕任意位置，
  // 位置持久化到 localStorage（Windows 端存在 local option draggablePositionMobile）。
  // 音量±/电源在顶部工具条 Keyboard 菜单中（同 Windows 键盘菜单 mobileActions 布局）。
  const MobileNav = (() => {
    const bar = document.getElementById('nav-bar');
    if (!bar) return null;
    const POS_KEY = 'sundesk.mobileNav.pos';
    let visible = false;

    function clampPos(x, y) {
      const r = bar.getBoundingClientRect();
      const w = r.width || 150, h = r.height || 40;
      return {
        x: Math.min(Math.max(0, x), window.innerWidth - w),
        y: Math.min(Math.max(0, y), window.innerHeight - h),
      };
    }
    function defaultPos() {
      // Windows：水平居中，距底部 80px
      const r = bar.getBoundingClientRect();
      const w = r.width || 150, h = r.height || 40;
      return { x: (window.innerWidth - w) / 2, y: window.innerHeight - h - 80 };
    }
    function applyPos(x, y) {
      const p = clampPos(x, y);
      bar.style.left = p.x + 'px';
      bar.style.top = p.y + 'px';
      bar.style.right = 'auto';
      bar.style.bottom = 'auto';
      bar.style.transform = 'none';
      return p;
    }
    let saveTimer = null;
    function persist(p) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => localStorage.setItem(POS_KEY, p.x + ',' + p.y), 300);
    }
    function loadPos() {
      const v = localStorage.getItem(POS_KEY);
      if (v) {
        const [x, y] = v.split(',').map(Number);
        if (Number.isFinite(x) && Number.isFinite(y)) return applyPos(x, y);
      }
      return applyPos(defaultPos().x, defaultPos().y);
    }

    function show() {
      if (visible) return;
      visible = true;
      bar.style.display = 'flex';
      loadPos();
    }
    function hide() {
      visible = false;
      bar.style.display = 'none';
    }
    function isShown() { return visible; }

    // ---- 拖拽（Pointer Events，触屏/鼠标通用；位移小于阈值视为点击） ----
    let dragging = false, moved = false, startX = 0, startY = 0, origX = 0, origY = 0, curX = 0, curY = 0;
    bar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.nav-btn')) return; // 按钮自行处理
      dragging = true; moved = false;
      const r = bar.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      origX = r.left; origY = r.top; curX = r.left; curY = r.top;
      bar.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    bar.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 6) return;
      moved = true;
      const p = applyPos(origX + dx, origY + dy);
      curX = p.x; curY = p.y;
    });
    bar.addEventListener('pointerup', (e) => {
      if (!dragging) return;
      dragging = false;
      if (moved) { persist({ x: curX, y: curY }); bar.dataset.dragged = '1'; setTimeout(() => delete bar.dataset.dragged, 300); }
    });
    bar.addEventListener('pointercancel', () => { dragging = false; });

    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-btn');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const act = btn.dataset.nav;
      if (act === 'hide') { hide(); return; }
      const conn = globals.getConn();
      if (!conn || conn._ws?._status !== 'open') return;
      switch (act) {
        case 'back': conn.mobileBack(); break;
        case 'home': conn.mobileHome(); break;
        case 'recent': conn.mobileApps(); break;
      }
    });

    window.addEventListener('resize', () => { if (visible) { const v = (localStorage.getItem(POS_KEY) || '').split(','); if (v.length === 2) applyPos(+v[0], +v[1]); } });
    // 初始隐藏，进入 Android 被控会话后由 peer_info 触发显示
    bar.style.display = 'none';
    return { show, hide, isShown };
  })();
  window.sundeskMobileNav = MobileNav;

  // ============ step3：文字聊天（参照 Windows/Flutter ChatBox，协议为 Misc.chat_message） ============
  const chatMessages = [];
  const CHAT_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>';

  function escChat(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function renderChat() {
    const box = document.getElementById('sb-chat-msgs');
    if (!box) return;
    box.innerHTML = chatMessages.map(m =>
      `<div class="sb-chat-msg ${m.mine ? 'mine' : 'theirs'}"><b>${m.mine ? '我' : '远端'}</b><span>${escChat(m.text)}</span></div>`
    ).join('');
    box.scrollTop = box.scrollHeight;
  }

  window.sundeskToggleChatPanel = () => {
    const panel = document.getElementById('sb-chat');
    if (!panel) return;
    const show = panel.style.display === 'none';
    panel.style.display = show ? 'block' : 'none';
    if (show) {
      SB.show();
      document.getElementById('sb-chat-text')?.focus();
    }
  };

  window.sundeskOnChat = (text) => {
    if (!text) return;
    chatMessages.push({ text, mine: false });
    renderChat();
    const panel = document.getElementById('sb-chat');
    if (panel) panel.style.display = 'block';
    SB.show();
  };

  window.sundeskSendChat = () => {
    const input = document.getElementById('sb-chat-text');
    const text = input?.value.trim() || '';
    if (!text) return;
    const conn = globals.getConn();
    if (!conn) return;
    conn.sendChat(text);
    chatMessages.push({ text, mine: true });
    renderChat();
    input.value = '';
    input.focus();
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target?.id === 'sb-chat-text') {
      e.preventDefault();
      window.sundeskSendChat();
    }
  });

  SB.registerMenu('chat', CHAT_ICON, '文字聊天 Chat', () => [], { order: 80 });

  // ============ 会话菜单（对齐 Flutter Windows remote_toolbar） ============
  // 顺序同 Windows：手机动作 · 显示器 · Control · Display · Keyboard（Pin/Close 固定在胶囊尾部）
  const SB2_ICONS = {
    mobile: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>',
    control: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
    display: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>',
    keyboard: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M8 13h8"/></svg>',
    monitors: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="2" rx="2"/><path d="M8 17h6"/><rect width="12" height="13" x="9" y="10" rx="2"/></svg>',
  };

  const isAndroidPeer = () => globals.getConn()?._peerInfo?.platform === 'Android';

  // 手机图标：开关可拖拽悬浮导航条（对齐 Windows _MobileActionMenu，仅 Android 被控）
  SB.registerMenu('mobile', SB2_ICONS.mobile, 'Mobile Actions（导航键悬浮条）', () => [],
    { visible: isAndroidPeer, order: 30 });

  SB.registerMenu('monitors', SB2_ICONS.monitors, 'Select Monitor', () => {
    const conn = globals.getConn();
    if (!conn) return [];
    const pi = conn._peerInfo;
    const n = pi?.displays?.length || 0;
    const items = [];
    const isDesktopPeer = pi?.platform !== 'Android';
    if (n > 1) {
      items.push({ label: '全部显示器 All displays', checked: !pi.current_display || pi.current_display > n, keepOpen: true,
        onClick: () => conn.switchDisplay(JSON.stringify({ value: Array.from({ length: n }, (_, i) => i + 1), isDesktop: isDesktopPeer })) });
    }
    for (let i = 0; i < n; i++) {
      const d = pi.displays[i];
      const num = i + 1;
      const r = d.original_resolution;
      const res = r ? `${r.width}×${r.height}` : `${d.width}×${d.height}`;
      items.push({ label: `显示器 ${num}（${res}）`, checked: pi.current_display === num, keepOpen: true,
        onClick: () => conn.switchDisplay(JSON.stringify({ value: [num], isDesktop: isDesktopPeer })) });
    }
    if (!n) items.push({ label: '（无显示器信息）', disabled: true });
    return items;
  }, { visible: () => (globals.getConn()?._peerInfo?.displays?.length || 0) > 1, order: 40 });

  // ---- 传输文件：同 ID 以文件传输模式新开标签页（对齐 Windows Control 菜单 Transfer file） ----
  function openFileTransferTab() {
    const id = localStorage.getItem('id') || document.querySelector('#id')?.value || '';
    const host = localStorage.getItem('custom-rendezvous-server') || document.querySelector('#host')?.value || '';
    const url = new URL(window.location.href);
    url.hash = '';
    url.search = '';
    // 通过 URL 参数告知新标签页直接进入文件传输（main 初始化后读取）
    url.searchParams.set('id', id);
    url.searchParams.set('mode', 'file');
    if (host) url.searchParams.set('host', host);
    window.open(url.toString(), '_blank', 'noopener');
  }

  SB.registerMenu('control', SB2_ICONS.control, 'Control Actions', () => {
    const conn = globals.getConn();
    if (!conn) return [];
    const blocked = !!conn.getOption('block-input-state');
    const items = [
      { label: '刷新视频 Refresh', onClick: () => { try { conn.refresh(); } catch (e) { console.error('[sundesk] refresh failed:', e); } } },
      { label: '传输文件 Transfer file', onClick: openFileTransferTab },
      { divider: true },
      { label: 'Ctrl + Alt + Del', onClick: () => { try { conn.ctrlAltDel(); } catch (e) { console.error('[sundesk] ctrlAltDel failed:', e); } } },
      { label: '锁屏 Insert Lock（需新 APK）', onClick: () => { try { conn.lockScreen(); } catch (e) { console.error('[sundesk] lockScreen failed:', e); } } },
      { divider: true },
      { label: '仅查看 View only', checked: !!conn.getOption('view-only'), keepOpen: true,
        onClick: () => conn.toggleOption('view-only') },
      { label: '屏蔽远端输入 Block remote input', checked: blocked, keepOpen: true,
        onClick: () => {
          conn.toggleOption(blocked ? 'unblock-input' : 'block-input');
          conn.setOption('block-input-state', !blocked);
        } },
      { label: '会话结束后锁定 Lock after end', checked: !!conn.getToggleOption('lock-after-session-end'), keepOpen: true,
        onClick: () => conn.toggleOption('lock-after-session-end') },
      { divider: true },
      { label: '剪贴板同步 Clipboard sync', checked: !conn.getToggleOption('disable-clipboard'), keepOpen: true,
        onClick: () => conn.toggleOption('disable-clipboard') },
    ];
    return items;
  }, { order: 50 });

  SB.registerMenu('display', SB2_ICONS.display, 'Display Settings', () => {
    const conn = globals.getConn();
    if (!conn) return [];
    const zoom = conn.getZoomMode();
    const quality = conn.getImageQuality() || 'balanced';
    const zoomItem = (value, label) => ({
      label, checked: zoom === value, keepOpen: true,
      onClick: () => { conn.setZoomMode(value); SB.refresh(); },
    });
    const qItem = (value, label) => ({
      label, checked: quality === value, keepOpen: true,
      onClick: () => { conn.setImageQuality(value); SB.refresh(); },
    });
    return [
      { label: '缩放模式 Scale', disabled: true },
      zoomItem('adaptive', '适应窗口 Adapt window'),
      zoomItem('original', '原始尺寸 Original size'),
      { divider: true },
      { label: '画质 Image quality', disabled: true },
      qItem('best', 'Best quality'),
      qItem('balanced', 'Balanced'),
      qItem('low', 'Optimal speed'),
      { divider: true },
      { label: '显示远程光标 Show remote cursor', checked: !!conn.getToggleOption('show-remote-cursor'), keepOpen: true,
        onClick: () => conn.toggleOption('show-remote-cursor') },
      { label: '隐私模式 Privacy mode', checked: !!conn.getToggleOption('privacy-mode'), keepOpen: true,
        onClick: () => conn.toggleOption('privacy-mode') },
    ];
  }, { order: 60 });

  // Keyboard 菜单：对齐 Windows _KeyboardMenu 尾部的 mobileActions（Back/Home/Apps/Volume±/Power）。
  // 传统/翻译/浏览模式、输入源选择是中文 IME 相关项，web 不支持，不显示。
  SB.registerMenu('keyboard', SB2_ICONS.keyboard, 'Keyboard', () => {
    const conn = globals.getConn();
    if (!conn) return [];
    const fire = (fn) => () => { try { fn.call(conn); } catch (e) { console.error('[sundesk] mobile action failed:', e); } };
    return [
      { label: '返回 Back', onClick: fire(conn.mobileBack) },
      { label: '主屏 Home', onClick: fire(conn.mobileHome) },
      { label: '最近任务 Apps', onClick: fire(conn.mobileApps) },
      { divider: true },
      { label: '音量+ Volume up', onClick: fire(conn.mobileVolumeUp) },
      { label: '音量− Volume down', onClick: fire(conn.mobileVolumeDown) },
      { label: '电源 Power（关机/重启菜单）', onClick: fire(conn.mobilePower) },
    ];
  }, { visible: isAndroidPeer, order: 70 });
  // 显示器选择（数据来自 peer_info.displays；Android 被控通常只有 1 个）
  window.cancel = () => {
    passwordPromptActive = false;
    SB.hide();
    window.sundeskMobileNav?.hide();
    globals.close();
    document.querySelector('div#connect').style.display = 'block';
    document.querySelector('div#password').style.display = 'none';
    document.querySelector('div#status').style.display = 'none';
    document.querySelector('div#canvas').style.display = 'none';
    const fm = document.querySelector('div#filemgr');
    if (fm) fm.style.display = 'none';
  }

  window.confirmLogin = () => {
    console.debug('[sundesk] confirmLogin() clicked');
    passwordPromptActive = false;
    const conn = globals.getConn();
    if (!conn) {
      console.debug('[sundesk] confirmLogin: no live connection, cancelling');
      window.cancel();
      return;
    }
    const hint = document.querySelector('#password-hint');
    if (hint) hint.textContent = '';
    const password = document.querySelector('input#password').value;
    if (password) {
      document.querySelector('div#password').style.display = 'none';
      try {
        console.debug('[sundesk] confirmLogin: calling login() with password');
        // login() 期望对象 { password }；传字符串会被当成对象解析，
        // info.password 为 undefined -> 变成空登录 -> 服务端永远回 password empty
        conn.login({ password: password });
        console.debug('[sundesk] confirmLogin: login() returned without throw');
      } catch (e) {
        console.error('[sundesk] confirmLogin: login() THREW:', e);
        // 连接可能已死（ws 关闭），回到连接页而不是卡死
        window.cancel();
      }
    }
  }
}
