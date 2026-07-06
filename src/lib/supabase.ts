import { createBrowserClient } from "@supabase/ssr";
import { RealtimeChannel } from "@supabase/supabase-js";

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Robust wrapper for Supabase Realtime channel subscriptions with exponential backoff retries.
 * Detects silent drops (TIMED_OUT or CHANNEL_ERROR) and attempts connection recovery.
 */
export function subscribeWithRetry(
  channel: RealtimeChannel,
  onStatusChange?: (status: string, err?: Error) => void,
  maxRetries = 5
) {
  let attempt = 0;
  let timer: NodeJS.Timeout;
  let isUnsubscribed = false;

  function doSubscribe() {
    if (isUnsubscribed) return;

    channel.subscribe((status, err) => {
      if (onStatusChange) onStatusChange(status, err);

      if (status === "SUBSCRIBED") {
        attempt = 0; // Reset attempt count on success
      } else if (status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
        if (isUnsubscribed) return;

        if (attempt < maxRetries) {
          attempt++;
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // 2s, 4s, 8s, 10s max
          console.warn(`[Supabase Realtime] Connection ${status}. Retrying in ${delay}ms (attempt ${attempt}/${maxRetries}) for channel: ${channel.topic}`);
          
          clearTimeout(timer);
          timer = setTimeout(() => {
            if (isUnsubscribed) return;
            channel.unsubscribe().then(() => {
              doSubscribe();
            });
          }, delay);
        } else {
          console.error(`[Supabase Realtime] Channel subscription failed permanently after ${maxRetries} attempts.`);
        }
      }
    });
  }

  doSubscribe();

  return () => {
    isUnsubscribed = true;
    clearTimeout(timer);
    channel.unsubscribe();
  };
}
