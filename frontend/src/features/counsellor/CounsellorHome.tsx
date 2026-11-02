"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Feedback";
import { LoadState } from "@/features/admin/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { useApiData } from "@/hooks/useApiData";
import { apiGet } from "@/services/api";

type Summary = { assignedOpen: number; assignedTotal: number; converted: number; followUpsToday: number; followUpsOverdue: number };

// Counsellor dashboard: counts for the enquiries assigned to this counsellor only.
export default function CounsellorHome() {
  const { user } = useAuth();
  const s = useApiData((signal) => apiGet<Summary>("/counsellor/summary", { signal }), []);
  const tiles: Array<[string, keyof Summary, string]> = [
    ["Open enquiries assigned to you", "assignedOpen", "/counsellor/enquiries"],
    ["Follow-ups due today", "followUpsToday", "/counsellor/enquiries?quick=today"],
    ["Overdue follow-ups", "followUpsOverdue", "/counsellor/enquiries?quick=overdue"],
    ["Admissions confirmed", "converted", "/counsellor/enquiries"],
    ["Assigned in total", "assignedTotal", "/counsellor/enquiries"],
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome, {user?.name}</h1>
        <p className="text-muted">You see only the enquiries an administrator has assigned to you.</p>
      </div>
      {!s.data ? (
        <LoadState status={s.status} error={s.error} reload={s.reload} rows={2} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map(([label, key, href]) => (
            <Link key={key} href={href} className="rounded-2xl focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none">
              <Card className="h-full hover:border-accent">
                <p className="text-sm text-muted">{label}</p>
                <p className="mt-1 text-3xl font-bold">{s.data![key]}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
      {s.data && s.data.assignedTotal === 0 && <p className="text-sm text-muted">No enquiries are assigned to you yet. An administrator assigns them from the enquiry list.</p>}
    </div>
  );
}
