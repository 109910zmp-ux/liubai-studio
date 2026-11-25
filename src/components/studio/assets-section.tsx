import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { StudioApi } from "@/hooks/useStudio"
import { PAGE_OPTIONS } from "@/lib/constants"
import { cx } from "@/lib/utils"

export function AssetsSection({ studio }: { studio: StudioApi }) {
  const { actions, refs } = studio
  const [hot, setHot] = useState(false)
  return (
    <div className="space-y-3">
      <button
        type="button"
        className="drop-zone px-4 py-5 text-center"
        data-hot={hot}
        onClick={() => refs.fileInput.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
          setHot(true)
        }}
        onDragLeave={() => setHot(false)}
        onDrop={(event) => {
          event.preventDefault()
          setHot(false)
          void actions.addFiles(event.dataTransfer.files)
        }}
      >
        <div className="text-sm font-medium">拖入图片，或点击选择</div>
        <div className="hint-text mt-1">支持多张 · PNG / JPG / WEBP / HEIC</div>
      </button>
      <input
        ref={refs.fileInput}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files) void actions.addFiles(event.target.files)
          event.target.value = ""
        }}
      />

      <div className="space-y-2">
        {studio.shots.map((shot, index) => (
          <Card
            key={shot.id}
            className="shot-card grid grid-cols-[44px_minmax(0,1fr)] gap-2.5 p-2 shadow-none"
            data-index={index}
            draggable
            onPointerDown={(event) => actions.onShotPointerDown(event, index)}
            onPointerMove={actions.onShotPointerMove}
            onPointerUp={actions.onShotPointerUp}
            onPointerCancel={() => undefined}
          >
            <div className="relative">
              <img
                src={shot.data}
                alt=""
                className="size-16 rounded-md bg-muted object-cover"
              />
              {shot.isDark != null ? (
                <span className="absolute left-0 top-0 rounded bg-black/65 px-1 text-[8px] text-white">
                  {shot.isDark ? "深色" : "浅色"}
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
                  placeholder="图注（留空用页面名）"
                />
                <div className="flex gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    title="前移"
                    disabled={index === 0}
                    onClick={() => actions.moveShot(index, -1)}
                  >
                    ‹
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    title="后移"
                    disabled={index === studio.shots.length - 1}
                    onClick={() => actions.moveShot(index, 1)}
                  >
                    ›
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    title="删除"
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
                    className={cx(
                      "page-chip",
                      studio.shotPage(shot, index) === option.key && "on",
                    )}
                    onClick={() => actions.updatePage(index, option.key)}
                  >
                    {option.name}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => refs.fileInput.current?.click()}>
          添加
        </Button>
        <Button size="sm" variant="outline" onClick={actions.clearShots}>
          清空
        </Button>
        <span className="hint-text">{studio.shots.length ? "拖动缩略图可调整顺序" : "还没有素材"}</span>
      </div>
    </div>
  )
}
