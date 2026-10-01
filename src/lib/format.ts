export const formatDate = (d: string, locale: string) =>
  new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-US", { dateStyle: "long" }).format(new Date(d));
