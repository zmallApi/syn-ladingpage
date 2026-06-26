export function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`logo-mark ${className}`}
      aria-hidden
    >
      <rect width="32" height="32" rx="8" fill="#0a1628" />

      {/* Anel externo + nós em órbita */}
      <g transform="translate(16, 16)">
        <circle r="10" stroke="#00e5ff" strokeWidth="0.6" opacity="0.25" />
        <g>
          <circle cx="0" cy="-10" r="1.4" fill="#00e5ff" />
          <circle cx="8.66" cy="5" r="1.2" fill="#a855f7" opacity="0.9" />
          <circle cx="-8.66" cy="5" r="1.2" fill="#a855f7" opacity="0.9" />
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0"
            to="360"
            dur="14s"
            repeatCount="indefinite"
          />
        </g>
      </g>

      {/* Anel inclinado — rotação inversa */}
      <g transform="translate(16, 16)">
        <g>
          <ellipse rx="8" ry="3" stroke="#00e5ff" strokeWidth="0.7" opacity="0.45" />
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="360"
            to="0"
            dur="9s"
            repeatCount="indefinite"
          />
        </g>
      </g>

      {/* Segundo anel inclinado */}
      <g transform="translate(16, 16) rotate(60)">
        <g>
          <ellipse rx="8" ry="3" stroke="#a855f7" strokeWidth="0.5" opacity="0.3" />
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0"
            to="360"
            dur="11s"
            repeatCount="indefinite"
          />
        </g>
      </g>

      {/* Núcleo */}
      <circle
        className="logo-core-ring"
        cx="16"
        cy="16"
        r="5.5"
        stroke="#00e5ff"
        strokeWidth="1.5"
      />
      <circle className="logo-core-dot" cx="16" cy="16" r="2" fill="#00e5ff" />

      {/* Raios cardinais */}
      <g className="logo-spokes" opacity="0.55">
        <path d="M16 5v3M16 24v3M5 16h3M24 16h3" stroke="#00e5ff" strokeWidth="1.2" strokeLinecap="round" />
      </g>
    </svg>
  );
}
