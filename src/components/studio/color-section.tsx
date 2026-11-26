import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { StudioApi } from "@/hooks/useStudio"
import { COLOR_LABELS } from "@/lib/constants"
import type { ColorKey } from "@/lib/constants"
import type { Tone } from "@/lib/types"
import { Field } from "./shared"

export function ColorSection({ studio }: { studio: StudioApi }) {
  const { actions, refs } = studio
  const { t } = useI18n()
  return (
    <div className="space-y-4">
      <div>
        <h4 className="section-subtitle">{t("主题名字")}</h4>
        <Input
          ref={refs.nameInput}
          className="w-full"
          value={studio.name}
          onChange={(event) => studio.setName(event.target.value)}
          placeholder={t("留空则不显示标题")}
        />
      </div>

      <div>
        <h4 className="section-subtitle">{t("颜色")}</h4>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(COLOR_LABELS) as ColorKey[]).map((key) => (
            <Button
              key={key}
              type="button"
              variant="outline"
              size="sm"
              className="color-chip h-auto justify-start px-2 py-1.5"
              onClick={() => studio.setPicker({ open: true, key })}
              title={t("{label} {value} · 点击修改", { label: t(COLOR_LABELS[key]), value: studio.colors[key] })}
            >
              <span
                className="size-5 shrink-0 rounded-md ring-1 ring-black/10"
                style={{ background: studio.colors[key] }}
              />
              <span className="flex min-w-0 flex-1 flex-col items-start leading-tight">
                <span className="truncate text-xs">{t(COLOR_LABELS[key])}</span>
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
            title={t("分析当前素材，提取配色并切换到匹配的纸面明暗（会覆盖当前配色）")}
          >
            {t("从图片取色")}
          </Button>
          <Button size="sm" variant="outline" onClick={actions.resetColors}>
            {t("恢复默认")}
          </Button>
        </div>
      </div>

      <div>
        <h4 className="section-subtitle">{t("纸面明暗")}</h4>
        <ToggleGroup
          variant="outline"
          value={[studio.tone]}
          onValueChange={(value: string[]) => {
            if (value[0]) actions.applyTone(value[0] as Tone)
          }}
          className="grid w-full grid-cols-2"
        >
          <ToggleGroupItem value="light">{t("浅色")}</ToggleGroupItem>
          <ToggleGroupItem value="dark">{t("深色")}</ToggleGroupItem>
        </ToggleGroup>
        <p className="hint-text mt-2">{t("只影响作品的纸面明暗，不改变配色本身。")}</p>
      </div>

      <details className="group border-t pt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
          <span>{t("高级 · 作品信息与配色导入")}</span>
          <span className="transition-transform group-open:rotate-90">›</span>
        </summary>
        <div className="mt-3 space-y-4">
          <div className="space-y-2">
            <Field label={t("主题简介")}>
              <Input
                className="min-w-0 flex-1"
                value={studio.description}
                onChange={(event) => studio.setDescription(event.target.value)}
                placeholder={t("导入配色时自动带入")}
              />
            </Field>
            <Field label={t("主题作者")}>
              <Input
                className="min-w-0 flex-1"
                value={studio.author}
                onChange={(event) => studio.setAuthor(event.target.value)}
                placeholder={t("导入配色时自动带入")}
              />
            </Field>
            <Field label={t("分享者")}>
              <Input
                className="min-w-0 flex-1"
                value={studio.sharer}
                onChange={(event) => studio.setSharer(event.target.value)}
                placeholder={t("手动填写")}
              />
            </Field>
            <Field label={t("地址栏")}>
              <Input
                className="min-w-0 flex-1"
                value={studio.urlText}
                onChange={(event) => studio.setUrlText(event.target.value)}
                placeholder={t("留空自动生成")}
              />
            </Field>
          </div>

          <Card className="p-3 shadow-none">
            <Textarea
              value={studio.jsonRaw}
              onChange={(event) => studio.setJsonRaw(event.target.value)}
              onPaste={(event) => {
                const value = event.clipboardData.getData("text")
                studio.setJsonRaw(value)
                actions.applyJson(value)
              }}
              rows={3}
              className="min-h-20 resize-y font-mono"
              placeholder={t("把主题配色 JSON 粘在这里，或点下面的「从剪贴板粘贴」")}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText()
                    if (!text) {
                      studio.setJsonStatus(t("剪贴板是空的"))
                      return
                    }
                    studio.setJsonRaw(text)
                    actions.applyJson(text)
                  } catch {
                    studio.setJsonStatus(t("浏览器不允许读取剪贴板，请手动粘贴到输入框。"))
                  }
                }}
              >
                {t("从剪贴板粘贴")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => refs.jsonFile.current?.click()}>
                {t("选择文件")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => actions.applyJson(studio.jsonRaw)}>
                {t("应用")}
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
        </div>
      </details>
    </div>
  )
}
