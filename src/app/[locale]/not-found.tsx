import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("pages");
  return (
    <section className="section">
      <div className="container-site grid justify-items-center gap-5 text-center">
        <span className="hl text-8xl font-bold">404</span>
        <h1 className="h-lg">{t("notFoundTitle")}</h1>
        <p className="lead">{t("notFoundText")}</p>
        <Link href="/" className="btn btn-primary">
          {t("notFoundCta")}
        </Link>
      </div>
    </section>
  );
}
