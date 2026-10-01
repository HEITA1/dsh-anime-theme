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
        'body::before{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;' +
        'background:url(' + BASE + '/asset/wallpaper?v=' + Date.now() + ') center/cover no-repeat;' +
        'opacity:' + (+w.opacity || 0) + ';' +
        (w.blur > 0 ? 'filter:blur(' + (+w.blur) + 'px);' : '') +
        '}' +
        '#app,#root,.dsh-root{position:relative;z-index:1}'
    } catch (err) {}
  }

  // ------------------------------------------------------------- 开屏动画 --
  var SPLASH_Z = 2147483000
  var ANIMS = {
    'fade-zoom': 'dshat-anim-fade-zoom 2.2s ease-out forwards',
    'slide-up': 'dshat-anim-slide-up 1.6s cubic-bezier(.2,.8,.2,1) forwards',
    'flicker': 'dshat-anim-flicker 1.8s steps(12) forwards',
    'none': 'none',
  }
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
      '#dshat-splash{position:fixed;inset:0;z-index:' + SPLASH_Z + ';' +
      'display:flex;align-items:center;justify-content:center;background:#0b0e1a;' +
      'cursor:pointer;transition:opacity .45s ease}' +
      '#dshat-splash img{max-width:min(72vw,720px);max-height:78vh;object-fit:contain;' +
      'border-radius:14px;box-shadow:0 24px 80px rgba(0,0,0,.55)}' +
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
      var img = el('img')
      img.alt = ''
      img.src = BASE + '/asset/splash?v=' + Date.now()
      img.style.animation = ANIMS[cfg.splash.anim] || ANIMS['fade-zoom']
      img.onerror = function () { overlay.remove() }   // 素材缺失 → 直接跳过（fail-open）
      overlay.appendChild(img)
      document.body.appendChild(overlay)
      var closed = false
      function close() {
        if (closed) return
        closed = true
        overlay.classList.add('dshat-out')
        setTimeout(function () { overlay.remove() }, 500)
        document.removeEventListener('keydown', onKey, true)
      }
      function onKey() { close() }
      overlay.addEventListener('click', close)
      document.addEventListener('keydown', onKey, true)
      setTimeout(close, ms)
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
  function applyIcon() {
    try {
      if (!cfg || !cfg.enabled || !cfg.icon || !cfg.icon.on || !cfg.icon.file) return
      var href = BASE + '/asset/icon?v=' + Date.now()
      // ① favicon
      var link = $('link[rel*="icon"]')
      if (!link) {
        link = el('link')
        link.rel = 'icon'
        document.head.appendChild(link)
      }
      link.href = href
      // ② 侧栏/顶栏品牌图标：按已知启发式选择器替换，自定义选择器优先
      var sel = cfg.icon.selector ||
        'aside img[alt*="logo" i], header img[alt*="logo" i], img[src*="logo" i], img[class*="logo" i]'
      var imgs = document.querySelectorAll(sel)
      for (var i = 0; i < imgs.length; i++) {
        imgs[i].src = href
      }
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
      'position:fixed;left:14px;bottom:14px;z-index:' + PANEL_Z + ';width:34px;height:34px;' +
      'border-radius:50%;border:1px solid rgba(120,140,200,.35);background:rgba(20,26,48,.72);' +
      'color:#dbe4ff;font-size:16px;line-height:1;cursor:pointer;backdrop-filter:blur(8px);' +
      'opacity:.35;transition:opacity .2s'
    fab.addEventListener('mouseenter', function () { fab.style.opacity = '1' })
    fab.addEventListener('mouseleave', function () { fab.style.opacity = '.35' })

    var panel = el('div')
    panel.id = 'dshat-panel'
    panel.style.cssText =
      'position:fixed;left:14px;bottom:56px;z-index:' + PANEL_Z + ';width:300px;display:none;' +
      'border-radius:14px;border:1px solid rgba(120,140,200,.35);background:rgba(16,20,40,.92);' +
      'color:#dbe4ff;font-size:12px;padding:12px;backdrop-filter:blur(12px);' +
      'box-shadow:0 12px 40px rgba(0,0,0,.45)'

    function section(title) {
      var s = el('div')
      s.style.cssText = 'margin-bottom:10px'
      var t = el('div', null, title)
      t.style.cssText = 'font-weight:600;margin-bottom:6px;color:#aebbe8'
      s.appendChild(t)
      return s
    }
    function row(label) {
      var r = el('label')
      r.style.cssText = 'display:flex;align-items:center;gap:6px;margin:4px 0'
      if (label) {
        var l = el('span', null, label)
        l.style.cssText = 'flex:0 0 64px;color:#9fb0d9'
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
      f.accept = 'image/jpeg,image/png,image/gif,image/webp'
      f.style.cssText = 'flex:1;min-width:0'
      f.addEventListener('change', function () {
        var file = f.files && f.files[0]
        if (!file) return
        if (file.size > 8 * 1024 * 1024) { alert('图片超过 8MB 上限'); return }
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
    var oVal = el('span', null, String(cfg.wallpaper.opacity)); oVal.style.cssText = 'width:30px;text-align:right'
    sO.addEventListener('input', function () { oVal.textContent = sO.value })
    rW3.appendChild(sO); rW3.appendChild(oVal); sW.appendChild(rW3)
    var rW4 = row('模糊'); var sB = slider(0, 40, 1, cfg.wallpaper.blur)
    var bVal = el('span', null, String(cfg.wallpaper.blur)); bVal.style.cssText = 'width:30px;text-align:right'
    sB.addEventListener('input', function () { bVal.textContent = sB.value })
    rW4.appendChild(sB); rW4.appendChild(bVal); sW.appendChild(rW4)
    panel.appendChild(sW)

    // 开屏区
    var sS = section('✨ 开屏动画')
    var rS1 = row('启用'); var cS = check(cfg.splash.on); rS1.appendChild(cS); sS.appendChild(rS1)
    var rS2 = row('图片'); rS2.appendChild(pick('splash')); sS.appendChild(rS2)
    var rS3 = row('动画'); var selA = el('select'); selA.style.cssText = 'flex:1'
    Object.keys(ANIMS).forEach(function (k) {
      var o = el('option', null, k); o.value = k; selA.appendChild(o)
    })
    selA.value = cfg.splash.anim
    rS3.appendChild(selA); sS.appendChild(rS3)
    var rS4 = row('时长ms'); var iM = el('input'); iM.type = 'number'; iM.min = 600; iM.max = 15000
    iM.value = cfg.splash.ms; iM.style.cssText = 'flex:1;width:60px'
    rS4.appendChild(iM); sS.appendChild(rS4)
    var rS5 = row(''); var cOnce = check(cfg.splash.oncePerSession)
    rS5.appendChild(cOnce)
    rS5.appendChild(el('span', null, '每次会话只播一次'))
    var btnRe = el('button', null, '重放'); btnRe.style.cssText = 'margin-left:auto;cursor:pointer'
    btnRe.addEventListener('click', function () { save().then(function () { window.__dshAT_replaySplash() }) })
    rS5.appendChild(btnRe); sS.appendChild(rS5)
    panel.appendChild(sS)

    // 图标区
    var sI = section('🧩 图标')
    var rI1 = row('启用'); var cI = check(cfg.icon.on); rI1.appendChild(cI); sI.appendChild(rI1)
    var rI2 = row('图片'); rI2.appendChild(pick('icon')); sI.appendChild(rI2)
    var rI3 = row('选择器'); var iSel = el('input'); iSel.type = 'text'
    iSel.value = cfg.icon.selector || ''; iSel.placeholder = 'CSS 选择器（高级，可留空）'
    iSel.style.cssText = 'flex:1;min-width:0;background:rgba(255,255,255,.06);border:1px solid rgba(120,140,200,.3);border-radius:6px;color:#dbe4ff;padding:2px 4px'
    rI3.appendChild(iSel); sI.appendChild(rI3)
    panel.appendChild(sI)

    // 总开关 + 保存
    var rAll = row('总开关'); var cAll = check(cfg.enabled); rAll.appendChild(cAll)
    var btnSave = el('button', null, '保存并应用')
    btnSave.style.cssText = 'margin-left:auto;cursor:pointer;background:#2f4488;color:#fff;border:none;border-radius:6px;padding:4px 10px'
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
