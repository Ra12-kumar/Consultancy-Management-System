"use client";

import { useSearchParams } from "next/navigation";
import CollegeDirectory from "./CollegeDirectory";
import CollegeFinder, { FINDER_KEYS } from "./CollegeFinder";

// /colleges: the real-time finder (name, branch, state, city; also course links from the Courses page);
// the verified directory with its fee and approval filters for ?view=all or any other directory filter.
export default function CollegesView() {
  const params = useSearchParams();
  const directory = [...params.keys()].some((k) => !FINDER_KEYS.includes(k));
  return directory ? <CollegeDirectory /> : <CollegeFinder />;
}
