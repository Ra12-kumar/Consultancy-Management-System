/* eslint-disable @next/next/no-img-element -- local logo */
import { counsellorChrome } from "./chrome";

// What the counsellor area shows while the page loads or the sign-in check runs: the same purple frame as the
// dashboard with placeholder blocks, so a refresh never flashes the public site header, footer or an older
// screen. No data and no buttons (nothing can be clicked before the page is ready).
const block = "animate-pulse rounded-2xl bg-violet-100/70";

export default function CounsellorLoading() {
  return (
    <div id="counsellor-workspace" aria-busy="true" className="flex min-h-screen w-full flex-1 bg-[#f6f5fc]">
      <style>{counsellorChrome}</style>
      <aside aria-hidden="true" className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-[radial-gradient(120%_60%_at_0%_0%,#4c2fb8_0%,transparent_60%),linear-gradient(180deg,#2a1872_0%,#1d1157_55%,#150c40_100%)] lg:flex">
        <div className="flex items-center gap-3 px-5 pt-6 pb-5 text-white">
          <span className="flex size-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
            <img src="/udan/flight-mark-light.svg" alt="" width={24} height={23} />
          </span>
          <span className="leading-tight">
            <span className="block text-xl font-bold tracking-tight">Udaan</span>
            <span className="block text-[11px] text-violet-200/80">Education Consultancy</span>
          </span>
        </div>
        <div className="mx-4 h-[68px] animate-pulse rounded-2xl bg-white/[0.07]" />
        <div className="space-y-2 px-3 pt-8">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-11 animate-pulse rounded-xl bg-white/[0.06]" />
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-16 items-center gap-3 border-b border-violet-100 bg-white/90 px-4 sm:px-6">
          <div className="h-5 w-48 animate-pulse rounded-lg bg-violet-100/70" />
          <div className="ml-auto hidden h-10 w-72 animate-pulse rounded-xl bg-violet-50 md:block" />
          <div className="size-10 animate-pulse rounded-full bg-violet-100/70" />
        </div>
        <main id="main" className="grid min-w-0 flex-1 gap-5 px-4 py-5 sm:px-6 lg:py-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <p className="sr-only" role="status">
            Loading your dashboard…
          </p>
          <div className="space-y-5">
            <div className={`h-28 ${block}`} />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className={`h-32 ${block}`} />
              ))}
            </div>
            <div className={`h-72 ${block}`} />
          </div>
          <div className="space-y-5">
            <div className={`h-44 ${block}`} />
            <div className={`h-56 ${block}`} />
            <div className={`h-60 ${block}`} />
          </div>
        </main>
      </div>
    </div>
  );
}
