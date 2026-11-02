"use client";

import { useSearchParams } from "next/navigation";
import CollegeDirectory from "@/features/catalog/CollegeDirectory";
import UdanColleges, { UDAN_FINDER_KEYS } from "./UdanColleges";

// /colleges: the Udaan college finder; the verified directory for ?view=all or any other directory filter
// (the same split as features/catalog/CollegesView, which is kept for the previous design).
export default function UdanCollegesView() {
  const params = useSearchParams();
  const directory = [...params.keys()].some((k) => !UDAN_FINDER_KEYS.includes(k));
  return directory ? <CollegeDirectory /> : <UdanColleges />;
}
