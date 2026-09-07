import { useEffect, useRef } from "react";
import Phaser from "phaser";
import type { HintLevel, TokenPlacement, ValidationResult } from "@likagame/contracts";
import { TOKEN_IDS, unitsByZone, ZONE_IDS } from "@likagame/game-core";

type InputSource = "touch" | "mouse" | "keyboard";

export type PhaserGameProps = {
  placements: TokenPlacement[];
  hintLevel: HintLevel;
  phase: string;
  validation: ValidationResult | null;
  speaking: boolean;
  onMove: (tokenId: string, zoneId: TokenPlacement["zone_id"], inputSource: InputSource) => void;
  onDropSound: () => void;
  onDragActiveChange: (active: boolean) => void;
  onCharacterTap: () => void;
};

type SceneSnapshot = Pick<PhaserGameProps, "placements" | "hintLevel" | "phase" | "validation" | "speaking">;

const GAME_WIDTH = 1200;
const GAME_HEIGHT = 675;
const zoneCenters = {
  node_alpha: { x: 300, y: 300 },
  node_beta: { x: 600, y: 300 },
  node_gamma: { x: 900, y: 300 }
} as const;

type SceneCallbacks = Pick<PhaserGameProps, "onMove" | "onDropSound" | "onDragActiveChange" | "onCharacterTap">;

class BeaconScene extends Phaser.Scene {
  private callbacks: SceneCallbacks;
  private snapshot: SceneSnapshot;
  private tokenContainers = new Map<string, Phaser.GameObjects.Container>();
  private tokenImages = new Map<string, Phaser.GameObjects.Image>();
  private tokenRings = new Map<string, Phaser.GameObjects.Arc>();
  private zoneGraphics = new Map<(typeof ZONE_IDS)[number], Phaser.GameObjects.Graphics>();
  private zoneLabels = new Map<(typeof ZONE_IDS)[number], Phaser.GameObjects.Text>();
  private selectedToken: string | null = null;
  private draggingToken: string | null = null;
  private dragMoved = false;
  private tray!: Phaser.GameObjects.Rectangle;
  private pikPod!: Phaser.GameObjects.Image;
  private pik!: Phaser.GameObjects.Image;
  private voiceWave!: Phaser.GameObjects.Text;
  private talkTimer: Phaser.Time.TimerEvent | null = null;
  private mouthOpen = false;

  constructor(callbacks: SceneCallbacks, snapshot: SceneSnapshot) {
    super({ key: "beacon-control-room" });
    this.callbacks = callbacks;
    this.snapshot = snapshot;
  }

  preload(): void {
    this.load.image("space", "/assets/backgrounds/space-dark-purple-tile.png");
    this.load.image("planet", "/assets/backgrounds/planet-cloud-blue.png");
    this.load.image("station", "/assets/map/node-station-core.png");
    this.load.image("pik-pod", "/assets/characters/pik-pod-placeholder.png");
    this.load.image("pik-off", "/assets/characters/pik-off-placeholder.png");
    this.load.image("pik-idle", "/assets/characters/pik-idle-placeholder.png");
    this.load.image("pik-powered", "/assets/characters/pik-powered-placeholder.png");
    this.load.image("pik-talking", "/assets/characters/pik-mouth-open.png");
    this.load.image("energy", "/assets/tokens/energy-blue.png");
    this.load.image("energy-active", "/assets/tokens/energy-active.png");
    this.load.image("energy-correct", "/assets/tokens/energy-correct.png");
    this.load.image("sparkle-1", "/assets/fx/sparkle-1.png");
    this.load.image("sparkle-2", "/assets/fx/sparkle-2.png");
  }

  create(): void {
    this.input.dragDistanceThreshold = 10;
    this.add.tileSprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, "space").setTint(0x6f6c97);
    this.add.image(1080, 105, "planet").setDisplaySize(260, 260).setAlpha(0.2);
    this.add.image(600, 62, "station").setDisplaySize(92, 92).setAlpha(0.5);

    this.add
      .text(600, 44, "ДИСПЕТЧЕРСКАЯ · СЕКТОР 01", {
        fontFamily: "Arial, sans-serif",
        fontSize: "16px",
        color: "#a9c9e9",
        letterSpacing: 3
      })
      .setOrigin(0.5, 0.5);

    this.pikPod = this.add.image(112, 120, "pik-pod").setDisplaySize(116, 136).setAlpha(0.96).setInteractive({ useHandCursor: true });
    this.pik = this.add.image(112, 82, "pik-off").setDisplaySize(70, 70).setAlpha(0.99);
    this.pikPod.on("pointerup", () => this.callbacks.onCharacterTap());
    this.tweens.add({
      targets: [this.pikPod, this.pik],
      y: "-=6",
      duration: 1250,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1
    });
    this.voiceWave = this.add
      .text(180, 84, ")))", {
        fontFamily: "Arial, sans-serif",
        fontSize: "24px",
        fontStyle: "bold",
        color: "#7ee8ff"
      })
      .setAlpha(0);
    this.add
      .text(112, 199, "ПИК · OFFLINE", {
        fontFamily: "Arial, sans-serif",
        fontSize: "16px",
        color: "#8194ad"
      })
      .setName("pik-status")
      .setOrigin(0.5);

    for (const [index, zoneId] of ZONE_IDS.entries()) this.createZone(zoneId, index + 1);

    this.tray = this.add
      .rectangle(600, 570, 850, 132, 0x071426, 0.86)
      .setStrokeStyle(2, 0x3b6685, 0.72)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(600, 505, "КАПСУЛЫ · ПО 2 ИМПУЛЬСА", {
        fontFamily: "Arial, sans-serif",
        fontSize: "15px",
        color: "#90b8d3",
        letterSpacing: 2
      })
      .setOrigin(0.5);

    TOKEN_IDS.forEach((tokenId, index) => this.createToken(tokenId, index));

    this.tray.on("pointerup", () => {
      if (!this.selectedToken || this.dragMoved) return;
      this.callbacks.onMove(this.selectedToken, null, "mouse");
      this.callbacks.onDropSound();
      this.selectedToken = null;
    });

    this.input.on("dragstart", (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Container) => {
      if (this.snapshot.phase === "resolving" || this.snapshot.phase === "complete") return;
      this.draggingToken = gameObject.name;
      this.dragMoved = false;
      this.selectedToken = gameObject.name;
      gameObject.setDepth(20);
      gameObject.setScale(1.1);
      this.callbacks.onDragActiveChange(true);
      this.syncVisuals();
    });

    this.input.on(
      "drag",
      (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Container, dragX: number, dragY: number) => {
        if (!this.draggingToken || this.snapshot.phase === "resolving" || this.snapshot.phase === "complete") return;
        this.dragMoved = true;
        gameObject.setPosition(
          Phaser.Math.Clamp(dragX, 48, GAME_WIDTH - 48),
          Phaser.Math.Clamp(dragY, 74, GAME_HEIGHT - 44)
        );
      }
    );

    this.input.on("dragend", (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Container) => {
      if (!this.draggingToken) return;
      const zoneId = this.closestZone(gameObject.x, gameObject.y);
      const inputSource: InputSource = pointer.wasTouch ? "touch" : "mouse";
      this.callbacks.onMove(gameObject.name, zoneId, inputSource);
      this.callbacks.onDropSound();
      this.callbacks.onDragActiveChange(false);
      this.draggingToken = null;
      this.selectedToken = null;
      gameObject.setScale(1).setDepth(5);
    });

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.talkTimer?.remove(false);
      this.talkTimer = null;
      this.callbacks.onDragActiveChange(false);
    });
    this.syncVisuals();
  }

  private createZone(zoneId: (typeof ZONE_IDS)[number], number: number): void {
    const center = zoneCenters[zoneId];
    const graphics = this.add.graphics().setDepth(1);
    const hitArea = new Phaser.Geom.Circle(center.x, center.y, 122);
    graphics.setInteractive(hitArea, Phaser.Geom.Circle.Contains);
    graphics.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (!this.selectedToken || this.dragMoved) return;
      const inputSource: InputSource = pointer.wasTouch ? "touch" : "mouse";
      this.callbacks.onMove(this.selectedToken, zoneId, inputSource);
      this.callbacks.onDropSound();
      this.selectedToken = null;
    });
    this.zoneGraphics.set(zoneId, graphics);

    this.add
      .text(center.x, center.y - 150, `ЗАГРУЗОЧНЫЙ УЗЕЛ 0${number}`, {
        fontFamily: "Arial, sans-serif",
        fontSize: "15px",
        color: "#b6cee3",
        letterSpacing: 1
      })
      .setOrigin(0.5);
    const label = this.add
      .text(center.x, center.y + 151, "0 / 4", {
        fontFamily: "Arial, sans-serif",
        fontSize: "24px",
        fontStyle: "bold",
        color: "#88a8be"
      })
      .setOrigin(0.5);
    this.zoneLabels.set(zoneId, label);
  }

  private createToken(tokenId: string, index: number): void {
    const ring = this.add.circle(0, 0, 43, 0x16334f, 0.85).setStrokeStyle(2, 0x5ebee6, 0.75);
    const image = this.add.image(0, -4, "energy").setDisplaySize(44, 43);
    const label = this.add
      .text(0, 26, "×2", {
        fontFamily: "Arial, sans-serif",
        fontSize: "16px",
        fontStyle: "bold",
        color: "#d9f5ff"
      })
      .setOrigin(0.5);
    const container = this.add.container(300 + index * 120, 575, [ring, image, label]);
    container.name = tokenId;
    container.setSize(88, 88).setInteractive({ useHandCursor: true, draggable: true }).setDepth(5);
    container.on("pointerdown", () => {
      if (this.snapshot.phase === "resolving" || this.snapshot.phase === "complete") return;
      this.dragMoved = false;
      this.selectedToken = this.selectedToken === tokenId ? null : tokenId;
      this.syncVisuals();
    });
    this.input.setDraggable(container);
    this.tokenContainers.set(tokenId, container);
    this.tokenImages.set(tokenId, image);
    this.tokenRings.set(tokenId, ring);
  }

  private closestZone(x: number, y: number): TokenPlacement["zone_id"] {
    let closest: TokenPlacement["zone_id"] = null;
    let closestDistance = 148;
    for (const zoneId of ZONE_IDS) {
      const center = zoneCenters[zoneId];
      const distance = Phaser.Math.Distance.Between(x, y, center.x, center.y);
      if (distance < closestDistance) {
        closest = zoneId;
        closestDistance = distance;
      }
    }
    return closest;
  }

  updateSnapshot(snapshot: SceneSnapshot): void {
    this.snapshot = snapshot;
    this.syncVisuals();
  }

  cancelGesture(): void {
    this.callbacks.onDragActiveChange(false);
    this.draggingToken = null;
    this.dragMoved = false;
    this.syncVisuals();
  }

  private syncVisuals(): void {
    if (!this.tray || !this.pik || !this.pikPod) return;
    const candidate = { type: "allocate_equal" as const, placements: this.snapshot.placements };
    const units = unitsByZone(candidate);
    const locked = this.snapshot.phase === "resolving" || this.snapshot.phase === "complete";
    const success = this.snapshot.validation?.completion === "success" || locked;

    const placedByZone = new Map<string, string[]>();
    for (const zoneId of ZONE_IDS) placedByZone.set(zoneId, []);
    const trayTokens: string[] = [];
    for (const placement of this.snapshot.placements) {
      if (placement.zone_id) placedByZone.get(placement.zone_id)?.push(placement.token_id);
      else trayTokens.push(placement.token_id);
    }

    for (const zoneId of ZONE_IDS) {
      const center = zoneCenters[zoneId];
      const charge = units[zoneId];
      const equal = charge === 4;
      const over = charge > 4;
      const fill = success ? 0x2fd6aa : over ? 0xff708d : equal ? 0x2e89ad : 0x132c48;
      const stroke = success ? 0xb7ffe7 : over ? 0xffb1c0 : equal ? 0x76dff5 : 0x436b8b;
      const graphics = this.zoneGraphics.get(zoneId);
      graphics?.clear();
      graphics?.fillStyle(fill, success ? 0.45 : 0.32).fillCircle(center.x, center.y, 116);
      graphics?.lineStyle(success ? 5 : 3, stroke, 0.95).strokeCircle(center.x, center.y, 116);
      if (["h3", "h4", "h5"].includes(this.snapshot.hintLevel)) {
        graphics?.lineStyle(2, 0xf7d674, 0.45).strokeCircle(center.x - 42, center.y, 35);
        graphics?.lineStyle(2, 0xf7d674, 0.45).strokeCircle(center.x + 42, center.y, 35);
      }
      const label = this.zoneLabels.get(zoneId);
      label?.setText(`${charge} / 4`);
      label?.setColor(success ? "#b7ffe7" : over ? "#ffb1c0" : equal ? "#96ecff" : "#88a8be");

      const tokens = placedByZone.get(zoneId) ?? [];
      const positions = tokens.length === 1 ? [0] : tokens.length === 2 ? [-43, 43] : tokens.map((_, index) => (index - (tokens.length - 1) / 2) * 62);
      tokens.forEach((tokenId, index) => {
        if (tokenId === this.draggingToken) return;
        this.tokenContainers.get(tokenId)?.setPosition(center.x + positions[index], center.y).setDepth(5).setScale(1);
      });
    }

    const trayStart = 600 - ((Math.max(trayTokens.length, 1) - 1) * 110) / 2;
    trayTokens.forEach((tokenId, index) => {
      if (tokenId === this.draggingToken) return;
      this.tokenContainers.get(tokenId)?.setPosition(trayStart + index * 110, 575).setDepth(5).setScale(1);
    });

    for (const tokenId of TOKEN_IDS) {
      const image = this.tokenImages.get(tokenId);
      image?.setTexture(success ? "energy-correct" : this.selectedToken === tokenId ? "energy-active" : "energy");
      this.tokenRings.get(tokenId)?.setStrokeStyle(this.selectedToken === tokenId ? 5 : 2, this.selectedToken === tokenId ? 0xf7d674 : 0x5ebee6, 0.95);
      const container = this.tokenContainers.get(tokenId);
      if (container) {
        if (locked) container.disableInteractive();
        else if (!container.input) container.setInteractive({ useHandCursor: true, draggable: true });
      }
    }

    const pikStatus = this.children.getByName("pik-status") as Phaser.GameObjects.Text | null;
    if (success) {
      pikStatus?.setText("ПИК · ONLINE").setColor("#9fffdc");
      if (!this.children.getByName("success-sparkles")) {
        const particles = this.add.container(112, 112).setName("success-sparkles");
        for (let index = 0; index < 8; index += 1) {
          const sparkle = this.add.image(0, 0, index % 2 ? "sparkle-1" : "sparkle-2").setScale(0.8);
          particles.add(sparkle);
          const angle = (Math.PI * 2 * index) / 8;
          this.tweens.add({
            targets: sparkle,
            x: Math.cos(angle) * 78,
            y: Math.sin(angle) * 78,
            alpha: { from: 1, to: 0 },
            duration: 1050,
            delay: index * 45,
            ease: "Cubic.easeOut",
            repeat: -1,
            repeatDelay: 600
          });
        }
      }
    } else {
      pikStatus?.setText(this.snapshot.phase === "feedback" ? "ПИК · SIGNAL LOW" : "ПИК · OFFLINE");
    }
    this.updateTalkingAnimation();
  }

  private updateTalkingAnimation(): void {
    if (this.snapshot.speaking && !this.talkTimer) {
      this.talkTimer = this.time.addEvent({
        delay: 165,
        loop: true,
        callback: () => {
          this.mouthOpen = !this.mouthOpen;
          this.renderPikFrame();
        }
      });
    }
    if (!this.snapshot.speaking && this.talkTimer) {
      this.talkTimer.remove(false);
      this.talkTimer = null;
      this.mouthOpen = false;
    }
    this.renderPikFrame();
  }

  private renderPikFrame(): void {
    const success = this.snapshot.validation?.completion === "success" || this.snapshot.phase === "resolving" || this.snapshot.phase === "complete";
    const closedTexture = success ? "pik-powered" : this.snapshot.phase === "feedback" ? "pik-idle" : "pik-off";
    this.pik.setTexture(this.snapshot.speaking && this.mouthOpen ? "pik-talking" : closedTexture);
    this.voiceWave.setAlpha(this.snapshot.speaking ? (this.mouthOpen ? 1 : 0.45) : 0);
    const faceSize = this.snapshot.speaking && this.mouthOpen ? 73 : 70;
    this.pik.setDisplaySize(faceSize, faceSize);
    this.pikPod.setScale(this.snapshot.speaking && this.mouthOpen ? 0.97 : 0.94);
  }
}

export default function PhaserGame(props: PhaserGameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BeaconScene | null>(null);
  const callbackRef = useRef(props);
  callbackRef.current = props;

  useEffect(() => {
    if (!containerRef.current) return;
    const scene = new BeaconScene(
      {
        onMove: (...args) => callbackRef.current.onMove(...args),
        onDropSound: () => callbackRef.current.onDropSound(),
        onDragActiveChange: (active) => callbackRef.current.onDragActiveChange(active),
        onCharacterTap: () => callbackRef.current.onCharacterTap()
      },
      {
        placements: props.placements,
        hintLevel: props.hintLevel,
        phase: props.phase,
        validation: props.validation,
        speaking: props.speaking
      }
    );
    sceneRef.current = scene;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      transparent: true,
      backgroundColor: "#09172b",
      input: { activePointers: 2 },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: GAME_WIDTH,
        height: GAME_HEIGHT
      },
      render: { antialias: true, roundPixels: true },
      scene: [scene]
    });

    const canvas = game.canvas;
    const cancel = () => scene.cancelGesture();
    canvas.addEventListener("pointercancel", cancel);
    window.addEventListener("resize", cancel);
    window.addEventListener("blur", cancel);
    return () => {
      canvas.removeEventListener("pointercancel", cancel);
      window.removeEventListener("resize", cancel);
      window.removeEventListener("blur", cancel);
      callbackRef.current.onDragActiveChange(false);
      game.destroy(true);
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.updateSnapshot({
      placements: props.placements,
      hintLevel: props.hintLevel,
      phase: props.phase,
      validation: props.validation,
      speaking: props.speaking
    });
  }, [props.placements, props.hintLevel, props.phase, props.validation, props.speaking]);

  return <div ref={containerRef} className="phaser-root" data-testid="phaser-board" aria-label="Три загрузочных узла и шесть капсул энергии" />;
}
