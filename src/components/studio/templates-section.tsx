import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n"
import type { StudioApi } from "@/hooks/useStudio"
import type { TemplateSlot } from "@/lib/types"
import { cn } from "cn"

// Fixed staggered positions for up to six cards. Enough to convey the density
// of each layout at a glance without rendering the full iframe per template.
const CARD_SLOTS = [
  { x: 5, y: 5, w: 30, h: 40 },
  { x: 38, y: 12, w: 30, h: 40 },
  { x: 71, y: 4, w: 26, h: 34 },
  { x: 10, y: 50, w: 26, h: 34 },
  { x: 40, y: 56, w: 30, h: 40 },
  { x: 73, y: 46, w: 24, h: 32 },
]
const PAGE_TONE: Record<string, string> = {
  home: "var(--primary)",
  reader: "var(--chart-2, var(--primary))",
  bookshelf: "var(--chart-3, var(--primary))",
  statistics: "var(--chart-4, var(--primary))",
  profile: "var(--chart-5, var(--primary))",
  splash: "var(--muted-foreground)",
}

function LayoutPreview({ count, slots }: { count: number; slots?: TemplateSlot[] }) {
  return (
    <svg viewBox="0 0 100 92" className="h-14 w-full" aria-hidden="true">
      <rect x="0" y="0" width="100" height="92" rx="4" fill="var(--muted)" opacity="0.4" />
      {CARD_SLOTS.slice(0, Math.min(count, 6)).map((card, index) => (
        <g key={index}>
          <rect
            x={card.x}
            y={card.y}
            width={card.w}
            height={card.h}
            rx="2.5"
            fill="var(--background)"
            stroke="var(--border)"
            strokeWidth="0.8"
          />
          <rect
            x={card.x + 3}
            y={card.y + 3}
            width={card.w - 6}
            height={5}
            rx="1"
            fill={PAGE_TONE[slots?.[index]?.page ?? ""] ?? "var(--primary)"}
            opacity="0.7"
          />
          <rect x={card.x + 3} y={card.y + 12} width={card.w - 9} height="2.4" rx="1" fill="var(--muted-foreground)" opacity="0.35" />
          <rect x={card.x + 3} y={card.y + 17} width={card.w - 13} height="2.4" rx="1" fill="var(--muted-foreground)" opacity="0.25" />
        </g>
      ))}
    </svg>
  )
}

export function TemplatesSection({ studio }: { studio: StudioApi }) {
  const { actions } = studio
  const { t } = useI18n()
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
                    t("这套模板有 {count} 个位置，{extra} 张不会出现在作品里（素材仍保留）", { count: template.count, extra }),
                  )
                }
                actions.selectTemplate(template)
              }}
            >
              <LayoutPreview count={template.count} slots={template.slots} />
              <span className="mt-1.5 text-sm font-semibold">{t("{count} 图", { count: template.count })}</span>
              <span className={cn("text-xs", extra > 0 ? "text-destructive" : "text-muted-foreground")}>
                {extra > 0
                  ? t("用 {used} / {total}", { used: template.count, total: studio.shots.length })
                  : t("{count} 个位置", { count: template.count })}
              </span>
            </Button>
          )
        })}
      </div>
      <p className="hint-text mt-3">{studio.tplHint}</p>
    </div>
  )
}
