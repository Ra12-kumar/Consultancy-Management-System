import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, apiGet } from "@/services/api";
import type { ExternalSearch } from "@/types/catalog";
import CollegeSearch, { enquireFor, websiteFor } from "./CollegeSearch";

vi.mock("@/services/api", async (orig) => ({ ...(await orig<typeof import("@/services/api")>()), api: vi.fn(), apiGet: vi.fn() }));
const nav = vi.hoisted(() => ({ replace: vi.fn(), params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: nav.replace, push: vi.fn() }), usePathname: () => "/colleges", useSearchParams: () => nav.params }));

const iitb = { id: "26bb7fb5-22e7-4d54-aad9-e1e4681ae24c", name: "Indian Institute of Technology, Bombay", city: "Mumbai", state: "Maharashtra", local: null };

beforeEach(() => {
  vi.clearAllMocks();
  nav.params = new URLSearchParams();
});

describe("college search", () => {
  it("links the official website when known and a web search otherwise, never a made-up address", () => {
    expect(websiteFor({ ...iitb, website: { url: "https://www.iitb.ac.in/", source: "wikidata", reference: "https://www.wikidata.org/wiki/Q1661242" } })).toEqual({ href: "https://www.iitb.ac.in/", official: true, source: "wikidata" });
    const fallback = websiteFor({ ...iitb, website: null });
    expect(fallback.official).toBe(false);
    expect(fallback.href).toBe("https://www.google.com/search?q=Indian%20Institute%20of%20Technology%2C%20Bombay%20Mumbai%20official%20website");
    expect(websiteFor({ ...iitb, website: { url: "javascript:alert(1)", source: "wikidata", reference: null } }).official).toBe(false);
    expect(enquireFor(iitb)).toBe("/enquire?collegeName=Indian%20Institute%20of%20Technology%2C%20Bombay%2C%20Mumbai&source=live_search");
  });

  it("shows real search results with a website button, details and enquiry", async () => {
    nav.params = new URLSearchParams("q=IIT Bombay");
    vi.mocked(api).mockResolvedValue({ data: [], meta: {} });
    vi.mocked(apiGet).mockResolvedValue({ query: "IIT Bombay", results: [{ ...iitb, website: { url: "https://www.iitb.ac.in/", source: "wikidata", reference: null } }], source: { name: "CollegeDB", url: "https://collegedb.in", fetchedAt: "2026-10-28T10:00:00.000Z", cached: false }, quotaRemaining: 10 } satisfies ExternalSearch);
    render(<CollegeSearch />);
    expect(await screen.findByText("Indian Institute of Technology, Bombay")).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith("/colleges/search?q=IIT%20Bombay", expect.anything());
    const results = within(screen.getByRole("region", { name: "Search results" }));
    const site = results.getByRole("link", { name: /Visit official website/ });
    expect(site).toHaveAttribute("href", "https://www.iitb.ac.in/");
    expect(site).toHaveAttribute("target", "_blank");
    expect(site.getAttribute("rel")).toContain("noopener");
    expect(screen.getByRole("link", { name: "View details" })).toHaveAttribute("href", `/colleges/live/${iitb.id}`);
    expect(screen.getByText("Website as listed on Wikidata.")).toBeInTheDocument();
  });

  it("explains when live search has used its daily limit", async () => {
    nav.params = new URLSearchParams("q=Anna");
    vi.mocked(api).mockResolvedValue({ data: [], meta: {} });
    vi.mocked(apiGet).mockRejectedValue({ status: 503, code: "COLLEGEDB_QUOTA_EXHAUSTED", message: "The external college search has reached its daily limit." });
    render(<CollegeSearch />);
    expect(await screen.findByText(/reached its daily limit/)).toBeInTheDocument();
  });

  it("shows India's best colleges with real photos, credits and official websites", () => {
    render(<CollegeSearch />);
    const top = within(screen.getByRole("region", { name: "India's best colleges" }));
    expect(top.getAllByRole("listitem")).toHaveLength(8);
    expect(top.getByRole("img", { name: "Campus of Indian Institute of Technology Bombay" })).toHaveAttribute("src", "/images/colleges/iit-bombay.jpg");
    expect(top.getByRole("link", { name: /Visit official website for Indian Institute of Technology Bombay/ })).toHaveAttribute("href", "https://www.iitb.ac.in/");
    expect(top.getByRole("link", { name: /Arne Hückelheim, CC BY-SA 3.0/ })).toHaveAttribute("href", "https://commons.wikimedia.org/wiki/File:IITBMainBuildingCROP.jpg");
    expect(top.getAllByRole("link", { name: "Enquire for Admission" })[0]).toHaveAttribute("href", "/enquire?collegeName=Indian%20Institute%20of%20Technology%20Madras%2C%20Chennai&source=top_colleges");
  });
});
