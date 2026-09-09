export interface PersonalRosterBot {
  id: string;
  name: string;
  spawnKey: string | null;
}

export interface PersonalRosterCreateInput {
  name: string;
  title: string;
  description: string;
  instructions: string;
  notifyOnFinish: boolean;
  computerMode: "team";
  spawnKey: string;
}

export interface PersonalRosterApi {
  list(): Promise<PersonalRosterBot[]>;
  create(input: PersonalRosterCreateInput): Promise<{ id: string }>;
}

export interface PersonalSpaceNavigation {
  current: { id: string };
  spaces: Array<{ id: string; isDefault: boolean }>;
}

export const PERSONAL_TEAMMATES: readonly PersonalRosterCreateInput[] = [
  {
    name: "Researcher",
    title: "Research & synthesis",
    description: "Investigates questions, compares sources, and turns findings into concise decisions.",
    instructions:
      "Research before guessing. Separate evidence from inference, preserve source context, and hand implementation work to a better-suited teammate when appropriate.",
    notifyOnFinish: true,
    computerMode: "team",
    spawnKey: "personal:researcher",
  },
  {
    name: "Builder",
    title: "Implementation engineer",
    description: "Turns approved plans into working code and verifies the result.",
    instructions:
      "Inspect the real project before editing. Keep changes bounded, run the strongest practical verification, and report blockers without fabricating success.",
    notifyOnFinish: true,
    computerMode: "team",
    spawnKey: "personal:builder",
  },
  {
    name: "Operator",
    title: "Browser & desktop operations",
    description: "Handles browser, desktop, files, and operational tasks on the shared computer.",
    instructions:
      "Prefer observable, reversible actions. Respect protected-action approvals and never claim an external action succeeded until the computer or tool confirms it.",
    notifyOnFinish: true,
    computerMode: "team",
    spawnKey: "personal:operator",
  },
] as const;

export function isDefaultPersonalSpace(navigation: PersonalSpaceNavigation): boolean {
  return navigation.spaces.some(
    (space) => space.id === navigation.current.id && space.isDefault,
  );
}

/**
 * Seed the optional personal roster without introducing a new orchestration layer.
 * Stable spawn keys make retries and concurrent onboarding tabs converge on one bot.
 */
export async function ensurePersonalRoster(api: PersonalRosterApi): Promise<void> {
  let existing = await api.list();

  for (const teammate of PERSONAL_TEAMMATES) {
    if (existing.some((bot) => bot.spawnKey === teammate.spawnKey)) continue;

    try {
      const created = await api.create(teammate);
      existing = [
        ...existing,
        { id: created.id, name: teammate.name, spawnKey: teammate.spawnKey },
      ];
    } catch (error) {
      // Match Rakazo's onboarding:first strategy: a concurrent tab may win
      // the unique (spaceId, spawnKey) insert after our initial list.
      existing = await api.list();
      if (existing.some((bot) => bot.spawnKey === teammate.spawnKey)) continue;
      throw error;
    }
  }
}
