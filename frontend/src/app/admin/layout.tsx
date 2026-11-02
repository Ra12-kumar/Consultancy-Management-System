import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Feedback";
import AdminWorkspaceShell, { type WorkspaceGroup } from "@/features/admin/workspace/AdminWorkspaceShell";

// Grouped as in the client design ("Udaan admin dashboard"); every admin page stays reachable. The previous
// frame (features/dashboard/SideNavShell) is still used by the counsellor area.
const GROUPS: WorkspaceGroup[] = [
  {
    title: "Workspace",
    items: [
      { href: "/admin", label: "Dashboard", icon: "dashboard", permission: "students.read" },
      { href: "/admin/insights", label: "Detailed dashboard", icon: "insights", permission: "students.read" },
      { href: "/admin/students", label: "Students", icon: "students", permission: "students.read", badge: "students" },
      { href: "/admin/enquiries", label: "Enquiries", icon: "enquiries", permission: "enquiries.manage", badge: "newEnquiries" },
      { href: "/admin/counsellors", label: "Counsellors", icon: "counsellors", permission: "admins.manage" },
    ],
  },
  {
    title: "Admissions & content",
    items: [
      { href: "/admin/colleges", label: "Colleges", icon: "colleges", permissions: ["catalog.manage", "pricing.manage"] },
      { href: "/admin/courses", label: "Courses", icon: "courses", permission: "catalog.manage" },
      { href: "/admin/scholarships", label: "Scholarships", icon: "scholarships", permission: "scholarships.manage" },
      { href: "/admin/scholarship-applications", label: "Scholarship applications", icon: "applications", permission: "scholarships.manage" },
      { href: "/admin/admissions", label: "Admissions", icon: "admissions", permission: "enquiries.manage" },
    ],
  },
  {
    title: "Administration",
    items: [
      { href: "/admin/reports", label: "Reports", icon: "reports", permission: "reports.export" },
      { href: "/admin/enquiry-reports", label: "Enquiry reports", icon: "reports", permission: "reports.export" },
      { href: "/admin/email", label: "Email notifications", icon: "email", permission: "email.view" },
      { href: "/admin/feedback", label: "Feedback", icon: "feedback", permission: "feedback.manage" },
      { href: "/admin/data-requests", label: "Data requests", icon: "privacy", permission: "privacy.manage" },
      { href: "/admin/settings", label: "Settings", icon: "settings" },
    ],
  },
];

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Suspense: the shell reads the pathname, which is request-time data on dynamic routes such as /admin/colleges/[id].
  return (
    <Suspense fallback={<main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6"><Skeleton className="h-64" /></main>}>
      <AdminWorkspaceShell groups={GROUPS}>{children}</AdminWorkspaceShell>
    </Suspense>
  );
}
