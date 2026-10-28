import { Suspense } from "react";
import DashboardShell from "@/components/DashboardShell";
import { Skeleton } from "@/components/ui/Feedback";

const NAV = [
  { href: "/student", label: "Dashboard" },
  { href: "/student/profile", label: "My profile" },
  { href: "/student/enquiries", label: "My enquiries" },
  { href: "/student/applications", label: "My applications" },
  { href: "/student/appointments", label: "My appointments" },
  { href: "/student/scholarships", label: "My scholarships" },
  { href: "/student/payments", label: "Payments" },
  { href: "/student/notifications", label: "Notifications" },
  { href: "/student/feedback", label: "Feedback and support" },
  { href: "/student/shortlist", label: "My selected colleges" },
  { href: "/student/comparisons", label: "My comparisons" },
  { href: "/student/settings", label: "Account settings" },
];

export default function StudentLayout({ children }: LayoutProps<"/student">) {
  // Suspense: the shell reads the pathname, which is request-time data on dynamic routes such as /student/enquiries/[reference].
  return (
    <Suspense fallback={<main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6"><Skeleton className="h-64" /></main>}>
      <DashboardShell role="student" title="Student area" nav={NAV}>
        {children}
      </DashboardShell>
    </Suspense>
  );
}
