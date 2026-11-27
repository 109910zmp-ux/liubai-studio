import type { ReactNode } from "react"
import { AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export function SectionTrigger({ index, title, badge }: { index: string; title: string; badge?: string }) {
  return (
    <AccordionTrigger className="section-trigger">
      <span className="section-number">{index}</span>
      <span className="min-w-0 flex-1 text-left text-sm font-medium">{title}</span>
      {badge ? <span className="text-xs text-muted-foreground">{badge}</span> : null}
    </AccordionTrigger>
  )
}

export function RangeRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  display: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="field-label min-w-0 flex-1">{label}</span>
      <Slider
        className="w-[150px]"
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(next) => onChange(Array.isArray(next) ? (next[0] ?? value) : next)}
        aria-label={label}
      />
      <span className="w-10 text-right font-mono text-xs text-muted-foreground">{display}</span>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  // Narrow side panels read better with the label above the control: the input
  // gets the full width instead of losing ~70px to an inline label.
  return (
    <Label className="flex w-full flex-col items-stretch gap-1 text-left">
      <span className="field-label block">{label}</span>
      {children}
    </Label>
  )
}

export function IconButton({
  label,
  onClick,
  children,
  className,
}: {
  label: string
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClick}
            className={className}
            aria-label={label}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function SlidersIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
      <path d="M2 4h12M2 8h12M2 12h12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function EyeIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
      <path d="M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4-6.5-4-6.5-4Zm6.5 2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

export function MinusIcon() {
  return <span className="text-sm leading-none">−</span>
}

export function PlusIcon() {
  return <span className="text-sm leading-none">+</span>
}

export function FitIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
      <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function FloatIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
      <rect x="2" y="2.5" width="12" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9 11.5V14M6.5 14h5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
