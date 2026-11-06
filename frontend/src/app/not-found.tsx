import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Page not found" };

// Shown for any address that does not exist (and for notFound() in pages), inside the normal site header and footer.
export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-20 text-center sm:px-6">
      <p className="text-sm font-semibold tracking-widest text-accent-text uppercase">Error 404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">We couldn’t find that page</h1>
      <p className="mt-3 text-muted">The link may be old or mistyped. These will get you back on track:</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/">Go to the home page</ButtonLink>
        <ButtonLink href="/colleges" variant="secondary">
          Find colleges
        </ButtonLink>
      </div>
    </main>
  );
}
