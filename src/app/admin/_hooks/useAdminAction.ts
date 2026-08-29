"use client";

import { useState, useCallback } from "react";
import { useNotification } from "@/context/NotificationContext";

interface ActionOptions {
  successMessage?: string;
  errorMessage?: string;
  onSuccess?: (data: any) => void | Promise<void>;
  onError?: (err: any) => void;
}

export function useAdminAction() {
  const [loading, setLoading] = useState(false);
  const { showToast } = useNotification();

  const execute = useCallback(
    async (
      apiCall: () => Promise<Response>,
      options: ActionOptions = {}
    ) => {
      setLoading(true);
      try {
        const res = await apiCall();
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success !== false) {
          if (options.successMessage || data.message) {
            showToast(options.successMessage || data.message, "success");
          }
          if (options.onSuccess) {
            await options.onSuccess(data);
          }
          return { success: true, data };
        } else {
          const errMsg = data.error || options.errorMessage || "Action failed";
          showToast(errMsg, "error");
          if (options.onError) {
            options.onError(data);
          }
          return { success: false, error: errMsg };
        }
      } catch (err: any) {
        console.error(err);
        const errMsg = err?.message || options.errorMessage || "An unexpected error occurred";
        showToast(errMsg, "error");
        if (options.onError) {
          options.onError(err);
        }
        return { success: false, error: errMsg };
      } finally {
        setLoading(false);
      }
    },
    [showToast]
  );

  return { execute, loading };
}
