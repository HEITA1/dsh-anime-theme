// ============================================================================
// dsh-anime-theme —— 客户端半区（注入到 DSH Web 界面）
// ----------------------------------------------------------------------------
// 三件套：壁纸 / 开屏动画 / 应用内图标 + 一个设置面板。
// 设计原则：
//   - 一切素材来自 /dsh-anime-theme/asset/*（用户上传），未配置就跳过（fail-open）
//   - 任何一步出错都不影响 DSH 本体使用（全程 try/catch）
//   - 不写 localStorage 以外的任何存储，不发起主题服务以外的网络请求
// ============================================================================
;(function () {
  'use strict'
  if (window.__DSH_AT_READY) return
  window.__DSH_AT_READY = true

  var BASE = '/dsh-anime-theme'
  var cfg = null

  function $(sel, root) { return (root || document).querySelector(sel) }
  function el(tag, cls, text) {
    var e = document.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
  }

  function fetchJSON(url, opts) {
    return fetch(url, Object.assign({ cache: 'no-store' }, opts || {}))
      .then(function (r) { return r.json() })
  }

  // ------------------------------------------------------------------ 壁纸 --
  var styleEl = null
  function applyWallpaper() {
    try {
      if (!styleEl) {
        styleEl = document.createElement('style')
        styleEl.id = 'dshat-style'
        document.head.appendChild(styleEl)
      }
      if (!cfg || !cfg.enabled || !cfg.wallpaper || !cfg.wallpaper.on || !cfg.wallpaper.file) {
        styleEl.textContent = ''
        return
      }
      var w = cfg.wallpaper
      styleEl.textContent =
        // ① 分层透明化：主界面（base/layer-1/侧栏底色）透出壁纸；
        //    二级窗口（layer-2/3/4、菜单）用 color-mix 保持 95-97% 近实底，保证弹窗文字可读。
        //    !important 是必须的：应用的样式表在运行期注入、排在我们之后。
        'body,body[data-ds-dark-theme]{' +
        '--dsw-alias-bg-base:transparent !important;' +
        '--dsw-alias-bg-layer-1:transparent !important;' +
        '--dsw-specific-sidebar-fill:transparent !important;' +
        '--dsw-alias-bg-l1:transparent !important;' +
        '--dsw-alias-bg-layer-2:color-mix(in srgb, var(--dsw-static-neutral-bluish-00,#fff) 95%, transparent) !important;' +
        '--dsw-alias-bg-layer-3:color-mix(in srgb, var(--dsw-static-neutral-bluish-00,#fff) 96%, transparent) !important;' +
        '--dsw-alias-bg-layer-4:color-mix(in srgb, var(--dsw-static-neutral-bluish-00,#fff) 97%, transparent) !important;' +
        '--dsw-alias-bg-module-platform:color-mix(in srgb, var(--dsw-static-neutral-bluish-00,#fff) 95%, transparent) !important;' +
        '--dsw-specific-menu:color-mix(in srgb, var(--dsw-static-neutral-bluish-00,#fff) 96%, transparent) !important;' +
        '--dsw-alias-bg-l2:color-mix(in srgb, var(--dsw-static-neutral-bluish-00,#fff) 95%, transparent) !important}' +
        // 深色主题：用深色基色混合（覆盖上面的浅色混合）
        'body[data-ds-dark-theme]{' +
        '--dsw-alias-bg-layer-2:color-mix(in srgb, var(--dsw-static-neutral-bluish-950,#0b0e1a) 95%, transparent) !important;' +
        '--dsw-alias-bg-layer-3:color-mix(in srgb, var(--dsw-static-neutral-bluish-950,#0b0e1a) 96%, transparent) !important;' +
        '--dsw-alias-bg-layer-4:color-mix(in srgb, var(--dsw-static-neutral-bluish-950,#0b0e1a) 97%, transparent) !important;' +
        '--dsw-alias-bg-module-platform:color-mix(in srgb, var(--dsw-static-neutral-bluish-950,#0b0e1a) 95%, transparent) !important;' +
        '--dsw-specific-menu:color-mix(in srgb, var(--dsw-static-neutral-bluish-950,#0b0e1a) 96%, transparent) !important;' +
        '--dsw-alias-bg-l2:color-mix(in srgb, var(--dsw-static-neutral-bluish-950,#0b0e1a) 95%, transparent) !important}' +
        // ③ 根元素背景直接透明（body 白底可能来自非令牌的字面色）
        'html,body{background:transparent !important}' +
        // ② 壁纸层：固定铺底、不拦截交互
        'body::before{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;' +
        'background:url(' + BASE + '/asset/wallpaper?v=' + Date.now() + ') center/cover no-repeat;' +
        'opacity:' + (+w.opacity || 0) + ';' +
        (w.blur > 0 ? 'filter:blur(' + (+w.blur) + 'px);' : '') +
        '}'
    } catch (err) {}
  }

  // ------------------------------------------------------------- 开屏动画 --
  var SPLASH_Z = 2147483000
  // 每个预设：label 供面板下拉显示；css 里的 %T 会被替换为实际时长。
  // cinematic 不走单条 CSS animation，而是 playSplash 里的多层编排（见下）。
  var ANIMS = {
    cinematic: { label: '电影质感（渐显+光扫+暗角）', css: null },
    'fade-zoom': { label: '缩放渐显', css: 'dshat-anim-fade-zoom %T ease-out forwards' },
    'slide-up': { label: '上浮', css: 'dshat-anim-slide-up %T cubic-bezier(.2,.8,.2,1) forwards' },
    'flicker': { label: '闪烁', css: 'dshat-anim-flicker %T steps(12) forwards' },
    'none': { label: '无动画', css: 'none' },
  }
  // 电影质感的胶片颗粒：内联 SVG feTurbulence 噪声（零外部素材）
  var GRAIN_URI = 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27160%27 height=%27160%27%3E%3Cfilter id=%27n%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.85%27 numOctaves=%272%27 stitchTiles=%27stitch%27/%3E%3CfeColorMatrix type=%27saturate%27 values=%270%27/%3E%3C/filter%3E%3Crect width=%27160%27 height=%27160%27 filter=%27url(%23n)%27 opacity=%270.55%27/%3E%3C/svg%3E")'
  function injectAnimCss() {
    if ($('#dshat-anim-style')) return
    var s = document.createElement('style')
    s.id = 'dshat-anim-style'
    s.textContent =
      '@keyframes dshat-anim-fade-zoom{0%{opacity:0;transform:scale(.92)}' +
      '  35%{opacity:1;transform:scale(1)}70%{opacity:1;transform:scale(1.03)}' +
      '  100%{opacity:0;transform:scale(1.06)}}' +
      '@keyframes dshat-anim-slide-up{0%{opacity:0;transform:translateY(48px)}' +
      '  30%{opacity:1;transform:translateY(0)}75%{opacity:1}' +
      '  100%{opacity:0;transform:translateY(-24px)}}' +
      '@keyframes dshat-anim-flicker{0%{opacity:0}10%{opacity:1}18%{opacity:.2}' +
      '  26%{opacity:1}38%{opacity:.4}50%{opacity:1}80%{opacity:1}' +
      '  100%{opacity:0}}' +
      // —— 电影质感（cinematic）专用帧：由暗到明逐帧渐显 + 缓慢推近 + 收尾淡入黑 ——
      '@keyframes dshat-cine-img{0%{opacity:0;filter:brightness(.12) blur(18px) saturate(.5);transform:scale(1.16)}' +
      '  16%{opacity:1}55%{filter:brightness(1) blur(0) saturate(1.05);transform:scale(1.03)}' +
      '  80%{opacity:1;transform:scale(1.075)}' +
      '  100%{opacity:0;filter:brightness(.25) blur(3px);transform:scale(1.1)}}' +
      '@keyframes dshat-cine-shine{0%,30%{transform:translateX(-170%) skewX(-18deg);opacity:0}' +
      '  42%{opacity:.9}64%,100%{transform:translateX(170%) skewX(-18deg);opacity:0}}' +
      '@keyframes dshat-cine-bar-t{0%{transform:translateY(-101%)}14%,86%{transform:translateY(0)}100%{transform:translateY(-101%)}}' +
      '@keyframes dshat-cine-bar-b{0%{transform:translateY(101%)}14%,86%{transform:translateY(0)}100%{transform:translateY(101%)}}' +
      '@keyframes dshat-cine-grain{0%{transform:translate(0,0)}25%{transform:translate(-3%,2%)}' +
      '  50%{transform:translate(2%,-3%)}75%{transform:translate(-2%,-1%)}100%{transform:translate(1%,3%)}}' +
      '#dshat-splash{position:fixed;inset:0;z-index:' + SPLASH_Z + ';' +
      'display:flex;align-items:center;justify-content:center;background:#04060e;' +
      'cursor:pointer;transition:opacity .5s ease}' +
      '#dshat-splash img{max-width:min(72vw,760px);max-height:74vh;object-fit:contain;' +
      'border-radius:12px;box-shadow:0 30px 90px rgba(0,0,0,.6)}' +
      '#dshat-splash .dshat-cine-mark{position:relative}' +
      '#dshat-splash .dshat-cine-bar{position:absolute;left:0;right:0;height:7.5%;background:#000;z-index:3}' +
      '#dshat-splash .dshat-cine-shineWrap{position:absolute;inset:-8% -20%;overflow:hidden;z-index:2;pointer-events:none}' +
      '#dshat-splash .dshat-cine-shine{position:absolute;top:-30%;left:0;width:45%;height:160%;' +
      'background:linear-gradient(100deg,transparent 20%,rgba(255,255,255,.38) 50%,transparent 80%);' +
      'mix-blend-mode:screen;filter:blur(6px)}' +
      '#dshat-splash .dshat-cine-grain{position:absolute;inset:-10%;z-index:2;pointer-events:none;opacity:.08;' +
      'background-image:' + GRAIN_URI + ';background-size:160px 160px;mix-blend-mode:overlay}' +
      // —— 视频开屏（MP4/WebM 素材）：铺满 + 暗角 + 呼吸提示 ——
      '#dshat-splash video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1;background:#04060e}' +
      '#dshat-splash .dshat-v-vignette{position:absolute;inset:0;z-index:2;pointer-events:none;' +
      'background:radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.5) 100%)}' +
      '#dshat-splash .dshat-v-hint{position:absolute;left:0;right:0;bottom:7%;z-index:3;text-align:center;' +
      'color:rgba(255,255,255,.92);font-size:14px;letter-spacing:.35em;text-indent:.35em;' +
      'text-shadow:0 2px 12px rgba(0,0,0,.85);opacity:0;' +
      'animation:dshat-v-hint 2.6s ease-in-out 1.1s infinite}' +
      '@keyframes dshat-v-hint{0%{opacity:0}22%{opacity:.95}62%{opacity:.95}100%{opacity:0}}' +
      '#dshat-splash.dshat-out{opacity:0;pointer-events:none}'
    document.head.appendChild(s)
  }

  function playSplash() {
    try {
      if (!cfg || !cfg.enabled || !cfg.splash || !cfg.splash.on || !cfg.splash.file) return
      if (cfg.splash.oncePerSession) {
        try {
          if (sessionStorage.getItem('dshat-splash-shown')) return
          sessionStorage.setItem('dshat-splash-shown', '1')
        } catch (err) {}
      }
      injectAnimCss()
      var ms = Math.min(15000, Math.max(600, +cfg.splash.ms || 2200))
      var overlay = el('div')
      overlay.id = 'dshat-splash'
      var isVideo = /\.(mp4|webm)$/i.test(cfg.splash.file || '')
      var media = null
      if (isVideo) {
        // 视频开屏：素材本身会动（游戏 CG / MMD），叠游戏标题演出层。
        var v = document.createElement('video')
        v.src = BASE + '/asset/splash?v=' + Date.now()
        v.muted = true
        v.autoplay = true
        v.playsInline = true
        v.setAttribute('playsinline', '')
        media = v
        var vig = el('div'); vig.className = 'dshat-v-vignette'
        var hint = el('div'); hint.className = 'dshat-v-hint'; hint.textContent = '点击任意处进入'
        v.addEventListener('ended', function () { close() })
        v.addEventListener('error', function () { overlay.remove() })   // 素材缺失/无法解码 → 跳过（fail-open）
        overlay.appendChild(v)
        overlay.appendChild(vig)
        overlay.appendChild(hint)
      } else {
        media = el('img')
        media.alt = ''
        media.src = BASE + '/asset/splash?v=' + Date.now()
        media.onerror = function () { overlay.remove() }   // 素材缺失 → 直接跳过（fail-open）
      }
      var img = media.tagName === 'IMG' ? media : null
      var animKey = ANIMS[cfg.splash.anim] ? cfg.splash.anim : 'cinematic'
      if (!isVideo) {
        if (animKey === 'cinematic') {
        // 电影质感 = 多层编排：黑场 → 逐帧渐显（亮度/模糊/饱和一起爬升）+ 缓慢推近
        // → 中段斜向光扫 + 胶片颗粒 → 上下黑边夹住 → 收尾淡入黑，整体退场。
        var mark = el('div'); mark.className = 'dshat-cine-mark'
        img.style.animation = 'dshat-cine-img ' + ms + 'ms cubic-bezier(.3,.5,.25,1) forwards'
        mark.appendChild(img)
        var shineWrap = el('div'); shineWrap.className = 'dshat-cine-shineWrap'
        var shine = el('div'); shine.className = 'dshat-cine-shine'
        shine.style.animation = 'dshat-cine-shine ' + ms + 'ms ease-in-out forwards'
        shineWrap.appendChild(shine); mark.appendChild(shineWrap)
        var grain = el('div'); grain.className = 'dshat-cine-grain'
        grain.style.animation = 'dshat-cine-grain .5s steps(4) infinite'
        mark.appendChild(grain)
        overlay.appendChild(mark)
        var barT = el('div'); barT.className = 'dshat-cine-bar'; barT.style.top = '0'
        barT.style.animation = 'dshat-cine-bar-t ' + ms + 'ms cubic-bezier(.6,0,.3,1) forwards'
        var barB = el('div'); barB.className = 'dshat-cine-bar'; barB.style.bottom = '0'
        barB.style.animation = 'dshat-cine-bar-b ' + ms + 'ms cubic-bezier(.6,0,.3,1) forwards'
        overlay.appendChild(barT); overlay.appendChild(barB)
      } else {
        var a = ANIMS[animKey]
        img.style.animation = a.css ? a.css.replace('%T', ms + 'ms') : 'none'
        overlay.appendChild(img)
      }
      }
      document.body.appendChild(overlay)
      var closed = false
      function close() {
        if (closed) return
        closed = true
        try { var vv = overlay.querySelector('video'); if (vv) vv.pause() } catch (err) {}
        overlay.classList.add('dshat-out')
        setTimeout(function () { overlay.remove() }, 550)
        document.removeEventListener('keydown', onKey, true)
      }
      function onKey() { close() }
      overlay.addEventListener('click', close)
      document.addEventListener('keydown', onKey, true)
      // 图片模式按时长退场；视频模式由 ended 触发，这里只挂兜底
      setTimeout(close, isVideo ? 60000 : ms + 250)
    } catch (err) {}
  }

  window.__dshAT_replaySplash = function () {
    try {
      if (cfg && cfg.splash) {
        cfg.splash.oncePerSession = false
        playSplash()
        cfg.splash.oncePerSession = true
      }
    } catch (err) {}
  }

  // ----------------------------------------------------------- 应用内图标 --
  var iconStyleEl = null
  function applyIcon() {
    try {
      if (!iconStyleEl) {
        iconStyleEl = document.createElement('style')
        iconStyleEl.id = 'dshat-icon-style'
        document.head.appendChild(iconStyleEl)
      }
      if (!cfg || !cfg.enabled || !cfg.icon || !cfg.icon.on || !cfg.icon.file) {
        iconStyleEl.textContent = ''
        // 撤销 JS 侧替换过的 favicon
        var lk = $('link[rel*="icon"]')
        if (lk && lk.getAttribute('data-dshat')) { lk.remove() }
        return
      }
      var href = BASE + '/asset/icon?v=' + Date.now()
      // ① favicon
      var link = $('link[rel*="icon"]')
      if (!link) {
        link = el('link')
        link.rel = 'icon'
        link.setAttribute('data-dshat', '1')
        document.head.appendChild(link)
      }
      link.href = href
      // ② 品牌图标。三种形态：
      //    a. img[src*=logo] —— 直接换 src（React 管理的属性替换是安全的）
      //    b. 内联 SVG 品牌（本应用的形态）—— 纯 CSS：隐藏 svg + 伪元素显示图片，
      //       不增删 React 管辖的 DOM 节点，避免卸载冲突
      //    c. 自定义 selector（高级）—— 用户在设置面板填写的 CSS 选择器
      var iconCss = ''
      var sel = (cfg.icon.selector || '').trim()
      if (sel) {
        iconCss += sel + '{display:none !important}' +
          'body:has(' + sel + ') ' + sel.replace(/svg(?=[\s:\[]|$)/g, '') + '::before,' +
          sel + '::before{content:"";display:inline-block;width:26px;height:26px;' +
          'margin-right:8px;vertical-align:middle;background:url(' + href + ') center/contain no-repeat}'
      } else {
        iconCss +=
          'img[src*="logo" i]{content:url(' + href + ')}' +
          '[data-slot="sidebar.brand.mark"] svg{display:none}' +
          '[data-slot="sidebar.brand.mark"]{display:inline-block !important;' +
          'width:26px !important;height:26px !important;' +
          'background:url(' + href + ') center/contain no-repeat !important}'
      }
      iconStyleEl.textContent = iconCss
    } catch (err) {}
  }

  // ------------------------------------------------------------- 设置面板 --
  var PANEL_Z = 2147482000
  function buildPanel() {
    if ($('#dshat-fab')) return
    var fab = el('button')
    fab.id = 'dshat-fab'
    fab.textContent = '🎨'
    fab.title = '二次元主题设置'
    fab.style.cssText =
      'position:fixed;left:14px;bottom:52px;z-index:' + PANEL_Z + ';width:34px;height:34px;' +
      'border-radius:50%;border:1px solid rgba(37,99,235,.45);background:rgba(224,239,255,.88);' +
      'color:#1d4ed8;font-size:16px;line-height:1;cursor:pointer;backdrop-filter:blur(8px);' +
      'box-shadow:0 4px 14px rgba(37,99,235,.25);opacity:.65;transition:opacity .2s'
    fab.addEventListener('mouseenter', function () { fab.style.opacity = '1' })
    fab.addEventListener('mouseleave', function () { fab.style.opacity = '.65' })

    var panel = el('div')
    panel.id = 'dshat-panel'
    panel.style.cssText =
      'position:fixed;left:14px;bottom:94px;z-index:' + PANEL_Z + ';width:300px;display:none;' +
      'border-radius:14px;border:1px solid rgba(37,99,235,.35);background:rgba(235,244,255,.96);' +
      'color:#16385f;font-size:12px;padding:12px;backdrop-filter:blur(12px);' +
      'accent-color:#2563eb;' +
      'box-shadow:0 12px 40px rgba(37,99,235,.28)'

    function section(title) {
      var s = el('div')
      s.style.cssText = 'margin-bottom:10px'
      var t = el('div', null, title)
      t.style.cssText = 'font-weight:600;margin-bottom:6px;color:#1d4ed8'
      s.appendChild(t)
      return s
    }
    function row(label) {
      var r = el('label')
      r.style.cssText = 'display:flex;align-items:center;gap:6px;margin:4px 0'
      if (label) {
        var l = el('span', null, label)
        l.style.cssText = 'flex:0 0 64px;color:#3a5c8f'
        r.appendChild(l)
      }
      return r
    }
    function check(checked) {
      var c = el('input')
      c.type = 'checkbox'
      c.checked = !!checked
      return c
    }
    function slider(min, max, step, val) {
      var s = el('input')
      s.type = 'range'
      s.min = min; s.max = max; s.step = step; s.value = val
      s.style.cssText = 'flex:1'
      return s
    }
    function pick(kind) {  // 文件选择 + 上传
      var f = el('input')
      f.type = 'file'
      f.accept = kind === 'splash'
        ? 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm'
        : 'image/jpeg,image/png,image/gif,image/webp'
      f.style.cssText = 'flex:1;min-width:0'
      f.addEventListener('change', function () {
        var file = f.files && f.files[0]
        if (!file) return
        var isVideo = /\.(mp4|webm)$/i.test(file.name || '')
        var cap = isVideo ? 64 : 8
        if (file.size > cap * 1024 * 1024) { alert('文件超过 ' + cap + 'MB 上限'); return }
        file.arrayBuffer().then(function (buf) {
          return fetch(BASE + '/upload/' + kind, { method: 'POST', body: buf })
        }).then(function (r) { return r.json() }).then(function (j) {
          if (j.ok) { cfg = j.config || cfg; refreshAll(); listAssets() }
          else alert('上传失败：' + (j.error || '未知错误'))
        }).catch(function (e) { alert('上传失败：' + e) })
      })
      return f
    }

    // 壁纸区
    var sW = section('🖼 壁纸')
    var rW1 = row('启用'); var cW = check(cfg.wallpaper.on); rW1.appendChild(cW); sW.appendChild(rW1)
    var rW2 = row('图片'); rW2.appendChild(pick('wallpaper')); sW.appendChild(rW2)
    var rW3 = row('透明度'); var sO = slider(0, 1, 0.05, cfg.wallpaper.opacity)
    var oVal = el('span', null, String(cfg.wallpaper.opacity)); oVal.style.cssText = 'width:30px;text-align:right;color:#3a5c8f'
    sO.addEventListener('input', function () { oVal.textContent = sO.value })
    rW3.appendChild(sO); rW3.appendChild(oVal); sW.appendChild(rW3)
    var rW4 = row('模糊'); var sB = slider(0, 40, 1, cfg.wallpaper.blur)
    var bVal = el('span', null, String(cfg.wallpaper.blur)); bVal.style.cssText = 'width:30px;text-align:right;color:#3a5c8f'
    sB.addEventListener('input', function () { bVal.textContent = sB.value })
    rW4.appendChild(sB); rW4.appendChild(bVal); sW.appendChild(rW4)
    panel.appendChild(sW)

    // 开屏区
    var sS = section('✨ 开屏动画')
    var rS1 = row('启用'); var cS = check(cfg.splash.on); rS1.appendChild(cS); sS.appendChild(rS1)
    var rS2 = row('图片'); rS2.appendChild(pick('splash')); sS.appendChild(rS2)
    var rS3 = row('动画'); var selA = el('select'); selA.style.cssText = 'flex:1;background:#fff;border:1px solid rgba(37,99,235,.35);border-radius:6px;color:#16385f;padding:2px 4px'
    Object.keys(ANIMS).forEach(function (k) {
      var o = el('option', null, ANIMS[k].label); o.value = k; selA.appendChild(o)
    })
    selA.value = cfg.splash.anim
    rS3.appendChild(selA); sS.appendChild(rS3)
    var rS4 = row('时长ms'); var iM = el('input'); iM.type = 'number'; iM.min = 600; iM.max = 15000
    iM.value = cfg.splash.ms; iM.style.cssText = 'flex:1;width:60px;background:#fff;border:1px solid rgba(37,99,235,.35);border-radius:6px;color:#16385f;padding:2px 4px'
    rS4.appendChild(iM); sS.appendChild(rS4)
    var rS5 = row(''); var cOnce = check(cfg.splash.oncePerSession)
    rS5.appendChild(cOnce)
    rS5.appendChild(el('span', null, '每次会话只播一次'))
    var btnRe = el('button', null, '重放'); btnRe.style.cssText = 'margin-left:auto;cursor:pointer;background:#e0edff;color:#1d4ed8;border:1px solid rgba(37,99,235,.35);border-radius:6px;padding:3px 10px'
    btnRe.addEventListener('mouseenter', function () { btnRe.style.background = '#cfe2ff' })
    btnRe.addEventListener('mouseleave', function () { btnRe.style.background = '#e0edff' })
    btnRe.addEventListener('click', function () { save().then(function () { window.__dshAT_replaySplash() }) })
    rS5.appendChild(btnRe); sS.appendChild(rS5)
    panel.appendChild(sS)

    // 图标区
    var sI = section('🧩 图标')
    var rI1 = row('启用'); var cI = check(cfg.icon.on); rI1.appendChild(cI); sI.appendChild(rI1)
    var rI2 = row('图片'); rI2.appendChild(pick('icon')); sI.appendChild(rI2)
    var rI3 = row('选择器'); var iSel = el('input'); iSel.type = 'text'
    iSel.value = cfg.icon.selector || ''; iSel.placeholder = 'CSS 选择器（高级，可留空）'
    iSel.style.cssText = 'flex:1;min-width:0;background:#fff;border:1px solid rgba(37,99,235,.35);border-radius:6px;color:#16385f;padding:2px 4px'
    rI3.appendChild(iSel); sI.appendChild(rI3)
    panel.appendChild(sI)

    // 总开关 + 保存
    var rAll = row('总开关'); var cAll = check(cfg.enabled); rAll.appendChild(cAll)
    var btnSave = el('button', null, '保存并应用')
    btnSave.style.cssText = 'margin-left:auto;cursor:pointer;background:#2563eb;color:#fff;border:none;border-radius:6px;padding:4px 12px;font-weight:600'
    btnSave.addEventListener('mouseenter', function () { btnSave.style.background = '#1d4ed8' })
    btnSave.addEventListener('mouseleave', function () { btnSave.style.background = '#2563eb' })
    rAll.appendChild(btnSave)
    panel.appendChild(rAll)

    function collect() {
      cfg.enabled = cAll.checked
      cfg.wallpaper.on = cW.checked
      cfg.wallpaper.opacity = +sO.value
      cfg.wallpaper.blur = +sB.value
      cfg.splash.on = cS.checked
      cfg.splash.anim = selA.value
      cfg.splash.ms = Math.min(15000, Math.max(600, +iM.value || 2200))
      cfg.splash.oncePerSession = cOnce.checked
      cfg.icon.on = cI.checked
      cfg.icon.selector = iSel.value.trim()
    }
    function save() {
      collect()
      return fetchJSON(BASE + '/config.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      }).then(function (j) {
        if (j.ok) { cfg = j.config; refreshAll() }
        return j
      })
    }
    btnSave.addEventListener('click', function () {
      save().then(function () { panel.style.display = 'none' })
    })
    ;[cW, cS, cI, cAll].forEach(function (c) {
      c.addEventListener('change', function () { save() })
    })
    ;[sO, sB].forEach(function (s) {
      s.addEventListener('change', function () { save() })
    })

    fab.addEventListener('click', function () {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none'
    })

    document.body.appendChild(fab)
    document.body.appendChild(panel)
  }

  function listAssets() {
    try {
      fetchJSON(BASE + '/assets.json').then(function (j) {
        if (!j.ok) return
        var fab = $('#dshat-fab')
        if (fab) fab.title = '二次元主题设置（素材 ' + j.files.length + ' 个）'
      }).catch(function () {})
    } catch (err) {}
  }

  function refreshAll() {
    applyWallpaper()
    applyIcon()
  }

  function boot() {
    fetchJSON(BASE + '/config.json').then(function (j) {
      cfg = j
      applyWallpaper()
      applyIcon()
      playSplash()
      buildPanel()
      listAssets()
    }).catch(function () { /* 主题服务不可用 → 静默跳过 */ })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }
})()
