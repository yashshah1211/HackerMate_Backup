import { createBrowserClient } from "@supabase/ssr";
import { RealtimeChannel } from "@supabase/supabase-js";

const rawSupabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

if (typeof window !== "undefined") {
  // Override the Auth client URL to route through the Next.js reverse proxy.
  // This allows custom brand branding on external OAuth consent pages (e.g. Google) for free.
  (rawSupabase.auth as any).url = `${window.location.origin}/temp-auth/v1`;
}

// Intercept queries in development to catch RLS policy errors (code 42501)
const wrapWithRlsInterceptor = (client: typeof rawSupabase): typeof rawSupabase => {
  if (process.env.NODE_ENV !== "development") {
    return client;
  }

  // Interceptor for PostgREST builders (select, insert, update, delete, etc.)
  const queryHandler: ProxyHandler<any> = {
    get(target, prop, receiver) {
      if (prop === "then" && typeof target.then === "function") {
        return function (this: any, onfulfilled?: any, onrejected?: any) {
          return target.then(
            (value: any) => {
              if (value && value.error && value.error.code === "42501") {
                console.error(
                  `%c🚨 [Supabase RLS Policy Violation] %c\n` +
                  `• Error Code: 42501 (Insufficient Privilege)\n` +
                  `• Message: ${value.error.message}\n` +
                  `• Details: ${value.error.details || "None"}\n` +
                  `• Hint: ${value.error.hint || "None"}\n` +
                  `Please check if RLS is enabled on this table and matching policies are defined for your role/operation.`,
                  "color: white; background: #e11d48; font-weight: bold; padding: 4px 8px; border-radius: 4px;",
                  "color: inherit;"
                );
              }
              return onfulfilled ? onfulfilled(value) : value;
            },
            (reason: any) => {
              return onrejected ? onrejected(reason) : Promise.reject(reason);
            }
          );
        };
      }

      const val = Reflect.get(target, prop, receiver);
      if (typeof val === "function") {
        return function (this: any, ...args: any[]) {
          const result = val.apply(this, args);
          if (result && typeof result === "object") {
            return new Proxy(result, queryHandler);
          }
          return result;
        };
      }
      return val;
    },
  };

  // Client-level proxy handler to intercept client.from and client.rpc
  const clientHandler: ProxyHandler<any> = {
    get(target, prop, receiver) {
      if (prop === "from") {
        return function (this: any, relation: string) {
          const originalFrom = Reflect.get(target, "from", receiver);
          const builder = originalFrom.call(target, relation);
          return new Proxy(builder, queryHandler);
        };
      }
      if (prop === "rpc") {
        return function (this: any, fn: string, args?: any, options?: any) {
          const originalRpc = Reflect.get(target, "rpc", receiver);
          const builder = originalRpc.call(target, fn, args, options);
          return new Proxy(builder, queryHandler);
        };
      }
      return Reflect.get(target, prop, receiver);
    }
  };

  return new Proxy(client, clientHandler) as typeof rawSupabase;
};

export const supabase = wrapWithRlsInterceptor(rawSupabase);

/**
 * Robust wrapper for Supabase Realtime channel subscriptions with exponential backoff retries.
 * Detects silent drops (TIMED_OUT or CHANNEL_ERROR) and attempts connection recovery.
 */
export function subscribeWithRetry(
  channel: RealtimeChannel,
  onStatusChange?: (status: string, err?: Error) => void,
  maxRetries = 5
) {
  let retryCount = 0;
  let isUnsubscribed = false;
  let retryTimeout: NodeJS.Timeout | null = null;

  function attemptSubscribe() {
    if (isUnsubscribed) return;

    channel.subscribe((status, err) => {
      if (onStatusChange) onStatusChange(status, err);

      if (status === "SUBSCRIBED") {
        retryCount = 0; // Reset retries on successful connection
      } else if (status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
        console.warn(
          `[Supabase Realtime] Channel connection issue (${status}) for topic: ${channel.topic}. Retry count: ${retryCount}`
        );
        
        if (retryCount < maxRetries) {
          retryCount++;
          const delay = Math.min(1000 * Math.pow(2, retryCount), 30000); // Exponential backoff (max 30s)
          
          if (retryTimeout) clearTimeout(retryTimeout);
          
          retryTimeout = setTimeout(() => {
            console.log(`[Supabase Realtime] Reconnecting to channel: ${channel.topic} (Attempt ${retryCount}/${maxRetries})...`);
            Promise.resolve(channel.unsubscribe())
              .catch(() => {})
              .finally(() => {
                attemptSubscribe();
              });
          }, delay);
        } else {
          console.error(
            `[Supabase Realtime] Channel subscription failed permanently after ${maxRetries} retries: ${channel.topic}`
          );
          if (onStatusChange) {
            onStatusChange("FAILED_PERMANENTLY", err || new Error("Connection failed permanently"));
          }
        }
      }
    });
  }

  attemptSubscribe();

  return () => {
    isUnsubscribed = true;
    if (retryTimeout) clearTimeout(retryTimeout);
    channel.unsubscribe();
  };
}

