export default function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`${className} hm-logo-container`}>
      {/* HACKER - Lime green in dark theme / rich forest emerald in light theme */}
      <span className="hm-logo-hacker">
        HACKER
      </span>

      {/* MATE + icons - Cyan in dark theme / deep ocean blue-cyan in light theme */}
      <span className="hm-logo-mate">
        MATE
        {/* Key icon */}
        <svg
          viewBox="0 0 32 32"
          style={{ width: "0.58em", height: "0.58em", flexShrink: 0 }}
          fill="none"
          className="hm-logo-svg"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4" className="hm-logo-circle" stroke="none" />
          <line x1="18" y1="18" x2="30" y2="6" />
          <line x1="26" y1="9" x2="30" y2="6" />
          <line x1="30" y1="6" x2="32" y2="10" />
        </svg>
        {/* Cursor / arrow icon */}
        <svg
          viewBox="0 0 22 28"
          style={{ width: "0.48em", height: "0.58em", flexShrink: 0 }}
          fill="none"
          className="hm-logo-svg"
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