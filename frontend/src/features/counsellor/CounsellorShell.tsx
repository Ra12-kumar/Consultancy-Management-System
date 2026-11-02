"use client";

import type { ReactNode } from "react";
import type { NavItem } from "@/components/DashboardShell";
import SideNavShell from "@/features/dashboard/SideNavShell";

// Counsellor area frame: the shared navy side panel from the client design.
export default function CounsellorShell({ nav, children }: { nav: NavItem[]; children: ReactNode }) {
  return (
    <SideNavShell role="counsellor" brand="Udaan" nav={nav}>
      {children}
    </SideNavShell>
  );
}
