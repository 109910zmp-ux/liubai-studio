import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { StudioApi } from "@/hooks/useStudio"
import { COLOR_LABELS } from "@/lib/constants"
import type { ColorKey } from "@/lib/constants"
import { Field } from "./shared"

export function ColorSection({ studio }: { studio: StudioApi }) {
  const { actions, refs } = studio
  return (
    <div className="space-y-4">
      <Card className="p-3 shadow-none">
        <Textarea
          value={studio.jsonRaw}
          onChange={(event) => studio.setJsonRaw(event.target.value)}
          onPaste={(event) => {
            const value = event.clipboardData.getData("text")
            setTimeout(() => actions.applyJson(value), 60)
          }}
          rows={3}
          className="min-h-20 resize-y font-mono"
          placeholder="把主题配色 JSON 粘在这里，或点下面的「从剪贴板粘贴」"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText()
                if (!text) {
                  studio.setJsonStatus("剪贴板是空的")
                  return
                }
                studio.setJsonRaw(text)
                actions.applyJson(text)
              } catch {
                studio.setJsonStatus("浏览器不允许读取剪贴板，请手动粘贴到输入框。")
              }
            }}
          >
            从剪贴板粘贴
          </Button>
          <Button size="sm" variant="outline" onClick={() => refs.jsonFile.current?.click()}>
            选择文件
          </Button>
          <Button size="sm" variant="outline" onClick={() => actions.applyJson(studio.jsonRaw)}>
            应用
          </Button>
          <input
            ref={refs.jsonFile}
            type="file"
            accept="application/json,.json,.txt"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) return
              void file.text().then((text) => {
                studio.setJsonRaw(text)
                actions.applyJson(text)
              })
              event.target.value = ""
            }}
          />
        </div>
        <p className="hint-text mt-3">{studio.jsonStatus}</p>
      </Card>

      <div>
        <h4 className="section-subtitle">作品信息</h4>
        <div className="space-y-2">
          <Field label="主题名字">
            <Input
              ref={refs.nameInput}
              className="min-w-0 flex-1"
              value={studio.name}
              onChange={(event) => studio.setName(event.target.value)}
              placeholder="留空则不显示标题"
            />
          </Field>
          <Field label="主题简介">
            <Input
              className="min-w-0 flex-1"
              value={studio.description}
              onChange={(event) => studio.setDescription(event.target.value)}
              placeholder="导入配色时自动带入"
            />
          </Field>
          <Field label="主题作者">
            <Input
              className="min-w-0 flex-1"
              value={studio.author}
              onChange={(event) => studio.setAuthor(event.target.value)}
              placeholder="导入配色时自动带入"
            />
          </Field>
          <Field label="分享者">
            <Input
              className="min-w-0 flex-1"
              value={studio.sharer}
              onChange={(event) => studio.setSharer(event.target.value)}
              placeholder="手动填写"
            />
          </Field>
          <Field label="地址栏">
            <Input
              className="min-w-0 flex-1"
              value={studio.urlText}
              onChange={(event) => studio.setUrlText(event.target.value)}
              placeholder="留空自动生成"
            />
          </Field>
        </div>
      </div>

      <div>
        <h4 className="section-subtitle">颜色</h4>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(COLOR_LABELS) as ColorKey[]).map((key) => (
            <Button
              key={key}
              type="button"
              variant="outline"
              size="sm"
              className="color-chip h-auto justify-start px-2 py-1.5"
              onClick={() => studio.setPicker({ open: true, key })}
              title={`${COLOR_LABELS[key]} ${studio.colors[key]} · 点击修改`}
            >
              <span
                className="size-5 shrink-0 rounded-md ring-1 ring-black/10"
                style={{ background: studio.colors[key] }}
              />
              <span className="flex min-w-0 flex-1 flex-col items-start leading-tight">
                <span className="truncate text-xs">{COLOR_LABELS[key]}</span>
                <span className="font-mono text-[10px] uppercase tracking-tight text-muted-foreground">
                  {studio.colors[key]}
                </span>
              </span>
            </Button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={actions.autoPalette}
            title="分析当前素材，提取配色并切换到匹配的纸面明暗（会覆盖当前配色）"
          >
            从图片取色
          </Button>
          <Button size="sm" variant="outline" onClick={actions.resetColors}>
            恢复默认
          </Button>
        </div>
      </div>
    </div>
  )
}
