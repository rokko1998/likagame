import type {
  AllocateEqualCandidate,
  ArrayTransformCandidate,
  ClearKind,
  DomainEventDraft,
  EffectRequest,
  GameCommand,
  GameState,
  HintLevel,
  ProgramThenRunCandidate,
  ReduceResult,
  ValidationResult
} from "@likagame/contracts";

export const TOKEN_IDS = ["pair_1", "pair_2", "pair_3", "pair_4", "pair_5", "pair_6"] as const;
export const ZONE_IDS = ["node_alpha", "node_beta", "node_gamma"] as const;
export const UNITS_PER_TOKEN = 2;
export const TARGET_UNITS_PER_ZONE = 4;

const hintOrder: HintLevel[] = ["none", "h0", "h1", "h2", "h3", "h4", "h5"];

export function createInitialGameState(runId = "run_local_demo"): GameState {
  return {
    schema_version: 1,
    revision: 0,
    run_id: runId,
    content_version: "0.7.0",
    pause_reasons: [],
    encounter: {
      instance_id: "encounter_instance_e01",
      definition_id: "encounter.wake_pik_equal_charge.v1",
      phase: "entering",
      candidate: {
        type: "allocate_equal",
        placements: TOKEN_IDS.map((token_id) => ({ token_id, zone_id: null }))
      },
      evaluated_commit_count: 0,
      first_clear_eligible: true,
      clear_kind: null,
      hint_level: "none",
      checkback_state: "available",
      last_validation: null,
      feedback_intent: null,
      applied_command_ids: []
    }
  };
}

export function unitsByZone(candidate: AllocateEqualCandidate): Record<(typeof ZONE_IDS)[number], number> {
  const counts: Record<(typeof ZONE_IDS)[number], number> = {
    node_alpha: 0,
    node_beta: 0,
    node_gamma: 0
  };

  for (const placement of candidate.placements) {
    if (placement.zone_id) counts[placement.zone_id] += UNITS_PER_TOKEN;
  }

  return counts;
}

export function validateAllocateEqual(candidate: AllocateEqualCandidate): ValidationResult {
  const hasUnplacedToken = candidate.placements.some((placement) => placement.zone_id === null);
  if (hasUnplacedToken) {
    return {
      math_status: "not_evaluable",
      scene_status: "unsatisfied",
      completion: "continue",
      error_class: "unplaced_tokens",
      mastery_evidence: "none",
      feedback_intent: "place_all_pairs",
      revealed_values: []
    };
  }

  const units = unitsByZone(candidate);
  const zoneValues = Object.values(units);
  const isCorrect = zoneValues.every((value) => value === TARGET_UNITS_PER_ZONE);
  if (isCorrect) {
    return {
      math_status: "correct",
      scene_status: "satisfied",
      completion: "success",
      error_class: null,
      mastery_evidence: "positive",
      feedback_intent: "equal_charge_complete",
      revealed_values: []
    };
  }

  return {
    math_status: "incorrect",
    scene_status: "unsatisfied",
    completion: "continue",
    error_class: "uneven_distribution",
    mastery_evidence: "negative",
    feedback_intent: "charge_is_uneven",
    revealed_values: []
  };
}

export function validateProgramThenRun(
  candidate: ProgramThenRunCandidate,
  requiredStepSize = 4,
  requiredRepeatCount = 3
): ValidationResult {
  const requiredTotal = requiredStepSize * requiredRepeatCount;
  const actualTotal = candidate.step_size * candidate.repeat_count;
  if (candidate.step_size === requiredStepSize && candidate.repeat_count === requiredRepeatCount) {
    return {
      math_status: "correct",
      scene_status: "satisfied",
      completion: "success",
      error_class: null,
      mastery_evidence: "positive",
      feedback_intent: "relay_program_complete",
      revealed_values: [actualTotal]
    };
  }
  if (actualTotal === requiredTotal) {
    return {
      math_status: "correct",
      scene_status: "equivalent_but_misaligned",
      completion: "continue",
      error_class: "misaligned_relays",
      mastery_evidence: "positive",
      feedback_intent: "correct_total_wrong_relay_rhythm",
      revealed_values: [actualTotal]
    };
  }
  const undershoot = actualTotal < requiredTotal;
  return {
    math_status: "incorrect",
    scene_status: "unsatisfied",
    completion: "continue",
    error_class: undershoot ? "undershoot" : "overshoot",
    mastery_evidence: "negative",
    feedback_intent: undershoot ? "relay_signal_undershoot" : "relay_signal_overshoot",
    revealed_values: [actualTotal]
  };
}

export function validateArrayTransform(
  candidate: ArrayTransformCandidate,
  requiredRows = 4,
  requiredColumns = 6
): ValidationResult {
  const requiredTotal = requiredRows * requiredColumns;
  const actualTotal = candidate.rows * candidate.columns;
  if (candidate.rows === requiredRows && candidate.columns === requiredColumns) {
    const aligned = (candidate.origin_row ?? 0) === 0 && (candidate.origin_column ?? 0) === 0;
    if (!aligned) {
      return {
        math_status: "correct",
        scene_status: "equivalent_but_misaligned",
        completion: "continue",
        error_class: "misplaced_array",
        mastery_evidence: "positive",
        feedback_intent: "correct_array_wrong_position",
        revealed_values: [actualTotal]
      };
    }
    return {
      math_status: "correct",
      scene_status: "satisfied",
      completion: "success",
      error_class: null,
      mastery_evidence: "positive",
      feedback_intent: "light_array_complete",
      revealed_values: [actualTotal]
    };
  }
  if (actualTotal === requiredTotal) {
    return {
      math_status: "correct",
      scene_status: "equivalent_but_misaligned",
      completion: "continue",
      error_class: "wrong_orientation",
      mastery_evidence: "positive",
      feedback_intent: "correct_total_wrong_orientation",
      revealed_values: [actualTotal]
    };
  }
  const tooFew = actualTotal < requiredTotal;
  return {
    math_status: "incorrect",
    scene_status: "unsatisfied",
    completion: "continue",
    error_class: tooFew ? "too_few_cells" : "too_many_cells",
    mastery_evidence: "negative",
    feedback_intent: tooFew ? "light_array_too_small" : "light_array_too_large",
    revealed_values: [actualTotal]
  };
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    pause_reasons: [...state.pause_reasons],
    encounter: {
      ...state.encounter,
      candidate: {
        ...state.encounter.candidate,
        placements: state.encounter.candidate.placements.map((placement) => ({ ...placement }))
      },
      applied_command_ids: [...state.encounter.applied_command_ids]
    }
  };
}

function event(event_name: DomainEventDraft["event_name"], payload: Record<string, unknown> = {}): DomainEventDraft {
  return { event_name, event_version: 1, payload };
}

function finalize(state: GameState, command: GameCommand, events: DomainEventDraft[], effects: EffectRequest[]): ReduceResult {
  state.revision += 1;
  state.encounter.applied_command_ids = [...state.encounter.applied_command_ids.slice(-31), command.client_command_id];
  return { state, domain_event_drafts: events, effects };
}

function clearKindForSuccess(state: GameState): ClearKind {
  if (state.encounter.hint_level === "h5") return "guided";
  if (["h1", "h2", "h3", "h4"].includes(state.encounter.hint_level)) return "assisted";
  if (state.encounter.checkback_state === "cancelled") return "self_corrected_after_checkback";
  if (state.encounter.first_clear_eligible && state.encounter.evaluated_commit_count === 1) return "first_commit";
  return "corrected_before_h1";
}

function applyEvaluation(state: GameState, validation: ValidationResult, events: DomainEventDraft[], effects: EffectRequest[]): void {
  state.encounter.evaluated_commit_count += 1;
  state.encounter.last_validation = validation;
  state.encounter.feedback_intent = validation.feedback_intent;
  events.push(
    event("commit_evaluated", {
      commit_index: state.encounter.evaluated_commit_count,
      math_status: validation.math_status,
      scene_status: validation.scene_status,
      error_class: validation.error_class
    })
  );

  if (validation.completion === "success") {
    state.encounter.phase = "resolving";
    state.encounter.clear_kind = clearKindForSuccess(state);
    events.push(event("encounter_succeeded", { clear_kind: state.encounter.clear_kind }));
    effects.push(
      { effect_type: "celebrate_success" },
      { effect_type: "haptic_feedback", style: "success" },
      { effect_type: "checkpoint_requested", reason: "encounter_succeeded" }
    );
    return;
  }

  state.encounter.phase = "feedback";
  state.encounter.first_clear_eligible = false;
  if (state.encounter.hint_level === "none") {
    state.encounter.hint_level = "h0";
    events.push(event("hint_level_changed", { hint_level: "h0", trigger: "incorrect_commit" }));
  }
  effects.push(
    { effect_type: "play_feedback", feedback_intent: validation.feedback_intent },
    { effect_type: "checkpoint_requested", reason: "commit_evaluated" }
  );
}

export function reduceGame(currentState: GameState, command: GameCommand): ReduceResult {
  if (currentState.encounter.applied_command_ids.includes(command.client_command_id)) {
    return { state: currentState, domain_event_drafts: [], effects: [] };
  }

  const state = cloneState(currentState);
  const events: DomainEventDraft[] = [];
  const effects: EffectRequest[] = [];

  switch (command.command_type) {
    case "encounter_presented": {
      if (state.encounter.phase !== "entering") return { state: currentState, domain_event_drafts: [], effects: [] };
      state.encounter.phase = "editing";
      events.push(event("encounter_presented", { definition_id: state.encounter.definition_id }));
      break;
    }

    case "token_moved": {
      if (!["editing", "feedback", "guided"].includes(state.encounter.phase)) {
        return { state: currentState, domain_event_drafts: [], effects: [] };
      }
      const placement = state.encounter.candidate.placements.find((item) => item.token_id === command.token_id);
      if (!placement) return { state: currentState, domain_event_drafts: [], effects: [] };
      placement.zone_id = command.zone_id;
      state.encounter.phase = state.encounter.hint_level === "h5" ? "guided" : "editing";
      state.encounter.last_validation = null;
      state.encounter.feedback_intent = null;
      events.push(event("candidate_changed", { token_id: command.token_id, zone_id: command.zone_id, input_source: command.input_source }));
      effects.push({ effect_type: "checkpoint_requested", reason: "candidate_changed" });
      break;
    }

    case "commit_requested": {
      if (!["editing", "feedback", "guided"].includes(state.encounter.phase)) {
        return { state: currentState, domain_event_drafts: [], effects: [] };
      }
      const validation = validateAllocateEqual(state.encounter.candidate);
      if (validation.math_status === "not_evaluable") {
        state.encounter.phase = "feedback";
        state.encounter.last_validation = validation;
        state.encounter.feedback_intent = validation.feedback_intent;
        effects.push({ effect_type: "play_feedback", feedback_intent: validation.feedback_intent });
        break;
      }
      if (validation.math_status === "incorrect" && state.encounter.checkback_state === "available") {
        state.encounter.phase = "precommit_check";
        state.encounter.checkback_state = "offered";
        state.encounter.first_clear_eligible = false;
        events.push(event("checkback_offered", { reason: "visibly_uneven_candidate" }));
        effects.push({ effect_type: "haptic_feedback", style: "light" });
        break;
      }
      applyEvaluation(state, validation, events, effects);
      break;
    }

    case "checkback_cancelled": {
      if (state.encounter.phase !== "precommit_check") return { state: currentState, domain_event_drafts: [], effects: [] };
      state.encounter.phase = "editing";
      state.encounter.checkback_state = "cancelled";
      events.push(event("checkback_resolved", { action: "returned_to_editing" }));
      effects.push({ effect_type: "checkpoint_requested", reason: "checkback_cancelled" });
      break;
    }

    case "checkback_confirmed": {
      if (state.encounter.phase !== "precommit_check") return { state: currentState, domain_event_drafts: [], effects: [] };
      state.encounter.checkback_state = "used";
      events.push(event("checkback_resolved", { action: "evaluate_candidate" }));
      applyEvaluation(state, validateAllocateEqual(state.encounter.candidate), events, effects);
      break;
    }

    case "hint_requested": {
      if (["resolving", "complete", "precommit_check"].includes(state.encounter.phase)) {
        return { state: currentState, domain_event_drafts: [], effects: [] };
      }
      const currentIndex = hintOrder.indexOf(state.encounter.hint_level);
      const nextIndex = currentIndex < 2 ? 2 : Math.min(currentIndex + 1, hintOrder.length - 1);
      const nextHint = hintOrder[nextIndex];
      state.encounter.hint_level = nextHint;
      state.encounter.first_clear_eligible = false;
      state.encounter.phase = nextHint === "h5" ? "guided" : "editing";
      state.encounter.feedback_intent = `hint_${nextHint}`;
      if (nextHint === "h5") {
        state.encounter.candidate.placements.forEach((placement, index) => {
          placement.zone_id = ZONE_IDS[Math.floor(index / 2)];
        });
      }
      events.push(event("hint_level_changed", { hint_level: nextHint, trigger: "child_requested" }));
      effects.push({ effect_type: "checkpoint_requested", reason: "hint_level_changed" });
      break;
    }

    case "resolution_completed": {
      if (state.encounter.phase !== "resolving") return { state: currentState, domain_event_drafts: [], effects: [] };
      state.encounter.phase = "complete";
      events.push(event("encounter_completed", { clear_kind: state.encounter.clear_kind }));
      effects.push({ effect_type: "checkpoint_requested", reason: "encounter_completed" });
      break;
    }

    case "pause_added": {
      if (!state.pause_reasons.includes(command.reason)) state.pause_reasons.push(command.reason);
      events.push(event("pause_changed", { pause_reasons: state.pause_reasons }));
      effects.push({ effect_type: "checkpoint_requested", reason: "host_paused" });
      break;
    }

    case "pause_removed": {
      state.pause_reasons = state.pause_reasons.filter((reason) => reason !== command.reason);
      events.push(event("pause_changed", { pause_reasons: state.pause_reasons }));
      break;
    }

    case "encounter_reset": {
      const fresh = createInitialGameState(state.run_id);
      fresh.revision = state.revision;
      fresh.encounter.applied_command_ids = [...state.encounter.applied_command_ids];
      Object.assign(state, fresh);
      state.encounter.phase = "editing";
      events.push(event("encounter_reset"));
      effects.push({ effect_type: "checkpoint_requested", reason: "encounter_reset" });
      break;
    }
  }

  return finalize(state, command, events, effects);
}
