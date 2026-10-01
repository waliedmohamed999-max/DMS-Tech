import { whatsappLink } from "@/content/site";
import { BrandIcon } from "@/components/ui/Brand";

export function WhatsAppFloat() {
  return (
    <a
      href={whatsappLink()}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="WhatsApp"
      className="fixed bottom-6 end-6 z-40 grid size-14 place-items-center rounded-full bg-ink text-white shadow-[0_18px_30px_-12px_rgba(0,0,0,.6)] transition hover:scale-105"
    >
      <BrandIcon slug="whatsapp" size={26} />
    </a>
  );
}
