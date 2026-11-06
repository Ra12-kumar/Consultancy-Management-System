import { adminChrome } from "./chrome";

// What the admin area shows while a page loads or the sign-in check runs (also on a refresh): the same frame as
// the admin workspace (side panel, top bar) with placeholder blocks, so the public site header, footer or another
// page never flashes. No data and no buttons.
const block = "animate-pulse rounded-2xl bg-surface-2";

export default function AdminLoading() {
  return (
    <div id="admin-workspace" aria-busy="true" className="flex min-h-screen w-full flex-1 bg-background text-foreground">
      <style>{adminChrome}</style>
      <aside aria-hidden="true" className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-line bg-surface lg:block">
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
          <span className="inline-flex size-9 items-center justify-center rounded-xl bg-navy text-gold ring-1 ring-gold/40">
            <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
              <path d="M12 3 1 9l11 6 9-4.9V17h2V9L12 3Zm-6 9.6V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-3.4l-6 3.3-6-3.3Z" />
            </svg>
          </span>
          <span className="text-[17px] font-semibold">Udaan</span>
        </div>
        <div className="space-y-2 px-3 pt-4">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-lg bg-surface-2" />
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-16 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6 lg:px-8">
          <div className="h-4 w-44 animate-pulse rounded bg-surface-2" />
          <div className="ml-auto hidden h-9 w-64 animate-pulse rounded-lg bg-surface-2 md:block" />
          <div className="size-8 animate-pulse rounded-full bg-surface-2" />
        </div>
        <main id="main" className="min-w-0 flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <p className="sr-only" role="status">
            Loading…
          </p>
          <div className="h-12 w-72 animate-pulse rounded-xl bg-surface-2" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className={`h-32 ${block}`} />
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
            <div className={`h-80 ${block}`} />
            <div className={`h-80 ${block}`} />
          </div>
        </main>
      </div>
    </div>
  );
}
