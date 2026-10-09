export function Logo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <circle
        cx="24"
        cy="24"
        r="19.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
      />
      <path
        d="M24 11.5c-3.2 4.3-8.5 11.2-8.5 16.3a8.5 8.5 0 0 0 17 0c0-5.1-5.3-12-8.5-16.3z"
        fill="currentColor"
      />
    </svg>
  );
}
