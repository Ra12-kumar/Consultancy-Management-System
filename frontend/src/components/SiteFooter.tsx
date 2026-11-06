import Link from "next/link";
import SocialLinks from "@/features/content/SocialLinks";

const columns = [
  { title: "Explore", links: [["/colleges", "Colleges"], ["/courses", "Courses"], ["/scholarships", "Scholarships"], ["/admission-process", "Admission process"]] },
  { title: "Students", links: [["/register", "Create an account"], ["/login", "Sign in"], ["/student", "Student dashboard"], ["/faq", "FAQ"]] },
  { title: "Company", links: [["/about", "About us"], ["/privacy", "Privacy policy"], ["/terms", "Terms and conditions"]] },
] as const;

export default function SiteFooter() {
  return (
    <footer className="mt-auto bg-navy text-white/85">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div>
          <p className="text-lg font-bold text-white">
            Udaan
          </p>
          <p className="mt-2 text-sm text-white/70">Guidance for higher-education admissions across India: colleges, courses, fees and scholarships.</p>
          <SocialLinks tone="dark" />
        </div>
        {columns.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="text-sm font-semibold tracking-wide text-gold uppercase">{col.title}</p>
            <ul className="mt-3 space-y-2 text-sm">
              {col.links.map(([href, label]) => (
                <li key={href}>
                  {/* Signed-in areas are not prefetched: a prefetch made while signed out would cache a redirect to sign-in. */}
                  <Link href={href} prefetch={href.startsWith("/student") || href.startsWith("/admin") ? false : undefined} className="hover:text-white hover:underline">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-7xl px-4 py-4 text-xs text-white/60 sm:px-6">
          Official college fees and consultancy service charges are always shown separately. Admission and scholarships are decided by the institutions and scholarship providers.
        </p>
      </div>
    </footer>
  );
}
