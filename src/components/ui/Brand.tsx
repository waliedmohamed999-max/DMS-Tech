import {
  siApplepay, siClaude, siFacebook, siFirebase, siFlutter, siGmail, siGoogleads, siGoogleanalytics, siGooglecloud, siGooglegemini,
  siHubspot, siInstagram, siLaravel, siMake, siMeta, siN8n, siNextdotjs, siNodedotjs, siNotion, siOdoo, siReact,
  siShopify, siSnapchat, siStripe, siSupabase, siTiktok, siWhatsapp, siWoocommerce, siX, siYoutube, siZapier, siZoho
} from "simple-icons";

type SimpleIcon = { title: string; path: string; hex: string };

const brands: Record<string, SimpleIcon> = {
  applepay: siApplepay, claude: siClaude, facebook: siFacebook, firebase: siFirebase, gmail: siGmail, flutter: siFlutter, googleads: siGoogleads,
  googleanalytics: siGoogleanalytics, googlecloud: siGooglecloud, googlegemini: siGooglegemini, hubspot: siHubspot,
  instagram: siInstagram, laravel: siLaravel, make: siMake, meta: siMeta, n8n: siN8n, nextdotjs: siNextdotjs,
  nodedotjs: siNodedotjs, notion: siNotion, odoo: siOdoo, react: siReact, shopify: siShopify, snapchat: siSnapchat,
  stripe: siStripe, supabase: siSupabase, tiktok: siTiktok, whatsapp: siWhatsapp, woocommerce: siWoocommerce,
  x: siX, youtube: siYoutube, zapier: siZapier, zoho: siZoho,
  // LinkedIn was removed from simple-icons; keep our own path.
  linkedin: {
    title: "LinkedIn",
    hex: "0A66C2",
    path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
  }
};

export function BrandIcon({
  slug,
  size = 20,
  colored = false,
  className
}: {
  slug: string;
  size?: number;
  colored?: boolean;
  className?: string;
}) {
  const icon = brands[slug];
  if (!icon) return null;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true" fill={colored ? `#${icon.hex}` : "currentColor"}>
      <path d={icon.path} />
    </svg>
  );
}

export const hasBrand = (slug?: string) => !!slug && slug in brands;
