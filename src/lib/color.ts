import { clamp } from "./math"

export function parseColor(value: unknown) {
  if (typeof value !== "string") return null
  const text = value.trim()
  if (/^#[0-9a-f]{8}$/i.test(text)) {
    return {
      hex: `#${text.slice(3)}`.toUpperCase(),
      alpha: Number.parseInt(text.slice(1, 3), 16) / 255,
    }
  }
  if (/^#[0-9a-f]{6}$/i.test(text)) return { hex: text.toUpperCase(), alpha: 1 }
  if (/^#[0-9a-f]{3}$/i.test(text)) {
    const hex = `#${text
      .slice(1)
      .split("")
      .map((char) => char + char)
      .join("")}`.toUpperCase()
    return { hex, alpha: 1 }
  }
  return null
}

export function hexNorm(value: unknown) {
  return parseColor(value)?.hex ?? null
}

export function rgb(hexValue: string) {
  const value = hexNorm(hexValue) ?? "#000000"
  return [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16))
}

export function hx(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase()
}

export function withAlpha(hexValue: string, alpha?: number) {
  if (alpha == null || alpha >= 0.999) return hexValue
  const [red, green, blue] = rgb(hexValue)
  return `rgba(${red},${green},${blue},${alpha.toFixed(3)})`
}

export function mix(first: string, second: string, amount: number) {
  const a = rgb(first)
  const b = rgb(second)
  return hx(
    a[0] * (1 - amount) + b[0] * amount,
    a[1] * (1 - amount) + b[1] * amount,
    a[2] * (1 - amount) + b[2] * amount,
  )
}

export function luminance(color: string) {
  const channels = rgb(color).map((value) => {
    const scaled = value / 255
    return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

export function contrastRatio(first: string, second: string) {
  const a = luminance(first)
  const b = luminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

export function rgbToHsv(red: number, green: number, blue: number) {
  const r = red / 255
  const g = green / 255
  const b = blue / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let hue = 0
  if (delta) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6)
    else if (max === g) hue = 60 * ((b - r) / delta + 2)
    else hue = 60 * ((r - g) / delta + 4)
  }
  if (hue < 0) hue += 360
  return [hue, max === 0 ? 0 : delta / max, max] as const
}

export function hsvToRgb(hue: number, saturation: number, value: number) {
  const c = value * saturation
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = value - c
  let r = 0
  let g = 0
  let b = 0
  if (hue < 60) {
    r = c
    g = x
  } else if (hue < 120) {
    r = x
    g = c
  } else if (hue < 180) {
    g = c
    b = x
  } else if (hue < 240) {
    g = x
    b = c
  } else if (hue < 300) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)] as const
}

export function fromHsl(hue: number, saturation: number, lightness: number) {
  const h = ((hue % 360) + 360) % 360
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = lightness - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) {
    r = c
    g = x
  } else if (h < 120) {
    r = x
    g = c
  } else if (h < 180) {
    g = c
    b = x
  } else if (h < 240) {
    g = x
    b = c
  } else if (h < 300) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }
  return hx((r + m) * 255, (g + m) * 255, (b + m) * 255)
}
