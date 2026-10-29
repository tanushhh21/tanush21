import type { Metadata } from "next";
import { requireUser } from "@/lib/console/context";
import { changePassword, saveProfile, signOutEverywhere } from "@/lib/console/actions/session";
import { Card, CardHead, Field, buttonClass, fieldClass } from "@/components/console/ui";
import Saved from "@/components/console/Saved";
import PasswordField from "@/components/console/PasswordField";

export const metadata: Metadata = { title: "Your account" };

export default async function Account({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser();
  const saved = (await searchParams).saved;
  const has = Boolean(user.passwordHash);
  return (
    <div className="grid gap-5">
      <Saved
        code={saved}
        messages={{ password: "Password changed. Every other device has been signed out.", profile: "Saved.", "wrong-current": "Your current password was not right." }}
        problems={["wrong-current"]}
      />
      {saved && !["password", "profile", "wrong-current"].includes(saved) ? (
        <p role="alert" className="rounded-[10px] bg-alert/[0.06] px-3 py-2 text-[13px] text-alert">
          {saved}
        </p>
      ) : null}
      <Card>
        <CardHead title="You" />
        <form action={saveProfile} className="grid gap-4 px-4 py-4 sm:grid-cols-2 sm:items-end sm:px-5">
          <Field label="Name">
            <input name="name" defaultValue={user.name ?? ""} className={fieldClass} />
          </Field>
          <Field label="Email" hint={user.emailVerified ? "Confirmed." : "Not confirmed yet."}>
            <input value={user.email ?? ""} readOnly className={`${fieldClass} bg-mist`} />
          </Field>
          <div>
            <button type="submit" className={buttonClass("secondary")}>
              Save
            </button>
          </div>
        </form>
      </Card>
      <Card>
        <CardHead title={has ? "Change your password" : "Set a password"} meta={has ? undefined : "You sign in with Google or an email link today. A password adds another way in."} />
        <form action={changePassword} className="grid gap-4 px-4 py-4 sm:grid-cols-2 sm:items-end sm:px-5">
          {has ? (
            <Field label="Current password">
              <input name="current" type="password" required autoComplete="current-password" className={fieldClass} />
            </Field>
          ) : null}
          <div>
            <PasswordField label="New password" />
            <p className="mt-1.5 text-[12px] text-slate">Other devices will be signed out.</p>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className={buttonClass("primary")}>
              {has ? "Change password" : "Set password"}
            </button>
          </div>
        </form>
      </Card>
      <Card>
        <CardHead title="Signed in somewhere you should not be?" meta="Signs you out on every device, this one included." />
        <form action={signOutEverywhere} className="px-4 py-4 sm:px-5">
          <button type="submit" className={buttonClass("danger")}>
            Sign out everywhere
          </button>
        </form>
      </Card>
    </div>
  );
}
