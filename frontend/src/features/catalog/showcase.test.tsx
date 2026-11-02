import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CampusShowcase from "./CampusShowcase";
import { TOP_COLLEGES } from "./TopColleges";

describe("campus showcase", () => {
  it("shows a large credited photo for each institution with its official website and an enquiry link", () => {
    render(<CampusShowcase />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(TOP_COLLEGES.length);
    const first = within(items[0]!);
    expect(first.getByRole("img", { name: /Campus of Indian Institute of Technology Madras/ })).toHaveAttribute("src", "/images/colleges/iit-madras.jpg");
    const site = first.getByRole("link", { name: /Visit official website/ });
    expect(site).toHaveAttribute("href", "https://www.iitm.ac.in/");
    expect(site).toHaveAttribute("rel", "noopener noreferrer");
    expect(first.getByRole("link", { name: "Enquire for Admission" })).toHaveAttribute("href", expect.stringContaining("/enquire?collegeName="));
    expect(first.getByRole("link", { name: /Photo: .*Wikimedia Commons/ })).toHaveAttribute("href", expect.stringContaining("commons.wikimedia.org"));
  });
});
