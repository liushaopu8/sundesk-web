# SunDesk Web — 设计规范 (DESIGN.md)

> 本文件是 SunDesk Web 客户端的唯一视觉/交互准则。所有 TS UI 改动以此为准。
> 方法论参考：UI UX Pro Max skill（product 工具型 App 模式）。
> 创建于 2026-08-24，作者维斯，待甫总确认。

---

## 1. 产品定位

- **类型**：远程桌面工具型 Web App（utility / productivity tool），对标 RustDesk / AnyDesk / TeamViewer 的 web 客户端。
- **使用场景**：专业运维、长时间会话、常在低光/夜间使用；强调功能密度、状态可见、操作高效。
- **不是**：营销落地页、SaaS 仪表盘。不需要 Hero 大图、渐变、CTA 轰炸。
- **三句话原则**：信息密度高但不拥挤；状态一眼可见；操作不超过两次点击。

---

## 2. 设计风格

**Flat Professional（扁平专业）**：
- 无渐变、无重阴影；用 1px 边框 + 极轻阴影（subtle shadow）分层。
- 圆角克制：控件 `6px`，卡片/面板 `8px`，不加超大圆角（那是消费 App 气质）。
- 动效快而克制：`150–200ms ease`，仅用于 hover/面板显隐/状态切换；**不做**装饰性动画。
- 图标统一用内联 SVG（Lucide / Heroicons 线性风格，stroke 1.75–2px），**禁止 emoji 当图标**。

---

## 3. 配色系统

中性深灰（slate/zinc）做骨架，单一品牌蓝做强调。深色模式优先（工具长时间使用），浅色模式同步支持。

### Design Tokens（CSS 变量，挂在 `:root` 和 `[data-theme="dark"]`）

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `--bg` | `#F8FAFC` (slate-50) | `#0B0E14` | 应用底色 |
| `--surface` | `#FFFFFF` | `#151A22` | 卡片/面板 |
| `--surface-2` | `#F1F5F9` (slate-100) | `#1E2530` | 工具栏/表头/hover 层 |
| `--border` | `#E2E8F0` (slate-200) | `#2A3340` | 1px 分隔线 |
| `--text` | `#0F172A` (slate-900) | `#E6E9EF` | 主文字 |
| `--text-muted` | `#64748B` (slate-500) | `#94A3B8` | 次要文字/标签 |
| `--primary` | `#024EFF` (RustDesk 品牌蓝) | `#3B6DFF` | 主按钮/聚焦/链接（深色提亮保证对比） |
| `--primary-fg` | `#FFFFFF` | `#FFFFFF` | 主按钮文字 |
| `--accent` | `#0D9488` (teal-600) | `#14B8A6` | 辅助强调（在线状态/成功，谨慎用） |
| `--success` | `#16A34A` | `#22C55E` | 成功/已连接 |
| `--warning` | `#D97706` | `#F59E0B` | 等待审批/进行中 |
| `--danger` | `#DC2626` | `#EF4444` | 断开/错误/破坏性操作 |
| `--ring` | `#024EFF` | `#3B6DFF` | 键盘聚焦环 |

### 配色铁律
1. 文字对比 ≥ 4.5:1（正文），图标按钮 ≥ 3:1。
2. **禁止**紫蓝渐变、彩色玻璃拟态、卡片套卡片。
3. 状态色只用于状态语义，不拿来装饰大面积区域。
4. 远程画面 canvas 区域保持纯黑底（`#000`），让远程桌面本身成为视觉主角，chrome 退后。

---

## 4. 字体排印

- **字体族**：`Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **基准 16px**，行高 .5。
- **字阶**（type scale）：
  - 标题/连接 ID：20px / 600
  - 区块标题：15px / 600
  - 正文：14px / 400
  - 辅助/标签：12px / 500（`--text-muted`，不低于 12px）
  - 等宽（ID/路径/数字）：`"JetBrains Mono", ui-monospace, monospace`
- 标题不用超粗体（700+），工具类 600 足够。
- 连接 ID、文件路径、地址用等宽字体，提升可辨识度。

---

## 5. 间距与栅格

- **8px 基准栅格**：间距取 4 / 8 / 12 / 16 / 24 / 32。
- 控件内边距：按钮 `8px 14px`，输入框 `8px 12px`。
- **触控/点击目标 ≥ 36px**（桌面 web；移动端 ≥ 44px），图标按钮保持 36×36。
- 面板之间用 12–16px gap，不要用大留白冒充高级感。

---

## 6. 三大主界面布局

### 6.1 连接页（Connection）
- 居中卡片，宽 380–420px，垂直居中。
- 卡片内含：Logo + "SunDesk" 标题、Host / ID / Key 三个输入框（带 label，不再用占位符当 label）、设置入口（齿轮图标右上角）、主按钮 Connect。
- ID 输入框旁可选"最近连接"下拉（localStorage 历史）。
- 卡片下方状态行：连接中 / 等待审批 / 错误，用点状态色 + 文字。

### 6.2 远程会话页（Remote Session）
- 顶部**工具栏**（高 44px，`--surface-2` + 底边框），左到右：
  - 连接标识（远程 ID，等宽）+ 状态点
  - 连接信息（分辨率/延迟，次要文字）
  - 弹性间隔
  - 图标按钮组：文件传输、剪贴板、聊天、全屏、缩放适配、画质、更多（⋮）、断开（红色，最右）
- 下方**画面区**：黑底，canvas 等比缩放居中（letterbox），工具栏悬浮或贴顶（待定，默认贴顶）。
- 密码框/等待审批：画面中央浮层卡片，不弹浏览器原生 dialog。

### 6.3 文件管理器（File Manager）
- **布局（甫总 2026-08-24 拍板，对齐 RustDesk 桌面端）**：三竖栏 `本地计算机 | 远程计算机 | 传输中`，第三列仅在有传输任务时出现。
- 每栏（本地/远程）：工具栏（返回/父目录/默认目录/搜索/刷新）+ 操作行（本地：默认目录、新建、删除、全选、显示隐藏、发送；远程：接收、默认目录、新建、删除、全选、显示隐藏）+ 列表（名称/修改时间/大小，可排序，目录在前，复选框多选）。
- 本地栏受浏览器沙箱限制：无法枚举用户磁盘，用 File System Access API（Chrome/Edge）授权目录句柄后浏览/新建/删除/收发；句柄 IndexedDB 持久化；非 Chromium 降级只读。
- 传输栏：每任务一行（文件名、百分比、已传/总计、状态、取消）。

---

## 7. 组件规范

### 按钮
- **Primary**：`--primary` 底 + 白字，用于 Connect / 确认。
- **Secondary**：`--surface` 底 + 1px border，用于取消。
- **Ghost/Icon**：透明底，hover `--surface-2`，36×36，必须有 `aria-label`/`title`。
- **Danger**：`--danger` 底白字（断开），或红字 ghost 样式（次要破坏性）。
- hover 过渡 150ms；`:focus-visible` 用 2px `--ring` + 2px offset，**禁止 outline:none 不替换**。

### 输入框
- 高 36px，`--surface` 底，1px `--border`，圆角 6px。
- focus 时边框变 `--primary` + 外环 `--ring`（2px）。
- label 始终可见（不放 placeholder-only）；错误信息显示在框下方红字 + 框边转红。

### 工具栏图标按钮
- 线性 SVG，18px，active 态用 `--primary` 底色块。
- tooltip 显示功能名 + 快捷键（如"全屏 (F11)"）。

### 浮层 / 对话框
- `--surface` 底，1px border，圆角 8px，`box-shadow: 0 8px 24px rgba(0,0,0,.24)`。
- 遮罩 `rgba(0,0,0,.5)`，淡入 150ms。

---

## 8. 可访问性 & 交互 (A11y) — 最高优先级

1. 所有交互控件键盘可达；Tab 顺序符合视觉顺序。
2. 图标按钮必须有可访问名称（`aria-label`）。
3. 焦点环始终可见（绝不裸 `outline:none`）。
4. 远程 canvas 键盘转发时，确保 Esc/全屏等键不被误吞；用户能轻松"逃出"远程焦点（提供明确的释放/断开按钮）。
5. 尊重 `prefers-reduced-motion`：动效降级为瞬时。
6. 颜色不是唯一信息载体：状态同时用图标+文字（错误不仅是红，还有提示语）。

---

## 9. 响应式

- 断点：375（手机）/ 768（平板）/ 1024 / 1440。
- 桌面 web 为主战场；手机端：工具栏可横向滚动，文件管理切单栏。
- 不出现横向滚动；不禁止用户缩放。

---

## 10. 实现约束（针对我们的技术栈）

- **栈**：vanilla TypeScript + Vite，**无 React/Vue/Tailwind**。
- 样式方案：在 `src/style.css` 内用 CSS 变量 + 语义类（如 `.btn-primary`、`.toolbar`、`.panel`），不引 UI 库。
- 图标：内联 SVG，封装成简单的 `icon(name)` 函数返回 SVG 字符串，统一 18px/stroke。
- 主题：`data-theme="dark|light"` 属性切换；默认跟随系统 `prefers-color-scheme`，设置里可手动覆盖并存 localStorage。
- 所有改动保持现有 `base: './'`（相对路径，适配 Pages 子路径）。

---

## 11. 分期落地计划（建议）

1. **P1 基础设计层**：CSS 变量、主题切换、按钮/输入/图标组件样式 → 重写连接页。
2. **P2 会话框架**：顶部工具栏骨架 + 画面区布局，把现有 canvas/输入控制迁入，保留全部已通的登录模式逻辑。
3. **P3 浮层**：密码框/等待审批/错误统一为浮层卡片（替换裸 div）。
4. **P4 文件管理器**：connection.ts 加 FileTransfer 路由 → 远程目录浏览 → 上传/下载 → 传输队列。
5. **P5 增强**：聊天、剪贴板开关、画质/缩放、全屏、最近连接。

每一步独立可测、可回退到 step6b 基线。

---

## 12. 工程准则（Karpathy 四原则，写代码时强制遵守）

源自 Andrej Karpathy 对 LLM 编码缺陷的观察，作为本项目硬约束：

1. **Think Before Coding（先想后写）**：有歧义就问甫总，不偷偷选一个理解；有更简单方案就说出来；改之前先确认影响面。
2. **Simplicity First（简单优先）**：只写当前任务需要的代码。不做没要求的功能、不为单次使用造抽象、不加没要求的"灵活性/可配置项"、不引 UI 框架/依赖（本项目坚持 vanilla TS + CSS）。能 100 行解决就不写 200 行。
3. **Surgical Changes（外科手术式改动）**：P1 只动样式与连接页，绝不顺手修改 step6b 已通的登录模式/输入控制逻辑；不删除自己没完全理解的代码/注释；每次 commit 范围聚焦。
4. **Goal-Driven Execution（目标驱动）**：每期先定可验证的成功标准（能跑、能连、三种模式不破），改完构建验证再交差，不交付无法验证的东西。

> 本文件为设计/工程唯一准则；与 SOUL.md / MEMORY.md 冲突时以沟通确认为准。
