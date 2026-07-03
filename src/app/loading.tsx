export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--background)] transition-colors duration-300">
      <div className="relative flex items-center justify-center">
        {/* Outer glowing pulsing ring */}
        <div className="absolute w-20 h-20 rounded-full border border-violet-500/20 bg-gradient-to-tr from-violet-600/10 to-indigo-600/5 animate-ping opacity-75" />
        
        {/* Inner rotating gradient arc */}
        <div className="w-12 h-12 rounded-full border-2 border-t-violet-500 border-r-transparent border-b-indigo-500 border-l-transparent animate-spin duration-1000" />
        
        {/* Center brand mark */}
        <div className="absolute font-bold text-sm tracking-widest text-[var(--text-primary)]">
          H
        </div>
      </div>
      
      {/* Loading message */}
      <h3 className="mt-6 text-xs font-semibold uppercase tracking-[0.25em] text-[var(--text-primary)] animate-pulse">
        HackerMate
      </h3>
      <p className="mt-1 text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
        Loading workspace...
      </p>
    </div>
  );
}
