import { tr } from "@/i18n"
import { PAGE_NAME } from "./constants"
import type { Colors } from "./constants"
import { paperColorsForTone } from "./palette"
import { templateTitle } from "./templates"
import type { ParamValues, Shot, StudioPayload, Template, ThemeMeta, Tone } from "./types"

export function shotPage(shot: Shot, index: number, template: Template | null) {
  if (shot.pageSet && shot.page) return shot.page
  const slot = template?.slots?.[index]
  if (slot?.page) return slot.page
  return shot.page || "photo"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
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
  const coverOverrides: Record<string, unknown> = {}

  template?.params.forEach((definition) => {
    const value = definition.key in params ? params[definition.key] : definition.def
    // Some switches (e.g. watermark) persist "on"/"off" strings rather than
    // booleans; keep that value intact so the template's wmEnabled() can read it.
    let result: string | number | boolean
    if (definition.type === "switch") {
      result = value === "on" || value === "off" ? value : value === true || value === "true"
    } else if (definition.type === "range") {
      result = Number.parseFloat(String(value))
    } else {
      result = value
    }
    resolved[definition.key] = result
    if (definition.key.startsWith("cover.")) {
      coverOverrides[definition.key.slice(6)] = result
    }
  })

  // Imported templates carry their own demo payload (book, note, goal …).
  // Keep those type-specific roots and overlay only the data this studio owns.
  const imported = template?.imported === true
  const mock: Record<string, unknown> =
    imported && template?.mock && isRecord(template.mock) ? template.mock : {}
  const mockTheme = isRecord(mock.theme) ? mock.theme : {}
  const mockProfile = isRecord(mock.profile) ? mock.profile : {}
  const mockAppearance = isRecord(mock.appearance) ? mock.appearance : {}
  const mockColorTheme = isRecord(mockAppearance.colorTheme) ? mockAppearance.colorTheme : {}

  // Paper tone is a rendering concern: derive a readable sheet from the palette
  // instead of rewriting the palette when the user switches light/dark.
  const paper = paperColorsForTone(colors, tone)
  const sharer = meta.sharer.trim()

  const payload: StudioPayload = {
    ...(imported ? mock : {}),
    theme: {
      ...(imported ? mockTheme : {}),
      name: meta.name.trim() || templateTitle(template),
      description: meta.description,
      author: meta.author,
      colors: {
        background: paper.background,
        foreground: paper.foreground,
        mutedForeground: paper.mutedForeground,
        primary: paper.primary,
      },
    },
    profile: {
      ...(imported ? mockProfile : {}),
      nickname: meta.sharer,
      ...(sharer ? { name: sharer } : {}),
    },
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
    appearance: imported
      ? {
          ...mockAppearance,
          colorTheme: {
            ...mockColorTheme,
            backgroundColor: colors.backgroundColor,
            textColor: colors.foregroundColor,
            mutedColor: colors.primaryColor,
          },
        }
      : {},
    tone,
    lang,
  }

  if (imported && template?.type === "cover") {
    payload.cover = {
      ...(isRecord(mock.cover) ? mock.cover : {}),
      ...coverOverrides,
    }
  }
  return payload
}
