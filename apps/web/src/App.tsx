import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Download,
  Lightbulb,
  MousePointerClick,
  Play,
  Radio,
  RotateCcw,
  Settings,
  Sparkles,
  Volume2,
  VolumeX,
  X
} from "lucide-react";
import type { DialogueLine, DomainEventDraft, EffectRequest, GameCommand, GameState, TokenPlacement } from "@likagame/contracts";
import { contentBundle, dialogue, hintDialogueIds } from "@likagame/content";
import { createInitialGameState, reduceGame, unitsByZone, ZONE_IDS } from "@likagame/game-core";
import { AudioDirector } from "./lib/audio";
import { createHostAdapter, type HostAdapter, type HostKind } from "./lib/host";
import {
  appendTelemetry,
  clearDemoStorage,
  loadSnapshot,
  readTelemetry,
  saveSnapshot,
  type DemoSnapshot,
  type DemoStage
} from "./lib/storage";
import type { PhaserGameProps } from "./game/PhaserGame";

const PhaserGame = lazy(() => import("./game/PhaserGame"));

const storyLines = [dialogue("line.intro.signal.v1"), dialogue("line.pik.first_contact.v1")];
const zoneNames: Record<Exclude<TokenPlacement["zone_id"], null>, string> = {
  node_alpha: "узел Альфа",
  node_beta: "узел Бета",
  node_gamma: "узел Гамма"
};

let fallbackCommandCounter = 0;

function commandId(prefix: string): string {
  fallbackCommandCounter += 1;
  return `${prefix}_${globalThis.crypto?.randomUUID?.() ?? fallbackCommandCounter}`;
}

function speakerName(speaker: DialogueLine["speaker"]): string {
  if (speaker === "pik") return "Пик";
  if (speaker === "nima") return "Неизвестный сигнал";
  return "Система маяка";
}

function TalkingCharacter({
  speaker,
  speaking,
  powered = false,
  onRepeat,
  className = ""
}: {
  speaker: DialogueLine["speaker"];
  speaking: boolean;
  powered?: boolean;
  onRepeat: () => void;
  className?: string;
}) {
  const label = `${speakerName(speaker)}: повторить последнюю реплику`;
  if (speaker === "system") {
    return (
      <button className={`talking-character talking-character--system ${speaking ? "is-speaking" : ""} ${className}`} type="button" onClick={onRepeat} aria-label={label}>
        <img src="/assets/map/node-station-core.png" alt="" />
        <span className="voice-waves" aria-hidden="true"><i /><i /><i /></span>
      </button>
    );
  }
  if (speaker === "nima") {
    return (
      <button className={`talking-character talking-character--nima ${speaking ? "is-speaking" : ""} ${className}`} type="button" onClick={onRepeat} aria-label={label}>
        <span className="nima-layers" aria-hidden="true">
          <img src="/assets/characters/nima-trail-placeholder.png" alt="" />
          <img src="/assets/characters/nima-aura-placeholder.png" alt="" />
          <img src="/assets/characters/nima-core-placeholder.png" alt="" />
        </span>
        <span className="voice-waves" aria-hidden="true"><i /><i /><i /></span>
      </button>
    );
  }
  return (
    <button
      className={`talking-character talking-character--pik ${speaking ? "is-speaking" : ""} ${className}`}
      type="button"
      onClick={onRepeat}
      aria-label={label}
      data-speaking={speaking ? "true" : "false"}
    >
      <span className="pik-character-shell" aria-hidden="true">
        <img className="pik-pod" src="/assets/characters/pik-pod-placeholder.png" alt="" />
        <span className="pik-frames">
          <img className="pik-frame pik-frame--closed" src={powered ? "/assets/characters/pik-powered-placeholder.png" : "/assets/characters/pik-idle-placeholder.png"} alt="" />
          <img className="pik-frame pik-frame--open" src="/assets/characters/pik-mouth-open.png" alt="" />
        </span>
      </span>
      <span className="voice-waves" aria-hidden="true"><i /><i /><i /></span>
    </button>
  );
}

function AppHeader({
  hostKind,
  muted,
  onToggleMuted,
  onOpenSettings
}: {
  hostKind: HostKind;
  muted: boolean;
  onToggleMuted: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <header className="app-header">
      <div className="brand-lockup">
        <img src="/assets/map/node-station-core.png" alt="" />
        <div>
          <span className="eyebrow">Приключение 01</span>
          <strong>Маяк-7</strong>
        </div>
      </div>
      <div className="header-actions">
        <span className="host-pill">{hostKind === "telegram" ? "Telegram" : hostKind === "test" ? "Test host" : "Браузер"}</span>
        <button className="icon-button" type="button" onClick={onToggleMuted} aria-label={muted ? "Включить звук" : "Выключить звук"}>
          {muted ? <VolumeX size={21} /> : <Volume2 size={21} />}
        </button>
        <button className="icon-button" type="button" onClick={onOpenSettings} aria-label="Открыть настройки">
          <Settings size={21} />
        </button>
      </div>
    </header>
  );
}

type SettingsPanelProps = {
  open: boolean;
  hostKind: HostKind;
  saveStatus: string;
  onClose: () => void;
  onExport: () => void;
  onReset: () => void;
};

function SettingsPanel({ open, hostKind, saveStatus, onClose, onExport, onReset }: SettingsPanelProps) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="modal-heading">
          <div>
            <span className="eyebrow">Демо-инструменты</span>
            <h2 id="settings-title">Настройки запуска</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть настройки">
            <X size={22} />
          </button>
        </div>
        <dl className="settings-status">
          <div>
            <dt>Контейнер</dt>
            <dd>{hostKind === "telegram" ? "Telegram Mini App" : "Обычный браузер"}</dd>
          </div>
          <div>
            <dt>Сохранение</dt>
            <dd>{saveStatus}</dd>
          </div>
          <div>
            <dt>Контент</dt>
            <dd>v{contentBundle.content_version}</dd>
          </div>
        </dl>
        <p className="settings-note">Демо сохраняет только локальный прогресс и обезличенный журнал действий. Имена, текст и координаты касаний не записываются.</p>
        <button className="secondary-button full-width" type="button" onClick={onExport}>
          <Download size={20} /> Скачать журнал прохождения
        </button>
        <button className="danger-button full-width" type="button" onClick={onReset}>
          <RotateCcw size={20} /> Начать демо заново
        </button>
        <a className="license-link" href="https://kenney.nl/support" target="_blank" rel="noreferrer">
          Временная графика Kenney · CC0
        </a>
      </section>
    </div>
  );
}

function IntroScreen({ onBegin }: { onBegin: () => void }) {
  return (
    <main className="screen cartoon-intro-screen">
      <section className="intro-cartoon-scene">
        <img className="intro-planet" src="/assets/backgrounds/planet-cloud-blue.png" alt="" />
        <span className="signal-ring signal-ring--one" />
        <span className="signal-ring signal-ring--two" />
        <img className="intro-station" src="/assets/map/node-station-core.png" alt="" />
        <img className="intro-ship" src="/assets/map/node-player-ship.png" alt="" />
        <div className="intro-signal-burst" aria-hidden="true"><i /><i /><i /></div>
        <div className="intro-action">
          <span className="chapter-tag"><Radio size={16} /> Слабый сигнал с Маяка-7</span>
          <h1>Кто-то зовёт</h1>
          <button className="primary-button" type="button" onClick={onBegin}>
            Принять сигнал <ArrowRight size={22} />
          </button>
        </div>
      </section>
    </main>
  );
}

function MapScreen({ onEnter }: { onEnter: () => void }) {
  return (
    <main className="screen map-screen">
      <div className="screen-heading">
        <div>
          <span className="eyebrow">Маршрут этого забега</span>
          <h1>Облачное кольцо</h1>
        </div>
        <span className="route-counter">Комната 1 из 3</span>
      </div>
      <section className="adventure-map" aria-label="Карта приключения">
        <div className="map-route" aria-hidden="true" />
        <article className="map-node map-node--done">
          <img src="/assets/map/node-player-ship.png" alt="" />
          <span>Сигнал пойман</span>
        </article>
        <article className="map-node map-node--current">
          <span className="current-marker">Сейчас</span>
          <img src="/assets/map/node-station-core.png" alt="" />
          <strong>Диспетчерская</strong>
          <span>Разбудить Пика</span>
        </article>
        <article className="map-node map-node--locked">
          <img src="/assets/map/node-station-branch.png" alt="" />
          <strong>Грузовой модуль</strong>
          <span>Маршрут скрыт</span>
        </article>
        <article className="map-node map-node--locked">
          <img src="/assets/map/node-satellite.png" alt="" />
          <strong>Ядро маяка</strong>
          <span>Нет связи</span>
        </article>
      </section>
      <button className="primary-button map-action" type="button" onClick={onEnter}>
        Войти в диспетчерскую <ArrowRight size={22} />
      </button>
    </main>
  );
}

function StoryScreen({
  lineIndex,
  speakingSpeaker,
  onNext,
  onSpeak
}: {
  lineIndex: number;
  speakingSpeaker: DialogueLine["speaker"] | null;
  onNext: () => void;
  onSpeak: (line: DialogueLine) => void;
}) {
  const line = storyLines[Math.min(lineIndex, storyLines.length - 1)];

  useEffect(() => {
    const timeout = window.setTimeout(() => onSpeak(line), 220);
    return () => window.clearTimeout(timeout);
  }, [line, onSpeak]);

  return (
    <main className="screen cartoon-story-screen">
      <section className="cartoon-room">
        <img className="story-planet" src="/assets/backgrounds/planet-purple.png" alt="" />
        <img className="room-station-left" src="/assets/map/node-station-branch.png" alt="" />
        <img className="room-station-right" src="/assets/map/node-satellite.png" alt="" />
        <div className="cartoon-console" aria-hidden="true">
          <span className="console-scan" />
        </div>
        <TalkingCharacter
          speaker={line.speaker}
          speaking={speakingSpeaker === line.speaker}
          onRepeat={() => onSpeak(line)}
          className="story-character"
        />
        <div className={`sound-orbit ${speakingSpeaker === line.speaker ? "is-speaking" : ""}`} aria-hidden="true"><span /><span /><span /></div>
        <div className="tap-character-hint"><Volume2 size={18} /><span>Нажми на героя, чтобы он повторил</span></div>
      </section>
      <div className="story-controls">
        <div className="story-beat-dots" aria-label={`Реплика ${lineIndex + 1} из ${storyLines.length}`}>
          {storyLines.map((item, index) => <span key={item.id} className={index === lineIndex ? "active" : ""} />)}
        </div>
        <button className="primary-button cartoon-next" type="button" onClick={onNext}>
          {lineIndex < storyLines.length - 1 ? "Дальше" : "К задаче"} <ArrowRight size={22} />
        </button>
      </div>
    </main>
  );
}

function feedbackLine(state: GameState): DialogueLine {
  if (state.encounter.phase === "resolving" || state.encounter.phase === "complete") return dialogue("line.e01.success.v1");
  if (state.encounter.feedback_intent === "charge_is_uneven") return dialogue("line.e01.h0.v1");
  const hint = state.encounter.hint_level;
  if (hint !== "none") return dialogue(hintDialogueIds[hint]);
  return dialogue("line.e01.instruction.v1");
}

type EncounterScreenProps = {
  state: GameState;
  host: HostAdapter;
  audio: AudioDirector;
  speaking: boolean;
  onCommand: (command: GameCommand) => void;
  onSpeak: (line: DialogueLine) => void;
  onComplete: () => void;
};

function EncounterScreen({ state, host, audio, speaking, onCommand, onSpeak, onComplete }: EncounterScreenProps) {
  const [keyboardToken, setKeyboardToken] = useState<string | null>(null);
  const units = useMemo(() => unitsByZone(state.encounter.candidate), [state.encounter.candidate]);
  const allPlaced = state.encounter.candidate.placements.every((placement) => placement.zone_id !== null);
  const locked = ["precommit_check", "resolving", "complete"].includes(state.encounter.phase);
  const spokenLine = feedbackLine(state);
  const previousSpeechKey = useRef<string | null>(null);

  useEffect(() => {
    const speechKey = `${spokenLine.id}:${state.encounter.phase}:${state.encounter.hint_level}`;
    if (previousSpeechKey.current === speechKey) return;
    previousSpeechKey.current = speechKey;
    const timeout = window.setTimeout(() => onSpeak(spokenLine), 180);
    return () => window.clearTimeout(timeout);
  }, [onSpeak, spokenLine, state.encounter.hint_level, state.encounter.phase]);

  useEffect(() => {
    if (state.encounter.phase !== "resolving") return;
    const timeout = window.setTimeout(onComplete, 3100);
    return () => window.clearTimeout(timeout);
  }, [state.encounter.phase, onComplete]);

  const onMove: PhaserGameProps["onMove"] = useCallback(
    (tokenId, zoneId, inputSource) => {
      onCommand({
        command_type: "token_moved",
        client_command_id: commandId("move"),
        token_id: tokenId,
        zone_id: zoneId,
        input_source: inputSource
      });
    },
    [onCommand]
  );

  const moveKeyboardToken = (zoneId: TokenPlacement["zone_id"]) => {
    if (!keyboardToken) return;
    onMove(keyboardToken, zoneId, "keyboard");
    audio.play("drop");
    setKeyboardToken(null);
  };

  return (
    <main className="screen encounter-screen">
      <div className="encounter-heading">
        <div>
          <span className="eyebrow">Задача E01 · Запуск спутника</span>
          <h1>Заряди узлы поровну</h1>
        </div>
        <div className="mission-rule">
          <span>6 капсул</span>
          <i>→</i>
          <span>3 узла</span>
          <i>→</i>
          <strong>поровну</strong>
        </div>
      </div>

      <section className={`game-frame ${state.encounter.phase === "resolving" ? "game-frame--success" : ""}`}>
        <Suspense fallback={<div className="game-loading"><span />Загружаем диспетчерскую…</div>}>
          <PhaserGame
            placements={state.encounter.candidate.placements}
            hintLevel={state.encounter.hint_level}
            phase={state.encounter.phase}
            validation={state.encounter.last_validation}
            speaking={speaking}
            onMove={onMove}
            onDropSound={() => void audio.play("drop")}
            onDragActiveChange={(active) => host.setDragActive(active)}
            onCharacterTap={() => onSpeak(spokenLine)}
          />
        </Suspense>
        {state.encounter.phase === "resolving" && (
          <div className="success-flash" role="status">
            <Sparkles size={28} /> Три узла синхронизированы
          </div>
        )}
      </section>

      <div className="encounter-status" aria-label="Заряд узлов" aria-live="polite">
        {ZONE_IDS.map((zoneId, index) => (
          <span key={zoneId} className={units[zoneId] === 4 ? "equal" : units[zoneId] > 4 ? "over" : "under"}>
            <i>0{index + 1}</i> {units[zoneId]} из 4 {units[zoneId] === 4 ? <Check size={16} /> : null}
          </span>
        ))}
      </div>

      <div className="encounter-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={locked || state.encounter.hint_level === "h5"}
          onClick={() => onCommand({ command_type: "hint_requested", client_command_id: commandId("hint") })}
        >
          <Lightbulb size={21} />
          {state.encounter.hint_level === "none" || state.encounter.hint_level === "h0" ? "Дай подсказку" : "Ещё подсказка"}
        </button>
        <button
          className="primary-button launch-button"
          type="button"
          disabled={!allPlaced || locked}
          data-testid="commit-button"
          onClick={() => onCommand({ command_type: "commit_requested", client_command_id: commandId("commit") })}
        >
          <Play size={21} fill="currentColor" /> Запустить Пика
        </button>
      </div>

      <details className="accessible-controls">
        <summary><MousePointerClick size={18} /> Управлять кнопками вместо перетаскивания</summary>
        <div className="keyboard-control-grid">
          <div className="token-button-row" aria-label="Выбрать капсулу">
            {state.encounter.candidate.placements.map((placement, index) => (
              <button
                key={placement.token_id}
                type="button"
                className={keyboardToken === placement.token_id ? "selected" : ""}
                data-testid={`token-${index + 1}`}
                onClick={() => setKeyboardToken(placement.token_id)}
                disabled={locked}
              >
                <img src="/assets/tokens/energy-blue.png" alt="" />
                <span>Капсула {index + 1}</span>
                <small>{placement.zone_id ? zoneNames[placement.zone_id] : "в лотке"}</small>
              </button>
            ))}
          </div>
          <div className="zone-button-row" aria-label="Куда переместить">
            {ZONE_IDS.map((zoneId) => (
              <button key={zoneId} type="button" data-testid={`place-${zoneId}`} onClick={() => moveKeyboardToken(zoneId)} disabled={!keyboardToken || locked}>
                В {zoneNames[zoneId]}
              </button>
            ))}
            <button type="button" onClick={() => moveKeyboardToken(null)} disabled={!keyboardToken || locked}>Вернуть в лоток</button>
          </div>
        </div>
      </details>

      {state.encounter.phase === "precommit_check" && (
        <div className="modal-backdrop modal-backdrop--game">
          <section className="checkback-card" role="dialog" aria-modal="true" aria-labelledby="checkback-title">
            <span className="checkback-icon"><Lightbulb size={28} /></span>
            <span className="eyebrow">Быстрая самопроверка</span>
            <h2 id="checkback-title">Один узел светится сильнее другого.</h2>
            <p>Хочешь ещё раз посмотреть на раскладку перед запуском?</p>
            <div className="checkback-actions">
              <button className="secondary-button" type="button" onClick={() => onCommand({ command_type: "checkback_confirmed", client_command_id: commandId("checkback_launch") })}>
                Запустить так
              </button>
              <button className="primary-button" type="button" onClick={() => onCommand({ command_type: "checkback_cancelled", client_command_id: commandId("checkback_review") })}>
                Да, проверю
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function NumericSmokeScreen({
  draft,
  complete,
  onChange,
  onSubmit,
  onContinue,
  onSpeak,
  speaking
}: {
  draft: string;
  complete: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onContinue: () => void;
  onSpeak: (line: DialogueLine) => void;
  speaking: boolean;
}) {
  const [wasWrong, setWasWrong] = useState(false);
  const line = dialogue("line.input_smoke.v1");
  const spokeOnMount = useRef(false);

  useEffect(() => {
    if (spokeOnMount.current) return;
    spokeOnMount.current = true;
    const timeout = window.setTimeout(() => onSpeak(line), 180);
    return () => window.clearTimeout(timeout);
  }, [line, onSpeak]);

  const submit = () => {
    setWasWrong(draft !== "12");
    onSubmit();
  };
  return (
    <main className="screen numeric-screen">
      <section className="numeric-visual">
        <TalkingCharacter speaker="pik" powered speaking={speaking} onRepeat={() => onSpeak(line)} className="numeric-pik" />
        <div className="powered-nodes">
          {[1, 2, 3].map((number) => (
            <span key={number}><img src="/assets/tokens/energy-correct.png" alt="" /><b>4</b></span>
          ))}
        </div>
      </section>
      <section className="numeric-card">
        <div className="voice-only-prompt"><Volume2 size={19} /><span>Пик задал вопрос. Нажми на него, чтобы услышать ещё раз.</span></div>
        {!complete ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <label htmlFor="numeric-answer">Всего импульсов</label>
            <div className="numeric-input-row">
              <input
                id="numeric-answer"
                data-testid="numeric-answer"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={2}
                value={draft}
                onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 2))}
                autoFocus
                aria-describedby={wasWrong ? "numeric-feedback" : undefined}
              />
              <button className="primary-button" type="submit" disabled={!draft}>Проверить</button>
            </div>
            {wasWrong && <p id="numeric-feedback" className="input-feedback input-feedback--wrong">Панель не приняла число. Посчитай три группы по четыре.</p>}
          </form>
        ) : (
          <div className="numeric-success" role="status">
            <span><Check size={24} /></span>
            <div><strong>12 импульсов</strong><p>Числовая панель тоже работает.</p></div>
          </div>
        )}
        {complete && (
          <button className="primary-button full-width" type="button" onClick={onContinue}>
            Открыть канал связи <ArrowRight size={22} />
          </button>
        )}
      </section>
    </main>
  );
}

function EpilogueScreen({
  speaking,
  onReplay,
  onSpeak
}: {
  speaking: boolean;
  onReplay: () => void;
  onSpeak: (line: DialogueLine) => void;
}) {
  const line = dialogue("line.epilogue.v1");
  const spokeOnMount = useRef(false);

  useEffect(() => {
    if (spokeOnMount.current) return;
    spokeOnMount.current = true;
    const timeout = window.setTimeout(() => onSpeak(line), 300);
    return () => window.clearTimeout(timeout);
  }, [line, onSpeak]);

  return (
    <main className="screen epilogue-screen">
      <section className="epilogue-art">
        <img className="epilogue-planet" src="/assets/backgrounds/planet-verdant.png" alt="" />
        <TalkingCharacter speaker="nima" speaking={speaking} onRepeat={() => onSpeak(line)} className="epilogue-nima" />
        <img className="epilogue-pik" src="/assets/characters/pik-powered-placeholder.png" alt="" />
        <div className="tap-character-hint epilogue-repeat"><Volume2 size={18} /><span>Нажми на искру, чтобы повторить</span></div>
      </section>
      <section className="epilogue-copy">
        <span className="chapter-tag"><Sparkles size={16} /> Сигнал восстановлен</span>
        <h1>Первая комната пройдена</h1>
        <div className="demo-result">
          <span><Check size={18} /> Перетаскивание</span>
          <span><Check size={18} /> Проверка решения</span>
          <span><Check size={18} /> Сохранение</span>
        </div>
        <button className="secondary-button" type="button" onClick={onReplay}>
          <RotateCcw size={20} /> Пройти ещё раз
        </button>
      </section>
    </main>
  );
}

export default function App() {
  const hostRef = useRef<HostAdapter | null>(null);
  const audioRef = useRef(new AudioDirector());
  const gameStateRef = useRef<GameState>(createInitialGameState());
  const telemetrySequenceRef = useRef(0);
  const [booted, setBooted] = useState(false);
  const [hostKind, setHostKind] = useState<HostKind>("browser");
  const [stage, setStage] = useState<DemoStage>("intro");
  const [gameState, setGameState] = useState<GameState>(gameStateRef.current);
  const [storyLineIndex, setStoryLineIndex] = useState(0);
  const [numericDraft, setNumericDraft] = useState("");
  const [numericComplete, setNumericComplete] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speakingSpeaker, setSpeakingSpeaker] = useState<DialogueLine["speaker"] | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Подготовка…");
  const [restored, setRestored] = useState(false);

  const recordTelemetry = useCallback((eventName: string, payload: Record<string, unknown> = {}) => {
    telemetrySequenceRef.current += 1;
    void appendTelemetry({
      schema_version: 1,
      sequence: telemetrySequenceRef.current,
      event_name: eventName,
      occurred_at: new Date().toISOString(),
      run_id: gameStateRef.current.run_id,
      content_version: contentBundle.content_version,
      payload
    });
  }, []);

  const processEffects = useCallback((effects: EffectRequest[]) => {
    for (const effect of effects) {
      if (effect.effect_type === "play_feedback") void audioRef.current.play("error");
      if (effect.effect_type === "celebrate_success") void audioRef.current.play("success");
      if (effect.effect_type === "haptic_feedback") hostRef.current?.haptic(effect.style);
    }
  }, []);

  const dispatchGame = useCallback(
    (command: GameCommand) => {
      const result = reduceGame(gameStateRef.current, command);
      if (result.state === gameStateRef.current) return;
      gameStateRef.current = result.state;
      setGameState(result.state);
      for (const domainEvent of result.domain_event_drafts as DomainEventDraft[]) {
        recordTelemetry(domainEvent.event_name, domainEvent.payload);
      }
      processEffects(result.effects);
    },
    [processEffects, recordTelemetry]
  );

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    const boot = async () => {
      const host = createHostAdapter();
      hostRef.current = host;
      const [context, snapshot, telemetry] = await Promise.all([
        host.init(),
        loadSnapshot(contentBundle.content_version),
        readTelemetry()
      ]);
      if (cancelled) return;
      setHostKind(context.kind);
      telemetrySequenceRef.current = telemetry.reduce((max, item) => Math.max(max, item.sequence), 0);
      if (snapshot) {
        gameStateRef.current = snapshot.game_state;
        setGameState(snapshot.game_state);
        setStage(snapshot.stage);
        setStoryLineIndex(snapshot.story_line_index);
        setNumericDraft(snapshot.numeric_draft);
        setNumericComplete(snapshot.numeric_complete);
        setRestored(snapshot.stage !== "intro");
      }
      unsubscribe = host.subscribeActivity((active) => {
        dispatchGame({
          command_type: active ? "pause_removed" : "pause_added",
          client_command_id: commandId(active ? "resume" : "pause"),
          reason: "app_background"
        });
        if (!active) audioRef.current.stopSpeech();
      });
      setBooted(true);
    };
    void boot();
    return () => {
      cancelled = true;
      unsubscribe();
      hostRef.current?.setDragActive(false);
    };
  }, [dispatchGame]);

  useEffect(() => {
    if (!booted) return;
    const timeout = window.setTimeout(() => {
      const snapshot: DemoSnapshot = {
        schema_version: 1,
        content_version: contentBundle.content_version,
        saved_at: new Date().toISOString(),
        stage,
        game_state: gameState,
        story_line_index: storyLineIndex,
        numeric_draft: numericDraft,
        numeric_complete: numericComplete
      };
      void saveSnapshot(snapshot).then((kind) => setSaveStatus(kind === "indexed_db" ? "Сохранено на устройстве" : "Сохранено локально"));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [booted, gameState, numericComplete, numericDraft, stage, storyLineIndex]);

  useEffect(() => {
    if (stage === "encounter" && gameState.encounter.phase === "entering") {
      dispatchGame({ command_type: "encounter_presented", client_command_id: commandId("present") });
    }
  }, [dispatchGame, gameState.encounter.phase, stage]);

  const moveStage = useCallback(
    (nextStage: DemoStage) => {
      setStage(nextStage);
      recordTelemetry("screen_viewed", { screen_id: nextStage });
    },
    [recordTelemetry]
  );

  const completeEncounter = useCallback(() => {
    dispatchGame({ command_type: "resolution_completed", client_command_id: commandId("resolve") });
    moveStage("input_smoke");
  }, [dispatchGame, moveStage]);

  const resetDemo = useCallback(async () => {
    audioRef.current.stopSpeech();
    setSpeakingSpeaker(null);
    await clearDemoStorage();
    const fresh = createInitialGameState(`run_local_${Date.now().toString(36)}`);
    gameStateRef.current = fresh;
    setGameState(fresh);
    setStoryLineIndex(0);
    setNumericDraft("");
    setNumericComplete(false);
    setRestored(false);
    setSettingsOpen(false);
    setStage("intro");
    setSaveStatus("Новый запуск");
  }, []);

  const exportTelemetry = useCallback(async () => {
    const records = await readTelemetry();
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), records }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `likagame-trace-${gameStateRef.current.run_id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  const onSpeak = useCallback((line: DialogueLine) => {
    audioRef.current.unlock();
    audioRef.current.speak(
      line.audio_file,
      line.text,
      () => setSpeakingSpeaker(line.speaker),
      () => setSpeakingSpeaker(null)
    );
  }, []);

  if (!booted) {
    return (
      <div className="boot-screen" role="status">
        <img src="/assets/map/node-station-core.png" alt="" />
        <span className="boot-pulse" />
        <strong>Ищем сигнал Маяка-7…</strong>
      </div>
    );
  }

  const content = (() => {
    switch (stage) {
      case "intro":
        return (
          <IntroScreen
            onBegin={() => {
              audioRef.current.unlock();
              void audioRef.current.play("open");
              moveStage("map");
            }}
          />
        );
      case "map":
        return <MapScreen onEnter={() => { void audioRef.current.play("open"); moveStage("story"); }} />;
      case "story":
        return (
          <StoryScreen
            lineIndex={storyLineIndex}
            speakingSpeaker={speakingSpeaker}
            onSpeak={onSpeak}
            onNext={() => {
              void audioRef.current.play("tap");
              if (storyLineIndex < storyLines.length - 1) setStoryLineIndex((index) => index + 1);
              else moveStage("encounter");
            }}
          />
        );
      case "encounter":
        return (
          <EncounterScreen
            state={gameState}
            host={hostRef.current!}
            audio={audioRef.current}
            speaking={speakingSpeaker === "pik"}
            onCommand={dispatchGame}
            onSpeak={onSpeak}
            onComplete={completeEncounter}
          />
        );
      case "input_smoke":
        return (
          <NumericSmokeScreen
            draft={numericDraft}
            complete={numericComplete}
            onChange={(value) => {
              setNumericDraft(value);
              recordTelemetry("answer_changed", { field_id: "numeric_input_smoke", digit_count: value.length });
            }}
            onSubmit={() => {
              const correct = numericDraft === "12";
              recordTelemetry("answer_submit_requested", { field_id: "numeric_input_smoke", outcome: correct ? "accepted" : "rejected" });
              if (correct) {
                setNumericComplete(true);
                void audioRef.current.play("success");
                hostRef.current?.haptic("success");
              } else void audioRef.current.play("error");
            }}
            onContinue={() => moveStage("epilogue")}
            onSpeak={onSpeak}
            speaking={speakingSpeaker === "pik"}
          />
        );
      case "epilogue":
        return <EpilogueScreen speaking={speakingSpeaker === "nima"} onReplay={() => void resetDemo()} onSpeak={onSpeak} />;
    }
  })();

  return (
    <div className="app-shell" data-stage={stage}>
      <AppHeader
        hostKind={hostKind}
        muted={muted}
        onToggleMuted={() => {
          const next = !muted;
          setMuted(next);
          audioRef.current.setMuted(next);
          if (next) setSpeakingSpeaker(null);
        }}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      {restored && (
        <div className="resume-toast" role="status">
          <Check size={16} /> Прогресс восстановлен
          <button type="button" onClick={() => setRestored(false)} aria-label="Скрыть уведомление"><X size={15} /></button>
        </div>
      )}
      <div className="orientation-note"><span>↻</span> Для большой игровой сцены поверни телефон горизонтально</div>
      {content}
      <SettingsPanel
        open={settingsOpen}
        hostKind={hostKind}
        saveStatus={saveStatus}
        onClose={() => setSettingsOpen(false)}
        onExport={() => void exportTelemetry()}
        onReset={() => void resetDemo()}
      />
    </div>
  );
}
