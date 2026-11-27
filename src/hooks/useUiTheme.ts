import { useEffect, useState } from "react"

export type UiTheme = "light" | "dark" | "system"

const STORAGE_KEY = "liubai-ui-theme"

function readTheme(): UiTheme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === "light" || saved === "dark" || saved === "system") return saved
  } catch {
    // Storage may be unavailable in private mode; fall back to following the system.
  }
  return "system"
}

export function useUiTheme() {
  const [theme, setThemeState] = useState<UiTheme>(readTheme)

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const sync = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches)
      document.documentElement.classList.toggle("dark", dark)
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", dark ? "#0a0a0a" : "#ffffff")
    }
    sync()
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [theme])

  const setTheme = (value: UiTheme) => {
    setThemeState(value)
    try {
      localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // The choice still applies for this session.
    }
  }

  return { theme, setTheme }
}
