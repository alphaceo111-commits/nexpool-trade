import { describe, expect, test } from "vitest";
import {
  LIBRARY_TEMPLATES,
  SAFE_FALLBACKS,
  SCHEDULABLE_TEMPLATE_IDS,
  placeholdersIn,
  renderLibraryTemplate,
} from "./telegramLibrary";
import { PUBLISH_TEMPLATES, templateByKey } from "./publishing";

const ALLOWED_PLACEHOLDERS = new Set([
  "user_name",
  "verified_users",
  "mission_name",
  "challenge_name",
  "challenge_progress",
  "current_streak",
  "xp",
  "level",
  "referral_count",
  "rank",
  "period",
  "campaign_name",
  "app_link",
  "feature_name",
  "maintenance_window",
  "missions_completed",
  "challenges_completed",
  "achievements_unlocked",
  "first_place",
  "second_place",
  "third_place",
  "mining_sessions",
]);

describe("post library catalog", () => {
  test("contains 60 unique templates, 20 per destination", () => {
    expect(LIBRARY_TEMPLATES).toHaveLength(60);
    const ids = LIBRARY_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(60);
    for (const destination of ["channel", "group", "bot"] as const) {
      expect(
        LIBRARY_TEMPLATES.filter((t) => t.destination === destination),
      ).toHaveLength(20);
    }
  });

  test("every template declares only supported placeholders", () => {
    for (const template of LIBRARY_TEMPLATES) {
      for (const name of placeholdersIn(template.body)) {
        expect(ALLOWED_PLACEHOLDERS.has(name), `${template.id}: ${name}`).toBe(
          true,
        );
      }
    }
  });

  test("every template has a trigger and non-empty body", () => {
    for (const template of LIBRARY_TEMPLATES) {
      expect(template.trigger.trim().length).toBeGreaterThan(0);
      expect(template.body.trim().length).toBeGreaterThan(0);
    }
  });

  test("reports 15 schedulable templates and 36 blocked", () => {
    expect(SCHEDULABLE_TEMPLATE_IDS).toHaveLength(15);
    expect(
      LIBRARY_TEMPLATES.filter((template) => template.blockedBy),
    ).toHaveLength(36);
    expect(SCHEDULABLE_TEMPLATE_IDS).toContain("C10");
    expect(SCHEDULABLE_TEMPLATE_IDS).toContain("G16");
  });

  test("schedulable templates are unblocked and carry no dynamic data", () => {
    expect(SCHEDULABLE_TEMPLATE_IDS.length).toBeGreaterThan(0);
    for (const id of SCHEDULABLE_TEMPLATE_IDS) {
      const template = LIBRARY_TEMPLATES.find((row) => row.id === id);
      expect(template).toBeDefined();
      expect(template?.blockedBy).toBeUndefined();
      expect(template?.schedule).toBeDefined();
      const dynamic = placeholdersIn(template!.body).filter(
        (name) => name !== "app_link",
      );
      expect(dynamic, id).toEqual([]);
    }
  });
});

describe("renderLibraryTemplate", () => {
  test("renders a static template, replacing the app link", () => {
    const rendered = renderLibraryTemplate("C01", {});
    expect(rendered.text).toContain("WELCOME TO A NEW DAY");
    expect(rendered.text).toContain("https://t.me/NEXPOOLBOT");
    expect(rendered.text).not.toContain("{app_link}");
  });

  test("uses the safe name fallback when no name is supplied", () => {
    expect(SAFE_FALLBACKS.user_name).toBe("NEXPOOL miner");
    const rendered = renderLibraryTemplate("B01", {});
    expect(rendered.text).toContain("NEXPOOL miner");
  });

  test("strips markup from a user-supplied name", () => {
    const rendered = renderLibraryTemplate("B01", {
      user_name: "<b>Venom</b>",
    });
    expect(rendered.text).toContain("bVenom/b");
    expect(rendered.text).not.toContain("<b>");
  });

  test("refuses to publish when verified data is missing", () => {
    expect(() => renderLibraryTemplate("C05", {})).toThrow(
      /missing verified verified_users/,
    );
    expect(() => renderLibraryTemplate("C03", {})).toThrow(
      /missing verified mission_name/,
    );
    expect(() => renderLibraryTemplate("C06", { period: "weekly" })).toThrow(
      /first_place/,
    );
  });

  test("renders when all required verified values are present", () => {
    const rendered = renderLibraryTemplate("C05", { verified_users: 202 });
    expect(rendered.text).toContain("202 verified members");
  });

  test("streak posts use verified values and refuse guesses", () => {
    expect(renderLibraryTemplate("B11", { current_streak: 5 }).text).toContain(
      "5 qualifying days",
    );
    expect(renderLibraryTemplate("B12", { current_streak: 30 }).text).toContain(
      "30 qualifying days",
    );
    expect(() => renderLibraryTemplate("B11", {})).toThrow(/current_streak/);
  });

  test("rejects an unknown template id", () => {
    expect(() => renderLibraryTemplate("Z99", {})).toThrow(/Unknown post/);
  });
});

describe("automation engine integration", () => {
  test("every schedulable library post is a real automation template", () => {
    for (const id of SCHEDULABLE_TEMPLATE_IDS) {
      const key = `lib_${id.toLowerCase()}`;
      const template = templateByKey.get(key);
      expect(template, key).toBeDefined();
      expect(PUBLISH_TEMPLATES.some((row) => row.key === key)).toBe(true);
      const built = template!.build({} as never, 0);
      expect(built?.text.length).toBeGreaterThan(0);
      expect(built?.text).not.toContain("{");
    }
  });

  test("library automation keys do not collide with native templates", () => {
    const keys = PUBLISH_TEMPLATES.map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
