import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-6 py-12 bg-[var(--background)] transition-colors duration-300">
      <div className="text-center space-y-6 max-w-md">
        
        {/* 404 indicator */}
        <div className="mb-6">
          <span className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500 font-semibold">
            404
          </span>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
            Lost in space?
          </h2>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-sm mx-auto">
            The page you are looking for doesn&apos;t exist or has been moved to a different workspace.
          </p>
        </div>

        {/* Primary Action Button */}
        <div className="pt-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 active:scale-98 text-white text-xs font-semibold px-6 py-2.5 rounded-lg transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
