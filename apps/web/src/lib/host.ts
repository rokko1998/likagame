export type HostKind = "telegram" | "browser" | "test";

export type HostContext = {
  kind: HostKind;
  color_scheme: "light" | "dark";
  viewport_height: number;
};

type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  colorScheme?: "light" | "dark";
  viewportHeight?: number;
  safeAreaInset?: { top?: number; right?: number; bottom?: number; left?: number };
  contentSafeAreaInset?: { top?: number; right?: number; bottom?: number; left?: number };
  HapticFeedback?: {
    impactOccurred?: (style: "light" | "medium" | "heavy") => void;
    notificationOccurred?: (type: "success" | "warning" | "error") => void;
  };
  onEvent?: (event: string, callback: () => void) => void;
  offEvent?: (event: string, callback: () => void) => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
    __LIKAGAME_TEST_HOST__?: boolean;
  }
}

export interface HostAdapter {
  readonly kind: HostKind;
  init(): Promise<HostContext>;
  setDragActive(active: boolean): void;
  haptic(style: "light" | "success"): void;
  subscribeActivity(callback: (active: boolean) => void): () => void;
}

function writeSafeArea(webApp?: TelegramWebApp): void {
  const insets = webApp?.contentSafeAreaInset ?? webApp?.safeAreaInset ?? {};
  const root = document.documentElement.style;
  root.setProperty("--host-safe-top", `${insets.top ?? 0}px`);
  root.setProperty("--host-safe-right", `${insets.right ?? 0}px`);
  root.setProperty("--host-safe-bottom", `${insets.bottom ?? 0}px`);
  root.setProperty("--host-safe-left", `${insets.left ?? 0}px`);
  root.setProperty("--host-stable-height", `${webApp?.viewportHeight ?? window.innerHeight}px`);
}

class BrowserHost implements HostAdapter {
  readonly kind: HostKind = window.__LIKAGAME_TEST_HOST__ ? "test" : "browser";

  async init(): Promise<HostContext> {
    writeSafeArea();
    return { kind: this.kind, color_scheme: "dark", viewport_height: window.innerHeight };
  }

  setDragActive(): void {}

  haptic(): void {
    if ("vibrate" in navigator) navigator.vibrate?.(10);
  }

  subscribeActivity(callback: (active: boolean) => void): () => void {
    const onVisibility = () => callback(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onVisibility);
    window.addEventListener("focus", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }
}

class TelegramHost implements HostAdapter {
  readonly kind: HostKind = "telegram";
  private readonly webApp: TelegramWebApp;

  constructor(webApp: TelegramWebApp) {
    this.webApp = webApp;
  }

  async init(): Promise<HostContext> {
    this.webApp.ready?.();
    this.webApp.expand?.();
    writeSafeArea(this.webApp);
    return {
      kind: this.kind,
      color_scheme: this.webApp.colorScheme ?? "dark",
      viewport_height: this.webApp.viewportHeight ?? window.innerHeight
    };
  }

  setDragActive(active: boolean): void {
    if (active) this.webApp.disableVerticalSwipes?.();
    else this.webApp.enableVerticalSwipes?.();
  }

  haptic(style: "light" | "success"): void {
    if (style === "success") this.webApp.HapticFeedback?.notificationOccurred?.("success");
    else this.webApp.HapticFeedback?.impactOccurred?.("light");
  }

  subscribeActivity(callback: (active: boolean) => void): () => void {
    const activated = () => callback(true);
    const deactivated = () => callback(false);
    const viewportChanged = () => writeSafeArea(this.webApp);
    this.webApp.onEvent?.("activated", activated);
    this.webApp.onEvent?.("deactivated", deactivated);
    this.webApp.onEvent?.("viewportChanged", viewportChanged);
    document.addEventListener("visibilitychange", () => callback(document.visibilityState === "visible"));
    return () => {
      this.webApp.offEvent?.("activated", activated);
      this.webApp.offEvent?.("deactivated", deactivated);
      this.webApp.offEvent?.("viewportChanged", viewportChanged);
      this.setDragActive(false);
    };
  }
}

export function createHostAdapter(): HostAdapter {
  const webApp = window.Telegram?.WebApp;
  return webApp ? new TelegramHost(webApp) : new BrowserHost();
}
