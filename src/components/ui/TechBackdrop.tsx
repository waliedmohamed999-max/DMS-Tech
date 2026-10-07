/**
 * Decorative "tech" background: soft glows and optional animated circuit traces (no grid lines).
 * Place inside a `relative overflow-hidden` section; content needs `relative`.
 */
export default function TechBackdrop({ variant = "dark", circuits = false }: { variant?: "dark" | "light"; circuits?: boolean }) {
  const dark = variant === "dark";

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {dark ? (
        <>
          <div className="absolute -top-48 end-[-10%] size-[640px] rounded-full bg-[radial-gradient(circle,rgba(98,77,227,.28),transparent_65%)]" />
          <div className="absolute -bottom-64 start-[-12%] size-[620px] rounded-full bg-[radial-gradient(circle,rgba(29,88,192,.30),transparent_65%)]" />
        </>
      ) : (
        <div className="absolute -top-40 start-1/2 size-[560px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(98,77,227,.14),transparent_65%)]" />
      )}
      {circuits && (
        <svg className="absolute inset-0 size-full" preserveAspectRatio="none" viewBox="0 0 1440 800" fill="none">
          <g stroke={dark ? "rgba(169,155,255,.35)" : "rgba(98,77,227,.22)"} strokeWidth="1.2">
            <path d="M0 140 H220 L260 180 H420" />
            <path d="M0 620 H160 L210 570 H360 L400 610 H520" />
            <path d="M1440 110 H1250 L1210 150 H1080" />
            <path d="M1440 680 H1300 L1260 640 H1120 L1090 670 H980" />
            <path d="M720 800 V720 L760 680 V600" />
          </g>
          <g stroke={dark ? "#a99bff" : "#624de3"} strokeWidth="1.6" strokeLinecap="round" className="animate-flow" strokeDasharray="10 190">
            <path d="M0 140 H220 L260 180 H420" />
            <path d="M0 620 H160 L210 570 H360 L400 610 H520" />
            <path d="M1440 110 H1250 L1210 150 H1080" />
            <path d="M1440 680 H1300 L1260 640 H1120 L1090 670 H980" />
          </g>
          <g fill={dark ? "#a99bff" : "#624de3"} opacity={dark ? 0.8 : 0.5}>
            <circle cx="420" cy="180" r="3.5" />
            <circle cx="520" cy="610" r="3.5" />
            <circle cx="1080" cy="150" r="3.5" />
            <circle cx="980" cy="670" r="3.5" />
            <circle cx="760" cy="600" r="3.5" />
          </g>
        </svg>
      )}
    </div>
  );
}
