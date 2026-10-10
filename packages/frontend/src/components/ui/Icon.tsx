import "./Icon.css";

const PATHS = {
  calculate: (
    <>
      <path d="M10 18s6-5.2 6-10a6 6 0 0 0-12 0c0 4.8 6 10 6 10z" />
      <path d="M10 5.5v5M7.5 8h5" />
    </>
  ),
  history: (
    <>
      <path d="M3 16.5h14" />
      <path d="M3.5 12.5l4-4 3 3 5.5-6" />
    </>
  ),
  settings: (
    <>
      <path d="M3 6.5h7M15 6.5h2M3 13.5h2M10 13.5h7" />
      <circle cx="12.5" cy="6.5" r="2" />
      <circle cx="7.5" cy="13.5" r="2" />
    </>
  ),
  pen: (
    <>
      <path d="M4 16l1-3.5 8.5-8.5 2.5 2.5L7.5 15z" />
      <path d="M12 5.5l2.5 2.5" />
    </>
  ),
  edit: <path d="M4 16l1-3.5 8.5-8.5 2.5 2.5L7.5 15z" />,
  meal: (
    <>
      <path d="M5.5 2.5v4.5a2 2 0 0 0 4 0V2.5M7.5 2.5v15" />
      <path d="M14.5 17.5V2.5c-1.6.8-2.5 3-2.5 6h2.5" />
    </>
  ),
  drop: <path d="M10 2.6c3 3.6 5 6.3 5 9a5 5 0 0 1-10 0c0-2.7 2-5.4 5-9z" />,
  chevron: <path d="M7.5 4.5l5.5 5.5-5.5 5.5" />,
  plus: <path d="M10 4.5v11M4.5 10h11" />,
  check: <path d="M4 10.5l4 4 8-9" />,
  up: <path d="M10 15V5M5.5 9.5L10 5l4.5 4.5" />,
  down: <path d="M10 5v10M5.5 10.5L10 15l4.5-4.5" />,
  info: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 9v5M10 6.2v.1" />
    </>
  ),
  alert: (
    <>
      <path d="M10 3l7.5 13.5h-15z" />
      <path d="M10 8.5v3.5M10 14.3v.1" />
    </>
  ),
  thermo: (
    <>
      <path d="M8 4a2 2 0 0 1 4 0v7.3a3.6 3.6 0 1 1-4 0z" />
      <path d="M10 9v4.5" />
    </>
  ),
  run: (
    <>
      <circle cx="12.5" cy="3.6" r="1.5" />
      <path d="M6 9l2.8-2.6h3.4l1.8 3.3 2.5.9M10.4 6.6L9.2 12l3.2 2.2-.6 3.6M9.2 12l-2.6 5.5" />
    </>
  ),
  sun: (
    <>
      <circle cx="10" cy="10" r="3.2" />
      <path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3L6 14M14 6l1.3-1.3" />
    </>
  ),
  plane: <path d="M17 3l-7.5 7.5M17 3l-4.8 14-2.7-6.5L3 7.8z" />,
  moon: <path d="M16.5 12.2A7 7 0 0 1 7.8 3.5a7 7 0 1 0 8.7 8.7z" />,
  pill: (
    <>
      <path d="M8.6 3.9a3.6 3.6 0 0 1 5.1 0l2.4 2.4a3.6 3.6 0 0 1 0 5.1l-4.7 4.7a3.6 3.6 0 0 1-5.1 0l-2.4-2.4a3.6 3.6 0 0 1 0-5.1z" />
      <path d="M6.2 6.3l7.5 7.5" />
    </>
  ),
  star: (
    <path d="M10 2.8l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8.1l5-.7z" />
  ),
};

export type IconName = keyof typeof PATHS;

const SIZES = { sm: 16, md: 20, lg: 24 };

export function Icon({
  name,
  size = "md",
}: {
  name: IconName;
  size?: keyof typeof SIZES;
}) {
  return (
    <svg
      className={`icon icon-${size}`}
      width={SIZES[size]}
      height={SIZES[size]}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
