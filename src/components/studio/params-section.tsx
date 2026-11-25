import { useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronRight, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import type { TemplateParam } from "@/lib/types"
import { cn } from "cn"

// Core groups stay open; fine-tuning groups start collapsed to cut down the
// 44-control wall. Users can still expand anything, and the choice persists.
const CORE_GROUPS = new Set(["展映", "外观", "卡片外观", "图文排版"])
const COLLAPSED_KEY = "liubai-param-collapsed-groups"

function readCollapsed(): Record<string, boolean> | null {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}

export function ParamsSection({ studio, groups }: { studio: StudioApi; groups: Array<{ name: string; items: TemplateParam[] }> }) {
  const [query, setQuery] = useState("")
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const saved = readCollapsed()
    if (saved) return saved
    const initial: Record<string, boolean> = {}
    groups.forEach((group) => {
      if (!CORE_GROUPS.has(group.name)) initial[group.name] = true
    })
    return initial
  })

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed))
    } catch {
      // Storage may be unavailable; collapse state is a convenience only.
    }
  }, [collapsed])

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!q) return groups
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
  }, [groups, q])

  const totalCount = groups.reduce((sum, group) => sum + group.items.length, 0)
  const matchedCount = filtered.reduce((sum, group) => sum + group.items.length, 0)

  function toggle(name: string) {
    setCollapsed((current) => ({ ...current, [name]: !current[name] }))
  }

  function setAll(open: boolean) {
    const next: Record<string, boolean> = {}
    groups.forEach((group) => {
      next[group.name] = !open
    })
    setCollapsed(next)
  }

  if (!studio.currentTpl) return <p className="hint-text">先选择一套模板。</p>
  if (!groups.length) return <p className="hint-text">当前没有可用参数。</p>

  return (
    <div className="space-y-4">
      <div>
        <h4 className="section-subtitle">风格预设</h4>
        <div className="flex flex-wrap gap-1.5">
          {STYLE_PRESETS.map((preset) => (
            <Button
              key={preset.key}
              size="sm"
              variant={studio.activePreset === preset.key ? "default" : "outline"}
              className="h-7 px-2.5 text-xs"
              title={preset.desc}
              onClick={() => studio.actions.applyPreset(preset.key)}
            >
              {preset.name}
            </Button>
          ))}
        </div>
        <p className="hint-text mt-2">一键套用整组参数；手动调整后预设状态自动取消。</p>
      </div>

      <div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索参数名或标识…"
            className="h-8 pl-8 text-xs"
            aria-label="搜索参数"
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="hint-text">
            {q ? `匹配 ${matchedCount} 项` : `${groups.length} 组 · ${totalCount} 项`}
          </span>
          <div className="flex shrink-0 gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[11px]"
              onClick={() => setAll(true)}
            >
              全部展开
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[11px]"
              onClick={() => setAll(false)}
            >
              全部收起
            </Button>
          </div>
        </div>
      </div>

      {filtered.map((group) => {
        const open = q ? true : !collapsed[group.name]
        return (
          <div key={group.name}>
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-xs font-medium",
                "hover:bg-muted/60 transition-colors",
              )}
              onClick={() => {
                if (!q) toggle(group.name)
              }}
              aria-expanded={open}
              data-param-group={group.name}
            >
              {open ? (
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate">{group.name}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {group.items.length}
              </span>
            </button>
            {open && (
              <div className="mt-1.5 space-y-2 pl-1">
                {group.items.map((param) => (
                  <ParamControl key={param.key} studio={studio} param={param} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function ParamControl({ studio, param }: { studio: StudioApi; param: TemplateParam }) {
  const value = studio.paramValue(param.key) ?? param.def
  if (param.type === "switch") {
    const checked = value === true || value === "true"
    return (
      <div className="flex items-center gap-3" data-param-key={param.key}>
        <Switch
          checked={checked}
          onCheckedChange={(next) => studio.actions.setParamValue(param.key, next)}
          aria-label={param.label}
        />
        <span className="field-label">{param.label}</span>
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
          ? { value: pair.slice(0, divider), label: pair.slice(divider + 1) }
          : { value: pair, label: pair }
      })
    return (
      <div className="flex items-center gap-3" data-param-key={param.key}>
        <span className="field-label min-w-0 flex-1 truncate">{param.label}</span>
        <Select
          value={String(value)}
          onValueChange={(next) => studio.actions.setParamValue(param.key, String(next))}
        >
          <SelectTrigger size="sm" className="w-[190px]">
            <SelectValue placeholder="选择" />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
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
        <span className="field-label min-w-0 flex-1 truncate">{param.label}</span>
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
          aria-label={param.label}
        />
        <span className="w-9 text-right font-mono text-xs text-muted-foreground">{number}</span>
      </div>
    )
  }

  if (param.type === "color") {
    return (
      <div className="flex items-center gap-3" data-param-key={param.key}>
        <span className="field-label min-w-0 flex-1 truncate">{param.label}</span>
        <input
          type="color"
          className="size-7 cursor-pointer rounded-md border border-input bg-background p-0.5"
          value={hexNorm(value) ?? "#000000"}
          onChange={(event) => studio.actions.setParamValue(param.key, event.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => studio.actions.setParamValue(param.key, "")}
        >
          自动
        </Button>
      </div>
    )
  }

  if (param.type === "image" || param.type === "font") {
    const isFont = param.type === "font"
    const accept = isFont ? ".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" : "image/*"
    const hasValue = typeof value === "string" && value.length > 0
    return (
      <div className="space-y-1.5" data-param-key={param.key}>
        <div className="flex items-center gap-3">
          <span className="field-label min-w-0 flex-1 truncate">{param.label}</span>
          <label className="inline-flex h-8 shrink-0 cursor-pointer items-center rounded-md border border-input bg-background px-2.5 text-xs font-medium transition-colors hover:bg-accent">
            {hasValue ? "更换" : "选择文件"}
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
                  studio.actions.notify("图片文件请小于 6MB")
                  return
                }
                const reader = new FileReader()
                reader.onload = () => {
                  const result = reader.result
                  if (typeof result === "string") {
                    studio.actions.setParamValue(param.key, result)
                    studio.actions.notify(isFont ? "字体已载入" : "水印图片已载入")
                  }
                }
                reader.onerror = () => studio.actions.notify("文件读取失败")
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
            alt="水印预览"
            className="ml-auto block h-10 w-10 rounded border border-border object-contain"
          />
        )}
        {hasValue && isFont && (
          <span className="ml-auto block text-right font-mono text-[10px] text-muted-foreground">
            已载入自定义字体
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3" data-param-key={param.key}>
      <span className="field-label min-w-0 flex-1 truncate">{param.label}</span>
      <Input
        className="max-w-[190px]"
        value={String(value ?? "")}
        placeholder={param.placeholder}
        onChange={(event) => studio.actions.setParamValue(param.key, event.target.value)}
      />
    </div>
  )
}
