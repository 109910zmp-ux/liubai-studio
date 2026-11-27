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
  /** Standard Reeden meta: note / review / themePreview / cover … */
  type?: string
  /** Canvas width declared in meta. Built-in templates keep the 640 fallback. */
  width?: number
  canvas?: string
  imported?: boolean
  /** User-defined group for imported templates. */
  group?: string
  /** Group declared by the template HTML; never changed by user actions. */
  declaredGroup?: string
  /** Source HTML file name without extension, used by file-name grouping. */
  sourceFile?: string
  /** Immediate folder name captured when the template was imported. */
  sourceFolder?: string
  /** Built-in mock payload harvested from an imported template. */
  mock?: Record<string, unknown>
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
  // Imported Reeden templates add type-specific roots (book, note, goal …).
  [key: string]: unknown
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
  appearance: Record<string, unknown>
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

/** Minimal portable record; params/type/width are re-derived from the HTML. */
export interface ImportedTemplateRecord {
  key: string
  html: string
  group?: string
  /** Source metadata is kept so folder/file grouping survives project reloads. */
  sourceFile?: string
  sourceFolder?: string
  mock?: Record<string, unknown>
}

export interface ProjectFile {
  app: string
  version: number
  savedAt: string
  template: string | null
  /** Imported templates are embedded so drafts/project files stay portable. */
  templateHtml?: string
  templateData?: Record<string, unknown>
  importedTemplates?: ImportedTemplateRecord[]
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
