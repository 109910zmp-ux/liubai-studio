# 留白 · Screenshot Studio

将一组 App 截图快速排版成一份「留白」风格的作品海报。选择模板、调整配色与参数，然后一键导出为 PNG 图片、MP4 动效视频或按模板分组打包的 ZIP 文件。

![Version](https://img.shields.io/badge/version-2.0.0-8B8174)
![React](https://img.shields.io/badge/React-19-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6)
![Vite](https://img.shields.io/badge/Vite-7-646cff)

---

## 目录

- [项目简介](#项目简介)
- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [版本要求](#版本要求)
- [快速开始](#快速开始)
- [使用说明](#使用说明)
  - [基本流程](#基本流程)
  - [素材](#素材)
  - [模板与参数](#模板与参数)
  - [配色与主题 JSON](#配色与主题-json)
  - [导出](#导出)
  - [项目文件与草稿](#项目文件与草稿)
  - [快捷键](#快捷键)
- [数据格式示例](#数据格式示例)
  - [主题配色 JSON](#主题配色-json)
  - [Reeden 模板 HTML](#reeden-模板-html)
  - [项目文件 JSON](#项目文件-json)
- [项目结构](#项目结构)
- [常见问题](#常见问题)
- [贡献指南](#贡献指南)
- [许可证](#许可证)
- [联系方式](#联系方式)

---

## 项目简介

「留白 · Screenshot Studio」是一个纯前端工具，无需后端即可使用。它把 App 截图按预设版式排列成带主题配色、图文标注和展映动效的作品，常用于制作应用介绍图、产品宣传海报或截图展示合集。

核心思路：**导入截图 → 选择模板 → 调整配色/参数 → 导出**。所有处理都在浏览器本地完成，截图、草稿和项目文件不会上传到任何服务器。

## 功能特性

- **多套排版模板**：内置 3 图、4 图、6 图三套版式，素材数量变化时自动切换可容纳的模板；也可导入 Reeden 单文件 HTML 模板，与内置模板统一管理。
- **丰富的模板参数**：支持开关、下拉、滑杆、颜色、文本、图片、字体七类参数，覆盖 3D 展映、卡片外观、图文排版、**水印与质感**等分组，支持搜索与分组折叠。
- **导入 Reeden 模板**：顶栏「导入」可载入 Reeden 单文件 HTML 模板，自动解析元数据、参数与屏幕配置；支持导入整个文件夹保留来源目录，并按内置名称 / 文件夹名 / 文件名一键自动分组；模板元数据会内嵌进项目文件，跨设备可移植。
- **自定义字体**：标题字体（图文排版组）与水印字体（水印与质感组）可上传本地 `.ttf` / `.otf` / `.woff`，导出产物同样生效；水印字体留空时自动跟随标题字体。
- **图片 / 文字水印**：文字水印可调字体、浓度；图片水印作为可调节大小的平铺层覆盖整张海报。
- **一键风格预设**：原始 / 杂志感 / 极简展映 / 胶片颗粒 / 玻璃拟态。
- **智能取色**：从素材中分析主色，自动生成匹配的明暗配色。
- **主题 JSON 导入**：支持 Reeden 主题配置，也支持任意含颜色字段的 JSON（详见 [主题配色 JSON](#主题配色-json)）。
- **浅色 / 深色纸面**：切换作品明暗，不改变已选配色；顶栏界面主题支持 **浅色 / 深色 / 跟随系统** 三态循环。
- **实时预览**：主预览支持滚轮缩放与拖拽画布；独立悬浮预览可拖标题栏移动、拖**右下角调整窗口大小**、滚轮缩放、最小化或全屏。
- **中英文界面**：顶栏「中 / EN」按钮一键切换界面语言，选择会被本地记住；只影响界面文字，不改动海报内容。
- **可取消的导出**：导出时显示实时进度条，可随时「取消导出」中止任务（取消后不会生成文件）。
- **导出字体子集化**：导出时用 HarfBuzz WASM 按需裁剪自定义字体，只保留画面实际用到的字形，9 MB 级中文字体可压到几 KB，显著加速并避免 iPadOS 视频导出崩溃。
- **一键全部重置**：清空素材、参数、配色与本机草稿，恢复到初始状态，可用撤销找回。
- **导出能力**：
  - PNG 图片（可调输出宽度 640–3840）。
  - 视频（优先 WebCodecs 逐帧编码为 MP4，不支持时自动回退浏览器 MediaRecorder；可调时长、帧率、清晰度）。
  - 批量 ZIP（按模板容量自动分组，可选仅图片 / 仅视频 / 图片 + 视频）。
- **WebKit / iOS 适配**：SVG 渲染前预解析 `calc()` / `var()` 表达式，H.264 编码时强制偶数像素规避 iOS 录制失败，安全区域与 `dvh` 视口单位内建支持；iOS Safari 16.4+ 已验证。
- **自适应缩放**：首次载入自动 fit-to-window，用户手动缩放后自动适配立即暂停，保持画布比例不变。
- **本地草稿自动保存**：基于 IndexedDB（存储 base64 无 localStorage 配额限制），刷新页面后编辑内容仍可恢复。
- **项目文件保存 / 载入**：JSON 格式，完整还原素材、模板、参数与配色；也可读取旧版 Reeden payload。
- **撤销 / 重做**：支持键盘快捷键，连续编辑（颜色、参数、拖拽）合并为一次历史操作。
- **响应式界面**：移动端提供「设置 / 预览」分栏切换，悬浮预览在窄屏自动隐藏以避免遮挡。

## 技术栈

| 类别 | 技术 |
| --- | --- |
| 框架 | React 19 |
| 语言 | TypeScript 5.9（严格模式） |
| 构建 | Vite 7 |
| 样式 | Tailwind CSS v4 |
| 组件 | Base UI（`@base-ui/react`）、lucide-react、class-variance-authority |
| 国际化 | 自研轻量 i18n（中文 / 英文，按源文案映射） |
| 字体子集化 | HarfBuzz WASM（`harfbuzz-subset.wasm`，仅在导出用到自定义字体时按需加载） |
| 视频编码 | WebCodecs `VideoEncoder` → H.264 MP4 + `mp4-muxer` 封装；MediaRecorder 作为回退 |
| 单文件产物 | `vite-plugin-singlefile`（构建为可直接双击打开的 HTML） |
| 测试（预留） | Playwright 1.65（devDependency，尚未接入测试脚本） |

## 版本要求

- **Node.js**：20.19+ 或 22.12+（推荐 22 LTS；本项目在 Node 23 下开发验证）。
- **包管理器**：npm（随 Node 附带）。

## 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/xufn0v0/liubai-studio-plus.git
cd liubai-studio-plus

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev
```

浏览器打开终端输出的地址（默认 `http://localhost:5173`）即可使用。

### 构建生产版本

```bash
npm run build
```

产物输出到 `dist/`。由于使用了 `vite-plugin-singlefile`，构建结果是一个自包含的 HTML 文件，可直接双击打开（`base` 配置为 `./`）。

### 本地预览构建产物

```bash
npm run preview
```

## 使用说明

### 基本流程

1. 点击顶栏「导入」选择截图（也可在左侧「素材」面板拖入）。同一入口还支持一次选择 Reeden 模板 HTML、配色 JSON、项目文件或字体，会自动放入对应面板。
2. 在「排版模板」挑选版式（内置或已导入的 Reeden 模板）。
3. 用「模板参数」「配色」「底色」调整视觉效果。
4. 点击顶栏「导出」或左侧「导出」面板，选择 PNG、视频或批量 ZIP。

> 应用内右上角「说明」按钮也内置了同样的快速上手引导；顶栏「中 / EN」按钮可随时切换中英文界面，选择会被记住。

### 素材

- 支持多选、拖拽导入，格式为 PNG / JPG / WEBP / HEIC（HEIC 依赖浏览器解码能力）。
- 每张素材可填写图注（留空则自动使用页面名），并可标注页面类型（书架、首页、统计等）。
- 拖动缩略图可调整顺序；导入素材不会改动你已有的配色。

### 模板与参数

- 内置三套模板：**3 图**、**4 图**、**6 图**。素材数量变化时会自动切换到能容纳全部素材的模板。
- 「模板参数」面板提供分组与搜索，核心分组默认展开，细调分组默认折叠，展开状态会被记住。参数类型涵盖：开关、下拉、滑杆、颜色、文本、图片、字体。
- 「风格预设」可一键套用整组参数，手动调整后预设状态自动取消。
- **水印与质感**分组（开启水印后显示）：
  - 文字水印：开关、文字、字体（系统下拉 / 自定义上传 `.ttf` / `.otf` / `.woff`）、浓度（%）。
  - 图片水印：上传图片，作为平铺覆盖整张海报，可调大小（%）。
  - 水印自定义字体留空时，自动跟随「图文排版」分组的标题字体。

#### 导入 Reeden 模板

除内置 3 / 4 / 6 图模板外，还可导入 Reeden 单文件 HTML 模板，与内置模板在同一面板统一管理：

- **入口**：顶栏「导入」按钮选择 `.html` / `.htm` 文件；右侧下拉箭头可选「导入模板文件夹」，用文件夹选择器导入整个目录以保留来源路径。
- **识别要求**：模板 HTML 必须声明 `ReedenShareTemplate` 渲染入口，且 `reeden-template-version` 为 `1`；单文件上限 2 MB；只导入可信来源。
- **自动解析**：从 `<meta name="reeden-template-*">` 读取类型（笔记 / 书评 / 书单 / 阅读信息 / 今日目标 / 年度目标 / 角色对话 / 我的阅读 / 角色关系 / 主题预览 / 封面）、名称、画布宽度、屏幕配置，并从 `<meta data-red-param>` 提取参数（类型、标签、默认值、分组、选项、范围、显示条件）。
- **模板信息卡片**：选中导入模板后展示其全部 `reeden-template-*` 元数据，便于核对。
- **自动分组**：模板面板「自动分组」左侧按当前方式执行，右侧箭头切换分组依据——**内置名称**（模板自带 group / 类型 / 名称前缀）、**导入文件夹名称**、**文件名**，选择后立即分组。
- **管理**：导入模板可在组内上下排序、移动到其他组、重命名组、单独删除或删除整个组；分组与排序会随项目文件保存。

### 配色与主题 JSON

- 点击色块可修改六项颜色：主色、背景、文字、辅助文字、卡片、边框。
- 「从图片取色」会分析当前素材并覆盖现有配色，同时切换到匹配的明暗纸面。
- 「恢复默认」回到浅色 / 深色的默认配色。
- 支持粘贴或导入主题配色 JSON，导入时可自动带入主题名字、简介、作者与分享者。

### 导出

| 选项 | 说明 | 可调范围 |
| --- | --- | --- |
| PNG 图片 | 单张作品图片 | 宽度 640–3840（默认 1280，步长 64） |
| 视频 | 动效视频（优先 MP4，回退录制） | 时长 1–10s、帧率 12–30、清晰度 标准/清晰/高清 |
| 批量导出 ZIP | 按模板容量分组打包 | 仅 PNG / 仅视频 / 图片 + 视频 |

#### 视频引擎

视频导出有两条路径，按浏览器能力自动选择：

| 引擎 | 浏览器支持 | 特点 |
| --- | --- | --- |
| **WebCodecs（主要）** | iOS Safari 16.4+、Chrome / Edge / Firefox 现代版本 | 直接用 `VideoEncoder` 逐帧编码为 H.264 + `mp4-muxer` 封装为 MP4；无需捕获流、不占实时间、速度更快；规避 iOS 26 及以上已知的 MediaRecorder MP4 冻结问题 |
| **MediaRecorder（回退）** | 所有支持 `canvas.captureStream` 的浏览器 | 把画布帧实时喂给浏览器录制接口；WebKit 环境下优先 MP4，回退 WebM；录制期间请保持页面在前台 |

- 两条路径都要求模板具备 3D 时间轴（当前模板都满足）；导出时会临时启用 3D 展映，完成后自动恢复原始预览参数。
- 如果浏览器连 MediaRecorder 都不支持（例如旧版 iOS Safari），视频按钮会禁用并提示改走 PNG。
- 导出过程中会显示进度条；点击「取消导出」可随时中止当前任务，取消后不会生成文件。
- 使用自定义字体时，导出前会用 HarfBuzz 做字形子集化（只保留画面用到的字），大字体也能流畅导出。

### 项目文件与草稿

- **草稿**：编辑内容自动保存到浏览器 IndexedDB，刷新后自动恢复；「项目」对话框可清空草稿。
- **项目文件**：保存为 JSON，包含素材、模板、参数与配色，可跨设备完整恢复（不包含草稿状态）。
- **导入模板可移植**：若使用了导入的 Reeden 模板，其 HTML 原文与分组 / 来源元数据会一并内嵌进项目文件，换设备载入项目即可恢复，无需重新导入模板。
- **全部重置**：在「项目」对话框的「全部重置」按钮可一键清空素材、参数、配色与本机草稿，恢复到初始状态。按钮带有 4 秒二次确认，且重置后仍可通过撤销找回操作。

### 快捷键

| 快捷键 | 作用 |
| --- | --- |
| `Ctrl/Cmd + Z` | 撤销 |
| `Ctrl/Cmd + Shift + Z` 或 `Ctrl + Y` | 重做 |
| `Esc` | 关闭弹窗或颜色选择器 |
| 主预览滚轮 | 缩放 |
| 主预览拖拽 | 移动画布 |

## 数据格式示例

### 主题配色 JSON

支持 Reeden 主题配置，也可直接放入含颜色字段的任意 JSON。导入时应用会优先识别标准字段，未命中时递归扫描颜色值。

```json
{
  "name": "暖调",
  "config": {
    "backgroundColor": "#F4EDE5",
    "foregroundColor": "#342E2A",
    "mutedForegroundColor": "#8A8178",
    "primaryColor": "#8B8174",
    "cardColor": "#F9F6F0",
    "borderColor": "#D8D0C5",
    "mode": "light",
    "author": "留白",
    "description": "暖调纸面配色"
  }
}
```

可识别的标准字段映射：

| JSON 字段 | 对应颜色 |
| --- | --- |
| `primaryColor` / `accentColor` | 主色 |
| `backgroundColor` | 背景 |
| `foregroundColor` | 文字 |
| `mutedForegroundColor` | 辅助文字 |
| `cardColor` | 卡片 |
| `borderColor` / `dividerColor` | 边框 |

其他可读字段：`mode`（`dark` / `light`）、`name` / `title`、`description` / `desc` / `intro`、`author`、`nickname` / `sharer`、`cardBackgroundBlur`。

### Reeden 模板 HTML

导入的 Reeden 模板是一个**自包含的单文件 HTML**：宿主契约全部声明在 `<meta>` 标签里，无需额外 schema。最小可用结构如下：

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <!-- 必需：版本固定为 1 -->
    <meta name="reeden-template-version" content="1" />
    <meta name="reeden-template-name" content="我的模板" />
    <meta name="reeden-template-type" content="themePreview" />
    <meta name="reeden-template-width" content="640" />
    <meta name="reeden-template-canvas" content="long" />
    <meta name="reeden-template-group" content="我的分组" />
    <meta name="reeden-template-screens" content='[{"label":"1","page":"home"},{"label":"2","page":"reader"}]' />
    <!-- 参数声明：param.* 进入 payload.params，cover.* 进入 payload.cover -->
    <meta data-red-param="param.primaryColor" data-red-type="color" data-red-label="主色"
          data-red-default="#8B8174" data-red-group="配色" />
    <meta data-red-param="cover.title" data-red-type="text" data-red-label="封面标题"
          data-red-default="" data-red-group="封面" />
  </head>
  <body>
    <div class="poster" data-reeden-capture id="poster"></div>
    <script>
      // 必需：渲染入口，接收 makePayload 产出的载荷
      window.ReedenShareTemplate = { render(payload) { /* 渲染海报 */ } }
    </script>
  </body>
</html>
```

关键约定：

- `reeden-template-version` 必须为 `1`，否则导入会被拒绝（提示「不支持的模板版本」）。
- `window.ReedenShareTemplate.render(payload)` 是渲染入口，缺失会提示「未找到 ReedenShareTemplate 渲染入口」。
- `data-red-type` 支持 `switch` / `select` / `range` / `color` / `text` / `image` / `font`；不识别时按 `text` 处理。
- `data-red-when` 可声明参数的显示条件，`data-red-options` 以下拉选项（逗号分隔）。
- 其他 `reeden-template-*` 元数据（如 `output`、`duration`、`fps`、`radius` 等）不会进入参数面板，但会在「模板信息卡片」中展示。

### 项目文件 JSON

「项目」对话框保存的项目文件结构如下：

```json
{
  "app": "liubai-screenshot-studio",
  "version": 1,
  "savedAt": "2026-11-25T00:00:00.000Z",
  "template": "reeden主题预览模板-留白-3图",
  "params": {},
  "colors": {
    "backgroundColor": "#F4EDE5",
    "foregroundColor": "#342E2A",
    "mutedForegroundColor": "#8A8178",
    "primaryColor": "#8B8174",
    "cardColor": "#F9F6F0",
    "borderColor": "#D8D0C5"
  },
  "themeName": "我的主题",
  "themeDesc": "",
  "themeAuthor": "",
  "urlText": "",
  "sharer": "",
  "tone": "light",
  "shots": [],
  "templateHtml": null,
  "templateData": null,
  "importedTemplates": []
}
```

> 当当前模板是导入的 Reeden 模板时，`templateHtml` 为该模板的 HTML 原文，`templateData` 为模板的 mock 数据，`importedTemplates` 为所有导入模板的可移植记录：
>
> ```json
> {
>   "key": "imported-themePreview-abc123",
>   "html": "<!doctype html>...",
>   "group": "我的分组",
>   "sourceFile": "my-template",
>   "sourceFolder": "themes",
>   "mock": {}
> }
> ```

## 项目结构

```
liubai-studio/
├── src/
│   ├── App.tsx                      # 应用主界面（工作室 + 对话框 + 使用说明）
│   ├── main.tsx                     # React 入口
│   ├── vite-env.d.ts                # Vite 环境类型声明
│   ├── index.css                    # 全局样式 + safe-area / dvh 适配
│   ├── components/
│   │   ├── studio/                  # 工作室各面板与共用组件（素材 / 模板 / 参数 / 配色 / 导出 / 颜色选择器）
│   │   └── ui/                      # 基础 UI 组件（基于 Base UI；button、dialog、slider、dropdown-menu 等共 19 件）
│   ├── i18n/
│   │   ├── index.tsx                # 语言上下文与切换（中 / 英，localStorage 记忆）
│   │   └── dictionary.ts            # 中文源文案到英文的映射表
│   ├── hooks/
│   │   ├── useStudio.ts             # 核心状态与业务逻辑（含 resetAll）
│   │   ├── useHistory.ts            # 撤销 / 重做
│   │   └── useUiTheme.ts            # 界面明暗主题（浅色 / 深色 / 跟随系统）
│   ├── lib/
│   │   ├── exporter.ts              # PNG / 视频 / 批量 ZIP 导出（WebCodecs + MediaRecorder 双引擎，支持取消）
│   │   ├── fontSubset.ts            # 导出时按需裁剪字体（HarfBuzz WASM）
│   │   ├── harfbuzz-subset.wasm     # 字体子集化 WASM 模块
│   │   ├── templates.ts             # 模板构建 / 参数求值 / 解析导入的 Reeden HTML
│   │   ├── project.ts               # 项目文件（JSON）读写
│   │   ├── draft.ts                 # 草稿（IndexedDB）
│   │   ├── palette.ts               # 取色与配色分析
│   │   ├── presets.ts               # 风格预设
│   │   ├── payload.ts               # 预览载荷构建
│   │   ├── zip.ts                   # 极简 ZIP 写入
│   │   ├── math.ts                  # 通用数学工具
│   │   ├── color.ts                 # 颜色值转换与对比度计算
│   │   ├── types.ts                 # 共享类型定义
│   │   └── constants.ts             # 常量与默认配色
│   ├── templates/theme-base.html    # 模板基底（3/4/6 图共用，按元数据占位替换）
│   ├── data/templates.meta.json     # 模板元数据（参数分组、开关条件、默认值）
│   └── …（更多资源）
├── index.html                       # HTML 入口
├── vite.config.ts                   # Vite 配置（Tailwind v4 + singlefile）
├── tsconfig.json                    # TypeScript 配置（严格模式）
├── components.json                  # 组件配置（shadcn 风格，基于 Base UI）
└── package.json
```

## 常见问题

**Q：为什么视频导出按钮是禁用的？**
浏览器既不支持 WebCodecs（`VideoEncoder`）也不支持 MediaRecorder。常见于旧版 iOS Safari；升级到 16.4+ 即可启用 WebCodecs 路径。PNG 导出始终可用。

**Q：为什么视频导出比以前快？**
项目现已优先使用 WebCodecs 直接编码 H.264 帧（不经过实时 canvas 录制），跳过了浏览器的实时间隙，所以速度显著提升，尤其在 iOS Safari 上效果明显。

**Q：导出的视频仍然是 WebM 而不是 MP4？**
这表示 WebCodecs 路径没有启用（浏览器不支持或没有可用的 H.264 profile），应用自动回退到 MediaRecorder。回退时如果浏览器不支持 MP4 录制就会输出 WebM；目前 Safari 回退仍可正常产出 MP4。

**Q：MediaRecorder 回退时视频为什么偶尔卡住？**
iOS 26+ 的 MediaRecorder MP4 接口存在已知的冻结问题，这正是新增 WebCodecs 路径的原因。一旦 WebCodecs 不可用而强制走回退，请保持页面在前台，避免浏览器降频。

**Q：导入配色 JSON 没有反应？**
确认 JSON 内确实包含可识别的颜色字段。若没有命中任何颜色，应用会提示「没有识别到颜色字段」。

**Q：草稿存在哪里？会泄露吗？**
草稿保存在浏览器本地 IndexedDB（数据库名 `liubai-studio-drafts`），不会上传到任何服务器。之所以不用 localStorage，是因为 base64 截图容易超过 ~5 MB 的配额上限。

**Q：为什么某些截图没有出现在作品里？**
当前模板的「位置数」决定了最多展示多少张素材，超出部分会被保留但不在作品中显示。素材数量变化时应用会自动切换容量更大的模板。

**Q：如何把作品迁移到另一台设备？**
在「项目」对话框保存项目文件（JSON），再在新设备载入即可。项目文件里内嵌了所有素材的 base64 数据，不依赖原图片文件。

**Q：主预览缩放后再导入素材，画布为什么不再自动适应窗口？**
这是设计行为：手动缩放（滚轮或按钮）后自动 fit 会暂时禁用，保持你设定的画布比例。切换模板或重新载入项目后会恢复自动适配。

**Q：在 iPhone 刘海屏上用，内容为什么不往刘海底下延伸？**
项目已内置 `env(safe-area-inset-*)` 与 `dvh` 视口单位支持，内容会避开顶部刘海和底部 Home Indicator，无需额外设置。

**Q：点了「全部重置」会不会后悔？能不能找回？**
全部重置会写入撤销历史 — 重置后立刻按 `Ctrl/Cmd + Z` 即可回滚到重置前的状态，素材、参数、配色、草稿都会回来。按钮本身也设计了 4 秒二次确认来防误触。

**Q：自定义字体支持哪些格式？上传后预览和导出都会生效吗？**
支持 `.ttf`、`.otf`、`.woff`，大小不限。上传后预览区立即使用该字体，PNG / 视频 / 批量 ZIP 导出也都会正确渲染。水印字体留空时会自动跟随自定义标题字体。

**Q：图片水印为什么盖不满整张海报？**
图片水印采用平铺模式。如果觉得单个水印块太大或太小，在「水印与质感」分组调整「图片水印大小（%）」即可；数值越小，平铺密度越大。

**Q：iOS 上导出视频还是失败 / 画面花掉？**
已针对 iOS 录制的已知坑做了三重加固：导出前字体子集化、SVG 渲染前预解析 `calc()` / `var()` 表达式、H.264 编码时强制输出偶数像素。如果仍然失败，请确认 Safari 版本 ≥ 16.4，或暂时改用 PNG 导出。

**Q：如何切换中英文界面？**
点击顶栏的「中 / EN」按钮即可切换，选择保存在浏览器本地（键名 `liubai-language`），下次打开自动沿用。界面语言只影响 UI 文案，不会改动海报上你输入的内容。

**Q：导出的字体文件为什么变小了？会不会缺字？**
导出时会用 HarfBuzz 按当前画面文字做字形子集化，只保留真正用到的字，所以 9 MB 级中文字体常被压到几 KB。它不会缺字：子集按全部可见文本（标题、图注、水印等）生成，只裁掉未用到的字形。若字体是 woff / woff2 容器，则跳过裁剪、原样使用。

**Q：导出到一半能取消吗？**
可以。导出期间导出面板会显示「取消导出」按钮与进度条；取消后当前任务立即停止，且不会生成任何不完整的文件。

**Q：如何导入 Reeden 模板？**
点击顶栏「导入」选择 `.html` / `.htm` 单文件模板即可；需要保留来源目录时，点导入按钮右侧的下拉箭头选「导入模板文件夹」。导入的模板会出现在「排版模板」面板，与内置模板一起管理。

**Q：导入模板提示「未找到 ReedenShareTemplate 渲染入口」或「不支持的模板版本」？**
模板必须是声明了 `window.ReedenShareTemplate` 渲染入口的单文件 HTML，且 `<meta name="reeden-template-version">` 的值为 `1`。请确认模板来源可信、未被裁剪或改坏；单文件上限 2 MB。

**Q：导入的模板会保存吗？换设备要重新导入吗？**
导入模板在当前浏览器会话内可用；如果把它选入作品并保存项目文件，模板的 HTML 与分组元数据会内嵌进项目 JSON，在新设备载入该项目即可自动恢复，无需手动重新导入。

**Q：「自动分组」的三种方式有什么区别？**
模板面板「自动分组」右侧箭头可切换分组依据：**内置名称**优先用模板自带的 `reeden-template-group`，其次模板类型，再回退名称前缀；**导入文件夹名称**用导入时所在文件夹名（仅文件夹导入有效）；**文件名**用去掉扩展名的 HTML 文件名。选择后立即对当前组重新分组。

## 贡献指南

欢迎提交 Issue 与 Pull Request。

1. Fork 本仓库并创建功能分支：`git checkout -b feat/your-feature`。
2. 遵循现有代码风格，保持 TypeScript 严格模式通过。
3. 提交前运行 `npm run build`，确保类型检查与构建均通过。
4. 提交清晰的 commit 信息（本项目采用 Conventional Commits 风格）。
5. 发起 Pull Request 并描述改动目的与影响范围。

## 许可证

当前仓库未包含 `LICENSE` 文件，且 `package.json` 标记为 `private`，默认保留所有权利。如需开源分发，建议补充 MIT 许可证并在本文件中引用。

## 联系方式

- 仓库：<https://github.com/xufn0v0/liubai-studio-plus>
- 问题与建议：请在仓库的 Issues 中提交。
