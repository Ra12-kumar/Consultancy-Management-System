"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { slugify } from "@/lib/format";

const DESTINATIONS = ["Delhi NCR", "Noida", "Greater Noida", "Gurugram", "Bengaluru", "Chennai", "Hyderabad", "Pune", "Mumbai", "Kolkata"];
const BUDGETS = [
  ["", "Any budget"],
  ["300000", "Up to ₹3 lakh"],
  ["600000", "Up to ₹6 lakh"],
  ["1000000", "Up to ₹10 lakh"],
  ["2000000", "Up to ₹20 lakh"],
] as const;

// Hero search: sends the student to the college directory with their filters.
export default function HeroSearch() {
  const router = useRouter();
  const [course, setCourse] = useState("");
  const [location, setLocation] = useState("");
  const [budget, setBudget] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    // The directory searches college names, cities and course names with q; locations are slugs; budget is in rupees.
    const q = new URLSearchParams(Object.entries({ q: course.trim(), location: location ? slugify(location) : "", budget }).filter(([, v]) => v));
    router.push(`/colleges${q.size ? `?${q}` : ""}`);
  }

  const control = "w-full min-h-12 rounded-xl border border-line bg-surface px-3.5 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";
  return (
    <form onSubmit={submit} role="search" aria-label="Find colleges" className="grid gap-3 rounded-2xl bg-surface p-4 shadow-2xl ring-1 ring-black/5 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:p-5">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-muted uppercase">Course</span>
        <input className={control} placeholder="e.g. B.Tech, MBA, B.Pharm" value={course} onChange={(e) => setCourse(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-muted uppercase">Location</span>
        <select className={control} value={location} onChange={(e) => setLocation(e.target.value)}>
          <option value="">Anywhere in India</option>
          {DESTINATIONS.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-muted uppercase">Budget</span>
        <select className={control} value={budget} onChange={(e) => setBudget(e.target.value)}>
          {BUDGETS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="min-h-12 self-end rounded-xl bg-accent px-6 text-sm font-bold text-accent-fg shadow-sm hover:brightness-105">
        Search
      </button>
    </form>
  );
}
