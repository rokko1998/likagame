import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import { ArrowRight, Check, Lightbulb, RadioTower, Sparkles } from "lucide-react";
import type { DialogueLine, ValidationResult } from "@likagame/contracts";
import { validateArrayTransform, validateProgramThenRun } from "@likagame/game-core";
import { TalkingCharacter } from "../components/TalkingCharacter";
import type { GridRoomProgress, RelayRoomProgress } from "../lib/storage";

type LinePicker = (baseId: string, occurrence?: string | number) => DialogueLine;
type SoundName = "tap" | "success" | "error";

type SharedRoomProps = {
  speaking: boolean;
  getLine: LinePicker;
  onSpeak: (line: DialogueLine) => void;
  onSound: (name: SoundName) => void;
  onDragActive: (active: boolean) => void;
  onFinished: () => void;
};

const RELAY_DISTANCE = 12;
const RELAY_MIN_STEP = 2;
const RELAY_MAX_STEP = 6;
const RELAY_MAX_REPEATS = 5;
const GRID_ROWS = 6;
const GRID_COLUMNS = 7;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function repeatsForStep(stepSize: number): number {
  return Math.min(RELAY_MAX_REPEATS, Math.ceil(RELAY_DISTANCE / stepSize));
}

function relayFeedback(result: ValidationResult): string {
  if (result.completion === "success") return "Приёмник поймал все три импульса.";
  if (result.error_class === "misaligned_relays") {
    return "12 получилось — математика верна. Но прыжки прошли мимо трёх реле.";
  }
  if (result.error_class === "overshoot") return `Сигнал перелетел приёмник: ${result.revealed_values[0]} из 12.`;
  return `Сигнал остановился раньше приёмника: ${result.revealed_values[0]} из 12.`;
}

function outcomeClass(result: ValidationResult): string {
  if (result.completion === "success") return "room-result room-result--success";
  if (result.scene_status === "equivalent_but_misaligned") return "room-result room-result--misaligned";
  return "room-result";
}

export function RelayRoom({
  progress,
  speaking,
  getLine,
  onProgress,
  onSpeak,
  onSound,
  onDragActive,
  onFinished
}: SharedRoomProps & {
  progress: RelayRoomProgress;
  onProgress: (progress: RelayRoomProgress) => void;
}) {
  const initialLine = useMemo(
    () => getLine(progress.complete ? "line.e02.success" : "line.e02.instruction", progress.attempts),
    [getLine, progress.attempts, progress.complete]
  );
  const [activeLine, setActiveLine] = useState(initialLine);
  const [outcome, setOutcome] = useState<ValidationResult | null>(
    progress.complete ? validateProgramThenRun({ type: "program_then_run", step_size: 4, repeat_count: 3 }) : null
  );
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);
  const spokeOnMount = useRef(false);
  const distance = progress.step_size * progress.repeat_count;
  const shownDistance = running || outcome ? Math.min(13.2, distance) : 0;

  useEffect(() => {
    if (spokeOnMount.current || progress.complete) return;
    spokeOnMount.current = true;
    const timeout = window.setTimeout(() => onSpeak(initialLine), 220);
    return () => window.clearTimeout(timeout);
  }, [initialLine, onSpeak, progress.complete]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      onDragActive(false);
    },
    [onDragActive]
  );

  const setStepSize = (rawStep: number, playSound = false) => {
    const stepSize = clamp(rawStep, RELAY_MIN_STEP, RELAY_MAX_STEP);
    const repeatCount = repeatsForStep(stepSize);
    if (stepSize === progress.step_size && repeatCount === progress.repeat_count) return;
    setOutcome(null);
    onProgress({ ...progress, step_size: stepSize, repeat_count: repeatCount });
    if (playSound) onSound("tap");
  };

  const stepFromPointer = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return progress.step_size;
    const sector = Math.round(((clientX - rect.left) / rect.width) * RELAY_DISTANCE);
    return clamp(sector, RELAY_MIN_STEP, RELAY_MAX_STEP);
  };

  const beginStepDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (running || progress.complete || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    setDragging(true);
    onDragActive(true);
    setStepSize(stepFromPointer(event.clientX), true);
  };

  const moveStepDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    event.preventDefault();
    setStepSize(stepFromPointer(event.clientX));
  };

  const endStepDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    setStepSize(stepFromPointer(event.clientX));
    draggingRef.current = false;
    setDragging(false);
    onDragActive(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    onSound("tap");
  };

  const cancelStepDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    onDragActive(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleTrackKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (running || progress.complete) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setStepSize(progress.step_size + (event.key === "ArrowRight" ? 1 : -1), true);
  };

  const runProgram = () => {
    const attempt = progress.attempts + 1;
    const result = validateProgramThenRun({
      type: "program_then_run",
      step_size: progress.step_size,
      repeat_count: progress.repeat_count
    });
    setRunning(true);
    setOutcome(null);
    onProgress({ ...progress, attempts: attempt });
    onSound("tap");
    timerRef.current = window.setTimeout(() => {
      setRunning(false);
      setOutcome(result);
      const cue =
        result.completion === "success"
          ? "line.e02.success"
          : result.error_class === "overshoot"
            ? "line.e02.overshoot"
            : result.error_class === "misaligned_relays"
              ? "line.e02.misaligned"
              : "line.e02.undershoot";
      const line = getLine(cue, attempt);
      setActiveLine(line);
      onSpeak(line);
      onSound(
        result.completion === "success"
          ? "success"
          : result.scene_status === "equivalent_but_misaligned"
            ? "tap"
            : "error"
      );
      if (result.completion === "success") onProgress({ ...progress, attempts: attempt, complete: true });
    }, 1450);
  };

  const requestHint = () => {
    const nextLevel = Math.min(3, progress.hint_level + 1) as RelayRoomProgress["hint_level"];
    const cue = nextLevel === 1 ? "line.e02.h1" : nextLevel === 2 ? "line.e02.h2" : "line.e02.h5";
    const line = getLine(cue, nextLevel);
    setActiveLine(line);
    setOutcome(null);
    onSpeak(line);
    onSound("tap");
    onProgress({ ...progress, hint_level: nextLevel });
  };

  return (
    <main className="screen extra-room-screen relay-room-screen">
      <div className="encounter-heading">
        <div>
          <span className="eyebrow">Комната 2 · Грузовой модуль</span>
          <h1>Проведи сигнал через реле</h1>
        </div>
        <div className="mission-rule mission-rule--visual"><RadioTower size={18} /><span>Собери одинаковые прыжки до приёмника</span></div>
      </div>

      <section className={`relay-scene ${running ? "is-running" : ""} ${progress.complete ? "is-complete" : ""} ${dragging ? "is-dragging" : ""} ${progress.hint_level === 3 ? "shows-guide" : ""}`}>
        <img className="room-backdrop-planet" src="/assets/backgrounds/planet-purple.png" alt="" />
        <div className="scene-live-counter" aria-live="polite">
          <small>Схема сигнала</small>
          <strong><span data-testid="relay-repeat-count">{progress.repeat_count}</span> × <span data-testid="relay-step-size">{progress.step_size}</span> = {distance}</strong>
        </div>
        <div
          className="relay-track relay-track--interactive"
          ref={trackRef}
          role="slider"
          tabIndex={running || progress.complete ? -1 : 0}
          data-testid="relay-track"
          aria-label="Размер одного прыжка сигнала"
          aria-valuemin={RELAY_MIN_STEP}
          aria-valuemax={RELAY_MAX_STEP}
          aria-valuenow={progress.step_size}
          aria-valuetext={`${progress.step_size} секторов; ${progress.repeat_count} повторов; всего ${distance}`}
          onKeyDown={handleTrackKey}
          onPointerDown={beginStepDrag}
          onPointerMove={moveStepDrag}
          onPointerUp={endStepDrag}
          onPointerCancel={cancelStepDrag}
        >
          <span className="relay-source" aria-hidden="true"><RadioTower size={18} /><b>СТАРТ</b></span>
          {Array.from({ length: RELAY_DISTANCE }, (_, index) => (
            <i key={index} className={(index + 1) % 4 === 0 ? "relay-sector relay-sector--mark" : "relay-sector"}>
              <span>{index + 1}</span>
            </i>
          ))}
          <span className="relay-program-segments" aria-hidden="true">
            {Array.from({ length: progress.repeat_count }, (_, index) => {
              const start = index * progress.step_size;
              const end = start + progress.step_size;
              return (
                <i
                  key={`${progress.step_size}-${index}`}
                  className={end > RELAY_DISTANCE ? "is-over" : ""}
                  style={{ left: `${(start / RELAY_DISTANCE) * 100}%`, width: `${(progress.step_size / RELAY_DISTANCE) * 100}%` }}
                >
                  <b>{index + 1}</b>
                </i>
              );
            })}
          </span>
          <span className="relay-landings" aria-hidden="true">
            {Array.from({ length: progress.repeat_count }, (_, index) => {
              const endpoint = (index + 1) * progress.step_size;
              const aligned = endpoint === 4 || endpoint === 8 || endpoint === 12;
              return (
                <i
                  key={`${progress.step_size}-landing-${index}`}
                  className={`${aligned ? "is-aligned" : ""} ${endpoint > RELAY_DISTANCE ? "is-over" : ""}`}
                  style={{ left: `${(Math.min(endpoint, 13.2) / RELAY_DISTANCE) * 100}%` }}
                >
                  <b>{endpoint}</b>
                </i>
              );
            })}
          </span>
          {[4, 8, 12].map((mark, index) => (
            <span className="relay-node" style={{ left: `${(mark / RELAY_DISTANCE) * 100}%` }} key={mark}>
              <img src={`/assets/tokens/module-${index + 1}.png`} alt="" />
              <b>РЕЛЕ {index + 1}</b>
            </span>
          ))}
          <span className="relay-step-handle" style={{ left: `${(progress.step_size / RELAY_DISTANCE) * 100}%` }} aria-hidden="true">
            <i />
            <b>Тяни</b>
          </span>
          <span className="relay-pulse" style={{ left: `${(shownDistance / RELAY_DISTANCE) * 100}%` }}><RadioTower size={24} /></span>
        </div>
        <div className="direct-manipulation-hint relay-task-card">
          <strong>Настрой путь</strong>
          <span><b>1</b> Тяни большую голубую ручку</span>
          <span><b>2</b> Совмести голубые остановки с золотыми реле</span>
          <span><b>3</b> Запусти сигнал</span>
        </div>
        <div className="room-companion">
          <TalkingCharacter speaker="pik" powered speaking={speaking} onRepeat={() => onSpeak(activeLine)} className="room-pik" />
          <span><RadioTower size={17} /> Нажми на Пика, чтобы повторить</span>
        </div>
      </section>

      <section className="room-console room-console--readout">
        <div className="factor-readout" aria-label="Текущая программа сигнала">
          <div><small>Прыжков</small><strong>{progress.repeat_count}</strong></div>
          <i>×</i>
          <div><small>Секторов в прыжке</small><strong>{progress.step_size}</strong></div>
          <i>=</i>
          <div><small>Пройдёт</small><strong>{distance}</strong></div>
        </div>
        {outcome && (
          <p className={outcomeClass(outcome)} role="status">
            {outcome.completion === "success" ? <Check size={19} /> : outcome.scene_status === "equivalent_but_misaligned" ? <Sparkles size={19} /> : null}
            {relayFeedback(outcome)}
          </p>
        )}
        <div className="room-actions">
          <button className="secondary-button" type="button" disabled={running || speaking || progress.complete || progress.hint_level === 3} onClick={requestHint}>
            <Lightbulb size={20} /> {progress.hint_level === 0 ? "Дай подсказку" : "Ещё подсказка"}
          </button>
          {!progress.complete ? (
            <button className="primary-button" data-testid="relay-run" type="button" disabled={running || speaking} onClick={runProgram}>
              <RadioTower size={20} /> {running ? "Сигнал идёт…" : speaking ? "Слушаем Пика…" : "Запустить сигнал"}
            </button>
          ) : (
            <button className="primary-button" data-testid="relay-continue" type="button" disabled={speaking} onClick={onFinished}>
              {speaking ? "Пик ещё говорит…" : "К ядру маяка"} <ArrowRight size={21} />
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

type GridPoint = { row: number; column: number };

function arrayFeedback(result: ValidationResult): string {
  if (result.completion === "success") return "Решётка совпала с формой замка.";
  if (result.error_class === "misplaced_array") {
    return "Размер и количество верны. Теперь совмести голубую рамку с золотым контуром.";
  }
  if (result.error_class === "wrong_orientation") {
    return "24 огня — количество верное. Но прямоугольник повёрнут другой стороной.";
  }
  if (result.error_class === "too_many_cells") return `Рамка захватила слишком много света: ${result.revealed_values[0]} огней.`;
  return `В рамке пока не хватает света: ${result.revealed_values[0]} из 24 огней.`;
}

export function GridRoom({
  progress,
  speaking,
  getLine,
  onProgress,
  onSpeak,
  onSound,
  onDragActive,
  onFinished
}: SharedRoomProps & {
  progress: GridRoomProgress;
  onProgress: (progress: GridRoomProgress) => void;
}) {
  const initialLine = useMemo(
    () => getLine(progress.complete ? "line.e03.success" : "line.e03.instruction", progress.attempts),
    [getLine, progress.attempts, progress.complete]
  );
  const [activeLine, setActiveLine] = useState(initialLine);
  const [outcome, setOutcome] = useState<ValidationResult | null>(
    progress.complete ? validateArrayTransform({ type: "array_transform", rows: 4, columns: 6, origin_row: 0, origin_column: 0 }) : null
  );
  const [anchor, setAnchor] = useState<GridPoint>({
    row: clamp(progress.origin_row, 0, GRID_ROWS - 1),
    column: clamp(progress.origin_column, 0, GRID_COLUMNS - 1)
  });
  const [focus, setFocus] = useState<GridPoint>({
    row: clamp(progress.origin_row + progress.rows - 1, 0, GRID_ROWS - 1),
    column: clamp(progress.origin_column + progress.columns - 1, 0, GRID_COLUMNS - 1)
  });
  const [dragging, setDragging] = useState(false);
  const anchorRef = useRef(anchor);
  const focusRef = useRef(focus);
  const draggingRef = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);
  const timerRef = useRef<number | null>(null);
  const spokeOnMount = useRef(false);
  const cellCount = progress.rows * progress.columns;

  const bounds = useMemo(() => {
    const firstRow = Math.min(anchor.row, focus.row);
    const firstColumn = Math.min(anchor.column, focus.column);
    return {
      firstRow,
      firstColumn,
      lastRow: Math.max(anchor.row, focus.row),
      lastColumn: Math.max(anchor.column, focus.column)
    };
  }, [anchor, focus]);

  const selectionStyle: CSSProperties = {
    left: `${(bounds.firstColumn / GRID_COLUMNS) * 100}%`,
    top: `${(bounds.firstRow / GRID_ROWS) * 100}%`,
    width: `${((bounds.lastColumn - bounds.firstColumn + 1) / GRID_COLUMNS) * 100}%`,
    height: `${((bounds.lastRow - bounds.firstRow + 1) / GRID_ROWS) * 100}%`
  };

  useEffect(() => {
    if (spokeOnMount.current || progress.complete) return;
    spokeOnMount.current = true;
    const timeout = window.setTimeout(() => onSpeak(initialLine), 220);
    return () => window.clearTimeout(timeout);
  }, [initialLine, onSpeak, progress.complete]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      onDragActive(false);
    },
    [onDragActive]
  );

  const pointFromPointer = (clientX: number, clientY: number): GridPoint => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return focus;
    return {
      row: clamp(Math.floor(((clientY - rect.top) / rect.height) * GRID_ROWS), 0, GRID_ROWS - 1),
      column: clamp(Math.floor(((clientX - rect.left) / rect.width) * GRID_COLUMNS), 0, GRID_COLUMNS - 1)
    };
  };

  const applySelection = (nextAnchor: GridPoint, nextFocus: GridPoint) => {
    const previousAnchor = anchorRef.current;
    const previousFocus = focusRef.current;
    if (
      previousAnchor.row === nextAnchor.row &&
      previousAnchor.column === nextAnchor.column &&
      previousFocus.row === nextFocus.row &&
      previousFocus.column === nextFocus.column
    ) return;
    const rows = Math.abs(nextFocus.row - nextAnchor.row) + 1;
    const columns = Math.abs(nextFocus.column - nextAnchor.column) + 1;
    anchorRef.current = nextAnchor;
    focusRef.current = nextFocus;
    setAnchor(nextAnchor);
    setFocus(nextFocus);
    setOutcome(null);
    onProgress({ ...progress, rows, columns, origin_row: Math.min(nextAnchor.row, nextFocus.row), origin_column: Math.min(nextAnchor.column, nextFocus.column) });
  };

  const beginGridDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (running || progress.complete || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromPointer(event.clientX, event.clientY);
    draggingRef.current = true;
    setDragging(true);
    onDragActive(true);
    applySelection(point, point);
    onSound("tap");
  };

  const moveGridDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    event.preventDefault();
    applySelection(anchorRef.current, pointFromPointer(event.clientX, event.clientY));
  };

  const endGridDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    applySelection(anchorRef.current, pointFromPointer(event.clientX, event.clientY));
    draggingRef.current = false;
    setDragging(false);
    onDragActive(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    onSound("tap");
  };

  const cancelGridDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    onDragActive(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleGridKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (running || progress.complete) return;
    const next = { rows: progress.rows, columns: progress.columns };
    if (event.key === "ArrowRight") next.columns = clamp(next.columns + 1, 1, GRID_COLUMNS);
    else if (event.key === "ArrowLeft") next.columns = clamp(next.columns - 1, 1, GRID_COLUMNS);
    else if (event.key === "ArrowDown") next.rows = clamp(next.rows + 1, 1, GRID_ROWS);
    else if (event.key === "ArrowUp") next.rows = clamp(next.rows - 1, 1, GRID_ROWS);
    else return;
    event.preventDefault();
    const nextAnchor = { row: 0, column: 0 };
    const nextFocus = { row: next.rows - 1, column: next.columns - 1 };
    applySelection(nextAnchor, nextFocus);
    onSound("tap");
  };

  const runArray = () => {
    const attempt = progress.attempts + 1;
    const result = validateArrayTransform({
      type: "array_transform",
      rows: progress.rows,
      columns: progress.columns,
      origin_row: progress.origin_row,
      origin_column: progress.origin_column
    });
    setRunning(true);
    setOutcome(null);
    onProgress({ ...progress, attempts: attempt });
    onSound("tap");
    timerRef.current = window.setTimeout(() => {
      setRunning(false);
      setOutcome(result);
      const cue =
        result.completion === "success"
          ? "line.e03.success"
          : result.error_class === "misplaced_array"
            ? "line.e03.position"
          : result.error_class === "wrong_orientation"
            ? "line.e03.orientation"
            : result.error_class === "too_many_cells"
              ? "line.e03.too_many"
              : "line.e03.too_few";
      const line = getLine(cue, attempt);
      setActiveLine(line);
      onSpeak(line);
      onSound(
        result.completion === "success"
          ? "success"
          : result.scene_status === "equivalent_but_misaligned"
            ? "tap"
            : "error"
      );
      if (result.completion === "success") onProgress({ ...progress, attempts: attempt, complete: true });
    }, 1250);
  };

  const requestHint = () => {
    const nextLevel = Math.min(3, progress.hint_level + 1) as GridRoomProgress["hint_level"];
    const cue = nextLevel === 1 ? "line.e03.h1" : nextLevel === 2 ? "line.e03.h2" : "line.e03.h5";
    const line = getLine(cue, nextLevel);
    setActiveLine(line);
    setOutcome(null);
    onSpeak(line);
    onSound("tap");
    onProgress({ ...progress, hint_level: nextLevel });
  };

  const selected = (row: number, column: number): boolean =>
    row >= bounds.firstRow && row <= bounds.lastRow && column >= bounds.firstColumn && column <= bounds.lastColumn;

  return (
    <main className="screen extra-room-screen grid-room-screen">
      <div className="encounter-heading">
        <div>
          <span className="eyebrow">Комната 3 · Ядро маяка</span>
          <h1>Собери световую решётку</h1>
        </div>
        <div className="mission-rule mission-rule--visual"><Sparkles size={18} /><span>Растяни рамку по форме замка</span></div>
      </div>

      <section className={`grid-scene ${running ? "is-running" : ""} ${progress.complete ? "is-complete" : ""} ${dragging ? "is-dragging" : ""} ${progress.hint_level === 3 ? "shows-guide" : ""}`}>
        <img className="room-backdrop-planet" src="/assets/backgrounds/planet-verdant.png" alt="" />
        <div className="scene-live-counter" aria-live="polite">
          <small>Выделено света</small>
          <strong><span data-testid="grid-rows">{progress.rows}</span> × <span data-testid="grid-columns">{progress.columns}</span> = {cellCount}</strong>
        </div>
        <div className="grid-goal-legend" data-testid="grid-goal" aria-label="Форма замка: 4 ряда по 6 ламп, всего 24">
          <small>Золотой контур · форма замка</small>
          <strong>4 ряда × 6 ламп = 24</strong>
        </div>
        <div className="core-gate" aria-hidden="true">
          <i />
          <i />
          <span className="gate-blueprint">{Array.from({ length: 24 }, (_, index) => <b key={index} />)}</span>
        </div>
        <div
          className="light-grid light-grid--interactive"
          ref={gridRef}
          role="application"
          tabIndex={running || progress.complete ? -1 : 0}
          data-testid="light-grid"
          aria-label={`Выделено ${progress.rows} рядов, ${progress.columns} столбцов, ${cellCount} ламп`}
          onKeyDown={handleGridKey}
          onPointerDown={beginGridDrag}
          onPointerMove={moveGridDrag}
          onPointerUp={endGridDrag}
          onPointerCancel={cancelGridDrag}
        >
          {Array.from({ length: GRID_ROWS * GRID_COLUMNS }, (_, index) => {
            const row = Math.floor(index / GRID_COLUMNS);
            const column = index % GRID_COLUMNS;
            const classes = [row < 4 && column < 6 ? "is-target" : "", selected(row, column) ? "is-selected" : ""].filter(Boolean).join(" ");
            return <span key={index} className={classes} />;
          })}
          <i className="grid-target-box" aria-hidden="true"><b>ФОРМА ЗАМКА</b></i>
          <i className="grid-selection-box" style={selectionStyle} aria-hidden="true" />
        </div>
        <div className="direct-manipulation-hint grid-task-card"><span>↘</span> Зажми первую лампу и растяни голубую рамку по золотому контуру</div>
        <div className="room-companion">
          <TalkingCharacter speaker="pik" powered speaking={speaking} onRepeat={() => onSpeak(activeLine)} className="room-pik" />
          <span><Sparkles size={17} /> Нажми на Пика, чтобы повторить</span>
        </div>
      </section>

      <section className="room-console room-console--readout">
        <div className="factor-readout" aria-label="Размер выделенной решётки">
          <div><small>Рядов</small><strong>{progress.rows}</strong></div>
          <i>×</i>
          <div><small>Огней в ряду</small><strong>{progress.columns}</strong></div>
          <i>=</i>
          <div><small>Всего огней</small><strong>{cellCount}</strong></div>
        </div>
        {outcome && (
          <p className={outcomeClass(outcome)} role="status">
            {outcome.completion === "success" ? <Check size={19} /> : outcome.scene_status === "equivalent_but_misaligned" ? <Sparkles size={19} /> : null}
            {arrayFeedback(outcome)}
          </p>
        )}
        <div className="room-actions">
          <button className="secondary-button" type="button" disabled={running || speaking || progress.complete || progress.hint_level === 3} onClick={requestHint}>
            <Lightbulb size={20} /> {progress.hint_level === 0 ? "Дай подсказку" : "Ещё подсказка"}
          </button>
          {!progress.complete ? (
            <button className="primary-button" data-testid="grid-run" type="button" disabled={running || speaking} onClick={runArray}>
              <Sparkles size={20} /> {running ? "Проверяем свет…" : speaking ? "Слушаем Пика…" : "Включить решётку"}
            </button>
          ) : (
            <button className="primary-button" data-testid="grid-continue" type="button" disabled={speaking} onClick={onFinished}>
              {speaking ? "Пик ещё говорит…" : "Открыть маяк"} <ArrowRight size={21} />
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
