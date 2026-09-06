/**
 * Inline icon set.
 *
 * Hand-drawn 16px-grid SVG paths rather than an icon dependency: the whole
 * set costs a few hundred bytes, ships inside the server render and adds no
 * client JavaScript. Every icon is decorative — labelling always comes from
 * adjacent text — so each is `aria-hidden`.
 */
type IconProps = { size?: number; className?: string };

function base(size: number, className?: string) {
  return {
    "aria-hidden": true as const,
    focusable: "false" as const,
    height: size,
    width: size,
    viewBox: "0 0 16 16",
    xmlns: "http://www.w3.org/2000/svg",
    ...(className ? { className } : {}),
  };
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconCheck({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path {...stroke} d="M3 8.5 6.2 11.7 13 4.9" />
    </svg>
  );
}

export function IconArrowRight({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path {...stroke} d="M2.5 8h11M9.5 4l4 4-4 4" />
    </svg>
  );
}

export function IconArrowUp({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path {...stroke} d="M8 13.5v-11M4 6.5l4-4 4 4" />
    </svg>
  );
}

export function IconArrowDown({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path {...stroke} d="M8 2.5v11M4 9.5l4 4 4-4" />
    </svg>
  );
}

export function IconMinus({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path {...stroke} d="M3 8h10" />
    </svg>
  );
}

export function IconToday({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect {...stroke} x="2" y="3" width="12" height="11" rx="2" />
      <path {...stroke} d="M2 6.5h12M5.5 1.8v2.2M10.5 1.8v2.2" />
    </svg>
  );
}

export function IconEdge({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path {...stroke} d="M2 12.5 6 7l3 3 5-6.5" />
      <path {...stroke} d="M10.4 3.5H14v3.6" />
    </svg>
  );
}

export function IconRadar({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle {...stroke} cx="8" cy="8" r="6" />
      <circle {...stroke} cx="8" cy="8" r="2.6" />
      <path {...stroke} d="M8 8 12.4 4.4" />
    </svg>
  );
}

export function IconPricing({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path
        {...stroke}
        d="M2.6 7.2V3.4a.8.8 0 0 1 .8-.8h3.8L13.4 8.8a1 1 0 0 1 0 1.4l-3.2 3.2a1 1 0 0 1-1.4 0Z"
      />
      <circle cx="5.6" cy="5.6" r="1" fill="currentColor" />
    </svg>
  );
}

export function IconAccount({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle {...stroke} cx="8" cy="5.6" r="2.8" />
      <path {...stroke} d="M2.8 13.6a5.2 5.2 0 0 1 10.4 0" />
    </svg>
  );
}

export function IconShield({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path
        {...stroke}
        d="M8 1.8 13.2 4v4c0 3-2.2 5.3-5.2 6.2C5 13.3 2.8 11 2.8 8V4Z"
      />
      <path {...stroke} d="M5.9 8.1 7.4 9.6l2.9-3" />
    </svg>
  );
}

export function IconAlert({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path {...stroke} d="M8 2.2 14.6 13.4H1.4Z" />
      <path {...stroke} d="M8 6.6v3.1" />
      <circle cx="8" cy="11.5" r=".85" fill="currentColor" />
    </svg>
  );
}

export function IconInfo({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle {...stroke} cx="8" cy="8" r="6.2" />
      <path {...stroke} d="M8 7.4v3.6" />
      <circle cx="8" cy="5.1" r=".85" fill="currentColor" />
    </svg>
  );
}

export function IconSearch({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle {...stroke} cx="7.1" cy="7.1" r="4.6" />
      <path {...stroke} d="m10.6 10.6 3 3" />
    </svg>
  );
}

export function IconSignOut({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path
        {...stroke}
        d="M6.2 13.5H3.4a.9.9 0 0 1-.9-.9V3.4a.9.9 0 0 1 .9-.9h2.8"
      />
      <path {...stroke} d="M10.2 11.2 13.4 8l-3.2-3.2M13.4 8H6.4" />
    </svg>
  );
}

export function IconSpark({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path {...stroke} d="M8 1.8v3M8 11.2v3M1.8 8h3M11.2 8h3" />
      <circle {...stroke} cx="8" cy="8" r="2.2" />
    </svg>
  );
}

export function IconLock({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect {...stroke} x="3.2" y="7" width="9.6" height="7" rx="1.6" />
      <path {...stroke} d="M5.6 7V4.9a2.4 2.4 0 0 1 4.8 0V7" />
      <circle cx="8" cy="10.5" r="1" fill="currentColor" />
    </svg>
  );
}
