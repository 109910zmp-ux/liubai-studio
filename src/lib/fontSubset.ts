import wasmUrl from "./harfbuzz-subset.wasm?url"
import type { StudioPayload } from "./types"

// Browser-side font subsetting. The harfbuzz wasm is lazy-loaded on the first
// real export so a session that never uses a custom font pays no cost.
// Only the glyphs referenced by the current payload's text are kept, turning a
// 9 MB CJK font into a few KB — this removes the per-frame re-decode that
// crashes iPadOS during video export.

type HarfBuzz = {
  memory: WebAssembly.Memory
  _initialize: () => void
  malloc: (size: number) => number
  free: (ptr: number) => void
  hb_blob_create: (
    data: number,
    length: number,
    mode: number,
    userData: number,
    destroy: number,
  ) => number
  hb_blob_destroy: (blob: number) => void
  hb_blob_get_data: (blob: number, offset: number) => number
  hb_blob_get_length: (blob: number) => number
  hb_face_create: (blob: number, index: number) => number
  hb_face_destroy: (face: number) => void
  hb_face_reference_blob: (face: number) => number
  hb_set_add: (set: number, codepoint: number) => void
  hb_subset_input_create_or_fail: () => number
  hb_subset_input_destroy: (input: number) => void
  hb_subset_input_unicode_set: (input: number) => number
  hb_subset_or_fail: (face: number, input: number) => number
}

const HB_MEMORY_MODE_WRITABLE = 2
const SUBSET_CACHE_LIMIT = 24

let hbPromise: Promise<HarfBuzz> | null = null

function loadHarfbuzz(): Promise<HarfBuzz> {
  if (!hbPromise) {
    hbPromise = (async () => {
      const source = await fetch(wasmUrl)
      // Clone before consuming the body: instantiateStreaming needs a fresh
      // Response, and a single-file build's wasm URL may lack the MIME type,
      // so we always keep the arrayBuffer as the reliable fallback.
      const streaming = typeof WebAssembly.instantiateStreaming === "function"
        ? source.clone()
        : null
      const bytes = await source.arrayBuffer()
      const result = streaming
        ? await WebAssembly.instantiateStreaming(streaming, {}).catch(() =>
            WebAssembly.instantiate(bytes, {}),
          )
        : await WebAssembly.instantiate(bytes, {})
      const instance = (result as WebAssembly.WebAssemblyInstantiatedSource).instance
      const hb = instance.exports as unknown as HarfBuzz
      hb._initialize()
      return hb
    })().catch((error) => {
      hbPromise = null
      throw error
    })
  }
  return hbPromise
}

function dataUriToBytes(uri: string): Uint8Array | null {
  const comma = uri.indexOf(",")
  if (comma < 0) return null
  const meta = uri.slice(0, comma)
  const payload = uri.slice(comma + 1)
  if (meta.includes(";base64") || !meta.includes("charset=")) {
    try {
      const binary = atob(payload)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
      return bytes
    } catch {
      return null
    }
  }
  try {
    return new TextEncoder().encode(decodeURIComponent(payload))
  } catch {
    return null
  }
}

function bytesToDataUri(bytes: Uint8Array, mime: string) {
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return `data:${mime};base64,${btoa(binary)}`
}

function fontMime(bytes: Uint8Array) {
  if (bytes.length < 4) return "font/ttf"
  const magic = String.fromCharCode(...bytes.subarray(0, 4))
  if (magic === "OTTO") return "font/otf"
  if (magic === "wOF2") return "font/woff2"
  if (magic === "wOFF") return "font/woff"
  return "font/ttf"
}

// woff/woff2 containers cannot be fed to harfbuzz directly. We detect them
// here and leave those fonts untouched (they still work, just without the
// optimization) rather than shipping a second decompressor wasm.
function isSfnt(bytes: Uint8Array) {
  if (bytes.length < 4) return false
  const magic = String.fromCharCode(...bytes.subarray(0, 4))
  return magic === "\u0000\u0001\u0000\u0000" || magic === "true" || magic === "OTTO" || magic === "typ1"
}

// Serialize subset jobs: the wasm heap and its malloc/free bookkeeping are not
// safe to use from two concurrent calls.
let queue: Promise<unknown> = Promise.resolve()
function serialize<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job)
  queue = next.catch(() => {})
  return next
}

function subsetSfnt(hb: HarfBuzz, bytes: Uint8Array, text: string): Uint8Array {
  const input = hb.hb_subset_input_create_or_fail()
  if (input === 0) throw new Error("harfbuzz: cannot create subset input")

  let fontBuffer = 0
  let face = 0
  let subset = 0
  let resultBlob = 0
  try {
    fontBuffer = hb.malloc(bytes.length)
    if (fontBuffer === 0) throw new Error("harfbuzz: out of memory")
    // The wasm memory can grow mid-subset and detach old views, so always
    // create a fresh Uint8Array at the point of use.
    new Uint8Array(hb.memory.buffer).set(bytes, fontBuffer)

    const blob = hb.hb_blob_create(
      fontBuffer,
      bytes.length,
      HB_MEMORY_MODE_WRITABLE,
      0,
      0,
    )
    if (blob === 0) throw new Error("harfbuzz: cannot create blob")
    face = hb.hb_face_create(blob, 0)
    hb.hb_blob_destroy(blob)
    if (face === 0) throw new Error("harfbuzz: cannot create face")

    const unicodes = hb.hb_subset_input_unicode_set(input)
    for (const char of text) hb.hb_set_add(unicodes, char.codePointAt(0) ?? 0)

    subset = hb.hb_subset_or_fail(face, input)
    if (subset === 0) throw new Error("harfbuzz: subset failed")

    resultBlob = hb.hb_face_reference_blob(subset)
    const offset = hb.hb_blob_get_data(resultBlob, 0)
    const length = hb.hb_blob_get_length(resultBlob)
    if (length === 0) throw new Error("harfbuzz: empty subset")
    const output = new Uint8Array(length)
    output.set(new Uint8Array(hb.memory.buffer).subarray(offset, offset + length))
    return output
  } finally {
    if (resultBlob) hb.hb_blob_destroy(resultBlob)
    if (subset) hb.hb_face_destroy(subset)
    if (face) hb.hb_face_destroy(face)
    if (fontBuffer) hb.free(fontBuffer)
    hb.hb_subset_input_destroy(input)
  }
}

const subsetCache = new Map<string, string>()

function cacheSet(key: string, value: string) {
  subsetCache.delete(key)
  subsetCache.set(key, value)
  if (subsetCache.size > SUBSET_CACHE_LIMIT) {
    const oldest = subsetCache.keys().next().value
    if (oldest !== undefined) subsetCache.delete(oldest)
  }
}

const FONT_PARAM_KEYS = ["titleFont", "watermarkFontFile"]

// Collect every piece of text that a template can paint on the poster. The
// subset must contain these glyphs or they silently fall back to a system font
// in the exported image. Data URIs (images/fonts) are excluded — feeding a
// 9 MB base64 string into the glyph set would defeat the whole optimization.
export function collectPayloadText(payload: StudioPayload): string {
  const parts: string[] = []
  const visit = (value: unknown, depth: number) => {
    if (depth > 4 || value == null) return
    if (typeof value === "string") {
      if (!value.startsWith("data:") && value.length < 4000) parts.push(value)
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1)
      return
    }
    if (typeof value === "object") {
      for (const item of Object.values(value as Record<string, unknown>)) {
        visit(item, depth + 1)
      }
    }
  }
  visit(payload, 0)
  // Digits, latin punctuation and common symbols appear in captions, dates
  // and URLs even when the UI language is Chinese; keep them in every subset.
  parts.push(
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ" +
      " .,:;!?()[]{}<>/\\|-_+=*&%#$@~'\"·—…、，。：；！？（）《》「」『』【】",
  )
  return Array.from(new Set(parts.join(""))).join("")
}

export async function subsetPayloadFonts(
  payload: StudioPayload,
  text: string,
  signal?: AbortSignal,
  fontKeys: string[] = FONT_PARAM_KEYS,
): Promise<StudioPayload> {
  const params = payload.params
  const targets = fontKeys.filter((key) => {
    const value = params[key]
    // FileReader labels uploaded .ttf/.otf as data:application/octet-stream,
    // so match any data URI and let the signature check in subsetFontDataUri
    // decide whether it is a real font.
    return typeof value === "string" && value.startsWith("data:")
  })
  if (!targets.length) return payload

  const nextParams: Record<string, string | number | boolean> = { ...params }
  for (const key of targets) {
    if (signal?.aborted) break
    nextParams[key] = await subsetFontDataUri(String(params[key]), text)
  }
  return { ...payload, params: nextParams }
}

export async function subsetFontDataUri(
  dataUri: string,
  text: string,
): Promise<string> {
  if (!dataUri.startsWith("data:") || !text) return dataUri
  const bytes = dataUriToBytes(dataUri)
  if (!bytes || !isSfnt(bytes)) return dataUri

  // Keep the cache key bounded: a full 9 MB base64 string is far too large.
  let hash = 2166136261
  for (let i = 0; i < dataUri.length; i += 1) {
    hash ^= dataUri.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  let textHash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    textHash ^= text.charCodeAt(i)
    textHash = Math.imul(textHash, 16777619)
  }
  const key = `${hash.toString(36)}_${dataUri.length}_${textHash.toString(36)}`
  const cached = subsetCache.get(key)
  if (cached) return cached

  return serialize(async () => {
    const again = subsetCache.get(key)
    if (again) return again
    const hb = await loadHarfbuzz()
    const result = subsetSfnt(hb, bytes, text)
    const output = bytesToDataUri(result, fontMime(bytes))
    // Only cache when subsetting actually helped; a font that failed to shrink
    // would otherwise bloat the cache with near-original-size strings.
    if (output.length < dataUri.length) cacheSet(key, output)
    return output
  })
}
