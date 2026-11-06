import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "@/services/api";
import UdanColleges, { initials, pageList } from "./UdanColleges";

vi.mock("next/font/google", () => ({ Inter: () => ({ variable: "" }), Libre_Baskerville: () => ({ variable: "" }) }));
vi.mock("@/services/api", async (orig) => ({ ...(await orig<typeof import("@/services/api")>()), apiGet: vi.fn() }));
const nav = vi.hoisted(() => ({ replace: vi.fn(), params: new URLSearchParams("q=Bengaluru") }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: nav.replace }), usePathname: () => "/colleges", useSearchParams: () => nav.params }));

const college = (id: string, name: string, branch: string, website: string | null) => ({ id, name, city: "Bengaluru Urban", state: "Karnataka", website, branches: [branch], wikidataUrl: `https://www.wikidata.org/wiki/${id}` });
const result = {
  status: "ready",
  branch: null,
  items: [college("Q1", "Bengaluru Dr. B.R. Ambedkar School of Economics", "commerce", "http://www.base-ac.in/"), college("Q2", "Bengaluru Law College", "law", null)],
  total: 1312,
  page: 1,
  totalPages: 55,
  states: ["Delhi", "Karnataka"],
  cities: [],
  source: { name: "Wikidata", url: "https://www.wikidata.org", licence: "CC0", fetchedAt: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  vi.mocked(apiGet).mockImplementation(((path: string) => Promise.resolve(path.endsWith("/branches") ? { commerce: "Commerce", law: "Law" } : result)) as never);
});

describe("Udaan college finder", () => {
  it("shortens names to initials and lists page links with gaps", () => {
    expect(initials("Bengaluru Institute of Technology, Bengaluru")).toBe("BIT");
    expect(initials("Bengaluru Dr. B.R. Ambedkar School of Economics")).toBe("BE");
    expect(pageList(1, 55)).toEqual([1, 2, 3, "gap", 55]);
    expect(pageList(10, 55)).toEqual([1, "gap", 9, 10, 11, "gap", 55]);
  });

  it("shows the place heading and results, and searches, filters, sorts and pages through the URL", async () => {
    render(<UdanColleges />);
    expect(await screen.findByRole("heading", { name: "Colleges in Bengaluru" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "1,312 colleges" })).toBeInTheDocument();
    const card = screen.getByRole("heading", { name: "Bengaluru Law College" }).closest("article")!;
    expect(within(card).getByRole("link", { name: /Enquire now/ })).toHaveAttribute("href", "/enquire?collegeName=Bengaluru%20Law%20College%2C%20Bengaluru%20Urban&source=college_search");
    expect(within(card).getByRole("link", { name: /Search for website/ })).toBeInTheDocument();

    await userEvent.clear(screen.getByRole("searchbox"));
    await userEvent.type(screen.getByRole("searchbox"), "law");
    await userEvent.click(screen.getByRole("button", { name: "Search colleges" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/colleges?q=law", { scroll: false });
    await userEvent.click(screen.getByRole("radio", { name: "Law" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/colleges?q=Bengaluru&branch=law", { scroll: false });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Sort by" }), "name");
    expect(nav.replace).toHaveBeenLastCalledWith("/colleges?q=Bengaluru&order=name", { scroll: false });
    await userEvent.click(screen.getByRole("button", { name: "Page 3" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/colleges?q=Bengaluru&page=3", { scroll: true });
  });

  it("allows up to three colleges in the comparison", async () => {
    render(<UdanColleges />);
    const boxes = await screen.findAllByRole("checkbox", { name: /Add to compare/ });
    const compare = screen.getByRole("button", { name: /Compare colleges/ });
    expect(compare).toBeDisabled();
    await userEvent.click(boxes[0]!);
    await userEvent.click(boxes[1]!);
    expect(screen.getByText("2 of 3 selected")).toBeInTheDocument();
    expect(compare).toBeEnabled();
    expect(JSON.parse(sessionStorage.getItem("udan.compare")!)).toHaveLength(2);
  });

  it("filters by teacher-education course (D.El.Ed, B.Ed, M.Ed) and shows it on the heading and cards", async () => {
    nav.params = new URLSearchParams("teacher=bed&q=Bengaluru");
    render(<UdanColleges />);
    expect(await screen.findByRole("heading", { name: "B.Ed colleges in Bengaluru" })).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith("/colleges/explore?q=Bengaluru&teacher=bed", expect.anything());
    expect(screen.getAllByText("B.Ed", { selector: "span" }).length).toBeGreaterThan(0);
    expect(screen.getByText(/recognised from the college name/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Course" }), "med");
    expect(nav.replace).toHaveBeenLastCalledWith("/colleges?q=Bengaluru&teacher=med", { scroll: false });
    nav.params = new URLSearchParams("q=Bengaluru");
  });
});
