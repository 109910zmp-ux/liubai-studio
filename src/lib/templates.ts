import metadata from "../data/templates.meta.json"
import themeBase from "../templates/theme-base.html?raw"
import type { Template, TemplateParam, TemplateSlot } from "./types"

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
      if (!matched) {
        if (import.meta.env.DEV) {
          console.warn(`[templates] 无法识别的 when 条件: "${part}"，已按显示处理`)
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
