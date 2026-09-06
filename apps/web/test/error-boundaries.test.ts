import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { translate } from "@velyq/ui";

/*
 * With no not-found.tsx and no error.tsx, Next served its own stock pages: an
 * unstyled "This page could not be found." in English, with no header, no
 * footer, no language switcher and no route back into the product. A Greek
 * visitor got English, and a failure was indistinguishable from the site
 * being down. These pin that both whole-page failures stay inside VELYQ, in
 * the visitor's own language.
 */

const localeState = vi.hoisted(() => ({ locale: "en" as "en" | "el" }));

vi.mock("../app/locale", () => ({
  getLocale: async () => localeState.locale,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(() => {
  localeState.locale = "en";
  vi.resetModules();
});

async function renderNotFound() {
  const { default: NotFound } = await import("../app/not-found");
  return renderToStaticMarkup(await NotFound());
}

describe("not-found boundary", () => {
  it("renders VELYQ's own copy, not Next's stock 404", async () => {
    const html = await renderNotFound();
    expect(html).toContain(translate("notFoundTitle", "en"));
    expect(html).not.toContain("This page could not be found");
  });

  it("offers a route back into the product", async () => {
    const html = await renderNotFound();
    expect(html).toContain('href="/"');
    expect(html).toContain(translate("backToHome", "en"));
  });

  it("keeps the public chrome, so the visitor is not stranded", async () => {
    const html = await renderNotFound();
    // Real landmarks: a header/footer and a main region.
    expect(html).toContain("<header");
    expect(html).toContain("<footer");
    expect(html).toContain('id="main-content"');
  });

  it("speaks Greek to a Greek visitor", async () => {
    localeState.locale = "el";
    const html = await renderNotFound();
    expect(html).toContain(translate("notFoundTitle", "el"));
    expect(html).toContain(translate("backToHome", "el"));
    expect(html).not.toContain(translate("notFoundTitle", "en"));
  });

  it("announces itself as a page-level heading", async () => {
    const html = await renderNotFound();
    expect(html).toContain("<h1");
  });
});

describe("error boundary copy", () => {
  it("never blames the visitor for a server-side failure", async () => {
    for (const locale of ["en", "el"] as const) {
      const body = translate("errorBody", locale);
      expect(body.length).toBeGreaterThan(0);
    }
    // The English copy must not imply the visitor caused it.
    expect(translate("errorBody", "en")).toMatch(/not a problem with your/i);
    expect(translate("errorTitle", "en")).toMatch(/our side/i);
  });

  it("has Greek copy that is actually Greek", async () => {
    expect(translate("errorTitle", "el")).toMatch(/[Ͱ-Ͽ]/);
    expect(translate("notFoundTitle", "el")).toMatch(/[Ͱ-Ͽ]/);
    expect(translate("backToHome", "el")).toMatch(/[Ͱ-Ͽ]/);
  });
});
