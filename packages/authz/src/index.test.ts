import { describe, expect, it } from "vitest";
import {
  hasPermission,
  permissionsForScope,
  principalFromRoleAssignments,
  type Principal,
} from "./index";

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

describe("principalFromRoleAssignments", () => {
  it("expande papéis sem deixar o escopo de campanha vazar", () => {
    const campaignPrincipal = principalFromRoleAssignments("user-1", [
      {
        roleName: "gm",
        scope: { kind: "campaign", campaignId: "campaign-a" },
      },
    ]);

    expect(
      permissionsForScope(campaignPrincipal, {
        kind: "campaign",
        campaignId: "campaign-a",
      }),
    ).toContain("mission:create");
    expect(
      permissionsForScope(campaignPrincipal, {
        kind: "campaign",
        campaignId: "campaign-b",
      }),
    ).not.toContain("mission:create");
  });

  it("limita a gestão de mundos ao owner, gerente e mestre da campanha", () => {
    const owner = principalFromRoleAssignments("owner", [
      { roleName: "owner", scope: { kind: "global" } },
    ]);
    const administrator = principalFromRoleAssignments("administrator", [
      { roleName: "administrator", scope: { kind: "global" } },
    ]);
    const manager = principalFromRoleAssignments("manager", [
      {
        roleName: "campaign_manager",
        scope: { kind: "campaign", campaignId: "campaign-a" },
      },
    ]);
    const gm = principalFromRoleAssignments("gm", [
      { roleName: "gm", scope: { kind: "campaign", campaignId: "campaign-a" } },
    ]);
    const player = principalFromRoleAssignments("player", [
      {
        roleName: "player",
        scope: { kind: "campaign", campaignId: "campaign-a" },
      },
    ]);
    const commonUser = principalFromRoleAssignments("common", []);

    expect(
      hasPermission(owner, "foundry:world:manage", {
        kind: "campaign",
        campaignId: "campaign-b",
      }),
    ).toBe(true);
    expect(
      hasPermission(administrator, "foundry:world:manage", {
        kind: "campaign",
        campaignId: "campaign-a",
      }),
    ).toBe(false);
    expect(
      hasPermission(manager, "foundry:world:manage", {
        kind: "campaign",
        campaignId: "campaign-a",
      }),
    ).toBe(true);
    expect(
      hasPermission(gm, "foundry:world:manage", {
        kind: "campaign",
        campaignId: "campaign-b",
      }),
    ).toBe(false);
    expect(
      hasPermission(player, "foundry:world:manage", {
        kind: "campaign",
        campaignId: "campaign-a",
      }),
    ).toBe(false);
    expect(
      hasPermission(commonUser, "foundry:world:manage", {
        kind: "campaign",
        campaignId: "campaign-a",
      }),
    ).toBe(false);
  });

  it("separa leitura e gestão de sessões por papel", () => {
    const manager = principalFromRoleAssignments("manager", [
      {
        roleName: "campaign_manager",
        scope: { kind: "campaign", campaignId: "campaign-a" },
      },
    ]);
    const editor = principalFromRoleAssignments("editor", [
      {
        roleName: "editor",
        scope: { kind: "campaign", campaignId: "campaign-a" },
      },
    ]);
    const player = principalFromRoleAssignments("player", [
      {
        roleName: "player",
        scope: { kind: "campaign", campaignId: "campaign-a" },
      },
    ]);

    expect(
      hasPermission(manager, "session:manage", {
        kind: "campaign",
        campaignId: "campaign-a",
      }),
    ).toBe(true);
    expect(
      hasPermission(editor, "session:read", {
        kind: "campaign",
        campaignId: "campaign-a",
      }),
    ).toBe(true);
    expect(
      hasPermission(editor, "session:manage", {
        kind: "campaign",
        campaignId: "campaign-a",
      }),
    ).toBe(false);
    expect(
      hasPermission(player, "session:read", {
        kind: "campaign",
        campaignId: "campaign-a",
      }),
    ).toBe(false);
  });

  it("separa a consulta do próprio personagem da gestão de vínculos", () => {
    const manager = principalFromRoleAssignments("manager", [
      {
        roleName: "campaign_manager",
        scope: { kind: "campaign", campaignId: "campaign-a" },
      },
    ]);
    const gm = principalFromRoleAssignments("gm", [
      { roleName: "gm", scope: { kind: "campaign", campaignId: "campaign-a" } },
    ]);
    const player = principalFromRoleAssignments("player", [
      {
        roleName: "player",
        scope: { kind: "campaign", campaignId: "campaign-a" },
      },
    ]);

    expect(
      hasPermission(manager, "character:link:manage", {
        kind: "campaign",
        campaignId: "campaign-a",
      }),
    ).toBe(true);
    expect(
      hasPermission(gm, "character:link:manage", {
        kind: "campaign",
        campaignId: "campaign-a",
      }),
    ).toBe(true);
    expect(
      hasPermission(player, "character:self:read", {
        kind: "campaign",
        campaignId: "campaign-a",
      }),
    ).toBe(true);
    expect(
      hasPermission(player, "character:link:manage", {
        kind: "campaign",
        campaignId: "campaign-a",
      }),
    ).toBe(false);
    expect(
      hasPermission(gm, "character:link:manage", {
        kind: "campaign",
        campaignId: "campaign-b",
      }),
    ).toBe(false);
  });
});
