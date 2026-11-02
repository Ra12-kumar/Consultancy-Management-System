import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "@/services/api";
import type { ExternalSearch } from "@/types/catalog";
import { ExternalResults } from "./ExternalResults";

vi.mock("@/services/api", async (orig) => ({ ...(await orig<typeof import("@/services/api")>()), apiGet: vi.fn() }));

const reply = (over: Partial<ExternalSearch> = {}): ExternalSearch => ({
  query: "anna",
  results: [
    { id: "0ee02b74-e7aa-4dde-849e-70f6c661d8be", name: "Anna University, Chennai", city: "Chennai", state: "Tamil Nadu", local: { slug: "anna-university", listingLevel: "detailed", isSample: false, hasVerifiedFees: true } },
    { id: "672b5280-ce9b-47f6-a7d3-c2704ebae06e", name: "Anna University Regional Campus - Madurai", city: "Madurai", state: "Tamil Nadu", local: null },
  ],
  source: { name: "CollegeDB", url: "https://collegedb.in", fetchedAt: "2026-10-28T10:00:00.000Z", cached: false },
  quotaRemaining: 20,
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("CollegeDB results", () => {
  it("asks our backend (never the provider) and labels the data as third-party without inventing fees", async () => {
    vi.mocked(apiGet).mockResolvedValue(reply());
    render(<ExternalResults query=" anna " />);
    expect(screen.getByRole("status", { name: "Searching CollegeDB" })).toBeInTheDocument();
    expect(await screen.findByText("Anna University, Chennai")).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith("/colleges/search?q=anna", expect.anything());
    expect(screen.getByText("Third-party data – not verified by us")).toBeInTheDocument();
    expect(screen.getByText("Verified fees in our directory")).toBeInTheDocument();
    expect(screen.getByText(/Fee information unavailable · Official website not available/)).toBeInTheDocument();
    expect(screen.queryByText(/₹/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View in our directory" })).toHaveAttribute("href", "/colleges/anna-university");
    const enquire = screen.getAllByRole("link", { name: "Enquire for Admission" });
    expect(enquire.map((a) => a.getAttribute("href"))).toEqual(["/enquire?college=anna-university&source=live_search", "/enquire?source=live_search"]);
  });

  it("shows an empty result, a quiet notice when the daily limit is used up, and a retry for temporary failures", async () => {
    vi.mocked(apiGet).mockResolvedValueOnce(reply({ results: [] }));
    const { unmount } = render(<ExternalResults query="zzqq" />);
    expect(await screen.findByText(/No colleges named like “zzqq”/)).toBeInTheDocument();
    unmount();

    vi.mocked(apiGet).mockRejectedValueOnce({ status: 503, code: "COLLEGEDB_QUOTA_EXHAUSTED", message: "The external college search has reached its daily limit." });
    const second = render(<ExternalResults query="iit" />);
    expect(await screen.findByText(/reached its daily limit/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    second.unmount();

    vi.mocked(apiGet).mockRejectedValueOnce({ status: 502, code: "COLLEGEDB_UNAVAILABLE", message: "The external college search could not be reached." }).mockResolvedValueOnce(reply());
    render(<ExternalResults query="anna" />);
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Anna University, Chennai")).toBeInTheDocument();
  });
});
