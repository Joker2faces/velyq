import type { CustomerScenarioDto } from "@velyq/contracts";
import { createElement } from "react";

export function ScenarioStatus({
  scenario,
}: {
  scenario: CustomerScenarioDto;
}) {
  return createElement(
    "span",
    {
      className: "status synthetic",
      role: "status",
      "data-scenario-state": scenario.state,
    },
    scenario.label,
  );
}
