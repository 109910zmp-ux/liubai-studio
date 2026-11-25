import { DARK_COLORS, LIGHT_COLORS, REEDEN_KEYS } from "./constants"
import type { ColorKey, Colors } from "./constants"
import { contrastRatio, fromHsl, luminance, mix, parseColor, rgbToHsv } from "./color"
import { clamp } from "./math"
import type { PaletteAnalysis, Shot, ThemeImportResult, Tone } from "./types"

export function imageBrightness(data: string) {
  return new Promise<number>((resolve) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = 32
      canvas.height = 32
      const context = canvas.getContext("2d", { willReadFrequently: true })
      if (!context) return resolve(0.5)
      context.drawImage(image, 0, 0, 32, 32)
      const pixels = context.getImageData(0, 0, 32, 32).data
      let sum = 0
      let count = 0
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3] < 128) continue
        const lightness =
          (0.2126 * pixels[index] +
            0.7152 * pixels[index + 1] +
            0.0722 * pixels[index + 2]) /
          255
        sum += lightness
        count += 1
      }
      resolve(count ? sum / count : 0.5)
    }
    image.onerror = () => resolve(0.5)
    image.src = data
  })
}

export function analyzeShots(shots: Shot[], limit: number) {
  const used = shots.slice(0, limit)
  if (!used.length) return Promise.resolve<PaletteAnalysis | null>(null)

  const hueBins = new Array<number>(24).fill(0)
  const hueColors = new Array<{ r: number; g: number; b: number; n: number } | null>(24).fill(null)
  const lightness: number[] = []
  const saturation: number[] = []
  let pending = used.length
  let resolveAnalysis: (result: PaletteAnalysis) => void = () => {}

  const finishOne = () => {
    pending -= 1
    if (pending === 0) finish()
  }

  const finish = () => {
    const avgL = lightness.length
      ? lightness.reduce((sum, value) => sum + value, 0) / lightness.length
      : 0.5
    let best = -1
    let bestScore = -1
    for (let index = 0; index < 24; index += 1) {
      const score =
        hueBins[index] * 2 + hueBins[(index + 23) % 24] + hueBins[(index + 1) % 24]
      if (score > bestScore) {
        bestScore = score
        best = index
      }
    }

    let hue: number | null = null
    let accent: [number, number, number] | null = null
    if (best >= 0) {
      const aggregate = { r: 0, g: 0, b: 0, n: 0 }
      ;[best, (best + 23) % 24, (best + 1) % 24].forEach((bin) => {
        const entry = hueColors[bin]
        if (!entry) return
        aggregate.r += entry.r
        aggregate.g += entry.g
        aggregate.b += entry.b
        aggregate.n += entry.n
      })
      if (aggregate.n > 0) {
        accent = [
          aggregate.r / aggregate.n,
          aggregate.g / aggregate.n,
          aggregate.b / aggregate.n,
        ]
        hue = rgbToHsv(...accent)[0]
      }
    }

    resolveAnalysis({ avgL, hue, rgb: accent, voted: bestScore > 0 })
  }

  return new Promise<PaletteAnalysis>((resolve) => {
    resolveAnalysis = resolve
    used.forEach((shot) => {
      const image = new Image()
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas")
          canvas.width = 48
          canvas.height = 48
          const context = canvas.getContext("2d", { willReadFrequently: true })
          if (context) {
            context.drawImage(image, 0, 0, 48, 48)
            const pixels = context.getImageData(0, 0, 48, 48).data
            for (let index = 0; index < pixels.length; index += 4) {
              if (pixels[index + 3] < 128) continue
              const r = pixels[index]
              const g = pixels[index + 1]
              const b = pixels[index + 2]
              const max = Math.max(r, g, b)
              const min = Math.min(r, g, b)
              const sat = max === 0 ? 0 : (max - min) / max
              const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
              lightness.push(L)
              saturation.push(sat)
              if (L < 0.12 || L > 0.9 || sat < 0.14) continue
              const bin = Math.floor(rgbToHsv(r, g, b)[0] / 15) % 24
              hueBins[bin] += 1 + sat * 2
              const entry = (hueColors[bin] ??= { r: 0, g: 0, b: 0, n: 0 })
              entry.r += r
              entry.g += g
              entry.b += b
              entry.n += 1
            }
          }
        } catch {
          // Some images can be tainted; ignore them and keep the rest.
        }
        finishOne()
      }
      image.onerror = finishOne
      image.src = shot.data
    })
  })
}

export function deriveAutoPalette(analysis: PaletteAnalysis) {
  const dark = analysis.avgL < 0.42
  const hue = analysis.hue
  const background =
    hue == null
      ? dark
        ? DARK_COLORS.backgroundColor
        : LIGHT_COLORS.backgroundColor
      : fromHsl(hue, dark ? 0.1 : 0.16, dark ? 0.1 : 0.945)

  let accent: string
  if (hue == null) {
    accent = dark ? "#B9B3A6" : "#6B6357"
  } else {
    const sat = dark ? 0.34 : 0.46
    let lightness = dark ? 0.62 : 0.34
    accent = fromHsl(hue, sat, lightness)
    let guard = 0
    while (contrastRatio(accent, background) < 3.2 && guard++ < 24) {
      lightness += dark ? 0.018 : -0.018
      accent = fromHsl(hue, sat, clamp(lightness, 0.12, 0.88))
    }
  }

  const foreground = dark ? DARK_COLORS.foregroundColor : LIGHT_COLORS.foregroundColor
  const colors: Colors = {
    backgroundColor: background,
    primaryColor: accent,
    foregroundColor: foreground,
    mutedForegroundColor: mix(foreground, background, 0.42),
    cardColor: dark ? mix(background, "#FFFFFF", 0.09) : mix(background, "#FFFFFF", 0.72),
    borderColor: mix(foreground, background, 0.78),
  }
  return { colors, tone: (dark ? "dark" : "light") as Tone }
}

// Derive the rendered paper from the palette without mutating the palette itself.
// The tone switch must only change light/dark presentation — colour chips stay
// exactly as imported or hand-picked, and toggling back restores the same sheet.
export function paperColorsForTone(colors: Colors, mode: Tone) {
  const dark = mode === "dark"
  const preset = dark ? DARK_COLORS : LIGHT_COLORS
  const primary = colors.primaryColor || preset.primaryColor
  const sourceBackground = colors.backgroundColor || preset.backgroundColor

  let background: string
  if (dark) {
    background = luminance(sourceBackground) <= 0.13
      ? sourceBackground
      : mix(primary, "#101114", 0.88)
    if (luminance(background) > 0.13) background = mix(background, "#101114", 0.88)
  } else {
    background = luminance(sourceBackground) >= 0.35
      ? sourceBackground
      : mix(sourceBackground, "#FFFFFF", 0.9)
    if (luminance(background) < 0.35) background = mix(background, "#FFFFFF", 0.9)
  }

  const readable = (candidate: string, minimum: number) =>
    contrastRatio(candidate, background) >= minimum ? candidate : preset.foregroundColor

  let foreground = readable(colors.foregroundColor || preset.foregroundColor, 4.5)
  if (contrastRatio(foreground, background) < 4.5) {
    foreground = dark ? "#FFFFFF" : "#1F1B18"
  }

  let mutedForeground = readable(colors.mutedForegroundColor || preset.mutedForegroundColor, 3)
  if (contrastRatio(mutedForeground, background) < 3) {
    mutedForeground = mix(foreground, background, 0.45)
  }

  return {
    background,
    foreground,
    mutedForeground,
    primary,
  }
}

export function setToneFromMode(colors: Colors, mode: Tone) {
  const next: Colors = { ...colors }
  const isDefaultFg =
    !next.foregroundColor ||
    next.foregroundColor === "#342E2A" ||
    next.foregroundColor === "#EDE8E0"
  const isDefaultMuted =
    !next.mutedForegroundColor ||
    next.mutedForegroundColor === "#8A8178" ||
    next.mutedForegroundColor === "#9A948B"
  const backgroundLuminance = luminance(next.backgroundColor || "#FFFFFF")
  if (isDefaultFg) {
    next.foregroundColor =
      mode === "dark" || backgroundLuminance < 0.45 ? "#EDE8E0" : "#342E2A"
  }
  if (isDefaultMuted) {
    next.mutedForegroundColor = mix(next.foregroundColor, next.backgroundColor || "#FFFFFF", 0.42)
  }
  return next
}

export function composeTranslucent(
  colors: Colors,
  translucent: Record<string, { hex: string; alpha: number }>,
) {
  const next: Colors = { ...colors }
  Object.keys(translucent).forEach((key) => {
    if (key === "backgroundColor") return
    const entry = translucent[key]
    next[key as ColorKey] = mix(entry.hex, next.backgroundColor || "#FFFFFF", 1 - entry.alpha)
  })
  return next
}

export function analyzeThemeJson(value: unknown, current: Colors): ThemeImportResult {
  const root = (value ?? {}) as Record<string, unknown>
  const conf =
    root.config && typeof root.config === "object"
      ? (root.config as Record<string, unknown>)
      : root

  const colors: Colors = { ...current }
  const alpha: Record<string, number> = {}
  const translucent: Record<string, { hex: string; alpha: number }> = {}
  const claimed = new Set<string>()
  let found = 0

  Object.keys(REEDEN_KEYS).forEach((sourceKey) => {
    if (!(sourceKey in conf)) return
    const parsed = parseColor(conf[sourceKey])
    if (!parsed || parsed.alpha <= 0.02) return
    const target = REEDEN_KEYS[sourceKey]
    if (claimed.has(target)) return
    claimed.add(target)
    colors[target] = parsed.hex
    alpha[target] = parsed.alpha
    if (parsed.alpha < 0.95) translucent[target] = parsed
    found += 1
  })

  if (!found) {
    const scan = (node: unknown, depth: number) => {
      if (!node || typeof node !== "object" || depth > 4) return
      Object.entries(node as Record<string, unknown>).forEach(([key, entry]) => {
        if (typeof entry !== "string") {
          scan(entry, depth + 1)
          return
        }
        const parsed = parseColor(entry)
        if (!parsed) return
        const lower = key.toLowerCase()
        let target: ColorKey | null = null
        if (/^primary|accent/.test(lower)) target = "primaryColor"
        else if (/^background/.test(lower)) target = "backgroundColor"
        else if (/^card/.test(lower)) target = "cardColor"
        else if (/foreground/.test(lower) && /muted/.test(lower)) target = "mutedForegroundColor"
        else if (/foreground/.test(lower)) target = "foregroundColor"
        else if (/border|divider/.test(lower)) target = "borderColor"
        if (!target) return
        colors[target] = parsed.hex
        alpha[target] = parsed.alpha
        found += 1
      })
    }
    scan(root, 0)
  }

  if (!found) throw new Error("没有识别到颜色字段")

  const name = String(
    root.name || root.title || conf.name || conf.title || conf.themeName || "",
  ).trim()
  const description = String(conf.description || conf.desc || conf.intro || "").trim()
  const modeValue = String(root.mode || conf.mode || "").toLowerCase()
  const mode: Tone | undefined = modeValue === "dark" || modeValue === "light" ? modeValue : undefined
  const blur = typeof conf.cardBackgroundBlur === "number" && conf.cardBackgroundBlur > 0
    ? conf.cardBackgroundBlur
    : 0

  return {
    colors,
    alpha,
    translucent,
    found,
    mode,
    blur,
    meta: {
      name,
      description,
      author: String(conf.author || ""),
      sharer: String(conf.nickname || conf.sharer || ""),
      urlText: "",
    },
  }
}
