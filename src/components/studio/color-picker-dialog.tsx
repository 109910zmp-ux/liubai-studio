import { useEffect, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { ColorKey } from "@/lib/constants"
import { SWATCHES } from "@/lib/constants"
import { hexNorm, hsvToRgb, hx, rgb, rgbToHsv } from "@/lib/color"
import { clamp } from "@/lib/math"

export function ColorPickerDialog({
  open,
  colorKey,
  color,
  alpha,
  onChange,
  onClose,
}: {
  open: boolean
  colorKey: ColorKey | null
  color: string
  alpha: number
  onChange: (key: ColorKey, hex: string, alpha: number) => void
  onClose: () => void
}) {
  const [hue, setHue] = useState(0)
  const [saturation, setSaturation] = useState(1)
  const [value, setValue] = useState(1)
  const [opacity, setOpacity] = useState(1)
  const [hexInput, setHexInput] = useState(color)
  const areaRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  const alphaRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<"area" | "hue" | "alpha" | null>(null)

  useEffect(() => {
    if (!open) return
    const channels = rgb(color)
    const [h, s, v] = rgbToHsv(channels[0], channels[1], channels[2])
    setHue(h)
    setSaturation(s)
    setValue(v)
    setOpacity(alpha)
    setHexInput(color.toUpperCase())
  }, [open, color, alpha])

  const channels = hsvToRgb(hue, saturation, value)
  const hex = hx(channels[0], channels[1], channels[2])

  function apply() {
    if (!colorKey) return
    onChange(colorKey, hex, opacity)
    setHexInput(hex)
  }

  function emitColor(nextHue: number, nextSaturation: number, nextValue: number, nextAlpha: number) {
    if (!colorKey) return
    const [red, green, blue] = hsvToRgb(nextHue, nextSaturation, nextValue)
    const nextHex = hx(red, green, blue)
    setHexInput(nextHex)
    onChange(colorKey, nextHex, nextAlpha)
  }

  function bindArea(
    kind: "area" | "hue" | "alpha",
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    const element = event.currentTarget
    const rect = element.getBoundingClientRect()
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1)
    let nextHue = hue
    let nextSaturation = saturation
    let nextValue = value
    let nextAlpha = opacity
    if (kind === "area") {
      nextSaturation = x
      nextValue = 1 - y
      setSaturation(x)
      setValue(1 - y)
    } else if (kind === "hue") {
      nextHue = x * 360
      setHue(nextHue)
    } else {
      nextAlpha = x
      setOpacity(x)
    }
    dragging.current = kind
    emitColor(nextHue, nextSaturation, nextValue, nextAlpha)
    element.setPointerCapture?.(event.pointerId)
    event.preventDefault()
  }

  function moveArea(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging.current) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1)
    let nextHue = hue
    let nextSaturation = saturation
    let nextValue = value
    let nextAlpha = opacity
    if (dragging.current === "area") {
      nextSaturation = x
      nextValue = 1 - y
      setSaturation(x)
      setValue(1 - y)
    } else if (dragging.current === "hue") {
      nextHue = x * 360
      setHue(nextHue)
    } else {
      nextAlpha = x
      setOpacity(x)
    }
    emitColor(nextHue, nextSaturation, nextValue, nextAlpha)
    event.preventDefault()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="picker-dialog sm:max-w-md">
        <DialogHeader>
          <DialogTitle>选择颜色</DialogTitle>
        </DialogHeader>
        <div
          ref={areaRef}
          className="picker-area mt-4"
          style={{ background: `hsl(${hue.toFixed(1)},100%,50%)` }}
          onPointerDown={(event) => bindArea("area", event)}
          onPointerMove={moveArea}
          onPointerUp={() => (dragging.current = null)}
          onPointerCancel={() => (dragging.current = null)}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
          <div
            className="picker-dot"
            style={{ left: `${saturation * 100}%`, top: `${(1 - value) * 100}%` }}
          />
        </div>
        <div
          ref={hueRef}
          className="picker-hue"
          onPointerDown={(event) => bindArea("hue", event)}
          onPointerMove={moveArea}
          onPointerUp={() => (dragging.current = null)}
        >
          <div className="picker-thumb" style={{ left: `${(hue / 360) * 100}%` }} />
        </div>
        <div
          ref={alphaRef}
          className="picker-alpha"
          onPointerDown={(event) => bindArea("alpha", event)}
          onPointerMove={moveArea}
          onPointerUp={() => (dragging.current = null)}
        >
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(90deg,rgba(${channels.join(",")},0),${hex})`,
            }}
          />
          <div className="picker-thumb" style={{ left: `${opacity * 100}%` }} />
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span
            className="size-8 shrink-0 rounded-lg ring-1 ring-black/10"
            style={{ background: `rgba(${channels.join(",")},${opacity.toFixed(3)})` }}
          />
          <Input
            className="min-w-0 flex-1 font-mono uppercase"
            value={hexInput}
            onChange={(event) => {
              setHexInput(event.target.value)
              const parsed = hexNorm(event.target.value)
              if (!parsed) return
              const [r, g, b] = rgb(parsed)
              const [h, s, v] = rgbToHsv(r, g, b)
              setHue(h)
              setSaturation(s)
              setValue(v)
            }}
            onBlur={apply}
          />
          <Button size="sm" onClick={apply}>完成</Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              className="size-6 rounded-md ring-1 ring-black/10"
              style={{ background: swatch }}
              onClick={() => {
                const [r, g, b] = rgb(swatch)
                const [h, s, v] = rgbToHsv(r, g, b)
                setHue(h)
                setSaturation(s)
                setValue(v)
                setHexInput(swatch)
              }}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
