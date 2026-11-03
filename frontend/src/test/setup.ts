import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());
// findBy*/waitFor wait up to 5 s (the 1 s default is too short for multi-step forms under coverage or on a busy machine).
configure({ asyncUtilTimeout: 5000 });

// Next.js router hooks used by client components.
const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
export const router = { push, replace };
