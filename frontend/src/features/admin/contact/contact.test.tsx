import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FooterContact from "@/features/content/FooterContact";
import { apiGet, apiPut } from "@/services/api";
import ContactInformation, { validateContact } from "./ContactInformation";

vi.mock("@/services/api", async (orig) => ({ ...(await orig<typeof import("@/services/api")>()), apiGet: vi.fn(), apiPut: vi.fn() }));

const empty = { name: "", supportEmail: "", supportPhone: "", whatsapp: "", address: "", officeHours: "", instagram: "", facebook: "", contactPerson: "", mapsUrl: "", linkedin: "", youtube: "", x: "" };
// Test values only.
const saved = {
  ...empty,
  name: "Example Consultancy",
  contactPerson: "Asha Rao",
  supportEmail: "info@example.com",
  supportPhone: "+91 98765 43210",
  whatsapp: "+91 98765 43210",
  address: "Example Tower, Noida",
  mapsUrl: "https://maps.app.goo.gl/abc",
  officeHours: "Mon–Sat 10–6",
  linkedin: "https://www.linkedin.com/company/example",
};
let current = { ...empty };

beforeEach(() => {
  vi.clearAllMocks();
  current = { ...empty };
  vi.mocked(apiGet).mockImplementation((async () => ({ organisation: current, banners: [], payments: { enabled: false } })) as never);
  vi.mocked(apiPut).mockImplementation((async (_path: string, body: { organisation: typeof empty }) => {
    current = { ...current, ...body.organisation };
    return { organisation: current };
  }) as never);
});

describe("Contact information form", () => {
  it("validates like the server", () => {
    expect(validateContact(saved as never)).toEqual({});
    const e = validateContact({ ...empty, supportEmail: "nope", supportPhone: "call", mapsUrl: "https://example.com/x", instagram: "https://facebook.com/x", x: "http://x.com/a" } as never);
    expect(Object.keys(e).sort()).toEqual(["instagram", "mapsUrl", "supportEmail", "supportPhone", "x"]);
  });

  it("saves the details and the footer Contact us section updates without a reload", async () => {
    render(
      <>
        <ContactInformation />
        <footer>
          <FooterContact />
        </footer>
      </>,
    );
    // Nothing saved yet: the footer shows no Contact us section (nothing is hard-coded).
    await screen.findByLabelText("Company name");
    expect(screen.queryByRole("heading", { name: "Contact us" })).toBeNull();

    await userEvent.type(screen.getByLabelText("Company name"), "  Example Consultancy ");
    await userEvent.type(screen.getByLabelText("Contact person"), "Asha Rao");
    await userEvent.type(screen.getByLabelText("Email"), "info@example.com");
    await userEvent.type(screen.getByLabelText("Phone"), "+91 98765 43210");
    await userEvent.type(screen.getByLabelText("Google Maps location link"), "https://maps.app.goo.gl/abc");
    await userEvent.type(screen.getByLabelText("Business hours"), "Mon–Sat 10–6");
    await userEvent.type(screen.getByLabelText("LinkedIn"), "https://www.linkedin.com/company/example");
    await userEvent.click(screen.getByRole("button", { name: "Save contact information" }));

    expect(apiPut).toHaveBeenCalledWith("/admin/settings/site", { organisation: expect.objectContaining({ name: "Example Consultancy", contactPerson: "Asha Rao", mapsUrl: "https://maps.app.goo.gl/abc" }) });
    expect(await screen.findByText(/Saved\. The website's Contact us section/)).toBeInTheDocument();

    const footer = within(screen.getByRole("contentinfo"));
    expect(await footer.findByRole("heading", { name: "Contact us" })).toBeInTheDocument();
    expect(footer.getByText("Example Consultancy")).toBeInTheDocument();
    expect(footer.getByText("Contact: Asha Rao")).toBeInTheDocument();
    expect(footer.getByRole("link", { name: "+91 98765 43210" })).toHaveAttribute("href", "tel:+919876543210");
    expect(footer.getByRole("link", { name: "info@example.com" })).toHaveAttribute("href", "mailto:info@example.com");
    expect(footer.getByRole("link", { name: /View on Google Maps/ })).toHaveAttribute("href", "https://maps.app.goo.gl/abc");
    expect(footer.getByRole("link", { name: /LinkedIn/ })).toHaveAttribute("target", "_blank");
    expect(footer.getByText("Mon–Sat 10–6")).toBeInTheDocument();
  });

  it("stops invalid input before saving and shows the server's field messages", async () => {
    render(<ContactInformation />);
    await userEvent.type(await screen.findByLabelText("Google Maps location link"), "https://example.com/where");
    await userEvent.click(screen.getByRole("button", { name: "Save contact information" }));
    expect(apiPut).not.toHaveBeenCalled();
    expect(screen.getByText(/Use the full https:\/\/ Google Maps link/)).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Google Maps location link"));
    vi.mocked(apiPut).mockRejectedValueOnce({ status: 422, code: "VALIDATION_ERROR", message: "Check the details", details: [{ field: "organisation.name", message: "Too long for the server" }] } as never);
    await userEvent.type(screen.getByLabelText("Company name"), "Example");
    await userEvent.click(screen.getByRole("button", { name: "Save contact information" }));
    expect(await screen.findByText("Too long for the server")).toBeInTheDocument();
  });

  it("shows nothing in the footer when the site endpoint fails", async () => {
    vi.mocked(apiGet).mockRejectedValue({ status: 0, message: "offline" } as never);
    const { container } = render(<FooterContact />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });
});
