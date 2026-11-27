import { useMemo, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import {
  ChevronDownIcon,
  CircleHelpIcon,
  DownloadIcon,
  FolderOpenIcon,
  MonitorIcon,
  MoonIcon,
  Redo2Icon,
  SunIcon,
  Undo2Icon,
  UploadIcon,
} from "lucide-react"
import { Accordion, AccordionContent, AccordionItem } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Toaster } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useStudio } from "@/hooks/useStudio"
import { useUiTheme } from "@/hooks/useUiTheme"
import { useI18n } from "@/i18n"
import type { UiTheme } from "@/hooks/useUiTheme"
import { CAPTION_PRESETS } from "@/lib/constants"
import type { ColorKey } from "@/lib/constants"
import type { TemplateParam } from "@/lib/types"
import { cn } from "cn"
import { AssetsSection } from "./components/studio/assets-section"
import { ColorPickerDialog } from "./components/studio/color-picker-dialog"
import { ColorSection } from "./components/studio/color-section"
import { ExportSection } from "./components/studio/export-section"
import { ParamsSection } from "./components/studio/params-section"
import {
  EyeIcon,
  FitIcon,
  FloatIcon,
  IconButton,
  MinusIcon,
  PlusIcon,
  SectionTrigger,
  SlidersIcon,
} from "./components/studio/shared"
import { TemplatesSection } from "./components/studio/templates-section"

type ParamGroup = { name: string; label: string; items: TemplateParam[] }

const themeCycle: { value: UiTheme; label: string; icon: typeof SunIcon }[] = [
  { value: "light", label: "浅色", icon: SunIcon },
  { value: "dark", label: "深色", icon: MoonIcon },
  { value: "system", label: "跟随系统", icon: MonitorIcon },
]

function ThemeToggle({
  theme,
  onCycle,
}: {
  theme: UiTheme
  onCycle: (theme: UiTheme) => void
}) {
  const { t } = useI18n()
  const index = themeCycle.findIndex((item) => item.value === theme)
  const current = themeCycle[index] ?? themeCycle[2]
  const next = themeCycle[(index + 1) % themeCycle.length]
  const currentLabel = t(current.label)
  const nextLabel = t(next.label)
  const Icon = current.icon
  return (
    <Button
      size="sm"
      variant="outline"
      className="w-9 px-0"
      onClick={() => onCycle(next.value)}
      title={t("界面主题：{current}（点击切换为{next}）", { current: currentLabel, next: nextLabel })}
      aria-label={t("界面主题：{current}，点击切换为{next}", { current: currentLabel, next: nextLabel })}
    >
      <Icon />
    </Button>
  )
}

function HelpSection({
  title,
  ordered = false,
  children,
}: {
  title: string
  ordered?: boolean
  children: ReactNode
}) {
  const List = ordered ? "ol" : "ul"
  return (
    <section className="rounded-xl border border-border/70 bg-card p-3">
      <h3 className="mb-2 text-xs font-semibold text-foreground">{title}</h3>
      <List
        className={cn(
          "space-y-1.5 pl-4 text-xs leading-5 text-muted-foreground",
          ordered ? "list-decimal" : "list-disc",
        )}
      >
        {children}
      </List>
    </section>
  )
}

export default function App() {
  return (
    <TooltipProvider>
      <div className="h-full w-full bg-background text-foreground">
        <Studio />
      </div>
      <Toaster />
    </TooltipProvider>
  )
}

function Studio() {
  const studio = useStudio()
  const uiTheme = useUiTheme()
  const { t, language, toggleLanguage } = useI18n()
  const [helpOpen, setHelpOpen] = useState(false)
  const [resetArmed, setResetArmed] = useState(false)
  const resetTimer = useRef<number | undefined>(undefined)
  const disarmReset = () => {
    if (resetTimer.current !== undefined) {
      window.clearTimeout(resetTimer.current)
      resetTimer.current = undefined
    }
    setResetArmed(false)
  }
  const { refs, actions } = studio

  const groupedParams = useMemo<ParamGroup[]>(() => {
    const groups: ParamGroup[] = []
    studio.currentTpl?.params.forEach((param) => {
      // Keep hidden params in the model so search can find them; the params
      // panel decides visibility per render (and marks them when searched).
      let group = groups.find((item) => item.name === param.group)
      if (!group) {
        group = { name: param.group, label: t(param.group), items: [] }
        groups.push(group)
      }
      group.items.push(param)
    })
    return groups
  }, [studio.currentTpl, studio.params, language])

  const brandIcon = useMemo(() => {
    const href = document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href
    return href || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"
  }, [])

  return (
    <div className="relative flex h-full flex-col">
      <header className="studio-top">
        <div className="flex min-w-0 items-center gap-3">
          <img className="studio-mark" src={brandIcon} alt={t("留白")} />
          <div className="min-w-0">
            <div className="studio-brand">{t("留白")}</div>
            <div className="studio-subbrand">SCREENSHOT STUDIO</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="top-help"
            onClick={() => setHelpOpen(true)}
            title={t("使用说明")}
            aria-label={t("使用说明")}
          >
            <CircleHelpIcon />
            <span className="top-help-text">{t("说明")}</span>
          </Button>
          <ThemeToggle theme={uiTheme.theme} onCycle={uiTheme.setTheme} />
          <Button
            size="sm"
            variant="outline"
            className="w-9 px-0 font-mono text-xs"
            onClick={toggleLanguage}
            title={language === "zh" ? "Switch to English" : "切换到中文"}
            aria-label={language === "zh" ? "Switch to English" : "切换到中文"}
          >
            {language === "zh" ? "中" : "EN"}
          </Button>
          <div className="top-import-group">
            <Button
              size="sm"
              variant="outline"
              className="top-import rounded-r-none"
              onClick={() => refs.unifiedFile.current?.click()}
              title={t("导入图片、模板、配色、项目或字体，自动放入对应面板")}
            >
              <UploadIcon />
              <span className="top-import-text">{t("导入")}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    size="sm"
                    variant="outline"
                    className="top-import-arrow w-7 rounded-l-none border-l-0 px-0"
                    title={t("更多导入方式")}
                    aria-label={t("更多导入方式")}
                  >
                    <ChevronDownIcon />
                  </Button>
                }
              />
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => refs.unifiedFile.current?.click()}>
                  <UploadIcon />
                  {t("导入文件")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => refs.folderFile.current?.click()}>
                  <FolderOpenIcon />
                  {t("导入模板文件夹")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <input
            ref={refs.unifiedFile}
            type="file"
            multiple
            accept="image/*,.html,.htm,text/html,.json,application/json,.txt,.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? [])
              event.target.value = ""
              if (files.length) void actions.importFiles(files)
            }}
          />
          <input
            ref={refs.folderFile}
            type="file"
            multiple
            {...{ webkitdirectory: "" }}
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []).filter(
                (file) => /\.html?$/i.test(file.name) || file.type === "text/html",
              )
              event.target.value = ""
              if (files.length) void actions.importFiles(files)
            }}
          />
          <Button size="sm" variant="outline" onClick={() => studio.setProjectOpen(true)}>
            {t("项目")}
          </Button>
          <Button
            size="sm"
            className="top-video"
            onClick={actions.focusExport}
            title={t("打开导出面板：PNG / 视频 / 批量 ZIP")}
          >
            {t("导出")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="mobile-only top-export-icon w-9 px-0"
            onClick={actions.focusExport}
            title={t("打开导出面板：PNG / 视频 / 批量 ZIP")}
            aria-label={t("打开导出面板")}
          >
            <DownloadIcon />
          </Button>
        </div>
      </header>

      <Tabs
        value={studio.mobileTab}
        onValueChange={(value) => studio.setMobileTab(value as "side" | "main")}
      >
        <TabsList className="mobile-tabs">
          <TabsTrigger value="side">
            <SlidersIcon />
            {t("设置")}
          </TabsTrigger>
          <TabsTrigger value="main">
            <EyeIcon />
            {t("预览")}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="studio-layout">
        <aside
          ref={refs.side}
          className="studio-side studio-scroll"
          data-hidden={studio.mobileTab === "main"}
        >
          <ScrollArea className="h-full w-full">
            <Accordion
              multiple
              value={studio.accordionValue}
              onValueChange={actions.onAccordionChange}
              className="studio-accordion"
            >
              <AccordionItem value="color">
                <SectionTrigger index="01" title={t("配色")} badge={studio.colorStatus} />
                <AccordionContent className="section-panel">
                  <ColorSection studio={studio} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="assets">
                <SectionTrigger index="02" title={t("素材")} badge={t("{count} 张", { count: studio.shots.length })} />
                <AccordionContent className="section-panel">
                  <AssetsSection studio={studio} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="templates">
                <SectionTrigger index="03" title={t("排版模板")} badge={t("{count} 套", { count: studio.templates.length })} />
                <AccordionContent className="section-panel">
                  <TemplatesSection studio={studio} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="params">
                <SectionTrigger index="04" title={t("模板参数")} badge={t("{count} 组", { count: groupedParams.length })} />
                <AccordionContent className="section-panel">
                  <ParamsSection studio={studio} groups={groupedParams} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="export" data-export-panel>
                <SectionTrigger index="05" title={t("导出")} badge={studio.exporting ? t("进行中") : ""} />
                <AccordionContent className="section-panel">
                  <ExportSection studio={studio} />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </ScrollArea>
        </aside>

        <main ref={refs.pvwrap} className="studio-main">
          <div className="preview-bar">
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{studio.status}</span>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => actions.undo()}
                disabled={!studio.canUndo}
                title={t("撤销 (Ctrl/Cmd+Z)")}
                aria-label={t("撤销")}
              >
                <Undo2Icon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => actions.redo()}
                disabled={!studio.canRedo}
                title={t("重做 (Ctrl/Cmd+Shift+Z)")}
                aria-label={t("重做")}
              >
                <Redo2Icon />
              </Button>
              <span className="mx-0.5 h-4 w-px bg-border" />
              <span className="preview-zoom">
                <IconButton label={t("缩小")} onClick={() => actions.setZoom(studio.zoom - 0.1)}>
                  <MinusIcon />
                </IconButton>
                <span className="w-11 text-center font-mono text-xs text-foreground">
                  {Math.round(studio.zoom * 100)}%
                </span>
                <IconButton label={t("放大")} onClick={() => actions.setZoom(studio.zoom + 0.1)}>
                  <PlusIcon />
                </IconButton>
              </span>
              <IconButton label={t("适应窗口并复位位置")} onClick={actions.fitZoom}>
                <FitIcon />
              </IconButton>
              <IconButton
                label={t(studio.floatOpen ? "关闭悬浮预览" : "悬浮预览")}
                onClick={() => actions.openFloat()}
              >
                <FloatIcon />
              </IconButton>
            </div>
          </div>
          <div ref={refs.pvscroll} className="preview-wrap">
            <div ref={refs.pvstage} className="preview-stage" />
          </div>
        </main>
      </div>

      {createPortal(
        <>
          <div
            ref={refs.floatWin}
            className={cn(
              "float-window",
              studio.floatOpen && "on",
              studio.floatMin && "min",
              studio.floatBig && "big",
              studio.floatCompact && "compact",
            )}
          >
            <div ref={refs.floatHead} className="float-head">
              <span className="truncate text-xs font-medium">{t("留白 · 预览")}</span>
              <div className="ml-auto flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => actions.zoomFloatBy(-1)}
                  title={t("缩小（滚轮）")}
                >
                  <MinusIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => actions.zoomFloatBy(1)}
                  title={t("放大（滚轮）")}
                >
                  <PlusIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => studio.setFloatMin(!studio.floatMin)}
                  title={t("最小化")}
                >
                  —
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => studio.setFloatBig(!studio.floatBig)}
                  title={t(studio.floatBig ? "还原" : "全屏")}
                >
                  ⤢
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => actions.openFloat(false)}
                  title={t("关闭")}
                >
                  ×
                </Button>
              </div>
            </div>
            <div ref={refs.floatBody} className="float-body">
              <div ref={refs.floatInner} className="float-inner">
                <iframe ref={refs.floatPreview} title={t("悬浮预览")} className="block border-0" />
              </div>
            </div>
            <div ref={refs.floatGrip} className="float-grip" title={t("拖拽调整窗口大小")} />
          </div>

          <div ref={refs.snapLeft} className="snap-line left" data-on="false" />
          <div ref={refs.snapRight} className="snap-line right" data-on="false" />
        </>,
        document.body,
      )}

      <datalist id="captionPresets">
        {CAPTION_PRESETS.map((item) => <option key={item} value={t(item)} />)}
      </datalist>

      <Dialog
        open={studio.projectOpen}
        onOpenChange={(open) => {
          if (!open) disarmReset()
          studio.setProjectOpen(open)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("项目文件")}</DialogTitle>
            <DialogDescription>
              {t("项目文件包含素材、模板、参数与配色，可完整恢复。")}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button size="sm" onClick={actions.saveProject}>{t("保存项目文件")}</Button>
            <Button size="sm" variant="outline" onClick={() => refs.unifiedFile.current?.click()}>
              {t("载入项目文件")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void actions.clearDraft()}>
              {t("清空草稿")}
            </Button>
            <Button
              size="sm"
              variant={resetArmed ? "destructive" : "outline"}
              title={t("恢复所有设置到初始状态（可用撤销恢复）")}
              onClick={() => {
                if (resetArmed) {
                  void actions.resetAll().then(() => {
                    disarmReset()
                    studio.setProjectOpen(false)
                  })
                } else {
                  setResetArmed(true)
                  resetTimer.current = window.setTimeout(() => {
                    resetTimer.current = undefined
                    setResetArmed(false)
                  }, 4000)
                }
              }}
            >
              {t(resetArmed ? "确认全部重置？" : "全部重置")}
            </Button>
          </div>
          <p className="hint-text mt-3 text-emerald-600 dark:text-emerald-400">
            ● {studio.draftStatus}
          </p>
          <p className="hint-text mt-3">{studio.projStatus}</p>
        </DialogContent>
      </Dialog>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t("使用说明")}</DialogTitle>
            <DialogDescription>
              {t("从素材到导出，几步完成一份截图作品。")}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <HelpSection title={t("1 · 快速开始")} ordered>
                <li>{t("在「素材」导入截图；支持一次选择多张，导入不会改动已有配色。")}</li>
                <li>{t("在「排版模板」挑选版式；素材数量变化时会自动切换到能容纳的模板。")}</li>
                <li>{t("用「模板参数」「配色」微调视觉，再点顶栏「导出」输出 PNG、视频或批量 ZIP。")}</li>
              </HelpSection>

              <HelpSection title={t("2 · 素材与配色")}>
                <li>{t("素材支持 PNG / JPG / WEBP；HEIC 请先转为 JPG。拖动缩略图可调整顺序，页面标签可快捷切换。")}</li>
                <li>{t("点击色块打开 HSV 取色器，色值以大写 HEX 显示；「从图片取色」会按当前素材生成配色并覆盖现有颜色。")}</li>
                <li>{t("纸面明暗只影响作品纸面，不改变配色本身；配色 JSON 可粘贴或从顶栏「导入」载入。")}</li>
                <li>{t("配色的主题名字留空时，导出会使用模板内置标题。")}</li>
              </HelpSection>

              <HelpSection title={t("3 · 排版模板与参数")}>
                <li>{t("内置排版与导入模板统一管理；顶栏「导入」左侧直接选文件，右侧箭头可展开「导入文件」或「导入模板文件夹」，按类型自动放入素材、模板、配色、项目或字体面板。")}</li>
                <li>{t("导入模板请统一用顶栏「导入」；需要保留来源目录时选「导入模板文件夹」。模板面板的「自动分组」左侧按当前方式执行，右侧箭头可切换内置名称、导入文件夹名称或文件名，选择后立即分组。")}</li>
                <li>{t("点击 ⋯ 或长按模板可上移、下移、移动分组或删除；分组标题可折叠，垃圾桶可删除整个分组。")}</li>
                <li>{t("参数面板支持搜索、分组折叠与一键预设；手动调整后预设状态自动取消。")}</li>
                <li>{t("非主题预览模板可用「编辑模板数据」替换内置示例文字与条目；开启「启用 3D 展映」可让卡片错落立体展示。")}</li>
              </HelpSection>

              <HelpSection title={t("4 · 预览与编辑")}>
                <li>{t("主预览滚轮缩放、按住拖拽平移；「适应窗口」会重置缩放与位置。")}</li>
                <li>{t("悬浮预览可拖动标题栏移动、拖右下角调整大小、滚轮缩放，并支持最小化与全屏。")}</li>
                <li>{t("撤销 / 重做按钮，或按 Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z（也可按 Ctrl+Y）。")}</li>
                <li>{t("「模板参数」可上传本地字体：标题字体在「图文排版」组，水印字体在「水印与质感」组开启水印后上传；水印字体留空时跟随标题字体。")}</li>
                <li>{t("编辑内容自动存为本机草稿，刷新后可继续；项目对话框可保存或载入 JSON 项目，也可全部重置。")}</li>
                <li>{t("顶栏主题按钮在浅色 / 深色 / 跟随系统之间循环；语言按钮在中英文之间切换。主题只影响界面，语言还会影响模板中跟随界面语言的文字。")}</li>
              </HelpSection>

              <HelpSection title={t("5 · 导出")}>
                <li>{t("PNG 可设置宽度；视频可设置时长、帧率与清晰度；批量 ZIP 可选仅 PNG、仅视频或图片 + 视频。")}</li>
                <li>{t("批量导出按模板容量自动分组打包；视频导出会临时启用 3D 时间轴，完成后恢复原始预览参数。")}</li>
                <li>{t("视频优先用 WebCodecs 逐帧编码为 MP4，失败时回退浏览器录制；回退时请保持页面在前台。iOS / iPadOS 需 Safari 16.4+，不支持时面板会提示，PNG 与 ZIP 不受影响。")}</li>
                <li>{t("开启 3D 展映后导出的 PNG 仍保留全部素材。")}</li>
              </HelpSection>

              <HelpSection title={t("6 · 快捷键与提示")}>
                <li>{t("按 Esc 可关闭弹窗或颜色选择器；导出的 PNG 可直接在 iOS / iPadOS 分享与保存。")}</li>
              </HelpSection>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ColorPickerDialog
        open={studio.picker.open}
        colorKey={studio.picker.key}
        color={studio.picker.key ? studio.colors[studio.picker.key] : "#000000"}
        alpha={studio.picker.key ? (studio.alpha[studio.picker.key] ?? 1) : 1}
        onChange={(key, hex, nextAlpha) =>
          actions.updateColor(key as ColorKey, hex, nextAlpha)
        }
        onClose={() => studio.setPicker({ open: false, key: null })}
      />
    </div>
  )
}
