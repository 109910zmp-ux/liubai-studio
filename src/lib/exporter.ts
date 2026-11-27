import { tr } from "@/i18n"
import { ArrayBufferTarget, Muxer } from "mp4-muxer"
import { VIDEO_TYPES } from "./constants"
import type { Shot, StudioPayload, Template } from "./types"
import { createZip } from "./zip"

interface CaptureInfo {
  el: Element
  holder: HTMLElement
  width: number
  height: number
}

// Simple bounded cache: evict the oldest entry once the limit is reached.
// Both caches grow with every imported image / parameter change and were
// previously unbounded, so long editing sessions could retain tens of MB.
function cacheSet<T>(cache: Map<string, T>, key: string, value: T, limit: number) {
  cache.delete(key)
  cache.set(key, value)
  if (cache.size > limit) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
}

const smallCache = new Map<string, string>()
const captureCache = new Map<string, { css: string; vars: string }>()
const CACHE_LIMIT = 50

// WebKit's SVG rasterizer does not reliably evaluate nested calc()/var()
// inside box-shadow and gradients: the blur collapses to zero and leaves hard
// rectangular blocks behind the cards. Resolve simple arithmetic before
// serialization so the exported SVG contains plain numbers only.
// WebKit refuses to paint <img src="data:..."> (and CSS background-image data
// URLs) when the surrounding SVG is itself rasterized from a data URL. An
// inline <svg><image href="data:..."> survives that path, so swap captured
// images for equivalent inline SVG nodes before serialization. Chrome keeps
// its original DOM because it does not have this bug.
function isWebKit() {
  const ua = navigator.userAgent
  return /Safari/i.test(ua) && !/(Chrome|Chromium|Edg|Firefox|OPR)/i.test(ua)
}

function objectPositionToAspect(position: string) {
  const parts = position.trim().split(/\s+/)
  const x = parts[0] || "center"
  const y = parts[1] || "center"
  const h = x === "left" ? "xMin" : x === "right" ? "xMax" : "xMid"
  const v = y === "top" ? "YMin" : y === "bottom" ? "YMax" : "YMid"
  return `${h}${v}`
}

const CAPTURED_IMAGE_STYLES = [
  "display",
  "position",
  "left",
  "top",
  "right",
  "bottom",
  "width",
  "height",
  "margin",
  "padding",
  "border",
  "border-radius",
  "box-sizing",
  "filter",
  "opacity",
  "transform",
  "transform-origin",
  "mix-blend-mode",
  "background-color",
  "box-shadow",
  "overflow",
  "vertical-align",
] as const

function inlineImagesForCapture(root: HTMLElement) {
  if (!isWebKit()) return
  root.querySelectorAll("img").forEach((image) => {
    const src = image.getAttribute("src") || ""
    if (!/^data:image\//i.test(src)) return
    const computed = getComputedStyle(image)
    const rect = image.getBoundingClientRect()
    const width = rect.width || image.offsetWidth || Number.parseFloat(computed.width)
    const height = rect.height || image.offsetHeight || Number.parseFloat(computed.height)
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return

    const fit = computed.objectFit || "fill"
    const aspect =
      fit === "contain"
        ? `${objectPositionToAspect(computed.objectPosition)} meet`
        : fit === "cover"
          ? `${objectPositionToAspect(computed.objectPosition)} slice`
          : "none"

    const replacement = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    replacement.setAttribute("width", `${width}px`)
    replacement.setAttribute("height", `${height}px`)
    replacement.setAttribute("viewBox", `0 0 ${width} ${height}`)
    const style = CAPTURED_IMAGE_STYLES.map((property) => `${property}:${computed.getPropertyValue(property)}`).join(";")
    replacement.setAttribute("style", style)

    const inner = document.createElementNS("http://www.w3.org/2000/svg", "image")
    inner.setAttribute("href", src)
    inner.setAttribute("width", "100%")
    inner.setAttribute("height", "100%")
    inner.setAttribute("preserveAspectRatio", aspect)
    replacement.appendChild(inner)
    image.replaceWith(replacement)
  })
}

// The SVG rasterizer does not resolve CSS custom properties inside gradients
// (it falls back to the dark fallback colors and paints a black ledge). The
// live element already has the resolved gradient, so pin it inline before
// serialization.
function inlineComputedLedgeStyles(live: Element, clone: HTMLElement) {
  const source = Array.from(live.querySelectorAll(".ledge, .ledge *"))
  const copies = Array.from(clone.querySelectorAll(".ledge, .ledge *"))
  copies.forEach((node, index) => {
    const original = source[index]
    if (!original) return
    const computed = getComputedStyle(original)
    const element = node as HTMLElement
    const background = computed.backgroundImage
    if (background && background !== "none") element.style.backgroundImage = background
    const shadow = computed.boxShadow
    if (shadow && shadow !== "none") element.style.boxShadow = shadow
  })
}

// Evaluate a simple arithmetic expression (+ - * /, parentheses, decimals)
// without Function(), so exporting still works under a strict CSP that
// forbids unsafe-eval. Returns null for anything it cannot parse.
function evalArithmetic(input: string): number | null {
  const text = input.replace(/\s+/g, "")
  if (!text || !/^[\d.+\-*/()]+$/.test(text)) return null
  let pos = 0
  const peek = () => text.charAt(pos)
  function primary(): number {
    let sign = 1
    while (peek() === "+" || peek() === "-") {
      if (text.charAt(pos++) === "-") sign = -sign
    }
    if (peek() === "(") {
      pos++
      const value = expression()
      if (peek() !== ")") throw new Error("unbalanced")
      pos++
      return sign * value
    }
    const start = pos
    while (/[\d.]/.test(peek()) && peek() !== "") pos++
    if (start === pos) throw new Error("number expected")
    const value = Number(text.slice(start, pos))
    if (!Number.isFinite(value)) throw new Error("invalid number")
    return sign * value
  }
  function term(): number {
    let value = primary()
    while (peek() === "*" || peek() === "/") {
      const op = text.charAt(pos++)
      const right = primary()
      value = op === "*" ? value * right : right === 0 ? NaN : value / right
    }
    return value
  }
  function expression(): number {
    let value = term()
    while (peek() === "+" || peek() === "-") {
      const op = text.charAt(pos++)
      const right = term()
      value = op === "+" ? value + right : value - right
    }
    return value
  }
  try {
    const value = expression()
    return pos === text.length && Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

// Wait for the browser to commit style/layout changes to the iframe before
// cloning it. rAF is precise and adapts to refresh rate; the timeout fallback
// keeps background tabs from stalling (rAF is throttled there) so long exports
// still finish — a regression seen earlier with headless/background recording.
function afterPaint(frames: number, fallbackMs: number) {
  return new Promise<void>((resolve) => {
    let remaining = frames
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }
    const tick = () => {
      remaining -= 1
      if (remaining <= 0) finish()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    setTimeout(finish, fallbackMs)
  })
}

function resolveCssCalc(css: string, root: HTMLElement, source?: HTMLElement) {
  const computed = getComputedStyle(root)
  // Font/ink variables (--title, --sans, --mono, ...) live on the poster
  // element, not on <html>. Inside SVG foreignObject, `font-family:var(--x)`
  // does not resolve against @font-face correctly, so these must be expanded
  // to their literal values before serialization. Read from the poster first,
  // then fall back to the root.
  const sourceComputed = source ? getComputedStyle(source) : null
  // Expand simple var() references first: calc() then contains no nested
  // parentheses and can be matched reliably.
  const expanded = css.replace(
    /var\(\s*(--[\w-]+)\s*(?:,\s*([^(),]*?)\s*)?\)/g,
    (match, name: string) => {
      const fromSource = sourceComputed?.getPropertyValue(name).trim() || ""
      const raw = fromSource || computed.getPropertyValue(name).trim()
      // Only expand variables that actually have a value. Truly element-local
      // variables (e.g. the watermark's --wm-image, set on .wm) resolve to an
      // empty string here; replacing them with the fallback would bake
      // `background-image:none` into the capture and drop the watermark.
      // Keep the var() untouched so the cloned tree resolves it in context.
      if (!raw) return match
      // XMLSerializer escapes `"` as `&quot;` inside <style> text, and SVG
      // rasterization does not decode entities in CSS text — that breaks
      // `font-family:"Custom",...`. Single quotes survive serialization and
      // resolve correctly in foreignObject. Only transform font-like values.
      if (/^--(title|sans|mono|latin|font)$/.test(name)) {
        const normalized = raw.replace(/"/g, "'")
        // Chrome's SVG-as-image rasterizer fails to match @font-face when the
        // font-family list ends with a generic family keyword (serif,
        // sans-serif, monospace...). Strip the trailing generic so custom
        // fonts actually render in exported PNG/video.
        return normalized.replace(/,\s*(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace)\s*$/i, "")
      }
      return raw
    },
  )
  return expanded.replace(/calc\(([^()]*)\)/g, (all, inner: string) => {
    const hasPx = /\d\s*px/.test(inner)
    const hasPercent = /\d\s*%/.test(inner)
    // Mixed units (e.g. 100% - 20px) need real layout context; leave them be.
    if (hasPx && hasPercent) return all
    const unit = hasPx ? "px" : hasPercent ? "%" : ""
    const numeric = inner.replace(/px|%/g, "")
    const value = evalArithmetic(numeric)
    if (value == null) return all
    return `${Number(value.toFixed(3))}${unit}`
  })
}

export function exportName(title: string, suffix: string) {
  const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i
  let base = (title.trim() || tr("留白"))
    .replace(/[\\/:*?"<>|\n\r\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    .replace(/[. ]+$/g, "")
  if (!base || WINDOWS_RESERVED.test(base)) base = `_${base || tr("留白")}`
  return `${base}${suffix}`
}

export function downloadBlob(blob: Blob, name: string) {
  const anchor = document.createElement("a")
  const url = URL.createObjectURL(blob)
  anchor.href = url
  anchor.download = name
  anchor.click()
  // Large MP4/ZIP downloads on Safari or slow disks can take well over 4s to
  // start reading the blob; revoke late enough not to cut the download short.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

// FNV-1a over the base64 payload. Using data.length alone as the cache key
// collides whenever two different images happen to encode to the same length,
// which silently swaps one shot's thumbnail for another during video export.
function hashData(data: string) {
  let hash = 2166136261
  for (let i = 0; i < data.length; i++) {
    hash ^= data.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function smallImage(data: string, maxWidth: number) {
  const key = `${hashData(data)}_${data.length}_${maxWidth}`
  const cached = smallCache.get(key)
  if (cached) return Promise.resolve(cached)
  return new Promise<string>((resolve) => {
    const image = new Image()
    const guard = setTimeout(() => resolve(data), 6000)
    image.onload = () => {
      clearTimeout(guard)
      const width = Math.min(maxWidth, image.naturalWidth)
      const height = Math.round(image.naturalHeight * (width / image.naturalWidth))
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      canvas.getContext("2d")?.drawImage(image, 0, 0, width, height)
      const output = canvas.toDataURL("image/jpeg", 0.82)
      cacheSet(smallCache, key, output, CACHE_LIMIT)
      resolve(output)
    }
    image.onerror = () => {
      clearTimeout(guard)
      resolve(data)
    }
    image.src = data
  })
}

export type VideoEngine = "webcodecs" | "mediarecorder"

// H.264 4:2:0 chroma subsampling requires even dimensions. Desktop software
// encoders silently pad odd sizes, but iOS VideoToolbox rejects them with a
// fatal "encode task failed" error, so snap the capture canvas to even pixels.
function evenDimension(value: number) {
  const rounded = Math.max(2, Math.round(value))
  return rounded % 2 === 0 ? rounded : rounded + 1
}

// WebKit surfaces fatal VideoEncoder failures through the error callback or a
// rejected flush(). Mark them so the caller can retry with MediaRecorder
// instead of exposing the raw "encode task failed" message to the user.
class VideoEncodeFailure extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause))
    this.name = "VideoEncodeFailure"
    Object.setPrototypeOf(this, VideoEncodeFailure.prototype)
  }
}

// WebCodecs encodes frames directly: no captureStream, no real-time playback.
// Safari / iOS Safari support VideoEncoder from 16.4, which makes this the
// primary path on WebKit and avoids the known iOS 26 MP4 MediaRecorder freeze.
export function webCodecsSupported() {
  return (
    typeof VideoEncoder !== "undefined" &&
    typeof VideoFrame !== "undefined" &&
    typeof EncodedVideoChunk !== "undefined"
  )
}

export function mediaRecorderSupported() {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof document.createElement("canvas").captureStream === "function"
  )
}

export function videoSupported() {
  return webCodecsSupported() || mediaRecorderSupported()
}

export function videoEngine(): VideoEngine | null {
  if (webCodecsSupported()) return "webcodecs"
  if (mediaRecorderSupported()) return "mediarecorder"
  return null
}

export function supportedVideoType() {
  if (typeof MediaRecorder === "undefined") return null
  for (const type of VIDEO_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type
    } catch {
      // Ignore unsupported codecs.
    }
  }
  return null
}

interface CodecChoice {
  config: VideoEncoderConfig
}

// Only H.264 is accepted for MP4 output. VP9-in-MP4 is supported by very few
// players (notably not iOS Safari), so when a browser cannot encode H.264 we
// fall back to MediaRecorder instead of shipping an unplayable file.
async function pickVideoCodec(
  width: number,
  height: number,
  bitrate: number,
  fps: number,
): Promise<CodecChoice | null> {
  if (!webCodecsSupported()) return null
  // Baseline AVC is the safest H.264 profile on iOS hardware encoders.
  const candidates = ["avc1.42001e", "avc1.4d0028"]
  for (const codec of candidates) {
    const config: VideoEncoderConfig = {
      codec,
      width,
      height,
      bitrate,
      framerate: fps,
      avc: { format: "avc" },
    }
    try {
      const support = await VideoEncoder.isConfigSupported(config)
      if (support.supported) {
        // Some engines report a rewritten config. Keep their profile/bitrate
        // decisions but pin the even dimensions the caller already computed.
        const confirmed = support.config ?? config
        return { config: { ...confirmed, width, height } }
      }
    } catch {
      // Try the next profile.
    }
  }
  return null
}

function cloneCaptureNode(
  preview: HTMLIFrameElement,
  templateKey: string,
  renderNow?: () => void,
): CaptureInfo {
  renderNow?.()
  const doc = preview.contentDocument
  if (!doc) throw new Error(tr("预览未就绪"))
  // Standard Reeden templates mark the real poster with data-reeden-capture;
  // built-in templates also expose #poster. Keep body as a last resort.
  const target = doc.querySelector<HTMLElement>("[data-reeden-capture]") ?? doc.getElementById("poster") ?? doc.body
  // Layout dimensions are the capture source of truth. WebKit can report a
  // transformed rect for iframed content; offsetWidth/Height stay stable.
  const width = target.offsetWidth || Math.ceil(target.getBoundingClientRect().width)
  const height = target.offsetHeight || Math.ceil(target.getBoundingClientRect().height)
  if (width < 20 || height < 20) throw new Error(tr("无法读取画布尺寸"))

  const clone = target.cloneNode(true) as HTMLElement
  const root = doc.documentElement
  const computed = getComputedStyle(root)
  const softVar = computed.getPropertyValue("--shsoft").trim()
  const cardShVar = computed.getPropertyValue("--card-sh").trim()
  // Font/ink variables that drive font-family must be part of the cache key:
  // uploading a custom font changes --title/--sans/--mono on the poster, and a
  // stale cache would otherwise bake the previous font into every export.
  const fontVars = (target as HTMLElement).style.cssText
  const cacheKey = [
    templateKey,
    root.getAttribute("data-param-shot-border") || "",
    root.getAttribute("data-ind") || "",
    softVar,
    cardShVar,
    fontVars,
  ].join("|")

  let cache = captureCache.get(cacheKey)
  if (!cache) {
    let css = ""
    doc.querySelectorAll("style").forEach((style) => {
      css += `${style.textContent}\n`
    })
    cache = { css: resolveCssCalc(css, root, target as HTMLElement), vars: root.getAttribute("style") || "" }
    cacheSet(captureCache, cacheKey, cache, CACHE_LIMIT)
  }

  // Keep the capture tree in a detached shadow root. Template styles must never
  // be injected into the main document, or the whole UI flickers every frame.
  const holder = document.createElement("div")
  // WebKit only computes styles for attached shadow trees; keep it far offscreen
  // while we measure images for the inline-SVG replacement.
  holder.style.cssText = "position:fixed;left:-100000px;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none"
  document.body.appendChild(holder)
  const shadow = holder.attachShadow({ mode: "open" })
  const html = document.createElementNS("http://www.w3.org/1999/xhtml", "html")
  // XMLSerializer emits the namespace declaration; setting xmlns manually
  // duplicates it and WebKit rejects the generated SVG.
  Array.from(root.attributes).forEach((attribute) => {
    if (attribute.name.startsWith("data-")) html.setAttribute(attribute.name, attribute.value)
  })
  // Pin the serialized canvas to the captured layout size so WebKit cannot
  // shrink-to-fit or reflow it differently from the preview.
  ;(html as HTMLElement).style.cssText = `${cache.vars || ""};width:${width}px;height:${height}px;overflow:hidden`
  const head = document.createElementNS("http://www.w3.org/1999/xhtml", "head")
  const style = document.createElementNS("http://www.w3.org/1999/xhtml", "style")
  style.textContent = cache.css
  head.appendChild(style)
  const body = document.createElementNS("http://www.w3.org/1999/xhtml", "body")
  ;(body as HTMLElement).style.cssText = `width:${width}px;height:${height}px;margin:0;overflow:hidden`
  body.appendChild(clone)
  html.append(head, body)
  shadow.appendChild(html)
  // Must run after the shadow tree is laid out: computed width/height and
  // object-fit decide how the inline SVG replacement is sized and cropped.
  inlineImagesForCapture(html)
  inlineComputedLedgeStyles(target, html)

  return { el: html, holder, width, height }
}

function serializeToSvg(el: Element, width: number, height: number) {
  let xml = new XMLSerializer().serializeToString(el)
  const openingTag = xml.slice(0, xml.indexOf(">"))
  if (!openingTag.includes("xmlns=")) {
    xml = xml.replace(/^<([A-Za-z][\w:-]*)/, `<$1 xmlns="http://www.w3.org/1999/xhtml"`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="${width}" height="${height}">${xml}</foreignObject></svg>`
}

function svgToCanvas(svg: string, width: number, height: number) {
  return new Promise<HTMLCanvasElement>((resolve, reject) => {
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    const image = new Image()
    let done = false
    const timer = setTimeout(() => {
      if (!done) {
        done = true
        reject(new Error(tr("光栅化超时")))
      }
    }, 8000)
    image.onload = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      try {
        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext("2d")
        if (!context) throw new Error(tr("无法创建画布"))
        context.fillStyle = "#ffffff"
        context.fillRect(0, 0, width, height)
        context.drawImage(image, 0, 0, width, height)
        resolve(canvas)
      } catch (error) {
        reject(error)
      }
    }
    image.onerror = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      reject(new Error(tr("光栅化失败（可能是滤镜或字体不受支持）")))
    }
    image.src = url
  })
}

export class ExportCancelled extends Error {
  constructor() {
    super(tr("已取消导出"))
    this.name = "ExportCancelled"
  }
}

// Central cancellation check. Each export calls this at every unit of work so
// a long batch/video run can stop promptly without leaking encoders or blobs.
function throwIfCancelled(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw new ExportCancelled()
}

interface ExportCallbacks {
  setProgress: (value: number) => void
  setStatus: (message: string) => void
  toast: (message: string) => void
  signal?: AbortSignal
}

interface PngOptions extends ExportCallbacks {
  preview: HTMLIFrameElement | null
  templateKey: string
  title: string
  targetWidth: number
  renderNow: () => void
  hasShots: boolean
}

// Render a payload into the preview iframe and capture it as a PNG blob.
// `render` is invoked inside cloneCaptureNode so the iframe DOM matches the
// payload before cloning. Shared by single and batch export.
async function capturePngBlob(
  preview: HTMLIFrameElement,
  templateKey: string,
  targetWidth: number,
  render: () => void,
): Promise<{ blob: Blob; width: number; height: number }> {
  let info: CaptureInfo | null = null
  try {
    info = cloneCaptureNode(preview, templateKey, render)
    const scale = targetWidth / info.width
    const svg = serializeToSvg(info.el, info.width, info.height)
    const canvas = await svgToCanvas(svg, Math.round(info.width * scale), Math.round(info.height * scale))
    info.holder.remove()
    info = null
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/png")
    })
    if (!blob) throw new Error(tr("生成 PNG 失败"))
    return { blob, width: canvas.width, height: canvas.height }
  } finally {
    info?.holder.remove()
  }
}

export async function exportPng(options: PngOptions) {
  const { preview, templateKey, title, targetWidth, renderNow, hasShots } = options
  if (!preview) throw new Error(tr("预览未就绪"))
  if (!hasShots) throw new Error(tr("先添加素材"))
  throwIfCancelled(options.signal)

  options.setStatus(tr("正在渲染…"))
  options.setProgress(0.2)
  const { blob, width, height } = await capturePngBlob(preview, templateKey, targetWidth, renderNow)
  downloadBlob(blob, exportName(title, ".png"))
  options.setStatus(tr("PNG 已导出：{width} × {height}", { width, height }))
  options.toast(tr("PNG 已导出"))
  options.setProgress(1)
}

interface BatchOptions extends ExportCallbacks {
  preview: HTMLIFrameElement | null
  template: Template
  groups: Shot[][]
  title: string
  targetWidth: number
  includePng: boolean
  includeVideo: boolean
  duration: number
  fps: number
  quality: number
  buildVideoPayload: (small: boolean, used: Shot[]) => StudioPayload
  // Render a specific group into the preview iframe (synchronous DOM update).
  renderGroup: (group: Shot[]) => void
  restore: () => void
}

export async function exportBatchZip(options: BatchOptions) {
  const {
    preview, template, groups, title, targetWidth, renderGroup, restore,
    includePng, includeVideo, duration, fps, quality, buildVideoPayload,
  } = options
  if (!preview) throw new Error(tr("预览未就绪"))
  if (!groups.length) throw new Error(tr("先添加素材"))
  if (!includePng && !includeVideo) throw new Error(tr("至少选择一种批量格式"))
  if (includeVideo && !videoSupported()) throw new Error(tr("此浏览器不支持视频录制"))

  const files: Array<{ name: string; data: Blob }> = []
  const perGroup = Number(includePng) + Number(includeVideo)
  const totalSteps = groups.length * perGroup + 1
  let step = 0
  const mark = (part = 1) => options.setProgress(Math.min(0.99, (step + part) / totalSteps))
  let pngCount = 0
  let videoCount = 0

  try {
    for (let index = 0; index < groups.length; index += 1) {
      throwIfCancelled(options.signal)
      const group = groups[index]
      const groupLabel = tr("第 {index} / {total} 组", { index: index + 1, total: groups.length })
      const suffix = groups.length > 1 ? `-${String(index + 1).padStart(2, "0")}` : ""

      if (includePng) {
        options.setStatus(tr("{group} · 正在渲染 PNG…", { group: groupLabel }))
        // renderGroup pushes the batch payload into the iframe; pass a no-op to
        // cloneCaptureNode because the DOM is already showing this batch.
        renderGroup(group)
        await afterPaint(2, 60)
        const { blob } = await capturePngBlob(preview, template.key, targetWidth, () => {})
        files.push({ name: exportName(title, `${suffix}.png`), data: blob })
        pngCount += 1
        step += 1
        mark()
      }

      if (includeVideo) {
        const result = await recordVideo({
          preview,
          template,
          shots: group,
          duration,
          fps,
          quality,
          buildPayload: buildVideoPayload,
          setProgress: mark,
          setStatus: (message) => options.setStatus(`${groupLabel} · ${message}`),
          toast: () => {},
          signal: options.signal,
        })
        files.push({ name: exportName(title, `${suffix}.${result.extension}`), data: result.blob })
        videoCount += 1
        step += 1
        mark()
      }
    }

    throwIfCancelled(options.signal)
    options.setStatus(tr("正在打包 {count} 个文件…", { count: files.length }))
    const zip = await createZip(files)
    downloadBlob(zip, exportName(title, tr(" 批量.zip")))
    const summary = [
      pngCount ? tr("{count} 张图片", { count: pngCount }) : "",
      videoCount ? tr("{count} 段视频", { count: videoCount }) : "",
    ].filter(Boolean).join(" · ")
    options.setStatus(
      tr("批量导出完成：{summary} · {size} MB", { summary, size: (zip.size / 1048576).toFixed(1) }),
    )
    options.toast(tr("已导出 {count} 个文件", { count: files.length }))
    options.setProgress(1)
  } finally {
    restore()
  }
}

interface VideoOptions extends ExportCallbacks {
  preview: HTMLIFrameElement | null
  template: Template
  shots: Shot[]
  duration: number
  fps: number
  quality: number
  // `used` is a shallow copy of this export's shots with small images prepared.
  // Passing it back avoids mutating the user's shot objects in place.
  buildPayload: (small: boolean, used: Shot[]) => StudioPayload
}

interface VideoResult {
  blob: Blob
  extension: string
  width: number
  height: number
  failures: number
}

// Record one clip and return the blob. Shared by the single video export and
// the batch ZIP so both paths run exactly the same capture pipeline.
async function recordVideoOnce(
  options: VideoOptions,
  forceEngine?: VideoEngine,
): Promise<VideoResult> {
  const { preview, template, shots, duration, fps, quality } = options
  if (!preview) throw new Error(tr("预览未就绪"))
  if (!shots.length) throw new Error(tr("先添加素材"))

  const engine = forceEngine ?? videoEngine()
  if (!engine) throw new Error(tr("此浏览器不支持视频录制，可改用 PNG 导出"))
  const mime = supportedVideoType()

  const win = preview.contentWindow as (Window & {
    Reeden?: { seekAnimation?: (progress: number) => void }
    ReedenShareTemplate?: { render: (payload: StudioPayload) => void }
  }) | null
  if (!win?.Reeden?.seekAnimation || !win.ReedenShareTemplate) {
    throw new Error(tr("当前模板没有可动的时间轴"))
  }

  options.setStatus(tr("准备素材…"))
  const used = shots.slice(0, template.count).map((shot) => ({ ...shot }))
  const neededWidth = Math.min(1400, Math.round(560 * quality))
  for (const shot of used) {
    throwIfCancelled(options.signal)
    if (!shot.small) shot.small = await smallImage(shot.data, neededWidth)
  }

  win.ReedenShareTemplate.render(options.buildPayload(true, used))
  await afterPaint(2, 300)

  let info: CaptureInfo | null = null
  try {
    info = cloneCaptureNode(preview, template.key, () => {})
    const scale = Math.max(1, Math.min(3, (640 * quality) / info.width))
    // H.264 needs even dimensions on iOS VideoToolbox. Compute the scaled
    // canvas size with an even snap so WebCodecs never receives an odd frame.
    const width = evenDimension(info.width * scale)
    const height = evenDimension(info.height * scale)
    info.holder.remove()
    info = null

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) throw new Error(tr("无法创建录制画布"))

    // --- Encoder setup ------------------------------------------------------
    // WebCodecs: encode every rendered frame directly into an MP4 muxer. No
    // captureStream and no wall-clock waiting, so it works on iOS Safari and
    // finishes as fast as frames can be rasterized.
    let encoder: VideoEncoder | null = null
    let muxTarget: ArrayBufferTarget | null = null
    let muxer: Muxer<ArrayBufferTarget> | null = null
    let encoderError: Error | null = null

    // --- MediaRecorder fallback --------------------------------------------
    let stream: MediaStream | null = null
    let recorder: MediaRecorder | null = null
    let chunks: Blob[] = []
    let stopped: Promise<void> | null = null
    let manualPush = false

    if (engine === "webcodecs") {
      // Keep bitrate within the level used by the Baseline candidates so the
      // iOS hardware encoder cannot reject an out-of-range configuration.
      const bitrate = Math.min(
        10_000_000,
        Math.round(canvas.width * canvas.height * fps * 0.18),
      )
      const choice = await pickVideoCodec(canvas.width, canvas.height, bitrate, fps)
      if (!choice) {
        // VideoEncoder exists but no usable profile: fall back if possible.
        if (!mime || !mediaRecorderSupported()) {
          throw new Error(tr("此浏览器不支持 H.264 视频编码，可改用 PNG 导出"))
        }
      } else {
        muxTarget = new ArrayBufferTarget()
        muxer = new Muxer({
          target: muxTarget,
          video: { codec: "avc", width: canvas.width, height: canvas.height, frameRate: fps },
          fastStart: "in-memory",
        })
        encoder = new VideoEncoder({
          output: (chunk, meta) => muxer?.addVideoChunk(chunk, meta),
          error: (error) => {
            encoderError = error instanceof Error ? error : new Error(String(error))
          },
        })
        try {
          encoder.configure(choice.config)
        } catch (error) {
          encoder.close()
          encoder = null
          muxer = null
          muxTarget = null
          if (!mime || !mediaRecorderSupported()) throw error
        }
      }
    }

    if (!encoder) {
      if (!mime || !mediaRecorderSupported()) {
        throw new Error(tr("此浏览器不支持视频录制，可改用 PNG 导出"))
      }
      stream = canvas.captureStream(0)
      let track = stream.getVideoTracks()[0] as
        | (MediaStreamTrack & { requestFrame?: () => void })
        | undefined
      manualPush = typeof track?.requestFrame === "function"
      if (!manualPush) {
        stream.getTracks().forEach((item) => item.stop())
        stream = canvas.captureStream(Math.min(fps, 15))
        track = stream.getVideoTracks()[0] as
          | (MediaStreamTrack & { requestFrame?: () => void })
          | undefined
      }
      recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: Math.round(
          canvas.width * canvas.height * (manualPush ? fps : 15) * 0.18,
        ),
      })
      chunks = []
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data)
      }
      stopped = new Promise<void>((resolve) => {
        if (recorder) recorder.onstop = () => resolve()
        else resolve()
      })
    }

    const total = Math.max(1, Math.round(duration * fps))
    const frameMs = 1000 / fps
    const startedAt = performance.now()
    let lastGood = false
    let failures = 0
    let frame: CaptureInfo | null = null
    let recordingStarted = false

    // Release the hardware encoder before a retry: iOS allows only a handful
    // of simultaneous VideoToolbox sessions and a leaked one can break the
    // MediaRecorder fallback that follows.
    const failEncode = (cause: unknown): never => {
      try { encoder?.close() } catch { /* already failed */ }
      encoder = null
      muxer = null
      muxTarget = null
      throw new VideoEncodeFailure(cause)
    }

    try {
      for (let index = 0; index < total; index += 1) {
        throwIfCancelled(options.signal)
        if (encoderError) failEncode(encoderError)
        const progress = index / (total - 1 || 1)
        win.Reeden!.seekAnimation!(progress)
        // Let the template commit its animation state before cloning.
        await afterPaint(1, 16)
        frame = cloneCaptureNode(preview, template.key, () => {})
        const svg = serializeToSvg(frame.el, frame.width, frame.height)
        try {
          const rendered = await svgToCanvas(svg, Math.round(frame.width * scale), Math.round(frame.height * scale))
          // Draw over the previous frame instead of clearing to white: a failed
          // or in-flight rasterization must never expose a blank frame.
          context.drawImage(rendered, 0, 0, canvas.width, canvas.height)
          lastGood = true
          if (encoder) {
            const videoFrame = new VideoFrame(canvas, {
              timestamp: Math.round((index * 1e6) / fps),
              duration: Math.round(1e6 / fps),
            })
            try {
              encoder.encode(videoFrame, { keyFrame: index === 0 || index % (fps * 2) === 0 })
            } catch (error) {
              failEncode(error)
            } finally {
              videoFrame.close()
            }
            // Keep the encode queue bounded so long clips do not balloon memory.
            while (encoder.encodeQueueSize > 12) {
              await new Promise((resolve) => setTimeout(resolve, 8))
            }
          } else {
            if (!recordingStarted) {
              // A timeslice avoids the iOS 26+ MediaRecorder MP4 freeze and
              // guarantees dataavailable events keep flowing.
              recorder?.start(1000)
              recordingStarted = true
            }
            if (manualPush) {
              const track = stream?.getVideoTracks()[0] as
                | (MediaStreamTrack & { requestFrame?: () => void })
                | undefined
              track?.requestFrame?.()
            }
          }
        } catch (error) {
          // Encoder failures must reach the retry layer, never be counted as a
          // harmless rasterization miss.
          if (error instanceof VideoEncodeFailure) throw error
          if (!lastGood) throw new Error(tr("首帧渲染失败"))
          failures += 1
        } finally {
          frame.holder.remove()
          frame = null
        }
        options.setProgress((index + 1) / total)
        options.setStatus(
          tr("{mode}中 {index} / {total} 帧 · {seconds}s", {
            mode: tr(encoder ? "编码" : "录制"),
            index: index + 1,
            total,
            seconds: ((performance.now() - startedAt) / 1000).toFixed(1),
          }),
        )
      }
    } finally {
      frame?.holder.remove()
    }

    throwIfCancelled(options.signal)
    if (encoder && muxer && muxTarget) {
      try {
        await encoder.flush()
      } catch (error) {
        failEncode(error)
      }
      if (encoderError) failEncode(encoderError)
      encoder.close()
      muxer.finalize()
      const blob = new Blob([muxTarget.buffer], { type: "video/mp4" })
      return {
        blob,
        extension: "mp4",
        width: canvas.width,
        height: canvas.height,
        failures,
      }
    }

    if (!recorder || !recordingStarted) throw new Error(tr("没有可录制的帧"))
    await new Promise((resolve) => setTimeout(resolve, Math.max(120, frameMs * 2)))
    recorder.stop()
    await stopped
    stream?.getTracks().forEach((item) => item.stop())

    const fallbackType = mime || "video/webm"
    const blob = new Blob(chunks, { type: fallbackType })
    const extension = fallbackType.includes("mp4") ? "mp4" : "webm"
    return {
      blob,
      extension,
      width: canvas.width,
      height: canvas.height,
      failures,
    }
  } finally {
    info?.holder.remove()
    try {
      win.Reeden?.seekAnimation?.(0)
    } catch {
      // Ignore template cleanup errors.
    }
  }
}

// A single clip may be attempted twice: WebCodecs first (fast, no wall-clock
// wait), then MediaRecorder if the platform encoder fails at runtime. This is
// what keeps iOS exports working when VideoToolbox rejects the H.264 session
// despite isConfigSupported() having reported success.
async function recordVideo(options: VideoOptions): Promise<VideoResult> {
  const engine = videoEngine()
  if (engine === "webcodecs") {
    try {
      return await recordVideoOnce(options, "webcodecs")
    } catch (error) {
      if (!(error instanceof VideoEncodeFailure)) throw error
      if (!supportedVideoType() || !mediaRecorderSupported()) throw error
      options.setStatus(tr("硬件编码失败，切换兼容录制模式…"))
      try {
        return await recordVideoOnce(options, "mediarecorder")
      } catch (fallbackError) {
        // Surface a clear, localized message instead of the raw WebKit error.
        throw new Error(
          tr("视频编码失败，兼容模式也未成功：{error}", {
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          }),
        )
      }
    }
  }
  return recordVideoOnce(options, engine ?? undefined)
}

export async function exportVideo(options: VideoOptions & { title: string }) {
  const result = await recordVideo(options)
  downloadBlob(result.blob, exportName(options.title, `.${result.extension}`))
  options.setStatus(
    tr("已导出 {ext}：{width} × {height} · {size} MB{extra}", {
      ext: result.extension.toUpperCase(),
      width: result.width,
      height: result.height,
      size: (result.blob.size / 1048576).toFixed(1),
      extra: result.failures
        ? tr("（{count} 帧沿用上一帧）", { count: result.failures })
        : "",
    }),
  )
  options.toast(tr("视频已导出"))
}
