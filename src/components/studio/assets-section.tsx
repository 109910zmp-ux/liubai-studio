import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { StudioApi } from "@/hooks/useStudio"
import { PAGE_OPTIONS } from "@/lib/constants"
import { cn } from "cn"

export function AssetsSection({ studio }: { studio: StudioApi }) {
  const { actions, refs } = studio
  const { t } = useI18n()
  const [hot, setHot] = useState(false)
  const dragDepth = useRef(0)
  return (
    <div className="space-y-3">
      <button
        type="button"
        className="drop-zone px-4 py-5 text-center"
        data-hot={hot}
        onClick={() => refs.unifiedFile.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault()
          dragDepth.current += 1
          setHot(true)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault()
          dragDepth.current = Math.max(0, dragDepth.current - 1)
          if (dragDepth.current === 0) setHot(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          dragDepth.current = 0
          setHot(false)
          void actions.addFiles(event.dataTransfer.files)
        }}
      >
        <div className="text-sm font-medium">{t("拖入图片，或点击选择")}</div>
      </button>
      <div className="space-y-2">
        {studio.shots.map((shot, index) => (
          <Card
            key={shot.id}
            className="shot-card grid grid-cols-[64px_minmax(0,1fr)] gap-2.5 p-2 shadow-none"
            data-index={index}
            draggable
            onPointerDown={(event) => actions.onShotPointerDown(event, index)}
            onPointerMove={actions.onShotPointerMove}
            onPointerUp={actions.onShotPointerUp}
            onPointerCancel={() => undefined}
          >
            <div className="relative">
              <img
                src={shot.thumb ?? shot.data}
                alt=""
                className="size-16 rounded-md bg-muted object-cover"
              />
              {shot.isDark != null ? (
                <span className="absolute left-0 top-0 rounded bg-black/65 px-1 text-[8px] text-white" title={t("自动检测的画面明暗，仅作参考，不影响作品底色")}>
                  {t(shot.isDark ? "暗" : "亮")} · {t("自动")}
                </span>
              ) : null}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-serif text-[10px] italic text-muted-foreground">{index + 1}</span>
                <Input
                  list="captionPresets"
                  className="h-7 min-w-0 flex-1 border-0 border-b border-dashed border-input bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
                  value={shot.caption ?? ""}
                  onChange={(event) => actions.updateCaption(index, event.target.value)}
                  placeholder={t("图注（留空用页面名）")}
                />
                <div className="flex gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    title={t("前移")}
                    disabled={index === 0}
                    onClick={() => actions.moveShot(index, -1)}
                  >
                    ‹
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    title={t("后移")}
                    disabled={index === studio.shots.length - 1}
                    onClick={() => actions.moveShot(index, 1)}
                  >
                    ›
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    title={t("删除")}
                    onClick={() => actions.removeShot(index)}
                  >
                    ×
                  </Button>
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {PAGE_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className={cn(
                      "page-chip",
                      studio.shotPage(shot, index) === option.key && "on",
                    )}
                    onClick={() => actions.updatePage(index, option.key)}
                  >
                    {t(option.name)}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => refs.unifiedFile.current?.click()}>
          {t("添加")}
        </Button>
        <Button size="sm" variant="outline" onClick={actions.clearShots}>
          {t("清空")}
        </Button>
        {studio.shots.length ? null : <span className="hint-text">{t("还没有素材")}</span>}
      </div>
    </div>
  )
}
