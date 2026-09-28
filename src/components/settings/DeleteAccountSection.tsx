"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import { Button, Dialog } from "@/components/system";

/**
 * Account deletion. Lives in Settings → Account rather than on the public
 * builder profile. Same behaviour as the profile's previous danger zone:
 * `delete_user_completely` for the signed-in user, then sign out and go home.
 */
export default function DeleteAccountSection() {
  const router = useRouter();
  const { showToast } = useNotification();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function deleteAccount() {
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setBusy(false);
        return;
      }
      const { error } = await supabase.rpc("delete_user_completely", { p_target_user_id: user.id });
      if (error) {
        console.error("[settings] delete_user_completely failed:", error);
        showToast(error.message, "error");
        setBusy(false);
        return;
      }
      showToast("Account permanently deleted.", "success");
      await supabase.auth.signOut();
      router.push("/");
    } catch (err) {
      console.error("[settings] delete account failed:", err);
      showToast(err instanceof Error ? err.message : "Failed to delete account.", "error");
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="delete-account-title" className="rounded-lg border border-bad/30 p-5 md:p-6">
      <p className="caps-label text-bad">Danger zone</p>
      <h2 id="delete-account-title" className="mt-1.5 text-[15px] font-semibold text-ink">
        Delete your account
      </h2>
      <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-ink-3">
        Permanently deletes your profile, DMs and files, and disbands any team where you&apos;re the only member. This can&apos;t be undone.
      </p>
      <Button variant="danger" className="mt-4" icon={<Trash2 />} onClick={() => setOpen(true)}>
        Delete account
      </Button>

      <Dialog
        open={open}
        onClose={() => !busy && setOpen(false)}
        size="sm"
        title="Delete your account?"
        description="This permanently deletes your profile, DMs and files, and disbands any team where you're the only member. It can't be undone."
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={deleteAccount}>
              Delete permanently
            </Button>
          </>
        }
      />
    </section>
  );
}
