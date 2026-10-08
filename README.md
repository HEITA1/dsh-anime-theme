# dsh-anime-theme 🐋🎨

**DeepSeek Harness（DSH）二次元主题插件：开屏动画 + 壁纸 + 应用内图标，三件套。**

> 插件本体**零图片素材、零依赖**——所有视觉内容由你在界面里自由上传与更换，
> 不把任何角色的版权图片打包进仓库，装完即换、即时生效。

## ✨ 功能

### ✨ 开屏动画（本插件的核心特色）

打开 DSH 时的全屏开场演出，支持两种素材形态：

- **视频开屏（MP4 / WebM）**：上传一段会动的素材（游戏 CG、MMD、动态立绘），
  铺满全屏播放 + 边缘暗角 + 「点击任意处进入」呼吸提示，播完自动淡出，
  随时点击 / 按键跳过 —— 游戏开机画面般的体验
- **图片开屏（jpg / png / gif / webp）**：内置「电影质感」编排 ——
  由暗逐帧渐显 → 缓慢推近 → 斜向光扫 → 胶片颗粒 → 上下黑边 → 淡入黑收尾
- 另有 缩放渐显 / 上浮 / 闪烁 / 无动画 预设；时长 0.6–15s 可调；
  「每会话一次」开关 + 随时重放按钮

### 🖼 壁纸

- **图片壁纸**：上传后铺满全屏，透明度 0–100% 与高斯模糊 0–40px 可调
- **渐变壁纸**：不上传图片时可用纯 CSS 渐变铺底 —— 6 组预设色卡一键切换，
  或自定义双色 + 角度（0–360°）
- **分层可读性**：主界面透出壁纸的同时，设置等二级窗口自动保持近实底，
  深色主题单独适配 —— 不会出现「弹窗文字看不清」的问题

### 🧩 应用内图标

- 替换界面左上角的品牌标志与 favicon（纯 CSS 方案，不碰应用 DOM 结构）
- 支持自定义 CSS 选择器（高级）

### 📦 主题包分享

- **导出**：一键把当前配置 + 全部在用素材打包成单个 `.json` 文件
- **导入**：选择别人分享的主题包文件，配置与素材一键还原
- 主题包内不含任何凭据或本机路径，可放心分享

### ⚙ 设置面板

界面左下角 🎨 悬浮按钮（浅蓝主题）：上传素材、调参数、保存即生效，无需重启；
每次打开面板自动刷新应用效果。

## 📥 安装

### 方式 A：Web 端（`dsh web`）

```bash
# 从本地目录安装
dsh plugin --profile web add link:<本仓库目录绝对路径>

# 或发布后从 npm / GitHub 安装
dsh plugin --profile web add dsh-anime-theme
dsh plugin --profile web add github:USER/dsh-anime-theme
```

安装后重启 `dsh web`，浏览器 Ctrl+F5。

### 方式 B：官方桌面客户端（Electron）

**注意：桌面端读的是 `desktop` profile，且该 profile 由 Electron 应用独占管理**
（`dsh plugin --profile desktop` 会被 CLI 拒绝，`--profile web` 装了桌面端也读不到）。

推荐：在桌面客户端的会话里直接说一句「把 dsh-anime-theme 装上」，
由内置 `plugin_manager`（作用域即当前 desktop profile）完成安装。

等价的手工路径（在 desktop profile 目录内用**客户端自带的 pnpm** 安装本地包，
并写入 profile 的 bundle 列表）：

```powershell
# 1) 把本仓库放到一个固定目录，例如 D:\dsh-anime-theme
# 2) 编辑 %USERPROFILE%\.dsh\profiles\desktop\package.json：
#    - "dependencies" 里加  "dsh-anime-theme": "link:D:/dsh-anime-theme"
#    - "dsh.profile.bundles" 数组里加 "dsh-anime-theme"
# 3) 在 profile 目录内执行（用客户端运行时以 Node 模式跑自带 pnpm）：
#    set ELECTRON_RUN_AS_NODE=1
#    "<DSH安装目录>\DeepSeek Harness.exe" --expose-internals ^
#      "<DSH安装目录>\resources\runtime\pnpm\bin\pnpm.cjs" install
# 4) 完全退出并重开桌面客户端
```

装完没看到左下角 🎨 按钮？先完全退出并重开一次客户端
（桌面端的脚本注入表在启动时一次性收集）。

## 🚀 使用

1. 打开 DSH，点左下角 🎨 打开设置面板
2. 开屏：上传图片或短视频（≤64MB）；壁纸：上传图片或开渐变；图标：上传小图
3. 调整参数，点「保存并应用」即时生效
4. 「重放」可随时预览开屏；满意后点「导出主题包」分享给朋友

## 🔒 数据与安全

- **数据不出本机**：插件不发起任何网络请求 —— 界面 fetch 的全部是本机
  `dsh-app://` 相对路由；图片直接从本机 served 到本机界面
- **写盘最小化**：主题配置与素材只保存在 `%USERPROFILE%\.dsh\anime-theme\`
  （`config.json` + 素材文件），此外不写任何路径；卸载后删除该目录即完全清除
- **上传校验**：魔数嗅探格式（图片 jpg/png/gif/webp + 视频 mp4/webm），
  拒绝可携带脚本的 SVG；图片 ≤8MB、视频 ≤64MB；文件名固定白名单，无路径穿越面
- **写请求门禁**：写接口（上传/改配置/导入主题包）委托宿主信任栅栏 +
  回环校验，fail-closed
- **主题包导入全链校验**：格式标识 → MIME 与扩展名一致 → 魔数嗅探防伪造 →
  单素材 ≤64MB / 整包 ≤96MB
- **不接触凭据**：插件不读取、不存储任何 API key / 令牌；配置文件无敏感信息

## 🎬 开屏视频素材小贴士

视频模式由浏览器解码：**推荐 H.264 编码的 MP4**（HEVC/H.265 在部分
Chromium/Electron 环境无法软解）。素材带水印或黑边可先用 ffmpeg 预处理：

```bash
# 裁掉左右黑边（各128px）+ 去除三处水印（delogo 区域按实际水印位置调整）+ 转 H.264
ffmpeg -i in.mp4 -vf "crop=1024:576:128:0, delogo=x=772:y=10:w=246:h=56, delogo=x=2:y=540:w=95:h=34, delogo=x=450:y=515:w=135:h=38" -c:v libx264 -crf 20 -preset veryfast -pix_fmt yuv420p -an -movflags +faststart splash_clean.mp4
```

追求更高清晰度可对帧序列跑 Real-ESRGAN 一类 AI 超分后再合成
（作者实测 576p 素材 → 2K 效果显著）。

## ⚠️ 已知限制

- 桌面客户端**任务栏/窗口图标**由 Electron 可执行文件内嵌，bundle 插件无法更换
  （本插件覆盖的是应用内品牌标志与 favicon）
- DSH 仍处于 developer preview，后续版本可能变动注入机制
- 上传素材的版权由使用者自行确认与承担，请使用你有权使用的图片

## 🗑 卸载

- Web：`dsh plugin --profile web remove dsh-anime-theme`
- 桌面端：在客户端会话里让 DSH 卸载，或从 desktop profile 的
  `package.json`（dependencies 与 `dsh.profile.bundles`）中移除后重启
- 残留数据：`%USERPROFILE%\.dsh\anime-theme\`（配置与素材），
  不需要可手动删除

## License

代码 MIT，见 [LICENSE](LICENSE)。本仓库**不含任何图片/视频素材**，
素材政策见 [PROVENANCE.md](PROVENANCE.md)。
