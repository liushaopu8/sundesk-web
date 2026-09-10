# sundesk-web-client (embeddable)

把现有的 SunDesk Web 客户端嵌入到任意页面（如 TMS）。
**无源码改动**：本包只是对官方 web 构建产物（`runtime/index.js` + `vendor.js` + `index.css`）
的一层包装，加上运行时资源（ogv.js / yuv / libopus）。

## 安装

```bash
npm install ./sundesk-web-client-<ver>.tgz
```

## 使用（ESM）

**TMS 通常只需传 `sn`**（host/key 已内置为当前环境默认值）：

```js
import { mountSunDesk } from 'sundesk-web-client'
import 'sundesk-web-client/style.css'

const session = mountSunDesk(document.getElementById('host'), {
  sn: 'DEVICE_SN',     // 设备 SN（每个设备不同，由 TMS 传入）
  autoConnect: true,   // 挂载后自动连接
})
```

如需覆盖服务器 / key，或不自动连接（显示连接页手填）：

```js
const session = mountSunDesk(document.getElementById('host'), {
  sn: 'DEVICE_SN',               // 设备 ID（SN）
  host: '172.16.1.31',           // 覆盖默认服务器地址
  key: 'LICENCE_KEY',            // 覆盖默认 licence key
  mode: 'remote',                // 'remote' | 'file'，默认 remote
  autoConnect: false,            // 默认 false：显示连接页
  assetBase: '/sundesk-assets/', // ogvjs/yuv/libopus 的部署路径
  runtimeBase: '/sundesk-lib/',  // index.js/vendor.js/index.css 的部署路径
  onEvent: (e) => console.log(e),// 所有事件回调
})

session.close()     // 断开，回到连接页
session.destroy()   // 彻底卸载
```

### 部署资源（重要）

`assets/` 目录里的文件 **必须通过 HTTP(S) 提供**，不能用 `file://` 直接打开：

```
你的静态目录/
├── sundesk-lib/       ← 放 runtime/ 里的 index.js vendor.js index.css
└── sundesk-assets/    ← 放 assets/ 里的所有文件（含 ogvjs-1.8.6/ 子目录）
```

对应设置 `runtimeBase: '/sundesk-lib/'` 和 `assetBase: '/sundesk-assets/'`。
若包放在页面同级，可省略两个 base（默认 `./` 与 `./assets/`）。

### 事件

`onEvent` 会收到运行时抛出的所有事件，`type` 形如：

- `mounted` / `ready` / `destroyed` — 生命周期
- `connecting` — 发起连接
- `connected` — 首帧到达（会话真正建立）
- `error` — 连接/登录错误（含 ID 不存在、离线、key 不匹配、密码错误等）
- `global-event` — 运行时的原始全局事件（msgbox / peer_info / chat 等）
- `chat` — 收到远端文字消息

也支持 DOM 事件：`window.addEventListener('sundesk-event', e => ...)`。

## 注意

- 需 https 页面时，hbbr 21117 必须配 wss 反代，否则混合内容被拦截。
- UI 与现有 web 完全一致（连接页、工具条、文件管理、移动导航、聊天等），仅挂载容器可指定。
