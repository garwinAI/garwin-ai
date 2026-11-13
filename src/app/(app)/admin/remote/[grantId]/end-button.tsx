"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { endRemoteViewAction } from "@/lib/remote-view-actions";

export function EndRemoteViewButton({ grantId }: { grantId: string }) {
  const [state, action] = useActionState(endRemoteViewAction, undefined);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) router.push("/admin");
  }, [state, router]);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="grantId" value={grantId} />
      <SubmitButton className="btn bg-white text-sm text-red-700 hover:bg-red-50" pendingText="Ending…">
        End remote view
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
