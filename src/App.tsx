import { useMemo, useState } from "react"
import { createPortal } from "react-dom"
import {
  CircleHelpIcon,
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useStudio } from "@/hooks/useStudio"
import { useUiTheme } from "@/hooks/useUiTheme"
import type { UiTheme } from "@/hooks/useUiTheme"
import { CAPTION_PRESETS } from "@/lib/constants"
import type { TemplateParam, Tone } from "@/lib/types"
import { cx } from "@/lib/utils"
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

type ParamGroup = { name: string; items: TemplateParam[] }

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
  const index = themeCycle.findIndex((item) => item.value === theme)
  const current = themeCycle[index] ?? themeCycle[2]
  const next = themeCycle[(index + 1) % themeCycle.length]
  const Icon = current.icon
  return (
    <Button
      size="sm"
      variant="outline"
      className="w-9 px-0"
      onClick={() => onCycle(next.value)}
      title={`界面主题：${current.label}（点击切换为${next.label}）`}
      aria-label={`界面主题：${current.label}，点击切换为${next.label}`}
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
  const [helpOpen, setHelpOpen] = useState(false)
  const [resetArmed, setResetArmed] = useState(false)
  const { refs, actions } = studio

  const groupedParams = useMemo<ParamGroup[]>(() => {
    const groups: ParamGroup[] = []
    studio.currentTpl?.params.forEach((param) => {
      if (!studio.visibleParam(param.when)) return
      let group = groups.find((item) => item.name === param.group)
      if (!group) {
        group = { name: param.group, items: [] }
        groups.push(group)
      }
      group.items.push(param)
    })
    return groups
  }, [studio.currentTpl, studio.params])

  const brandIcon =
    document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href ?? undefined

  return (
    <div className="relative flex h-full flex-col">
      <header className="studio-top">
        <div className="flex min-w-0 items-center gap-3">
          <img className="studio-mark" src={brandIcon} alt="留白" />
          <div className="min-w-0">
            <div className="studio-brand">留白</div>
            <div className="studio-subbrand">SCREENSHOT STUDIO</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="top-help"
            onClick={() => setHelpOpen(true)}
            title="使用说明"
            aria-label="使用说明"
          >
            <CircleHelpIcon />
            <span className="top-help-text">说明</span>
          </Button>
          <ThemeToggle theme={uiTheme.theme} onCycle={uiTheme.setTheme} />
          <Button size="sm" variant="outline" onClick={() => studio.setProjectOpen(true)}>
            项目
          </Button>
          <Button
            size="sm"
            className="top-video"
            onClick={actions.focusExport}
            title="打开导出面板：PNG / 视频 / 批量 ZIP"
          >
            导出
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
            设置
          </TabsTrigger>
          <TabsTrigger value="main">
            <EyeIcon />
            预览
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
                <SectionTrigger index="01" title="配色" badge={studio.colorStatus} />
                <AccordionContent className="section-panel">
                  <ColorSection studio={studio} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="assets">
                <SectionTrigger index="02" title="素材" badge={`${studio.shots.length} 张`} />
                <AccordionContent className="section-panel">
                  <AssetsSection studio={studio} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="templates">
                <SectionTrigger index="03" title="排版模板" badge={`${studio.templates.length} 套`} />
                <AccordionContent className="section-panel">
                  <TemplatesSection studio={studio} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="params">
                <SectionTrigger index="04" title="模板参数" badge={`${groupedParams.length} 组`} />
                <AccordionContent className="section-panel">
                  <ParamsSection studio={studio} groups={groupedParams} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="tone">
                <SectionTrigger index="05" title="底色" badge={studio.tone === "dark" ? "深色" : "浅色"} />
                <AccordionContent className="section-panel">
                  <ToggleGroup
                    variant="outline"
                    value={[studio.tone]}
                    onValueChange={(value: string[]) => {
                      if (value[0]) actions.applyTone(value[0] as Tone)
                    }}
                    className="grid w-full grid-cols-2"
                  >
                    <ToggleGroupItem value="light">浅色</ToggleGroupItem>
                    <ToggleGroupItem value="dark">深色</ToggleGroupItem>
                  </ToggleGroup>
                  <p className="hint-text mt-3">只影响作品的纸面明暗，不改变配色本身。</p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="export" data-export-panel>
                <SectionTrigger index="06" title="导出" badge={studio.exporting ? "进行中" : ""} />
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
                title="撤销 (Ctrl/Cmd+Z)"
                aria-label="撤销"
              >
                <Undo2Icon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => actions.redo()}
                disabled={!studio.canRedo}
                title="重做 (Ctrl/Cmd+Shift+Z)"
                aria-label="重做"
              >
                <Redo2Icon />
              </Button>
              <span className="mx-0.5 h-4 w-px bg-border" />
              <IconButton label="缩小" onClick={() => actions.setZoom(studio.zoom - 0.1)}>
                <MinusIcon />
              </IconButton>
              <span className="w-11 text-center font-mono text-xs text-foreground">
                {Math.round(studio.zoom * 100)}%
              </span>
              <IconButton label="放大" onClick={() => actions.setZoom(studio.zoom + 0.1)}>
                <PlusIcon />
              </IconButton>
              <IconButton label="适应窗口并复位位置" onClick={actions.fitZoom}>
                <FitIcon />
              </IconButton>
              <IconButton
                label={studio.floatOpen ? "关闭悬浮预览" : "悬浮预览"}
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
            className={cx(
              "float-window",
              studio.floatOpen && "on",
              studio.floatMin && "min",
              studio.floatBig && "big",
              studio.floatCompact && "compact",
            )}
          >
            <div ref={refs.floatHead} className="float-head">
              <span className="truncate text-xs font-medium">留白 · 预览</span>
              <div className="ml-auto flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => actions.zoomFloatBy(-1)}
                  title="缩小（滚轮）"
                >
                  <MinusIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => actions.zoomFloatBy(1)}
                  title="放大（滚轮）"
                >
                  <PlusIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => studio.setFloatMin(!studio.floatMin)}
                  title="最小化"
                >
                  —
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => studio.setFloatBig(!studio.floatBig)}
                  title={studio.floatBig ? "还原" : "全屏"}
                >
                  ⤢
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => actions.openFloat(false)}
                  title="关闭"
                >
                  ×
                </Button>
              </div>
            </div>
            <div ref={refs.floatBody} className="float-body">
              <div ref={refs.floatInner} className="float-inner">
                <iframe ref={refs.floatPreview} title="悬浮预览" className="block border-0" />
              </div>
            </div>
            <div ref={refs.floatGrip} className="float-grip" title="拖拽调整窗口大小" />
          </div>

          <div ref={refs.snapLeft} className="snap-line left" data-on="false" />
          <div ref={refs.snapRight} className="snap-line right" data-on="false" />
        </>,
        document.body,
      )}

      <datalist id="captionPresets">
        {CAPTION_PRESETS.map((item) => <option key={item} value={item} />)}
      </datalist>

      <Dialog open={studio.projectOpen} onOpenChange={studio.setProjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>项目文件</DialogTitle>
            <DialogDescription>
              项目文件包含素材、模板、参数与配色，可完整恢复。
            </DialogDescription>
          </DialogHeader>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button size="sm" onClick={actions.saveProject}>保存项目文件</Button>
            <Button size="sm" variant="outline" onClick={() => refs.projFile.current?.click()}>
              载入项目文件
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void actions.clearDraft()}>
              清空草稿
            </Button>
            <Button
              size="sm"
              variant={resetArmed ? "destructive" : "outline"}
              title="恢复所有设置到初始状态（可用撤销恢复）"
              onClick={() => {
                if (resetArmed) {
                  void actions.resetAll().then(() => {
                    setResetArmed(false)
                    studio.setProjectOpen(false)
                  })
                } else {
                  setResetArmed(true)
                  window.setTimeout(() => setResetArmed(false), 4000)
                }
              }}
            >
              {resetArmed ? "确认全部重置？" : "全部重置"}
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
            编辑后会自动存到本机浏览器，刷新页面可继续；「全部重置」会清空素材、参数、配色与草稿，恢复到初始状态（可用撤销找回）。
          </p>
          <p className="hint-text mt-3">{studio.projStatus}</p>
        </DialogContent>
      </Dialog>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>使用说明</DialogTitle>
            <DialogDescription>
              从素材到导出，几步完成一份截图作品。
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 max-h-[65vh] space-y-5 overflow-y-auto pr-1 text-sm">
            <section className="space-y-2">
              <h3 className="font-medium text-foreground">1 · 快速开始</h3>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>在「素材」拖入或选择截图；导入素材不会改动你已有的配色。</li>
                <li>在「排版模板」挑选版式，素材数量变化时会自动切换到能容纳的模板。</li>
                <li>用「模板参数」「配色」「底色」调整视觉；参数面板支持搜索与分组折叠，开启「启用 3D 展映」可让截图卡片错落立体展示。</li>
                <li>点顶栏「导出」，选择 PNG、视频或批量 ZIP。</li>
              </ol>
            </section>
            <section className="space-y-2">
              <h3 className="font-medium text-foreground">2 · 预览操作</h3>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>在主预览上滚动滚轮缩放，按住预览区拖拽可自由移动画布位置。</li>
                <li>点「适应窗口」会同时重置缩放比例和画布位置。</li>
                <li>点预览栏的悬浮按钮可打开独立预览：拖标题栏移动、拖右下角调整窗口大小、滚轮缩放，还能最小化或全屏。</li>
              </ul>
            </section>
            <section className="space-y-2">
              <h3 className="font-medium text-foreground">3 · 编辑与恢复</h3>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>撤销 / 重做按钮，或按 Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z（也可按 Ctrl+Y）。</li>
                <li>点击色块可改色，色值直接以大写 HEX 显示；「从图片取色」需要手动触发。</li>
                <li>「模板参数」可上传本地字体（.ttf/.otf/.woff，大小不限）：标题字体在「图文排版」组，水印字体在「水印与质感」组开启水印后上传，导出同样生效。</li>
                <li>开启水印后可放图片水印并调大小；水印字体留空时，自动跟随自定义标题字体。</li>
                <li>编辑内容会自动存为本机草稿，刷新后可继续；项目对话框可保存或载入 JSON 项目文件，也可「全部重置」到初始状态。</li>
                <li>顶栏主题按钮在浅色 / 深色 / 跟随系统之间循环切换，选择会被记住；偏好设置不影响海报自身配色。</li>
              </ul>
            </section>
            <section className="space-y-2">
              <h3 className="font-medium text-foreground">4 · 导出</h3>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>PNG 可设置输出宽度；视频可设置时长、帧率与清晰度。</li>
                <li>批量 ZIP 可选「仅 PNG」「仅视频」或「图片 + 视频」，按模板容量自动分组打包。</li>
                <li>视频导出会临时启用模板的 3D 时间轴，完成后自动恢复你的原始预览参数。</li>
                <li>视频优先用 WebCodecs 逐帧编码为 MP4（更快），失败时自动改用浏览器录制；回退时请保持页面在前台。iOS / iPadOS 需 Safari 16.4+，不支持时面板会给出提示，PNG 与批量 ZIP 不受影响。</li>
                <li>开启 3D 展映后导出的 PNG 同样会保留全部素材，无需担心图片丢失。</li>
              </ul>
            </section>
            <p className="hint-text border-t pt-3">按 Esc 可关闭弹窗或颜色选择器；导出的 PNG 可直接在 iOS / iPadOS 分享与保存。</p>
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
