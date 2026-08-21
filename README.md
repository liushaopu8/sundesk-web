# sundesk-web

RustDesk **1.2.5 全量源码**（`ldz-ldz/rustdesk` 分支 `1.2.5`），AGPLv3 许可。

> 仓库包含完整源码（Rust 核心 + Flutter 客户端），CI 只构建 **Web 客户端**产物。

## CI 构建（Web 客户端）

GitHub Actions（`.github/workflows/web-build.yml`）：

- 每次 push / PR 自动构建，产物 `sundesk-web-1.2.5-web-basic.tar.gz`（Actions Artifact）
- 打 tag（如 `v1.2.5`）自动发布到 GitHub Release
- 可手动触发：Actions → Build Web Client → Run workflow

构建步骤（与上游官方一致，Flutter 3.19.6 + ubuntu-22.04）：

1. `flutter/web/js`：`gen_js_from_hbb.py` + `ts_proto.py` 生成 TS，yarn + typescript + vite@2.8 编译
2. 下载 `web_deps.tar.gz` 预编译依赖
3. `flutter build web --release`
4. 打包 `sundesk-web-1.2.5-web-basic.tar.gz`

## 本地构建

```bash
# 需要 Flutter 3.19.6
cd flutter
flutter build web --release
```

产物在 `flutter/build/web/`。

## Web 客户端配置自定义服务器（hbbs/hbbr）

浏览器打开构建产物后：

1. 设置 → 网络 → ID/Relay Server
   - ID Server：`hbbs_IP:21116`（web 自动走 WebSocket 端口 21118）
   - Relay Server：`hbbr_IP:21117`（自动走 21119）
   - Key：服务器公钥（base64）
   - Apply
2. 主页 Remote ID 输入被控机 ID + 密码连接

或浏览器 DevTools 控制台直接设置（刷新生效）：

```js
localStorage.setItem("custom-rendezvous-server", "IP:21116");
localStorage.setItem("relay-server", "IP:21117");
localStorage.setItem("key", "服务器key");
```

## 许可证

AGPL-3.0，见 [LICENCE](LICENCE)。
