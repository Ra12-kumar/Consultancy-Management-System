import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Feedback";
import CounsellorWorkspaceShell from "@/features/counsellor/workspace/CounsellorWorkspaceShell";

// Counsellor area in the client design (purple side panel, top bar). The previous frame
// (features/counsellor/CounsellorShell) is kept in the code.
export default function CounsellorLayout({ children }: LayoutProps<"/counsellor">) {
  // Suspense: the shell reads the pathname and search parameters (request-time data).
  return (
    <Suspense fallback={<main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6"><Skeleton className="h-64" /></main>}>
      <CounsellorWorkspaceShell>{children}</CounsellorWorkspaceShell>
    </Suspense>
  );
}
