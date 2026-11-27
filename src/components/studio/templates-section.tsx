import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ChevronDownIcon, WandSparklesIcon } from "lucide-react"
import { useI18n } from "@/i18n"
import type { StudioApi } from "@/hooks/useStudio"
import { TEMPLATE_TYPE_LABELS } from "@/lib/templates"
import type { TemplateGroupMode } from "@/lib/templates"
import type { Template } from "@/lib/types"
import { cn } from "cn"

const COLLAPSE_KEY = "liubai-template-groups-collapsed"
const BUILTIN_GROUP_KEY = "__builtin__"

function MoreIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden="true">
      <circle cx="3" cy="8" r="1.35" />
      <circle cx="8" cy="8" r="1.35" />
      <circle cx="13" cy="8" r="1.35" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.75 4.25h10.5M6 4.25V2.75h4v1.5M4.25 4.25l.5 8.5c.03.5.4.9.9.9h5.2c.5 0 .87-.4.9-.9l.5-8.5M6.5 6.75v4.25M9.5 6.75v4.25" />
    </svg>
  )
}

// Imported Reeden templates often carry their category in the declared name
// (e.g. "X 暗夜私信 · 主题预览"). The group heading already says that, so strip
// the redundant suffix before showing the name on its card.
function cleanTemplateName(name: string, group: string) {
  if (!group) return name
  const escaped = group.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return name
    .replace(new RegExp(`\\s*[·•\\-—–]\\s*${escaped}\\s*$`, "u"), "")
    .trim()
}

function readCollapsed(): string[] {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
  } catch {
    return []
  }
}

export function TemplatesSection({ studio }: { studio: StudioApi }) {
  const { actions } = studio
  const { t, language } = useI18n()
  const [dataOpen, setDataOpen] = useState(false)
  const [groupMode, setGroupMode] = useState<TemplateGroupMode>("builtin")
  const [dataText, setDataText] = useState("")
  const [dataError, setDataError] = useState("")
  const [collapsed, setCollapsed] = useState<string[]>(readCollapsed)
  const [menuKey, setMenuKey] = useState<string | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<{ left: number; top: number; bottom: number; width: number } | null>(null)
  const [menuTop, setMenuTop] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [moveGroupDraft, setMoveGroupDraft] = useState("")
  const [confirmMenuDelete, setConfirmMenuDelete] = useState(false)
  const [confirmGroupKey, setConfirmGroupKey] = useState<string | null>(null)
  const [pressKey, setPressKey] = useState<string | null>(null)
  const pressTimer = useRef(0)
  const pressFired = useRef(false)
  const cardRefs = useRef(new Map<string, HTMLDivElement>())

  const current = studio.currentTpl
  const showDataEditor = !!current?.imported && current.type !== "themePreview"
  const groupOf = (template: Template) => template.group?.trim() || t("导入模板")
  const isCollapsed = (key: string) => collapsed.includes(key)
  const groupModeLabel =
    groupMode === "folder" ? t("导入文件夹名称") : groupMode === "file" ? t("文件名") : t("内置名称")

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed))
    } catch {
      // Group folding is a convenience; ignore private-mode storage failures.
    }
  }, [collapsed])

  useEffect(() => () => window.clearTimeout(pressTimer.current), [])

  useEffect(() => {
    if (!menuKey) return
    const close = () => setMenuKey(null)
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest("[data-template-menu]")) return
      const card = target?.closest("[data-template-card]")
      if (card?.getAttribute("data-template-card") !== menuKey) close()
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    // Ignore the scroll burst that can happen while the menu is being opened,
    // plus any scroll produced by the menu's own overflow area.
    let scrollArmed = false
    const armTimer = window.setTimeout(() => {
      scrollArmed = true
    }, 200)
    const closeOnScroll = (event: Event) => {
      if (!scrollArmed) return
      const target = event.target as HTMLElement | null
      if (target?.closest?.("[data-template-menu]")) return
      close()
    }
    document.addEventListener("pointerdown", closeOnOutside)
    document.addEventListener("keydown", closeOnEscape)
    window.addEventListener("scroll", closeOnScroll, true)
    window.addEventListener("resize", close)
    window.requestAnimationFrame(() => menuRef.current?.focus({ preventScroll: true }))
    return () => {
      window.clearTimeout(armTimer)
      document.removeEventListener("pointerdown", closeOnOutside)
      document.removeEventListener("keydown", closeOnEscape)
      window.removeEventListener("scroll", closeOnScroll, true)
      window.removeEventListener("resize", close)
    }
  }, [menuKey])

  // Measure the real menu height so the flip decision is accurate at any viewport.
  useLayoutEffect(() => {
    if (!menuKey || !menuAnchor || !menuRef.current) return
    const height = menuRef.current.offsetHeight
    setMenuTop(
      menuAnchor.bottom + 6 + height > window.innerHeight - 8
        ? Math.max(8, menuAnchor.top - height - 6)
        : menuAnchor.bottom + 6,
    )
  }, [menuKey, menuAnchor])

  useEffect(() => {
    if (showDataEditor) setDataText(JSON.stringify(current?.mock ?? {}, null, 2))
    setDataError("")
  }, [current?.key, current?.mock, showDataEditor, language])

  const builtIns = studio.templates.filter((item) => !item.imported)
  const importedGroups = useMemo(() => {
    const groups = new Map<string, Template[]>()
    studio.templates.filter((item) => item.imported).forEach((item) => {
      const group = item.group?.trim() || t("导入模板")
      const list = groups.get(group) ?? []
      list.push(item)
      groups.set(group, list)
    })
    return Array.from(groups.entries())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studio.templates, language])

  function toggleGroup(key: string) {
    setCollapsed((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]))
  }

  function openMenu(key: string) {
    const card = cardRefs.current.get(key)
    if (!card) return
    const rect = card.getBoundingClientRect()
    setMenuAnchor({ left: rect.left, top: rect.top, bottom: rect.bottom, width: rect.width })
    setMenuTop(null)
    setMenuKey(key)
    setMoveGroupDraft("")
    setConfirmMenuDelete(false)
    setConfirmGroupKey(null)
  }

  function startPress(key: string) {
    window.clearTimeout(pressTimer.current)
    pressFired.current = false
    setPressKey(key)
    pressTimer.current = window.setTimeout(() => {
      pressFired.current = true
      setPressKey(null)
      openMenu(key)
    }, 450)
  }

  function endPress() {
    window.clearTimeout(pressTimer.current)
    setPressKey(null)
  }

  function applyData(): boolean {
    try {
      const parsed: unknown = JSON.parse(dataText)
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(t("模板数据必须是 JSON 对象"))
      }
      actions.updateTemplateData(parsed as Record<string, unknown>)
      setDataError("")
      return true
    } catch (error) {
      setDataError(error instanceof Error ? error.message : t("JSON 格式不正确"))
      return false
    }
  }

  function menuTopFor(height: number) {
    if (!menuAnchor) return 8
    return menuAnchor.bottom + 6 + height > window.innerHeight - 8
      ? Math.max(8, menuAnchor.top - height - 6)
      : menuAnchor.bottom + 6
  }

  function renderMenu(template: Template) {
    if (!menuAnchor) return null
    const group = groupOf(template)
    const members = studio.templates.filter((item) => item.imported && groupOf(item) === group)
    const position = members.findIndex((item) => item.key === template.key)
    const groupNames = importedGroups.map(([name]) => name)
    if (!groupNames.includes(group)) groupNames.unshift(group)

    // Portal to <body>: the accordion panel clips overflow and hid the delete action.
    const menuWidth = Math.max(220, Math.min(menuAnchor.width, 360))
    const left = Math.max(8, Math.min(menuAnchor.left, window.innerWidth - menuWidth - 8))
    const top = menuTop ?? menuTopFor(190)

    function close() {
      setMenuKey(null)
    }

    function reorder(direction: "up" | "down") {
      actions.moveTemplate(template.key, direction)
      // Keep the menu open for consecutive moves, re-anchored to the new card position.
      window.requestAnimationFrame(() => openMenu(template.key))
    }

    return createPortal(
      <div
        ref={menuRef}
        data-template-menu
        tabIndex={-1}
        className="fixed z-[100] max-h-[calc(100vh-16px)] overflow-y-auto rounded-lg border border-border bg-background p-2 shadow-xl outline-none"
        style={{ left, top, width: menuWidth }}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="mb-2 flex items-center gap-2 px-0.5">
          <span className="min-w-0 flex-1 truncate text-xs font-medium" title={template.name}>
            {template.name}
          </span>
          <span
            className="max-w-[45%] shrink-0 truncate rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
            title={group}
          >
            {group}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="justify-center gap-1.5 disabled:opacity-45"
            disabled={position <= 0}
            onClick={() => reorder("up")}
          >
            <span aria-hidden="true" className="text-sm leading-none">↑</span>
            {t("上移")}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="justify-center gap-1.5 disabled:opacity-45"
            disabled={position < 0 || position >= members.length - 1}
            onClick={() => reorder("down")}
          >
            <span aria-hidden="true" className="text-sm leading-none">↓</span>
            {t("下移")}
          </Button>
        </div>

        <div className="my-2 h-px bg-border" />

        <div className="space-y-1.5">
          <p className="px-0.5 text-[10px] text-muted-foreground">{t("移动到分组")}</p>
          <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto">
            {groupNames.map((name) => (
              <Button
                key={name}
                type="button"
                size="xs"
                variant={name === group ? "secondary" : "outline"}
                className="max-w-full gap-1"
                onClick={() => {
                  actions.moveTemplateToGroup(template.key, name)
                  close()
                }}
              >
                {name === group ? <span aria-hidden="true" className="text-[10px]">✓</span> : null}
                <span className="truncate">{t(name)}</span>
              </Button>
            ))}
          </div>
          <div className="flex gap-1">
            <Input
              className="h-7 text-xs"
              value={moveGroupDraft}
              onChange={(event) => setMoveGroupDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                actions.moveTemplateToGroup(template.key, moveGroupDraft)
                close()
              }}
              placeholder={t("新建分组")}
              aria-label={t("新分组名称")}
            />
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => {
                actions.moveTemplateToGroup(template.key, moveGroupDraft)
                close()
              }}
            >
              {t("移动")}
            </Button>
          </div>
        </div>

        <div className="my-2 h-px bg-border" />

        <Button
          type="button"
          size="xs"
          variant={confirmMenuDelete ? "destructive" : "outline"}
          className={cn(
            "w-full justify-center gap-1.5",
            !confirmMenuDelete && "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive",
          )}
          onClick={() => {
            if (!confirmMenuDelete) {
              setConfirmMenuDelete(true)
              return
            }
            actions.deleteTemplate(template.key)
            close()
          }}
        >
          <TrashIcon />
          {confirmMenuDelete ? t("再次点击确认删除") : t("删除此模板")}
        </Button>
      </div>,
      document.body,
    )
  }

  function renderCard(template: Template, compact = false) {
    const active = current?.key === template.key
    const extra = studio.shots.length - template.count
    const typeLabel = template.imported
      ? t(TEMPLATE_TYPE_LABELS[template.type ?? ""] ?? template.type ?? t("导入模板"))
      : ""
    const group = template.imported ? groupOf(template) : ""
    const displayName = template.imported ? cleanTemplateName(template.name, group) || typeLabel : t(template.name)
    // Counts belong to the five top-level items only; sub-items show names and types.
    const statusLabel = template.imported && typeLabel !== group ? typeLabel : ""

    return (
      <div
        key={template.key}
        ref={(node) => {
          if (node) cardRefs.current.set(template.key, node)
          else cardRefs.current.delete(template.key)
        }}
        className="relative min-w-0"
        data-template-card={template.imported ? template.key : undefined}
      >
        <Button
          type="button"
          variant="outline"
          size="lg"
          className={cn(
            "tpl-card h-auto w-full min-w-0 text-left transition-transform",
            compact ? "flex-row items-center gap-2 p-2.5" : "flex-col items-start gap-0 p-3",
            active && "border-primary bg-accent",
            pressKey === template.key && "scale-[0.98] opacity-80",
            menuKey === template.key && "ring-2 ring-primary",
          )}
          data-active={active}
          title={statusLabel ? `${displayName} · ${statusLabel}` : displayName}
          onPointerDown={(event) => {
            if (event.pointerType === "mouse" && event.button !== 0) return
            startPress(template.key)
          }}
          onPointerUp={endPress}
          onPointerCancel={endPress}
          onPointerLeave={endPress}
          onContextMenu={(event) => {
            event.preventDefault()
            endPress()
            if (template.imported) openMenu(template.key)
          }}
          onClick={(event) => {
            if (pressFired.current) {
              pressFired.current = false
              event.preventDefault()
              return
            }
            if (extra > 0 && !template.imported) {
              actions.notify(
                t("这套模板有 {count} 个位置，{extra} 张不会出现在作品里（素材仍保留）", { count: template.count, extra }),
              )
            }
            actions.selectTemplate(template)
          }}
        >
          {compact ? (
            <span className="min-w-0 flex-1 pr-4">
              <span className="block w-full truncate text-xs font-semibold">{displayName}</span>
              {statusLabel ? (
                <span className="block w-full truncate text-xs text-muted-foreground">{statusLabel}</span>
              ) : null}
            </span>
          ) : (
            <>
              <span className="mt-1.5 block w-full truncate text-xs font-semibold">{displayName}</span>
              {statusLabel ? (
                <span className="block w-full truncate text-xs text-muted-foreground">{statusLabel}</span>
              ) : null}
            </>
          )}
        </Button>

        {template.imported ? (
          <button
            type="button"
            aria-label={t("模板操作")}
            title={t("模板操作")}
            className={cn(
              "absolute right-1 top-1.5 z-10 flex size-7 items-center justify-center rounded-md text-muted-foreground transition",
              menuKey === template.key
                ? "bg-muted text-foreground"
                : "opacity-60 hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:opacity-100",
            )}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              endPress()
              if (menuKey === template.key) setMenuKey(null)
              else openMenu(template.key)
            }}
          >
            <MoreIcon />
          </button>
        ) : null}
        {template.imported && menuKey === template.key ? renderMenu(template) : null}
      </div>
    )
  }

  function renderGroup(title: string, groupKey: string, items: Template[], compact = false) {
    const closed = isCollapsed(groupKey)
    const deletable = groupKey !== BUILTIN_GROUP_KEY
    const confirming = confirmGroupKey === groupKey
    return (
      <div>
        <div className="mb-1.5 flex w-full items-center gap-1.5 rounded-md border border-border/60 bg-muted/35 px-1.5 py-1">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
            aria-expanded={!closed}
            onClick={() => {
              setConfirmGroupKey(null)
              toggleGroup(groupKey)
            }}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="w-3 shrink-0 text-[11px] leading-none text-muted-foreground">{closed ? "▸" : "▾"}</span>
              <span className="block min-w-0 truncate text-xs font-semibold">{t(title)}</span>
            </span>
          </button>
          {deletable ? (
            <button
              type="button"
              className={cn(
                "flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-[10px] transition",
                confirming
                  ? "bg-destructive text-destructive-foreground"
                  : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
              )}
              aria-label={t("删除分组")}
              title={t("删除分组")}
              onClick={() => {
                if (!confirming) {
                  setConfirmGroupKey(groupKey)
                  return
                }
                actions.deleteTemplateGroup(groupKey)
                setConfirmGroupKey(null)
              }}
            >
              {confirming ? t("确认删除分组") : <TrashIcon />}
            </button>
          ) : null}
        </div>
        {!closed ? (
          <div className="ml-1.5 pl-2 pt-0.5">
            {compact ? (
              <div className="space-y-2">{items.map((item) => renderCard(item, true))}</div>
            ) : (
              <div className="grid min-w-0 grid-cols-2 gap-2">{items.map((item) => renderCard(item))}</div>
            )}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div>
      <div className="space-y-3">
        {builtIns.length ? renderGroup("内置排版", BUILTIN_GROUP_KEY, builtIns, true) : null}
        {importedGroups.map(([group, items]) => renderGroup(group, group, items, true))}
      </div>

      <div className="mt-3 flex items-stretch">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-w-0 flex-1 justify-center gap-1.5 rounded-r-none"
          onClick={() => actions.autoGroupTemplates(groupMode)}
          title={t("按 {mode} 自动分组", { mode: groupModeLabel })}
        >
          <WandSparklesIcon />
          <span className="truncate">{t("自动分组")}</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="sm"
                variant="outline"
                className="-ml-px w-8 shrink-0 rounded-l-none px-0"
                title={t("自动分组方式")}
                aria-label={t("自动分组方式")}
              >
                <ChevronDownIcon />
              </Button>
            }
          />
          <DropdownMenuContent>
            {(["builtin", "folder", "file"] as const).map((mode) => (
              <DropdownMenuItem
                key={mode}
                onClick={() => {
                  setGroupMode(mode)
                  actions.autoGroupTemplates(mode)
                }}
              >
                {t(mode === "builtin" ? "内置名称" : mode === "folder" ? "导入文件夹名称" : "文件名")}
                {mode === groupMode ? <span className="ml-auto text-xs text-muted-foreground">✓</span> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="hint-text mt-2">{studio.templateImportStatus}</p>

      {showDataEditor ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 w-full justify-between"
          onClick={() => setDataOpen(true)}
        >
          <span>{t("编辑模板数据")}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">JSON</span>
        </Button>
      ) : null}

      <p className="hint-text mt-3">{studio.tplHint}</p>

      <Dialog open={dataOpen} onOpenChange={setDataOpen}>
        <DialogContent className="flex max-h-[min(80vh,640px)] w-[min(720px,calc(100vw-2rem))] max-w-none flex-col overflow-hidden sm:max-w-none">
          <DialogHeader>
            <DialogTitle>{t("模板数据")}</DialogTitle>
            <DialogDescription>
              {t("此类模板使用内置示例数据渲染；改这里即可替换海报里的文字与条目。")}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={dataText}
            onChange={(event) => setDataText(event.target.value)}
            className="min-h-64 flex-1 font-mono text-xs"
            aria-label={t("模板数据 JSON")}
            spellCheck={false}
          />
          {dataError ? <p className="text-xs text-destructive">{dataError}</p> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDataText(JSON.stringify(current?.mock ?? {}, null, 2))
                setDataError("")
              }}
            >
              {t("还原")}
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (applyData()) setDataOpen(false)
              }}
            >
              {t("应用模板数据")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
