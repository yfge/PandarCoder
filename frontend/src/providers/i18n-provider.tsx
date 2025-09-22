'use client'

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { DEFAULT_LOCALE, Locale, t as translate } from '@/lib/i18n'

type I18nContextValue = {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE)

  useEffect(() => {
    // prefer saved locale, then browser language
    const saved = (typeof window !== 'undefined' && (localStorage.getItem('locale') as Locale | null)) || null
    const browser: Locale = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
    setLocaleState(saved || browser || DEFAULT_LOCALE)
  }, [])

  const setLocale = (l: Locale) => {
    setLocaleState(l)
    try { localStorage.setItem('locale', l) } catch { /* ignore */ }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en'
    }
  }

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    t: (key, vars) => translate(locale, key, vars)
  }), [locale])

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}

