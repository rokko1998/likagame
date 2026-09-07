type SoundName = "tap" | "drop" | "success" | "error" | "open" | "close";

const soundFiles: Record<SoundName, string> = {
  tap: "/assets/audio/ui-tap.wav",
  drop: "/assets/audio/token-drop.wav",
  success: "/assets/audio/action-success.wav",
  error: "/assets/audio/action-error.wav",
  open: "/assets/audio/scene-open.wav",
  close: "/assets/audio/scene-close.wav"
};

export class AudioDirector {
  private unlocked = false;
  private muted = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private currentVoiceAudio: HTMLAudioElement | null = null;
  private currentOnEnd: (() => void) | null = null;
  private speechEndTimer: number | null = null;
  private speechToken = 0;

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

  async play(name: SoundName, volume = 0.35): Promise<void> {
    if (!this.unlocked || this.muted) return;
    try {
      const audio = new Audio(soundFiles[name]);
      audio.volume = volume;
      await audio.play();
    } catch {
      // Text and animation remain the authoritative feedback channel.
    }
  }

  speak(audioFile: string, text: string, onStart: () => void, onEnd: () => void): void {
    if (!this.unlocked || this.muted) return;
    this.stopSpeech();
    const token = ++this.speechToken;
    this.currentOnEnd = onEnd;
    onStart();

    const preparedVoice = new Audio(audioFile);
    this.currentVoiceAudio = preparedVoice;
    let fallbackStarted = false;
    let finished = false;
    const finish = () => {
      if (finished || token !== this.speechToken) return;
      finished = true;
      if (this.speechEndTimer !== null) window.clearTimeout(this.speechEndTimer);
      this.speechEndTimer = null;
      this.currentVoiceAudio = null;
      this.currentOnEnd = null;
      onEnd();
    };
    this.speechEndTimer = window.setTimeout(finish, Math.max(7_000, text.length * 90));
    const startFallback = () => {
      if (fallbackStarted || token !== this.speechToken) return;
      fallbackStarted = true;
      this.speakWithBrowserVoice(token, text, finish);
    };
    preparedVoice.addEventListener("ended", finish, { once: true });
    preparedVoice.addEventListener("error", startFallback, { once: true });
    void preparedVoice.play().catch(startFallback);
  }

  private speakWithBrowserVoice(token: number, text: string, finish: () => void): void {
    if (token !== this.speechToken) return;
    this.currentVoiceAudio?.pause();
    this.currentVoiceAudio = null;
    if (!("speechSynthesis" in window)) {
      globalThis.setTimeout(finish, Math.max(1100, text.length * 58));
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ru-RU";
    utterance.rate = 0.96;
    utterance.pitch = 1.08;
    this.currentUtterance = utterance;
    utterance.onend = () => {
      if (this.currentUtterance === utterance) {
        this.currentUtterance = null;
        finish();
      }
    };
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  }

  stopSpeech(): void {
    this.speechToken += 1;
    if (this.speechEndTimer !== null) window.clearTimeout(this.speechEndTimer);
    this.speechEndTimer = null;
    this.currentVoiceAudio?.pause();
    this.currentVoiceAudio = null;
    window.speechSynthesis?.cancel();
    this.currentUtterance = null;
    const onEnd = this.currentOnEnd;
    this.currentOnEnd = null;
    onEnd?.();
  }
}
