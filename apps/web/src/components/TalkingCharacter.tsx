import type { DialogueLine } from "@likagame/contracts";

function speakerName(speaker: DialogueLine["speaker"]): string {
  if (speaker === "pik") return "Пик";
  if (speaker === "nima") return "Неизвестный сигнал";
  return "Система маяка";
}

export type TalkingCharacterProps = {
  speaker: DialogueLine["speaker"];
  speaking: boolean;
  powered?: boolean;
  onRepeat: () => void;
  className?: string;
};

export function TalkingCharacter({
  speaker,
  speaking,
  powered = false,
  onRepeat,
  className = ""
}: TalkingCharacterProps) {
  const label = `${speakerName(speaker)}: повторить последнюю реплику`;
  if (speaker === "system") {
    return (
      <button className={`talking-character talking-character--system ${speaking ? "is-speaking" : ""} ${className}`} type="button" onClick={onRepeat} aria-label={label} data-speaking={speaking ? "true" : "false"}>
        <img src="/assets/map/node-station-core.png" alt="" />
        <span className="voice-waves" aria-hidden="true"><i /><i /><i /></span>
      </button>
    );
  }
  if (speaker === "nima") {
    return (
      <button className={`talking-character talking-character--nima ${speaking ? "is-speaking" : ""} ${className}`} type="button" onClick={onRepeat} aria-label={label} data-speaking={speaking ? "true" : "false"}>
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
          <img
            className="pik-frame pik-frame--closed"
            src={!speaking && powered ? "/assets/characters/pik-powered-placeholder.png" : "/assets/characters/pik-idle-placeholder.png"}
            alt=""
          />
          <img className="pik-frame pik-frame--open" src="/assets/characters/pik-mouth-open.png" alt="" />
        </span>
      </span>
      <span className="voice-waves" aria-hidden="true"><i /><i /><i /></span>
    </button>
  );
}
