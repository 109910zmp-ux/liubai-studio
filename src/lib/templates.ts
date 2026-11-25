import metadata from "../data/templates.meta.json"
import theme3 from "../templates/theme-3.html?raw"
import theme3Motion from "../templates/theme-3-motion.html?raw"
import theme4 from "../templates/theme-4.html?raw"
import theme4Motion from "../templates/theme-4-motion.html?raw"
import theme6 from "../templates/theme-6.html?raw"
import theme6Motion from "../templates/theme-6-motion.html?raw"
import type { Template, TemplateParam, TemplateSlot } from "./types"

const SOURCES: Record<string, string> = {
  "theme-3.html": theme3,
  "theme-3-motion.html": theme3Motion,
  "theme-4.html": theme4,
  "theme-4-motion.html": theme4Motion,
  "theme-6.html": theme6,
  "theme-6-motion.html": theme6Motion,
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
      html: SOURCES[item.file] ?? "",
      count: item.count,
      motion: item.motion,
      params: item.params,
      slots: item.slots,
    }))
    .sort((a, b) => a.count - b.count)
}

export function paramValue(
  key: string,
  values: Record<string, string | number | boolean>,
  template: Template | null,
) {
  if (key in values) return values[key]
  const definition = template?.params.find((item) => item.key === key)
  if (!definition) return undefined
  if (definition.type === "switch") return definition.def === "true"
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
      if (!matched) return true
      const value = paramValue(matched[1], values, template)
      if (matched[2] == null) {
        const result = truthy(value)
        return negated ? !result : result
      }
      const hit = matched[2].split("|").includes(String(value))
      return negated ? !hit : hit
    })
}
