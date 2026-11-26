import type { Colors } from "./constants"

export type TemplateParamType = "switch" | "select" | "range" | "color" | "text" | "image" | "font"

export interface TemplateParam {
  key: string
  type: TemplateParamType
  label: string
  def: string
  group: string
  options: string
  min: string
  max: string
  step: string
  placeholder: string
  when: string
}

export interface TemplateSlot {
  label: string
  page: string
}

export interface Template {
  key: string
  name: string
  html: string
  count: number
  motion: boolean
  params: TemplateParam[]
  slots: TemplateSlot[]
}

export interface Shot {
  id: string
  data: string
  width: number
  height: number
  label: string
  caption?: string
  page: string
  pageSet?: boolean
  brightness?: number
  isDark?: boolean
  darkMode?: boolean
  small?: string
  thumb?: string
}

export type ParamValues = Record<string, string | number | boolean>

export interface ThemeMeta {
  name: string
  description: string
  author: string
  sharer: string
  urlText: string
}

export type Tone = "light" | "dark"

export interface StudioPayload {
  theme: {
    name: string
    description: string
    author: string
    colors: {
      background: string
      foreground: string
      mutedForeground: string
      primary: string
    }
  }
  profile: { nickname: string }
  urlText: string
  screens: Array<{
    id: string
    image: string
    width: number
    height: number
    page: string
    label: string
    detail: string
  }>
  params: ParamValues
  appearance: Record<string, never>
  tone: Tone
  lang?: "zh" | "en"
}

export interface PaletteAnalysis {
  avgL: number
  hue: number | null
  rgb: [number, number, number] | null
  voted: boolean
}

export interface ThemeImportResult {
  colors: Colors
  alpha: Record<string, number>
  translucent: Record<string, { hex: string; alpha: number }>
  found: number
  meta: ThemeMeta
  mode?: Tone
  blur: number
}

export interface ProjectFile {
  app: string
  version: number
  savedAt: string
  template: string | null
  params: ParamValues
  colors: Colors
  themeName: string
  themeDesc: string
  themeAuthor: string
  urlText: string
  sharer: string
  tone: Tone
  shots: Array<{
    data: string
    width: number
    height: number
    label: string
    caption?: string
    page?: string
    pageSet?: boolean
    darkMode?: boolean
  }>
}
