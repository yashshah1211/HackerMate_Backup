import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-6 py-12 bg-[var(--background)] transition-colors duration-300">
      <div className="text-center space-y-6 max-w-md">
        
        {/* Large stylized 404 text with gradient */}
        <div className="relative">
          <h1 className="text-8xl font-black tracking-widest text-[var(--text-primary)] select-none opacity-[0.08] dark:opacity-[0.04]">
            404
          </h1>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-mono uppercase tracking-[0.3em] bg-gradient-to-r from-violet-400 to-indigo-500 bg-clip-text text-transparent font-bold">
              Page Not Found
            </span>
          </div>
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
            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 active:scale-98 text-white text-xs font-semibold px-6 py-2.5 rounded-lg shadow-lg shadow-violet-900/10 transition-all"
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
