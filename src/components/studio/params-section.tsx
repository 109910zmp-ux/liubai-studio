import { useEffect, useMemo, useState } from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import type { StudioApi } from "@/hooks/useStudio"
import { hexNorm } from "@/lib/color"
import { STYLE_PRESETS } from "@/lib/presets"
import { ColorPickerDialog } from "./color-picker-dialog"
import type { Template, TemplateParam } from "@/lib/types"

// Core groups stay open; fine-tuning groups start collapsed to cut down the
// 44-control wall. Users can still expand anything, and the choice persists —
// per template, so a collapse in one layout does not leak into another.
const CORE_GROUPS = new Set(["展映", "外观", "卡片外观", "图文排版"])
const COLLAPSED_KEY_PREFIX = "liubai-param-collapsed-groups:"

type CollapsedState = { key: string; values: Record<string, boolean> }

function collapsedKey(templateKey: string) {
  return `${COLLAPSED_KEY_PREFIX}${templateKey}`
}

function readCollapsed(templateKey: string): Record<string, boolean> {
  if (!templateKey) return {}
  try {
    const raw = localStorage.getItem(collapsedKey(templateKey))
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === "object") return parsed as Record<string, boolean>
  } catch {
    // Storage may be unavailable; collapse state is a convenience only.
  }
  return {}
}

// Groups the stored snapshot has never seen fall back to the core-group rule
// instead of being treated as collapsed/undefined — new template params stay
// discoverable without silently expanding every fine-tuning group.
function isGroupOpen(values: Record<string, boolean>, name: string) {
  return name in values ? !values[name] : CORE_GROUPS.has(name)
}

// Turn a `when` expression into a short hint explaining why a param is hidden,
// e.g. "需先开启「水印」" — so a searched-but-hidden control is actionable.
function hiddenReason(
  expression: string | undefined,
  tpl: Template | null,
  t: (source: string, vars?: Record<string, string | number>) => string,
) {
  if (!expression) return ""
  const parts = expression.split(/\s*\+\s*/).filter(Boolean)
  const reasons = parts.map((part) => {
    const test = part.trim()
    const negated = test.startsWith("!")
    const key = negated ? test.slice(1) : test
    const matched = /^param\.([A-Za-z0-9_]+)(?:=(.*))?$/.exec(key)
    if (!matched) return t("前置条件未满足")
    const param = tpl?.params.find((item) => item.key === matched[1])
    const label = t(param?.label ?? matched[1])
    if (matched[2] == null) return t(negated ? "关闭「{label}」" : "开启「{label}」", { label })
    if (param?.type === "switch" && /^(on|true)$/.test(matched[2])) {
      return t(negated ? "关闭「{label}」" : "开启「{label}」", { label })
    }
    if (param?.type === "switch" && /^(off|false)$/.test(matched[2])) {
      return t(negated ? "开启「{label}」" : "关闭「{label}」", { label })
    }
    return t("将「{label}」设为 {value}", { label, value: matched[2].replace(/\|/g, "/") })
  })
  return reasons.join("，")
}

export function ParamsSection({
  studio,
  groups,
}: {
  studio: StudioApi
  groups: Array<{ name: string; label?: string; items: TemplateParam[] }>
}) {
  const [query, setQuery] = useState("")
  const { t, language } = useI18n()
  const templateKey = studio.currentTpl?.key ?? ""
  const [state, setState] = useState<CollapsedState>(() => ({
    key: templateKey,
    values: readCollapsed(templateKey),
  }))
  // Use the snapshot matching the current template on the first render after a
  // switch; the effect below persists the migrated snapshot on the next tick.
  const collapsed = state.key === templateKey ? state.values : readCollapsed(templateKey)

  useEffect(() => {
    if (state.key !== templateKey) {
      setState({ key: templateKey, values: readCollapsed(templateKey) })
      return
    }
    if (!templateKey) return
    try {
      localStorage.setItem(collapsedKey(templateKey), JSON.stringify(collapsed))
    } catch {
      // Storage may be unavailable; collapse state is a convenience only.
    }
  }, [collapsed, state.key, templateKey])

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    // Without a query keep the original behavior: hidden params stay hidden.
    // With a query, include hidden matches so users can discover controls gated
    // behind a switch (e.g. the watermark font before watermark is enabled).
    if (!q) {
      return groups
        .map((group) => ({
          ...group,
          items: group.items.filter((param) => studio.visibleParam(param.when)),
        }))
        .filter((group) => group.items.length > 0)
    }
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (param) =>
            param.label.toLowerCase().includes(q) ||
            param.key.toLowerCase().includes(q) ||
            group.name.toLowerCase().includes(q),
        ),
      }))
      .filter((group) => group.items.length > 0)
  }, [groups, q, studio.params, studio.currentTpl, language])


  function toggle(name: string) {
    // Values store "collapsed"; isGroupOpen returns "expanded". Flipping an
    // expanded group means storing collapsed=true, and vice versa — so the
    // stored flag is exactly the current expanded state.
    const currentlyOpen = isGroupOpen(collapsed, name)
    setState({
      key: templateKey,
      values: { ...collapsed, [name]: currentlyOpen },
    })
  }

  function setAll(open: boolean) {
    const next: Record<string, boolean> = {}
    groups.forEach((group) => {
      next[group.name] = !open
    })
    setState({ key: templateKey, values: next })
  }

  if (!studio.currentTpl) return <p className="hint-text">{t("先选择一套模板。")}</p>
  if (!groups.length) return <p className="hint-text">{t("当前没有可用参数。")}</p>

  return (
    <div className="space-y-4">
      <div>
        <h4 className="section-subtitle">{t("风格预设")}</h4>
        <div className="flex flex-wrap gap-1.5">
          {STYLE_PRESETS.map((preset) => (
            <Button
              key={preset.key}
              size="sm"
              variant={studio.activePreset === preset.key ? "default" : "outline"}
              className="h-7 px-2.5 text-xs"
              title={t(preset.desc)}
              onClick={() => studio.actions.applyPreset(preset.key)}
            >
              {t(preset.name)}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("搜索参数名或标识…")}
            className="h-8 pl-8 text-xs"
            aria-label={t("搜索参数")}
          />
        </div>
        <div className="mt-2 flex items-center justify-end gap-2">
          <div className="flex shrink-0 gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-xs"
              onClick={() => setAll(true)}
            >
              {t("全部展开")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-xs"
              onClick={() => setAll(false)}
            >
              {t("全部收起")}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        {filtered.map((group) => {
          const open = q ? true : isGroupOpen(collapsed, group.name)
          return (
            <div key={group.name}>
              <div className="mb-1.5 flex w-full items-center gap-1.5 rounded-md border border-border/60 bg-muted/35 px-1.5 py-1">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  onClick={() => {
                    if (!q) toggle(group.name)
                  }}
                  aria-expanded={open}
                  data-param-group={group.name}
                >
                  <span className="w-3 shrink-0 text-[11px] leading-none text-muted-foreground">{open ? "▾" : "▸"}</span>
                  <span className="block min-w-0 truncate text-xs font-semibold">{group.label ?? t(group.name)}</span>
                </button>
              </div>
              {open && (
                <div className="ml-1.5 space-y-2 pl-2 pt-0.5">
                  {group.items.map((param) => {
                    const hidden = !studio.visibleParam(param.when)
                    return (
                      <div key={param.key}>
                        <ParamControl studio={studio} param={param} />
                        {hidden ? (
                          <p className="hint-text mt-1 pl-0.5 text-amber-600 dark:text-amber-400">
                            {t("当前隐藏 · 需先{reason}", { reason: hiddenReason(param.when, studio.currentTpl, t) })}
                          </p>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ParamControl({ studio, param }: { studio: StudioApi; param: TemplateParam }) {
  const { t } = useI18n()
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const value = studio.paramValue(param.key) ?? param.def
  if (param.type === "switch") {
    // Most switches persist booleans, but some template params use the
    // on/off strings expected by the share template itself (e.g. watermark).
    // Keep the stored format so payloads, presets and saved projects stay
    // compatible while the control is still a single toggle.
    const optionValues = param.options
      .split(",")
      .map((pair) => {
        const divider = pair.indexOf(":")
        return divider > 0 ? pair.slice(0, divider) : pair
      })
      .filter(Boolean)
    const usesOnOff = optionValues.includes("on") && optionValues.includes("off")
    const checked = value === true || value === "true" || value === "on"
    return (
      <div className="flex items-center gap-3" data-param-key={param.key}>
        <Switch
          checked={checked}
          onCheckedChange={(next) =>
            studio.actions.setParamValue(
              param.key,
              usesOnOff ? (next ? "on" : "off") : next,
            )
          }
          aria-label={t(param.label)}
        />
        <span className="field-label">{t(param.label)}</span>
      </div>
    )
  }

  if (param.type === "select") {
    const options = param.options
      .split(",")
      .filter(Boolean)
      .map((pair) => {
        const divider = pair.indexOf(":")
        return divider > 0
          ? { value: pair.slice(0, divider), label: t(pair.slice(divider + 1)) }
          : { value: pair, label: t(pair) }
      })
    const selectedValue = String(value ?? "")
    const selectedLabel = options.find((option) => option.value === selectedValue)?.label ?? t("选择")
    return (
      <div className="flex items-center gap-3" data-param-key={param.key}>
        <span className="field-label min-w-0 flex-1 truncate">{t(param.label)}</span>
        <Select
          value={selectedValue}
          onValueChange={(next) => studio.actions.setParamValue(param.key, String(next))}
        >
          <SelectTrigger size="sm" className="w-[190px]">
            <SelectValue placeholder={t("选择")}>{selectedLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value} label={option.label}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  if (param.type === "range") {
    const number = Number(value) || 0
    return (
      <div className="flex items-center gap-3" data-param-key={param.key}>
        <span className="field-label min-w-0 flex-1 truncate">{t(param.label)}</span>
        <Slider
          className="w-[140px]"
          min={Number(param.min) || 0}
          max={Number(param.max) || 100}
          step={Number(param.step) || 1}
          value={[number]}
          onValueChange={(next) =>
            studio.actions.setParamValue(
              param.key,
              Array.isArray(next) ? (next[0] ?? number) : next,
            )
          }
          aria-label={t(param.label)}
        />
        <span className="w-9 text-right font-mono text-xs text-muted-foreground">{number}</span>
      </div>
    )
  }

  if (param.type === "color") {
    const hex = hexNorm(value) ?? "#000000"
    return (
      <>
        <div className="flex items-center gap-3" data-param-key={param.key}>
          <span className="field-label min-w-0 flex-1 truncate">{t(param.label)}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="color-chip h-auto px-2 py-1.5"
            onClick={() => setColorPickerOpen(true)}
            title={t("{label} {value} · 点击修改", { label: t(param.label), value: hex })}
          >
            <span
              className="size-5 shrink-0 rounded-md ring-1 ring-black/10"
              style={{ background: hex }}
            />
            <span className="font-mono text-[10px] uppercase tracking-tight text-muted-foreground">
              {hex}
            </span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => studio.actions.setParamValue(param.key, "")}
          >
            {t("自动")}
          </Button>
        </div>
        <ColorPickerDialog
          open={colorPickerOpen}
          colorKey={param.key}
          color={hex}
          alpha={1}
          onChange={(_key, nextHex) => studio.actions.setParamValue(param.key, nextHex)}
          onClose={() => setColorPickerOpen(false)}
          title={t(param.label)}
        />
      </>
    )
  }

  if (param.type === "image" || param.type === "font") {
    const isFont = param.type === "font"
    const accept = isFont ? ".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" : "image/*"
    const hasValue = typeof value === "string" && value.length > 0
    return (
      <div className="space-y-1.5" data-param-key={param.key}>
        <div className="flex items-center gap-3">
          <span className="field-label min-w-0 flex-1 truncate">{t(param.label)}</span>
          <label className="inline-flex h-8 shrink-0 cursor-pointer items-center rounded-md border border-input bg-background px-2.5 text-xs font-medium transition-colors hover:bg-accent">
            {t(hasValue ? "更换" : "选择文件")}
            <input
              type="file"
              accept={accept}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ""
                if (!file) return
                // 字体不限制大小（大字体在预览与导出中同样可用）；仅图片保留 6MB 上限，
                // 避免平铺水印图过大拖慢导出。
                const maxBytes = 6 * 1024 * 1024
                if (!isFont && file.size > maxBytes) {
                  studio.actions.notify(t("图片文件请小于 6MB"))
                  return
                }
                const reader = new FileReader()
                reader.onload = () => {
                  const result = reader.result
                  if (typeof result === "string") {
                    studio.actions.setParamValue(param.key, result)
                    studio.actions.notify(t(isFont ? "字体已载入" : "水印图片已载入"))
                  }
                }
                reader.onerror = () => studio.actions.notify(t("文件读取失败"))
                reader.readAsDataURL(file)
              }}
            />
          </label>
          {hasValue && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-xs"
              onClick={() => studio.actions.setParamValue(param.key, "")}
            >
              移除
            </Button>
          )}
        </div>
        {hasValue && !isFont && (
          <img
            src={String(value)}
            alt={t("水印预览")}
            className="ml-auto block h-10 w-10 rounded border border-border object-contain"
          />
        )}
        {hasValue && isFont && (
          <span className="ml-auto block text-right font-mono text-[10px] text-muted-foreground">
            {t("已载入自定义字体")}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3" data-param-key={param.key}>
      <span className="field-label min-w-0 flex-1 truncate">{t(param.label)}</span>
      <Input
        className="max-w-[190px]"
        value={String(value ?? "")}
        placeholder={param.placeholder ? t(param.placeholder) : undefined}
        onChange={(event) => studio.actions.setParamValue(param.key, event.target.value)}
      />
    </div>
  )
}
