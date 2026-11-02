import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiPost } from "@/services/api";
import UdanCallbackForm from "./UdanCallbackForm";
import UdanSearch, { searchHref } from "./UdanSearch";

vi.mock("@/services/api", async (orig) => ({ ...(await orig<typeof import("@/services/api")>()), apiPost: vi.fn() }));
const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push }) }));

beforeEach(() => vi.clearAllMocks());

describe("Udaan landing page", () => {
  it("sends hero searches to the college finder or the course browser", async () => {
    expect(searchHref("colleges", " iit ", "")).toBe("/colleges?q=iit");
    expect(searchHref("colleges", "law", "state:Delhi")).toBe("/colleges?q=law&state=Delhi");
    expect(searchHref("colleges", "", "city:Pune")).toBe("/colleges?q=Pune");
    expect(searchHref("courses", "MBA", "")).toBe("/courses/browse?q=MBA");
    render(<UdanSearch />);
    await userEvent.click(screen.getByRole("tab", { name: "Explore courses" }));
    await userEvent.type(screen.getByRole("searchbox"), "B.Tech");
    await userEvent.click(screen.getByRole("button", { name: "Search courses" }));
    expect(nav.push).toHaveBeenCalledWith("/courses/browse?q=B.Tech");
  });

  it("sends the callback request with the chosen role and consent, then thanks the visitor", async () => {
    vi.mocked(apiPost).mockResolvedValue({ received: true } as never);
    render(<UdanCallbackForm />);
    await userEvent.click(screen.getByText("Parent / guardian"));
    await userEvent.type(screen.getByLabelText("Full name *"), "Asha Verma");
    await userEvent.type(screen.getByLabelText("Mobile number *"), "9876543210");
    await userEvent.selectOptions(screen.getByLabelText("Current education *"), "class_12");
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: /Request a callback/ }));
    expect(apiPost).toHaveBeenCalledWith("/leads/callback", { name: "Asha Verma", mobile: "9876543210", role: "parent", education: "class_12", interest: "", consent: true });
    expect(await screen.findByText(/we’ve received your request/)).toBeInTheDocument();
  });
});
