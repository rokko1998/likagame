type SoundName = "tap" | "drop" | "success" | "error" | "open" | "close";

const soundFiles: Record<SoundName, string> = {
  tap: "/assets/audio/ui-tap.wav",
  drop: "/assets/audio/token-drop.wav",
  success: "/assets/audio/action-success.wav",
  error: "/assets/audio/action-error.wav",
  open: "/assets/audio/scene-open.wav",
  close: "/assets/audio/scene-close.wav"
};

const VOICE_START_TIMEOUT_MS = 20_000;
const UNKNOWN_DURATION_TIMEOUT_MS = 120_000;
const MIN_VOICE_COMPLETION_TIMEOUT_MS = 60_000;
const VOICE_COMPLETION_GRACE_MS = 30_000;

type SpeechSession = {
  audio: HTMLAudioElement | null;
  utterance: SpeechSynthesisUtterance | null;
  onEnd: () => void;
  settled: boolean;
  fallbackStarted: boolean;
  startTimer: number | null;
  completionTimer: number | null;
  removeAudioListeners: (() => void) | null;
};

export class AudioDirector {
  private unlocked = false;
  private muted = false;
  private activeSpeech: SpeechSession | null = null;
  private readonly voiceTemplates = new Map<string, HTMLAudioElement>();

  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    void this.play("tap", 0.001);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.stopSpeech();
  }

  isMuted(): boolean {
    return this.muted;
  }

  preloadVoice(audioFile: string): void {
    if (!audioFile || this.voiceTemplates.has(audioFile)) return;
    try {
      const audio = new Audio();
      audio.preload = "auto";
      audio.src = audioFile;
      audio.load();
      this.voiceTemplates.set(audioFile, audio);
    } catch {
      // speak() retries with a fresh element or the browser voice fallback.
    }
  }

  preloadVoices(audioFiles: readonly string[]): void {
    for (const audioFile of new Set(audioFiles)) this.preloadVoice(audioFile);
  }

  async play(name: SoundName, volume = 0.35): Promise<void> {
    if (!this.unlocked || this.muted) return;
    try {
      const audio = new Audio(soundFiles[name]);
      audio.volume = volume;
      await audio.play();
    } catch {
      // Voice and animation remain the authoritative feedback channel.
    }
  }

  speak(audioFile: string, text: string, onStart: () => void, onEnd: () => void): void {
    if (!this.unlocked || this.muted) return;

    this.stopSpeech();
    const session: SpeechSession = {
      audio: null,
      utterance: null,
      onEnd,
      settled: false,
      fallbackStarted: false,
      startTimer: null,
      completionTimer: null,
      removeAudioListeners: null
    };
    this.activeSpeech = session;
    onStart();

    let preparedVoice: HTMLAudioElement;
    try {
      this.preloadVoice(audioFile);
      const template = this.voiceTemplates.get(audioFile);
      preparedVoice = template ? (template.cloneNode(true) as HTMLAudioElement) : new Audio(audioFile);
      preparedVoice.preload = "auto";
      if (!preparedVoice.src) preparedVoice.src = audioFile;
      session.audio = preparedVoice;
    } catch {
      this.startBrowserFallback(session, text);
      return;
    }

    const onPlaying = () => {
      if (!this.isActive(session)) return;
      this.clearStartTimer(session);
      this.armVoiceCompletionTimer(session);
    };
    const onLoadedMetadata = () => {
      if (this.isActive(session)) this.armVoiceCompletionTimer(session);
    };
    const onEnded = () => this.finishSession(session, false);
    const onError = () => this.startBrowserFallback(session, text);

    preparedVoice.addEventListener("playing", onPlaying);
    preparedVoice.addEventListener("loadedmetadata", onLoadedMetadata);
    preparedVoice.addEventListener("durationchange", onLoadedMetadata);
    preparedVoice.addEventListener("ended", onEnded, { once: true });
    preparedVoice.addEventListener("error", onError, { once: true });
    session.removeAudioListeners = () => {
      preparedVoice.removeEventListener("playing", onPlaying);
      preparedVoice.removeEventListener("loadedmetadata", onLoadedMetadata);
      preparedVoice.removeEventListener("durationchange", onLoadedMetadata);
      preparedVoice.removeEventListener("ended", onEnded);
      preparedVoice.removeEventListener("error", onError);
    };

    session.startTimer = window.setTimeout(
      () => this.startBrowserFallback(session, text),
      VOICE_START_TIMEOUT_MS
    );

    try {
      void preparedVoice.play()
        .then(() => {
          if (!this.isActive(session)) return;
          this.clearStartTimer(session);
          this.armVoiceCompletionTimer(session);
        })
        .catch(() => this.startBrowserFallback(session, text));
    } catch {
      this.startBrowserFallback(session, text);
    }
  }

  stopSpeech(): void {
    const session = this.activeSpeech;
    if (session) {
      this.finishSession(session, true);
      return;
    }
    this.getSpeechSynthesis()?.cancel();
  }

  private isActive(session: SpeechSession): boolean {
    return this.activeSpeech === session && !session.settled;
  }

  private armVoiceCompletionTimer(session: SpeechSession): void {
    if (!this.isActive(session) || !session.audio) return;
    this.clearCompletionTimer(session);

    const { duration, currentTime } = session.audio;
    const remainingMs = Number.isFinite(duration) && duration > 0
      ? Math.max(0, duration - currentTime) * 1000
      : UNKNOWN_DURATION_TIMEOUT_MS - VOICE_COMPLETION_GRACE_MS;
    const timeoutMs = Math.max(
      MIN_VOICE_COMPLETION_TIMEOUT_MS,
      Math.ceil(remainingMs) + VOICE_COMPLETION_GRACE_MS
    );

    session.completionTimer = window.setTimeout(() => {
      if (!this.isActive(session)) return;
      const audio = session.audio;
      if (audio?.ended || (Number.isFinite(audio?.duration) && (audio!.duration - audio!.currentTime) <= 0.25)) {
        this.finishSession(session, false);
      } else {
        this.finishSession(session, true);
      }
    }, timeoutMs);
  }

  private startBrowserFallback(session: SpeechSession, text: string): void {
    if (!this.isActive(session) || session.fallbackStarted) return;
    session.fallbackStarted = true;
    this.clearStartTimer(session);
    this.clearCompletionTimer(session);
    session.removeAudioListeners?.();
    session.removeAudioListeners = null;
    session.audio?.pause();
    session.audio = null;

    const synthesis = this.getSpeechSynthesis();
    if (!synthesis) {
      session.completionTimer = window.setTimeout(
        () => this.finishSession(session, false),
        Math.max(1_100, text.length * 58)
      );
      return;
    }

    synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ru-RU";
    utterance.rate = 0.96;
    utterance.pitch = 1.08;
    session.utterance = utterance;
    utterance.onend = () => this.finishSession(session, false);
    utterance.onerror = () => this.finishSession(session, true);
    session.completionTimer = window.setTimeout(
      () => this.finishSession(session, true),
      Math.max(30_000, text.length * 180 + 15_000)
    );
    synthesis.speak(utterance);
  }

  private finishSession(session: SpeechSession, stopMedia: boolean): void {
    if (!this.isActive(session)) return;
    session.settled = true;
    this.activeSpeech = null;
    this.clearStartTimer(session);
    this.clearCompletionTimer(session);
    session.removeAudioListeners?.();
    session.removeAudioListeners = null;

    const audio = session.audio;
    session.audio = null;
    if (stopMedia) audio?.pause();

    const utterance = session.utterance;
    session.utterance = null;
    if (utterance) {
      utterance.onend = null;
      utterance.onerror = null;
      if (stopMedia) this.getSpeechSynthesis()?.cancel();
    }
    session.onEnd();
  }

  private clearStartTimer(session: SpeechSession): void {
    if (session.startTimer !== null) window.clearTimeout(session.startTimer);
    session.startTimer = null;
  }

  private clearCompletionTimer(session: SpeechSession): void {
    if (session.completionTimer !== null) window.clearTimeout(session.completionTimer);
    session.completionTimer = null;
  }

  private getSpeechSynthesis(): SpeechSynthesis | null {
    return (window as Window & { speechSynthesis?: SpeechSynthesis }).speechSynthesis ?? null;
  }
}
