"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CircleCheck, Info, TriangleAlert, X, OctagonAlert } from "lucide-react";

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

const toastStyle: Record<Toast["type"], { icon: React.ReactNode; bar: string }> = {
  success: { icon: <CircleCheck className="size-4 text-ok" />, bar: "bg-ok" },
  error: { icon: <OctagonAlert className="size-4 text-bad" />, bar: "bg-bad" },
  warning: { icon: <TriangleAlert className="size-4 text-warn" />, bar: "bg-warn" },
  info: { icon: <Info className="size-4 text-ink-3" />, bar: "bg-ink-4" },
};

/** Toasts + confirm dialog. API unchanged from V1; presentation on V2 tokens. */
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<ConfirmDialog | null>(null);

  const showToast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev.slice(-3), { id, message, type }]);
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
      const current = dialog;
      setDialog(null);
      current.onConfirm();
    }
  };

  const handleCancel = () => {
    if (dialog) {
      const current = dialog;
      setDialog(null);
      if (current.onCancel) current.onCancel();
    }
  };

  const contextValue = useMemo(() => ({ showToast, confirm }), [showToast, confirm]);

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}

      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-3 top-[calc(var(--hm-topbar-h)+8px)] z-[9999] flex flex-col items-stretch gap-2 md:inset-x-auto md:right-5 md:top-5 md:w-[360px]"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const s = toastStyle[toast.type];
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ type: "spring", stiffness: 520, damping: 40 }}
                role={toast.type === "error" ? "alert" : "status"}
                className="pointer-events-auto relative flex items-start gap-2.5 overflow-hidden rounded-lg border border-line bg-overlay py-2.5 pl-3.5 pr-2 shadow-pop"
              >
                <span className={`absolute inset-y-0 left-0 w-[3px] ${s.bar}`} aria-hidden />
                <span className="mt-0.5 shrink-0">{s.icon}</span>
                <p className="min-w-0 flex-1 text-[13px] leading-snug text-ink">{toast.message}</p>
                <button
                  type="button"
                  onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                  aria-label="Dismiss"
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded text-ink-4 hover:bg-hover hover:text-ink"
                >
                  <X className="size-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {dialog && (
          <div className="fixed inset-0 z-[99999] flex items-end justify-center sm:items-center sm:p-6">
            <motion.div
              className="absolute inset-0 bg-[var(--hm-scrim)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCancel}
              aria-hidden
            />
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={`confirm-${dialog.id}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ type: "spring", stiffness: 520, damping: 40 }}
              className="relative w-full rounded-t-xl border border-line bg-overlay shadow-pop sm:max-w-sm sm:rounded-xl"
            >
              <div className="px-5 pb-4 pt-5">
                <h2 id={`confirm-${dialog.id}`} className="text-[15px] font-semibold text-ink">
                  {dialog.title}
                </h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">{dialog.message}</p>
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="h-[34px] rounded-md px-3.5 text-[13px] font-medium text-ink-2 hover:bg-hover hover:text-ink"
                >
                  {dialog.cancelText || "Cancel"}
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={handleConfirm}
                  className="h-[34px] rounded-md bg-ink px-3.5 text-[13px] font-medium text-canvas hover:opacity-90"
                >
                  {dialog.confirmText || "Confirm"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </NotificationContext.Provider>
  );
}
