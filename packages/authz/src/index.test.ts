import { describe, expect, it } from "vitest";
import { hasPermission, type Principal } from "./index";

const principal: Principal = {
  subjectId: "user-1",
  grants: [
    {
      permission: "mission:publish",
      scope: { kind: "campaign", campaignId: "campaign-a" },
    },
  ],
};

describe("hasPermission", () => {
  it("permite uma ação dentro da campanha concedida", () => {
    expect(
      hasPermission(principal, "mission:publish", {
        kind: "campaign",
        campaignId: "campaign-a",
      }),
    ).toBe(true);
  });

  it("não reaproveita a permissão em outra campanha", () => {
    expect(
      hasPermission(principal, "mission:publish", {
        kind: "campaign",
        campaignId: "campaign-b",
      }),
    ).toBe(false);
  });
});
