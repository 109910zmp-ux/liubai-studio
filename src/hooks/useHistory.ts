import { useRef, useState } from "react"

export interface HistoryController {
  record: (label: string) => void
  undo: () => boolean
  redo: () => boolean
  canUndo: boolean
  canRedo: boolean
}

// Consecutive edits to the same field (typing, slider dragging) collapse into
// one history point, so undo lands on the state before the whole gesture.
const MERGE_MS = 700
const LIMIT = 80

export function useHistory<S>(capture: () => S, apply: (snapshot: S) => void): HistoryController {
  const captureRef = useRef(capture)
  const applyRef = useRef(apply)
  captureRef.current = capture
  applyRef.current = apply

  const pastRef = useRef<S[]>([])
  const futureRef = useRef<S[]>([])
  const lastRef = useRef<{ label: string; at: number } | null>(null)
  const [version, setVersion] = useState(0)

  const bump = () => setVersion((value) => value + 1)

  function record(label: string) {
    const now = Date.now()
    const last = lastRef.current
    if (last && last.label === label && now - last.at < MERGE_MS) {
      last.at = now
      return
    }
    lastRef.current = { label, at: now }
    pastRef.current.push(captureRef.current())
    if (pastRef.current.length > LIMIT) pastRef.current.shift()
    futureRef.current = []
    bump()
  }

  function undo() {
    const previous = pastRef.current.pop()
    if (previous === undefined) return false
    futureRef.current.push(captureRef.current())
    if (futureRef.current.length > LIMIT) futureRef.current.shift()
    lastRef.current = null
    applyRef.current(previous)
    bump()
    return true
  }

  function redo() {
    const next = futureRef.current.pop()
    if (next === undefined) return false
    pastRef.current.push(captureRef.current())
    if (pastRef.current.length > LIMIT) pastRef.current.shift()
    lastRef.current = null
    applyRef.current(next)
    bump()
    return true
  }

  // Reading version keeps canUndo / canRedo reactive after stack mutations.
  void version

  return {
    record,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
  }
}
