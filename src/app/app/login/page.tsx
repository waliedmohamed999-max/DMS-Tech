import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/os/dal";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSession()) redirect("/app");
  const { next } = await searchParams;
  const t = await getTranslations("os.login");
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-4">
      <div aria-hidden className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
      <div aria-hidden className="pointer-events-none absolute -top-40 start-1/2 size-[520px] rounded-full bg-[radial-gradient(circle,rgba(98,77,227,.22),transparent_65%)]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 grid justify-items-center gap-3 text-center">
          <Image src="/images/logo-dark.png" alt="DMS Tech" width={1200} height={437} priority className="h-11 w-auto" />
          <div>
            <h1 className="text-lg font-semibold">{t("title")}</h1>
            <p className="mt-1 text-sm text-os-muted">{t("subtitle")}</p>
          </div>
        </div>
        <div className="os-card p-6">
          <LoginForm next={next ?? ""} />
        </div>
        <div className="mt-5 flex items-center justify-between text-xs text-os-faint">
          <span>{t("secure")}</span>
          <Link href="/" className="hover:text-os-text">
            {t("back")}
          </Link>
        </div>
      </div>
    </main>
  );
}
