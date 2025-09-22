import en from "@/locales/en.json";
import zh from "@/locales/zh.json";

export type Locale = "en" | "zh";

export const dictionaries = {
  en,
  zh,
} as const;

export const DEFAULT_LOCALE: Locale = "en";

export function t(locale: Locale, key: string, vars: Record<string, string | number> = {}): string {
  const dict = dictionaries[locale] as Record<string, string>;
  const template = dict[key] || key;
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

