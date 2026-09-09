import { describe, expect, it } from "vitest";
import {
  ensurePersonalRoster,
  isDefaultPersonalSpace,
  PERSONAL_TEAMMATES,
  type PersonalRosterBot,
  type PersonalRosterCreateInput,
} from "./personal-roster";

function fixture(seed: PersonalRosterBot[] = []) {
  const bots = [...seed];
  const creates: PersonalRosterCreateInput[] = [];

  return {
    bots,
    creates,
    api: {
      async list() {
        return [...bots];
      },
      async create(input: PersonalRosterCreateInput) {
        creates.push(input);
        const bot = {
          id: `bot-${bots.length + 1}`,
          name: input.name,
          spawnKey: input.spawnKey,
        };
        bots.push(bot);
        return { id: bot.id };
      },
    },
  };
}

describe("personal roster", () => {
  it("recognizes only the default space as the personal bootstrap target", () => {
    expect(
      isDefaultPersonalSpace({
        current: { id: "personal" },
        spaces: [
          { id: "personal", isDefault: true },
          { id: "project", isDefault: false },
        ],
      }),
    ).toBe(true);

    expect(
      isDefaultPersonalSpace({
        current: { id: "project" },
        spaces: [
          { id: "personal", isDefault: true },
          { id: "project", isDefault: false },
        ],
      }),
    ).toBe(false);
  });

  it("creates the three personal teammates on the shared Team Computer", async () => {
    const f = fixture([{ id: "chief", name: "Chief", spawnKey: "onboarding:first" }]);

    await ensurePersonalRoster(f.api);

    expect(f.creates.map((input) => input.spawnKey)).toEqual(
      PERSONAL_TEAMMATES.map((input) => input.spawnKey),
    );
    expect(f.creates.every((input) => input.computerMode === "team")).toBe(true);
    expect(f.bots.map((bot) => bot.name)).toEqual([
      "Chief",
      "Researcher",
      "Builder",
      "Operator",
    ]);
  });

  it("is idempotent when onboarding is retried", async () => {
    const f = fixture([{ id: "chief", name: "Chief", spawnKey: "onboarding:first" }]);

    await ensurePersonalRoster(f.api);
    await ensurePersonalRoster(f.api);

    expect(f.creates).toHaveLength(3);
    expect(new Set(f.bots.map((bot) => bot.spawnKey)).size).toBe(4);
  });

  it("keeps an existing personal teammate instead of replacing it", async () => {
    const f = fixture([
      { id: "chief", name: "Chief", spawnKey: "onboarding:first" },
      { id: "custom-researcher", name: "My Researcher", spawnKey: "personal:researcher" },
    ]);

    await ensurePersonalRoster(f.api);

    expect(f.creates.map((input) => input.spawnKey)).toEqual([
      "personal:builder",
      "personal:operator",
    ]);
    expect(f.bots.find((bot) => bot.spawnKey === "personal:researcher")?.name).toBe(
      "My Researcher",
    );
  });

  it("recovers when another onboarding tab wins a spawn-key race", async () => {
    const f = fixture([{ id: "chief", name: "Chief", spawnKey: "onboarding:first" }]);
    let first = true;
    const originalCreate = f.api.create;

    f.api.create = async (input) => {
      if (first) {
        first = false;
        f.bots.push({ id: "winner", name: input.name, spawnKey: input.spawnKey });
        throw new Error("unique constraint");
      }
      return originalCreate(input);
    };

    await ensurePersonalRoster(f.api);

    expect(f.bots.filter((bot) => bot.spawnKey === "personal:researcher")).toHaveLength(1);
    expect(f.bots.some((bot) => bot.spawnKey === "personal:builder")).toBe(true);
    expect(f.bots.some((bot) => bot.spawnKey === "personal:operator")).toBe(true);
  });
});
