"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";

export default function OsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("os.errors");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="os-card mx-auto mt-10 grid max-w-lg justify-items-center gap-3 p-10 text-center">
      <span className="grid size-11 place-items-center rounded-xl border border-danger/30 bg-danger/10 text-danger">
        <Icon name="X" size={20} />
      </span>
      <p className="font-semibold">{t("pageTitle")}</p>
      <p className="text-sm text-os-muted">{t("pageText")}</p>
      {error.digest && <code className="font-mono text-xs text-os-faint">{error.digest}</code>}
      <button type="button" onClick={reset} className="os-btn-secondary mt-2">
        {t("retry")}
      </button>
    </div>
  );
}
