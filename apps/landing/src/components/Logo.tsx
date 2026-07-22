/** Mark Synapsee estático — sem animação que estoure o layout do header. */
export function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`block shrink-0 ${className}`}
      width={28}
      height={28}
      aria-hidden
    >
      <rect width="32" height="32" rx="8" fill="#0a1628" />
      <circle cx="16" cy="16" r="6" stroke="#00e5ff" strokeWidth="2" />
      <circle cx="16" cy="16" r="2" fill="#00e5ff" />
      <path
        d="M16 4v4M16 24v4M4 16h4M24 16h4"
        stroke="#00e5ff"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path
        d="M7.5 7.5l2.8 2.8M21.7 21.7l2.8 2.8M7.5 24.5l2.8-2.8M21.7 10.3l2.8-2.8"
        stroke="#a855f7"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}
