import { tr } from "@/i18n"
import { PAGE_NAME } from "./constants"
import type { Colors } from "./constants"
import { paperColorsForTone } from "./palette"
import type { ParamValues, Shot, StudioPayload, Template, ThemeMeta, Tone } from "./types"

export function shotPage(shot: Shot, index: number, template: Template | null) {
  if (shot.pageSet && shot.page) return shot.page
  const slot = template?.slots?.[index]
  if (slot?.page) return slot.page
  return shot.page || "photo"
}

interface BuildPayloadOptions {
  shots: Shot[]
  template: Template | null
  params: ParamValues
  colors: Colors
  tone: Tone
  meta: ThemeMeta
  smallScale?: boolean
  lang?: "zh" | "en"
}

export function buildPayload({
  shots,
  template,
  params,
  colors,
  tone,
  meta,
  smallScale = false,
  lang = "zh",
}: BuildPayloadOptions): StudioPayload {
  const used = shots.slice(0, template?.count ?? 6)
  const resolved: ParamValues = {}

  template?.params.forEach((definition) => {
    const value = definition.key in params ? params[definition.key] : definition.def
    // Some switches (e.g. watermark) persist "on"/"off" strings rather than
    // booleans; keep that value intact so the template's wmEnabled() can read it.
    if (definition.type === "switch") {
      if (value === "on" || value === "off") resolved[definition.key] = value
      else resolved[definition.key] = value === true || value === "true"
    }
    else if (definition.type === "range") resolved[definition.key] = Number.parseFloat(String(value))
    else resolved[definition.key] = value
  })

  // Paper tone is a rendering concern: derive a readable sheet from the palette
  // instead of rewriting the palette when the user switches light/dark.
  const paper = paperColorsForTone(colors, tone)

  return {
    theme: {
      name: meta.name,
      description: meta.description,
      author: meta.author,
      colors: {
        background: paper.background,
        foreground: paper.foreground,
        mutedForeground: paper.mutedForeground,
        primary: paper.primary,
      },
    },
    profile: { nickname: meta.sharer },
    urlText: meta.urlText.trim(),
    screens: used.map((shot, index) => {
      const pageKey = shotPage(shot, index, template)
      const pageName = PAGE_NAME[pageKey] || ""
      const manual = String(shot.caption || "").trim()
      const fileNameLike = /^(shot|s\d+|IMG_|image|DSC|Screenshot)/i.test(shot.label || "")
      const label =
        manual ||
        pageName ||
        (fileNameLike ? "" : shot.label || "") ||
        tr("截图 {index}", { index: index + 1 })
      return {
        id: `d${index}`,
        image: smallScale && shot.small ? shot.small : shot.data,
        width: shot.width,
        height: shot.height,
        page: pageKey,
        label,
        detail: "",
      }
    }),
    params: resolved,
    appearance: {},
    tone,
    lang,
  }
}
