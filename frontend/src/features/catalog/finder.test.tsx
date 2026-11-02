import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "@/services/api";
import CollegeFinder, { finderQuery, type FinderResult } from "./CollegeFinder";
import CollegesView from "./CollegesView";

vi.mock("@/services/api", async (orig) => ({ ...(await orig<typeof import("@/services/api")>()), api: vi.fn(), apiGet: vi.fn() }));
const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => nav.params, usePathname: () => "/colleges", useRouter: () => ({ push: vi.fn(), replace: nav.replace }) }));
vi.mock("./CollegeDirectory", () => ({ default: () => <p>Verified directory</p> }));
vi.mock("./TopColleges", () => ({ default: () => null }));
vi.mock("./CampusShowcase", () => ({ default: () => null }));

const BRANCHES = { engineering: "Engineering & Technology", medical: "Medical & Dental" };
const result: FinderResult = {
  status: "ready",
  branch: "engineering",
  items: [
    { id: "Q1", name: "College of Engineering, Pune", city: "Pune", state: "Maharashtra", website: "https://www.coep.org.in/", branches: ["engineering"], wikidataUrl: "https://www.wikidata.org/wiki/Q1" },
    { id: "Q2", name: "Government Engineering College Thrissur", city: "Thrissur", state: "Kerala", website: null, branches: ["engineering"], wikidataUrl: "https://www.wikidata.org/wiki/Q2" },
  ],
  total: 2,
  page: 1,
  totalPages: 1,
  states: ["Kerala", "Maharashtra"],
  cities: [],
  source: { name: "Wikidata", url: "https://www.wikidata.org", licence: "CC0", fetchedAt: "2026-10-29T21:00:00.000Z" },
};

beforeEach(() => {
  vi.clearAllMocks();
  nav.params = new URLSearchParams();
  vi.mocked(apiGet).mockImplementation(((path: string) => Promise.resolve(path.startsWith("/colleges/explore/branches") ? BRANCHES : result)) as never);
});

describe("college finder", () => {
  it("opens from a course link with its branch selected and links each college to its official website", async () => {
    nav.params = new URLSearchParams("course=btech-be");
    render(<CollegeFinder />);
    expect(await screen.findByText("College of Engineering, Pune", { selector: "a" })).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith("/colleges/explore?course=btech-be", expect.anything());
    expect(screen.getByRole("combobox", { name: "Branch" })).toHaveValue("engineering");
    expect(screen.getByRole("heading", { name: /2 colleges · Engineering & Technology/ })).toBeInTheDocument();

    const [coep, thrissur] = screen.getAllByRole("article");
    const site = within(coep!).getByRole("link", { name: /Visit official website/ });
    expect(site).toHaveAttribute("href", "https://www.coep.org.in/");
    expect(site).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(site).toHaveAttribute("target", "_blank");
    expect(within(coep!).getByRole("link", { name: "Enquire Now" })).toHaveAttribute("href", expect.stringContaining("/enquire?collegeName="));
    // No made-up website: a college without one offers a web search instead.
    expect(within(thrissur!).queryByRole("link", { name: /Visit official website/ })).toBeNull();
    expect(within(thrissur!).getByRole("link", { name: /Search for website/ })).toBeInTheDocument();
  });

  it("searches as you type and changes filters through the URL", async () => {
    render(<CollegeFinder />);
    await screen.findByText("College of Engineering, Pune", { selector: "a" });
    await userEvent.type(screen.getByRole("searchbox", { name: /College name or place/ }), "pune");
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/colleges?q=pune", { scroll: false }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "State or UT" }), "Kerala");
    expect(nav.replace).toHaveBeenLastCalledWith("/colleges?state=Kerala", { scroll: false });
    expect(finderQuery(new URLSearchParams("q=iit&view=all&state=&page=2")).toString()).toBe("q=iit&page=2");
  });

  it("explains a first-time load instead of showing an empty page", async () => {
    vi.mocked(apiGet).mockImplementation(((path: string) => Promise.resolve(path.startsWith("/colleges/explore/branches") ? BRANCHES : { ...result, status: "loading", items: [], total: 0 })) as never);
    render(<CollegeFinder />);
    expect(await screen.findByText("Preparing the college list")).toBeInTheDocument();
  });

  it("keeps the verified directory for its own filters", () => {
    nav.params = new URLSearchParams("view=all&course=btech-be");
    render(<CollegesView />);
    expect(screen.getByText("Verified directory")).toBeInTheDocument();
  });
});
