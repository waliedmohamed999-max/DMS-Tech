import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["ar", "en"],
  defaultLocale: "ar",
  // Arabic is the primary site and stays unprefixed; English lives under /en.
  localePrefix: "as-needed",
  localeDetection: false
});

export type Locale = (typeof routing.locales)[number];
