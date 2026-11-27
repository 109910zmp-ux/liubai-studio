import { tr } from "@/i18n"
import metadata from "../data/templates.meta.json"
import themeBase from "../templates/theme-base.html?raw"
import type { Template, TemplateParam, TemplateParamType, TemplateSlot } from "./types"

// All three templates share the same 2700-line body; only the name, title and
// screens meta differ. Build them from one source so the bundle carries a
// single copy instead of three identical ones.
function renderTemplateHtml(name: string, slots: TemplateSlot[]) {
  const screens = `[${slots
    .map((slot, index) => `{&quot;id&quot;: &quot;d${index}&quot;, &quot;label&quot;: &quot;${slot.label}&quot;, &quot;page&quot;: &quot;${slot.page}&quot;}`)
    .join(", ")}]`
  return themeBase.split("__REEDEN_TITLE__").join(name).split("__REEDEN_SCREENS__").join(screens)
}

interface TemplateMeta {
  key: string
  name: string
  file: string
  count: number
  motion: boolean
  params: TemplateParam[]
  slots: TemplateSlot[]
}

export function buildTemplates(): Template[] {
  return (metadata as TemplateMeta[])
    .filter((item) => !item.motion)
    .map((item) => ({
      key: item.key,
      name: item.name,
      html: renderTemplateHtml(item.name, item.slots),
      count: item.count,
      motion: item.motion,
      params: item.params,
      slots: item.slots,
    }))
    .sort((a, b) => a.count - b.count)
}

export const TEMPLATE_TYPE_LABELS: Record<string, string> = {
  note: "笔记",
  review: "书评",
  bookList: "书单",
  statistics: "阅读信息",
  dailyGoal: "今日目标",
  yearlyGoal: "年度目标",
  characterChat: "角色对话",
  myReading: "我的阅读",
  characterRelation: "角色关系",
  themePreview: "主题预览",
  cover: "封面",
}

const PARAM_TYPES = new Set(["switch", "select", "range", "color", "text", "image", "font"])

function readMeta(doc: Document, name: string) {
  return doc.querySelector(`meta[name="${name}"]`)?.getAttribute("content")?.trim() || ""
}

function hashHtml(html: string) {
  let hash = 2166136261
  for (let index = 0; index < html.length; index += 1) {
    hash ^= html.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function parseScreens(raw: string): TemplateSlot[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
      .map((item, index) => ({
        label: String(item.label ?? index + 1),
        page: String(item.page ?? "photo"),
      }))
  } catch {
    return []
  }
}

/**
 * Turn a standard single-file Reeden share template into a Studio template.
 * The host contract is already declared in the HTML (`meta` tags), so no
 * duplicate schema is needed: params/screens/canvas are read straight from it.
 */
export function parseTemplateHtml(html: string, fileName = "", sourceFolder = ""): Template {
  const doc = new DOMParser().parseFromString(html, "text/html")
  if (!/ReedenShareTemplate\s*(?:=|\[)/.test(html)) {
    throw new Error(tr("未找到 ReedenShareTemplate 渲染入口"))
  }

  const type = readMeta(doc, "reeden-template-type") || "themePreview"
  const version = readMeta(doc, "reeden-template-version")
  if (version && version !== "1") {
    throw new Error(tr("不支持的模板版本：{version}", { version }))
  }

  const cleanName = fileName.replace(/\\/g, "/").split("/").pop()?.replace(/\.html?$/i, "").trim() || ""
  const name = readMeta(doc, "reeden-template-name") || cleanName || tr("导入模板")
  const declaredWidth = Number.parseInt(readMeta(doc, "reeden-template-width"), 10)
  const width =
    type === "cover"
      ? 300
      : Number.isFinite(declaredWidth) && declaredWidth > 0
        ? declaredWidth
        : type === "themePreview"
          ? 640
          : 375
  const canvas = readMeta(doc, "reeden-template-canvas") || "long"
  const declaredGroup = readMeta(doc, "reeden-template-group")

  let slots = parseScreens(readMeta(doc, "reeden-template-screens"))
  if (type === "themePreview" && !slots.length) {
    slots = [
      { label: "1", page: "home" },
      { label: "2", page: "reader" },
      { label: "3", page: "bookshelf" },
    ]
  }

  const params: TemplateParam[] = Array.from(doc.querySelectorAll("meta[data-red-param]")).map((tag) => {
    const rawKey = tag.getAttribute("data-red-param") || ""
    // `cover.*` params are part of the official contract too; keep the prefix
    // so buildPayload can place them on payload.cover instead of payload.params.
    const key = rawKey.replace(/^(param|cover)\./, "")
    const prefixedKey = rawKey.startsWith("cover.") ? `cover.${key}` : key
    const rawType = tag.getAttribute("data-red-type") || "text"
    return {
      key: prefixedKey,
      type: (PARAM_TYPES.has(rawType) ? rawType : "text") as TemplateParamType,
      label: tag.getAttribute("data-red-label") || key,
      def: tag.getAttribute("data-red-default") ?? "",
      group: tag.getAttribute("data-red-group") || tr("模板参数"),
      options: tag.getAttribute("data-red-options") || "",
      min: tag.getAttribute("data-red-min") || "0",
      max: tag.getAttribute("data-red-max") || "100",
      step: tag.getAttribute("data-red-step") || "1",
      placeholder: tag.getAttribute("data-red-placeholder") || "",
      when: tag.getAttribute("data-red-when") || "",
    }
  })

  return {
    key: `imported-${type}-${hashHtml(html)}`,
    name,
    html,
    count: type === "themePreview" ? Math.max(1, slots.length) : 1,
    motion: false,
    params,
    slots,
    type,
    width,
    canvas,
    imported: true,
    group: declaredGroup || tr("导入模板"),
    declaredGroup,
    sourceFile: cleanName || undefined,
    sourceFolder: sourceFolder.trim() || undefined,
  }
}

export interface TemplateBuiltinTexts {
  name: string
  description: string
  author: string
  sharer: string
  urlText: string
}

export interface TemplateMetaEntry {
  name: string
  content: string
}

/** True when a meta content holds structured configuration instead of display text. */
function isConfigContent(content: string): boolean {
  const value = content.trim()
  return (
    (value.startsWith("[") && value.endsWith("]")) ||
    (value.startsWith("{") && value.endsWith("}"))
  )
}

/**
 * Render the screens meta as a count instead of raw JSON:
 * JSON arrays -> item count, "s1-s6" -> 6, plain numbers pass through.
 */
function screenCountLabel(content: string): string {
  const value = content.trim()
  if (!value) return ""
  if (value.startsWith("[") && value.endsWith("]")) {
    try {
      const parsed: unknown = JSON.parse(value)
      if (Array.isArray(parsed)) return String(parsed.length)
    } catch {
      // fall through to other formats
    }
  }
  const range = value.match(/^s?(\d+)\s*[-–]\s*s?(\d+)$/i)
  if (range) {
    const from = Number(range[1])
    const to = Number(range[2])
    return String(Math.abs(to - from) + 1)
  }
  return value
}

/** All reeden-template-* meta declarations, unfiltered. */
function parseTemplateMeta(template: Template | null): TemplateMetaEntry[] {
  if (!template?.html) return []
  const doc = new DOMParser().parseFromString(template.html, "text/html")
  return Array.from(doc.querySelectorAll("meta[name^='reeden-template-']"))
    .map((meta) => {
      const name = meta.getAttribute("name")?.trim() || ""
      const raw = meta.getAttribute("content")?.trim() || ""
      return {
        name,
        content: name === "reeden-template-screens" ? screenCountLabel(raw) : raw,
      }
    })
    .filter((entry) => Boolean(entry.name))
}

/** Every declared meta, including settings/config values, for the info card. */
export function allTemplateMetaEntries(template: Template | null): TemplateMetaEntry[] {
  return parseTemplateMeta(template)
}

/**
 * Meta declarations mapped to editable work-info fields: name is the label and
 * content is the prefilled value. Settings/config metas are excluded because
 * those inputs are for user-facing text, not template configuration.
 */
export function templateMetaEntries(template: Template | null): TemplateMetaEntry[] {
  return parseTemplateMeta(template).filter(
    (entry) =>
      entry.name !== "reeden-template-name" &&
      entry.name !== "reeden-template-version" &&
      entry.name !== "reeden-template-output" &&
      entry.name !== "reeden-template-duration" &&
      entry.name !== "reeden-template-fps" &&
      entry.name !== "reeden-template-radius" &&
      // Structured content (JSON arrays/objects) is template configuration.
      !isConfigContent(entry.content),
  )
}

/** Localize enum-like meta values (e.g. template type) into Chinese source keys. */
export function templateMetaValue(name: string, content: string): string {
  if (!content) return content
  if (name === "reeden-template-type") return TEMPLATE_TYPE_LABELS[content] || content
  if (name === "reeden-template-canvas") {
    if (content === "long") return "长图"
    if (content === "square") return "方图"
  }
  return content
}

/** Human-readable Chinese labels keyed by the part after "reeden-template-". */
const META_LABELS: Record<string, string> = {
  name: "模板名称",
  version: "模板版本",
  type: "模板类型",
  width: "画布宽度",
  height: "画布高度",
  screens: "画面数量",
  canvas: "画布方向",
  group: "模板分组",
  output: "输出格式",
  duration: "视频时长",
  fps: "帧率",
  radius: "圆角",
}

/**
 * Build the field label from the meta name's "reeden-template-" suffix.
 * Known suffixes are localized through t(); unknown ones keep the suffix.
 */
export function templateMetaLabel(name: string): string {
  const key = name.replace(/^reeden-template-/, "")
  return META_LABELS[key] || key || name
}

function readString(value: unknown) {
  return typeof value === "string" ? value : ""
}

/** Text declared by the template itself, used to prefill the work-info fields. */
export function templateBuiltinTexts(template: Template | null): TemplateBuiltinTexts {
  const mock = template?.mock
  const root = mock && typeof mock === "object" && !Array.isArray(mock) ? mock : {}
  const theme = root.theme && typeof root.theme === "object" ? root.theme : {}
  const profile = root.profile && typeof root.profile === "object" ? root.profile : {}
  const themeName = readString((theme as Record<string, unknown>).name).trim()
  const sharer =
    readString((profile as Record<string, unknown>).nickname).trim() ||
    readString((profile as Record<string, unknown>).name).trim()
  return {
    name: themeName || template?.name?.trim() || "",
    description: readString((theme as Record<string, unknown>).description),
    author: readString((theme as Record<string, unknown>).author),
    sharer,
    urlText: readString(root.urlText).trim(),
  }
}

/** Group name baked into the template itself (meta group, type, then name prefix). */
export function templateAutoGroup(template: Template) {
  const declared = template.declaredGroup?.trim()
  if (declared) return declared
  const typeLabel = TEMPLATE_TYPE_LABELS[template.type ?? ""]?.trim()
  if (typeLabel) return typeLabel
  const head = template.name.trim().split(/\s*[·•|｜/\\\-—–]\s*/u)[0]?.trim()
  return head || tr("导入模板")
}

export type TemplateGroupMode = "builtin" | "folder" | "file"

/**
 * Resolve the group name for one of the three auto-grouping modes. Source
 * metadata falls back to the template name so files imported without a folder
 * picker still get a stable, readable group.
 */
export function templateGroupByMode(template: Template, mode: TemplateGroupMode) {
  if (mode === "folder") return template.sourceFolder?.trim() || tr("未标记文件夹")
  if (mode === "file") return template.sourceFile?.trim() || template.name.trim() || tr("未标记文件")
  return templateAutoGroup(template)
}

/** Immediate parent folder from a File's webkitRelativePath (if any). */
export function templateFolderFromFile(file: File) {
  const path = (file.webkitRelativePath || file.name).replace(/\\/g, "/")
  const parts = path.split("/").filter(Boolean)
  return parts.length > 1 ? parts[parts.length - 2]?.trim() || "" : ""
}

/** Title declared by the template itself (meta name), used when the user leaves the theme name empty. */
export function templateTitle(template: Template | null) {
  return template?.name?.trim() || tr("留白")
}

export function paramValue(
  key: string,
  values: Record<string, string | number | boolean>,
  template: Template | null,
) {
  if (key in values) return values[key]
  const definition = template?.params.find((item) => item.key === key)
  if (!definition) return undefined
  if (definition.type === "switch") {
    if (definition.def === "on" || definition.def === "off") return definition.def
    return definition.def === "true"
  }
  return definition.def
}

function truthy(value: unknown) {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  return value != null && value !== "" && value !== "false" && value !== "off"
}

export function evalWhen(
  expression: string | undefined,
  values: Record<string, string | number | boolean>,
  template: Template | null,
) {
  if (!expression) return true
  return String(expression)
    .split(/\s*\+\s*/)
    .every((part) => {
      const test = part.trim()
      const negated = test.startsWith("!")
      const key = negated ? test.slice(1) : test
      const matched = /^param\.([A-Za-z0-9_]+)(?:=(.*))?$/.exec(key)
      if (!matched) {
        if (import.meta.env.DEV) {
          console.warn(
            tr("无法识别的 when 条件: \"{part}\"，已按显示处理", { part }),
          )
        }
        return true
      }
      const value = paramValue(matched[1], values, template)
      if (matched[2] == null) {
        const result = truthy(value)
        return negated ? !result : result
      }
      const hit = matched[2].split("|").includes(String(value))
      return negated ? !hit : hit
    })
}
