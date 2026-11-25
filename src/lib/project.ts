import { COLOR_LABELS } from "./constants"
import type { ColorKey, Colors } from "./constants"
import type { ParamValues, ProjectFile, Shot, ThemeMeta, Tone } from "./types"

export function projectJson(data: {
  templateKey: string | null
  params: ParamValues
  colors: Colors
  meta: ThemeMeta
  tone: Tone
  shots: Shot[]
}): ProjectFile {
  return {
    app: "liubai-screenshot-studio",
    version: 1,
    savedAt: new Date().toISOString(),
    template: data.templateKey,
    params: data.params,
    colors: data.colors,
    themeName: data.meta.name,
    themeDesc: data.meta.description,
    themeAuthor: data.meta.author,
    urlText: data.meta.urlText,
    sharer: data.meta.sharer,
    tone: data.tone,
    shots: data.shots.map((shot) => ({
      data: shot.data,
      width: shot.width,
      height: shot.height,
      label: shot.label,
      caption: shot.caption || "",
      page: shot.page,
      pageSet: shot.pageSet,
    })),
  }
}

export interface LoadedProject {
  templateKey: string | null
  params: ParamValues
  colors: Colors
  meta: ThemeMeta
  tone: Tone
  shots: Shot[]
}

export function loadProject(value: unknown, nextId: () => string): LoadedProject {
  let raw = value as Partial<ProjectFile> & {
    payload?: {
      theme?: { name?: string; colors?: { background?: string; foreground?: string; primary?: string } }
      screens?: Array<{ image: string; width: number; height: number; label: string }>
    }
    template?: string
  }

  if (!raw || raw.app !== "liubai-screenshot-studio") {
    if (raw?.payload) {
      raw = {
        app: "liubai-screenshot-studio",
        template: raw.template,
        params: {},
        colors: {
          backgroundColor: raw.payload.theme?.colors?.background || "",
          foregroundColor: raw.payload.theme?.colors?.foreground || "",
          primaryColor: raw.payload.theme?.colors?.primary || "",
        } as Colors,
        themeName: raw.payload.theme?.name || "",
        themeDesc: "",
        themeAuthor: "",
        urlText: "",
        sharer: "",
        tone: "light",
        shots: (raw.payload.screens || []).map((screen) => ({
          data: screen.image,
          width: screen.width,
          height: screen.height,
          label: screen.label,
        })),
      }
    } else {
      throw new Error("不是本工具的项目文件")
    }
  }

  const colors = { ...(raw.colors || {}) } as Colors
  ;(Object.keys(COLOR_LABELS) as ColorKey[]).forEach((key) => {
    if (colors[key]) colors[key] = colors[key]
  })

  return {
    templateKey: raw.template || null,
    params: raw.params || {},
    colors,
    tone: raw.tone === "dark" ? "dark" : "light",
    meta: {
      name: raw.themeName || "",
      description: raw.themeDesc || "",
      author: raw.themeAuthor || "",
      urlText: raw.urlText || "",
      sharer: raw.sharer || "",
    },
    shots: (raw.shots || []).map((shot) => ({
      id: nextId(),
      data: shot.data,
      width: shot.width,
      height: shot.height,
      label: shot.label || "截图",
      caption: shot.caption || "",
      page: shot.page || "photo",
      pageSet: shot.pageSet || false,
      darkMode: shot.darkMode,
    })) as Shot[],
  }
}
