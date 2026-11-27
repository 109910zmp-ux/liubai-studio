import { useEffect, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
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
  title,
}: {
  open: boolean
  colorKey: string | null
  color: string
  alpha: number
  onChange: (key: string, hex: string, alpha: number) => void
  onClose: () => void
  title?: string
}) {
  const { t } = useI18n()
  const [hue, setHue] = useState(0)
  const [saturation, setSaturation] = useState(1)
  const [value, setValue] = useState(1)
  const [opacity, setOpacity] = useState(1)
  const [hexInput, setHexInput] = useState(color)
  const dragging = useRef<"area" | "hue" | "alpha" | null>(null)
  const syncedKey = useRef<string | null>(null)

  // Sync external colour only when the dialog opens or a different colour is
  // picked. Re-syncing on every `color` change would feed the 8-bit HEX back
  // into HSV mid-drag and make the cursor jump.
  useEffect(() => {
    if (!open) {
      syncedKey.current = null
      dragging.current = null
      return
    }
    const key = String(colorKey)
    if (syncedKey.current === key) return
    syncedKey.current = key
    const channels = rgb(color)
    const [h, s, v] = rgbToHsv(channels[0], channels[1], channels[2])
    setHue(h)
    setSaturation(s)
    setValue(v)
    setOpacity(alpha)
    setHexInput(color.toUpperCase())
    // colour / alpha are read at open time on purpose, not tracked mid-drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, colorKey])

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

  // One handler for pointer-down and pointer-move across all three controls.
  function updateFromPointer(
    kind: "area" | "hue" | "alpha",
    event: ReactPointerEvent<HTMLDivElement>,
    start: boolean,
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
    if (start) {
      dragging.current = kind
      element.setPointerCapture?.(event.pointerId)
    }
    emitColor(nextHue, nextSaturation, nextValue, nextAlpha)
    event.preventDefault()
  }

  const stopDrag = () => { dragging.current = null }
  const onMove = (kind: "area" | "hue" | "alpha") => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging.current !== kind) return
    updateFromPointer(kind, event, false)
  }
  const onDown = (kind: "area" | "hue" | "alpha") => (event: ReactPointerEvent<HTMLDivElement>) => {
    updateFromPointer(kind, event, true)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="picker-dialog sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title || t("选择颜色")}</DialogTitle>
        </DialogHeader>
        <div
          className="picker-area mt-4"
          style={{ background: `hsl(${hue.toFixed(1)},100%,50%)` }}
          onPointerDown={onDown("area")}
          onPointerMove={onMove("area")}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
          <div
            className="picker-dot"
            style={{ left: `${saturation * 100}%`, top: `${(1 - value) * 100}%` }}
          />
        </div>
        <div
          className="picker-hue"
          onPointerDown={onDown("hue")}
          onPointerMove={onMove("hue")}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
        >
          <div className="picker-thumb" style={{ left: `${(hue / 360) * 100}%` }} />
        </div>
        <div
          className="picker-alpha"
          onPointerDown={onDown("alpha")}
          onPointerMove={onMove("alpha")}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
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
          <Button size="sm" onClick={apply}>{t("完成")}</Button>
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
