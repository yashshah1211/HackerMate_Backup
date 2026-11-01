"use client";
import { deleteAccount as deleteWriterAccount, writerMessage, WriterBudget, WriterError } from "@/lib/writers";

import { useRef, useState } from "react";
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
  const deleting = useRef(false);
  const [confirmedActor, setConfirmedActor] = useState<string | null>(null);
  async function openDeleteDialog() {
    const budget = new WriterBudget();
    try { const { data: { user }, error } = await budget.run(() => supabase.auth.getUser());
      if (error) { console.error("[settings] identity failed:", error); throw error; }
      if (user) { setConfirmedActor(user.id); setOpen(true); }
    } catch (error) { console.error("[settings] confirmation failed:", error); showToast(writerMessage(error), "error"); }
  }

  async function deleteAccount() {
    if (deleting.current || !confirmedActor) return;
    deleting.current = true;
    setBusy(true);
    const budget = new WriterBudget();
    try {
      const {
        data: { user },
      } = await budget.run(() => supabase.auth.getUser());
      if (!user) {
        setBusy(false);
        return;
      }
      if (user.id !== confirmedActor) throw new WriterError("Your account changed. Reopen confirmation before continuing.", 409);
      await deleteWriterAccount(supabase, user.id, user.id, budget);
      showToast("Account permanently deleted.", "success");
      await supabase.auth.signOut();
      router.push("/");
    } catch (err) {
      console.error("[settings] delete account failed:", err);
      showToast(writerMessage(err), "error");
      setBusy(false);
    } finally { deleting.current = false; }
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
      <Button variant="danger" className="mt-4" icon={<Trash2 />} onClick={() => void openDeleteDialog()}>
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
