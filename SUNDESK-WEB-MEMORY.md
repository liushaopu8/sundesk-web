# SUNDESK-WEB-MEMORY.md — Web 客户端项目记忆

> 每次提交/打包后更新此文件。打开项目一眼看清全貌。
> 最后更新：2026-08-28

## 一句话

RustDesk 1.2.5 的 **TS 精简 web 客户端**（弃用 Flutter Web UI），vite 构建，连自建 hbbs/hbbr。

## 仓库与目录

- 远程仓库：`github.com/liushaopu8/sundesk-web`（公开）
- 推送：SSH key `~/.ssh/id_ed25519_sundesk_web`（~/.ssh/config 中 github.com 全局指向它，直接 `git push origin <branch>`，无需别名）
- 本地源码：`webclient-work/sundesk-web/`
- 构建包：`webclient-work/*.zip`（每个阶段一个包，见时间线）
- CI：`.github/workflows/web-build.yml`
  - ubuntu-22.04（20.04 已退役）、checkout@v4、`@types/node@16` 锁版本、`libsodium-wrappers@0.7.9` 锁版本（0.7.16 ESM 损坏）
  - artifact 用 `pkg/*` 通配上传 → 下载解压**一次**即得 `sundesk-web/` 文件夹
  - **GitHub Pages 部署已停用**：https 页面 → wss 连不上无 TLS 的 hbbs；要上 Pages 需 caddy/nginx TLS 反代 21118/21119

## 架构

- TS UI：`flutter/web/js/src/`（`ui.js` 界面 + `connection.ts` 核心），vite 构建
- JS 核心：`connection.ts` / `globals.js`；web_deps：ogvjs / yuv-canvas / libopus
- 默认服务器烧入 `flutter/web/js/connection.ts`（HOST/KEY）；`index.html` 首访自动 seed localStorage（custom-rendezvous-server / relay-server / key / serial），设置页可见可改可持久化
- ws/wss 自适应：localhost 走 ws，https 走 wss；web 走 hbbs **21118**(ws) / hbbr **21119**(ws)，填 21116 自动 +2
- 服务器：
  - `172.16.1.31`（web 默认），key `FSagyj6JvIpUf6xKzIKB1F3u1+xzUFuMT1sjry5zOyo=`
  - `172.16.1.238`（Android 联调 hbbs）
- 测试：本地 `python3 -m http.server 8081` + **无痕窗口**（浏览器缓存会害死人，module 脚本独立缓存）；F12 Console 切 **Verbose** 才显示 `[sundesk]` debug 日志

## 关键决策

1. **弃用 Flutter Web UI**：1.2.5 web bridge（`flutter/lib/bridge/defines.dart`）大量 `throw UnimplementedError()`；首帧 `WebHomePage.build()` 调 `mainGetAppNameSync()` 直接崩 → 无限转圈；移动版 UI 在 web 上连接失败后反复重建、输入框被重置无法打字。改用官方 rustdesk web 同款 TS 精简 UI（Host/Key/Id + Connect）。CI 用 sed 剥掉 index.html 里的 `_flutter.loader.load` bootstrap。
2. **三种连接模式**（甫总 8/21 拍板的分流，d07b5ed）：
   - 模式 1 无密码人工审批：连接 → 空登录探测 → 等待 Android 端批准 → 直接进画面
   - 模式 2 kiosk 密码：连接 → 探测 → 密码框/自动填密 → 正确密码 → 进画面
   - 模式 3 密码+人工审批：密码框 → 任意密码可过（Android 端人工授权后不校验）
3. **kiosk 自动密码**（feature/kiosk-autopass）：`ui.js` 常量 `KIOSK_PASSWORD`；收到 `input-password` / `session-login-password` 不弹框直接 `conn.login({password})`（**必须传对象**，传字符串是 e5ab4ce 修过的 bug）；被拒回退手动输入；`session-login-re-password` 也要处理（否则白屏，e67d33f）。
4. **密码消息共 4 种**：input-password / session-login-password / re-input-password / session-login-re-password（connection.ts loginErrorMap）。

## 分支地图

| 分支 | HEAD | 内容 |
|---|---|---|
| `main` | `ef8ed58` | 稳定线（file-transfer step3 收尾） |
| `feature/file-transfer` | `e8e23bd` | 三窗格文件管理器 + 模式合并进连接下拉 |
| `feature/kiosk-autopass` | `e67d33f` | kiosk 硬编码密码自动登录 |
| `feature/ui-redesign` | `e67d33f` | 占位（UI 重设计未开工，HEAD 同 kiosk） |
| `fix/disable-audio-test` | `6660bf4` | **最新**：强制 disable_audio，绕开 Android relay 在音频权限被拒后的崩溃 |

## 提交 / 打包时间线（zip ↔ 内容）

| 日期 | zip 包 | 关键 commit | 内容 |
|---|---|---|---|
| 08-21 | step3-nohashlogin → step6b-sessionlogin（7 个包） | 84c1499 起 | 修复链：onGlobalEvent 全局回调补全 → drawFrame 首帧崩溃 → 密码框/眼睛切换 → re-input-password 重试 → `login({password})` 传参（核心 bug）→ 空登录探测恢复 → 模式分流 d07b5ed → artifact 文件夹 668d9df |
| 08-24 | `sundesk-web-step3-filemanager.zip` | 89256e0 / 3f87941 / c53bb19 / ef8ed58 / e8e23bd | 文件传输三步：远程目录浏览 → 远程文件下载 → 三窗格（本地/远程/传输）+ 上传；修 native confirm() 被密码框劫持；模式 radio 合并进连接 split-button |
| 08-25 | `sundesk-web-kiosk-autopass.zip` | 0b5858e / e67d33f | kiosk 硬编码密码自动登录 + re-password 回退 |
| 08-25 18:34 | （CI artifact） | `6660bf4` | login option 强制 `disable_audio`，绕 Android relay 音频权限崩溃 |
| 08-26 10:23 | `sundesk-web-step7-offlinefix.zip` | **未提交未推送**，仅本地 working tree | ①rendezvous 响应详细日志（punch_hole/relay 各字段）②视频解码器空指针保护（frame 早到跳过）③断连后 inputKey/inputMouse 直接 return（不往死 socket 发）④禁用模块加载时 testDelay() 自动连 .31 |

## 已知问题 / 待办

- **step7 的 4 项改动还在 `fix/disable-audio-test` 的 working tree 里未 commit**（`git status` 可见 connection.ts modified）；验证稳定后应提交推送。
- UI 优化（P1 设计层 CSS 变量/主题、P2 会话工具栏、P3 浮层卡片）甫总 8/21 拍板，未开工。
- 文件传输限制：zstd 压缩未做、覆盖确认弹窗未做、空目录上传不保留、大文件全量读内存。
- hbbs 对 punch_hole 请求：peer 在线才回包，不在线静默忽略 → 客户端 12s Timeout（不是 bug，是被控机没注册到同一 hbbs+Key）。
- 上线公网需 TLS 反代 21118/21119（Pages 停用原因）。

## 身份模型（与 Android 端联调相关，详见 sundesk-android/SUNDESK-MEMORY.md）

- id = 硬件 SN（拨号号码）；pk = SHA256(SN) 确定性派生 ed25519；uuid = SHA256(SN) 前 16 字节。三者独立，重装/清数据不丢。
- **换身份方案后必须一次性清理 hbbs 旧记录**，否则服务器存的旧随机 pk/uuid 永远对不上：
  `sqlite3 db_v2.sqlite "DELETE FROM peers WHERE id='S200XE22614E0010';"` 然后重启 hbbs。
