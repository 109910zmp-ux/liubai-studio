import { FileTextIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { StudioApi } from "@/hooks/useStudio"
import { COLOR_LABELS } from "@/lib/constants"
import type { ColorKey } from "@/lib/constants"
import { allTemplateMetaEntries, templateMetaLabel, templateMetaValue } from "@/lib/templates"
import type { Tone } from "@/lib/types"

export function ColorSection({ studio }: { studio: StudioApi }) {
  const { actions, refs } = studio
  const { t } = useI18n()
  // One card lists every declared meta (including settings/config values)
  // so the template's full information is visible at a glance.
  const allMetaEntries = allTemplateMetaEntries(studio.currentTpl)
  return (
    <div className="space-y-4">
      <div>
        <h4 className="section-subtitle">{t("主题名字")}</h4>
        <Input
          ref={refs.nameInput}
          className="w-full"
          value={studio.name}
          onChange={(event) => studio.setName(event.target.value)}
          placeholder={t("留空则显示模板内置标题")}
        />
      </div>

      <div>
        <Card className="gap-0 overflow-hidden py-0 shadow-none">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="text-xs font-medium">{t("模板信息")}</span>
            <span className="ml-auto rounded-full bg-background px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
              {allMetaEntries.length}
            </span>
          </div>
          {allMetaEntries.length ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 p-3">
              {allMetaEntries.map((entry) => (
                <div key={entry.name} className="min-w-0">
                  <div className="truncate text-[10px] text-muted-foreground">
                    {t(templateMetaLabel(entry.name))}
                  </div>
                  <div
                    className="mt-0.5 truncate font-mono text-xs tabular-nums"
                    title={entry.content}
                  >
                    {t(templateMetaValue(entry.name, entry.content)) || "—"}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-3 text-xs text-muted-foreground">{t("模板未声明额外信息")}</p>
          )}
        </Card>
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
        <div className="mt-3 grid grid-cols-2 gap-2">
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
      </div>

      <div className="space-y-2">
        <h4 className="section-subtitle">{t("配色导入")}</h4>
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
          <div className="mt-2 grid grid-cols-2 gap-2">
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
            <Button size="sm" variant="outline" onClick={() => actions.applyJson(studio.jsonRaw)}>
              {t("应用")}
            </Button>
          </div>
          <p className="hint-text mt-3">{studio.jsonStatus}</p>
        </Card>
      </div>
    </div>
  )
}
