import type { Metadata } from "next";
import AccountSettings from "@/features/account/ChangePasswordCard";
import { DataRequestsCard, PhotoCard } from "@/features/support/StudentSupport";

export const metadata: Metadata = { title: "Account settings" };

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Account settings</h1>
      <PhotoCard />
      <AccountSettings />
      <DataRequestsCard />
    </div>
  );
}
