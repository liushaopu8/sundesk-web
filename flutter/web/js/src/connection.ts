import Websock from "./websock";
import * as message from "./message.js";
import * as rendezvous from "./rendezvous.js";
import { loadVp9 } from "./codec";
import * as sha256 from "fast-sha256";
import * as globals from "./globals";
import * as consts from "./consts";
import { decompress, mapKey, sleep } from "./common";

export const PORT = 21116;
const HOSTS = [
  "172.16.1.31",
  "rs-sg.rustdesk.com",
  "rs-cn.rustdesk.com",
  "rs-us.rustdesk.com",
];
const DEFAULT_KEY = "FSagyj6JvIpUf6xKzIKB1F3u1+xzUFuMT1sjry5zOyo=";
let HOST = localStorage.getItem("rendezvous-server") || HOSTS[0];
const SCHEMA = location.protocol === "https:" ? "wss://" : "ws://";

type MsgboxCallback = (type: string, title: string, text: string, link: string) => void;
type DrawCallback = (display: number, data: Uint8Array) => void;
// 文件传输响应回调（dir/block/error/done/digest）
type FileResponseCallback = (resp: message.FileResponse) => void;
// 下载任务状态（远程→浏览器）
type DownloadJob = {
  id: number;
  path: string;
  entries: message.FileEntry[];
  chunks: Uint8Array[];
  received: number;
  currentFileNum: number;
  resolve: () => void;
  reject: (e: any) => void;
};
// 上传任务（浏览器→远程）
type UploadJob = {
  id: number;
  remotePath: string;
  files: message.FileEntry[];
  blobs: Uint8Array[];      // 与 files 一一对应的文件内容
  currentFileNum: number;   // 正在发送的文件下标
  sent: number;             // 当前文件已发送字节
  sentTotal: number;        // 累计已发送字节
  totalSize: number;        // 所有文件总字节
  waitingConfirm: boolean;  // 等待服务端 send_confirm
  resolve: () => void;
  reject: (e: any) => void;
};
//const cursorCanvas = document.createElement("canvas");

export default class Connection {
  _msgs: any[];
  _ws: Websock | undefined;
  _interval: any;
  _id: string;
  _hash: message.Hash | undefined;
  _msgbox: MsgboxCallback;
  _draw: DrawCallback;
  _peerInfo: message.PeerInfo | undefined;
  _firstFrame: Boolean | undefined;
  _videoDecoder: any;
  _password: Uint8Array | undefined;
  _options: any;
  _videoTestSpeed: number[];
  // 会话模式：'remote' 远程桌面（默认）| 'file' 文件传输
  _mode: string;
  _fileResp: FileResponseCallback | undefined;
  // 待完成的远程目录读取请求：path -> {resolve/reject/timeout}
  _readDirTasks: Map<string, { resolve: (d: message.FileDirectory) => void; reject: (e: any) => void; timer: any }>;
  // 文件操作回执（创建/删除）：id -> {resolve/reject/timeout}
  _fileOps: Map<number, { resolve: () => void; reject: (e: any) => void; timer: any }>;
  // 下载任务（远程→浏览器）：job id -> 状态
  _downloadId: number;
  _downloads: Map<number, DownloadJob>;
  // 上传任务（浏览器→远程）：job id -> 状态
  _uploadId: number;
  _uploads: Map<number, UploadJob>;
  onDownloadProgress?: (id: number, fileName: string, received: number, total: number) => void;
  onUploadProgress?: (id: number, fileName: string, sent: number, total: number) => void;
  // 下载文件保存钩子：UI 侧尝试写入本地授权目录；返回 false 则走浏览器下载兜底
  onDownloadFile?: (jobId: number, relPath: string, data: Blob) => Promise<boolean>;
  //_cursors: { [name: number]: any };

  constructor() {
    this._msgbox = globals.msgbox;
    this._draw = globals.draw;
    this._msgs = [];
    this._id = "";
    this._videoTestSpeed = [0, 0];
    this._mode = "remote";
    this._readDirTasks = new Map();
    this._fileOps = new Map();
    this._downloadId = 1;
    this._downloads = new Map();
    this._uploadId = 1;
    this._uploads = new Map();
    //this._cursors = {};
  }

  async start(id: string, mode: string = "remote") {
    this._mode = mode;
    try {
      await this._start(id);
    } catch (e: any) {
      this.msgbox(
        "error",
        "Connection Error",
        e.type == "close" ? "Reset by the peer" : String(e)
      );
    }
  }

  async _start(id: string) {
    if (!this._options) {
      this._options = globals.getPeers()[id] || {};
    }
    if (!this._password) {
      const p = this.getOption("password");
      if (p) {
        try {
          this._password = Uint8Array.from(JSON.parse("[" + p + "]"));
        } catch (e) {
          console.error('Failed to get password, ' + e);
        }
      }
    }
    this._interval = setInterval(() => {
      while (this._msgs.length) {
        this._ws?.sendMessage(this._msgs[0]);
        this._msgs.splice(0, 1);
      }
    }, 1);
    this.loadVideoDecoder();
    const uri = getDefaultUri();
    const ws = new Websock(uri, true);
    this._ws = ws;
    this._id = id;
    console.log(
      new Date() + ": Connecting to rendezvous server: " + uri + ", for " + id
    );
    await ws.open();
    console.log(new Date() + ": Connected to rendezvous server");
    const conn_type = rendezvous.ConnType.DEFAULT_CONN;
    const nat_type = rendezvous.NatType.SYMMETRIC;
    const punch_hole_request = rendezvous.PunchHoleRequest.fromPartial({
      id,
      licence_key: localStorage.getItem("key") || DEFAULT_KEY,
      conn_type,
      nat_type,
      token: localStorage.getItem("access_token") || undefined,
    });
    ws.sendRendezvous({ punch_hole_request });
    const msg = (await ws.next()) as rendezvous.RendezvousMessage;
    ws.close();
    console.log(new Date() + ": Got rendezvous message:", JSON.stringify({
      has_punch_hole_response: !!msg.punch_hole_response,
      has_relay_response: !!msg.relay_response,
      phr_failure: msg.punch_hole_response?.failure,
      phr_other_failure: msg.punch_hole_response?.other_failure,
      phr_relay_server: msg.punch_hole_response?.relay_server,
      rr_version: msg.relay_response?.version,
      rr_relay_server: msg.relay_response?.relay_server,
      rr_refuse_reason: msg.relay_response?.refuse_reason,
    }));
    const phr = msg.punch_hole_response;
    const rr = msg.relay_response;
    if (phr) {
      if (phr?.other_failure) {
        this.msgbox("error", "Error", phr?.other_failure);
        return;
      }
      if (phr.failure != rendezvous.PunchHoleResponse_Failure.UNRECOGNIZED) {
        switch (phr?.failure) {
          case rendezvous.PunchHoleResponse_Failure.ID_NOT_EXIST:
            this.msgbox("error", "Error", "ID does not exist");
            break;
          case rendezvous.PunchHoleResponse_Failure.OFFLINE:
            this.msgbox("error", "Error", "Remote desktop is offline");
            break;
          case rendezvous.PunchHoleResponse_Failure.LICENSE_MISMATCH:
            this.msgbox("error", "Error", "Key mismatch");
            break;
          case rendezvous.PunchHoleResponse_Failure.LICENSE_OVERUSE:
            this.msgbox("error", "Error", "Key overuse");
            break;
        }
      }
    } else if (rr) {
      if (!rr.version) {
        this.msgbox("error", "Error", "Remote version is low, not support web");
        return;
      }
      await this.connectRelay(rr);
    }
  }

  async connectRelay(rr: rendezvous.RelayResponse) {
    const pk = rr.pk;
    let uri = rr.relay_server;
    if (uri) {
      uri = getrUriFromRs(uri, true, 2);
    } else {
      uri = getDefaultUri(true);
    }
    const uuid = rr.uuid;
    console.log(new Date() + ": Connecting to relay server: " + uri);
    const ws = new Websock(uri, false);
    await ws.open();
    console.log(new Date() + ": Connected to relay server");
    this._ws = ws;
    const request_relay = rendezvous.RequestRelay.fromPartial({
      licence_key: localStorage.getItem("key") || DEFAULT_KEY,
      uuid,
    });
    ws.sendRendezvous({ request_relay });
    const secure = (await this.secure(pk)) || false;
    globals.pushEvent("connection_ready", { secure, direct: false });
    await this.msgLoop();
  }

  async secure(pk: Uint8Array | undefined) {
    if (pk) {
      try {
        pk = await globals.verify(pk, localStorage.getItem("key") || DEFAULT_KEY);
        if (pk) {
          const idpk = message.IdPk.decode(pk);
          if (idpk.id == this._id) {
            pk = idpk.pk;
          }
        }
        if (pk?.length != 32) {
          pk = undefined;
        }
      } catch (e) {
        console.error('Failed to verify id pk, ', e);
        pk = undefined;
      }
      if (!pk)
        console.error(
          "Handshake failed: invalid public key from rendezvous server"
        );
    }
    if (!pk) {
      // send an empty message out in case server is setting up secure and waiting for first message
      const public_key = message.PublicKey.fromPartial({});
      this._ws?.sendMessage({ public_key });
      return;
    }
    const msg = (await this._ws?.next()) as message.Message;
    let signedId: any = msg?.signed_id;
    if (!signedId) {
      console.error("Handshake failed: invalid message type");
      const public_key = message.PublicKey.fromPartial({});
      this._ws?.sendMessage({ public_key });
      return;
    }
    try {
      signedId = await globals.verify(signedId.id, Uint8Array.from(pk!));
    } catch (e) {
      console.error('Failed to verify signed id pk, ', e);
      // fall back to non-secure connection in case pk mismatch
      console.error("pk mismatch, fall back to non-secure");
      const public_key = message.PublicKey.fromPartial({});
      this._ws?.sendMessage({ public_key });
      return;
    }
    const idpk = message.IdPk.decode(signedId);
    const id = idpk.id;
    const theirPk = idpk.pk;
    if (id != this._id!) {
      console.error("Handshake failed: sign failure");
      const public_key = message.PublicKey.fromPartial({});
      this._ws?.sendMessage({ public_key });
      return;
    }
    if (theirPk.length != 32) {
      console.error(
        "Handshake failed: invalid public box key length from peer"
      );
      const public_key = message.PublicKey.fromPartial({});
      this._ws?.sendMessage({ public_key });
      return;
    }
    const [mySk, asymmetric_value] = globals.genBoxKeyPair();
    const secret_key = globals.genSecretKey();
    const symmetric_value = globals.seal(secret_key, theirPk, mySk);
    const public_key = message.PublicKey.fromPartial({
      asymmetric_value,
      symmetric_value,
    });
    this._ws?.sendMessage({ public_key });
    this._ws?.setSecretKey(secret_key);
    console.log("secured");
    return true;
  }

  async msgLoop() {
    while (true) {
      const msg = (await this._ws?.next()) as message.Message;
      if (msg?.hash) {
        this._hash = msg?.hash;
        console.debug('[sundesk] got hash (salt+challenge), have password:', !!this._password);
        // 先不弹密码框，发空登录探测，按响应分流：
        // - NO_PASSWORD_ACCESS（无密码人工审批）：显示"等待对方确认"，批准后直接进
        // - PASSWORD_EMPTY（密码模式）：弹密码框等用户输入
        // - 直接成功：进画面
        this.login();
      } else if (msg?.test_delay) {
        const test_delay = msg?.test_delay;
        // console.log('test delay: ', test_delay);
        if (!test_delay.from_client) {
          this._ws?.sendMessage({ test_delay });
        }
      } else if (msg?.login_response) {
        this.handleLoginResponse(msg?.login_response);
      } else if (msg?.video_frame) {
        this.handleVideoFrame(msg?.video_frame!);
      } else if (msg?.clipboard) {
        const cb = msg?.clipboard;
        if (cb.compress) {
          const c = await decompress(cb.content);
          if (!c) continue;
          cb.content = c;
        }
        try {
          globals.copyToClipboard(new TextDecoder().decode(cb.content));
        } catch (e) {
          console.error('Failed to copy to clipboard, ', e);
        }
        // globals.pushEvent("clipboard", cb);
      } else if (msg?.cursor_data) {
        const cd = msg?.cursor_data;
        const c = await decompress(cd.colors);
        if (!c) continue;
        cd.colors = c;
        globals.pushEvent("cursor_data", cd);
        /*
        let ctx = cursorCanvas.getContext("2d");
        cursorCanvas.width = cd.width;
        cursorCanvas.height = cd.height;
        let imgData = new ImageData(
          new Uint8ClampedArray(c),
          cd.width,
          cd.height
        );
        ctx?.clearRect(0, 0, cd.width, cd.height);
        ctx?.putImageData(imgData, 0, 0);
        let url = cursorCanvas.toDataURL();
        const img = document.createElement("img");
        img.src = url;
        this._cursors[cd.id] = img;
        //cursorCanvas.width /= 2.;
        //cursorCanvas.height /= 2.;
        //ctx?.drawImage(img, cursorCanvas.width, cursorCanvas.height);
        url = cursorCanvas.toDataURL();
        document.body.style.cursor =
          "url(" + url + ")" + cd.hotx + " " + cd.hoty + ", default";
        console.log(document.body.style.cursor);
        */
      } else if (msg?.cursor_id) {
        globals.pushEvent("cursor_id", { id: msg?.cursor_id });
      } else if (msg?.cursor_position) {
        globals.pushEvent("cursor_position", msg?.cursor_position);
      } else if (msg?.misc) {
        if (!this.handleMisc(msg?.misc)) break;
      } else if (msg?.audio_frame) {
        globals.playAudio(msg?.audio_frame.data);
      } else if (msg?.file_response) {
        this.handleFileResponse(msg?.file_response);
      } else if (msg?.file_action) {
        this.handleFileAction(msg?.file_action);
      }
    }
  }

  handleLoginResponse(response: message.LoginResponse) {
    console.debug('[sundesk] login_response, error =', response.error);
    const loginErrorMap: Record<string, any> = {
      [consts.LOGIN_SCREEN_WAYLAND]: {
        msgtype: "error",
        title: "Login Error",
        text: "Login screen using Wayland is not supported",
        link: "https://rustdesk.com/docs/en/manual/linux/#login-screen",
        try_again: true,
      },
      [consts.LOGIN_MSG_DESKTOP_SESSION_NOT_READY]: {
        msgtype: "session-login",
        title: "",
        text: "",
        link: "",
        try_again: true,
      },
      [consts.LOGIN_MSG_DESKTOP_XSESSION_FAILED]: {
        msgtype: "session-re-login",
        title: "",
        text: "",
        link: "",
        try_again: true,
      },
      [consts.LOGIN_MSG_DESKTOP_SESSION_ANOTHER_USER]: {
        msgtype: "info-nocancel",
        title: "another_user_login_title_tip",
        text: "another_user_login_text_tip",
        link: "",
        try_again: false,
      },
      [consts.LOGIN_MSG_DESKTOP_XORG_NOT_FOUND]: {
        msgtype: "info-nocancel",
        title: "xorg_not_found_title_tip",
        text: "xorg_not_found_text_tip",
        link: "https://rustdesk.com/docs/en/manual/linux/#login-screen",
        try_again: true,
      },
      [consts.LOGIN_MSG_DESKTOP_NO_DESKTOP]: {
        msgtype: "info-nocancel",
        title: "no_desktop_title_tip",
        text: "no_desktop_text_tip",
        link: "https://rustdesk.com/docs/en/manual/linux/#login-screen",
        try_again: true,
      },
      [consts.LOGIN_MSG_DESKTOP_SESSION_NOT_READY_PASSWORD_EMPTY]: {
        msgtype: "session-login-password",
        title: "",
        text: "",
        link: "",
        try_again: true,
      },
      [consts.LOGIN_MSG_DESKTOP_SESSION_NOT_READY_PASSWORD_WRONG]: {
        msgtype: "session-login-re-password",
        title: "",
        text: "",
        link: "",
        try_again: true,
      },
      [consts.LOGIN_MSG_NO_PASSWORD_ACCESS]: {
        msgtype: "wait-remote-accept-nook",
        title: "Prompt",
        text: "Please wait for the remote side to accept your session request...",
        link: "",
        try_again: true,
      },
    };

    const err = response.error;
    if (err) {
      if (err == consts.LOGIN_MSG_PASSWORD_EMPTY) {
        this._password = undefined;
        console.debug('[sundesk] password required, showing prompt');
        this.msgbox("input-password", "Password Required", "", "");
      }
      if (err == consts.LOGIN_MSG_PASSWORD_WRONG) {
        this._password = undefined;
        this.msgbox(
          "re-input-password",
          err,
          "Do you want to enter again?"
        );
      } else if (err == consts.LOGIN_MSG_2FA_WRONG || err == consts.REQUIRE_2FA) {
        this.msgbox("input-2fa", err, "");
      } else if (err in loginErrorMap) {
        const m = loginErrorMap[err];
        this.msgbox(m.msgtype, m.title, m.text, m.link);
      } else {
        if (err.includes(consts.SCRAP_X11_REQUIRED)) {
          this.msgbox("error", "Login Error", err, consts.SCRAP_X11_REF_URL);
        } else {
          this.msgbox("error", "Login Error", err);
        }
      }
    } else if (response.peer_info) {
      this.handlePeerInfo(response.peer_info);
    }
  }

  msgbox(type_: string, title: string, text: string, link: string = '') {
    this._msgbox?.(type_, title, text, link);
  }

  draw(display: number, frame: any) {
    this._draw?.(display, frame);
    globals.draw(display, frame);
  }

  close() {
    this._msgs = [];
    clearInterval(this._interval);
    this._ws?.close();
    this._videoDecoder?.close();
  }

  refresh() {
    const misc = message.Misc.fromPartial({ refresh_video: true });
    this._ws?.sendMessage({ misc });
  }

  sendChat(text: string) {
    const value = text.trim();
    if (!value || this._ws?._status !== 'open') return;
    const chat_message = message.ChatMessage.fromPartial({ text: value });
    const misc = message.Misc.fromPartial({ chat_message });
    this._ws?.sendMessage({ misc });
  }

  setMsgbox(callback: MsgboxCallback) {
    this._msgbox = callback;
  }

  setDraw(callback: DrawCallback) {
    this._draw = callback;
  }

  login(info?: {
    os_login?: message.OSLogin,
    password?: Uint8Array
  }) {
    console.debug('[sundesk] login() called, has password input:', !!info?.password, ', stored password:', !!this._password);
    console.debug('[sundesk] login: salt =', typeof this._hash?.salt, ', challenge =', typeof this._hash?.challenge, ', ws open =', this._ws?._status === 'open');
    if (info?.password) {
      // [sundesk-pwdiag] Log password length and hash fingerprints for first-connection debugging.
      // We never log the raw password bytes.
      const fp = (u: Uint8Array | undefined) => u && u.length ? Array.from(u.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join('') : 'none';
      const salt = this._hash?.salt;
      const saltBytes = salt ? new TextEncoder().encode(salt) : undefined;
      console.debug('[sundesk-pwdiag] connection.ts:login: web hash step0: received_salt_len=' + (salt?.length ?? 0) + ' received_salt_fp=' + fp(saltBytes));
      let p = hash([info.password, salt!]);
      console.debug('[sundesk-pwdiag] connection.ts:login: web hash step1: pwd_len=' + info.password.length + ' salt_len=' + (salt?.length ?? 0) + ' h1_fp=' + fp(p));
      this._password = p;
      const challenge = this._hash?.challenge;
      p = hash([p, challenge!]);
      console.debug('[sundesk-pwdiag] connection.ts:login: web hash step2: challenge_len=' + (challenge?.length ?? 0) + ' h2_fp=' + fp(p));
      this.msgbox("connecting", "Connecting...", "Logging in...");
      this._sendLoginMessage({ os_login: info.os_login, password: p });
    } else {
      let p = this._password;
      if (p) {
        const challenge = this._hash?.challenge;
        p = hash([p, challenge!]);
      }
      this._sendLoginMessage({ os_login: info?.os_login, password: p });
    }
  }

  changePreferCodec() {
    const supported_decoding = message.SupportedDecoding.fromPartial({
      ability_vp9: 1,
      ability_h264: 1,
    });
    const option = message.OptionMessage.fromPartial({ supported_decoding });
    const misc = message.Misc.fromPartial({ option });
    this._ws?.sendMessage({ misc });
  }

  async reconnect() {
    this.close();
    await this.start(this._id);
  }

  _sendLoginMessage(login: {
    os_login?: message.OSLogin,
    password?: Uint8Array,
  }) {
    const isFile = this._mode === "file";
    const login_request = message.LoginRequest.fromPartial({
      username: this._id!,
      my_id: "web", // to-do
      my_name: "web", // to-do
      password: login.password,
      option: this.getOptionMessage(),
      // 文件传输模式下声明版本，使服务端启用与 1.2.5 一致的 digest/overwrite 流程；
      // 远程桌面模式保持原有行为（step6b 已验证可用），不改动。
      version: isFile ? "1.2.5" : undefined,
      // 文件传输模式：告知服务端进入文件传输会话，不请求视频流
      video_ack_required: !isFile,
      file_transfer: isFile ? message.FileTransfer.fromPartial({ dir: "", show_hidden: false }) : undefined,
      os_login: login.os_login,
    });
    this._ws?.sendMessage({ login_request });
  }

  // ============ 文件传输 ============

  setFileResponse(cb: FileResponseCallback) {
    this._fileResp = cb;
  }

  handleFileResponse(fr: message.FileResponse) {
    // 1) 目录列表响应
    if (fr.dir) {
      const d = fr.dir;
      // id>0 且是下载任务的文件列表（send 请求返回），交给下载逻辑
      if (d.id > 0 && this._downloads.has(d.id)) {
        this.handleDownloadDir(d);
        return;
      }
      // id>0 但不是下载任务，或 id==0：普通 read_dir 响应
      if (d.id === 0 || d.id === undefined || !this._downloads.has(d.id)) {
        // 先按返回路径精确匹配；首次读根目录（请求 path=""）时返回的是实际 home 路径，
        // 此时用 "" 占位的待请求任务来接收
        let task = this._readDirTasks.get(d.path);
        if (!task && this._readDirTasks.has('')) {
          task = this._readDirTasks.get('');
        }
        if (task) {
          this._readDirTasks.delete(d.path);
          this._readDirTasks.delete('');
          clearTimeout(task.timer);
          task.resolve(d);
        }
      }
    }
    // 2) digest：下载场景下（is_upload=false），回送 send_confirm 确认接收该文件
    if (fr.digest) {
      const dg = fr.digest;
      const job = this._downloads.get(dg.id);
      if (job && !dg.is_upload) {
        const idx = dg.file_num as number;
        // 多文件下载：进入下一个文件前，先把上一个文件存盘（服务端 digest 按文件顺序到达）
        if (idx > 0) {
          const prev = idx - 1;
          this.saveDownloadedFile(job, prev);
        }
        job.chunks = [];
        job.received = 0;
        job.currentFileNum = idx;
        // 告诉服务端：从头开始发（offset_blk=0）
        const conf = message.FileTransferSendConfirmRequest.fromPartial({
          id: dg.id, file_num: idx, offset_blk: 0,
        });
        const action = message.FileAction.fromPartial({ send_confirm: conf });
        this._ws?.sendMessage({ file_action: action });
        console.debug('[sundesk] download confirm file', idx, 'size', dg.file_size);
      }
      // 上传流程：服务端发现同名文件已存在（内容不同）→ 回 digest 询问是否覆盖。
      // 当前策略：内容完全相同则跳过，否则覆盖（覆盖弹窗确认后续版本再加）。
      const ujob = this._uploads.get(dg.id);
      if (ujob && dg.is_upload) {
        ujob.waitingConfirm = false;
        const conf = message.FileTransferSendConfirmRequest.fromPartial({
          id: dg.id, file_num: dg.file_num,
          skip: dg.is_identical || undefined,
          offset_blk: dg.is_identical ? undefined : 0,
        });
        const action = message.FileAction.fromPartial({ send_confirm: conf });
        this._ws?.sendMessage({ file_action: action });
        console.debug('[sundesk] upload overwrite decision:', dg.is_identical ? 'skip' : 'overwrite', 'file', dg.file_num);
      }
    }
    // 3) block：累积文件数据
    if (fr.block) {
      const b = fr.block;
      const job = this._downloads.get(b.id);
      if (job) {
        this.handleDownloadBlock(job, b);
      }
    }
    // 4) done：整个任务完成（服务端只在全部文件读完后发一次）
    if (fr.done) {
      const dn = fr.done;
      const job = this._downloads.get(dn.id);
      if (job) {
        this.handleDownloadDone(job, dn.file_num as number);
      }
      // 上传完成：服务端写完磁盘后回 done 确认
      const ujob = this._uploads.get(dn.id);
      if (ujob) {
        ujob.resolve();
        this._uploads.delete(dn.id);
        console.debug('[sundesk] upload done:', dn.id, 'file_num', dn.file_num);
      }
      // 文件操作完成（创建/删除）
      const op = this._fileOps.get(dn.id);
      if (op) {
        clearTimeout(op.timer);
        this._fileOps.delete(dn.id);
        op.resolve();
        console.debug('[sundesk] file op done:', dn.id);
      }
    }
    // 5) error
    if (fr.error) {
      const e = fr.error;
      const job = this._downloads.get(e.id);
      if (job) {
        job.reject?.(new Error(e.error));
        this._downloads.delete(e.id);
      }
      const ujob = this._uploads.get(e.id);
      if (ujob) {
        ujob.reject?.(new Error(e.error));
        this._uploads.delete(e.id);
      }
      const op = this._fileOps.get(e.id);
      if (op) {
        clearTimeout(op.timer);
        this._fileOps.delete(e.id);
        op.reject(new Error(e.error));
      }
      console.warn('[sundesk] file error', e);
    }
    // 其他响应交给 UI 层
    if (this._fileResp) {
      this._fileResp(fr);
    } else if (!fr.dir && !fr.digest && !fr.block && !fr.done && !fr.error) {
      console.debug('[sundesk] file_response (no UI handler):', Object.keys(fr));
    }
  }

  // ---- 下载：远程 → 浏览器 ----

  /**
   * 下载远程文件或目录。
   * 发 FileAction.send，服务端回目录列表（entries），随后逐文件 digest→block→done。
   */
  downloadRemotePath(path: string): { id: number; promise: Promise<void> } {
    const id = this._downloadId++;
    let resolve: () => void, reject: (e: any) => void;
    const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
    const job: DownloadJob = {
      id, path, entries: [], chunks: [], received: 0, currentFileNum: 0,
      resolve: resolve!, reject: reject!,
    };
    this._downloads.set(id, job);
    const action = message.FileAction.fromPartial({
      send: message.FileTransferSendRequest.fromPartial({
        id, path, file_num: 0, include_hidden: false,
      }),
    });
    console.debug('[sundesk] download request:', path, 'job', id);
    this._ws?.sendMessage({ file_action: action });
    return { id, promise };
  }

  handleDownloadDir(d: message.FileDirectory) {
    const job = this._downloads.get(d.id);
    if (!job) return;
    job.entries = d.entries || [];
    job.path = d.path;
    console.debug('[sundesk] download file list:', job.entries.length, 'entries at', d.path);
    // 等待服务端发 digest；空目录直接完成
    if (job.entries.length === 0) {
      job.resolve();
      this._downloads.delete(d.id);
    }
  }

  async handleDownloadBlock(job: DownloadJob, b: message.FileTransferBlock) {
    let data: Uint8Array = b.data || new Uint8Array(0);
    if (b.compressed && b.data && b.data.length) {
      try {
        const dec = await decompress(b.data);
        if (dec) data = dec; // 解压失败则退回原始数据
      } catch (e) { console.error('[sundesk] decompress block failed', e); }
    }
    job.chunks.push(data);
    job.received += data.length;
    const name = job.entries[b.file_num as number]?.name || ('file_' + b.file_num);
    const total = job.entries[b.file_num as number]?.size || 0;
    this.onDownloadProgress?.(job.id, name, job.received, total);
  }

  handleDownloadDone(job: DownloadJob, fileNum: number) {
    if (job.chunks.length > 0) {
      this.saveDownloadedFile(job, fileNum);
    }
    // 最后一个文件：完成整个任务（服务端只在全部读完后发一次 done）
    if (fileNum >= job.entries.length - 1) {
      job.resolve();
      this._downloads.delete(job.id);
    }
  }

  /** 保存已下载完成的单个文件：优先写本地授权目录（UI 钩子），否则浏览器下载兜底 */
  async saveDownloadedFile(job: DownloadJob, fileNum: number) {
    const entry = job.entries[fileNum];
    const relPath = entry?.name || ('download_' + job.id + '_' + fileNum);
    const blob = new Blob(job.chunks as BlobPart[], { type: 'application/octet-stream' });
    job.chunks = [];
    job.received = 0;
    if (this.onDownloadFile) {
      try {
        if (await this.onDownloadFile(job.id, relPath, blob)) {
          console.debug('[sundesk] downloaded to local folder:', relPath, blob.size, 'bytes');
          return;
        }
      } catch (e) {
        console.warn('[sundesk] local save failed, fallback to browser download', e);
      }
    }
    // 兜底：浏览器下载（relPath 可能是相对路径，取文件名）
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = relPath.split('/').pop() || relPath;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    console.debug('[sundesk] downloaded file:', relPath, blob.size, 'bytes');
  }

  /**
   * 读取远程目录。返回 FileDirectory（含 entries）。
   * 发 FileAction.read_dir，服务端回 FileResponse.dir。
   */
  readRemoteDir(path: string, includeHidden: boolean = false): Promise<message.FileDirectory> {
    return new Promise((resolve, reject) => {
      if (!this._ws) { reject(new Error("no connection")); return; }
      // 同一路径已有在途请求，先拒绝旧的
      const existing = this._readDirTasks.get(path);
      if (existing) {
        clearTimeout(existing.timer);
        existing.reject(new Error("superseded"));
        this._readDirTasks.delete(path);
      }
      const timer = setTimeout(() => {
        if (this._readDirTasks.has(path)) {
          this._readDirTasks.delete(path);
          reject(new Error("read dir timeout: " + path));
        }
      }, 10000);
      this._readDirTasks.set(path, { resolve, reject, timer });
      const action = message.FileAction.fromPartial({
        read_dir: message.ReadDir.fromPartial({ path, include_hidden: includeHidden }),
      });
      console.debug('[sundesk] readRemoteDir:', path);
      this._ws.sendMessage({ file_action: action });
    });
  }

  /** 在远程创建目录（带回执，成功后 resolve；失败/超时 reject） */
  createRemoteDir(path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = this._downloadId++;
      const timer = setTimeout(() => {
        this._fileOps.delete(id);
        reject(new Error('create dir timeout: ' + path));
      }, 10000);
      this._fileOps.set(id, { resolve, reject, timer });
      const action = message.FileAction.fromPartial({
        create: message.FileDirCreate.fromPartial({ id, path }),
      });
      this._ws?.sendMessage({ file_action: action });
      console.debug('[sundesk] create remote dir:', path, 'op', id);
    });
  }

  /** 删除远程文件或目录（目录递归）。带回执，成功后 resolve；失败/超时 reject */
  removeRemotePath(path: string, isDir: boolean, recursive: boolean = true): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = this._downloadId++;
      const timer = setTimeout(() => {
        this._fileOps.delete(id);
        reject(new Error('remove timeout: ' + path));
      }, 10000);
      this._fileOps.set(id, { resolve, reject, timer });
      const action = message.FileAction.fromPartial(
        isDir
          ? { remove_dir: message.FileRemoveDir.fromPartial({ id, path, recursive }) }
          : { remove_file: message.FileRemoveFile.fromPartial({ id, path, file_num: 0 }) }
      );
      this._ws?.sendMessage({ file_action: action });
      console.debug('[sundesk] remove remote:', isDir ? 'dir' : 'file', path, 'op', id);
    });
  }

  /** 取消传输（下载或上传） */
  cancelTransfer(id: number) {
    const action = message.FileAction.fromPartial({
      cancel: message.FileTransferCancel.fromPartial({ id }),
    });
    this._ws?.sendMessage({ file_action: action });
    const d = this._downloads.get(id);
    if (d) { d.reject?.(new Error('cancelled')); this._downloads.delete(id); }
    const u = this._uploads.get(id);
    if (u) { u.reject?.(new Error('cancelled')); this._uploads.delete(id); }
    console.debug('[sundesk] cancel transfer', id);
  }

  /** 上传流程：处理服务端发来的 file_action（目前只有 send_confirm） */
  handleFileAction(fa: message.FileAction) {
    if (fa.send_confirm) {
      const sc = fa.send_confirm;
      const job = this._uploads.get(sc.id);
      if (!job) return;
      job.waitingConfirm = false;
      const idx = job.currentFileNum;
      if (sc.skip) {
        // 服务端判定与远端文件完全相同 → 跳过此文件
        console.debug('[sundesk] upload skip file', idx, job.files[idx]?.name);
        this.advanceUpload(job);
      } else if (sc.offset_blk !== undefined) {
        // 服务端确认接收 → 开始发送块
        console.debug('[sundesk] upload confirmed file', idx, job.files[idx]?.name);
        this.sendUploadBlocks(job, idx);
      }
    }
  }

  // ---- 上传：浏览器 → 远程 ----

  /**
   * 上传本地文件到远程目录。
   * 协议（与下载对称）：FileAction.receive → 逐文件 FileResponse.digest → 服务端 send_confirm
   * → FileResponse.block（128KB，不压缩）→ 全部完成后 FileResponse.done。
   * files.name 可为相对路径（目录上传时服务端会按路径重建子目录）。
   */
  uploadRemotePath(
    remotePath: string,
    files: { name: string; size: number; modifiedTime: number; data: Uint8Array }[]
  ): { id: number; promise: Promise<void> } {
    const id = this._uploadId++;
    let resolve: () => void, reject: (e: any) => void;
    const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
    const job: UploadJob = {
      id, remotePath,
      files: files.map(f => message.FileEntry.fromPartial({
        name: f.name, size: f.size, modified_time: f.modifiedTime, entry_type: message.FileType.File,
      })),
      blobs: files.map(f => f.data),
      currentFileNum: 0, sent: 0, sentTotal: 0,
      totalSize: files.reduce((s, f) => s + f.size, 0),
      waitingConfirm: false,
      resolve: resolve!, reject: reject!,
    };
    this._uploads.set(id, job);
    const action = message.FileAction.fromPartial({
      receive: message.FileTransferReceiveRequest.fromPartial({
        id, path: remotePath, file_num: 0, total_size: job.totalSize, files: job.files,
      }),
    });
    console.debug('[sundesk] upload request:', remotePath, 'job', id, 'files', job.files.length, 'total', job.totalSize);
    this._ws?.sendMessage({ file_action: action });
    // 服务端 NewWrite 后不回包，由客户端主动发起首个文件的 digest
    this.sendUploadDigest(job, 0);
    return { id, promise };
  }

  sendUploadDigest(job: UploadJob, idx: number) {
    const f = job.files[idx];
    if (!f) { this.finishUpload(job); return; }
    job.currentFileNum = idx;
    job.sent = 0;
    job.waitingConfirm = true;
    const resp = message.FileResponse.fromPartial({
      digest: message.FileTransferDigest.fromPartial({
        id: job.id, file_num: idx, file_size: f.size, last_modified: f.modified_time,
      }),
    });
    this._ws?.sendMessage({ file_response: resp });
    console.debug('[sundesk] upload digest file', idx, f.name, 'size', f.size);
  }

  async sendUploadBlocks(job: UploadJob, idx: number) {
    const f = job.files[idx];
    const data = job.blobs[idx];
    if (!f || !data) { this.advanceUpload(job); return; }
    const BUF = 128 * 1024;
    for (let off = 0; off < data.length; off += BUF) {
      const chunk = data.subarray(off, Math.min(off + BUF, data.length));
      const resp = message.FileResponse.fromPartial({
        block: message.FileTransferBlock.fromPartial({
          id: job.id, file_num: idx, data: chunk, compressed: false,
        }),
      });
      this._ws?.sendMessage({ file_response: resp });
      job.sent += chunk.length;
      job.sentTotal += chunk.length;
      this.onUploadProgress?.(job.id, f.name, job.sentTotal, job.totalSize);
      // 大文件每隔一段让出事件循环，避免 UI 卡死
      if (off % (BUF * 16) === 0 && off > 0) {
        await sleep(0);
      }
    }
    console.debug('[sundesk] upload blocks done file', idx, f.name, job.sent, 'bytes');
    this.advanceUpload(job);
  }

  /** 当前文件发送完毕：推进到下一个文件，全部完成则发 done */
  advanceUpload(job: UploadJob) {
    const next = job.currentFileNum + 1;
    if (next >= job.files.length) {
      this.finishUpload(job);
    } else {
      this.sendUploadDigest(job, next);
    }
  }

  finishUpload(job: UploadJob) {
    const resp = message.FileResponse.fromPartial({
      done: message.FileTransferDone.fromPartial({ id: job.id, file_num: job.files.length - 1 }),
    });
    this._ws?.sendMessage({ file_response: resp });
    console.debug('[sundesk] upload done sent, waiting ack, job', job.id);
  }

  getOptionMessage(): message.OptionMessage | undefined {
    let n = 0;
    const msg = message.OptionMessage.fromPartial({});
    const q = this.getImageQualityEnum(this.getImageQuality(), true);
    const yes = message.OptionMessage_BoolOption.Yes;
    // Web 客户端默认禁用音频（甫总 2026-08-25）：部分 Android 被控端在进入音频授权分支
    // 后会异常断开 relay（code 1006，不回 login_response）。远程控制不需要语音，强制不请求音频。
    msg.disable_audio = yes;
    n += 1;
    if (q != undefined) {
      msg.image_quality = q;
      n += 1;
    }
    if (this._options["show-remote-cursor"]) {
      msg.show_remote_cursor = yes;
      n += 1;
    }
    if (this._options["lock-after-session-end"]) {
      msg.lock_after_session_end = yes;
      n += 1;
    }
    if (this._options["privacy-mode"]) {
      msg.privacy_mode = yes;
      n += 1;
    }
    if (this._options["disable-audio"]) {
      msg.disable_audio = yes;
      n += 1;
    }
    if (this._options["disable-clipboard"]) {
      msg.disable_clipboard = yes;
      n += 1;
    }
    return n > 0 ? msg : undefined;
  }

  sendVideoReceived() {
    const misc = message.Misc.fromPartial({ video_received: true });
    this._ws?.sendMessage({ misc });
  }

  handleVideoFrame(vf: message.VideoFrame) {
    if (!this._firstFrame) {
      this.msgbox("", "", "");
      this._firstFrame = true;
    }
    if (vf.vp9s) {
      const dec = this._videoDecoder;
      if (!dec) {
        console.warn('[sundesk] video frame arrived before decoder ready, skipping');
        return;
      }
      var tm = new Date().getTime();
      var i = 0;
      const n = vf.vp9s?.frames.length;
      vf.vp9s.frames.forEach((f) => {
        dec.processFrame(f.data.slice(0).buffer, (ok: any) => {
          i++;
          if (i == n) this.sendVideoReceived();
          if (ok && dec.frameBuffer && n == i) {
            this.draw(vf.display, dec.frameBuffer);
            const now = new Date().getTime();
            var elapsed = now - tm;
            this._videoTestSpeed[1] += elapsed;
            this._videoTestSpeed[0] += 1;
            if (this._videoTestSpeed[0] >= 30) {
              console.log(
                "video decoder: " +
                parseInt(
                  "" + this._videoTestSpeed[1] / this._videoTestSpeed[0]
                )
              );
              this._videoTestSpeed = [0, 0];
            }
          }
        });
      });
    }
  }

  handlePeerInfo(pi: message.PeerInfo) {
    localStorage.setItem('last_remote_id', this._id);
    this._peerInfo = pi;
    if (this._mode === "file") {
      // 文件传输模式：无视频流，不检查显示器，以 peer_info 为连接成功信号
      console.debug('[sundesk] file transfer session ready, peer:', pi.username || pi.hostname || '');
      this.msgbox("file-ready", "Connected", "");
      globals.pushEvent("peer_info", pi);
      this.setOption("info", pi);
      return;
    }
    if (pi.current_display > pi.displays.length) {
      pi.current_display = 0;
    }
    if (globals.getVersionNumber(pi.version) < globals.getVersionNumber("1.1.10")) {
      this.setPermission("restart", false);
    }
    if (pi.displays.length == 0) {
      this.setOption("info", pi);
      globals.pushEvent("update_privacy_mode", {});
      this.msgbox("error", "Remote Error", "No Display");
      return;
    }
    console.debug('[sundesk] login OK, waiting for first frame');
    this.msgbox("success", "Successful", "Connected, waiting for image...");
    globals.pushEvent("peer_info", pi);
    const p = this.shouldAutoLogin();
    if (p) this.inputOsPassword(p);
    const username = this.getOption("info")?.username;
    if (username && !pi.username) pi.username = username;
    globals.pushEvent("update_privacy_mode", {});
    this.setOption("info", pi);
    if (this.getRemember()) {
      if (this._password?.length) {
        const p = this._password.toString();
        if (p != this.getOption("password")) {
          this.setOption("password", p);
          console.log("remember password of " + this._id);
        }
      }
    } else {
      this.setOption("password", undefined);
    }
  }

  setPermission(name: string, value: Boolean) {
    globals.pushEvent("permission", { [name]: value });
  }

  shouldAutoLogin(): string {
    const l = this.getOption("lock-after-session-end");
    const a = !!this.getOption("auto-login");
    const p = this.getOption("os-password");
    if (p && l && a) {
      return p;
    }
    return "";
  }

  handleMisc(misc: message.Misc) {
    if (misc.audio_format) {
      globals.initAudio(
        misc.audio_format.channels,
        misc.audio_format.sample_rate
      );
    } else if (misc.chat_message) {
      globals.pushEvent("chat", { text: misc.chat_message.text });
    } else if (misc.permission_info) {
      const p = misc.permission_info;
      console.info("Change permission " + p.permission + " -> " + p.enabled);
      let name;
      switch (p.permission) {
        case message.PermissionInfo_Permission.Keyboard:
          name = "keyboard";
          break;
        case message.PermissionInfo_Permission.Clipboard:
          name = "clipboard";
          break;
        case message.PermissionInfo_Permission.Audio:
          name = "audio";
          break;
        default:
          return;
      }
      this.setPermission(name, p.enabled);
    } else if (misc.switch_display) {
      this.loadVideoDecoder();
      globals.pushEvent("switch_display", misc.switch_display);
    } else if (misc.close_reason) {
      this.msgbox("error", "Connection Error", misc.close_reason);
      this.close();
      return false;
    }
    return true;
  }

  getRemember(): Boolean {
    return this._options["remember"] || false;
  }

  setRemember(v: Boolean) {
    this.setOption("remember", v);
  }

  getOption(name: string): any {
    return this._options[name] ?? globals.getUserDefaultOption(name);
  }

  getToggleOption(name: string): Boolean {
    // TODO: more default settings
    const defaultToggleTrue = [
      'show-remote-cursor',
      'privacy-mode',
      'enable-file-copy-paste',
      'allow_swap_key',
    ];
    return this._options[name] || (defaultToggleTrue.includes(name) ? true : false);
  }

  // TODO:
  getStatus(): String {
    return JSON.stringify({ status_num: 10 });
  }

  // TODO:
  checkConnStatus() {
  }

  setOption(name: string, value: any) {
    if (value == undefined) {
      delete this._options[name];
    } else {
      this._options[name] = value;
    }
    this._options["tm"] = new Date().getTime();
    const peers = globals.getPeers();
    peers[this._id] = this._options;
    localStorage.setItem("peers", JSON.stringify(peers));
  }

  inputKey(
    name: string,
    down: boolean,
    press: boolean,
    alt: Boolean,
    ctrl: Boolean,
    shift: Boolean,
    command: Boolean
  ) {
    if (this._ws?._status !== 'open') return;
    const key_event = mapKey(name, globals.isDesktop());
    if (!key_event) return;
    if (alt && (name == "VK_MENU" || name == "RAlt")) {
      alt = false;
    }
    if (ctrl && (name == "VK_CONTROL" || name == "RControl")) {
      ctrl = false;
    }
    if (shift && (name == "VK_SHIFT" || name == "RShift")) {
      shift = false;
    }
    if (command && (name == "Meta" || name == "RWin")) {
      command = false;
    }
    key_event.down = down;
    key_event.press = press;
    key_event.modifiers = this.getMod(alt, ctrl, shift, command);
    this._ws?.sendMessage({ key_event });
  }

  ctrlAltDel() {
    const key_event = message.KeyEvent.fromPartial({ down: true });
    if (this._peerInfo?.platform == "Windows") {
      key_event.control_key = message.ControlKey.CtrlAltDel;
    } else {
      key_event.control_key = message.ControlKey.Delete;
      key_event.modifiers = this.getMod(true, true, false, false);
    }
    this._ws?.sendMessage({ key_event });
  }

  restart() {
    const misc = message.Misc.fromPartial({});
    misc.restart_remote_device = true;
    this._ws?.sendMessage({ misc });
  }

  inputString(seq: string) {
    const key_event = message.KeyEvent.fromPartial({ seq });
    this._ws?.sendMessage({ key_event });
  }

  send2fa(code: string) {
    const auth_2fa = message.Auth2FA.fromPartial({ code });
    this._ws?.sendMessage({ auth_2fa });
  }

  _captureDisplays({ add, sub, set }: {
    add?: number[], sub?: number[], set?: number[]
  }) {
    const capture_displays = message.CaptureDisplays.fromPartial({ add, sub, set });
    const misc = message.Misc.fromPartial({ capture_displays });
    this._ws?.sendMessage({ misc });
  }

  switchDisplay(v: string) {
    try {
      const obj = JSON.parse(v);
      const value = obj.value;
      const isDesktop = obj.isDesktop;
      if (value.length == 1) {
        const switch_display = message.SwitchDisplay.fromPartial({ display: value[0] });
        const misc = message.Misc.fromPartial({ switch_display });
        this._ws?.sendMessage({ misc });

        if (!isDesktop) {
          this._captureDisplays({ set: value });
        } else {
          // If support merging images, check_remove_unused_displays() in ui_session_interface.rs
        }
      } else {
        this._captureDisplays({ set: value });
      }
    }
    catch (e) {
      console.log('Failed to switch display, invalid param "' + v + '"');
    }
  }

  elevateWithLogon(value: string) {
    try {
      const obj = JSON.parse(value);
      const logon = message.ElevationRequestWithLogon.fromPartial({
        username: obj.username,
        password: obj.password
      });
      const elevation_request = message.ElevationRequest.fromPartial({ logon });
      const misc = message.Misc.fromPartial({ elevation_request });
      this._ws?.sendMessage({ misc });
    }
    catch (e) {
      console.log('Failed to elevate with logon, invalid param "' + value + '"');
    }
  }

  async inputOsPassword(seq: string) {
    this.inputMouse();
    await sleep(50);
    this.inputMouse(0, 3, 3);
    await sleep(50);
    this.inputMouse(1 | (1 << 3));
    this.inputMouse(2 | (1 << 3));
    await sleep(1200);
    const key_event = message.KeyEvent.fromPartial({ press: true, seq });
    this._ws?.sendMessage({ key_event });
  }

  lockScreen() {
    const key_event = message.KeyEvent.fromPartial({
      down: true,
      control_key: message.ControlKey.LockScreen,
    });
    this._ws?.sendMessage({ key_event });
  }

  getMod(alt: Boolean, ctrl: Boolean, shift: Boolean, command: Boolean) {
    const mod: message.ControlKey[] = [];
    if (alt) mod.push(message.ControlKey.Alt);
    if (ctrl) mod.push(message.ControlKey.Control);
    if (shift) mod.push(message.ControlKey.Shift);
    if (command) mod.push(message.ControlKey.Meta);
    return mod;
  }

  inputMouse(
    mask: number = 0,
    x: number = 0,
    y: number = 0,
    alt: Boolean = false,
    ctrl: Boolean = false,
    shift: Boolean = false,
    command: Boolean = false
  ) {
    if (this._ws?._status !== 'open') return;
    const mouse_event = message.MouseEvent.fromPartial({
      mask,
      x,
      y,
      modifiers: this.getMod(alt, ctrl, shift, command),
    });
    this._ws?.sendMessage({ mouse_event });
  }

  toggleOption(name: string) {

    //   } else if name == "block-input" {
    //     option.block_input = BoolOption::Yes.into();
    // } else if name == "unblock-input" {
    //     option.block_input = BoolOption::No.into();
    // } else if name == "show-quality-monitor" {
    //     config.show_quality_monitor.v = !config.show_quality_monitor.v;
    // } else if name == "allow_swap_key" {
    //     config.allow_swap_key.v = !config.allow_swap_key.v;
    // } else if name == "view-only" {
    //     config.view_only.v = !config.view_only.v;
    //     let f = |b: bool| {
    //         if b {
    //             BoolOption::Yes.into()
    //         } else {
    //             BoolOption::No.into()
    //         }
    //     };
    //     if config.view_only.v {
    //         option.disable_keyboard = f(true);
    //         option.disable_clipboard = f(true);
    //         option.show_remote_cursor = f(true);
    //         option.enable_file_transfer = f(false);
    //         option.lock_after_session_end = f(false);
    //     } else {
    //         option.disable_keyboard = f(false);
    //         option.disable_clipboard = f(self.get_toggle_option("disable-clipboard"));
    //         option.show_remote_cursor = f(self.get_toggle_option("show-remote-cursor"));
    //         option.enable_file_transfer = f(self.config.enable_file_transfer.v);
    //         option.lock_after_session_end = f(self.config.lock_after_session_end.v);
    //     }
    // } else {
    //     let is_set = self
    //         .options
    //         .get(&name)
    //         .map(|o| !o.is_empty())
    //         .unwrap_or(false);
    //     if is_set {
    //         self.config.options.remove(&name);
    //     } else {
    //         self.config.options.insert(name, "Y".to_owned());
    //     }
    //     self.config.store(&self.id);
    //     return None;
    // }

    const v = !this._options[name];
    const option = message.OptionMessage.fromPartial({});
    const v2 = v
      ? message.OptionMessage_BoolOption.Yes
      : message.OptionMessage_BoolOption.No;
    switch (name) {
      case "show-remote-cursor":
        option.show_remote_cursor = v2;
        break;
      case "disable-audio":
        option.disable_audio = v2;
        break;
      case "disable-clipboard":
        option.disable_clipboard = v2;
        break;
      case "lock-after-session-end":
        option.lock_after_session_end = v2;
        break;
      case "privacy-mode":
        option.privacy_mode = v2;
        break;
      case "enable-file-copy-paste":
        option.enable_file_transfer = v2;
        break;
      case "block-input":
        option.block_input = message.OptionMessage_BoolOption.Yes;
        break;
      case "unblock-input":
        option.block_input = message.OptionMessage_BoolOption.No;
        break;
      case "show-quality-monitor":
      case "allow-swap-key":
        break;
      case "view-only":
        if (v) {
          option.disable_keyboard = message.OptionMessage_BoolOption.Yes;
          option.disable_clipboard = message.OptionMessage_BoolOption.Yes;
          option.show_remote_cursor = message.OptionMessage_BoolOption.Yes;
          option.enable_file_transfer = message.OptionMessage_BoolOption.No;
          option.lock_after_session_end = message.OptionMessage_BoolOption.No;
        } else {
          option.disable_keyboard = message.OptionMessage_BoolOption.No;
          option.disable_clipboard = this.getToggleOption("disable-clipboard")
            ? message.OptionMessage_BoolOption.Yes
            : message.OptionMessage_BoolOption.No;
          option.show_remote_cursor = this.getToggleOption("show-remote-cursor")
            ? message.OptionMessage_BoolOption.Yes
            : message.OptionMessage_BoolOption.No;
          option.enable_file_transfer = this.getToggleOption("enable-file-copy-paste")
            ? message.OptionMessage_BoolOption.Yes
            : message.OptionMessage_BoolOption.No;
          option.lock_after_session_end = this.getToggleOption("lock-after-session-end")
            ? message.OptionMessage_BoolOption.Yes
            : message.OptionMessage_BoolOption.No;
        }
        break;
      default:
        this.setOption(name, this._options[name] ? undefined : "Y");
        return;
    }
    if (name.indexOf("block-input") < 0) this.setOption(name, v);
    const misc = message.Misc.fromPartial({ option });
    this._ws?.sendMessage({ misc });
  }

  togglePrivacyMode(value: string) {
    try {
      const obj = JSON.parse(value);
      const toggle_privacy_mode = message.TogglePrivacyMode.fromPartial({
        impl_key: obj.impl_key,
        on: obj.on,
      });
      const misc = message.Misc.fromPartial({ toggle_privacy_mode });
      this._ws?.sendMessage({ misc });
    } catch (e) {
      console.log('Failed to toggle privacy mode, invalid param "' + value + '"')
    }
  }

  getImageQuality() {
    return this.getOption("image-quality");
  }

  getImageQualityEnum(
    value: string,
    ignoreDefault: Boolean
  ): message.ImageQuality | undefined {
    switch (value) {
      case "low":
        return message.ImageQuality.Low;
      case "best":
        return message.ImageQuality.Best;
      case "balanced":
        return ignoreDefault ? undefined : message.ImageQuality.Balanced;
      default:
        return undefined;
    }
  }

  setImageQuality(value: string) {
    this.setOption("image-quality", value);
    const image_quality = this.getImageQualityEnum(value, false);
    if (image_quality == undefined) return;
    const option = message.OptionMessage.fromPartial({ image_quality });
    const misc = message.Misc.fromPartial({ option });
    this._ws?.sendMessage({ misc });
  }

  loadVideoDecoder() {
    this._videoDecoder?.close();
    loadVp9((decoder: any) => {
      this._videoDecoder = decoder;
      console.log("vp9 loaded");
      console.log('The decoder: ', decoder);
    });
  }
}

function getDefaultUri(isRelay: Boolean = false): string {
  const host = localStorage.getItem("custom-rendezvous-server");
  return getrUriFromRs(host || HOST, isRelay);
}

function getrUriFromRs(
  uri: string,
  isRelay: Boolean = false,
  roffset: number = 0
): string {
  if (uri.indexOf(":") > 0) {
    const tmp = uri.split(":");
    const port = parseInt(tmp[1]);
    uri = tmp[0] + ":" + (port + (isRelay ? roffset || 3 : 2));
  } else {
    uri += ":" + (PORT + (isRelay ? 3 : 2));
  }
  return SCHEMA + uri;
}

function hash(datas: (string | Uint8Array)[]): Uint8Array {
  const hasher = new sha256.Hash();
  datas.forEach((data) => {
    if (typeof data == "string") {
      data = new TextEncoder().encode(data);
    }
    return hasher.update(data);
  });
  return hasher.digest();
}
