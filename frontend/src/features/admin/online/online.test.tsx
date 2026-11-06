import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, apiGet } from "@/services/api";
import OnlinePrograms from "./OnlinePrograms";
import { bestMatch, filterOnline, ONLINE_UNIVERSITIES } from "./onlineUniversities";

vi.mock("@/services/api", async (orig) => ({ ...(await orig<typeof import("@/services/api")>()), api: vi.fn(), apiGet: vi.fn() }));

// Test fixtures only: one catalogue record, one finder record, one failing lookup; everything else is not found.
const card = { id: "c1", name: "Amity University, Noida", slug: "amity-noida", isSample: false };
const detail = {
  ...card,
  city: "Noida",
  state: "Uttar Pradesh",
  logoUrl: "https://example.org/logo.png",
  about: "Test description from the catalogue.",
  website: "https://example.org/",
  lastVerifiedAt: "2026-11-06T10:00:00.000Z",
  offerings: [
    { id: "o1", mode: "online", course: { name: "BBA", level: "ug" }, specialization: "", durationMonths: 36 },
    { id: "o2", mode: "online", course: { name: "MBA", level: "pg" }, specialization: "Finance", durationMonths: 24 },
    { id: "o3", mode: "offline", course: { name: "B.Tech", level: "ug" }, specialization: "", durationMonths: 48 },
    { id: "o4", mode: "online", course: { name: "PhD", level: "doctorate" }, specialization: "", durationMonths: 36 },
  ],
};
const finder = (items: unknown[]) => ({ status: "ready", items });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api).mockResolvedValue({ data: [card], meta: { total: 1 } } as never);
  vi.mocked(apiGet).mockImplementation((async (path: string) => {
    if (path === "/colleges/amity-noida") return detail;
    if (path.includes("Jamia+Hamdard")) return finder([{ id: "Q1", name: "Jamia Hamdard", city: "New Delhi", state: "", website: "http://example.net/", branches: [], wikidataUrl: "" }]);
    if (path.includes("Parul")) return finder([{ id: "Q2", name: "Parul Institute of Medical Science and Research", city: "", state: "", website: "https://example.com/", branches: [], wikidataUrl: "" }]);
    if (path.includes("GLA")) throw { status: 500, code: "X", message: "boom" };
    return finder([]);
  }) as never);
});

describe("Online UG & PG", () => {
  it("shows catalogue details and online UG/PG courses, finder entries and honest missing states", async () => {
    render(<OnlinePrograms />);
    const amity = await screen.findByRole("article", { name: "Amity" });
    expect(within(amity).getByText("Amity University, Noida")).toBeInTheDocument();
    expect(within(amity).getByText("Test description from the catalogue.")).toBeInTheDocument();
    const list = within(within(amity).getByRole("list", { name: /Online courses at/ }));
    expect(list.getByText("BBA")).toBeInTheDocument();
    expect(list.getByText("MBA")).toBeInTheDocument();
    // Offline and non-UG/PG courses are not listed.
    expect(within(amity).queryByText("B.Tech")).toBeNull();
    expect(within(amity).queryByText("PhD")).toBeNull();
    const link = within(amity).getByRole("link", { name: /View College/ });
    expect(link).toHaveAttribute("href", "https://example.org/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");

    expect(within(amity).getByText("Verified")).toBeInTheDocument();
    expect(within(amity).getByText("UG:").parentElement).toHaveTextContent("UG: BBA");
    expect(within(amity).getByText("PG:").parentElement).toHaveTextContent("PG: MBA");
    expect(within(amity).getByRole("img", { name: "Amity University, Noida logo" })).toHaveAttribute("src", "https://example.org/logo.png");

    const jamia = screen.getByRole("article", { name: "Jamia Hamdard" });
    // No logo in the source: a neutral placeholder, never another picture.
    expect(within(jamia).queryByRole("img")).toBeNull();
    expect(within(jamia).getByText("Logo not available")).toBeInTheDocument();
    expect(within(jamia).getByRole("link", { name: /View College/ })).toHaveAttribute("href", "http://example.net/");
    expect(within(jamia).getByText(/Description not yet added/)).toBeInTheDocument();
    expect(within(jamia).getByText(/Source: College finder/)).toBeInTheDocument();
    // Finder entries are not catalogue-verified.
    expect(within(jamia).queryByText("Verified")).toBeNull();

    // A look-alike institution is not shown as the university.
    const parul = screen.getByRole("article", { name: "Parul" });
    expect(within(parul).getByText(/Not found in the college catalogue/)).toBeInTheDocument();
    expect(within(parul).queryByRole("link")).toBeNull();

    // One failed lookup affects only that card.
    expect(within(screen.getByRole("article", { name: "GLA" })).getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByText(/2 of 23 universities found · 1 with online UG\/PG courses/)).toBeInTheDocument();
    // The catalogue is read once and searched in the browser; no listing call per university.
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("filters by search and course level, with an empty state", async () => {
    render(<OnlinePrograms />);
    await screen.findByRole("article", { name: "Amity" });
    await userEvent.type(screen.getByLabelText("Search"), "jamia");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    await userEvent.clear(screen.getByLabelText("Search"));

    await userEvent.selectOptions(screen.getByLabelText("Course level"), "pg");
    const only = screen.getAllByRole("article");
    expect(only).toHaveLength(1);
    const pgList = within(within(only[0]!).getByRole("list", { name: /Online courses at/ }));
    expect(pgList.getByText("MBA")).toBeInTheDocument();
    expect(pgList.queryByText("BBA")).toBeNull();
    expect(within(only[0]!).queryByText("UG:")).toBeNull();

    await userEvent.selectOptions(screen.getByLabelText("Course level"), "");
    await userEvent.selectOptions(screen.getByLabelText("Course"), "BBA");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    await userEvent.selectOptions(screen.getByLabelText("Course"), "");
    await userEvent.selectOptions(screen.getByLabelText("Location"), "Uttar Pradesh");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByText("Universities Found").parentElement).toHaveTextContent("1 Universities Found");
    await userEvent.selectOptions(screen.getByLabelText("Location"), "");

    await userEvent.type(screen.getByLabelText("Search"), "nothing like this");
    expect(screen.getByText("No universities match")).toBeInTheDocument();
  });

  it("shows an error with a retry when the college API cannot be reached", async () => {
    vi.mocked(api).mockRejectedValueOnce({ status: 0, code: "NETWORK_ERROR", message: "Could not reach the server." } as never);
    render(<OnlinePrograms />);
    expect(await screen.findByText("Could not reach the server.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("article", { name: "Amity" })).toBeInTheDocument();
  });
});

describe("matching rules", () => {
  const u = (key: string) => ONLINE_UNIVERSITIES.find((x) => x.key === key)!;
  it("prefers the record with a website, then the main (shortest) name, and rejects look-alikes", () => {
    const jain = [
      { name: "Jain University Faculty of Commerce", website: null },
      { name: "JAIN (Deemed-to-be-University)", website: "https://example.org/" },
      { name: "Dr B R Ambedkar University Seth Padam Chand Jain Institute", website: "https://example.com/" },
    ];
    expect(bestMatch(u("jain"), jain)?.name).toBe("JAIN (Deemed-to-be-University)");
    expect(bestMatch(u("shoolini"), [{ name: "Shoolini Institutes of Life Sciences and Business Management", website: "https://example.org/" }])).toBeNull();
    expect(bestMatch(u("dyp-pune"), [{ name: "Dr. D.Y. Patil Vidyapeeth, Pune", website: "https://example.org/" }])).not.toBeNull();
    expect(bestMatch(u("dyp-mumbai"), [{ name: "Padmashree Dr DY Patil University", website: "https://example.org/" }])).not.toBeNull();
    expect(ONLINE_UNIVERSITIES).toHaveLength(23);
    expect(ONLINE_UNIVERSITIES.some((x) => /galgotia/i.test(x.label))).toBe(false);
  });

  it("searches course names too", () => {
    const item = { key: "k", label: "X", status: "catalogue" as const, name: "X University", slug: "x", city: "", state: "", logoUrl: null, about: "", website: null, verifiedAt: null, photoUrl: null, courses: [{ id: "1", name: "MCA", specialization: "", level: "pg" as const, durationMonths: 24 }] };
    expect(filterOnline([item], "mca", "")).toHaveLength(1);
    expect(filterOnline([item], "", "ug")).toHaveLength(0);
  });
});
