import Image from "next/image";
import { ar } from "@/lib/i18n/ar";

type FlagSpec = {
  id: string;
  label: string;
  src: string;
  left: number;
  stringLength: number;
  rotation: number;
  swayDelay: number;
  featured?: boolean;
};

function ropeAttachTop(leftPercent: number) {
  const t = leftPercent / 100;
  const y = (1 - t) ** 2 * 6 + 2 * (1 - t) * t * 28 + t ** 2 * 6;
  return `${(y / 40) * 2.5}rem`;
}

const flags: FlagSpec[] = [
  {
    id: "usa",
    label: "الولايات المتحدة",
    src: "/flags/usa.svg",
    left: 8,
    stringLength: 28,
    rotation: -6,
    swayDelay: 0,
  },
  {
    id: "mex",
    label: "المكسيك",
    src: "/flags/mex.svg",
    left: 20,
    stringLength: 34,
    rotation: 4,
    swayDelay: 0.4,
  },
  {
    id: "fra",
    label: "فرنسا",
    src: "/flags/fra.svg",
    left: 32,
    stringLength: 26,
    rotation: -8,
    swayDelay: 1,
  },
  {
    id: "sa",
    label: "السعودية",
    src: "/flags/sa.svg",
    left: 50,
    stringLength: 42,
    rotation: 0,
    swayDelay: 0.2,
    featured: true,
  },
  {
    id: "arg",
    label: "الأرجنتين",
    src: "/flags/arg.svg",
    left: 68,
    stringLength: 36,
    rotation: -5,
    swayDelay: 0.6,
  },
  {
    id: "bra",
    label: "البرازيل",
    src: "/flags/bra.svg",
    left: 80,
    stringLength: 30,
    rotation: 7,
    swayDelay: 0.8,
  },
  {
    id: "esp",
    label: "إسبانيا",
    src: "/flags/esp.svg",
    left: 92,
    stringLength: 32,
    rotation: 5,
    swayDelay: 1.2,
  },
];

function HangingFlag({ flag }: { flag: FlagSpec }) {
  return (
    <div
      className="absolute flex -translate-x-1/2 flex-col items-center"
      style={{ left: `${flag.left}%`, top: ropeAttachTop(flag.left) }}
      title={flag.label}
    >
      <div
        className="w-px bg-gradient-to-b from-amber-200/90 to-amber-100/40"
        style={{ height: flag.stringLength }}
      />
      <div
        className="origin-top"
        style={{ transform: `rotate(${flag.rotation}deg)` }}
      >
        <div
          className="flag-sway"
          style={{ animationDelay: `${flag.swayDelay}s` }}
        >
          <Image
            src={flag.src}
            alt={flag.label}
            width={flag.featured ? 64 : 56}
            height={flag.featured ? 43 : 38}
            className={
              flag.featured
                ? "h-10 w-14 rounded-sm object-cover shadow-lg ring-2 ring-warning/70 sm:h-11 sm:w-16"
                : "h-8 w-12 rounded-sm object-cover shadow-md ring-1 ring-black/20 sm:h-9 sm:w-14"
            }
            priority={flag.featured}
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}

export function WorldCupFlagGarland() {
  return (
    <div className="relative mx-auto mb-2 w-full max-w-lg" aria-hidden>
      <div className="relative h-28 overflow-visible sm:h-32">
        <svg
          className="absolute left-0 top-0 h-10 w-full"
          viewBox="0 0 400 40"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="ropeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#92400e" />
              <stop offset="50%" stopColor="#d97706" />
              <stop offset="100%" stopColor="#92400e" />
            </linearGradient>
          </defs>
          <path
            d="M 0 6 Q 200 28 400 6"
            fill="none"
            stroke="url(#ropeGrad)"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M 0 6 Q 200 28 400 6"
            fill="none"
            stroke="#fcd34d"
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.35"
          />
          {flags.map((flag) => (
            <circle
              key={`clip-${flag.id}`}
              cx={(flag.left / 100) * 400}
              cy={6 + Math.sin((flag.left / 100) * Math.PI) * 10 + 4}
              r="3"
              fill="#b45309"
              stroke="#fcd34d"
              strokeWidth="1"
            />
          ))}
        </svg>

        <div className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-warning bg-amber-700 shadow-md" />

        {flags.map((flag) => (
          <HangingFlag key={flag.id} flag={flag} />
        ))}
      </div>

      <div className="mt-1 flex items-center justify-center gap-2">
        <span className="h-px w-8 bg-gradient-to-l from-warning/60 to-transparent" />
        <span className="text-lg">🏆</span>
        <span className="text-xs font-bold tracking-wide text-warning sm:text-sm">
          {ar.worldCup}
        </span>
        <span className="text-lg">🏆</span>
        <span className="h-px w-8 bg-gradient-to-r from-warning/60 to-transparent" />
      </div>
    </div>
  );
}
