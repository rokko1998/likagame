import { describe, expect, it } from "vitest";
import {
  createInitialGameState,
  reduceGame,
  validateAllocateEqual,
  validateArrayTransform,
  validateProgramThenRun,
  ZONE_IDS
} from "../src/index";
import type { GameCommand, GameState } from "@likagame/contracts";

function command<T extends GameCommand>(value: T): T {
  return value;
}

function presentedState(): GameState {
  const initial = createInitialGameState("run_test");
  return reduceGame(initial, command({ command_type: "encounter_presented", client_command_id: "present" })).state;
}

function distribute(state: GameState, zones: Array<(typeof ZONE_IDS)[number]>): GameState {
  return zones.reduce(
    (next, zone_id, index) =>
      reduceGame(
        next,
        command({
          command_type: "token_moved",
          client_command_id: `move_${index}_${zone_id}`,
          token_id: `pair_${index + 1}`,
          zone_id,
          input_source: "touch"
        })
      ).state,
    state
  );
}

describe("equal distribution validator", () => {
  it("does not evaluate an unfinished board", () => {
    expect(validateAllocateEqual(createInitialGameState().encounter.candidate).math_status).toBe("not_evaluable");
  });

  it("accepts two pair tokens in each of three nodes", () => {
    const state = distribute(presentedState(), ["node_alpha", "node_alpha", "node_beta", "node_beta", "node_gamma", "node_gamma"]);
    expect(validateAllocateEqual(state.encounter.candidate)).toMatchObject({
      math_status: "correct",
      scene_status: "satisfied",
      completion: "success"
    });
  });

  it("distinguishes a full but uneven board", () => {
    const state = distribute(presentedState(), ["node_alpha", "node_alpha", "node_alpha", "node_beta", "node_beta", "node_gamma"]);
    expect(validateAllocateEqual(state.encounter.candidate)).toMatchObject({
      math_status: "incorrect",
      error_class: "uneven_distribution"
    });
  });
});

describe("deterministic game reducer", () => {
  it("completes a correct first commit exactly once", () => {
    const arranged = distribute(presentedState(), ["node_alpha", "node_alpha", "node_beta", "node_beta", "node_gamma", "node_gamma"]);
    const commit = command({ command_type: "commit_requested", client_command_id: "commit_1" });
    const result = reduceGame(arranged, commit);

    expect(result.state.encounter.phase).toBe("resolving");
    expect(result.state.encounter.clear_kind).toBe("first_commit");
    expect(result.state.encounter.evaluated_commit_count).toBe(1);
    expect(result.domain_event_drafts.map((item) => item.event_name)).toEqual(["commit_evaluated", "encounter_succeeded"]);

    const repeated = reduceGame(result.state, commit);
    expect(repeated.state).toBe(result.state);
    expect(repeated.domain_event_drafts).toEqual([]);
  });

  it("offers checkback before evaluating the first plausible mistake", () => {
    const arranged = distribute(presentedState(), ["node_alpha", "node_alpha", "node_alpha", "node_beta", "node_beta", "node_gamma"]);
    const result = reduceGame(arranged, command({ command_type: "commit_requested", client_command_id: "commit_wrong" }));

    expect(result.state.encounter.phase).toBe("precommit_check");
    expect(result.state.encounter.evaluated_commit_count).toBe(0);
    expect(result.state.encounter.first_clear_eligible).toBe(false);
    expect(result.domain_event_drafts[0]?.event_name).toBe("checkback_offered");
  });

  it("uses guided completion at H5", () => {
    let state = presentedState();
    for (let index = 1; index <= 5; index += 1) {
      state = reduceGame(state, command({ command_type: "hint_requested", client_command_id: `hint_${index}` })).state;
    }
    expect(state.encounter.hint_level).toBe("h5");
    expect(validateAllocateEqual(state.encounter.candidate).math_status).toBe("correct");

    const result = reduceGame(state, command({ command_type: "commit_requested", client_command_id: "guided_commit" }));
    expect(result.state.encounter.clear_kind).toBe("guided");
  });
});

describe("additional room validators", () => {
  it("separates relay distance from the required relay rhythm", () => {
    expect(validateProgramThenRun({ type: "program_then_run", step_size: 4, repeat_count: 3 })).toMatchObject({
      completion: "success",
      scene_status: "satisfied"
    });
    expect(validateProgramThenRun({ type: "program_then_run", step_size: 3, repeat_count: 4 })).toMatchObject({
      math_status: "correct",
      scene_status: "equivalent_but_misaligned",
      error_class: "misaligned_relays"
    });
    expect(validateProgramThenRun({ type: "program_then_run", step_size: 2, repeat_count: 3 }).error_class).toBe("undershoot");
    expect(validateProgramThenRun({ type: "program_then_run", step_size: 5, repeat_count: 3 }).error_class).toBe("overshoot");
  });

  it("requires the light array total and orientation", () => {
    expect(validateArrayTransform({ type: "array_transform", rows: 4, columns: 6 }).completion).toBe("success");
    expect(validateArrayTransform({ type: "array_transform", rows: 6, columns: 4 })).toMatchObject({
      math_status: "correct",
      scene_status: "equivalent_but_misaligned",
      error_class: "wrong_orientation"
    });
    expect(validateArrayTransform({ type: "array_transform", rows: 4, columns: 6, origin_row: 1, origin_column: 1 })).toMatchObject({
      math_status: "correct",
      scene_status: "equivalent_but_misaligned",
      error_class: "misplaced_array"
    });
    expect(validateArrayTransform({ type: "array_transform", rows: 3, columns: 5 }).error_class).toBe("too_few_cells");
    expect(validateArrayTransform({ type: "array_transform", rows: 5, columns: 6 }).error_class).toBe("too_many_cells");
  });
});
