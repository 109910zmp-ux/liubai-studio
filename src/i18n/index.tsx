import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { zhToEn } from "./dictionary"

export type Language = "zh" | "en"

const STORAGE_KEY = "liubai-language"
const listeners = new Set<() => void>()

function readLanguage(): Language {
  try {
    return localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "zh"
  } catch {
    return "zh"
  }
}

let currentLanguage: Language = readLanguage()

export function getLanguage() {
  return currentLanguage
}

export function setLanguage(next: Language) {
  if (next === currentLanguage) return
  currentLanguage = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Language choice is a convenience; storage may be unavailable.
  }
  listeners.forEach((listener) => listener())
}

export function toggleLanguage() {
  setLanguage(currentLanguage === "zh" ? "en" : "zh")
}

/** Translate a source (Chinese) string, substituting {placeholders}. */
export function tr(source: string, vars?: Record<string, string | number>) {
  let text = currentLanguage === "en" ? zhToEn[source] ?? source : source
  if (vars) {
    text = text.replace(/\{(\w+)\}/g, (match, key: string) =>
      key in vars ? String(vars[key]) : match,
    )
  }
  return text
}

interface I18nValue {
  language: Language
  setLanguage: (next: Language) => void
  toggleLanguage: () => void
  t: typeof tr
}

const I18nContext = createContext<I18nValue>({
  language: currentLanguage,
  setLanguage,
  toggleLanguage,
  t: tr,
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState(currentLanguage)

  useEffect(() => {
    const sync = () => setLanguageState(currentLanguage)
    listeners.add(sync)
    return () => {
      listeners.delete(sync)
    }
  }, [])

  const value = useMemo<I18nValue>(
    () => ({ language, setLanguage, toggleLanguage, t: tr }),
    [language],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}
