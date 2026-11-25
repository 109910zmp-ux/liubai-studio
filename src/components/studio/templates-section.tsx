import { Button } from "@/components/ui/button"
import type { StudioApi } from "@/hooks/useStudio"
import { cn } from "cn"

export function TemplatesSection({ studio }: { studio: StudioApi }) {
  const { actions } = studio
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {studio.templates.map((template) => {
          const active = studio.currentTpl?.key === template.key
          const extra = studio.shots.length - template.count
          return (
            <Button
              key={template.key}
              type="button"
              variant="outline"
              size="lg"
              className={cn("tpl-card h-auto flex-col items-start gap-0 p-3 text-left", active && "border-primary bg-accent")}
              data-active={active}
              onClick={() => {
                if (extra > 0) {
                  actions.notify(
                    `这套模板有 ${template.count} 个位置，${extra} 张不会出现在作品里（素材仍保留）`,
                  )
                }
                actions.selectTemplate(template)
              }}
            >
              <span className="text-sm font-semibold">{template.count} 图</span>
              <span className={cn("mt-0.5 text-xs", extra > 0 ? "text-destructive" : "text-muted-foreground")}>
                {extra > 0 ? `用 ${template.count} / ${studio.shots.length}` : `${template.count} 个位置`}
              </span>
            </Button>
          )
        })}
      </div>
      <p className="hint-text mt-3">{studio.tplHint}</p>
    </div>
  )
}
