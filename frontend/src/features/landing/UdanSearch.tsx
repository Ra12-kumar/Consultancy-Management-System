"use client";

/* eslint-disable @next/next/no-img-element -- small local SVG icons from the client design */
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

// Places offered in the hero search: popular cities search by name, states and UTs filter the finder.
const CITIES = ["Bengaluru", "Pune", "Mumbai", "Hyderabad", "Chennai", "Kolkata", "Ahmedabad", "Jaipur"];
export const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];

// Where the hero search sends people: the college finder, or the course browser in "Explore courses" mode.
export function searchHref(mode: "colleges" | "courses", text: string, place: string) {
  const p = new URLSearchParams();
  const [kind, value] = place.split(":") as ["city" | "state" | "", string | undefined];
  const q = [text.trim(), kind === "city" ? value : ""].filter(Boolean).join(" ");
  if (q) p.set("q", q);
  if (kind === "state" && value) p.set("state", value);
  return `${mode === "colleges" ? "/colleges" : "/courses/browse"}${p.size ? `?${p}` : ""}`;
}

export default function UdanSearch() {
  const router = useRouter();
  const [mode, setMode] = useState<"colleges" | "courses">("colleges");
  const [text, setText] = useState("");
  const [place, setPlace] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    router.push(searchHref(mode, text, place));
  };
  const tab = (m: typeof mode, label: string) => (
    <button type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`text-sm ${mode === m ? "font-bold text-[#142b41]" : "text-[#5c6974] hover:text-[#142b41]"}`}>
      {label}
    </button>
  );
  return (
    <form role="search" aria-label="Find colleges or courses" onSubmit={submit} className="w-full rounded-[10px] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-x-7 gap-y-2">
        <div role="tablist" aria-label="Search for" className="flex gap-7">
          {tab("colleges", "Find your college")}
          {tab("courses", "Explore courses")}
        </div>
        <p className="text-xs text-[#5c6974]">A good decision starts with the right options.</p>
      </div>
      <div className="mt-[18px] flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="flex h-[54px] min-w-0 flex-1 items-center gap-3 rounded-md border border-[#dfe3e5] px-4 focus-within:border-[#10283f]">
          <img src="/udan/search.svg" alt="" width={20} height={20} />
          <span className="sr-only">{mode === "colleges" ? "College, course or career interest" : "Course or subject"}</span>
          <input type="search" value={text} onChange={(e) => setText(e.target.value)} maxLength={80} placeholder={mode === "colleges" ? "College, course or career interest" : "Course or subject, e.g. B.Tech, MBA"} className="min-w-0 flex-1 bg-transparent text-sm text-[#142b41] outline-none placeholder:text-[#5c6974]" />
        </label>
        <label className="relative flex h-[54px] items-center gap-2.5 rounded-md border border-[#dfe3e5] px-4 focus-within:border-[#10283f] lg:w-[248px]">
          <img src="/udan/map-pin.svg" alt="" width={19} height={19} />
          <span className="sr-only">City or state</span>
          <select value={place} onChange={(e) => setPlace(e.target.value)} className={`min-w-0 flex-1 appearance-none bg-transparent pr-6 text-sm outline-none ${place ? "text-[#142b41]" : "text-[#5c6974]"}`}>
            <option value="">City or state</option>
            <optgroup label="Popular cities">
              {CITIES.map((c) => (
                <option key={c} value={`city:${c}`}>
                  {c}
                </option>
              ))}
            </optgroup>
            <optgroup label="States and union territories">
              {STATES.map((s) => (
                <option key={s} value={`state:${s}`}>
                  {s}
                </option>
              ))}
            </optgroup>
          </select>
          <img src="/udan/chevron-down.svg" alt="" width={16} height={16} className="pointer-events-none absolute right-4" />
        </label>
        <button type="submit" className="inline-flex h-[50px] items-center justify-center gap-4 rounded-md bg-[#10283f] px-[22px] text-sm font-semibold whitespace-nowrap text-white hover:bg-[#1b3a57] focus-visible:ring-2 focus-visible:ring-[#edbf54] focus-visible:outline-none">
          {mode === "colleges" ? "Search colleges" : "Search courses"}
          <img src="/udan/arrow-navy-btn.svg" alt="" width={18} height={18} />
        </button>
      </div>
    </form>
  );
}
