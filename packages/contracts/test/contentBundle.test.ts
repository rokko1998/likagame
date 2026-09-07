import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { contentBundle, fixedRunPlan, lintContent } from "@likagame/content";

const schemaDirectory = fileURLToPath(new URL("../schemas/", import.meta.url));
const encounterSchema = JSON.parse(readFileSync(`${schemaDirectory}encounter-definition.schema.json`, "utf8"));
const bundleSchema = JSON.parse(readFileSync(`${schemaDirectory}content-bundle.schema.json`, "utf8"));

describe("playable content fixture", () => {
  it("passes JSON Schema validation", () => {
    const ajv = new Ajv2020({ allErrors: true });
    ajv.addSchema(encounterSchema);
    const validate = ajv.compile(bundleSchema);
    const valid = validate(contentBundle);
    expect(validate.errors, JSON.stringify(validate.errors, null, 2)).toBeNull();
    expect(valid).toBe(true);
  });

  it("has no dangling references and an exact E01 solution", () => {
    expect(lintContent(contentBundle)).toEqual([]);
  });

  it("binds every spoken line to a packaged local voice file", () => {
    for (const line of contentBundle.dialogue_catalog) {
      expect(line.audio_file).toMatch(/^\/assets\/voice\/[a-z0-9-]+\.mp3$/);
      expect(existsSync(`apps/web/public${line.audio_file}`), `${line.id}: ${line.audio_file}`).toBe(true);
    }
  });

  it("materializes the fixed run in recipe order", () => {
    expect(fixedRunPlan.blocks).toEqual(contentBundle.adventure_recipes[0]?.required_block_refs);
  });
});
