import type { Metadata } from "next";
import AccountSettings from "@/features/account/ChangePasswordCard";
import { MfaCard } from "@/features/admin/stage7/AdminStage7";

export const metadata: Metadata = { title: "Account settings" };

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Account settings</h1>
      <AccountSettings />
      <MfaCard />
    </div>
  );
}
