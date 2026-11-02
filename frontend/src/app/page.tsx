import type { Metadata } from "next";
import UdanLanding from "@/features/landing/UdanLanding";

// The home page is the Udaan landing page (also at /udan). The previous home page is kept in features/home/ClassicHome.tsx.
export const metadata: Metadata = {
  title: { absolute: "Udaan · Find your way forward" },
  description: "Discover colleges, make sense of your options, and move through admissions with a plan built around you.",
};

export default function Home() {
  return <UdanLanding />;
}
