"use client";

import { useSyncExternalStore } from "react";
import { useLocale } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { OS_THEME_COOKIE, type OsTheme } from "@/lib/os/theme";

const listeners = new Set<() => void>();
const current = (): OsTheme => (document.documentElement.classList.contains("dark") ? "dark" : "light");
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

function apply(theme: OsTheme) {
  const root = document.documentElement;
  root.classList.toggle("os-light", theme === "light");
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  document.cookie = `${OS_THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
  listeners.forEach((fn) => fn());
}

/**
 * Light / dark switch for the Business OS. Each person picks their own; the choice lives in a cookie (per browser)
 * that the /app root layout reads, so pages are rendered in the chosen theme from the first paint (no flash).
 * The theme itself is the class on <html>; this button only reads and flips it.
 */
export function ThemeToggle() {
  const ar = useLocale() === "ar";
  const theme = useSyncExternalStore(subscribe, current, () => "light" as OsTheme);
  const next: OsTheme = theme === "light" ? "dark" : "light";
  const label = ar ? (next === "dark" ? "الوضع الداكن" : "الوضع الفاتح") : next === "dark" ? "Dark mode" : "Light mode";
  return (
    <button type="button" onClick={() => apply(next)} className="os-btn-ghost size-9 px-0" aria-label={label} title={label}>
      <Icon name={theme === "light" ? "Moon" : "Sun"} size={17} />
    </button>
  );
}
