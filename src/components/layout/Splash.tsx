import Image from "next/image";

/**
 * Opening screen: "Welcome to" + the logo on the dark brand background, then it fades away (globals.css .splash).
 * Pure CSS — no JavaScript, so it can never get stuck: it is part of the server HTML, plays once per full page load
 * (client-side navigation keeps the layout, so moving between pages never replays it) and is skipped entirely for
 * visitors who ask for reduced motion. The page renders underneath the whole time; crawlers see the real content.
 */
export function Splash({ locale }: { locale: string }) {
  return (
    <div className="splash" aria-hidden>
      <div className="splash-inner grid justify-items-center gap-5 px-6 text-center">
        <p className="text-xl font-semibold text-white/80 md:text-2xl">{locale === "ar" ? "مرحباً بك في" : "Welcome to"}</p>
        <Image src="/images/logo-dark.png" alt="" width={1200} height={437} priority className="h-20 w-auto md:h-24" />
        <span className="mt-2 block h-0.5 w-40 overflow-hidden rounded-full bg-white/10">
          <span className="splash-bar block h-full rounded-full bg-gradient-to-r from-iris to-iris-light" />
        </span>
      </div>
    </div>
  );
}
