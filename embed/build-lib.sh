#!/usr/bin/env bash
# 打包「可嵌入库」（无源码改动版）：
#   outputs/sundesk-web-client-<ver>/        包目录
#   outputs/sundesk-web-client-<ver>.tgz     npm 可直接 install 的 tarball
# 依赖：vite build 已产出 flutter/web/js/dist（未改动源码），web_deps 已解压到 web_deps/。
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"                 # sundesk-web/
JS="$ROOT/flutter/web/js"
WEB="$ROOT/flutter/web"
EMBED="$ROOT/embed/sundesk-web-client"
OUT="$ROOT/outputs"
VER="${1:-$(date +%Y%m%d)}"
PKG="sundesk-web-client-$VER"
DEPS="${WEB_DEPS_DIR:-$ROOT/web_deps}"

echo "==> assembling $PKG"
rm -rf "$OUT/$PKG"
mkdir -p "$OUT/$PKG/runtime" "$OUT/$PKG/assets/ogvjs-1.8.6"

# 1) 运行时（未改动的 vite 产物）
cp "$JS/dist/index.js" "$JS/dist/vendor.js" "$JS/dist/index.css" "$OUT/$PKG/runtime/"

# 2) 资源：ogvjs / yuv-canvas / yuv.js+wasm / libopus
if [ ! -d "$DEPS" ]; then
  echo "!! web_deps 不存在：$DEPS（先解压 web_deps.tar.gz 到该目录）" >&2
  exit 1
fi
cp -r "$DEPS/ogvjs-1.8.6/." "$OUT/$PKG/assets/ogvjs-1.8.6/"
cp "$DEPS/yuv-canvas-1.2.6.js" "$OUT/$PKG/assets/" 2>/dev/null || true
cp "$DEPS/libopus.js" "$DEPS/libopus.wasm" "$OUT/$PKG/assets/" 2>/dev/null || true
cp "$WEB/yuv.js" "$WEB/yuv.wasm" "$OUT/$PKG/assets/"

# 3) 包装器 + 声明
cp "$EMBED/index.mjs" "$OUT/$PKG/index.mjs"
cp "$EMBED/index.d.ts" "$OUT/$PKG/index.d.ts" 2>/dev/null || true
cp "$EMBED/README.md" "$OUT/$PKG/README.md" 2>/dev/null || true

# 4) package.json
cat > "$OUT/$PKG/package.json" <<JSON
{
  "name": "sundesk-web-client",
  "version": "0.1.0",
  "description": "Embeddable SunDesk web remote-desktop client (wrapper around the stock web build; no source changes).",
  "type": "module",
  "main": "./index.mjs",
  "module": "./index.mjs",
  "types": "./index.d.ts",
  "exports": {
    ".": "./index.mjs",
    "./style.css": "./runtime/index.css"
  },
  "files": ["index.mjs", "index.d.ts", "runtime", "assets", "README.md"]
}
JSON

# 5) tgz
cd "$OUT"
tar czf "$PKG.tgz" "$PKG"
echo "==> done: $OUT/$PKG.tgz"
du -sh "$OUT/$PKG" "$OUT/$PKG.tgz"
