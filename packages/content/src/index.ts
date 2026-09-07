import type { ContentBundle, DialogueLine } from "@likagame/contracts";
import bundleJson from "../fixtures/content-bundle.json";
import runPlanJson from "../fixtures/fixed-run-plan.json";

export const contentBundle = bundleJson as unknown as ContentBundle;
export const fixedRunPlan = runPlanJson;

const dialogueById = new Map(contentBundle.dialogue_catalog.map((line) => [line.id, line]));

export function dialogue(id: string): DialogueLine {
  const line = dialogueById.get(id);
  if (!line) throw new Error(`Unknown dialogue line: ${id}`);
  return line;
}

function dialogueBaseId(id: string): string {
  return id.replace(/\.v\d+$/, "");
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function dialogueVariant(baseId: string, seed: string): DialogueLine {
  const normalizedBaseId = dialogueBaseId(baseId);
  const variants = contentBundle.dialogue_catalog
    .filter((line) => dialogueBaseId(line.id) === normalizedBaseId)
    .sort((left, right) => left.id.localeCompare(right.id, "en"));
  if (variants.length === 0) throw new Error(`Unknown dialogue cue: ${baseId}`);
  return variants[stableHash(`${seed}:${normalizedBaseId}`) % variants.length]!;
}

export const hintDialogueIds = {
  h0: "line.e01.h0.v1",
  h1: "line.e01.h1.v1",
  h2: "line.e01.h2.v1",
  h3: "line.e01.h3.v1",
  h4: "line.e01.h4.v1",
  h5: "line.e01.h5.v1"
} as const;

export function lintContent(bundle: ContentBundle): string[] {
  const errors: string[] = [];
  const encounterIds = new Set(bundle.encounters.map((item) => item.id));
  const sceneIds = new Set(bundle.scenes.map((item) => item.id));
  const blockIds = new Set(bundle.adventure_blocks.map((item) => item.id));
  const dialogueIds = new Set(bundle.dialogue_catalog.map((item) => item.id));
  const duplicateDialogueIds = bundle.dialogue_catalog.filter((item, index) => bundle.dialogue_catalog.findIndex((candidate) => candidate.id === item.id) !== index);
  if (duplicateDialogueIds.length > 0) errors.push(`duplicate dialogue ids: ${duplicateDialogueIds.map((item) => item.id).join(", ")}`);

  for (const encounter of bundle.encounters) {
    if (!sceneIds.has(encounter.scene_ref)) errors.push(`${encounter.id}: missing scene ${encounter.scene_ref}`);
    for (const lineId of Object.values(encounter.dialogue_refs)) {
      if (!dialogueIds.has(lineId)) errors.push(`${encounter.id}: missing dialogue ${lineId}`);
    }
    if (encounter.controller.type === "allocate_equal") {
      if (encounter.validation.validator_id !== "equal_distribution.v1") errors.push(`${encounter.id}: validator/controller mismatch`);
      const availableUnits = encounter.controller.token_count * encounter.controller.units_per_token;
      const requiredUnits = encounter.controller.zone_count * encounter.controller.target_units_per_zone;
      if (availableUnits !== requiredUnits) errors.push(`${encounter.id}: no exact solution witness`);
    }
    if (encounter.controller.type === "program_then_run") {
      if (encounter.validation.validator_id !== "relay_program.v1") errors.push(`${encounter.id}: validator/controller mismatch`);
      const target = encounter.controller.target_state;
      if (target.step_size * target.repeat_count !== target.total_distance) errors.push(`${encounter.id}: invalid relay target witness`);
    }
    if (encounter.controller.type === "array_transform") {
      if (encounter.validation.validator_id !== "array_dimensions.v1") errors.push(`${encounter.id}: validator/controller mismatch`);
      const target = encounter.controller.target_state;
      if (target.rows * target.columns !== encounter.learning.problem.group_count * encounter.learning.problem.units_per_group) {
        errors.push(`${encounter.id}: invalid array target witness`);
      }
    }
  }

  for (const block of bundle.adventure_blocks) {
    if (!sceneIds.has(block.scene_ref)) errors.push(`${block.id}: missing scene ${block.scene_ref}`);
    if (block.encounter_ref && !encounterIds.has(block.encounter_ref)) {
      errors.push(`${block.id}: missing encounter ${block.encounter_ref}`);
    }
  }

  for (const recipe of bundle.adventure_recipes) {
    for (const blockRef of recipe.required_block_refs) {
      if (!blockIds.has(blockRef)) errors.push(`${recipe.id}: missing block ${blockRef}`);
    }
  }

  return errors;
}
