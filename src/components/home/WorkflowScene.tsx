"use client";

import { useEffect, useState } from "react";
import { siWhatsapp } from "simple-icons";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * Animated hero scene modelled on Specify's looping "token engine" video:
 * satellites orbit the core, every few seconds a new source docks into the input slot,
 * the two processor panels swap to new operations, light pulses run through the pipes
 * and the terminal types out the result. Pure SVG + CSS, so it stays sharp and light.
 */

type Scene = {
  source: { label: string; brand?: string; icon?: IconName };
  p1: { title: string; from: string; to: string };
  p2: { title: string; kind: "bars" | "grid" | "toggle" };
  out: string[];
};

const scenes: Scene[] = [
  {
    source: { label: "whatsapp", brand: "whatsapp" },
    p1: { title: "Qualify Leads", from: "new-lead", to: "hot-lead" },
    p2: { title: "Sync to CRM", kind: "bars" },
    out: ["Success! ✦", "128 leads synced", "crm/leads", "follow-up: 24h"]
  },
  {
    source: { label: "store", icon: "ShoppingCart" },
    p1: { title: "Detect Carts", from: "abandoned", to: "reminder" },
    p2: { title: "Send Offers", kind: "grid" },
    out: ["Success! ✦", "42 carts recovered", "store/orders", "revenue: +18%"]
  },
  {
    source: { label: "forms", icon: "ClipboardList" },
    p1: { title: "Route Request", from: "website", to: "sales-team" },
    p2: { title: "Create Task", kind: "toggle" },
    out: ["Success! ✦", "Task #214 created", "ops/tasks", "sla: 2h"]
  }
];

const CX = 270;
const CY = 235;

// isometric cube cluster for the core
const U = 26;
const P = (x: number, y: number, z: number) => [(x - y) * 0.866 * U, (x + y) * 0.5 * U - z * U];
const cubes = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1]
].sort((a, b) => a[0] + a[1] - (b[0] + b[1]) || a[2] - b[2]);
const face = (pts: number[][]) => pts.map((p) => p.join(",")).join(" ");
function cubeFaces([x, y, z]: number[]) {
  const c = (dx: number, dy: number, dz: number) => P(x + dx, y + dy, z + dz);
  return [
    face([c(0, 1, 1), c(1, 1, 1), c(1, 1, 0), c(0, 1, 0)]),
    face([c(1, 0, 1), c(1, 1, 1), c(1, 1, 0), c(1, 0, 0)]),
    face([c(0, 0, 1), c(1, 0, 1), c(1, 1, 1), c(0, 1, 1)])
  ];
}

const PIPES = {
  core: "M375 235 H452",
  up: "M535 235 H560 Q578 235 578 217 V168 Q578 150 596 150 H612",
  down: "M535 235 H560 Q578 235 578 253 V300 Q578 318 596 318 H612",
  loop: "M760 190 V230 Q760 246 744 246 H690 Q674 246 674 262 V278",
  outUp: "M882 150 H905 Q922 150 922 168 V214 Q922 232 940 232 H952",
  outDown: "M882 318 H905 Q922 318 922 300 V250 Q922 232 940 232"
};

function Pipe({ d, flow, delay = 0 }: { d: string; flow: boolean; delay?: number }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} stroke="#000" strokeOpacity=".45" strokeWidth="22" />
      <path d={d} stroke="#0d0e0f" strokeWidth="16" />
      <path d={d} stroke="url(#pipe)" strokeWidth="12" />
      <path d={d} stroke="rgba(255,255,255,.10)" strokeWidth="1.5" transform="translate(0,-3)" />
      {flow && (
        <path
          d={d}
          stroke="#c9b8ff"
          strokeWidth="3"
          strokeDasharray="14 120"
          filter="url(#softglow)"
          className="animate-[flow_1.6s_linear_infinite]"
          style={{ animationDelay: `${delay}s` }}
        />
      )}
    </g>
  );
}

function SourceGlyph({ s, size = 34 }: { s: Scene["source"]; size?: number }) {
  if (s.brand === "whatsapp")
    return (
      <g transform={`translate(${-size / 2} ${-size / 2}) scale(${size / 24})`}>
        <path d={siWhatsapp.path} fill="#d4d6d9" />
      </g>
    );
  return <Icon name={s.icon!} x={-size / 2} y={-size / 2} size={size} color="#d4d6d9" strokeWidth={1.6} />;
}

const satellites: { icon: IconName; label: string; angle: number }[] = [
  { icon: "Image", label: "MEDIA", angle: 225 },
  { icon: "MessagesSquare", label: "CHATS", angle: 135 },
  { icon: "ShoppingCart", label: "STORE", angle: 45 },
  { icon: "ClipboardList", label: "FORMS", angle: 315 },
  { icon: "Users", label: "CRM", angle: 180 },
  { icon: "Mail", label: "EMAIL", angle: 270 }
];

export default function WorkflowScene() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % scenes.length), 5000);
    return () => clearInterval(id);
  }, []);
  const s = scenes[i];

  return (
    <div dir="ltr" aria-hidden className="relative mx-auto mt-14 w-full max-w-[1180px] [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
      <svg viewBox="0 0 1180 470" className="h-auto w-full" fontFamily="var(--font-fira), monospace">
        <defs>
          <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#34373a" />
            <stop offset="1" stopColor="#151718" />
          </linearGradient>
          <linearGradient id="metal2" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3b3e41" />
            <stop offset=".5" stopColor="#1d1f20" />
            <stop offset="1" stopColor="#101112" />
          </linearGradient>
          <linearGradient id="pipe" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3a3d40" />
            <stop offset=".5" stopColor="#202224" />
            <stop offset="1" stopColor="#141516" />
          </linearGradient>
          <radialGradient id="core" cx=".5" cy=".5" r=".6">
            <stop offset="0" stopColor="#1b1530" />
            <stop offset="1" stopColor="#0a0a0b" />
          </radialGradient>
          <radialGradient id="screen" cx=".3" cy=".2" r="1">
            <stop offset="0" stopColor="#1f2224" />
            <stop offset="1" stopColor="#0b0c0d" />
          </radialGradient>
          <pattern id="dots" width="4" height="4" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r=".9" fill="#4a4d51" />
          </pattern>
          <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="softglow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="drop" x="-40%" y="-40%" width="180%" height="200%">
            <feDropShadow dx="0" dy="16" stdDeviation="14" floodColor="#000" floodOpacity=".65" />
          </filter>
        </defs>

        {/* orbit ring + rotating satellites */}
        <circle cx={CX} cy={CY} r="215" fill="none" stroke="#232527" strokeWidth="1.5" />
        <g className="animate-[spin_48s_linear_infinite] [transform-box:view-box]" style={{ transformOrigin: `${CX}px ${CY}px` }}>
          {satellites.map((sat) => {
            const a = (sat.angle * Math.PI) / 180;
            const x = CX + 215 * Math.cos(a);
            const y = CY + 215 * Math.sin(a);
            return (
              <g key={sat.label} transform={`translate(${x} ${y}) rotate(${sat.angle + 90})`} opacity=".5">
                <rect x="-34" y="-34" width="68" height="68" rx="16" fill="url(#metal)" stroke="#3a3d40" />
                <rect x="-26" y="-26" width="52" height="52" rx="11" fill="#1a1c1d" />
                <Icon name={sat.icon} x={-13} y={-13} size={26} color="#9ea2a6" strokeWidth={1.8} />
                <text x="42" y="4" fill="#6b6f73" fontSize="10" letterSpacing="1.5" transform="rotate(90 42 0)">
                  {sat.label}
                </text>
              </g>
            );
          })}
        </g>

        {/* core */}
        <g filter="url(#drop)">
          <rect x="165" y="130" width="210" height="210" rx="34" fill="url(#metal2)" stroke="#45484c" strokeWidth="1.5" />
        </g>
        <rect x="179" y="144" width="182" height="182" rx="24" fill="url(#core)" stroke="#000" strokeWidth="2" />
        <g transform={`translate(${CX} ${CY})`}>
          <g className="animate-[spin_24s_linear_infinite] [transform-box:fill-box] [transform-origin:center]">
            {Array.from({ length: 12 }, (_, k) => (
              <rect
                key={k}
                x="-4"
                y="-84"
                width="8"
                height="20"
                rx="3"
                fill="#ff9a3c"
                filter="url(#glow)"
                transform={`rotate(${k * 30})`}
                className="animate-pulse-glow"
                style={{ animationDelay: `${k / 6}s` }}
              />
            ))}
          </g>
          <g transform="translate(0 18)" fill="#0c0b12" stroke="#b9a8ff" strokeWidth="2.6" strokeLinejoin="round" filter="url(#softglow)">
            {cubes.map((c) => (
              <g key={c.join()}>
                {cubeFaces(c).map((pts, k) => (
                  <polygon key={k} points={pts} />
                ))}
              </g>
            ))}
          </g>
        </g>

        {/* pipes */}
        <Pipe d={PIPES.core} flow />
        <Pipe d={PIPES.up} flow delay={0.3} />
        <Pipe d={PIPES.down} flow delay={0.5} />
        <Pipe d={PIPES.loop} flow={false} />
        <Pipe d={PIPES.outUp} flow delay={0.9} />
        <Pipe d={PIPES.outDown} flow delay={1.1} />

        {/* source slot — a new module docks each scene */}
        <g filter="url(#drop)">
          <rect x="455" y="195" width="80" height="80" rx="16" fill="url(#metal)" stroke="#45484c" />
        </g>
        <rect x="464" y="204" width="62" height="62" rx="11" fill="#1a1c1d" />
        <g key={`src-${i}`} className="animate-[dock_.7s_cubic-bezier(.2,.8,.2,1)_both]">
          <g transform="translate(495 235)">
            <SourceGlyph s={s.source} />
          </g>
          <rect x="453" y="290" width="84" height="24" rx="6" fill="#151718" stroke="#2c2f31" />
          <text x="495" y="306" textAnchor="middle" fill="#9ea2a6" fontSize="11" letterSpacing="1">
            {s.source.label}
          </text>
        </g>

        {/* processor panels — swap each scene */}
        <g key={`p1-${i}`} className="animate-[panelIn_.8s_cubic-bezier(.2,.8,.2,1)_both]">
          <g filter="url(#drop)">
            <rect x="612" y="112" width="270" height="80" rx="10" fill="url(#metal)" stroke="#45484c" />
          </g>
          <rect x="620" y="119" width="254" height="26" rx="5" fill="url(#dots)" />
          <rect x="682" y="122" width="130" height="20" rx="4" fill="#1d1f21" />
          <text x="747" y="136" textAnchor="middle" fill="#e6e7e8" fontSize="12" letterSpacing="1.2">
            {s.p1.title}
          </text>
          <rect x="620" y="154" width="98" height="26" rx="5" fill="#121314" stroke="#34373a" />
          <text x="669" y="171" textAnchor="middle" fill="#c9b8ff" fontSize="11.5">
            {s.p1.from}
          </text>
          <g fill="#c9b8ff">
            {[0, 1, 2, 3].map((k) => (
              <circle key={k} cx={738 + k * 6} cy="167" r="1.8" className="animate-pulse-glow" style={{ animationDelay: `${k * 0.2}s` }} />
            ))}
          </g>
          <rect x="776" y="154" width="98" height="26" rx="5" fill="#121314" stroke="#34373a" />
          <text x="825" y="171" textAnchor="middle" fill="#c9b8ff" fontSize="11.5">
            {s.p1.to}
          </text>
        </g>

        <g key={`p2-${i}`} className="animate-[panelIn_.8s_.15s_cubic-bezier(.2,.8,.2,1)_both]">
          <g filter="url(#drop)">
            <rect x="612" y="278" width="270" height="80" rx="10" fill="url(#metal)" stroke="#45484c" />
          </g>
          <rect x="620" y="285" width="254" height="26" rx="5" fill="url(#dots)" />
          <rect x="690" y="288" width="114" height="20" rx="4" fill="#1d1f21" />
          <text x="747" y="302" textAnchor="middle" fill="#e6e7e8" fontSize="12" letterSpacing="1.2">
            {s.p2.title}
          </text>
          {s.p2.kind === "bars" &&
            ["#8b7bff", "#22c55e", "#3b82f6", "#f97316"].map((c, k) => (
              <g key={c}>
                <rect x="624" y={321 + k * 8} width="104" height="4" rx="2" fill={c} filter="url(#softglow)" />
                <rect x="766" y={321 + k * 8} width="104" height="4" rx="2" fill={k === 0 ? "#e6e7e8" : "#7c8085"} opacity={k === 0 ? 1 : 0.6} />
              </g>
            ))}
          {s.p2.kind === "grid" &&
            Array.from({ length: 12 }, (_, k) => (
              <rect key={k} x={624 + (k % 6) * 42} y={320 + Math.floor(k / 6) * 16} width="36" height="10" rx="2" fill={k % 5 === 0 ? "#c9b8ff" : "#3a3d40"} />
            ))}
          {s.p2.kind === "toggle" &&
            [0, 1, 2].map((k) => (
              <g key={k} transform={`translate(${628 + k * 84} 322)`}>
                <rect width="36" height="20" rx="10" fill={k < 2 ? "#624de3" : "#3a3d40"} />
                <circle cx={k < 2 ? 26 : 10} cy="10" r="7" fill="#e6e7e8" />
                <rect x="44" y="7" width="28" height="6" rx="3" fill="#55595d" />
              </g>
            ))}
        </g>

        {/* terminal */}
        <g filter="url(#drop)">
          <rect x="952" y="100" width="232" height="270" rx="20" fill="url(#metal2)" stroke="#45484c" strokeWidth="1.5" />
        </g>
        <rect x="966" y="114" width="204" height="242" rx="10" fill="url(#screen)" stroke="#000" strokeWidth="2" />
        <g key={`out-${i}`} fontSize="14.5" letterSpacing=".4">
          {s.out.map((line, k) => (
            <text
              key={k}
              x="982"
              y={144 + k * 26 + (k === 3 ? 8 : 0)}
              fill={k === 0 ? "#e6e7e8" : k === 3 ? "#6b6f73" : "#b4b7bb"}
              className="animate-[typeIn_.35s_steps(6)_both]"
              style={{ animationDelay: `${1.3 + k * 0.45}s` }}
            >
              {line}
            </text>
          ))}
          <rect x="982" y="238" width="9" height="16" fill="#c9b8ff" className="animate-[blink_1s_steps(1)_infinite]" />
        </g>
      </svg>
    </div>
  );
}
