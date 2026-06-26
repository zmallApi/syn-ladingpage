const NODES = [
  [100, 30],
  [160.6, 65],
  [160.6, 135],
  [100, 170],
  [39.4, 135],
  [39.4, 65],
] as const;

/** Linhas conectando nós opostos pelo centro */
const AXIS_LINES = [
  [100, 30, 100, 170],
  [160.6, 65, 39.4, 135],
  [39.4, 65, 160.6, 135],
] as const;

export function WireframeGlobe() {
  return (
    <div className="globe-scene relative mx-auto aspect-square w-full max-w-md">
      <div className="absolute inset-0 rounded-full bg-cyan/5 blur-3xl glow-orb" />
      <div className="absolute inset-6 rounded-full border border-cyan/10 float-slow" />
      <div
        className="absolute inset-12 rounded-full border border-purple/10 float-slow"
        style={{ animationDelay: "-2s" }}
      />

      <svg viewBox="0 0 200 200" className="relative h-full w-full" fill="none" aria-hidden>
        {/* Anel externo */}
        <circle
          cx="100"
          cy="100"
          r="70"
          stroke="rgba(0,229,255,0.35)"
          strokeWidth="0.75"
          className="globe-outer-ring"
        />

        {/* Três elipses orbitais — rotações independentes */}
        <g transform="translate(100, 100)">
          <g>
            <ellipse rx="70" ry="25" stroke="rgba(0,229,255,0.35)" strokeWidth="0.75" />
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0"
              to="360"
              dur="20s"
              repeatCount="indefinite"
            />
          </g>
          <g>
            <ellipse rx="70" ry="25" stroke="rgba(0,229,255,0.28)" strokeWidth="0.65" />
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="60"
              to="420"
              dur="16s"
              repeatCount="indefinite"
            />
          </g>
          <g>
            <ellipse rx="70" ry="25" stroke="rgba(168,85,247,0.22)" strokeWidth="0.55" />
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="-60"
              to="300"
              dur="24s"
              repeatCount="indefinite"
            />
          </g>
        </g>

        {/* Eixos + nós — rotação lenta em conjunto */}
        <g transform="translate(100, 100)">
          <g>
            {AXIS_LINES.map(([x1, y1, x2, y2], i) => (
              <line
                key={i}
                x1={x1 - 100}
                y1={y1 - 100}
                x2={x2 - 100}
                y2={y2 - 100}
                stroke="rgba(0,229,255,0.2)"
                strokeWidth="0.6"
              />
            ))}
            {NODES.map(([cx, cy], i) => (
              <circle
                key={i}
                cx={cx - 100}
                cy={cy - 100}
                r="3.5"
                fill="rgba(168,85,247,0.75)"
                className="globe-node"
                style={{ animationDelay: `${i * 0.35}s` }}
              />
            ))}
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0"
              to="360"
              dur="36s"
              repeatCount="indefinite"
            />
          </g>
        </g>

        {/* Núcleo */}
        <circle cx="100" cy="100" r="5" fill="#00e5ff" className="globe-core-dot" />
        <circle
          cx="100"
          cy="100"
          r="8"
          stroke="rgba(0,229,255,0.4)"
          strokeWidth="1"
          fill="none"
          className="globe-core-ring"
        />
      </svg>
    </div>
  );
}
