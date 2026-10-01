# dsh-anime-theme 🐋🎨

DeepSeek Harness（DSH）二次元人物主题插件：**壁纸 / 开屏动画 / 应用内图标**三件套。

> **插件本体零图片素材** —— 所有图片由用户在界面内自由上传与更换，随装随换、即时生效，
> 不把任何角色的版权图片打包进仓库。

## 功能

| 模块 | 说明 |
|---|---|
| 🖼 壁纸 | 全局背景层（`body::before`，不遮挡交互），透明度 0–100% 与高斯模糊 0–40px 可调 |
| ✨ 开屏动画 | 支持**视频素材**（MP4/WebM，≤64MB，铺满全屏播放）与图片素材；图片模式默认**电影质感**编排（由暗逐帧渐显 + 缓慢推近 + 光扫 + 胶片颗粒 + 上下黑边 + 淡入黑收尾）；视频模式叠暗角与"点击任意处进入"呼吸提示，播完自动退场；另有缩放渐显 / 上浮 / 闪烁 / 无动画预设，时长 0.6–15s，点击或任意按键跳过，可设为"每会话一次"并可随时重放 |
| 🧩 图标 | 应用内 favicon 替换 + 侧栏/顶栏品牌图标替换（内置启发式选择器，支持自定义 CSS 选择器） |
| ⚙ 设置面板 | 界面左下角 🎨 悬浮按钮：上传素材、调参数、保存即生效，无需重启 |

## 安装

### 方式 A：Web 端（`dsh web`）

```bash
# 从 npm（发布后）
dsh plugin --profile web add dsh-anime-theme

# 或直接从 GitHub 仓库
dsh plugin --profile web add github:your-github-username/dsh-anime-theme
```

安装后重启 `dsh web`，浏览器 Ctrl+F5。

### 方式 B：官方桌面客户端（Electron）

**桌面端读的是 `desktop` profile，且该 profile 由 Electron 应用独占管理**
（`dsh plugin --profile desktop` 会被 CLI 拒绝，`--profile web` 装了桌面端也读不到）。

推荐：在桌面客户端的会话里直接说一句「把 dsh-anime-theme 装上」，
由内置 `plugin_manager`（作用域即当前 desktop profile）完成安装。

等价的手工路径（在 desktop profile 目录内用**客户端自带的 pnpm** 安装本地包，
并写入 profile 的 `dsh.profile.bundles`）：

```powershell
# 1) 把本仓库放到一个固定目录，例如 D:\dsh-anime-theme
# 2) 编辑 %USERPROFILE%\.dsh\profiles\desktop\package.json：
#    - "dependencies" 里加  "dsh-anime-theme": "link:D:/dsh-anime-theme"
#    - "dsh.profile.bundles" 数组里加 "dsh-anime-theme"
# 3) 在 profile 目录内执行（ELECTRON_RUN_AS_NODE 用客户端运行时跑 pnpm）：
#    set ELECTRON_RUN_AS_NODE=1
#    "<DSH安装目录>\DeepSeek Harness.exe" --expose-internals ^
#      "<DSH安装目录>\resources\runtime\pnpm\bin\pnpm.cjs" install
# 4) 重启桌面客户端
```

装完没看到 🎨 按钮？先完全退出并重开一次客户端（桌面端注入表在启动时一次性收集）。

## 使用

1. 打开 DSH 界面，左下角点 🎨 打开设置面板
2. 分别为 壁纸 / 开屏 / 图标 上传图片（jpg / png / gif / webp，单张 ≤ 8MB）
3. 调整透明度、模糊、动画与时长，点「保存并应用」即时生效
4. 点「重放」可随时预览开屏动画

## 数据与安全

- 主题配置与素材保存在 `%USERPROFILE%\.dsh\anime-theme\`（`config.json` + 图片文件），此外**不写任何路径**
- 插件**不发起任何网络请求**；图片直接从本机 served 到本机界面
- 写接口（上传 / 改配置）仅接受回环地址访问，并委托宿主信任栅栏，fail-closed
- 上传按**魔数嗅探**校验格式（图片 jpg/png/gif/webp + 视频 mp4/webm），**拒绝 SVG**（可携带脚本）；图片 ≤8MB、视频 ≤64MB；文件名固定为 `<类别>.<扩展名>`，无路径穿越面
- 插件不接触 API key / 凭据，配置文件中无任何敏感信息

## 已知限制

- 桌面客户端**任务栏/窗口图标**由 Electron 可执行文件内嵌，bundle 插件无法更换（本插件只覆盖应用内 favicon 与界面品牌图标）
- 素材版权由使用者自行负责，请使用你有权使用的图片

## 卸载

- Web：`dsh plugin --profile web remove dsh-anime-theme`
- 桌面端：在客户端会话里让 DSH 卸载，或从 desktop profile 的 `package.json`（dependencies 与 `dsh.profile.bundles`）中移除后重启
- 残留数据：`%USERPROFILE%\.dsh\anime-theme\`（配置与素材），不需要可手动删除

## License

代码 MIT，见 [LICENSE](LICENSE)。本仓库**不含任何图片素材**，素材政策见 [PROVENANCE.md](PROVENANCE.md)。

## 开屏视频素材小贴士

视频模式直接用浏览器解码播放：**推荐 H.264 编码的 MP4**（HEVC/H.265 在部分 Chromium/Electron 环境无法软解）；本仓库示例素材为 2560×1440（Real-ESRGAN AI 超分）。若素材是 HEVC 或带水印/黑边，可先用 ffmpeg 处理后再上传，例如：

```bash
# 裁掉左右黑边（各128px）+ 去除右上/左下/底部三处水印（delogo 区域按实际水印位置调整）+ 转 H.264
ffmpeg -i in.mp4 -vf "crop=1024:576:128:0, delogo=x=772:y=10:w=246:h=56, delogo=x=2:y=540:w=95:h=34, delogo=x=450:y=515:w=135:h=38" -c:v libx264 -crf 20 -preset veryfast -pix_fmt yuv420p -an -movflags +faststart splash_clean.mp4
```
