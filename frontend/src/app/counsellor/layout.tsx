import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Feedback";
import CounsellorShell from "@/features/counsellor/CounsellorShell";

const NAV = [
  { href: "/counsellor", label: "Summary" },
  { href: "/counsellor/enquiries", label: "My enquiries" },
  { href: "/courses/browse", label: "Browse courses" },
  { href: "/counsellor/settings", label: "Settings" },
];

export default function CounsellorLayout({ children }: LayoutProps<"/counsellor">) {
  return (
    <Suspense fallback={<main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6"><Skeleton className="h-64" /></main>}>
      <CounsellorShell nav={NAV}>{children}</CounsellorShell>
    </Suspense>
  );
}
