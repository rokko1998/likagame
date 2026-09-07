export type EncounterPhase =
  | "entering"
  | "presenting"
  | "editing"
  | "precommit_check"
  | "evaluating"
  | "feedback"
  | "guided"
  | "resolving"
  | "complete";

export type HintLevel = "none" | "h0" | "h1" | "h2" | "h3" | "h4" | "h5";

export type ClearKind =
  | "first_commit"
  | "self_corrected_after_checkback"
  | "corrected_before_h1"
  | "assisted"
  | "guided";

export type ValidationResult = {
  math_status: "not_evaluable" | "correct" | "incorrect";
  scene_status: "satisfied" | "unsatisfied" | "equivalent_but_misaligned";
  completion: "continue" | "success" | "guided_success";
  error_class:
    | "unplaced_tokens"
    | "uneven_distribution"
    | "too_few_units"
    | "too_many_units"
    | "undershoot"
    | "overshoot"
    | "misaligned_relays"
    | "too_few_cells"
    | "too_many_cells"
    | "misplaced_array"
    | "wrong_orientation"
    | null;
  mastery_evidence: "none" | "positive" | "negative" | "assisted";
  feedback_intent: string;
  revealed_values: number[];
};

export type TokenPlacement = {
  token_id: string;
  zone_id: "node_alpha" | "node_beta" | "node_gamma" | null;
};

export type AllocateEqualCandidate = {
  type: "allocate_equal";
  placements: TokenPlacement[];
};

export type ProgramThenRunCandidate = {
  type: "program_then_run";
  step_size: number;
  repeat_count: number;
};

export type ArrayTransformCandidate = {
  type: "array_transform";
  rows: number;
  columns: number;
  origin_row?: number;
  origin_column?: number;
};

export type EncounterCandidate = AllocateEqualCandidate | ProgramThenRunCandidate | ArrayTransformCandidate;

export type EncounterState = {
  instance_id: string;
  definition_id: string;
  phase: EncounterPhase;
  candidate: AllocateEqualCandidate;
  evaluated_commit_count: number;
  first_clear_eligible: boolean;
  clear_kind: ClearKind | null;
  hint_level: HintLevel;
  checkback_state: "available" | "offered" | "cancelled" | "used";
  last_validation: ValidationResult | null;
  feedback_intent: string | null;
  applied_command_ids: string[];
};

export type GameState = {
  schema_version: 1;
  revision: number;
  run_id: string;
  content_version: string;
  pause_reasons: string[];
  encounter: EncounterState;
};

type CommandBase = {
  client_command_id: string;
};

export type GameCommand =
  | (CommandBase & { command_type: "encounter_presented" })
  | (CommandBase & {
      command_type: "token_moved";
      token_id: string;
      zone_id: TokenPlacement["zone_id"];
      input_source: "touch" | "mouse" | "keyboard";
    })
  | (CommandBase & { command_type: "commit_requested" })
  | (CommandBase & { command_type: "checkback_cancelled" })
  | (CommandBase & { command_type: "checkback_confirmed" })
  | (CommandBase & { command_type: "hint_requested" })
  | (CommandBase & { command_type: "resolution_completed" })
  | (CommandBase & { command_type: "pause_added"; reason: string })
  | (CommandBase & { command_type: "pause_removed"; reason: string })
  | (CommandBase & { command_type: "encounter_reset" });

export type DomainEventDraft = {
  event_name:
    | "encounter_presented"
    | "candidate_changed"
    | "checkback_offered"
    | "checkback_resolved"
    | "commit_evaluated"
    | "hint_level_changed"
    | "encounter_succeeded"
    | "encounter_completed"
    | "pause_changed"
    | "encounter_reset";
  event_version: 1;
  payload: Record<string, unknown>;
};

export type EffectRequest =
  | { effect_type: "checkpoint_requested"; reason: string }
  | { effect_type: "play_feedback"; feedback_intent: string }
  | { effect_type: "celebrate_success" }
  | { effect_type: "haptic_feedback"; style: "light" | "success" };

export type ReduceResult = {
  state: GameState;
  domain_event_drafts: DomainEventDraft[];
  effects: EffectRequest[];
};

type EncounterDefinitionBase = {
  schema_version: 1;
  id: string;
  story_function: string;
  learning: {
    skill_id: string;
    problem: {
      type: "equal_groups";
      group_count: number;
      units_per_group: number;
      unknown: "group_size" | "total" | "factors";
    };
    representation: "concrete" | "representational" | "recall";
    counting_support: "full" | "partial" | "grouped_only" | "none";
    evidence_strength: "none" | "supported" | "independent" | "recall";
  };
  input: {
    semantic_actions: string[];
    direct_response: null;
  };
  attempt_policy: {
    commit_mode: "explicit";
    checkback_policy_id: string;
    hint_policy_id: string;
  };
  scene_ref: string;
  role_bindings: Record<string, string>;
  dialogue_refs: Record<string, string>;
};

export type AllocateEqualEncounterDefinition = EncounterDefinitionBase & {
  controller: {
    type: "allocate_equal";
    variant: string;
    token_count: number;
    units_per_token: number;
    zone_count: number;
    target_units_per_zone: number;
  };
  validation: {
    validator_id: "equal_distribution.v1";
    params: {
      zone_count: number;
      required_units_per_zone: number;
      require_all_tokens: boolean;
    };
  };
};

export type ProgramThenRunEncounterDefinition = EncounterDefinitionBase & {
  controller: {
    type: "program_then_run";
    variant: string;
    initial_state: { step_size: number; repeat_count: number };
    target_state: { step_size: number; repeat_count: number; total_distance: number };
    limits: { min_step_size: number; max_step_size: number; min_repeat_count: number; max_repeat_count: number };
  };
  validation: {
    validator_id: "relay_program.v1";
    params: { required_step_size: number; required_repeat_count: number; required_total_distance: number };
  };
};

export type ArrayTransformEncounterDefinition = EncounterDefinitionBase & {
  controller: {
    type: "array_transform";
    variant: string;
    initial_state: { rows: number; columns: number };
    target_state: { rows: number; columns: number };
    limits: { min_rows: number; max_rows: number; min_columns: number; max_columns: number };
  };
  validation: {
    validator_id: "array_dimensions.v1";
    params: {
      required_rows: number;
      required_columns: number;
      accept_commutative_total: boolean;
      require_scene_orientation_for_completion: boolean;
    };
  };
};

export type EncounterDefinition =
  | AllocateEqualEncounterDefinition
  | ProgramThenRunEncounterDefinition
  | ArrayTransformEncounterDefinition;

export type DialogueLine = {
  id: string;
  speaker: "pik" | "nima" | "system";
  text: string;
  audio_file: string;
  intent: string;
};

export type ContentBundle = {
  schema_version: 1;
  bundle_id: string;
  content_version: string;
  engine_compatibility: { min: string; max_exclusive: string };
  bundle_hash: string;
  themes: Array<{ id: string; title: string }>;
  scenes: Array<{ id: string; title: string; asset_ids: string[] }>;
  encounters: EncounterDefinition[];
  adventure_blocks: Array<{ id: string; block_kind: string; encounter_ref: string | null; scene_ref: string }>;
  adventure_recipes: Array<{ id: string; required_block_refs: string[] }>;
  dialogue_catalog: DialogueLine[];
  asset_manifests: Array<{
    id: string;
    license: string;
    source_url: string;
    files: string[];
  }>;
};
