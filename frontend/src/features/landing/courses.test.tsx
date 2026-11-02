import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/services/api";
import UdanCourses from "./UdanCourses";

vi.mock("next/font/google", () => ({ Inter: () => ({ variable: "" }), Libre_Baskerville: () => ({ variable: "" }) }));
vi.mock("@/services/api", async (orig) => ({ ...(await orig<typeof import("@/services/api")>()), api: vi.fn() }));
const nav = vi.hoisted(() => ({ replace: vi.fn(), params: new URLSearchParams("mode=online") }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: nav.replace }), usePathname: () => "/courses", useSearchParams: () => nav.params }));

const offering = {
  id: "o1",
  course: { name: "B.Tech", slug: "btech-be", level: "ug", category: "Engineering" },
  college: { name: "Sample Institute", slug: "sample-institute", city: "Pune", state: "Maharashtra", logoUrl: null, isSample: true },
  specialization: "Computer Science",
  description: "",
  durationMonths: 48,
  mode: "offline",
  seats: 60,
  minQualification: "class_12",
  minPercentage: 60,
  entranceExams: ["JEE Main"],
  eligibilityText: "",
  applicationDeadline: null,
  imageUrl: null,
  brochureUrl: null,
  fee: { academicYear: "2026-27", yearlyMinor: 15000000, totalMinor: 60000000 },
};

beforeEach(() => vi.clearAllMocks());

describe("Udaan course browser", () => {
  it("shows the empty state, and searches and clears through the URL", async () => {
    vi.mocked(api).mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 1 } } as never);
    render(<UdanCourses />);
    expect(await screen.findByRole("heading", { name: "No courses match" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "0 courses found" })).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith("GET", "/courses/offerings?mode=online", expect.anything());
    await userEvent.type(screen.getByRole("searchbox"), "MBA");
    await userEvent.click(screen.getByRole("button", { name: "Search courses" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/courses?mode=online&q=MBA", { scroll: false });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Annual fee limit" }), "100000");
    expect(nav.replace).toHaveBeenLastCalledWith("/courses?mode=online&maxFee=100000", { scroll: false });
    await userEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]!);
    expect(nav.replace).toHaveBeenLastCalledWith("/courses", { scroll: false });
    expect(screen.getByRole("link", { name: "Search all colleges ↗" })).toHaveAttribute("href", "/colleges");
  });

  it("lists courses with fees, eligibility and an enquiry link", async () => {
    vi.mocked(api).mockResolvedValue({ data: [offering], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } } as never);
    render(<UdanCourses />);
    expect(await screen.findByRole("heading", { name: "1 course found" })).toBeInTheDocument();
    expect(screen.getByText("Class 12, 60%+")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Enquire now/ })).toHaveAttribute("href", "/enquire?college=sample-institute&course=btech-be&source=college_search");
  });
});
