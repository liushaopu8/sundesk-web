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
  <div id="connect" style="text-align: center">
    <div style="margin-bottom: 12px;">
      <label style="margin-right: 12px; cursor: pointer;"><input type="radio" name="mode" value="remote" checked /> 远程桌面</label>
      <label style="cursor: pointer;"><input type="radio" name="mode" value="file" /> 文件传输</label>
    </div>
    <table style="display: inline-block">
    <tr><td><span>Host: </span></td><td><input id="host" /></td></tr>
    <tr><td><span>Key: </span></td><td><input id="key" /></td></tr>
    <tr><td><span>Id: </span></td><td><input id="id" /></td></tr>
    <tr><td></td><td><button onclick="connect();">Connect</button></td></tr>
  </table></div>
  <div id="password" style="display: none;">
    <div id="password-hint" style="color: red; font-weight: bold; margin-bottom: 6px;"></div>
    <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
      <input type="password" id="password" style="flex: 1;" />
      <button id="toggle-password" type="button" onclick="togglePassword()" style="cursor: pointer; padding: 4px 8px;">👁</button>
    </div>
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
  <div id="filemgr" style="display: none; text-align: left; max-width: 900px; margin: 0 auto;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
      <div style="font-weight:bold;">📁 文件传输 - <span id="filemgr-id"></span></div>
      <div><button onclick="cancel();">断开</button></div>
    </div>
    <div id="filemgr-toolbar" style="margin-bottom:6px;">
      <button onclick="fmGoUp()">↑ 上级</button>
      <button onclick="fmHome()">首页</button>
      <button onclick="fmRefresh()">刷新</button>
      <button onclick="fmMkdir()">新建文件夹</button>
      <label style="margin-left:8px;cursor:pointer;"><input type="checkbox" id="fm-hidden" onchange="fmRefresh()" /> 显示隐藏</label>
    </div>
    <div id="filemgr-crumb" style="padding:4px 8px; background:#f5f5f5; border:1px solid #ddd; font-family:monospace; font-size:12px; word-break:break-all;"></div>
    <table id="filemgr-list" style="width:100%; border-collapse:collapse; font-size:13px;">
      <thead><tr style="background:#f0f0f0;">
        <th style="text-align:left; padding:4px 8px; border-bottom:1px solid #ddd;">名称</th>
        <th style="text-align:right; padding:4px 8px; border-bottom:1px solid #ddd;">大小</th>
        <th style="text-align:left; padding:4px 8px; border-bottom:1px solid #ddd;">修改时间</th>
        <th style="text-align:center; padding:4px 8px; border-bottom:1px solid #ddd;">操作</th>
      </tr></thead>
      <tbody></tbody>
    </table>
    <div id="filemgr-transfers" style="margin-top:10px;"></div>
    <div id="filemgr-status" style="margin-top:6px; color:#666; font-size:12px;"></div>
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
    // 每次连接从头开始：复位密码框状态（连接中断时 flag 可能残留，会抑制后续连接的首帧）
    passwordPromptActive = false;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const host = document.querySelector('#host');
    localStorage.setItem('custom-rendezvous-server', host.value);
    const id = document.querySelector('#id');
    localStorage.setItem('id', id.value);
    const key = document.querySelector('#key');
    localStorage.setItem('key', key.value);
    const modeRadio = document.querySelector('input[name=mode]:checked');
    const mode = modeRadio ? modeRadio.value : 'remote';
    currentMode = mode;
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

  // ============ 文件传输 UI ============
  let currentMode = 'remote';
  let fmPath = '';          // 当前远程路径
  let fmEntries = [];       // 当前目录条目

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
  function fmSetStatus(s) {
    const el = document.querySelector('#filemgr-status');
    if (el) el.textContent = s;
  }
  function isDir(e) { return e.entry_type === 0 || e.entry_type === 2 || e.entry_type === 3; }

  async function fmLoad(path) {
    const conn = globals.getConn();
    if (!conn) return;
    const showHidden = document.querySelector('#fm-hidden')?.checked;
    fmSetStatus('读取目录中…');
    try {
      const dir = await conn.readRemoteDir(path, !!showHidden);
      fmPath = dir.path || path;
      fmEntries = (dir.entries || []).slice();
      // 目录在前，文件在后；各自按名称排序
      fmEntries.sort((a, b) => {
        const da = isDir(a) ? 0 : 1, db = isDir(b) ? 0 : 1;
        if (da !== db) return da - db;
        return a.name.localeCompare(b.name);
      });
      fmRender();
      fmSetStatus(fmEntries.length + ' 项');
    } catch (e) {
      fmSetStatus('读取失败: ' + (e?.message || e));
    }
  }

  function fmRender() {
    document.querySelector('#filemgr-crumb').textContent = fmPath || '/';
    const tbody = document.querySelector('#filemgr-list tbody');
    tbody.innerHTML = '';
    // 非根目录显示“..”
    if (fmPath && fmPath !== '/' && fmPath !== '') {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.innerHTML = '<td style="padding:4px 8px;">📁 ..</td><td></td><td></td>';
      tr.onclick = () => fmGoUp();
      tbody.appendChild(tr);
    }
    for (const e of fmEntries) {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.onmouseover = () => tr.style.background = '#f5f5f5';
      tr.onmouseout = () => tr.style.background = '';
      const icon = isDir(e) ? '📁' : '📄';
      let actionCell;
      if (isDir(e)) {
        actionCell = '<td style="padding:4px 8px;text-align:center;color:#999;">—</td>';
        tr.ondblclick = tr.onclick = () => fmOpen(e.name);
      } else {
        actionCell = '<td style="padding:4px 8px;text-align:center;"><button data-download="' + encodeURIComponent(e.name) + '" style="padding:2px 8px;cursor:pointer;">下载</button></td>';
      }
      tr.innerHTML =
        '<td style="padding:4px 8px;">' + icon + ' ' + e.name + '</td>' +
        '<td style="padding:4px 8px; text-align:right;">' + (isDir(e) ? '' : fmtSize(e.size)) + '</td>' +
        '<td style="padding:4px 8px; color:#666;">' + fmtTime(e.modified_time) + '</td>' +
        actionCell;
      tbody.appendChild(tr);
    }
    // 下载按钮事件委托（避免内联 onclick 转义问题）
    tbody.querySelectorAll('button[data-download]').forEach(btn => {
      btn.onclick = (ev) => { ev.stopPropagation(); fmDownload(decodeURIComponent(btn.getAttribute('data-download'))); };
    });
  }

  function fmJoin(dir, name) {
    if (!dir) return '/' + name;
    const sep = dir.includes('\\') ? '\\' : '/';
    if (dir.endsWith(sep)) return dir + name;
    return dir + sep + name;
  }
  function fmOpen(name) { fmLoad(fmJoin(fmPath, name)); }
  window.fmGoUp = () => {
    if (!fmPath || fmPath === '/') return;
    const sep = fmPath.includes('\\') ? '\\' : '/';
    let p = fmPath.replace(/[\\/]+$/, '');
    const idx = p.lastIndexOf(sep);
    const parent = idx <= 0 ? sep : p.substring(0, idx);
    fmLoad(parent);
  };
  window.fmHome = () => fmLoad('');
  window.fmRefresh = () => fmLoad(fmPath);
  window.fmMkdir = () => {
    const name = prompt('新建文件夹名称:');
    if (!name) return;
    const conn = globals.getConn();
    if (!conn) return;
    conn.createRemoteDir(fmJoin(fmPath, name));
    setTimeout(fmRefresh, 500);
  };

  // 文件传输会话连接成功后加载根目录；block/error/done 先打日志（下一步做上传/下载）
  function onFileResponse(fr) {
    if (fr.block) console.debug('[sundesk] file block', fr.block.id, fr.block.file_num, fr.block.data?.length);
    if (fr.error) console.warn('[sundesk] file error', fr.error);
    if (fr.done) console.debug('[sundesk] file done', fr.done);
    if (fr.digest) console.debug('[sundesk] file digest', fr.digest);
  }

  // ---- 下载（远程→浏览器）----
  window.fmDownload = (name) => {
    const conn = globals.getConn();
    if (!conn) return;
    const remotePath = fmJoin(fmPath, name);
    fmSetStatus('请求下载: ' + name);
    const { id, promise } = conn.downloadRemotePath(remotePath);
    const panel = ensureTransferRow(id, name);
    // 进度回调
    conn.onDownloadProgress = (jobId, fileName, received, total) => {
      if (jobId !== id) return;
      updateTransferRow(id, fileName, received, total);
    };
    promise.then(() => {
      finishTransferRow(id, name, true);
      fmSetStatus('下载完成: ' + name);
      fmRefresh();
    }).catch((e) => {
      finishTransferRow(id, name, false, e?.message || String(e));
      fmSetStatus('下载失败: ' + name + ' - ' + (e?.message || e));
    });
  };

  function ensureTransferRow(id, name) {
    let wrap = document.querySelector('#filemgr-transfers');
    let row = document.querySelector('#transfer-' + id);
    if (row) return row;
    row = document.createElement('div');
    row.id = 'transfer-' + id;
    row.style.cssText = 'padding:6px 8px; border:1px solid #ddd; border-radius:4px; margin-bottom:4px; font-size:12px;';
    row.innerHTML = '<div style="display:flex;justify-content:space-between;"><span class="t-name">' + name + '</span><span class="t-pct">0%</span></div>' +
      '<div style="background:#eee;height:8px;border-radius:4px;margin-top:4px;overflow:hidden;"><div class="t-bar" style="background:#024EFF;height:100%;width:0%;transition:width .15s;"></div></div>' +
      '<div class="t-meta" style="color:#666;margin-top:2px;">等待中…</div>';
    wrap.appendChild(row);
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
    const row = document.querySelector('#transfer-' + id);
    if (!row) return;
    row.querySelector('.t-pct').textContent = ok ? '✓ 完成' : '✗ 失败';
    row.querySelector('.t-bar').style.width = ok ? '100%' : '100%';
    row.querySelector('.t-bar').style.background = ok ? '#16A34A' : '#DC2626';
    row.querySelector('.t-meta').textContent = ok ? '已保存到下载' : (errMsg || '未知错误');
  }

  let passwordPromptActive = false;
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
      fmPath = '';
      fmLoad('');
      return;
    }
    if (type == 'input-password' || type == 're-input-password' || type == 'session-login-password') {
      passwordPromptActive = true;
      if (type == 're-input-password') {
        // 密码被拒重输：清空输入框并显示服务端错误信息
        document.querySelector('input#password').value = '';
        const hint = document.querySelector('#password-hint');
        if (hint) hint.textContent = (title || text) ? (title + (text ? ' ' + text : '')) : '';
      }
      document.querySelector('div#status').style.display = 'none';
      document.querySelector('div#password').style.display = 'block';
    } else if (!type) {
      // 首帧到达 = 连接真正成功（含人工审批无密码模式：空登录直接被接受）
      // 此时清掉密码框状态并显示画面，密码框只是"闪现"
      passwordPromptActive = false;
      const hint = document.querySelector('#password-hint');
      if (hint) hint.textContent = '';
      document.querySelector('div#canvas').style.display = 'block';
      document.querySelector('div#password').style.display = 'none';
      document.querySelector('div#status').style.display = 'none';
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

  window.cancel = () => {
    passwordPromptActive = false;
    globals.close();
    document.querySelector('div#connect').style.display = 'block';
    document.querySelector('div#password').style.display = 'none';
    document.querySelector('div#status').style.display = 'none';
    document.querySelector('div#canvas').style.display = 'none';
    const fm = document.querySelector('div#filemgr');
    if (fm) fm.style.display = 'none';
  }

  window.confirm = () => {
    console.debug('[sundesk] confirm() clicked');
    passwordPromptActive = false;
    const conn = globals.getConn();
    if (!conn) {
      console.debug('[sundesk] confirm: no live connection, cancelling');
      window.cancel();
      return;
    }
    const hint = document.querySelector('#password-hint');
    if (hint) hint.textContent = '';
    const password = document.querySelector('input#password').value;
    if (password) {
      document.querySelector('div#password').style.display = 'none';
      try {
        console.debug('[sundesk] confirm: calling login() with password');
        // login() 期望对象 { password }；传字符串会被当成对象解析，
        // info.password 为 undefined -> 变成空登录 -> 服务端永远回 password empty
        conn.login({ password: password });
        console.debug('[sundesk] confirm: login() returned without throw');
      } catch (e) {
        console.error('[sundesk] confirm: login() THREW:', e);
        // 连接可能已死（ws 关闭），回到连接页而不是卡死
        window.cancel();
      }
    }
  }
}