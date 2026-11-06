import { Suspense } from "react";
import CounsellorLoading from "@/features/counsellor/workspace/CounsellorLoading";
import CounsellorWorkspaceShell from "@/features/counsellor/workspace/CounsellorWorkspaceShell";

// Counsellor area in the client design (purple side panel, top bar). The previous frame
// (features/counsellor/CounsellorShell) is kept in the code.
// Signed-in area: every page renders only after the client-side session check, so Next.js cannot pre-render it
// for its development-time instant-navigation check (it reports the page as dropped). The check is switched off
// for this whole area; a layout-level `instant = false` would still check each page below it.
export const instant = { unstable_disableValidation: true };

export default function CounsellorLayout({ children }: LayoutProps<"/counsellor">) {
  // Suspense: the shell reads the pathname and search parameters (request-time data). While it loads, the
  // same purple frame with placeholders is shown (never the public site or an older screen).
  return (
    <Suspense fallback={<CounsellorLoading />}>
      <CounsellorWorkspaceShell>{children}</CounsellorWorkspaceShell>
    </Suspense>
  );
}
