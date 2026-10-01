// ============================================================================
// dsh-anime-theme —— DSH 二次元人物主题（宿主插件 / Host 半区）
// ----------------------------------------------------------------------------
// 职责：
//   1. 注入客户端脚本（桌面端走 webserver/index-inject 内联行，Web 端走 tapIndex）
//   2. 提供 /dsh-anime-theme/* 路由：客户端脚本、主题配置读写、素材上传与访问
//   3. 主题配置与用户素材落盘到 $DSH_HOME/anime-theme/（除此之外不写任何路径）
//
// 安全约定：
//   - 不发起任何网络请求（只读本机文件、只服务本机路由）
//   - 写请求（PUT/POST）仅接受回环 Host，且委托宿主信任栅栏（存在时），fail-closed
//   - 上传素材按魔数嗅探，只接受 jpg/png/gif/webp（拒绝 SVG —— 可携带脚本）
//   - 读取文件一律先解析出真实路径并强制落在 THEME_DIR 内
// 挂载模式与 dsh-whale-widget 相同（桌面端注入行必须早注册，见 DESKTOP_ROW_TEXT）。
// ============================================================================

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN_NAME = 'dsh-anime-theme'
const PLUGIN_VERSION = '0.1.0'

// 包根目录：lib/index.js → 包根。link 安装或 node_modules 安装均可迁移。
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// DSH 主目录：主题配置与用户素材存放处（node_modules 可能只读或随更新被清理）
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const THEME_DIR = path.join(DSH_HOME, 'anime-theme')
const CONFIG_FILE = path.join(THEME_DIR, 'config.json')

const MAX_UPLOAD = 8 * 1024 * 1024   // 单张素材上限 8MB
const MAX_CONFIG = 64 * 1024         // 配置文件上限 64KB

const EXT_MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
}

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

// ---------------------------------------------------------------------------
// 默认配置：file 为空表示该功能未配置素材，客户端跳过（插件本体零图片）。
// ---------------------------------------------------------------------------
function defaultConfig() {
  return {
    version: 1,
    enabled: true,
    wallpaper: { on: true, file: '', opacity: 0.25, blur: 0 },
    splash: { on: true, file: '', anim: 'fade-zoom', ms: 2200, oncePerSession: true },
    icon: { on: true, file: '', selector: '' },
  }
}

function ensureThemeDir() {
  try { fs.mkdirSync(THEME_DIR, { recursive: true }) } catch (err) {}
}

function readConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    return sanitizeConfig(parsed)
  } catch (err) {
    return defaultConfig()
  }
}

// 写盘前清洗：只保留已知键、数字夹取范围、file 必须是 THEME_DIR 下已存在的
// 图片文件名（或空串）。任何越界内容直接丢弃，不抛错。
function sanitizeConfig(input) {
  const out = defaultConfig()
  if (!input || typeof input !== 'object') return out
  if (typeof input.enabled === 'boolean') out.enabled = input.enabled
  const num = (v, lo, hi, dflt) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return dflt
    return Math.min(hi, Math.max(lo, Math.round(n * 100) / 100))
  }
  const validFile = (v) => {
    if (typeof v !== 'string' || v === '') return ''
    const base = path.basename(v)                     // 只取文件名，杜绝路径穿越
    const ext = path.extname(base).slice(1).toLowerCase()
    if (!EXT_MIME[ext]) return ''
    try {
      const real = fs.realpathSync(path.join(THEME_DIR, base))
      if (path.dirname(real) !== fs.realpathSync(THEME_DIR)) return ''
      return base
    } catch (err) { return '' }
  }
  for (const kind of ['wallpaper', 'splash', 'icon']) {
    const src = input[kind]
    if (!src || typeof src !== 'object') continue
    const dst = out[kind]
    if (typeof src.on === 'boolean') dst.on = src.on
    if ('file' in src) dst.file = validFile(src.file)
    if (kind === 'wallpaper') {
      dst.opacity = num(src.opacity, 0, 1, 0.25)
      dst.blur = num(src.blur, 0, 40, 0)
    }
    if (kind === 'splash') {
      if (['fade-zoom', 'slide-up', 'flicker', 'none'].includes(src.anim)) dst.anim = src.anim
      dst.ms = num(src.ms, 600, 15000, 2200)
      if (typeof src.oncePerSession === 'boolean') dst.oncePerSession = src.oncePerSession
    }
    if (kind === 'icon' && typeof src.selector === 'string') {
      dst.selector = src.selector.slice(0, 300).replace(/[<>]/g, '')
    }
  }
  return out
}

function writeConfig(cfg) {
  ensureThemeDir()
  const tmp = CONFIG_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), 'utf8')
  fs.renameSync(tmp, CONFIG_FILE)
}

// 魔数嗅探：只认 jpg/png/gif/webp。SVG 一律拒绝（image/svg+xml 直接打开可执行脚本）。
function sniffImageExt(buf) {
  if (!buf || buf.length < 12) return null
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg'
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png'
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif'
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'webp'
  return null
}

function readRequestBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        try { req.destroy() } catch (err) {}
        reject(new Error('body too large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

// ---------------------------------------------------------------------------
// 信任栅栏：宿主 connection.requestRejection 存在时委托之（DNS 重绑定 / 未认证）；
// 无论如何，写请求（PUT/POST）额外要求回环 Host（自校验，fail-closed）。
// ---------------------------------------------------------------------------
function hostAuthority(req) {
  try { return String(req.headers.host || '') } catch (err) { return '' }
}

function isLoopbackHost(req) {
  const raw = hostAuthority(req).toLowerCase()
  if (!raw) return false
  const host = raw.startsWith('[')
    ? raw.slice(1, raw.indexOf(']') === -1 ? undefined : raw.indexOf(']'))
    : raw.split(':')[0]
  return host === '127.0.0.1' || host === 'localhost' || host === '::1'
}

function makeRequestGate(connectionSvc) {
  const fence = connectionSvc && typeof connectionSvc.requestRejection === 'function'
    ? (req) => {
        try { return connectionSvc.requestRejection(req) } catch (err) { return 403 } // fail-closed
      }
    : null
  return function rejected(req, res) {
    const deny = (code) => {
      try { res.statusCode = code || 403; res.end() } catch (err) {}
      return true
    }
    if (fence) {
      const code = fence(req)
      if (code !== undefined && code !== null && code !== false) return deny(typeof code === 'number' ? code : 403)
    }
    const method = String(req.method || 'GET').toUpperCase()
    if (method === 'PUT' || method === 'POST' || method === 'DELETE') {
      if (!isLoopbackHost(req)) return deny(403)  // 非本机的写请求一律拒绝
    }
    return false
  }
}

// ---------------------------------------------------------------------------
// 桌面端注入行：内联 script 动态加载客户端脚本（软失败，不阻断 boot）。
// 桌面壳的注入表在宿主启动时一次性收集 ⇒ 本行必须在 apply() 里**最先**注册。
// ---------------------------------------------------------------------------
const DESKTOP_ROW_TEXT =
  '(function(){try{if(window.__DSH_AT_BOOT)return;window.__DSH_AT_BOOT=1;' +
  'var d=document.body||document.head||document.documentElement;if(!d)return;' +
  'var s=document.createElement("script");s.src="/dsh-anime-theme/theme.js?v=' + PLUGIN_VERSION + '";' +
  's.onerror=function(){};d.appendChild(s)}catch(e){}})()'

export default {
  name: PLUGIN_NAME,

  apply(root) {
    const rowDisposers = []
    root.effect(() => () => {
      for (const d of rowDisposers) { try { d() } catch (err) {} }
    })

    // ① 桌面端唯一生效通道：结构化注入行（不依赖任何服务，立刻注册）
    rowDisposers.push(root.on('webserver/index-inject', (table) => {
      try {
        if (!Array.isArray(table)) return
        for (const row of table) {
          if (!row) continue
          if (row.kind === 'script-src' && typeof row.src === 'string'
            && row.src.indexOf('/dsh-anime-theme/theme.js') !== -1) return
          if (row.kind === 'script' && typeof row.text === 'string'
            && row.text.indexOf('/dsh-anime-theme/theme.js') !== -1) return
        }
        table.push({ kind: 'script', placement: 'body', text: DESKTOP_ROW_TEXT })
      } catch (err) {}
    }))

    // ② 其余逻辑：等 webServer / connection 就绪（两者在本桌面版本均已验证存在）
    root.inject(['webServer', 'connection'], (ctx) => {
      const disposers = []
      ctx.effect(() => () => {
        for (const d of disposers) { try { d() } catch (err) {} }
      })

      ensureThemeDir()
      const rejected = makeRequestGate(ctx.connection)

      // 统一注册入口：所有路由自动套上信任栅栏 + 写请求回环校验
      function registerRoute(route) {
        const inner = route && route.handler
        const wrapped = Object.assign({}, route, {
          handler: async (req, res) => {
            if (rejected(req, res)) return
            return inner(req, res)
          },
        })
        disposers.push(ctx.webServer.register(wrapped))
      }

      let clientScriptBytes = null

      // ---- GET /dsh-anime-theme/health.json --------------------------------
      registerRoute({
        path: '/dsh-anime-theme/health.json',
        handler: async (req, res) => {
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify({ ok: true, name: PLUGIN_NAME, version: PLUGIN_VERSION }))
        },
      })

      // ---- GET /dsh-anime-theme/theme.js -----------------------------------
      registerRoute({
        path: '/dsh-anime-theme/theme.js',
        handler: async (req, res) => {
          try {
            if (!clientScriptBytes) {
              clientScriptBytes = fs.readFileSync(path.join(PACKAGE_ROOT, 'assets', 'theme.js'))
            }
            res.writeHead(200, {
              'Content-Type': 'application/javascript; charset=utf-8',
              'Cache-Control': 'no-store',
              'X-Content-Type-Options': 'nosniff',
            })
            res.end(clientScriptBytes)
          } catch (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('theme.js not found')
          }
        },
      })

      // ---- GET /dsh-anime-theme/config.json --------------------------------
      registerRoute({
        path: '/dsh-anime-theme/config.json',
        handler: async (req, res) => {
          if (String(req.method || 'GET').toUpperCase() === 'PUT') {
            try {
              const body = await readRequestBody(req, MAX_CONFIG)
              const next = sanitizeConfig(JSON.parse(body.toString('utf8') || '{}'))
              writeConfig(next)
              res.writeHead(200, JSON_HEADERS)
              res.end(JSON.stringify({ ok: true, config: next }))
            } catch (err) {
              res.writeHead(200, JSON_HEADERS)
              res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err).slice(0, 200) }))
            }
            return
          }
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify(readConfig()))
        },
      })

      // ---- GET /dsh-anime-theme/assets.json --------------------------------
      // 列出 THEME_DIR 下的图片文件（按扩展名过滤），供设置面板的素材选择器使用
      registerRoute({
        path: '/dsh-anime-theme/assets.json',
        handler: async (req, res) => {
          const files = []
          try {
            for (const name of fs.readdirSync(THEME_DIR)) {
              const ext = path.extname(name).slice(1).toLowerCase()
              if (!EXT_MIME[ext]) continue
              let size = 0
              try { size = fs.statSync(path.join(THEME_DIR, name)).size } catch (err) {}
              files.push({ name, size })
            }
          } catch (err) {}
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify({ ok: true, dir: 'anime-theme', files }))
        },
      })

      // ---- POST /dsh-anime-theme/upload/<kind> -----------------------------
      // kind ∈ {wallpaper, splash, icon}。写盘固定名 <kind>.<嗅探扩展名>，
      // 并同步把 config[kind].file 指过去 —— 客户端上传即生效。
      registerRoute({
        path: '/dsh-anime-theme/upload/wallpaper',
        handler: makeUploadHandler('wallpaper'),
      })
      registerRoute({
        path: '/dsh-anime-theme/upload/splash',
        handler: makeUploadHandler('splash'),
      })
      registerRoute({
        path: '/dsh-anime-theme/upload/icon',
        handler: makeUploadHandler('icon'),
      })

      function makeUploadHandler(kind) {
        return async (req, res) => {
          try {
            if (String(req.method || '').toUpperCase() !== 'POST') {
              res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
              res.end('method not allowed')
              return
            }
            const buf = await readRequestBody(req, MAX_UPLOAD)
            const ext = sniffImageExt(buf)
            if (!ext) {
              res.writeHead(200, JSON_HEADERS)
              res.end(JSON.stringify({ ok: false, error: 'unsupported image (only jpg/png/gif/webp)' }))
              return
            }
            ensureThemeDir()
            // 清掉同名旧素材的其它扩展名，保持每类素材只有一个生效文件
            for (const e of Object.keys(EXT_MIME)) {
              try { fs.unlinkSync(path.join(THEME_DIR, kind + '.' + e)) } catch (err) {}
            }
            const name = kind + '.' + ext
            fs.writeFileSync(path.join(THEME_DIR, name), buf)
            const cfg = readConfig()
            cfg[kind].file = name
            writeConfig(cfg)
            res.writeHead(200, JSON_HEADERS)
            res.end(JSON.stringify({ ok: true, kind, file: name, size: buf.length }))
          } catch (err) {
            res.writeHead(200, JSON_HEADERS)
            res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err).slice(0, 200) }))
          }
        }
      }

      // ---- GET /dsh-anime-theme/asset/<kind> -------------------------------
      // 服务当前配置指向的素材文件。kind 固定白名单，文件名来自 config
      // （sanitizeConfig 已保证只可能是 THEME_DIR 下真实存在的图片文件名）。
      registerRoute({
        path: '/dsh-anime-theme/asset/wallpaper',
        handler: makeAssetHandler('wallpaper'),
      })
      registerRoute({
        path: '/dsh-anime-theme/asset/splash',
        handler: makeAssetHandler('splash'),
      })
      registerRoute({
        path: '/dsh-anime-theme/asset/icon',
        handler: makeAssetHandler('icon'),
      })

      function makeAssetHandler(kind) {
        return async (req, res) => {
          try {
            const cfg = readConfig()
            const file = cfg[kind] && cfg[kind].file
            const ext = file ? path.extname(file).slice(1).toLowerCase() : ''
            if (!file || !EXT_MIME[ext]) {
              res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
              res.end('no asset configured for ' + kind)
              return
            }
            const real = fs.realpathSync(path.join(THEME_DIR, file))
            if (path.dirname(real) !== fs.realpathSync(THEME_DIR)) {
              res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
              res.end('forbidden')
              return
            }
            const bytes = fs.readFileSync(real)
            res.writeHead(200, {
              'Content-Type': EXT_MIME[ext],
              'Cache-Control': 'no-store',
              'X-Content-Type-Options': 'nosniff',
            })
            res.end(bytes)
          } catch (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('asset not found')
          }
        }
      }

      // ---- Web 端 tapIndex 注入（桌面端无效、无害；两条通道各自幂等）--------
      try {
        if (typeof ctx.webServer.tapIndex === 'function') {
          disposers.push(ctx.webServer.tapIndex((html) => {
            if (html.indexOf('/dsh-anime-theme/theme.js') !== -1) return html
            const tag = '<script defer src="/dsh-anime-theme/theme.js?v=' + PLUGIN_VERSION + '"></script>'
            if (html.indexOf('</body>') !== -1) return html.replace('</body>', tag + '</body>')
            return html + tag
          }))
        }
      } catch (err) {}
    })
  },
}
