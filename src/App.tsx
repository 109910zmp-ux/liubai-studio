import { useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  CircleHelpIcon,
  DownloadIcon,
  MonitorIcon,
  MoonIcon,
  Redo2Icon,
  SunIcon,
  Undo2Icon,
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Toaster } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useStudio } from "@/hooks/useStudio"
import { useUiTheme } from "@/hooks/useUiTheme"
import { useI18n } from "@/i18n"
import type { UiTheme } from "@/hooks/useUiTheme"
import { CAPTION_PRESETS } from "@/lib/constants"
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
        {CAPTION_PRESETS.map((item) => <option key={item} value={item} />)}
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
            <Button size="sm" variant="outline" onClick={() => refs.projFile.current?.click()}>
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
            <input
              ref={refs.projFile}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void actions.loadProjectFile(file)
                event.target.value = ""
              }}
            />
          </div>
          <p className="hint-text mt-3 text-emerald-600 dark:text-emerald-400">
            ● {studio.draftStatus}
          </p>
          <p className="hint-text mt-1">
            {t("编辑后会自动存到本机浏览器，刷新页面可继续；「全部重置」会清空素材、参数、配色与草稿，恢复到初始状态（可用撤销找回）。")}
          </p>
          <p className="hint-text mt-3">{studio.projStatus}</p>
        </DialogContent>
      </Dialog>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("使用说明")}</DialogTitle>
            <DialogDescription>
              {t("从素材到导出，几步完成一份截图作品。")}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 max-h-[65vh] space-y-5 overflow-y-auto pr-1 text-sm">
            <section className="space-y-2">
              <h3 className="font-medium text-foreground">{t("1 · 快速开始")}</h3>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>{t("在「素材」拖入或选择截图；导入素材不会改动你已有的配色。")}</li>
                <li>{t("在「排版模板」挑选版式，素材数量变化时会自动切换到能容纳的模板。")}</li>
                <li>{t("用「模板参数」「配色」调整视觉；纸面明暗在配色面板的「纸面」小节，参数面板支持搜索与分组折叠，开启「启用 3D 展映」可让截图卡片错落立体展示。")}</li>
                <li>{t("点顶栏「导出」，选择 PNG、视频或批量 ZIP。")}</li>
              </ol>
            </section>
            <section className="space-y-2">
              <h3 className="font-medium text-foreground">{t("2 · 预览操作")}</h3>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>{t("在主预览上滚动滚轮缩放，按住预览区拖拽可自由移动画布位置。")}</li>
                <li>{t("点「适应窗口」会同时重置缩放比例和画布位置。")}</li>
                <li>{t("点预览栏的悬浮按钮可打开独立预览：拖标题栏移动、拖右下角调整窗口大小、滚轮缩放，还能最小化或全屏。")}</li>
              </ul>
            </section>
            <section className="space-y-2">
              <h3 className="font-medium text-foreground">{t("3 · 编辑与恢复")}</h3>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>{t("撤销 / 重做按钮，或按 Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z（也可按 Ctrl+Y）。")}</li>
                <li>{t("点击色块可改色，色值直接以大写 HEX 显示；「从图片取色」需要手动触发。")}</li>
                <li>{t("「模板参数」可上传本地字体（.ttf/.otf/.woff，大小不限）：标题字体在「图文排版」组，水印字体在「水印与质感」组开启水印后上传，导出同样生效。")}</li>
                <li>{t("开启水印后可放图片水印并调大小；水印字体留空时，自动跟随自定义标题字体。")}</li>
                <li>{t("编辑内容会自动存为本机草稿，刷新后可继续；项目对话框可保存或载入 JSON 项目文件，也可「全部重置」到初始状态。")}</li>
                <li>{t("顶栏主题按钮在浅色 / 深色 / 跟随系统之间循环切换，选择会被记住；偏好设置不影响海报自身配色。")}</li>
              </ul>
            </section>
            <section className="space-y-2">
              <h3 className="font-medium text-foreground">{t("4 · 导出")}</h3>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>{t("PNG 可设置输出宽度；视频可设置时长、帧率与清晰度。")}</li>
                <li>{t("批量 ZIP 可选「仅 PNG」「仅视频」或「图片 + 视频」，按模板容量自动分组打包。")}</li>
                <li>{t("视频导出会临时启用模板的 3D 时间轴，完成后自动恢复你的原始预览参数。")}</li>
                <li>{t("视频优先用 WebCodecs 逐帧编码为 MP4（更快），失败时自动改用浏览器录制；回退时请保持页面在前台。iOS / iPadOS 需 Safari 16.4+，不支持时面板会给出提示，PNG 与批量 ZIP 不受影响。")}</li>
                <li>{t("开启 3D 展映后导出的 PNG 同样会保留全部素材，无需担心图片丢失。")}</li>
              </ul>
            </section>
            <p className="hint-text border-t pt-3">{t("按 Esc 可关闭弹窗或颜色选择器；导出的 PNG 可直接在 iOS / iPadOS 分享与保存。")}</p>
          </div>
        </DialogContent>
      </Dialog>

      <ColorPickerDialog
        open={studio.picker.open}
        colorKey={studio.picker.key}
        color={studio.picker.key ? studio.colors[studio.picker.key] : "#000000"}
        alpha={studio.picker.key ? (studio.alpha[studio.picker.key] ?? 1) : 1}
        onChange={(key, hex, nextAlpha) => actions.updateColor(key, hex, nextAlpha)}
        onClose={() => studio.setPicker({ open: false, key: null })}
      />
    </div>
  )
}
