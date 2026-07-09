export default function Logo({ className = "" }: { className?: string }) {
  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        flexDirection: "column",
        lineHeight: 1,
        userSelect: "none",
        letterSpacing: "-0.04em",
      }}
    >
      {/* HACKER - Lime green in dark theme / rich forest emerald in light theme */}
      <span
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontWeight: 900,
          fontSize: "1em",
          color: "var(--logo-green)",
          lineHeight: 1.0,
          display: "block",
        }}
      >
        HACKER
      </span>

      {/* MATE + icons - Cyan in dark theme / deep ocean blue-cyan in light theme */}
      <span
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontWeight: 900,
          fontSize: "1em",
          color: "var(--logo-cyan)",
          lineHeight: 1.0,
          display: "flex",
          alignItems: "center",
          gap: "0.1em",
          marginTop: "0.02em",
        }}
      >
        MATE
        {/* Key icon */}
        <svg
          viewBox="0 0 32 32"
          style={{ width: "0.58em", height: "0.58em", flexShrink: 0 }}
          fill="none"
          stroke="var(--logo-cyan)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4" fill="var(--logo-cyan)" stroke="none" />
          <line x1="18" y1="18" x2="30" y2="6" />
          <line x1="26" y1="9" x2="30" y2="6" />
          <line x1="30" y1="6" x2="32" y2="10" />
        </svg>
        {/* Cursor / arrow icon */}
        <svg
          viewBox="0 0 22 28"
          style={{ width: "0.48em", height: "0.58em", flexShrink: 0 }}
          fill="none"
          stroke="var(--logo-cyan)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="1,1 1,24 8,18 12,28 17,26 13,16 22,16" />
        </svg>
      </span>
    </div>
  );
}