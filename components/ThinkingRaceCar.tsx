"use client";

/**
 * Racing car + pulsing dots while the model responds.
 */
export function ThinkingRaceCar() {
  return (
    <div
      className="thinking-car-track flex items-end gap-3 py-1"
      role="status"
      aria-label="Thinking"
    >
      <div className="thinking-car-mascot text-zinc-700">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={52}
          height={26}
          viewBox="0 0 36 18"
          className="block"
          aria-hidden
        >
          <g fill="currentColor">
            <rect x="28" y="3" width="6" height="3" />
            <rect x="14" y="1" width="14" height="7" />
            <rect x="2" y="6" width="32" height="6" />
            <rect x="0" y="8" width="5" height="4" />
            <rect x="5" y="12" width="6" height="5" rx="1" />
            <rect x="23" y="12" width="6" height="5" rx="1" />
            <rect x="31" y="9" width="3" height="3" />
          </g>
        </svg>
      </div>
      <span className="thinking-car-dots flex translate-y-1 items-center gap-1 text-lg font-bold leading-none text-zinc-500">
        <span className="thinking-dot inline-block">·</span>
        <span className="thinking-dot inline-block">·</span>
        <span className="thinking-dot inline-block">·</span>
      </span>
    </div>
  );
}
