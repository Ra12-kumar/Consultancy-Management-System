import { Suspense } from "react";
import DashboardShell from "@/components/DashboardShell";
import { Skeleton } from "@/components/ui/Feedback";

const NAV = [
  { href: "/admin", label: "Dashboard", permission: "students.read" },
  { href: "/admin/students", label: "Students", permission: "students.read" },
  { href: "/admin/enquiries", label: "Enquiries", permission: "enquiries.manage" },
  { href: "/admin/admissions", label: "Admissions", permission: "enquiries.manage" },
  { href: "/admin/appointments", label: "Appointments", permission: "enquiries.manage" },
  { href: "/admin/scholarships", label: "Scholarships", permission: "scholarships.manage" },
  { href: "/admin/scholarship-applications", label: "Scholarship applications", permission: "scholarships.manage" },
  { href: "/admin/colleges", label: "Colleges & fees", permissions: ["catalog.manage", "pricing.manage"] },
  { href: "/admin/courses", label: "Courses", permission: "catalog.manage" },
  { href: "/admin/locations", label: "Locations", permission: "catalog.manage" },
  { href: "/admin/feedback", label: "Feedback", permission: "feedback.manage" },
  { href: "/admin/data-requests", label: "Data requests", permission: "privacy.manage" },
  { href: "/admin/reports", label: "Reports", permission: "reports.export" },
  { href: "/admin/payments", label: "Payments", permission: "payments.manage" },
  { href: "/admin/content", label: "Website content", permission: "content.manage" },
  { href: "/admin/site-settings", label: "Site settings", permission: "settings.manage" },
  { href: "/admin/email", label: "Email notifications", permission: "email.view" },
  { href: "/admin/team", label: "Administrators", permission: "admins.manage" },
  { href: "/admin/audit", label: "Audit log", permission: "audit.read" },
  { href: "/admin/settings", label: "Account settings" },
];

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Suspense: the shell reads the pathname, which is request-time data on dynamic routes such as /admin/colleges/[id].
  return (
    <Suspense fallback={<main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6"><Skeleton className="h-64" /></main>}>
      <DashboardShell role="admin" title="Administration" nav={NAV}>
        {children}
      </DashboardShell>
    </Suspense>
  );
}
