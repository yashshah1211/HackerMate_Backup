export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--background)] transition-colors duration-300">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center font-bold text-sm text-white">
          H
        </div>
        <div className="w-5 h-5 border-2 border-zinc-800 border-t-zinc-400 rounded-full animate-spin" />
        <p className="text-xs text-zinc-500">Loading workspace...</p>
      </div>
    </div>
  );
}
