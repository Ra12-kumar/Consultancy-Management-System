/* eslint-disable @next/next/no-img-element -- small local SVG icons from the client design */
import { Inter, Libre_Baskerville } from "next/font/google";
import Link from "next/link";

// Header and compact footer for Udaan pages other than the landing page (client Figma design
// "Udaan · Colleges in Bengaluru"). Section links point back to the landing page at "/".

const sans = Inter({ subsets: ["latin"], variable: "--font-udan-sans" });
const serif = Libre_Baskerville({ subsets: ["latin"], weight: "400", variable: "--font-udan-serif" });
export const udanFonts = `${sans.variable} ${serif.variable} font-[family-name:var(--font-udan-sans)]`;
export const udanGutter = "px-4 sm:px-8 xl:px-[88px]";
export const udanDisplay = "font-[family-name:var(--font-udan-serif)] tracking-[-1.1px]";
// The pages bring their own header and footer, so the site-wide ones are hidden while one is open.
export const hideSiteChrome = `body:has(#udan) > header, body:has(#udan) > footer, body:has(#udan) > [aria-label="Announcements"] { display: none; }`;

export function UdanBrand({ light = false, size = "lg" }: { light?: boolean; size?: "lg" | "sm" }) {
  const lg = size === "lg";
  return (
    <span className="flex items-center gap-2.5">
      <img src={`/udan/${light ? "flight-mark-light" : "flight-mark"}.svg`} alt="" width={lg ? 35 : 26} height={lg ? 34 : 25} />
      <span className={`font-bold ${lg ? "text-[32px] tracking-[-1.3px]" : "text-2xl tracking-[-1px]"} ${light ? "text-white" : "text-[#10283f]"}`}>udaan</span>
    </span>
  );
}

const NAV = [
  ["Find colleges", "/colleges"],
  ["Explore courses", "/courses"],
  ["Counselling", "/#counselling"],
  ["Resources", "/#resources"],
] as const;

export function UdanHeader({ active }: { active?: string }) {
  return (
    <>
      <div className={`flex h-[34px] items-center justify-between bg-[#f7f5ef] text-[11px] ${udanGutter}`}>
        <p className="hidden text-[#5c6974] sm:block">Education choices. Thoughtfully guided.</p>
        <nav aria-label="Audience" className="flex items-center gap-6">
          <Link href="/#guidance" className="font-semibold hover:underline">
            For students &amp; parents
          </Link>
          <span aria-hidden="true" className="h-3 w-px bg-[#dfe3e5]" />
          <Link href="/#institutions" className="hover:underline">
            For institutions ↗
          </Link>
        </nav>
      </div>
      <header className={`flex min-h-[88px] flex-wrap items-center justify-between gap-4 border-b border-[#dfe3e5] bg-white py-3 ${udanGutter}`}>
        <Link href="/" aria-label="Udaan home">
          <UdanBrand />
        </Link>
        <nav aria-label="Main" className="order-3 flex w-full gap-6 overflow-x-auto text-sm font-medium lg:order-none lg:w-auto lg:gap-[30px]">
          {NAV.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              aria-current={active === href ? "page" : undefined}
              className={`py-1 whitespace-nowrap hover:underline ${active === href ? "border-b-2 border-[#edbf54] font-semibold" : ""}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-4 sm:gap-6">
          <Link href="/login" className="text-sm font-medium hover:underline">
            Sign in
          </Link>
          <Link href="/#guidance" className="inline-flex h-11 items-center justify-center gap-3 rounded-md bg-[#edbf54] px-4 text-sm font-semibold whitespace-nowrap text-[#142b41] hover:bg-[#e5b23d] focus-visible:ring-2 focus-visible:ring-[#10283f] focus-visible:outline-none sm:h-[50px] sm:px-[22px]">
            Get guidance
            <img src="/udan/arrow-gold-btn.svg" alt="" width={18} height={18} />
          </Link>
        </div>
      </header>
    </>
  );
}

const FOOTER_LINKS = [
  ["My enquiries", "/student/enquiries"],
  ["Student resources", "/#resources"],
  ["Contact us", "/contact"],
  ["Partner with Udaan ↗", "/#institutions"],
] as const;

export function UdanFooter() {
  return (
    <footer className={`bg-[#10283f] py-10 text-[#c8d2da] ${udanGutter}`}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-8">
          <Link href="/" aria-label="Udaan home">
            <UdanBrand light size="sm" />
          </Link>
          <p className="text-xs">Your ambition. A path that’s yours.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-3 text-xs">
          {FOOTER_LINKS.map(([label, href]) => (
            <Link key={label} href={href} className="hover:text-white hover:underline">
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="mt-8 flex flex-col gap-3 border-t border-[#375066] pt-5 text-[11px] sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p>© 2026 Udaan. All rights reserved.</p>
          <p className="max-w-2xl text-[10px] leading-[1.7]">Udaan provides guidance, not guaranteed admission. Eligibility and admission decisions rest with institutions and official authorities.</p>
        </div>
        <nav aria-label="Policies" className="flex gap-6">
          <Link href="/privacy" className="hover:text-white hover:underline">
            Privacy policy
          </Link>
          <Link href="/terms" className="hover:text-white hover:underline">
            Terms of use
          </Link>
        </nav>
      </div>
    </footer>
  );
}
