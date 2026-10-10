import "./Icon.css";

const PATHS = {
  calculate: (
    <>
      <path d="M12 3a6 6 0 0 0-6 6c0 4 6 12 6 12s6-8 6-12a6 6 0 0 0-6-6z" />
      <path d="M9.5 9h5M12 6.5v5" />
    </>
  ),
  history: (
    <>
      <path d="M3 17l5-6 4 3 4-7 5 5" />
      <path d="M3 21h18" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
  pen: <path d="M14 4l6 6M4 20l3-1 11-11-2-2L5 17z" />,
  edit: (
    <>
      <path d="M21.17 6.81a2.82 2.82 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z" />
      <path d="m15 5 4 4" />
    </>
  ),
  meal: (
    <path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 3-3 6s1 4 3 4v8" />
  ),
  drop: <path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z" />,
  chevron: <path d="M9 6l6 6-6 6" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = "md",
}: {
  name: IconName;
  size?: "sm" | "md";
}) {
  return (
    <svg
      className={`icon icon-${size}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
