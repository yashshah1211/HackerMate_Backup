"use client";

import { useId, useRef, useState } from "react";
import { Link2 } from "lucide-react";
import { Button, Input } from "@/components/system";
import { useNotification } from "@/context/NotificationContext";
import { publicDiscoveryLink } from "@/lib/hackathons/shareDiscovery";

export function CopyDiscoveryLink({ searchParams }: { searchParams: Pick<URLSearchParams, "getAll"> }) {
  const shared = publicDiscoveryLink(searchParams);
  const descriptionId = useId();
  const { showToast } = useNotification();
  const busy = useRef(false);
  const [copying, setCopying] = useState(false);
  const [manualUrl, setManualUrl] = useState<string | null>(null);

  async function copyLink() {
    if (busy.current || !shared.url) return;
    busy.current = true;
    setCopying(true);
    try {
      if (!window.isSecureContext || !navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      // Call directly from the user gesture; browsers may require transient activation.
      await navigator.clipboard.writeText(shared.url);
      setManualUrl(null);
      showToast("Link copied. It opens public discovery with the shared filters.", "success");
    } catch {
      setManualUrl(shared.url);
      showToast("Couldn’t copy automatically. Select and copy the link below.", "error");
    } finally {
      busy.current = false;
      setCopying(false);
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <Button size="sm" variant="secondary" className="h-11 sm:h-8" icon={<Link2 aria-hidden />}
        aria-label="Copy link to filtered hackathons" aria-describedby={descriptionId}
        disabled={!shared.url} loading={copying} onClick={copyLink}>
        Copy link
      </Button>
      <p id={descriptionId} className="max-w-prose text-[12px] text-ink-3">{shared.explanation}</p>
      {manualUrl && manualUrl === shared.url && (
        <label className="w-full min-w-0 text-[12px] text-ink-3">
          Select and copy this link manually
          <Input readOnly value={manualUrl} aria-label="Link to copy manually" className="mt-1"
            onFocus={event => event.currentTarget.select()} />
        </label>
      )}
    </div>
  );
}
