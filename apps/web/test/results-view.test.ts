import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildDemoHistory } from "../app/customer/history-data";
import { ResultsView } from "../app/results/results-view";

const demo = buildDemoHistory(new Date("2026-09-08T12:00:00.000Z"));

function visibleText(locale: "en" | "el") {
  return renderToStaticMarkup(
    createElement(ResultsView, { data: demo, locale }),
  )
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("decision History presentation", () => {
  it("renders all demo metadata in Greek while retaining proper nouns", () => {
    const text = visibleText("el");

    expect(text).toContain(
      "Δείγμα επίδειξης · όλες οι επιλέξιμες ενεργές αποφάσεις",
    );
    expect(text).toContain("Σύνολο γκολ κανονικής διάρκειας");
    expect(text).toContain("Πάνω 2.5");
    expect(text).toContain("Αξία");
    expect(text).toContain("Παρακολούθηση");
    expect(text).toContain("Northbridge United");
    expect(text).not.toMatch(
      /Demo sample|all qualifying actionable decisions|Full-time|Over 2\.5|\bEdge\b|\bWatch\b/,
    );
  });

  it("preserves the English History vocabulary", () => {
    const text = visibleText("en");

    expect(text).toContain("Demo sample · all qualifying actionable decisions");
    expect(text).toContain("Full-time goals");
    expect(text).toContain("Over 2.5");
    expect(text).toContain("Edge");
    expect(text).toContain("Watch");
    expect(text).toContain("Northbridge United");
  });
});
