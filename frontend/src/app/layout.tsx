import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { SiteBanners } from "@/features/content/ContentPage";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "EduPath Consultancy: higher-education admissions in India", template: "%s · EduPath Consultancy" },
  description: "Explore courses, compare colleges, discover scholarships, and plan your higher education with expert guidance.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:p-3">
          Skip to content
        </a>
        <AuthProvider>
          {/* The header highlights the current page (usePathname), which is request-time data on dynamic routes. */}
          <Suspense fallback={<div aria-hidden="true" className="h-16 border-b border-line bg-surface/90" />}>
            <SiteHeader />
          </Suspense>
          <SiteBanners />
          {children}
          <SiteFooter />
        </AuthProvider>
      </body>
    </html>
  );
}
