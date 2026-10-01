import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { cookies } from "next/headers";
import { routing } from "./routing";

export const OS_LOCALE_COOKIE = "OS_LOCALE";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  let locale: string = routing.defaultLocale;
  if (hasLocale(routing.locales, requested)) {
    locale = requested;
  } else {
    // Business OS (/app) has no locale segment: use the user's cookie, Arabic by default
    const fromCookie = (await cookies()).get(OS_LOCALE_COOKIE)?.value;
    if (hasLocale(routing.locales, fromCookie)) locale = fromCookie;
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default
  };
});
