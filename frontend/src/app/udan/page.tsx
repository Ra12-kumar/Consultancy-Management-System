import type { Metadata } from "next";
import UdanLanding from "@/features/landing/UdanLanding";

export const metadata: Metadata = {
  title: { absolute: "Udaan · Find your way forward" },
  description: "Discover colleges, make sense of your options, and move through admissions with a plan built around you.",
};

export default function UdanPage() {
  return <UdanLanding />;
}
