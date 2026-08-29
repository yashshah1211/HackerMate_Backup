"use client";

import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

export interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

export interface ConfirmDialog {
  id: string;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

interface NotificationContextType {
  showToast: (message: string, type?: Toast["type"]) => void;
  confirm: (options: Omit<ConfirmDialog, "id">) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotification must be used within a NotificationProvider");
  }
  return context;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<ConfirmDialog | null>(null);

  const showToast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto remove toast after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const confirm = useCallback((options: Omit<ConfirmDialog, "id">) => {
    const id = Math.random().toString(36).substring(2, 9);
    setDialog({ ...options, id });
  }, []);

  const handleConfirm = () => {
    if (dialog) {
      const currentDialog = dialog;
      setDialog(null);
      currentDialog.onConfirm();
    }
  };

  const handleCancel = () => {
    if (dialog) {
      const currentDialog = dialog;
      setDialog(null);
      if (currentDialog.onCancel) currentDialog.onCancel();
    }
  };

  const contextValue = useMemo(() => ({ showToast, confirm }), [showToast, confirm]);

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}

      {/* Toasts list container */}
      <div className="fixed top-20 right-6 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => {
          const styles = {
            success: {
              border: "border-emerald-500/30 dark:border-emerald-500/20 bg-white/95 dark:bg-zinc-950/90 text-emerald-600 dark:text-emerald-400",
              glow: "shadow-lg shadow-emerald-500/10 dark:shadow-[0_0_15px_-3px_rgba(16,185,129,0.15)]",
              icon: (
                <svg className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ),
            },
            error: {
              border: "border-rose-500/30 dark:border-rose-500/20 bg-white/95 dark:bg-zinc-950/90 text-rose-600 dark:text-rose-400",
              glow: "shadow-lg shadow-rose-500/10 dark:shadow-[0_0_15px_-3px_rgba(244,63,94,0.15)]",
              icon: (
                <svg className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              ),
            },
            warning: {
              border: "border-amber-500/30 dark:border-amber-500/20 bg-white/95 dark:bg-zinc-950/90 text-amber-600 dark:text-amber-400",
              glow: "shadow-lg shadow-amber-500/10 dark:shadow-[0_0_15px_-3px_rgba(245,158,11,0.15)]",
              icon: (
                <svg className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              ),
            },
            info: {
              border: "border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/90 text-zinc-800 dark:text-zinc-300",
              glow: "shadow-lg shadow-zinc-950/5 dark:shadow-[0_0_15px_-3px_rgba(255,255,255,0.05)]",
              icon: (
                <svg className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ),
            },
          }[toast.type];

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 p-3 rounded-lg border ${styles.border} ${styles.glow} backdrop-blur-md animate-fade-in-right max-w-sm`}
              style={{
                animation: "toast-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards",
              }}
            >
              {styles.icon}
              <p className="text-xs leading-relaxed font-medium flex-1">{toast.message}</p>
              <button
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors p-0.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {/* Confirmation Dialog Overlay */}
      {dialog && (
        <div
          className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-md flex items-center justify-center z-[99999] px-4 animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCancel();
          }}
        >
          <div className="p-6 rounded-2xl w-full max-w-sm border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/95 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 dark:text-amber-400 flex items-center justify-center text-sm font-bold shrink-0">
                ⚠️
              </span>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white font-mono tracking-tight leading-snug">
                {dialog.title}
              </h2>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed font-sans">
              {dialog.message}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-900 font-mono">
              <button
                onClick={handleCancel}
                className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 text-xs font-bold transition cursor-pointer"
              >
                {dialog.cancelText || "Cancel"}
              </button>
              <button
                onClick={handleConfirm}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white dark:text-zinc-950 font-extrabold text-xs transition cursor-pointer shadow-lg shadow-emerald-500/20"
              >
                {dialog.confirmText || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </NotificationContext.Provider>
  );
}
