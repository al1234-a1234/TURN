/**
 * أيقونات الهوية — بديل الإيموجيات (🎁 📷 🔔 📍 …) التي كانت تكسر شخصية
 * التطبيق: الإيموجي يتغيّر شكله من جهاز لجهاز وبألوان لا نملكها. هذي SVG
 * بخط الهوية تلوَّن بـcurrentColor فتتبع سياقها أينما وُضعت.
 */

type P = { size?: number; className?: string };
const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
});

export function IconGift({ size = 20, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3.5" y="8.5" width="17" height="4.5" rx="1.2" />
      <path d="M5 13v6a1.5 1.5 0 001.5 1.5h11A1.5 1.5 0 0019 19v-6M12 8.5v12" />
      <path d="M12 8.5S10.8 4 8.6 4c-1.3 0-2 .9-2 1.9C6.6 7.6 9 8.5 12 8.5zm0 0S13.2 4 15.4 4c1.3 0 2 .9 2 1.9C17.4 7.6 15 8.5 12 8.5z" />
    </svg>
  );
}

export function IconCamera({ size = 20, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 8.5A1.5 1.5 0 015.5 7h2l1.4-2h6.2L16.5 7h2A1.5 1.5 0 0120 8.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 17.5v-9z" />
      <circle cx="12" cy="13" r="3.4" />
    </svg>
  );
}

export function IconBell({ size = 20, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M6 10a6 6 0 1112 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10z" />
      <path d="M10 19a2 2 0 004 0" />
    </svg>
  );
}

export function IconPin({ size = 20, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 21s7-6.3 7-11a7 7 0 10-14 0c0 4.7 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}

export function IconPlate({ size = 20, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

export function IconHourglass({ size = 20, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M6.5 3.5h11M6.5 20.5h11M7.5 3.5v3.2c0 2.4 4.5 4 4.5 5.3 0 1.3-4.5 2.9-4.5 5.3v3.2M16.5 3.5v3.2c0 2.4-4.5 4-4.5 5.3 0 1.3 4.5 2.9 4.5 5.3v3.2" />
    </svg>
  );
}

export function IconTv({ size = 20, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="5" width="18" height="12.5" rx="2" />
      <path d="M9 21h6" />
    </svg>
  );
}

export function IconSparkle({ size = 20, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 4l1.7 4.6L18.5 10l-4.8 1.4L12 16l-1.7-4.6L5.5 10l4.8-1.4L12 4z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
    </svg>
  );
}

export function IconHeart({ size = 20, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 10-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    </svg>
  );
}
