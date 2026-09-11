#!/usr/bin/env bash
# 打包「可嵌入库」（无源码改动版）：
#   <OUT>/sundesk-web-client-<label>/            包目录
#   <OUT>/sundesk-web-client-<npmversion>.tgz    npm 标准 tarball（npm install 直接可用）
# 依赖：vite build 产出 flutter/web/js/dist（未改动源码），web_deps 已解压。
#
# 环境变量（CI 用）：
#   WEB_DEPS_DIR  web_deps 解压目录（默认 <repo>/web_deps）
#   NPM_VERSION   写入 package.json 的 semver（默认 0.1.0；打 tag v1.2.3 时传 1.2.3）
#   OUT_DIR       产物输出目录（默认 <repo>/outputs）
# 用法：bash embed/build-lib.sh [label]   label 默认取当天日期，仅用于包目录名
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"                 # sundesk-web/
JS="$ROOT/flutter/web/js"
WEB="$ROOT/flutter/web"
EMBED="$ROOT/embed/sundesk-web-client"
OUT="${OUT_DIR:-$ROOT/outputs}"
LABEL="${1:-$(date +%Y%m%d)}"
NPM_VERSION="${NPM_VERSION:-0.1.0}"
PKG="sundesk-web-client-$LABEL"
DEPS="${WEB_DEPS_DIR:-$ROOT/web_deps}"

echo "==> assembling $PKG (npm version $NPM_VERSION)"
rm -rf "$OUT/$PKG"
mkdir -p "$OUT/$PKG/runtime" "$OUT/$PKG/assets/ogvjs-1.8.6"

# 0) 若 dist 尚未构建，兜底先 vite build（本地/CI 都可直接跑本脚本）
if [ ! -f "$JS/dist/index.js" ]; then
  echo "==> dist 不存在，先执行 vite build"
  (cd "$JS" && (yarn install --frozen-lockfile || yarn install) && npx vite build)
fi

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

# 4) package.json（版本由 NPM_VERSION 注入）
cat > "$OUT/$PKG/package.json" <<JSON
{
  "name": "sundesk-web-client",
  "version": "$NPM_VERSION",
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

# 5) 标准 npm tarball：sundesk-web-client-<version>.tgz
rm -f "$OUT/sundesk-web-client-$NPM_VERSION.tgz"
if command -v npm >/dev/null 2>&1; then
  (cd "$OUT/$PKG" && npm pack --pack-destination "$OUT" >/dev/null)
else
  # 无 npm 环境兜底：手工打包（npm install 仍可识别）
  (cd "$OUT" && tar czf "sundesk-web-client-$NPM_VERSION.tgz" "$PKG")
fi

# 6) 本地 PC 测试包：sundesk-web-client-<version>.zip
#    解压后只有一个根文件夹 sundesk-web-client-<version>/，demo index.html 位于根，
#    直接 cd 进去 python -m http.server 即可；不做第二层嵌套。
ZIP_NAME="sundesk-web-client-$NPM_VERSION"
ZIP_DIR="$OUT/$ZIP_NAME"
rm -rf "$ZIP_DIR" "$OUT/$ZIP_NAME.zip"
cp -r "$OUT/$PKG" "$ZIP_DIR"
cp "$EMBED/demo/index.html" "$ZIP_DIR/index.html"
(cd "$OUT" && zip -qr "$ZIP_NAME.zip" "$ZIP_NAME")

echo "==> done"
ls -la "$OUT"/sundesk-web-client-*.tgz "$OUT"/sundesk-web-client-*.zip
du -sh "$OUT/$PKG"
