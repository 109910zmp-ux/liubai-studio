import { useEffect, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import { toast } from "@/components/ui/toast"
import { tr, useI18n } from "@/i18n"
import { DARK_COLORS, LIGHT_COLORS } from "@/lib/constants"
import type { ColorKey, Colors } from "@/lib/constants"
import { useHistory } from "@/hooks/useHistory"
import { clamp } from "@/lib/math"
import { STYLE_PRESETS } from "@/lib/presets"
import { buildPayload, shotPage } from "@/lib/payload"
import { collectPayloadText, subsetPayloadFonts } from "@/lib/fontSubset"
import {
  analyzeShots,
  analyzeThemeJson,
  composeTranslucent,
  deriveAutoPalette,
  imageBrightness,
  setToneFromMode,
} from "@/lib/palette"
import { exportName, exportPng, exportVideo, exportBatchZip, downloadBlob, videoEngine, videoSupported, ExportCancelled } from "@/lib/exporter"
import { clearDraft, loadDraft, saveDraft } from "@/lib/draft"
import { loadProject, projectJson } from "@/lib/project"
import type { LoadedProject } from "@/lib/project"
import {
  buildTemplates,
  evalWhen,
  paramValue,
  parseTemplateHtml,
  templateBuiltinTexts,
  templateFolderFromFile,
  templateGroupByMode,
  templateMetaEntries,
  templateTitle,
} from "@/lib/templates"
import type { TemplateGroupMode } from "@/lib/templates"
import type { ParamValues, Shot, StudioPayload, Template, ThemeMeta, Tone } from "@/lib/types"

type AccordionValue = string[]
type FloatLayout = { x: number; y: number; w: number; h: number; zoom: number }

const ACCORDION_KEY = "liubai-accordion-sections"
const FLOAT_LAYOUT_KEY = "liubai-float-layout"

function readStored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // UI convenience only — ignore quota / disabled storage.
  }
}

type PickerState = { open: boolean; key: ColorKey | null }
type MobileTab = "side" | "main"
type FloatPlacement = "open" | "compact" | "normal"
export type BatchFormat = "images" | "videos" | "both"

type StudioSnapshot = {
  shots: Shot[]
  currentTpl: Template | null
  params: ParamValues
  activePreset: string | null
  colors: Colors
  alpha: Record<string, number>
  tone: Tone
  name: string
  description: string
  author: string
  sharer: string
  urlText: string
}

const TEMPLATES = buildTemplates()
const DEFAULT_TEMPLATE = TEMPLATES.find((item) => item.count === 3) ?? TEMPLATES[0] ?? null

// Safe-area insets are exposed as CSS variables so the fixed floating window
// can stay clear of the notch/home indicator in iOS landscape.
function safeInsets() {
  const style = getComputedStyle(document.documentElement)
  const read = (name: string) => {
    const value = Number.parseFloat(style.getPropertyValue(name))
    return Number.isFinite(value) ? value : 0
  }
  return {
    top: read("--safe-top"),
    right: read("--safe-right"),
    bottom: read("--safe-bottom"),
    left: read("--safe-left"),
  }
}

interface ReadImageResult {
  shot: Shot | null
  error?: string
}

function makeThumbnail(image: HTMLImageElement, maxWidth = 128) {
  const width = Math.min(maxWidth, image.naturalWidth || maxWidth)
  const height = Math.max(1, Math.round((image.naturalHeight || maxWidth) * (width / (image.naturalWidth || maxWidth))))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  canvas.getContext("2d")?.drawImage(image, 0, 0, width, height)
  return canvas.toDataURL("image/jpeg", 0.8)
}

function readImage(file: File, nextId: () => string): Promise<ReadImageResult> {
  return new Promise((resolve) => {
    const isHeic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        resolve({
          shot: {
            id: nextId(),
            data: String(reader.result),
            width: image.naturalWidth,
            height: image.naturalHeight,
            label: file.name.replace(/\.[^.]+$/, ""),
            page: "photo",
            thumb: makeThumbnail(image),
          },
        })
      }
      image.onerror = () => resolve({
        shot: null,
        error: isHeic
          ? tr("{name}：当前浏览器无法解码 HEIC，请先转换为 JPG / PNG", { name: file.name })
          : tr("{name}：无法解码该图片", { name: file.name }),
      })
      image.src = String(reader.result)
    }
    reader.onerror = () =>
      resolve({ shot: null, error: tr("{name}：读取失败", { name: file.name }) })
    reader.readAsDataURL(file)
  })
}

export function useStudio() {
  const { t, language } = useI18n()
  const notify = (message: string) => toast.add({ title: message, timeout: 2400 })

  const [templates, setTemplates] = useState<Template[]>(TEMPLATES)
  const templatesRef = useRef(templates)
  templatesRef.current = templates
  const [shots, setShots] = useState<Shot[]>([])
  const [currentTpl, setCurrentTpl] = useState<Template | null>(DEFAULT_TEMPLATE)
  const currentTplRef = useRef(currentTpl)
  currentTplRef.current = currentTpl
  // Built-in layouts are 640px; imported Reeden templates use their own meta width.
  const canvasWidth = (template: Template | null = currentTpl) => template?.width ?? 640
  const templateGroup = (template: Template) => template.group?.trim() || t("导入模板")
  const [params, setParams] = useState<ParamValues>({})
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [colors, setColors] = useState<Colors>({ ...LIGHT_COLORS })
  const [alpha, setAlpha] = useState<Record<string, number>>({})
  const [tone, setToneState] = useState<Tone>("light")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [author, setAuthor] = useState("")
  const [sharer, setSharer] = useState("")
  const [urlText, setUrlText] = useState("")
  // Track the values we filled from the last template so switching templates
  // refreshes untouched fields without overwriting the user's own edits.
  const autoTextsRef = useRef({ name: "", description: "", author: "", sharer: "", urlText: "" })
  useEffect(() => {
    const next = templateBuiltinTexts(currentTpl)
    // Work-info inputs map 1:1 to the template's meta entries (label = name,
    // value = content). The name field keeps the user's own edit, but the four
    // meta-backed fields always refresh so values from a previous template
    // cannot linger after switching.
    const meta = templateMetaEntries(currentTpl)
    const prev = autoTextsRef.current
    const resolved = {
      name: !name.trim() || name === prev.name ? next.name : name,
      description: meta[0]?.content || "",
      author: meta[1]?.content || "",
      sharer: meta[2]?.content || "",
      urlText: meta[3]?.content || "",
    }
    autoTextsRef.current = resolved
    if (resolved.name !== name) setName(resolved.name)
    if (resolved.description !== description) setDescription(resolved.description)
    if (resolved.author !== author) setAuthor(resolved.author)
    if (resolved.sharer !== sharer) setSharer(resolved.sharer)
    if (resolved.urlText !== urlText) setUrlText(resolved.urlText)
    // Only a template change (or its late-harvested mock) should refill fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTpl?.key, currentTpl?.mock])
  const [zoom, setZoomValue] = useState(1)
  const [status, setStatus] = useState(t("正在载入模板…"))
  const [tplHint, setTplHint] = useState(
    DEFAULT_TEMPLATE
      ? t("当前：{name} · {count} 个位置", { name: t(DEFAULT_TEMPLATE.name), count: DEFAULT_TEMPLATE.count })
      : "",
  )
  const [templateImportStatus, setTemplateImportStatus] = useState(
    t("仅支持 Reeden 单文件 HTML 模板，请只导入可信来源。"),
  )
  const [jsonRaw, setJsonRaw] = useState("")
  const [jsonStatus, setJsonStatus] = useState(t("支持 Reeden 主题配置，也支持任意含颜色字段的 JSON。"))
  const [colorStatus, setColorStatus] = useState(t("默认"))
  const [projStatus, setProjStatus] = useState("")
  const [draftStatus, setDraftStatus] = useState(t("正在检查草稿…"))
  const [exportStatus, setExportStatus] = useState("")
  const [progress, setProgress] = useState(0)
  const [progressVisible, setProgressVisible] = useState(false)
  const [exporting, setExporting] = useState(false)
  const exportAbort = useRef<AbortController | null>(null)
  // Subset custom fonts once per export from the *current* payload text, then
  // apply the result to every payload built during that run. Preview keeps the
  // full font so editing text never shows missing glyphs.
  const exportFonts = useRef<ParamValues | null>(null)
  const [mobileTab, setMobileTab] = useState<MobileTab>("side")
  const [accordionValue, setAccordionValue] = useState<AccordionValue>(() => {
    const stored = readStored<AccordionValue>(ACCORDION_KEY)
    const valid = Array.isArray(stored)
      ? stored.filter((key) => key !== "tone")
      : ["color", "assets", "templates"]
    return valid
  })
  const [picker, setPicker] = useState<PickerState>({ open: false, key: null })
  const [projectOpen, setProjectOpen] = useState(false)
  const [floatOpen, setFloatOpen] = useState(false)
  const [floatMin, setFloatMin] = useState(false)
  const [floatBig, setFloatBig] = useState(false)
  const [floatCompact, setFloatCompact] = useState(false)
  const [pngWidth, setPngWidth] = useState(1280)
  const [videoDuration, setVideoDuration] = useState(4)
  const [videoFps, setVideoFps] = useState(24)
  const [videoQuality, setVideoQuality] = useState(1.5)
  const [videoAvailable] = useState(videoSupported)
  const [batchFormat, setBatchFormat] = useState<BatchFormat>(() =>
    videoSupported() ? "both" : "images",
  )

  // Status text is stored as a translated string at the moment it is set.
  // Refresh the persistent ones when the interface language changes so the
  // panel does not keep a stale Chinese/English sentence.
  useEffect(() => {
    setStatus(
      t("已更新 · {count} 张素材 · {name}", {
        count: shots.length,
        name: t(currentTpl?.name ?? ""),
      }),
    )
    setTplHint(
      currentTpl
        ? t("当前：{name} · {count} 个位置", {
            name: t(currentTpl.name),
            count: currentTpl.count,
          })
        : "",
    )
    setJsonStatus(t("支持 Reeden 主题配置，也支持任意含颜色字段的 JSON。"))
    setTemplateImportStatus(t("仅支持 Reeden 单文件 HTML 模板，请只导入可信来源。"))
    setDraftStatus(t("自动保存已开启"))
    // t is captured from the render for this language; re-run only on change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language])

  const meta: ThemeMeta = { name, description, author, sharer, urlText }
  // An empty theme name means "use the template's own title", both in the
  // rendered poster and in exported file names.
  const exportTitle = name.trim() || templateTitle(currentTpl)

  const previewRef = useRef<HTMLIFrameElement>(null)
  const floatPreviewRef = useRef<HTMLIFrameElement>(null)
  const floatWinRef = useRef<HTMLDivElement>(null)
  const floatBodyRef = useRef<HTMLDivElement>(null)
  const floatHeadRef = useRef<HTMLDivElement>(null)
  const floatGripRef = useRef<HTMLDivElement>(null)
  const [initialFloat] = useState(() => readStored<FloatLayout>(FLOAT_LAYOUT_KEY))
  const floatSize = useRef<{ w: number; h: number } | null>(
    initialFloat ? { w: initialFloat.w, h: initialFloat.h } : null,
  )
  const floatPos = useRef<{ x: number; y: number } | null>(
    initialFloat ? { x: initialFloat.x, y: initialFloat.y } : null,
  )
  const snapLeftRef = useRef<HTMLDivElement>(null)
  const snapRightRef = useRef<HTMLDivElement>(null)
  const pvwrapRef = useRef<HTMLDivElement>(null)
  const pvscrollRef = useRef<HTMLDivElement>(null)
  const pvstageRef = useRef<HTMLDivElement>(null)
  const sideRef = useRef<HTMLDivElement>(null)
  const unifiedFileRef = useRef<HTMLInputElement>(null)
  const folderFileRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const previewRaf = useRef(0)
  const refitTimer = useRef(0)
  const previewFrames = useRef(new Map<string, HTMLIFrameElement>())
  const loadedFrames = useRef(new Set<string>())
  const resizeObserver = useRef<ResizeObserver | null>(null)
  const preloadedFrames = useRef(false)
  const shotSeq = useRef(0)
  const floatTemplate = useRef("")
  const floatLoaded = useRef(false)
  const floatZoom = useRef(initialFloat?.zoom ?? 1)
  const zoomRef = useRef(1)
  const autoFitRef = useRef(true)
  const panRef = useRef({ x: 0, y: 0 })
  // The preview iframe receives pointer events over the canvas. Bridge those
  // into the parent drag handler so dragging works anywhere on the artwork.
  const mainPanRef = useRef<{
    start: (event: PointerEvent) => void
    move: (event: PointerEvent) => void
    end: (event: PointerEvent) => void
  }>({ start: () => {}, move: () => {}, end: () => {} })
  // WindowProxy identity survives srcdoc navigation but its listeners do not,
  // so track the document instead of the window.
  const boundPreviewDocs = useRef(new WeakSet<Document>())
  const floatInnerRef = useRef<HTMLDivElement>(null)
  const shotDrag = useRef<{ from: number; x0: number; y0: number; moved: boolean } | null>(null)
  const shotsRef = useRef(shots)
  shotsRef.current = shots

  const nextId = () => `s${++shotSeq.current}`

  // History captures the editable document state. Transient UI state (zoom,
  // dialogs, export progress) is intentionally excluded.
  function captureSnapshot(): StudioSnapshot {
    return {
      shots: shotsRef.current,
      currentTpl,
      params,
      activePreset,
      colors,
      alpha,
      tone,
      name,
      description,
      author,
      sharer,
      urlText,
    }
  }

  function applySnapshot(snapshot: StudioSnapshot) {
    shotsRef.current = snapshot.shots
    setShots(snapshot.shots)
    setCurrentTpl(snapshot.currentTpl)
    setParams(snapshot.params)
    setActivePreset(snapshot.activePreset)
    setColors(snapshot.colors)
    setAlpha(snapshot.alpha)
    setToneState(snapshot.tone)
    setName(snapshot.name)
    setDescription(snapshot.description)
    setAuthor(snapshot.author)
    setSharer(snapshot.sharer)
    setUrlText(snapshot.urlText)
    setTplHint(
      snapshot.currentTpl
        ? t("当前：{name} · {count} 个位置", {
            name: t(snapshot.currentTpl.name),
            count: snapshot.currentTpl.count,
          })
        : "",
    )
  }

  const history = useHistory<StudioSnapshot>(captureSnapshot, applySnapshot)
  const discreteSeq = useRef(0)
  // Discrete actions (add/remove/template/preset) always get their own history
  // point; only continuous edits share a label so they merge into one gesture.
  function recordDiscrete() {
    history.record(`discrete:${++discreteSeq.current}`)
  }

  // Keep React state and the render-independent ref in one place.
  function commitShots(next: Shot[] | ((current: Shot[]) => Shot[])) {
    const resolved = typeof next === "function" ? next(shotsRef.current) : next
    shotsRef.current = resolved
    setShots(resolved)
  }

  function makePayload(smallScale = false, paramsOverride?: ParamValues, shotsOverride?: Shot[]) {
    const activeParams = paramsOverride ?? params
    const merged = exportFonts.current
      ? { ...activeParams, ...exportFonts.current }
      : activeParams
    return buildPayload({
      shots: shotsOverride ?? shots,
      template: currentTpl,
      params: merged,
      colors,
      tone,
      meta,
      smallScale,
      lang: language,
    })
  }

  // Called once at the start of each export. Builds the payload with the full
  // font, collects every glyph the poster will show, then stores subset fonts
  // for the rest of this run. Failures are non-fatal: export falls back to the
  // original font (still works, just slower on huge CJK fonts).
  async function prepareExportFonts(signal: AbortSignal) {
    exportFonts.current = null
    const fontKeys = Array.from(new Set([
      ...(currentTpl?.params.filter((item) => item.type === "font").map((item) => item.key) ?? []),
      "titleFont",
      "watermarkFontFile",
    ]))
    const hasFont = fontKeys.some(
      (key) => typeof params[key] === "string" && String(params[key]).startsWith("data:"),
    )
    if (!hasFont) return
    try {
      const full = buildPayload({
        shots,
        template: currentTpl,
        params,
        colors,
        tone,
        meta,
        smallScale: false,
        lang: language,
      })
      const text = collectPayloadText(full)
      const subset = await subsetPayloadFonts(full, text, signal, fontKeys)
      if (signal.aborted) return
      const overrides: ParamValues = {}
      for (const key of fontKeys) {
        if (subset.params[key] !== params[key]) overrides[key] = subset.params[key]
      }
      exportFonts.current = overrides
    } catch (e) {
      console.error("[subset] prepare failed:", e)
      exportFonts.current = null
    }
  }

  function contentHeight(frame = previewRef.current) {
    try {
      const doc = frame?.contentDocument
      if (!doc) return 0
      const poster = doc.querySelector<HTMLElement>("[data-reeden-capture]") ?? doc.getElementById("poster") ?? doc.body
      return Math.ceil(poster.getBoundingClientRect().height)
    } catch {
      return 0
    }
  }

  function floatContentHeight(frame: HTMLIFrameElement) {
    try {
      const doc = frame.contentDocument
      const poster = doc?.querySelector<HTMLElement>("[data-reeden-capture]") ?? doc?.getElementById("poster") ?? doc?.body
      const measured = Math.ceil(poster?.getBoundingClientRect().height ?? 0)
      return measured > 40 ? measured : 900
    } catch {
      return 900
    }
  }

  function fitFloat() {
    const frame = floatPreviewRef.current
    const body = floatBodyRef.current
    const inner = floatInnerRef.current
    const win = floatWinRef.current
    if (!frame || !body || !inner || !win) return
    const safe = safeInsets()
    const sized = floatSize.current
    if (!floatBig) {
      if (floatCompact) win.style.width = window.innerWidth <= 820 ? "176px" : "200px"
      else if (sized) win.style.width = `${Math.round(sized.w)}px`
      else if (window.innerWidth <= 820) win.style.width = `${Math.min(240, window.innerWidth - 48)}px`
      else win.style.width = ""
    }
    const boxWidth = Math.max(120, win.clientWidth - 2)
    const baseWidth = canvasWidth()
    const fit = boxWidth / baseWidth
    const scale = fit * floatZoom.current
    const height = floatContentHeight(frame)
    inner.style.width = `${Math.round(baseWidth * scale)}px`
    inner.style.height = `${Math.round(height * scale)}px`
    frame.style.width = `${baseWidth}px`
    frame.style.height = `${height}px`
    frame.style.transform = `scale(${scale})`
    frame.style.transformOrigin = "top left"
    // Keep the window body compact; the inner container drives scrolling.
    // A user-resized body height takes priority over the content-derived cap.
    const visibleHeight = Math.max(200, window.innerHeight - safe.top - safe.bottom)
    if (sized && !floatCompact && !floatBig) {
      body.style.height = `${Math.round(sized.h)}px`
    } else {
      body.style.height = `${Math.min(Math.round(height * scale), Math.round(visibleHeight * 0.7))}px`
    }
  }

  function saveFloatLayout() {
    const win = floatWinRef.current
    if (!win || !floatOpen) return
    const rect = win.getBoundingClientRect()
    const size = floatSize.current
    writeStored(FLOAT_LAYOUT_KEY, {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      w: Math.round(size?.w ?? win.offsetWidth),
      h: Math.round(size?.h ?? (floatBodyRef.current?.offsetHeight ?? win.offsetHeight)),
      zoom: Number(floatZoom.current.toFixed(3)),
    } satisfies FloatLayout)
  }

  function zoomFloatBy(direction: number) {
    const next = clamp(floatZoom.current * (direction > 0 ? 1.15 : 1 / 1.15), 0.3, 4)
    if (Math.abs(next - floatZoom.current) < 0.001) return
    floatZoom.current = next
    fitFloat()
    saveFloatLayout()
  }

  function placeFloat(mode: FloatPlacement) {
    const win = floatWinRef.current
    if (!win) return
    const safe = safeInsets()
    if (window.innerWidth <= 820) {
      win.style.right = `${10 + safe.right}px`
      win.style.left = "auto"
      win.style.top = mode === "compact" ? "auto" : `${76 + safe.top}px`
      win.style.bottom = mode === "compact" ? `${86 + safe.bottom}px` : "auto"
      if (mode === "compact") win.style.width = "176px"
    } else {
      const width = win.offsetWidth || (mode === "compact" ? 200 : 340)
      const gutter = mode === "compact" ? 20 : 28
      win.style.left = `${Math.max(safe.left + 12, window.innerWidth - width - gutter - safe.right)}px`
      win.style.top = `${86 + safe.top}px`
      win.style.right = "auto"
      win.style.bottom = "auto"
    }
    win.style.transform = ""
  }

  function keepFloatInView() {
    const win = floatWinRef.current
    if (!win) return
    const safe = safeInsets()
    const minX = safe.left + 8
    const minY = safe.top + 8
    const maxX = window.innerWidth - safe.right - 8
    const maxY = window.innerHeight - safe.bottom - 8
    const rect = win.getBoundingClientRect()
    if (rect.left < minX) win.style.left = `${minX}px`
    if (rect.top < minY) win.style.top = `${minY}px`
    if (rect.right > maxX) win.style.left = `${maxX - win.offsetWidth}px`
    if (rect.bottom > maxY) win.style.top = `${maxY - win.offsetHeight}px`
  }

  // Render the current payload into the floating iframe whenever its document is ready.
  // Kept independent of the open state so reopening can refresh a still-mounted document.
  function renderFloat() {
    const frame = floatPreviewRef.current
    if (!frame || !floatLoaded.current) return
    if (floatTemplate.current !== (currentTpl?.key ?? "")) return
    try {
      const api = frame.contentWindow as
        | (Window & { ReedenShareTemplate?: { render: (payload: ReturnType<typeof makePayload>) => void } })
        | null
      api?.ReedenShareTemplate?.render(makePayload())
    } catch {
      // Floating preview is best-effort.
    }
  }

  function syncFloat() {
    if (!floatOpen) return
    if (floatTemplate.current !== (currentTpl?.key ?? "")) {
      openFloat(true)
      return
    }
    renderFloat()
  }

  function observePreview(frame = previewRef.current) {
    resizeObserver.current?.disconnect()
    resizeObserver.current = null
    const target = frame?.contentDocument?.getElementById("poster") ?? frame?.contentDocument?.body
    if (!frame || !target) return
    const apply = () => {
      const height = contentHeight(frame)
      if (height > 40 && Math.abs((Number.parseFloat(frame.style.height) || 0) - height) > 1) {
        frame.style.height = `${height}px`
        // Keep the stage's layout box in sync even when the user controls zoom.
        applyStageLayout()
        // Template content can grow (3D stage, long text, new assets). Refit
        // unless the user has taken manual control of zoom.
        if (autoFitRef.current) {
          // 3D/text layouts settle over several frames; refit after the last
          // resize instead of chasing an intermediate height.
          window.clearTimeout(refitTimer.current)
          refitTimer.current = window.setTimeout(() => {
            latestActions.current.fitZoom(false)
          }, 120)
        }
      }
    }
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(apply)
      observer.observe(target)
      resizeObserver.current = observer
    }
    apply()
  }

  function pushPreview() {
    const frame = previewRef.current
    const api = frame?.contentWindow as
      | (Window & { ReedenShareTemplate?: { render: (payload: ReturnType<typeof makePayload>) => void } })
      | null
    if (!api?.ReedenShareTemplate) return
    try {
      api.ReedenShareTemplate.render(makePayload())
      setStatus(
        t("已更新 · {count} 张素材 · {name}", { count: shots.length, name: t(currentTpl?.name ?? "") }),
      )
      observePreview(frame)
    } catch (error) {
      setStatus(t("预览出错：{error}", { error: error instanceof Error ? error.message : String(error) }))
    }
    syncFloat()
  }

  function schedulePreview() {
    if (previewRaf.current) return
    previewRaf.current = requestAnimationFrame(() => {
      previewRaf.current = 0
      pushPreview()
    })
  }

  // CSS `zoom` is implemented differently in WebKit (iOS/iPadOS Safari): a
  // zoomed flex item is not laid out at its scaled size, which leaves a large
  // empty gutter to the right in landscape. Give the stage a real layout size
  // and scale the iframe with a standard transform instead, so every engine
  // computes the same box. Export reads the iframe DOM directly and is
  // unaffected by this transform.
  function applyStageLayout() {
    const stage = pvstageRef.current
    if (!stage) return
    const scale = zoomRef.current
    const height = contentHeight() || 900
    stage.style.width = `${Math.round(canvasWidth() * scale)}px`
    stage.style.height = `${Math.round(height * scale)}px`
    stage.style.transformOrigin = "top left"
    const { x, y } = panRef.current
    stage.style.transform = x || y ? `translate(${x}px, ${y}px)` : ""
    previewFrames.current.forEach((frame) => {
      frame.style.transformOrigin = "top left"
      frame.style.transform = `scale(${scale})`
    })
  }

  function resetStagePan() {
    panRef.current = { x: 0, y: 0 }
    applyStageLayout()
  }

  function setZoom(value: number) {
    const next = clamp(value, 0.25, 2.4)
    zoomRef.current = next
    setZoomValue(next)
    applyStageLayout()
  }

  function zoomBy(direction: number) {
    autoFitRef.current = false
    setZoom(zoomRef.current * (direction > 0 ? 1.1 : 1 / 1.1))
  }

  function fitZoom(resetPan = true, heightOverride?: number) {
    // Fit against the actual scroll box, not the outer <main>: the latter
    // includes the 44px toolbar, which used to make the canvas ~8% too large
    // and clip the bottom of every poster.
    const wrap = pvscrollRef.current ?? pvwrapRef.current
    if (!wrap) return
    autoFitRef.current = true
    const height = heightOverride || contentHeight() || 900
    const style = getComputedStyle(wrap)
    const padX =
      (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0)
    const padY =
      (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0)
    const scale = Math.min(
      (wrap.clientWidth - padX) / canvasWidth(),
      (wrap.clientHeight - padY) / height,
      1.4,
    )
    if (resetPan) resetStagePan()
    setZoom(scale)
  }

  // Zoom buttons are explicit user actions and must not be overridden by the
  // next content-height change.
  function setUserZoom(value: number) {
    autoFitRef.current = false
    setZoom(value)
  }

  // Imported templates ship their own mock payload. Read it from the loaded
  // iframe (rather than eval'ing file text) so we stay aligned with the exact
  // object the template itself created.
  function harvestImportedMock(frame: HTMLIFrameElement, templateKey: string) {
    const imported = templatesRef.current.find((item) => item.key === templateKey && item.imported)
    if (!imported || imported.mock) return
    try {
      const source = (frame.contentWindow as Window & { ReedenShareTemplateMock?: unknown })
        ?.ReedenShareTemplateMock
      if (!source || typeof source !== "object") return
      const data = JSON.parse(JSON.stringify(source)) as Record<string, unknown>
      setTemplates((prev) => prev.map((item) => (item.key === templateKey ? { ...item, mock: data } : item)))
      setCurrentTpl((prev) => (prev?.key === templateKey ? { ...prev, mock: data } : prev))
    } catch {
      // A circular mock is fine to ignore — the template can still render it.
    }
  }

  function ensurePreviewFrame(template: Template) {
    const stage = pvstageRef.current
    if (!stage) return null
    const cached = previewFrames.current.get(template.key)
    if (cached) return cached
    const frame = document.createElement("iframe")
    frame.title = t("留白模板预览")
    frame.className = "preview-shell"
    frame.style.width = `${canvasWidth(template)}px`
    frame.style.height = "900px"
    frame.style.border = "0"
    frame.style.display = "none"
    // Avoid a scrollbar changing the iframe's inner viewport width on WebKit.
    frame.setAttribute("scrolling", "no")
    frame.dataset.templateKey = template.key
    frame.onload = () => {
      loadedFrames.current.add(template.key)
      bindPreviewEvents(frame)
      harvestImportedMock(frame, template.key)
      if (previewRef.current !== frame) return
      latestActions.current.pushPreview()
      observePreview(frame)
      fitZoom()
      preloadTemplates()
    }
    stage.appendChild(frame)
    previewFrames.current.set(template.key, frame)
    frame.srcdoc = template.html
    return frame
  }

  function preloadTemplates() {
    if (preloadedFrames.current) return
    preloadedFrames.current = true
    setTimeout(() => {
      templates.forEach((template) => {
        if (!previewFrames.current.has(template.key)) ensurePreviewFrame(template)
      })
    }, 220)
  }

  function loadPreview(template: Template | null = currentTpl) {
    if (!template) return
    const frame = ensurePreviewFrame(template)
    if (!frame) return
    setStatus(t("正在载入 {name}…", { name: t(template.name) }))
    previewFrames.current.forEach((item, key) => {
      item.style.display = key === template.key ? "block" : "none"
    })
    previewRef.current = frame
    if (loadedFrames.current.has(template.key)) {
      pushPreview()
      observePreview(frame)
      fitZoom()
    }
  }

  function selectTemplate(template: Template) {
    recordDiscrete()
    setCurrentTpl(template)
    setParams({})
    setActivePreset(null)
    setTplHint(t("当前：{name} · {count} 个位置", { name: t(template.name), count: template.count }))
  }

  function registerTemplate(html: string, fileName = "", sourceFolder = "") {
    const parsed = parseTemplateHtml(html, fileName, sourceFolder)
    const existing = templatesRef.current.find((item) => item.key === parsed.key)
    // Re-importing the same HTML should not wipe the user's group or edited mock,
    // but a fresh folder/file source should update the grouping metadata.
    const template: Template = existing
      ? {
          ...existing,
          ...parsed,
          group: existing.group ?? parsed.group,
          mock: existing.mock,
          sourceFile: parsed.sourceFile || existing.sourceFile,
          sourceFolder: parsed.sourceFolder || existing.sourceFolder,
        }
      : parsed
    setTemplates((prev) =>
      existing ? prev.map((item) => (item.key === template.key ? template : item)) : [...prev, template],
    )
    recordDiscrete()
    setCurrentTpl(template)
    setParams({})
    setActivePreset(null)
    setTplHint(t("当前：{name} · {count} 个位置", { name: t(template.name), count: template.count }))
    setTemplateImportStatus(
      t("已载入「{name}」· 类型 {type} · {count} 个参数", {
        name: template.name,
        type: template.type || "themePreview",
        count: template.params.length,
      }),
    )
    notify(t("模板已载入"))
    return template
  }

  async function importTemplateFile(file: File, sourceFolder = "") {
    if (!/\.html?$/i.test(file.name) && file.type !== "text/html") {
      setTemplateImportStatus(t("请选择 .html 模板文件"))
      notify(t("请选择 .html 模板文件"))
      return
    }
    try {
      const html = await file.text()
      if (html.length > 2_000_000) {
        setTemplateImportStatus(t("模板文件过大（上限 2MB）"))
        notify(t("模板文件过大（上限 2MB）"))
        return
      }
      registerTemplate(html, file.name, sourceFolder || templateFolderFromFile(file))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setTemplateImportStatus(t("模板导入失败：{error}", { error: message }))
      notify(t("模板导入失败"))
    }
  }

  function updateTemplateData(data: Record<string, unknown>) {
    if (!currentTpl?.imported) return
    const next: Template = { ...currentTpl, mock: data }
    setTemplates((prev) => prev.map((item) => (item.key === next.key ? next : item)))
    setCurrentTpl(next)
    setTemplateImportStatus(t("模板数据已更新"))
    notify(t("模板数据已更新"))
  }

  function setTemplateGroup(key: string, group: string) {
    const clean = group.trim() || t("导入模板")
    const target = templatesRef.current.find((item) => item.key === key && item.imported)
    if (!target || target.group === clean) return
    const next: Template = { ...target, group: clean }
    const list = templatesRef.current.map((item) => (item.key === key ? next : item))
    templatesRef.current = list
    setTemplates(list)
    if (currentTplRef.current?.key === key) setCurrentTpl(next)
    setTemplateImportStatus(t("模板分组已更新"))
  }

  function moveTemplate(key: string, direction: "up" | "down") {
    const list = templatesRef.current
    const target = list.find((item) => item.key === key && item.imported)
    if (!target) return
    const group = templateGroup(target)
    const members = list.filter((item) => item.imported && templateGroup(item) === group)
    const index = members.findIndex((item) => item.key === key)
    const nextIndex = index + (direction === "up" ? -1 : 1)
    if (index < 0 || nextIndex < 0 || nextIndex >= members.length) return

    recordDiscrete()
    const ordered = [...members]
    ;[ordered[index], ordered[nextIndex]] = [ordered[nextIndex], ordered[index]]
    let cursor = 0
    const next = list.map((item) =>
      item.imported && templateGroup(item) === group ? ordered[cursor++] : item,
    )
    templatesRef.current = next
    setTemplates(next)
    setTemplateImportStatus(t("模板顺序已更新"))
  }

  function moveTemplateToGroup(key: string, group: string) {
    const clean = group.trim() || t("导入模板")
    const list = templatesRef.current
    const target = list.find((item) => item.key === key && item.imported)
    if (!target) return

    recordDiscrete()
    const moved: Template = { ...target, group: clean }
    const rest = list.filter((item) => item.key !== key)
    const builtIns = rest.filter((item) => !item.imported)
    const imported = rest.filter((item) => item.imported)
    const positions = imported
      .map((item, index) => (templateGroup(item) === clean ? index : -1))
      .filter((index) => index >= 0)
    const insertAt = positions.length ? positions[positions.length - 1] + 1 : imported.length
    imported.splice(insertAt, 0, moved)
    const next = [...builtIns, ...imported]
    templatesRef.current = next
    setTemplates(next)
    if (currentTplRef.current?.key === key) setCurrentTpl(moved)
    setTemplateImportStatus(t("模板已移动到「{group}」", { group: clean }))
  }

  function deleteTemplate(key: string) {
    const target = templatesRef.current.find((item) => item.key === key && item.imported)
    if (!target) return
    recordDiscrete()
    const remaining = templatesRef.current.filter((item) => item.key !== key)
    templatesRef.current = remaining
    setTemplates(remaining)

    // Drop the cached iframe so a deleted template cannot keep rendering or
    // linger in the hidden preview stack.
    const frame = previewFrames.current.get(key)
    if (frame) {
      if (previewRef.current === frame) previewRef.current = null
      frame.remove()
      previewFrames.current.delete(key)
      loadedFrames.current.delete(key)
    }

    if (currentTplRef.current?.key === key) {
      const fallback = DEFAULT_TEMPLATE ?? remaining[0] ?? null
      setCurrentTpl(fallback)
      setParams({})
      setActivePreset(null)
      setTplHint(
        fallback
          ? t("当前：{name} · {count} 个位置", { name: t(fallback.name), count: fallback.count })
          : "",
      )
    }
    setTemplateImportStatus(t("已删除「{name}」", { name: target.name }))
    notify(t("模板已删除"))
  }

  function deleteTemplateGroup(group: string) {
    const list = templatesRef.current
    const keys = new Set(
      list.filter((item) => item.imported && templateGroup(item) === group).map((item) => item.key),
    )
    if (!keys.size) return
    recordDiscrete()
    const remaining = list.filter((item) => !keys.has(item.key))
    templatesRef.current = remaining
    setTemplates(remaining)

    keys.forEach((key) => {
      const frame = previewFrames.current.get(key)
      if (frame) {
        if (previewRef.current === frame) previewRef.current = null
        frame.remove()
        previewFrames.current.delete(key)
        loadedFrames.current.delete(key)
      }
    })

    if (currentTplRef.current && keys.has(currentTplRef.current.key)) {
      const fallback = DEFAULT_TEMPLATE ?? remaining[0] ?? null
      setCurrentTpl(fallback)
      setParams({})
      setActivePreset(null)
      setTplHint(
        fallback
          ? t("当前：{name} · {count} 个位置", { name: t(fallback.name), count: fallback.count })
          : "",
      )
    }
    setTemplateImportStatus(t("已删除分组「{group}」", { group }))
    notify(t("分组已删除"))
  }

  function autoGroupTemplates(mode: TemplateGroupMode = "builtin") {
    const list = templatesRef.current
    const imported = list.filter((item) => item.imported)
    if (!imported.length) {
      notify(t("还没有导入模板"))
      return
    }
    recordDiscrete()
    const grouped = imported.map((item) => ({ ...item, group: templateGroupByMode(item, mode) }))
    const names = Array.from(new Set(grouped.map((item) => item.group || ""))).sort((a, b) =>
      a.localeCompare(b, language === "zh" ? "zh-Hans-CN" : "en"),
    )
    const ordered = names.flatMap((name) => grouped.filter((item) => item.group === name))
    const next = [...list.filter((item) => !item.imported), ...ordered]
    templatesRef.current = next
    setTemplates(next)
    if (currentTplRef.current) {
      const updated = next.find((item) => item.key === currentTplRef.current?.key)
      if (updated) setCurrentTpl(updated)
    }
    const message =
      mode === "folder"
        ? t("按导入文件夹名称分为 {count} 组", { count: names.length })
        : mode === "file"
          ? t("按文件名分为 {count} 组", { count: names.length })
          : t("已按内置名称分为 {count} 组", { count: names.length })
    setTemplateImportStatus(message)
    notify(message)
  }

  function autoPickTemplate(list: Shot[] = shots) {
    if (!list.length) return
    const target = templates.find((item) => item.count >= list.length) ?? templates[templates.length - 1]
    if (target && target.key !== currentTpl?.key) {
      setCurrentTpl(target)
      setParams({})
      setActivePreset(null)
      setTplHint(
      t("当前：{name} · 已按 {count} 张自动选择", { name: t(target.name), count: list.length }),
    )
    }
  }

  function bindFloatWheel(frame: HTMLIFrameElement) {
    try {
      const target = frame.contentWindow as Window | null
      if (!target) return
      // iOS Safari can claim a touch gesture inside the iframe before the
      // parent sees pointermove; disable native gestures on the frame too.
      if (frame.contentDocument) frame.contentDocument.documentElement.style.touchAction = "none"
      target.addEventListener("wheel", (event: WheelEvent) => {
        event.preventDefault()
        zoomFloatBy(event.deltaY < 0 ? 1 : -1)
      }, { passive: false })
    } catch {
      // Cross-origin frames cannot be wired for wheel zoom.
    }
  }

  function bindPreviewEvents(frame: HTMLIFrameElement) {
    try {
      const target = frame.contentWindow as Window | null
      const doc = frame.contentDocument
      if (!target || !doc || boundPreviewDocs.current.has(doc)) return
      boundPreviewDocs.current.add(doc)
      // Keep touch drags inside the canvas instead of letting iOS scroll/zoom.
      doc.documentElement.style.touchAction = "none"
      if (doc.body) doc.body.style.touchAction = "none"
      target.addEventListener("wheel", (event: WheelEvent) => {
        event.preventDefault()
        latestActions.current.zoomBy(event.deltaY < 0 ? 1 : -1)
      }, { passive: false })
      // Coordinates are frame-local; the drag handler only uses deltas, so
      // no conversion is needed even while the parent stage is moving.
      target.addEventListener("pointerdown", (event) => mainPanRef.current.start(event))
      target.addEventListener("pointermove", (event) => mainPanRef.current.move(event))
      target.addEventListener("pointerup", (event) => mainPanRef.current.end(event))
      target.addEventListener("pointercancel", (event) => mainPanRef.current.end(event))
    } catch {
      // Cross-origin frames cannot be wired for wheel/drag events.
    }
  }

  function openFloat(force = false) {
    const win = floatWinRef.current
    const frame = floatPreviewRef.current
    if (!win || !frame || !currentTpl) return
    if (floatOpen && !force) {
      setFloatOpen(false)
      return
    }
    if (floatTemplate.current !== currentTpl.key) {
      floatTemplate.current = currentTpl.key
      floatLoaded.current = false
      floatZoom.current = 1
      frame.style.width = `${canvasWidth(currentTpl)}px`
      frame.srcdoc = currentTpl.html
      frame.onload = () => {
        frame.onload = null
        floatLoaded.current = true
        bindFloatWheel(frame)
        fitFloat()
        keepFloatInView()
        renderFloat()
      }
    }
    win.style.display = ""
    setFloatOpen(true)
    setFloatMin(false)
    requestAnimationFrame(() => {
      placeFloat("open")
      // Restore the last dragged position on desktop; keepFloatInView below
      // clamps it back on screen if the viewport has shrunk since last time.
      const saved = floatPos.current
      if (saved && window.innerWidth > 820 && !floatBig && !floatCompact) {
        win.style.left = `${saved.x}px`
        win.style.top = `${saved.y}px`
        win.style.right = "auto"
        win.style.bottom = "auto"
      }
      fitFloat()
      keepFloatInView()
      // Reopened on the same template: the document is still mounted, so repaint
      // with the current payload to stay in sync with the main preview.
      if (floatLoaded.current) renderFloat()
    })
  }

  function setPeek(on: boolean) {
    if (!floatWinRef.current || !floatOpen) return
    const was = floatCompact
    setFloatCompact(on)
    if (on) setFloatBig(false)
    placeFloat(on ? "compact" : "normal")
    if (was !== on) setTimeout(fitFloat, 80)
  }

  function refreshPeek() {
    if (!currentTpl) return
    // On phones the full preview tab replaces the need for a floating window;
    // only close one that is already open instead of covering the settings panel.
    if (window.innerWidth <= 820 && mobileTab === "main" && floatOpen) {
      setFloatOpen(false)
    }
  }

  function openSection(section: string) {
    setAccordionValue((current) =>
      current.includes(section) ? current : [...current, section],
    )
  }

  // The header keeps a single "导出" shortcut: expand the export panel, switch
  // mobile back to settings, and scroll it into view. All real export actions
  // live in one place so progress/status are always visible.
  function focusExport() {
    setMobileTab("side")
    openSection("export")
    window.setTimeout(() => {
      document.querySelector("[data-export-panel]")?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      })
    }, 140)
  }

  // Annotate each shot with measured brightness so the asset cards can show a
  // light/dark badge. This never changes the user's paper tone — palette and
  // tone are the user's decisions, made explicitly via the controls.
  function annotateShots(list: Shot[]) {
    if (!list.length) return
    const used = list.slice(0, currentTpl?.count ?? 6)
    Promise.all(
      used.map(async (shot) => {
        const brightness = await imageBrightness(shot.data)
        return { id: shot.id, brightness, isDark: brightness < 0.42 }
      }),
    ).then((analyzed) => {
      const byId = new Map(analyzed.map((item) => [item.id, item]))
      commitShots((current) =>
        current.map((shot) => {
          const match = byId.get(shot.id)
          return match ? { ...shot, brightness: match.brightness, isDark: match.isDark } : shot
        }),
      )
    })
  }

  function applyTone(next: Tone) {
    recordDiscrete()
    // The palette is the user's data; switching paper tone only changes how the
    // payload renders it. Colour chips must not drift when toggling back and forth.
    setToneState(next)
  }

  function autoPalette() {
    const source = shotsRef.current
    if (!source.length) {
      notify(t("先添加素材"))
      return
    }
    const limit = currentTpl?.count ?? 6
    notify(
      t("正在分析 {count} 张素材…", { count: Math.min(source.length, limit) }),
    )
    analyzeShots(source, limit).then((result) => {
      if (!result) {
        notify(t("没有可分析的素材"))
        return
      }
      recordDiscrete()
      const derived = deriveAutoPalette(result)
      setColors(derived.colors)
      setToneState(derived.tone)
      setColorStatus(t("{count} 色", { count: Math.min(source.length, limit) }))
      annotateShots(source)
      notify(
        result.voted
          ? t("已按 {count} 张素材取色", { count: Math.min(source.length, limit) })
          : t("素材偏灰，已生成中性配色"),
      )
    })
  }

  function applyJson(raw: string) {
    if (!raw.trim()) {
      setJsonStatus(t("还没有内容可以应用"))
      return false
    }
    try {
      const result = analyzeThemeJson(JSON.parse(raw), colors)
      recordDiscrete()
      let nextColors = result.colors
      let nextTone = tone
      if (result.mode) {
        nextTone = result.mode
        nextColors = setToneFromMode(nextColors, result.mode)
      }
      nextColors = composeTranslucent(nextColors, result.translucent)
      setColors(nextColors)
      setAlpha(result.alpha)
      setToneState(nextTone)
      setDescription(result.meta.description)
      setName(result.meta.name)
      if (result.meta.author) setAuthor(result.meta.author)
      if (result.meta.sharer) setSharer(result.meta.sharer)
      setJsonStatus(
        t("已识别 {count} 个颜色{mode}", {
          count: result.found,
          mode: result.mode
            ? t(" · {mode}模式", { mode: t(result.mode === "dark" ? "深色" : "浅色") })
            : "",
        }),
      )
      setColorStatus(t("{count} 色", { count: result.found }))
      notify(t("配色已应用"))
      return true
    } catch (error) {
      setJsonStatus(t("无法解析：{error}", { error: error instanceof Error ? error.message : String(error) }))
      return false
    }
  }

  function updateColor(key: ColorKey, hex: string, nextAlpha: number) {
    history.record(`color:${key}`)
    setColors((current) => ({ ...current, [key]: hex }))
    setAlpha((current) => ({ ...current, [key]: nextAlpha }))
  }

  function resetColors() {
    recordDiscrete()
    setColors({ ...(tone === "dark" ? DARK_COLORS : LIGHT_COLORS) })
    setAlpha({})
    setColorStatus(t("默认"))
  }

  async function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((file) => /^image\//.test(file.type))
    if (!files.length) {
      notify(t("请选择图片文件"))
      return
    }
    const loaded: Shot[] = []
    const errors: string[] = []
    for (const file of files) {
      const result = await readImage(file, nextId)
      if (result.shot) loaded.push(result.shot)
      if (result.error) errors.push(result.error)
    }
    if (!loaded.length) {
      notify(errors[0] ?? t("没有可用的图片"))
      return
    }
    if (errors.length) notify(errors[0])
    recordDiscrete()
    const next = [...shotsRef.current, ...loaded]
    commitShots(next)
    autoPickTemplate(next)
    // Adding assets never rewrites the user's palette or paper tone. Keep the
    // action explicit: offer color extraction as a hint the user can act on.
    notify(t("已加入 {count} 张 · 可在「配色」按素材取色", { count: loaded.length }))
  }

  function clearShots() {
    if (!shots.length) return
    recordDiscrete()
    commitShots([])
  }

  function removeShot(index: number) {
    recordDiscrete()
    const next = shots.filter((_, itemIndex) => itemIndex !== index)
    commitShots(next)
    autoPickTemplate(next)
  }

  function moveShot(index: number, offset: number) {
    const target = index + offset
    if (target < 0 || target >= shots.length) return
    recordDiscrete()
    const next = [...shots]
    ;[next[index], next[target]] = [next[target], next[index]]
    commitShots(next)
  }

  function updateCaption(index: number, caption: string) {
    history.record(`caption:${index}`)
    const next = shots.map((shot, itemIndex) =>
      itemIndex === index ? { ...shot, caption } : shot,
    )
    commitShots(next)
  }

  function updatePage(index: number, page: string) {
    history.record(`page:${index}`)
    const next = shots.map((shot, itemIndex) =>
      itemIndex === index ? { ...shot, page, pageSet: true, caption: "" } : shot,
    )
    commitShots(next)
  }

  function onShotPointerDown(event: ReactPointerEvent<HTMLDivElement>, index: number) {
    const target = event.target as HTMLElement
    if (target.closest("button") || target.tagName === "INPUT") return
    shotDrag.current = { from: index, x0: event.clientX, y0: event.clientY, moved: false }
    ;(event.currentTarget as HTMLElement).dataset.dragging = "false"
    ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  }

  function onShotPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = shotDrag.current
    if (!drag) return
    if (!drag.moved && Math.abs(event.clientX - drag.x0) < 6 && Math.abs(event.clientY - drag.y0) < 6) return
    drag.moved = true
    event.preventDefault()
    document.querySelectorAll<HTMLElement>(".shot-card[data-dragging='true']").forEach((item) => {
      item.dataset.dragging = "false"
    })
    const source = document.querySelector(`.shot-card[data-index='${drag.from}']`) as HTMLElement | null
    if (source) source.dataset.dragging = "true"
    document.querySelectorAll(".shot-card[data-over='true']").forEach((item) => {
      item.removeAttribute("data-over")
    })
    const over = document.elementFromPoint(event.clientX, event.clientY)?.closest(".shot-card") as HTMLElement | null
    if (over && Number(over.dataset.index) !== drag.from) over.dataset.over = "true"
  }

  function onShotPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = shotDrag.current
    shotDrag.current = null
    document.querySelectorAll<HTMLElement>(".shot-card[data-dragging='true']").forEach((item) => {
      item.dataset.dragging = "false"
    })
    if (!drag?.moved) return
    document.querySelectorAll(".shot-card[data-over='true']").forEach((item) => {
      item.removeAttribute("data-over")
    })
    const over = document.elementFromPoint(event.clientX, event.clientY)?.closest(".shot-card") as HTMLElement | null
    if (!over) return
    const to = Number(over.dataset.index)
    if (Number.isNaN(to) || to === drag.from) return
    recordDiscrete()
    const next = [...shots]
    const [moved] = next.splice(drag.from, 1)
    next.splice(to, 0, moved)
    commitShots(next)
    notify(t("顺序已更新"))
  }

  function setParamValue(key: string, value: string | number | boolean) {
    history.record(`param:${key}`)
    setParams((current) => ({ ...current, [key]: value }))
    setActivePreset(null)
  }

  function applyPreset(key: string) {
    const preset = STYLE_PRESETS.find((item) => item.key === key)
    if (!preset) return
    recordDiscrete()
    // Replace rather than merge: keys absent from the preset fall back to the
    // template defaults, so switching between presets never leaves stale values.
    setParams({ ...preset.values })
    setActivePreset(key)
    notify(t("已应用「{name}」风格", { name: t(preset.name) }))
  }

  function saveProject() {
    const data = projectJson({
      templateKey: currentTpl?.key ?? null,
      templateHtml: currentTpl?.imported ? currentTpl.html : undefined,
      templateData: currentTpl?.imported ? currentTpl.mock : undefined,
      importedTemplates: templatesRef.current,
      params,
      colors,
      meta,
      tone,
      shots,
    })
    downloadBlob(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      exportName(exportTitle, t(" 项目.json")),
    )
    setProjStatus(t("已保存"))
  }

  // Shared by manual project import and draft restore so both paths apply
  // every document field consistently and refresh the preview via state.
  function applyLoadedProject(loaded: LoadedProject, originLabel: string) {
    commitShots(loaded.shots)
    setColors(loaded.colors)
    setParams(loaded.params)
    setActivePreset(null)
    setToneState(loaded.tone)
    setName(loaded.meta.name)
    setDescription(loaded.meta.description)
    setAuthor(loaded.meta.author)
    setSharer(loaded.meta.sharer)
    setUrlText(loaded.meta.urlText)

    // Projects/drafts carry every imported template so groups and deletions
    // survive reloads; older files only embed the active template.
    let available = templatesRef.current
    const restored: Template[] = []
    for (const record of loaded.importedTemplates ?? []) {
      try {
        const parsed = parseTemplateHtml(record.html, record.sourceFile ?? "", record.sourceFolder ?? "")
        restored.push({
          ...parsed,
          group: record.group || parsed.group,
          mock: record.mock,
        })
      } catch {
        // Skip an unusable embedded template and keep the rest of the project.
      }
    }
    if (loaded.templateHtml) {
      try {
        const parsed = parseTemplateHtml(loaded.templateHtml)
        if (!restored.some((item) => item.key === parsed.key)) restored.push(parsed)
      } catch {
        // Older files may carry a broken template; built-ins remain available.
      }
    }
    if (loaded.templateData && loaded.templateKey) {
      const index = restored.findIndex((item) => item.key === loaded.templateKey)
      if (index >= 0) restored[index] = { ...restored[index], mock: loaded.templateData }
    }
    if (restored.length) {
      const restoredKeys = new Set(restored.map((item) => item.key))
      available = [
        ...available.filter((item) => !(item.imported && restoredKeys.has(item.key))),
        ...restored,
      ]
      templatesRef.current = available
      setTemplates(available)
    }

    let target =
      available.find((item) => item.key === loaded.templateKey) ??
      available.find((item) => item.count >= loaded.shots.length) ??
      available[0]
    if (loaded.templateData && target?.imported) {
      target = { ...target, mock: loaded.templateData }
      const resolved = target
      available = available.map((item) => (item.key === resolved.key ? resolved : item))
      templatesRef.current = available
      setTemplates(available)
    }
    setCurrentTpl(target)
    setTplHint(t("当前：{name} · {hint}", { name: t(target.name), hint: t(originLabel) }))
    setProjStatus(originLabel)
  }

  async function loadProjectFile(file: File) {
    try {
      const loaded = loadProject(JSON.parse(await file.text()), nextId)
      recordDiscrete()
      applyLoadedProject(loaded, t("项目已载入"))
      setProjectOpen(false)
      notify(t("项目已载入"))
    } catch (error) {
      setProjStatus(t("载入失败：{error}", { error: error instanceof Error ? error.message : String(error) }))
    }
  }

  // One file picker for the whole studio. Files are routed to the panel that
  // owns them, so mixed batches can be dropped in without choosing a category.
  async function importFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    if (!files.length) return

    const projects: File[] = []
    const templates: File[] = []
    const templateFolders = new Map<File, string>()
    const images: File[] = []
    const fonts: File[] = []
    const colors: string[] = []
    const unknown: string[] = []

    for (const file of files) {
      const name = file.name.toLowerCase()
      if (/^image\//.test(file.type) || /\.(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i.test(name)) {
        images.push(file)
      } else if (/\.html?$/.test(name) || file.type === "text/html") {
        templates.push(file)
        templateFolders.set(file, templateFolderFromFile(file))
      } else if (/\.(ttf|otf|woff2?)$/.test(name) || /font\//.test(file.type)) {
        fonts.push(file)
      } else if (/\.(json|txt)$/.test(name) || file.type === "application/json") {
        const text = await file.text()
        let parsed: unknown = null
        try {
          parsed = JSON.parse(text)
        } catch {
          parsed = null
        }
        const isProject =
          !!parsed &&
          typeof parsed === "object" &&
          !Array.isArray(parsed) &&
          ((parsed as Record<string, unknown>).app === "liubai-screenshot-studio" ||
            ("shots" in parsed && "params" in parsed))
        if (isProject) projects.push(file)
        else colors.push(text)
      } else {
        unknown.push(file.name)
      }
    }

    const sections = new Set<string>()
    let importedCount = 0

    // Project files restore the whole document, so load them first; any other
    // files in the same batch then layer on top of that restored state.
    for (const file of projects) {
      await loadProjectFile(file)
      importedCount += 1
    }
    for (const file of templates) {
      await importTemplateFile(file, templateFolders.get(file))
      importedCount += 1
    }
    if (templates.length) sections.add("templates")
    if (images.length) {
      await addFiles(images)
      importedCount += images.length
      sections.add("assets")
    }
    for (const file of fonts) {
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () =>
            typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("read failed"))
          reader.onerror = () => reject(reader.error ?? new Error("read failed"))
          reader.readAsDataURL(file)
        })
        const declared = currentTplRef.current?.params ?? []
        const key =
          declared.find((item) => item.type === "font" && item.key === "titleFont")?.key ??
          declared.find((item) => item.type === "font")?.key ??
          "titleFont"
        setParamValue(key, dataUrl)
        importedCount += 1
        sections.add("params")
      } catch {
        notify(t("字体读取失败"))
      }
    }
    for (const text of colors) {
      // Keep the advanced JSON box in sync so users can see and re-apply what
      // the unified import just loaded.
      setJsonRaw(text)
      if (applyJson(text)) {
        importedCount += 1
        sections.add("color")
      }
    }

    sections.forEach((section) => {
      setMobileTab("side")
      openSection(section)
    })

    if (unknown.length) {
      notify(t("未识别文件：{names}", { names: unknown.slice(0, 3).join("、") }))
    }
    if (importedCount) {
      const message = t("已导入 {count} 个文件，并按类型放入对应面板", { count: importedCount })
      setStatus(message)
      notify(message)
    } else if (!unknown.length) {
      notify(t("没有可导入的文件"))
    }
  }

  async function clearDraftNow() {
    await clearDraft()
    setDraftStatus(t("草稿已清空 · 新改动会自动保存"))
    notify(t("草稿已清空"))
  }

  // 全部重置：把可编辑文档恢复到初始状态，同时清掉本机草稿，避免刷新后旧内容回灌。
  async function resetAll() {
    recordDiscrete()
    commitShots([])
    templatesRef.current = TEMPLATES
    setTemplates(TEMPLATES)
    setCurrentTpl(DEFAULT_TEMPLATE)
    setTplHint(
      DEFAULT_TEMPLATE
        ? t("当前：{name} · {count} 个位置", { name: t(DEFAULT_TEMPLATE.name), count: DEFAULT_TEMPLATE.count })
        : "",
    )
    setParams({})
    setActivePreset(null)
    setColors({ ...LIGHT_COLORS })
    setAlpha({})
    setToneState("light")
    setName("")
    setDescription("")
    setAuthor("")
    setSharer("")
    setUrlText("")
    setZoomValue(1)
    setColorStatus(t("默认"))
    setProjStatus("")
    setJsonRaw("")
    setJsonStatus(t("支持 Reeden 主题配置，也支持任意含颜色字段的 JSON。"))
    await clearDraft()
    setDraftStatus(t("已全部重置 · 新改动会自动保存"))
    notify(t("已全部重置"))
  }

  function editName(value: string) {
    history.record("text:name")
    setName(value)
  }

  function editDescription(value: string) {
    history.record("text:description")
    setDescription(value)
  }

  function editAuthor(value: string) {
    history.record("text:author")
    setAuthor(value)
  }

  function editSharer(value: string) {
    history.record("text:sharer")
    setSharer(value)
  }

  function editUrlText(value: string) {
    history.record("text:urlText")
    setUrlText(value)
  }

  function exportErrorMessage(error: unknown, prefix: string) {
    if (error instanceof ExportCancelled) return t("已取消导出")
    const message = error instanceof Error ? error.message : String(error)
    return `${prefix}：${message}`
  }

  function beginExport() {
    exportAbort.current?.abort()
    exportAbort.current = new AbortController()
    openSection("export")
    setExporting(true)
    setProgressVisible(true)
    setProgress(0)
    return exportAbort.current.signal
  }

  function endExport() {
    exportAbort.current = null
    exportFonts.current = null
    setExporting(false)
    setTimeout(() => setProgressVisible(false), 900)
  }

  function cancelExport() {
    if (!exportAbort.current) return
    exportAbort.current.abort()
    setExportStatus(t("正在取消…"))
  }

  async function runExportPng() {
    // The progress bar and status live in the Export accordion. Reveal it whenever
    // export starts from the top bar, otherwise the run looks like a silent hang.
    const signal = beginExport()
    try {
      await prepareExportFonts(signal)
      await exportPng({
        preview: previewRef.current,
        templateKey: currentTpl?.key ?? "",
        title: exportTitle,
        targetWidth: pngWidth,
        renderNow: pushPreview,
        hasShots: shots.length > 0,
        setProgress,
        setStatus: setExportStatus,
        toast: notify,
        signal,
      })
    } catch (error) {
      setExportStatus(exportErrorMessage(error, t("导出失败")))
      if (!(error instanceof ExportCancelled)) notify(t("PNG 导出失败"))
    } finally {
      endExport()
    }
  }

  async function runBatchExport() {
    if (!currentTpl) {
      notify(t("先选择模板"))
      return
    }
    if (!shots.length) {
      notify(t("先添加素材"))
      return
    }
    const includePng = batchFormat === "images" || batchFormat === "both"
    const includeVideo = batchFormat === "videos" || batchFormat === "both"
    if (includeVideo && !videoAvailable) {
      setExportStatus(t("此浏览器不支持视频录制，请把「批量内容」改为仅 PNG 图片。"))
      notify(t("不支持视频录制，请用 PNG"))
      return
    }
    if (includeVideo) {
      const api = previewRef.current?.contentWindow as
        | (Window & { Reeden?: { seekAnimation?: (progress: number) => void } })
        | null
      if (!api?.Reeden?.seekAnimation) {
        setExportStatus(t("当前模板没有可动的时间轴，请把「批量内容」改为仅 PNG 图片。"))
        notify(t("当前模板不支持视频"))
        return
      }
    }
    const signal = beginExport()
    await prepareExportFonts(signal)
    const size = Math.max(1, currentTpl.count)
    const groups: Shot[][] = []
    for (let i = 0; i < shots.length; i += size) groups.push(shots.slice(i, i + size))
    // Video exports force the 3D stage in the payload only; the user's own
    // parameters and preview are restored once the batch finishes.
    const videoPayload = (small: boolean, used: Shot[]) =>
      makePayload(small, { ...params, enable3D: true }, used)
    try {
      await exportBatchZip({
        preview: previewRef.current,
        template: currentTpl,
        groups,
        title: exportTitle,
        targetWidth: pngWidth,
        includePng,
        includeVideo,
        duration: videoDuration,
        fps: videoFps,
        quality: videoQuality,
        buildVideoPayload: videoPayload,
        renderGroup: (group) => {
          const frame = previewRef.current
          const api = frame?.contentWindow as
            | (Window & { ReedenShareTemplate?: { render: (payload: StudioPayload) => void } })
            | null
          if (!api?.ReedenShareTemplate) return
          const activeParams = exportFonts.current
            ? { ...params, ...exportFonts.current }
            : params
          const payload = buildPayload({
            shots: group,
            template: currentTpl,
            params: activeParams,
            colors,
            tone,
            meta,
            lang: language,
          })
          api.ReedenShareTemplate.render(payload)
        },
        restore: () => schedulePreview(),
        setProgress,
        setStatus: setExportStatus,
        toast: notify,
        signal,
      })
    } catch (error) {
      setExportStatus(exportErrorMessage(error, t("批量导出失败")))
      if (!(error instanceof ExportCancelled)) notify(t("批量导出失败"))
    } finally {
      endExport()
      schedulePreview()
    }
  }

  async function runExportVideo() {
    if (!currentTpl) {
      notify(t("先选择模板"))
      return
    }
    if (!videoAvailable) {
      setExportStatus(t("此浏览器不支持视频录制。可改用「PNG 图片」导出。"))
      notify(t("不支持视频录制，请用 PNG"))
      return
    }
    const signal = beginExport()
    try {
      await prepareExportFonts(signal)
      // Video needs the 3D stage for seekAnimation to be active. Enable it in the
      // export payload only, so recording works without a hidden manual switch and
      // the user's own parameters stay untouched.
      const videoPayload = (small: boolean, used: Shot[]) =>
        makePayload(small, { ...params, enable3D: true }, used)
      await exportVideo({
        preview: previewRef.current,
        template: currentTpl,
        shots: shotsRef.current,
        title: exportTitle,
        duration: videoDuration,
        fps: videoFps,
        quality: videoQuality,
        buildPayload: videoPayload,
        setProgress,
        setStatus: setExportStatus,
        toast: notify,
        signal,
      })
    } catch (error) {
      setExportStatus(exportErrorMessage(error, t("导出失败")))
      if (!(error instanceof ExportCancelled)) notify(t("视频导出失败"))
    } finally {
      endExport()
      // Export rendered a temporary 3D payload; restore the user's real preview.
      schedulePreview()
    }
  }

  function onAccordionChange(value: string | string[] | null) {
    setAccordionValue(Array.isArray(value) ? value : value ? [value] : [])
  }

  const latestActions = useRef({
    fitFloat, refreshPeek, syncFloat, renderFloat, fitZoom, pushPreview, zoomBy, zoomFloatBy, saveFloatLayout,
    undo: () => false as boolean,
    redo: () => false as boolean,
  })
  latestActions.current = {
    fitFloat, refreshPeek, syncFloat, renderFloat, fitZoom, pushPreview, zoomBy, zoomFloatBy, saveFloatLayout,
    undo: () => {
      const done = history.undo()
      if (done) notify(t("已撤销"))
      return done
    },
    redo: () => {
      const done = history.redo()
      if (done) notify(t("已重做"))
      return done
    },
  }

  useEffect(() => {
    writeStored(ACCORDION_KEY, accordionValue)
  }, [accordionValue])

  useEffect(() => {
    if (currentTpl) loadPreview(currentTpl)
    // Reload only when the selected template identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTpl?.key])

  // Render after React commits the latest values; rAF coalesces bursts into one frame.
  useEffect(() => {
    if (currentTpl) schedulePreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTpl, shots, params, colors, tone, name, description, author, sharer, urlText, language])

  // Autosave: restore once on mount, then persist debounced edits. The guard
  // prevents the empty initial state from overwriting a stored draft before
  // the async read finishes.
  const draftBooted = useRef(false)
  const draftTimer = useRef(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const draft = await loadDraft()
      if (cancelled) return
      draftBooted.current = true
      if (draft) {
        try {
          applyLoadedProject(loadProject(draft, nextId), t("草稿已恢复"))
          setDraftStatus(t("草稿已恢复 · 改动会自动保存"))
          notify(t("已恢复上次草稿"))
        } catch {
          setDraftStatus(t("草稿损坏，已忽略 · 改动会自动保存"))
        }
      } else {
        setDraftStatus(t("自动保存已开启"))
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!draftBooted.current) return
    window.clearTimeout(draftTimer.current)
    setDraftStatus(t("正在保存草稿…"))
    draftTimer.current = window.setTimeout(() => {
      const data = projectJson({
        templateKey: currentTpl?.key ?? null,
        templateHtml: currentTpl?.imported ? currentTpl.html : undefined,
        templateData: currentTpl?.imported ? currentTpl.mock : undefined,
        importedTemplates: templatesRef.current,
        params,
        colors,
        meta,
        tone,
        shots,
      })
      void saveDraft(data)
        .then(() => {
          const time = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
          setDraftStatus(t("草稿已保存 {time}", { time }))
        })
        .catch(() => setDraftStatus(t("草稿保存失败 · 请用项目文件保存")))
    }, 900)
    return () => window.clearTimeout(draftTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, currentTpl, shots, params, colors, tone, name, description, author, sharer, urlText, language])

  // Re-fit the floating preview when its window mode changes.
  useEffect(() => {
    if (!floatOpen) return
    const id = requestAnimationFrame(() => {
      if (!floatBig) placeFloat(floatCompact ? "compact" : "normal")
      latestActions.current.fitFloat()
    })
    return () => cancelAnimationFrame(id)
  }, [floatOpen, floatBig, floatCompact, floatMin])

  // Boot once: wire global interactions and check browser capabilities.
  useEffect(() => {
    if (!videoAvailable) {
      setExportStatus(t("提示：当前浏览器不支持视频录制，PNG 导出不受影响。"))
    }

    const head = floatHeadRef.current
    const win = floatWinRef.current
    let dragging = false
    let offsetX = 0
    let offsetY = 0

    const point = (event: PointerEvent | TouchEvent) => {
      if ("touches" in event && event.touches[0]) {
        return { x: event.touches[0].clientX, y: event.touches[0].clientY }
      }
      if ("changedTouches" in event && event.changedTouches[0]) {
        return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY }
      }
      const pointer = event as PointerEvent
      return { x: pointer.clientX, y: pointer.clientY }
    }

    const start = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest("button")) return
      if (!win) return
      dragging = true
      const rect = win.getBoundingClientRect()
      const position = point(event)
      offsetX = position.x - rect.left
      offsetY = position.y - rect.top
      win.style.left = `${rect.left}px`
      win.style.top = `${rect.top}px`
      win.style.right = "auto"
      win.style.bottom = "auto"
      win.style.transform = ""
      head?.setPointerCapture?.(event.pointerId)
      if (event.cancelable) event.preventDefault()
    }

    const move = (event: PointerEvent) => {
      if (!dragging || !win) return
      const safe = safeInsets()
      const position = point(event)
      const width = win.offsetWidth
      const x = clamp(
        position.x - offsetX,
        safe.left - width + 40,
        window.innerWidth - safe.right - 40,
      )
      const y = clamp(
        position.y - offsetY,
        safe.top + 6,
        window.innerHeight - safe.bottom - 46,
      )
      win.style.left = `${x}px`
      win.style.top = `${y}px`
      if (snapLeftRef.current) snapLeftRef.current.dataset.on = String(x < safe.left + 30)
      if (snapRightRef.current) {
        snapRightRef.current.dataset.on = String(x + width > window.innerWidth - safe.right - 30)
      }
      if (event.cancelable) event.preventDefault()
    }

    const end = () => {
      if (!dragging || !win) return
      const safe = safeInsets()
      dragging = false
      if (snapLeftRef.current) snapLeftRef.current.dataset.on = "false"
      if (snapRightRef.current) snapRightRef.current.dataset.on = "false"
      const x = Number.parseFloat(win.style.left) || 0
      const width = win.offsetWidth
      if (x < safe.left + 26) win.style.left = `${safe.left - width + 22}px`
      else if (x + width > window.innerWidth - safe.right - 26) {
        win.style.left = `${window.innerWidth - safe.right - width + 22}px`
      }
      latestActions.current.saveFloatLayout()
    }

    // Bottom-right grip: let the user resize the floating window freely.
    const grip = floatGripRef.current
    let sizing = false
    let sx = 0
    let sy = 0
    let sw = 0
    let sh = 0
    const startSize = (event: PointerEvent) => {
      if (!win || win.classList.contains("big") || win.classList.contains("min")) return
      sizing = true
      const position = point(event)
      sx = position.x
      sy = position.y
      sw = win.offsetWidth
      sh = floatBodyRef.current?.offsetHeight ?? 0
      grip?.setPointerCapture?.(event.pointerId)
      if (event.cancelable) event.preventDefault()
      event.stopPropagation()
    }
    const moveSize = (event: PointerEvent) => {
      if (!sizing || !win) return
      const safe = safeInsets()
      const position = point(event)
      // Allow growth across the viewport; keepFloatInView pushes the window
      // back so its right edge stays visible instead of capping the drag.
      const maxWidth = window.innerWidth - safe.left - safe.right - 16
      const visibleHeight = Math.max(200, window.innerHeight - safe.top - safe.bottom)
      const width = clamp(sw + (position.x - sx), 180, Math.max(180, maxWidth))
      const height = clamp(sh + (position.y - sy), 120, Math.max(120, visibleHeight - 40))
      floatSize.current = { w: width, h: height }
      latestActions.current.fitFloat()
      keepFloatInView()
      if (event.cancelable) event.preventDefault()
    }
    const endSize = () => {
      if (!sizing) return
      sizing = false
      latestActions.current.saveFloatLayout()
    }

    const onResize = () => {
      latestActions.current.fitZoom()
      latestActions.current.refreshPeek()
      keepFloatInView()
      latestActions.current.fitFloat()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPicker({ open: false, key: null })
      const modifier = event.ctrlKey || event.metaKey
      if (!modifier || event.altKey) return
      const key = event.key.toLowerCase()
      if (key !== "z" && key !== "y") return
      const target = event.target as HTMLElement | null
      const editing =
        target &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      // Let the browser own undo inside text fields so it doesn't rewrite
      // React-controlled values underneath us.
      if (editing) return
      const isRedo = key === "y" || event.shiftKey
      event.preventDefault()
      if (isRedo) latestActions.current.redo()
      else latestActions.current.undo()
    }

    const wrap = pvscrollRef.current
    // The visible viewport can settle after orientation changes/dvh updates
    // without a window resize event; refit when the preview box itself moves.
    const wrapObserver =
      wrap && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            if (!autoFitRef.current) return
            window.clearTimeout(refitTimer.current)
            refitTimer.current = window.setTimeout(() => {
              latestActions.current.fitZoom(false)
            }, 80)
          })
        : null
    wrapObserver?.observe(wrap!)
    const onMainWheel = (event: WheelEvent) => {
      if (!previewRef.current) return
      event.preventDefault()
      latestActions.current.zoomBy(event.deltaY < 0 ? 1 : -1)
    }
    const body = floatBodyRef.current
    const onFloatWheel = (event: WheelEvent) => {
      event.preventDefault()
      latestActions.current.zoomFloatBy(event.deltaY < 0 ? 1 : -1)
    }

    // Main canvas: transform-based free drag. Floating preview: scroll-based
    // pan, because its iframe keeps its own layout while zooming.
    const pan = {
      el: null as HTMLElement | null,
      mode: "stage" as "stage" | "float",
      x0: 0,
      y0: 0,
      left: 0,
      top: 0,
      startX: 0,
      startY: 0,
    }
    const startPan = (event: PointerEvent, el: HTMLElement, mode: "stage" | "float") => {
      if (event.button !== 0) return
      pan.el = el
      pan.mode = mode
      pan.x0 = event.clientX
      pan.y0 = event.clientY
      pan.startX = panRef.current.x
      pan.startY = panRef.current.y
      pan.left = el.scrollLeft
      pan.top = el.scrollTop
      // A pointer that started inside the iframe cannot be captured by the
      // parent element; that iframe keeps receiving move/up events instead.
      if (el.contains(event.target as Node)) {
        try {
          el.setPointerCapture?.(event.pointerId)
        } catch {
          // Pointer capture is best-effort.
        }
      }
    }
    const onWrapDown = (event: PointerEvent) => {
      if (wrap) startPan(event, wrap, "stage")
    }
    const onBodyDown = (event: PointerEvent) => {
      if (body) startPan(event, body, "float")
    }
    const movePan = (event: PointerEvent) => {
      if (!pan.el) return
      const dx = event.clientX - pan.x0
      const dy = event.clientY - pan.y0
      if (pan.mode === "stage") {
        // Keep at least a corner of the canvas reachable at all times.
        const stage = pvstageRef.current
        const width = stage?.offsetWidth ?? 640
        const height = stage?.offsetHeight ?? 900
        panRef.current = {
          x: clamp(pan.startX + dx, -width + 80, (wrap?.clientWidth ?? 640) - 80),
          y: clamp(pan.startY + dy, -height + 80, (wrap?.clientHeight ?? 900) - 80),
        }
        applyStageLayout()
      } else {
        pan.el.scrollLeft = pan.left - dx
        pan.el.scrollTop = pan.top - dy
      }
      if (event.cancelable) event.preventDefault()
    }
    const endPan = () => {
      pan.el = null
    }
    mainPanRef.current = {
      start: (event) => {
        if (wrap) startPan(event, wrap, "stage")
      },
      move: movePan,
      end: endPan,
    }

    head?.addEventListener("pointerdown", start)
    grip?.addEventListener("pointerdown", startSize)
    wrap?.addEventListener("wheel", onMainWheel, { passive: false })
    body?.addEventListener("wheel", onFloatWheel, { passive: false })
    wrap?.addEventListener("pointerdown", onWrapDown)
    body?.addEventListener("pointerdown", onBodyDown)
    window.addEventListener("pointermove", move)
    window.addEventListener("pointermove", moveSize)
    window.addEventListener("pointermove", movePan)
    window.addEventListener("pointerup", end)
    window.addEventListener("pointerup", endSize)
    window.addEventListener("pointerup", endPan)
    window.addEventListener("pointercancel", end)
    window.addEventListener("pointercancel", endSize)
    window.addEventListener("pointercancel", endPan)
    window.addEventListener("resize", onResize)
    window.addEventListener("keydown", onKeyDown)
    const fitTimer = window.setTimeout(() => fitZoom(), 400)

    return () => {
      head?.removeEventListener("pointerdown", start)
      grip?.removeEventListener("pointerdown", startSize)
      wrap?.removeEventListener("wheel", onMainWheel)
      body?.removeEventListener("wheel", onFloatWheel)
      wrap?.removeEventListener("pointerdown", onWrapDown)
      body?.removeEventListener("pointerdown", onBodyDown)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointermove", moveSize)
      window.removeEventListener("pointermove", movePan)
      window.removeEventListener("pointerup", end)
      window.removeEventListener("pointerup", endSize)
      window.removeEventListener("pointerup", endPan)
      window.removeEventListener("pointercancel", end)
      window.removeEventListener("pointercancel", endSize)
      window.removeEventListener("pointercancel", endPan)
      window.removeEventListener("resize", onResize)
      window.removeEventListener("keydown", onKeyDown)
      clearTimeout(fitTimer)
      clearTimeout(refitTimer.current)
      cancelAnimationFrame(previewRaf.current)
      resizeObserver.current?.disconnect()
      wrapObserver?.disconnect()
    }
    // Boot-only setup: later renders reuse refs through latestActions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    templates,
    shots,
    currentTpl,
    params,
    activePreset,
    colors,
    alpha,
    tone,
    name,
    description,
    author,
    sharer,
    urlText,
    zoom,
    status,
    tplHint,
    templateImportStatus,
    jsonRaw,
    jsonStatus,
    colorStatus,
    projStatus,
    draftStatus,
    exportStatus,
    progress,
    progressVisible,
    exporting,
    mobileTab,
    accordionValue,
    picker,
    projectOpen,
    floatOpen,
    floatMin,
    floatBig,
    floatCompact,
    videoAvailable,
    videoEngine: videoAvailable ? videoEngine() : null,
    pngWidth,
    videoDuration,
    videoFps,
    videoQuality,
    batchFormat,
    fileNameLike: (label: string) => /^(shot|s\d+|IMG_|image|DSC|Screenshot)/i.test(label),
    shotPage: (shot: Shot, index: number) => shotPage(shot, index, currentTpl),
    visibleParam: (expression: string) => evalWhen(expression, params, currentTpl),
    paramValue: (key: string) => paramValue(key, params, currentTpl),
    setName: editName,
    setDescription: editDescription,
    setAuthor: editAuthor,
    setSharer: editSharer,
    setUrlText: editUrlText,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    setJsonRaw,
    setJsonStatus,
    setMobileTab,
    setAccordionValue,
    setPicker,
    setProjectOpen,
    setFloatMin,
    setFloatBig,
    setPngWidth,
    setVideoDuration,
    setVideoFps,
    setVideoQuality,
    setBatchFormat,
    refs: {
      preview: previewRef,
      floatPreview: floatPreviewRef,
      floatWin: floatWinRef,
      floatBody: floatBodyRef,
      floatHead: floatHeadRef,
      floatGrip: floatGripRef,
      snapLeft: snapLeftRef,
      snapRight: snapRightRef,
      pvwrap: pvwrapRef,
      pvscroll: pvscrollRef,
      pvstage: pvstageRef,
      side: sideRef,
      unifiedFile: unifiedFileRef,
      folderFile: folderFileRef,
      nameInput: nameInputRef,
      floatInner: floatInnerRef,
    },
    actions: {
      notify,
      addFiles,
      importFiles,
      clearShots,
      removeShot,
      moveShot,
      updateCaption,
      updatePage,
      onShotPointerDown,
      onShotPointerMove,
      onShotPointerUp,
      selectTemplate,
      importTemplateFile,
      updateTemplateData,
      setTemplateGroup,
      moveTemplate,
      moveTemplateToGroup,
      deleteTemplate,
      deleteTemplateGroup,
      autoGroupTemplates,
      setParamValue,
      applyPreset,
      applyTone,
      autoPalette,
      applyJson,
      updateColor,
      resetColors,
      saveProject,
      loadProjectFile,
      clearDraft: clearDraftNow,
      resetAll,
      runExportPng,
      runExportVideo,
      runBatchExport,
      cancelExport,
      setZoom: setUserZoom,
      zoomBy,
      fitZoom,
      openFloat,
      zoomFloatBy,
      setPeek,
      refreshPeek,
      fitFloat,
      openSection,
      focusExport,
      onAccordionChange,
      undo: history.undo,
      redo: history.redo,
    },
  }
}

export type StudioApi = ReturnType<typeof useStudio>
