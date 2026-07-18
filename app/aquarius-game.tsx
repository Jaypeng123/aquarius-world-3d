"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  ACTIVE_CITY_MODEL_ASSETS as CITY_MODEL_ASSETS,
  CITY_BRIDGES,
  CITY_BUILDINGS,
  CITY_CANALS,
  CITY_PLATFORMS,
  CITY_PROPS,
  CITY_ROADS,
  type CityBuildingSpec,
  type CityBridgeSpec,
  type CityCanalSpec,
  type CityModelAssetSpec,
  type CityPlatformSpec,
  type CityPropSpec,
  type CityRoadSpec,
} from "./city/city-layout";
import {
  AQUARIUS_OBJECTS,
  CHARACTER_ASSETS,
  DIALOGUE_QUESTIONS,
  HUMANS,
  NPCS,
  PLAYER_AVATARS,
  PLAYER_MODEL,
  WORLD_CONFIG,
  WORLD_REGIONS,
  type ArchetypeId,
  type AquariusObjectData,
  type AquariusObjectId,
  type HumanData,
  type HumanId,
  type NpcData,
  type PlayerAvatarData,
  type PlayerAvatarId,
} from "./game-data";

type Phase = "loading" | "intro" | "playing";
type IntroStep = "landing" | "story" | "setup";
type TutorialStage = "move" | "look" | "interact" | "done";
type Quality = "low" | "medium" | "high";

type DialogueState = {
  npcId: ArchetypeId;
  lineIndex: number;
  answer?: string;
};

type HumanDialogueState = {
  humanId: HumanId;
  lineIndex: number;
};

type ArtifactState = {
  objectId: AquariusObjectId;
};

type InteractionTarget =
  | { kind: "npc"; id: ArchetypeId; distance: number }
  | { kind: "human"; id: HumanId; distance: number }
  | { kind: "object"; id: AquariusObjectId; distance: number };

type ModelResource = {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
};

type CloneModelFn = (model: THREE.Object3D) => THREE.Object3D;

type ActorActionName =
  | "idle"
  | "walk"
  | "run"
  | "jump"
  | "talk"
  | "wave"
  | "dance"
  | "fix"
  | "interact";

type ActorAnimator = {
  mixer: THREE.AnimationMixer;
  actions: Partial<Record<ActorActionName, THREE.AnimationAction>>;
  current: ActorActionName | null;
};

type WanderState = {
  home: THREE.Vector3;
  target: THREE.Vector3;
  radius: number;
  speed: number;
  pauseUntil: number;
  nextGestureAt: number;
  idleAction: ActorActionName;
};

type AmbientModel = {
  group: THREE.Group;
  home: THREE.Vector3;
  target: THREE.Vector3;
  mode: "idle" | "wander" | "float" | "spin";
  radius: number;
  speed: number;
  pauseUntil: number;
  animator?: ActorAnimator;
  motionAction: ActorActionName;
};

type MusicHandle = {
  context: AudioContext;
  master: GainNode;
  filter: BiquadFilterNode;
  oscillators: OscillatorNode[];
  timer: number;
};

type Runtime = {
  THREE: typeof THREE;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  raycaster: THREE.Raycaster;
  mouse: THREE.Vector2;
  clock: THREE.Clock;
  ground: THREE.Mesh;
  worldRoot: THREE.Group;
  npcRoot: THREE.Group;
  humanRoot: THREE.Group;
  objectRoot: THREE.Group;
  player: THREE.Group;
  playerModel: THREE.Group;
  playerLabel: THREE.Sprite;
  playerAnimator: ActorAnimator | null;
  loadedModels: Map<string, ModelResource>;
  cloneAnimatedModel: CloneModelFn;
  animationLibrary: THREE.AnimationClip[];
  particles: THREE.Points;
  velocity: THREE.Vector3;
  jumpVelocity: number;
  grounded: boolean;
  clickTarget: THREE.Vector3 | null;
  pendingNpcId: ArchetypeId | null;
  pendingHumanId: HumanId | null;
  pendingObjectId: AquariusObjectId | null;
  keys: Set<string>;
  joystick: { x: number; y: number };
  pointerDown: { x: number; y: number };
  draggedCamera: boolean;
  npcGroups: Map<ArchetypeId, THREE.Group>;
  npcLabels: Map<ArchetypeId, THREE.Sprite>;
  npcPositions: Map<ArchetypeId, THREE.Vector3>;
  npcAnimators: Map<ArchetypeId, ActorAnimator>;
  npcMotion: Map<ArchetypeId, WanderState>;
  humanGroups: Map<HumanId, THREE.Group>;
  humanLabels: Map<HumanId, THREE.Sprite>;
  humanPrompts: Map<HumanId, THREE.Sprite>;
  humanPositions: Map<HumanId, THREE.Vector3>;
  humanAnimators: Map<HumanId, ActorAnimator>;
  humanMotion: Map<HumanId, WanderState>;
  objectGroups: Map<AquariusObjectId, THREE.Group>;
  objectLabels: Map<AquariusObjectId, THREE.Sprite>;
  objectPrompts: Map<AquariusObjectId, THREE.Sprite>;
  objectPositions: Map<AquariusObjectId, THREE.Vector3>;
  npcPrompts: Map<ArchetypeId, THREE.Sprite>;
  actorMixers: THREE.AnimationMixer[];
  ambientModels: AmbientModel[];
  obstacles: Array<{ x: number; z: number; radius: number }>;
  cameraReturnToDefault: boolean;
  frame: number;
  lastStepAt: number;
  animationId: number;
  resize: () => void;
  dispose: () => void;
};

const INTERACTION_KEYS = new Set(["KeyE"]);
const JUMP_KEYS = new Set(["Space"]);
const RESET_CAMERA_KEYS = new Set(["KeyR"]);
const UNIVERSAL_ANIMATION_LIBRARY = "/assets/animations/UAL1_Standard.glb";
const MODEL_FORWARD_OFFSET = 0;
const CITY_LAYOUT_SCALE = 2.2;
const PLAYER_FLOOR_OFFSET = 0.48;
const PLAYER_START = { x: 0, z: 26 };
const DEFAULT_CAMERA_OFFSET = { x: -2.05, y: 2.05, z: 3.35 };
const AQUARIUS_ORIGIN_STORY = [
  {
    chapter: "ORIGIN 01",
    title: "水從星群倒向人間",
    copy:
      "古代的人看見一位倒水者站在冬夜的天空，便把那道水流稱為水瓶座。水不是結束，而是把新的想法倒進世界的入口。",
  },
  {
    chapter: "ORIGIN 02",
    title: "秩序被好奇心重新排列",
    copy:
      "在這顆星球上，每條水道都保存一種怪念頭：不合群、提前五年、想把規則拆開看。城市因此不追求一致，而追求更大的可能性。",
  },
  {
    chapter: "ORIGIN 03",
    title: "怪異成為共同生活的方法",
    copy:
      "人類、外星人、恐龍與飛牛在同一座城市裡奔跑。每一次對話都會揭露一則傳說，也讓你決定自己的水瓶座行為會如何留下痕跡。",
  },
] as const;
const COMPLETE_CITY_HOUSES = [
  { id: "north-row-house-a", position: [-4.4, -12.4], rotation: 0, color: "#b9d8ff", roof: "#d9a7ff", accent: "#7dd3fc", width: 2.3, depth: 2.0, height: 1.72 },
  { id: "north-row-house-b", position: [4.4, -12.4], rotation: 0, color: "#b7f7e6", roof: "#a6b8ff", accent: "#c4b5fd", width: 2.35, depth: 2.05, height: 1.68 },
  { id: "west-maker-house-a", position: [-14.4, -13.2], rotation: Math.PI / 2, color: "#f2a36f", roof: "#8f5fd7", accent: "#f6d365", width: 2.5, depth: 2.15, height: 1.62 },
  { id: "west-maker-house-b", position: [-14.4, -1.8], rotation: Math.PI / 2, color: "#8fb7ff", roof: "#f59e5f", accent: "#7dd3fc", width: 2.35, depth: 2.1, height: 1.56 },
  { id: "west-maker-house-c", position: [-14.4, 8.2], rotation: Math.PI / 2, color: "#fb9ab4", roof: "#5f70d7", accent: "#fb7185", width: 2.3, depth: 2.0, height: 1.58 },
  { id: "east-residence-house-a", position: [14.4, -6.8], rotation: -Math.PI / 2, color: "#bdf3e7", roof: "#e8c4ff", accent: "#5eead4", width: 2.42, depth: 2.05, height: 1.62 },
  { id: "east-residence-house-b", position: [14.4, 4.8], rotation: -Math.PI / 2, color: "#f7d9ff", roof: "#7dd3fc", accent: "#5eead4", width: 2.35, depth: 2.05, height: 1.6 },
  { id: "east-residence-house-c", position: [14.4, 12.6], rotation: -Math.PI / 2, color: "#93e6d2", roof: "#b9a7ff", accent: "#f7d9ff", width: 2.28, depth: 2.0, height: 1.56 },
  { id: "south-market-house-a", position: [-3.8, 18.8], rotation: Math.PI, color: "#f6d365", roof: "#fb7185", accent: "#7dd3fc", width: 2.2, depth: 1.95, height: 1.48 },
  { id: "south-market-house-b", position: [3.8, 18.8], rotation: Math.PI, color: "#c4b5fd", roof: "#5eead4", accent: "#f6d365", width: 2.22, depth: 1.95, height: 1.5 },
] as const;
const MOVEMENT_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ShiftLeft",
  "ShiftRight",
]);
const JOURNAL_KEYS = new Set(["Tab", "KeyJ"]);
const ACTIVE_AQUARIUS_OBJECT_IDS = new Set<AquariusObjectId>([
  "reverse-clock",
  "contrarian-vending",
  "crowd-antenna",
  "unwritten-chair",
  "habitat-dome",
  "oxygen-tree",
  "hydroponic-kitchen",
  "memory-market",
  "monorail-station",
  "flying-cow",
  "signal-jellyfish",
  "quantum-deer",
  "bubble-dog",
  "solar-sheep",
  "paper-ray",
]);

const UNIVERSAL_BONE_MAP: Record<string, string> = {
  root: "Root",
  pelvis: "Hips",
  spine_01: "Abdomen",
  spine_02: "Torso",
  neck_01: "Neck",
  Head: "Head",
  clavicle_l: "Shoulder.L",
  upperarm_l: "UpperArm.L",
  lowerarm_l: "LowerArm.L",
  hand_l: "Fist.L",
  clavicle_r: "Shoulder.R",
  upperarm_r: "UpperArm.R",
  lowerarm_r: "LowerArm.R",
  hand_r: "Fist.R",
  thigh_l: "UpperLeg.L",
  calf_l: "LowerLeg.L",
  foot_l: "Foot.L",
  thigh_r: "UpperLeg.R",
  calf_r: "LowerLeg.R",
  foot_r: "Foot.R",
};

function loadStoredIds() {
  if (typeof window === "undefined") {
    return new Set<ArchetypeId>();
  }

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem("aquarius-archive-unlocked") ?? "[]"
    ) as ArchetypeId[];
    return new Set(parsed);
  } catch {
    return new Set<ArchetypeId>();
  }
}

function loadTutorialStage(): TutorialStage {
  if (typeof window === "undefined") {
    return "move";
  }
  return window.localStorage.getItem("aquarius-archive-tutorial") === "done"
    ? "done"
    : "move";
}

function loadQuality(): Quality {
  if (typeof window === "undefined") {
    return "medium";
  }
  const value = window.localStorage.getItem("aquarius-archive-quality");
  return value === "low" || value === "high" ? value : "medium";
}

function loadMuted() {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem("aquarius-archive-muted") === "true";
}

function loadMusicEnabled() {
  if (typeof window === "undefined") {
    return true;
  }
  return window.localStorage.getItem("aquarius-archive-music") !== "false";
}

function loadPlayerName() {
  if (typeof window === "undefined") {
    return "player1";
  }
  return window.localStorage.getItem("aquarius-player-name") || "player1";
}

function loadPlayerAvatar(): PlayerAvatarId {
  if (typeof window === "undefined") {
    return "neutral-human";
  }
  const value = window.localStorage.getItem("aquarius-player-avatar") as PlayerAvatarId | null;
  return PLAYER_AVATARS.some((avatar) => avatar.id === value) ? value : "neutral-human";
}

function getNpc(id: ArchetypeId) {
  return NPCS.find((npc) => npc.id === id) ?? NPCS[0];
}

function getHuman(id: HumanId) {
  return HUMANS.find((human) => human.id === id) ?? HUMANS[0];
}

function getAquariusObject(id: AquariusObjectId) {
  return AQUARIUS_OBJECTS.find((item) => item.id === id) ?? AQUARIUS_OBJECTS[0];
}

function getActiveAquariusObjects() {
  return AQUARIUS_OBJECTS.filter((item) => ACTIVE_AQUARIUS_OBJECT_IDS.has(item.id));
}

function getAvatar(id: PlayerAvatarId) {
  return PLAYER_AVATARS.find((avatar) => avatar.id === id) ?? PLAYER_AVATARS[0];
}

function shouldSkipLooseCityAsset(asset: CityModelAssetSpec) {
  const path = asset.asset.toLowerCase();
  return (
    path.includes("/medieval-village/wall_") ||
    path.includes("/medieval-village/roof_") ||
    path.includes("/medieval-village/corner_") ||
    path.includes("/medieval-village/prop_chimney") ||
    path.includes("/medieval-village/prop_vine")
  );
}

function estimateModelCollisionRadius(asset: CityModelAssetSpec) {
  if (asset.category === "building-small" || asset.category === "building-medium") {
    return Math.max(1.35, Math.max(asset.scale[0], asset.scale[2]) * 1.85);
  }
  if (asset.id.includes("wagon")) {
    return 1.05;
  }
  return Math.max(0.72, Math.max(asset.scale[0], asset.scale[2]) * 1.15);
}

function scaleWorldValue(value: number) {
  return value * CITY_LAYOUT_SCALE;
}

function scaleWorldPoint(x: number, z: number): [number, number] {
  return [scaleWorldValue(x), scaleWorldValue(z)];
}

function scaleWorldPosition(position: [number, number, number]): [number, number, number] {
  return [scaleWorldValue(position[0]), position[1], scaleWorldValue(position[2])];
}

function getRegionName(x: number, z: number) {
  let best = WORLD_REGIONS[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const region of WORLD_REGIONS) {
    const distance =
      Math.hypot(x - scaleWorldValue(region.x), z - scaleWorldValue(region.z)) /
      scaleWorldValue(region.radius);
    if (distance < bestDistance) {
      best = region;
      bestDistance = distance;
    }
  }
  return best.name;
}

function clampToWorld(x: number, z: number) {
  const radius = WORLD_CONFIG.worldRadius;
  const distance = Math.hypot(x, z);
  if (distance <= radius) {
    return { x, z };
  }
  const scale = radius / distance;
  return { x: x * scale, z: z * scale };
}

export function AquariusGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewDisposeRef = useRef<(() => void) | null>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const phaseRef = useRef<Phase>("loading");
  const dialogueRef = useRef<DialogueState | null>(null);
  const humanDialogueRef = useRef<HumanDialogueState | null>(null);
  const artifactRef = useRef<ArtifactState | null>(null);
  const nearestNpcRef = useRef<ArchetypeId | null>(null);
  const nearestTargetRef = useRef<InteractionTarget | null>(null);
  const journalOpenRef = useRef(false);
  const tutorialStageRef = useRef<TutorialStage>("move");
  const qualityRef = useRef<Quality>("medium");
  const selectedAvatarRef = useRef<PlayerAvatarId>("neutral-human");
  const playerNameRef = useRef(loadPlayerName());
  const openDialogueRef = useRef<(id: ArchetypeId) => void>(() => undefined);
  const openHumanDialogueRef = useRef<(id: HumanId) => void>(() => undefined);
  const openArtifactRef = useRef<(id: AquariusObjectId) => void>(() => undefined);
  const playToneRef = useRef<(frequency: number, duration?: number) => void>(() => undefined);
  const mutedRef = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);
  const musicRef = useRef<MusicHandle | null>(null);
  const musicEnabledRef = useRef(loadMusicEnabled());
  const musicGestureRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("loading");
  const [introStep, setIntroStep] = useState<IntroStep>("landing");
  const [storyIndex, setStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState("正在校準星象……");
  const [currentRegion, setCurrentRegion] = useState("星光水道市中心");
  const [nearestNpcId, setNearestNpcId] = useState<ArchetypeId | null>(null);
  const [nearestTarget, setNearestTarget] = useState<InteractionTarget | null>(null);
  const [dialogue, setDialogue] = useState<DialogueState | null>(null);
  const [humanDialogue, setHumanDialogue] = useState<HumanDialogueState | null>(null);
  const [artifact, setArtifact] = useState<ArtifactState | null>(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const [unlocked, setUnlocked] = useState<Set<ArchetypeId>>(() => loadStoredIds());
  const [toast, setToast] = useState("");
  const [tutorialStage, setTutorialStage] = useState<TutorialStage>(() =>
    loadTutorialStage()
  );
  const [muted, setMuted] = useState(() => loadMuted());
  const [musicEnabled, setMusicEnabled] = useState(() => loadMusicEnabled());
  const [quality, setQuality] = useState<Quality>(() => loadQuality());
  const [playerName, setPlayerName] = useState(() => loadPlayerName());
  const [selectedAvatar, setSelectedAvatar] = useState<PlayerAvatarId>(() =>
    loadPlayerAvatar()
  );
  const [helpOpen, setHelpOpen] = useState(false);
  const [joystickActive, setJoystickActive] = useState(false);
  const [joystickKnob, setJoystickKnob] = useState({ x: 0, y: 0 });

  const selectedAvatarData = getAvatar(selectedAvatar);
  const nearestNpc = nearestNpcId ? getNpc(nearestNpcId) : null;
  const nearestObject =
    nearestTarget?.kind === "object" ? getAquariusObject(nearestTarget.id) : null;
  const nearestHuman =
    nearestTarget?.kind === "human" ? getHuman(nearestTarget.id) : null;
  const dialogueNpc = dialogue ? getNpc(dialogue.npcId) : null;
  const dialogueHuman = humanDialogue ? getHuman(humanDialogue.humanId) : null;
  const activeArtifact = artifact ? getAquariusObject(artifact.objectId) : null;
  const dialogueLines = useMemo(() => {
    if (!dialogueNpc) {
      return [];
    }
    return [
      dialogueNpc.quote,
      `${dialogueNpc.title}代表${dialogueNpc.keywords.join("、")}。${dialogueNpc.core}`,
      `你獲得了「${dialogueNpc.fragment}」。這段人格已被記入星象手札。`,
    ];
  }, [dialogueNpc]);
  const humanDialogueLines = useMemo(() => {
    if (!dialogueHuman) {
      return [];
    }
    return [dialogueHuman.legend, dialogueHuman.rumor, dialogueHuman.detail];
  }, [dialogueHuman]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    dialogueRef.current = dialogue;
  }, [dialogue]);

  useEffect(() => {
    humanDialogueRef.current = humanDialogue;
  }, [humanDialogue]);

  useEffect(() => {
    artifactRef.current = artifact;
  }, [artifact]);

  useEffect(() => {
    nearestNpcRef.current = nearestNpcId;
  }, [nearestNpcId]);

  useEffect(() => {
    nearestTargetRef.current = nearestTarget;
  }, [nearestTarget]);

  useEffect(() => {
    journalOpenRef.current = journalOpen;
  }, [journalOpen]);

  useEffect(() => {
    tutorialStageRef.current = tutorialStage;
  }, [tutorialStage]);

  useEffect(() => {
    qualityRef.current = quality;
  }, [quality]);

  useEffect(() => {
    selectedAvatarRef.current = selectedAvatar;
    window.localStorage.setItem("aquarius-player-avatar", selectedAvatar);
    const runtime = runtimeRef.current;
    if (runtime) {
      setRuntimePlayerAvatar(runtime, getAvatar(selectedAvatar));
    }
  }, [selectedAvatar]);

  useEffect(() => {
    previewDisposeRef.current?.();
    previewDisposeRef.current = null;
    const runtime = runtimeRef.current;
    const canvas = previewCanvasRef.current;
    if (phase !== "intro" || introStep !== "setup" || !runtime || !canvas) {
      return undefined;
    }
    previewDisposeRef.current = mountAvatarPreview(canvas, runtime, getAvatar(selectedAvatar));
    return () => {
      previewDisposeRef.current?.();
      previewDisposeRef.current = null;
    };
  }, [phase, introStep, selectedAvatar]);

  useEffect(() => {
    const displayName = playerName.trim() || "player1";
    playerNameRef.current = displayName;
    window.localStorage.setItem("aquarius-player-name", displayName);
    const runtime = runtimeRef.current;
    if (runtime) {
      updatePlayerNameLabel(runtime.THREE, runtime.playerLabel, displayName);
    }
  }, [playerName]);

  useEffect(() => {
    mutedRef.current = muted;
    window.localStorage.setItem("aquarius-archive-muted", String(muted));
  }, [muted]);

  const stopBackgroundMusic = useCallback(() => {
    const music = musicRef.current;
    if (!music) {
      return;
    }
    const now = music.context.currentTime;
    window.clearInterval(music.timer);
    music.master.gain.cancelScheduledValues(now);
    music.master.gain.setTargetAtTime(0.0001, now, 0.16);
    music.oscillators.forEach((oscillator) => {
      try {
        oscillator.stop(now + 0.38);
      } catch {
        // The oscillator may already be stopping during a fast toggle.
      }
    });
    window.setTimeout(() => {
      void music.context.close().catch(() => undefined);
    }, 520);
    musicRef.current = null;
  }, []);

  const startBackgroundMusic = useCallback(() => {
    if (!musicEnabledRef.current || musicRef.current) {
      return;
    }
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }
    const context = new AudioContextCtor();
    const master = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 960;
    filter.Q.value = 0.72;
    master.gain.setValueAtTime(0.0001, context.currentTime);
    filter.connect(master);
    master.connect(context.destination);

    const chords = [
      [261.63, 329.63, 392],
      [293.66, 369.99, 440],
      [246.94, 329.63, 415.3],
      [220, 293.66, 392],
    ];
    const melody = [659.25, 587.33, 659.25, 783.99, 739.99, 659.25, 587.33, 523.25];
    let chordIndex = 0;
    let stepIndex = 0;
    const oscillators = chords[0].map((frequency, index) => {
      const oscillator = context.createOscillator();
      const voice = context.createGain();
      oscillator.type = index === 0 ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, context.currentTime);
      voice.gain.value = index === 0 ? 0.1 : 0.055;
      oscillator.connect(voice);
      voice.connect(filter);
      oscillator.start();
      return oscillator;
    });

    const timer = window.setInterval(() => {
      stepIndex = (stepIndex + 1) % melody.length;
      if (stepIndex % 2 === 0) {
        chordIndex = (chordIndex + 1) % chords.length;
      }
      const nextChord = chords[chordIndex];
      const now = context.currentTime;
      oscillators.forEach((oscillator, index) => {
        oscillator.frequency.exponentialRampToValueAtTime(nextChord[index], now + 0.34);
      });
      filter.frequency.linearRampToValueAtTime(1250 + (stepIndex % 3) * 220, now + 0.24);

      const note = context.createOscillator();
      const noteGain = context.createGain();
      note.type = stepIndex % 3 === 0 ? "square" : "triangle";
      note.frequency.setValueAtTime(melody[stepIndex], now);
      noteGain.gain.setValueAtTime(0.0001, now);
      noteGain.gain.exponentialRampToValueAtTime(0.038, now + 0.025);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
      note.connect(noteGain);
      noteGain.connect(filter);
      note.start(now);
      note.stop(now + 0.29);
    }, 420);

    master.gain.exponentialRampToValueAtTime(0.07, context.currentTime + 0.8);
    void context.resume().catch(() => undefined);
    musicRef.current = { context, master, filter, oscillators, timer };
  }, []);

  const requestMusicStart = useCallback(() => {
    musicGestureRef.current = true;
    if (musicEnabledRef.current) {
      startBackgroundMusic();
    }
  }, [startBackgroundMusic]);

  const toggleMusic = useCallback(() => {
    musicGestureRef.current = true;
    const next = !musicEnabledRef.current;
    musicEnabledRef.current = next;
    setMusicEnabled(next);
    if (next) {
      startBackgroundMusic();
    } else {
      stopBackgroundMusic();
    }
    playToneRef.current(next ? 520 : 260, 0.08);
  }, [startBackgroundMusic, stopBackgroundMusic]);

  useEffect(() => {
    musicEnabledRef.current = musicEnabled;
    window.localStorage.setItem("aquarius-archive-music", String(musicEnabled));
    if (!musicEnabled) {
      stopBackgroundMusic();
    } else if (musicGestureRef.current) {
      startBackgroundMusic();
    }
  }, [musicEnabled, startBackgroundMusic, stopBackgroundMusic]);

  useEffect(() => stopBackgroundMusic, [stopBackgroundMusic]);

  const playTone = useCallback((frequency: number, duration = 0.12) => {
    if (mutedRef.current) {
      return;
    }
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }
    const context = audioRef.current ?? new AudioContextCtor();
    audioRef.current = context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.035, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration + 0.03);
  }, []);

  useEffect(() => {
    playToneRef.current = playTone;
  }, [playTone]);

  const unlockNpc = useCallback(
    (npcId: ArchetypeId) => {
      setUnlocked((current) => {
        if (current.has(npcId)) {
          return current;
        }
        const next = new Set(current);
        next.add(npcId);
        window.localStorage.setItem(
          "aquarius-archive-unlocked",
          JSON.stringify(Array.from(next))
        );
        const npc = getNpc(npcId);
        setToast(`已記錄：${npc.title}`);
        window.setTimeout(() => setToast(""), 2200);
        playTone(740, 0.18);
        return next;
      });

      if (tutorialStage !== "done") {
        setTutorialStage("done");
        window.localStorage.setItem("aquarius-archive-tutorial", "done");
      }
    },
    [playTone, tutorialStage]
  );

  const openDialogue = useCallback(
    (npcId: ArchetypeId) => {
      unlockNpc(npcId);
      setDialogue({ npcId, lineIndex: 0 });
      setHumanDialogue(null);
      setArtifact(null);
      playTone(520, 0.12);
      const runtime = runtimeRef.current;
      if (runtime) {
        runtime.clickTarget = null;
        runtime.pendingNpcId = null;
        runtime.pendingHumanId = null;
        runtime.pendingObjectId = null;
        runtime.velocity.set(0, 0, 0);
        runtime.controls.enableRotate = false;
      }
    },
    [playTone, unlockNpc]
  );

  const openHumanDialogue = useCallback(
    (humanId: HumanId) => {
      const human = getHuman(humanId);
      setHumanDialogue({ humanId, lineIndex: 0 });
      setDialogue(null);
      setArtifact(null);
      setToast(`${human.title} 想起一則城市傳說`);
      window.setTimeout(() => setToast(""), 1600);
      playTone(610, 0.12);
      const runtime = runtimeRef.current;
      if (runtime) {
        runtime.clickTarget = null;
        runtime.pendingNpcId = null;
        runtime.pendingHumanId = null;
        runtime.pendingObjectId = null;
        runtime.velocity.set(0, 0, 0);
        runtime.controls.enableRotate = false;
      }
    },
    [playTone]
  );

  const openArtifact = useCallback(
    (objectId: AquariusObjectId) => {
      const item = getAquariusObject(objectId);
      setArtifact({ objectId });
      setDialogue(null);
      setHumanDialogue(null);
      setToast(item.prompt);
      window.setTimeout(() => setToast(""), 1800);
      playTone(item.kind === "creature" ? 680 : 470, 0.14);
      const runtime = runtimeRef.current;
      if (runtime) {
        runtime.clickTarget = null;
        runtime.pendingNpcId = null;
        runtime.pendingHumanId = null;
        runtime.pendingObjectId = null;
        runtime.velocity.set(0, 0, 0);
        runtime.controls.enableRotate = false;
      }
    },
    [playTone]
  );

  useEffect(() => {
    openArtifactRef.current = openArtifact;
  }, [openArtifact]);

  useEffect(() => {
    openHumanDialogueRef.current = openHumanDialogue;
  }, [openHumanDialogue]);

  useEffect(() => {
    openDialogueRef.current = openDialogue;
  }, [openDialogue]);

  const closeDialogue = useCallback(() => {
    setDialogue(null);
    const runtime = runtimeRef.current;
    if (runtime) {
      runtime.controls.enableRotate = true;
      runtime.cameraReturnToDefault = true;
    }
  }, []);

  const closeHumanDialogue = useCallback(() => {
    setHumanDialogue(null);
    const runtime = runtimeRef.current;
    if (runtime) {
      runtime.controls.enableRotate = true;
      runtime.cameraReturnToDefault = true;
    }
  }, []);

  const closeArtifact = useCallback(() => {
    setArtifact(null);
    const runtime = runtimeRef.current;
    if (runtime) {
      runtime.controls.enableRotate = true;
      runtime.cameraReturnToDefault = true;
    }
  }, []);

  const activateNearest = useCallback(() => {
    const target = nearestTargetRef.current;
    if (!target || target.distance > WORLD_CONFIG.interactDistance) {
      return;
    }
    if (target.kind === "npc") {
      openDialogue(target.id);
      return;
    }
    if (target.kind === "human") {
      openHumanDialogue(target.id);
      return;
    }
    openArtifact(target.id);
  }, [openArtifact, openDialogue, openHumanDialogue]);

  const requestJump = useCallback(() => {
    const runtime = runtimeRef.current;
    if (
      !runtime ||
      phaseRef.current !== "playing" ||
      dialogueRef.current ||
      humanDialogueRef.current ||
      artifactRef.current ||
      journalOpenRef.current ||
      !runtime.grounded
    ) {
      return;
    }
    runtime.jumpVelocity = WORLD_CONFIG.jumpPower;
    runtime.grounded = false;
    playTone(720, 0.09);
  }, [playTone]);

  const advanceDialogue = useCallback(() => {
    const currentHuman = humanDialogueRef.current;
    if (currentHuman) {
      if (currentHuman.lineIndex < 2) {
        setHumanDialogue({ ...currentHuman, lineIndex: currentHuman.lineIndex + 1 });
        playTone(500, 0.08);
        return;
      }
      closeHumanDialogue();
      return;
    }

    const current = dialogueRef.current;
    if (!current) {
      if (artifactRef.current) {
        closeArtifact();
      } else {
        activateNearest();
      }
      return;
    }

    const maxIntroLine = 2;
    if (current.answer) {
      setDialogue({ npcId: current.npcId, lineIndex: maxIntroLine });
      playTone(430, 0.08);
      return;
    }

    if (current.lineIndex < maxIntroLine) {
      setDialogue({ ...current, lineIndex: current.lineIndex + 1 });
      playTone(430, 0.08);
      return;
    }

    closeDialogue();
  }, [activateNearest, closeArtifact, closeDialogue, closeHumanDialogue, playTone]);

  const chooseQuestion = useCallback(
    (questionId: string) => {
      const current = dialogueRef.current;
      if (!current) {
        return;
      }
      const npc = getNpc(current.npcId);
      const answer =
        questionId === "strength"
          ? npc.strength
          : questionId === "shadow"
            ? npc.shadow
            : npc.relation;
      setDialogue({ npcId: npc.id, lineIndex: 3, answer });
      playTone(560, 0.1);
    },
    [playTone]
  );

  const toggleJournal = useCallback(() => {
    setJournalOpen((value) => {
      const next = !value;
      if (next) {
        playTone(360, 0.1);
      }
      return next;
    });
  }, [playTone]);

  useEffect(() => {
    window.localStorage.setItem("aquarius-archive-quality", quality);
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    const ratio =
      quality === "low" ? 1 : quality === "medium" ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, 2);
    runtime.renderer.setPixelRatio(ratio);
    runtime.particles.visible = quality !== "low";
  }, [quality]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    let cancelled = false;

    async function boot() {
      const THREE_MODULE = await import("three");
      const { OrbitControls: OrbitControlsCtor } = await import(
        "three/examples/jsm/controls/OrbitControls.js"
      );
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");
      const { clone: cloneSkinnedModel } = await import(
        "three/examples/jsm/utils/SkeletonUtils.js"
      );
      const THREE_REF = THREE_MODULE;

      setLoadingText("正在載入水瓶座旅人……");
      const manager = new THREE_REF.LoadingManager();
      manager.onProgress = (_url, loaded, total) => {
        const percent = total > 0 ? Math.round((loaded / total) * 88) : 30;
        setProgress(Math.max(8, percent));
        if (percent > 45) {
          setLoadingText("正在點亮星球地表……");
        }
      };
      const gltfLoader = new GLTFLoader(manager);
      const fbxLoader = new FBXLoader(manager);
      const uniqueAssets = Array.from(
        new Set([
          PLAYER_MODEL,
          UNIVERSAL_ANIMATION_LIBRARY,
          ...CHARACTER_ASSETS,
          ...PLAYER_AVATARS.map((avatar) => avatar.model),
          ...HUMANS.map((human) => human.model),
          ...CITY_MODEL_ASSETS.filter((asset) => !shouldSkipLooseCityAsset(asset)).map((asset) => asset.asset),
        ])
      );
      const loadedModels = new Map<string, ModelResource>();

      await Promise.all(
        uniqueAssets.map(
          (path) =>
            new Promise<void>((resolve, reject) => {
              const onLoaded = (model: THREE.Group, animations: THREE.AnimationClip[]) => {
                model.traverse((child) => {
                  child.castShadow = false;
                  child.receiveShadow = false;
                });
                loadedModels.set(path, {
                  scene: model,
                  animations,
                });
                resolve();
              };

              if (path.toLowerCase().endsWith(".fbx")) {
                fbxLoader.load(
                  path,
                  (fbx) => {
                    onLoaded(fbx as THREE.Group, fbx.animations ?? []);
                  },
                  undefined,
                  reject
                );
                return;
              }

              gltfLoader.load(
                path,
                (gltf) => {
                  const model = gltf.scene as THREE.Group;
                  onLoaded(model, gltf.animations ?? []);
                },
                undefined,
                reject
              );
            })
        )
      );

      if (cancelled || !canvasRef.current) {
        return;
      }

      setProgress(92);
      setLoadingText("正在開啟水瓶座外星星球……");
      const cloneAnimatedModel = cloneSkinnedModel as CloneModelFn;
      const animationLibrary = retargetUniversalAnimationClips(
        THREE_REF,
        loadedModels.get(UNIVERSAL_ANIMATION_LIBRARY)?.animations ?? []
      );

      const scene = new THREE_REF.Scene();
      scene.background = new THREE_REF.Color("#09122d");
      scene.fog = new THREE_REF.FogExp2("#0d1632", 0.027);

      const renderer = new THREE_REF.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
      });
      renderer.outputColorSpace = THREE_REF.SRGBColorSpace;
      const initialQuality = qualityRef.current;
      renderer.setPixelRatio(
        initialQuality === "low"
          ? 1
          : initialQuality === "medium"
            ? Math.min(window.devicePixelRatio, 1.5)
            : Math.min(window.devicePixelRatio, 2)
      );

      const camera = new THREE_REF.PerspectiveCamera(50, 1, 0.1, 160);
      camera.position.set(
        PLAYER_START.x + DEFAULT_CAMERA_OFFSET.x,
        DEFAULT_CAMERA_OFFSET.y,
        PLAYER_START.z + DEFAULT_CAMERA_OFFSET.z
      );

      const controls = new OrbitControlsCtor(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = false;
      controls.minDistance = WORLD_CONFIG.cameraMin;
      controls.maxDistance = WORLD_CONFIG.cameraMax;
      controls.maxPolarAngle = Math.PI * 0.48;
      controls.minPolarAngle = Math.PI * 0.18;
      controls.target.set(PLAYER_START.x, 1, PLAYER_START.z);

      const worldRoot = new THREE_REF.Group();
      scene.add(worldRoot);
      const npcRoot = new THREE_REF.Group();
      scene.add(npcRoot);
      const humanRoot = new THREE_REF.Group();
      scene.add(humanRoot);
      const objectRoot = new THREE_REF.Group();
      scene.add(objectRoot);

      const actorMixers: THREE.AnimationMixer[] = [];
      createLighting(THREE_REF, scene);
      const ground = createWorld(THREE_REF, worldRoot);
      const ambientModels = addCityModelAssets(
        THREE_REF,
        worldRoot,
        loadedModels,
        cloneAnimatedModel,
        animationLibrary,
        actorMixers
      );
      scene.add(createStars(THREE_REF));
      const particles = createParticles(THREE_REF);
      particles.visible = qualityRef.current !== "low";
      scene.add(particles);

      const player = new THREE_REF.Group();
      player.name = "player";
      const initialAvatar = getAvatar(selectedAvatarRef.current);
      const playerModelSource = loadedModels.get(initialAvatar.model);
      const loadedPlayerModel = playerModelSource
        ? cloneModel(THREE_REF, playerModelSource.scene, cloneAnimatedModel)
        : null;
      const usesLoadedPlayerModel = Boolean(loadedPlayerModel && hasRenderableMesh(loadedPlayerModel));
      const playerModel = usesLoadedPlayerModel && loadedPlayerModel
        ? loadedPlayerModel
        : createFallbackPreviewAvatar(THREE_REF, initialAvatar);
      playerModel.scale.setScalar(usesLoadedPlayerModel ? initialAvatar.scale : 1);
      playerModel.rotation.y = MODEL_FORWARD_OFFSET;
      if (initialAvatar.neutralSkin) {
        applyNeutralPlayerMaterial(THREE_REF, playerModel);
      }
      groundModelToFloor(THREE_REF, playerModel, PLAYER_FLOOR_OFFSET);
      player.add(playerModel);
      const playerLabel = makePlayerNameLabel(THREE_REF, playerNameRef.current);
      playerLabel.position.set(0, 2.22, 0);
      player.add(playerLabel);
      player.position.set(PLAYER_START.x, 0, PLAYER_START.z);
      scene.add(player);
      const playerAnimator = playerModelSource && usesLoadedPlayerModel
        ? createActorAnimator(
            THREE_REF,
            playerModel,
            playerModelSource.animations,
            animationLibrary
          )
        : null;
      if (playerAnimator) {
        actorMixers.push(playerAnimator.mixer);
        playActorAction(playerAnimator, "idle", 0);
      }

      const npcGroups = new Map<ArchetypeId, THREE.Group>();
      const npcLabels = new Map<ArchetypeId, THREE.Sprite>();
      const npcPrompts = new Map<ArchetypeId, THREE.Sprite>();
      const npcPositions = new Map<ArchetypeId, THREE.Vector3>();
      const npcAnimators = new Map<ArchetypeId, ActorAnimator>();
      const npcMotion = new Map<ArchetypeId, WanderState>();
      const humanGroups = new Map<HumanId, THREE.Group>();
      const humanLabels = new Map<HumanId, THREE.Sprite>();
      const humanPrompts = new Map<HumanId, THREE.Sprite>();
      const humanPositions = new Map<HumanId, THREE.Vector3>();
      const humanAnimators = new Map<HumanId, ActorAnimator>();
      const humanMotion = new Map<HumanId, WanderState>();
      const objectGroups = new Map<AquariusObjectId, THREE.Group>();
      const objectLabels = new Map<AquariusObjectId, THREE.Sprite>();
      const objectPrompts = new Map<AquariusObjectId, THREE.Sprite>();
      const objectPositions = new Map<AquariusObjectId, THREE.Vector3>();

      NPCS.forEach((npc) => {
        const source = loadedModels.get(npc.model);
        const group = createNpcGroup(THREE_REF, npc, source?.scene, cloneAnimatedModel);
        npcRoot.add(group);
        npcGroups.set(npc.id, group);
        npcLabels.set(npc.id, group.userData.label as THREE.Sprite);
        npcPrompts.set(npc.id, group.userData.prompt as THREE.Sprite);
        npcPositions.set(npc.id, new THREE_REF.Vector3(...scaleWorldPosition(npc.position)));
        const actorModel = group.userData.actorModel as THREE.Group | undefined;
        if (source && actorModel) {
          const animator = createActorAnimator(
            THREE_REF,
            actorModel,
            source.animations,
            animationLibrary
          );
          npcAnimators.set(npc.id, animator);
          actorMixers.push(animator.mixer);
          playActorAction(animator, getNpcIdleAction(npc.id), 0);
        }
        npcMotion.set(
          npc.id,
          createWanderState(
            THREE_REF,
            new THREE_REF.Vector3(...scaleWorldPosition(npc.position)),
            scaleWorldValue(npc.id === "wanderer" ? 2.6 : npc.id === "observer" ? 0.9 : 1.55),
            npc.id === "wanderer" ? 0.72 : npc.id === "inventor" ? 0.48 : 0.56,
            getNpcIdleAction(npc.id)
          )
        );
      });

      HUMANS.forEach((human) => {
        const source = loadedModels.get(human.model);
        const group = createHumanGroup(THREE_REF, human, source?.scene, cloneAnimatedModel);
        humanRoot.add(group);
        humanGroups.set(human.id, group);
        humanLabels.set(human.id, group.userData.label as THREE.Sprite);
        humanPrompts.set(human.id, group.userData.prompt as THREE.Sprite);
        humanPositions.set(human.id, new THREE_REF.Vector3(...scaleWorldPosition(human.position)));
        const actorModel = group.userData.actorModel as THREE.Group | undefined;
        if (source && actorModel) {
          const animator = createActorAnimator(
            THREE_REF,
            actorModel,
            source.animations,
            animationLibrary
          );
          humanAnimators.set(human.id, animator);
          actorMixers.push(animator.mixer);
          playActorAction(animator, "talk", 0);
        }
        humanMotion.set(
          human.id,
          createWanderState(
            THREE_REF,
            new THREE_REF.Vector3(...scaleWorldPosition(human.position)),
            scaleWorldValue(human.id === "bubble-commuter" ? 1.1 : 1.75),
            human.id === "archive-courier" ? 0.68 : 0.5,
            human.id === "solar-seller" ? "fix" : "talk"
          )
        );
      });

      getActiveAquariusObjects().forEach((item) => {
        const group = createAquariusObjectGroup(THREE_REF, item);
        objectRoot.add(group);
        objectGroups.set(item.id, group);
        objectLabels.set(item.id, group.userData.label as THREE.Sprite);
        objectPrompts.set(item.id, group.userData.prompt as THREE.Sprite);
        objectPositions.set(item.id, new THREE_REF.Vector3(scaleWorldValue(item.position[0]), 0, scaleWorldValue(item.position[2])));
      });

      const obstacles = [
        { x: 0, z: 0, radius: 3.25 },
        ...getActiveAquariusObjects().filter((item) => item.collisionRadius > 0).map((item) => ({
          x: scaleWorldValue(item.position[0]),
          z: scaleWorldValue(item.position[2]),
          radius: item.collisionRadius + 0.18,
        })),
        ...CITY_BUILDINGS.map((building) => ({
          x: scaleWorldValue(building.position[0]),
          z: scaleWorldValue(building.position[1]),
          radius: building.collisionRadius + 0.52,
        })),
        ...CITY_MODEL_ASSETS.filter((asset) => asset.collision && !shouldSkipLooseCityAsset(asset)).map((asset) => ({
          x: scaleWorldValue(asset.position[0]),
          z: scaleWorldValue(asset.position[2]),
          radius: estimateModelCollisionRadius(asset),
        })),
        ...COMPLETE_CITY_HOUSES.map((house) => ({
          x: scaleWorldValue(house.position[0]),
          z: scaleWorldValue(house.position[1]),
          radius: Math.max(house.width, house.depth) * 0.68,
        })),
      ];

      const runtime: Runtime = {
        THREE: THREE_REF,
        renderer,
        scene,
        camera,
        controls,
        raycaster: new THREE_REF.Raycaster(),
        mouse: new THREE_REF.Vector2(),
        clock: new THREE_REF.Clock(),
        ground,
        worldRoot,
        npcRoot,
        humanRoot,
        objectRoot,
        player,
        playerModel,
        playerLabel,
        playerAnimator,
        loadedModels,
        cloneAnimatedModel,
        animationLibrary,
        particles,
        velocity: new THREE_REF.Vector3(),
        jumpVelocity: 0,
        grounded: true,
        clickTarget: null,
        pendingNpcId: null,
        pendingHumanId: null,
        pendingObjectId: null,
        keys: new Set(),
        joystick: { x: 0, y: 0 },
        pointerDown: { x: 0, y: 0 },
        draggedCamera: false,
        npcGroups,
        npcLabels,
        npcPrompts,
        npcPositions,
        npcAnimators,
        npcMotion,
        humanGroups,
        humanLabels,
        humanPrompts,
        humanPositions,
        humanAnimators,
        humanMotion,
        objectGroups,
        objectLabels,
        objectPrompts,
        objectPositions,
        actorMixers,
        ambientModels,
        obstacles,
        cameraReturnToDefault: false,
        frame: 0,
        lastStepAt: 0,
        animationId: 0,
        resize: () => {
          const parent = canvas.parentElement;
          const width = parent?.clientWidth || window.innerWidth;
          const height = parent?.clientHeight || window.innerHeight;
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        },
        dispose: () => undefined,
      };

      const handlePointerDown = (event: PointerEvent) => {
        runtime.pointerDown = { x: event.clientX, y: event.clientY };
        runtime.draggedCamera = false;
      };

      const handlePointerMove = (event: PointerEvent) => {
        const distance =
          Math.abs(event.clientX - runtime.pointerDown.x) +
          Math.abs(event.clientY - runtime.pointerDown.y);
        if (distance > 12 && tutorialStageRef.current !== "done") {
          setTutorialStage((current) => (current === "look" ? "interact" : current));
        }
      };

      const handlePointerUp = (event: PointerEvent) => {
        const moved =
          Math.abs(event.clientX - runtime.pointerDown.x) +
          Math.abs(event.clientY - runtime.pointerDown.y);
        if (
          moved > 10 ||
          phaseRef.current !== "playing" ||
          dialogueRef.current ||
          humanDialogueRef.current ||
          artifactRef.current
        ) {
          return;
        }

        const rect = renderer.domElement.getBoundingClientRect();
        runtime.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        runtime.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        runtime.raycaster.setFromCamera(runtime.mouse, camera);
        const hits = runtime.raycaster.intersectObjects([npcRoot, humanRoot, objectRoot, ground], true);
        const npcHit = hits.find((hit) => findNpcId(hit.object));
        if (npcHit) {
          const npcId = findNpcId(npcHit.object) as ArchetypeId;
          const npcPosition = runtime.npcPositions.get(npcId);
          if (npcPosition) {
            const away = new THREE_REF.Vector3()
              .subVectors(runtime.player.position, npcPosition)
              .setY(0);
            if (away.lengthSq() < 0.01) {
              away.set(1, 0, 0);
            }
            away.normalize();
            runtime.clickTarget = npcPosition
              .clone()
              .add(away.multiplyScalar(WORLD_CONFIG.interactDistance - 0.35));
            runtime.pendingNpcId = npcId;
            runtime.pendingHumanId = null;
            runtime.pendingObjectId = null;
          }
          return;
        }

        const humanHit = hits.find((hit) => findHumanId(hit.object));
        if (humanHit) {
          const humanId = findHumanId(humanHit.object) as HumanId;
          const humanPosition = runtime.humanPositions.get(humanId);
          if (humanPosition) {
            const away = new THREE_REF.Vector3()
              .subVectors(runtime.player.position, humanPosition)
              .setY(0);
            if (away.lengthSq() < 0.01) {
              away.set(1, 0, 0);
            }
            away.normalize();
            runtime.clickTarget = humanPosition
              .clone()
              .add(away.multiplyScalar(WORLD_CONFIG.interactDistance - 0.35));
            runtime.pendingNpcId = null;
            runtime.pendingHumanId = humanId;
            runtime.pendingObjectId = null;
          }
          return;
        }

        const objectHit = hits.find((hit) => findObjectId(hit.object));
        if (objectHit) {
          const objectId = findObjectId(objectHit.object) as AquariusObjectId;
          const objectPosition = runtime.objectPositions.get(objectId);
          if (objectPosition) {
            const away = new THREE_REF.Vector3()
              .subVectors(runtime.player.position, objectPosition)
              .setY(0);
            if (away.lengthSq() < 0.01) {
              away.set(1, 0, 0);
            }
            away.normalize();
            runtime.clickTarget = objectPosition
              .clone()
              .add(away.multiplyScalar(WORLD_CONFIG.interactDistance - 0.35));
            runtime.pendingObjectId = objectId;
            runtime.pendingNpcId = null;
            runtime.pendingHumanId = null;
          }
          return;
        }

        const groundHit = hits.find((hit) => hit.object === ground);
        if (groundHit) {
          const point = clampToWorld(groundHit.point.x, groundHit.point.z);
          runtime.clickTarget = new THREE_REF.Vector3(point.x, 0, point.z);
          runtime.pendingNpcId = null;
          runtime.pendingHumanId = null;
          runtime.pendingObjectId = null;
        }
      };

      const resize = () => runtime.resize();
      window.addEventListener("resize", resize);
      canvas.addEventListener("pointerdown", handlePointerDown);
      canvas.addEventListener("pointermove", handlePointerMove);
      canvas.addEventListener("pointerup", handlePointerUp);

      runtime.dispose = () => {
        window.cancelAnimationFrame(runtime.animationId);
        window.removeEventListener("resize", resize);
        canvas.removeEventListener("pointerdown", handlePointerDown);
        canvas.removeEventListener("pointermove", handlePointerMove);
        canvas.removeEventListener("pointerup", handlePointerUp);
        controls.dispose();
        renderer.dispose();
      };

      setDefaultCameraView(runtime, true);
      runtimeRef.current = runtime;
      runtime.resize();
      setProgress(100);
      setPhase("intro");

      const animate = () => {
        const delta = Math.min(runtime.clock.getDelta(), 0.05);
        runtime.frame += 1;
        updateRuntime(runtime, delta, {
          phase: phaseRef.current,
          dialogue: dialogueRef.current,
          humanDialogue: humanDialogueRef.current,
          artifact: artifactRef.current,
          onRegion: setCurrentRegion,
          onNearestNpc: setNearestNpcId,
          onNearestTarget: setNearestTarget,
          onOpenDialogue: (id) => openDialogueRef.current(id),
          onOpenHumanDialogue: (id) => openHumanDialogueRef.current(id),
          onOpenArtifact: (id) => openArtifactRef.current(id),
          isJournalOpen: () => journalOpenRef.current,
          onTutorialMove: () => {
            setTutorialStage((current) => (current === "move" ? "look" : current));
          },
          onFootstep: () => playToneRef.current(180, 0.035),
        });
        renderer.render(scene, camera);
        runtime.animationId = window.requestAnimationFrame(animate);
      };
      animate();
    }

    void boot();

    return () => {
      cancelled = true;
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const runtime = runtimeRef.current;
      if (
        MOVEMENT_KEYS.has(event.code) ||
        INTERACTION_KEYS.has(event.code) ||
        JUMP_KEYS.has(event.code) ||
        JOURNAL_KEYS.has(event.code) ||
        RESET_CAMERA_KEYS.has(event.code)
      ) {
        event.preventDefault();
      }

      if (runtime && MOVEMENT_KEYS.has(event.code)) {
        runtime.keys.add(event.code);
        runtime.clickTarget = null;
        runtime.pendingNpcId = null;
        runtime.pendingHumanId = null;
        runtime.pendingObjectId = null;
      }

      if (event.repeat) {
        return;
      }

      if (event.code === "Escape") {
        if (dialogueRef.current) {
          closeDialogue();
          return;
        }
        if (humanDialogueRef.current) {
          closeHumanDialogue();
          return;
        }
        if (artifactRef.current) {
          closeArtifact();
          return;
        }
        if (journalOpenRef.current) {
          setJournalOpen(false);
          return;
        }
      }

      if (JOURNAL_KEYS.has(event.code) && phaseRef.current === "playing") {
        toggleJournal();
        return;
      }

      if (JUMP_KEYS.has(event.code) && phaseRef.current === "playing") {
        if (dialogueRef.current || humanDialogueRef.current || artifactRef.current) {
          advanceDialogue();
          return;
        }
        requestJump();
        return;
      }

      if (RESET_CAMERA_KEYS.has(event.code) && phaseRef.current === "playing" && runtime) {
        runtime.cameraReturnToDefault = true;
        setToast("已回到預設視角");
        window.setTimeout(() => setToast(""), 1200);
        return;
      }

      if (INTERACTION_KEYS.has(event.code) && phaseRef.current === "playing" && !journalOpenRef.current) {
        advanceDialogue();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      runtimeRef.current?.keys.delete(event.code);
    };

    const clearKeys = () => {
      runtimeRef.current?.keys.clear();
    };

    window.addEventListener("keydown", handleKeyDown, { passive: false });
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", clearKeys);
    document.addEventListener("visibilitychange", clearKeys);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", clearKeys);
      document.removeEventListener("visibilitychange", clearKeys);
    };
  }, [advanceDialogue, closeArtifact, closeDialogue, closeHumanDialogue, requestJump, toggleJournal]);

  const openOriginStory = useCallback(() => {
    requestMusicStart();
    setStoryIndex(0);
    setIntroStep("story");
    playTone(520, 0.12);
  }, [playTone, requestMusicStart]);

  const openCharacterSetup = useCallback(() => {
    requestMusicStart();
    setIntroStep("setup");
    playTone(520, 0.12);
  }, [playTone, requestMusicStart]);

  const returnToLanding = useCallback(() => {
    setIntroStep("landing");
    playTone(320, 0.08);
  }, [playTone]);

  const advanceStoryPage = useCallback(() => {
    setStoryIndex((current) => {
      if (current >= AQUARIUS_ORIGIN_STORY.length) {
        setIntroStep("setup");
        return current;
      }
      return current + 1;
    });
    playTone(540, 0.08);
  }, [playTone]);

  const previousStoryPage = useCallback(() => {
    setStoryIndex((current) => {
      if (current <= 0) {
        setIntroStep("landing");
        return 0;
      }
      return current - 1;
    });
    playTone(340, 0.08);
  }, [playTone]);

  const enterWorld = useCallback(() => {
    requestMusicStart();
    setPlayerName((current) => current.trim() || "player1");
    const runtime = runtimeRef.current;
    if (runtime) {
      runtime.player.position.set(PLAYER_START.x, 0, PLAYER_START.z);
      runtime.velocity.set(0, 0, 0);
      runtime.clickTarget = null;
      runtime.pendingNpcId = null;
      runtime.pendingHumanId = null;
      runtime.pendingObjectId = null;
      setDefaultCameraView(runtime, true);
    }
    setPhase("playing");
    setToast("星球已開放登陸");
    window.setTimeout(() => setToast(""), 1800);
    playTone(620, 0.16);
  }, [playTone, requestMusicStart]);

  const returnToSetupFromGame = useCallback(() => {
    const runtime = runtimeRef.current;
    if (runtime) {
      runtime.keys.clear();
      runtime.joystick = { x: 0, y: 0 };
      runtime.velocity.set(0, 0, 0);
      runtime.controls.enableRotate = true;
      runtime.cameraReturnToDefault = true;
    }
    setJournalOpen(false);
    setHelpOpen(false);
    setDialogue(null);
    setHumanDialogue(null);
    setArtifact(null);
    setPhase("intro");
    setIntroStep("setup");
    playTone(320, 0.08);
  }, [playTone]);

  const cycleQuality = useCallback(() => {
    setQuality((current) =>
      current === "low" ? "medium" : current === "medium" ? "high" : "low"
    );
  }, []);

  const resetCamera = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    runtime.cameraReturnToDefault = true;
    setToast("已回到預設視角");
    window.setTimeout(() => setToast(""), 1200);
  }, []);

  const handleJoystickStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setJoystickActive(true);
  }, []);

  const handleJoystickMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const rawX = event.clientX - centerX;
    const rawY = event.clientY - centerY;
    const length = Math.min(1, Math.hypot(rawX, rawY) / 42);
    const angle = Math.atan2(rawY, rawX);
    const x = Math.cos(angle) * length;
    const y = Math.sin(angle) * length;
    setJoystickKnob({ x: x * 32, y: y * 32 });
    if (runtimeRef.current) {
      runtimeRef.current.joystick = { x, y };
      runtimeRef.current.clickTarget = null;
      runtimeRef.current.pendingNpcId = null;
      runtimeRef.current.pendingHumanId = null;
      runtimeRef.current.pendingObjectId = null;
    }
  }, []);

  const handleJoystickEnd = useCallback(() => {
    setJoystickActive(false);
    setJoystickKnob({ x: 0, y: 0 });
    if (runtimeRef.current) {
      runtimeRef.current.joystick = { x: 0, y: 0 };
    }
  }, []);

  const interactionLabel =
    nearestTarget?.kind === "npc" && nearestNpc && phase === "playing"
      ? `E｜與 ${nearestNpc.title} 交談`
      : nearestTarget?.kind === "human" && nearestHuman && phase === "playing"
        ? `E｜聽 ${nearestHuman.title} 的城市傳說`
      : nearestTarget?.kind === "object" && nearestObject && phase === "playing"
        ? `E｜觀察 ${nearestObject.title}`
        : "";

  return (
    <main className="archive-shell">
      <section className="scene-stage" aria-label="The Aquarius Observatory">
        <canvas ref={canvasRef} className="game-canvas" />
      </section>

      {phase === "loading" ? (
        <section className="loading-screen" aria-label="載入中">
          <div className="astro-loader" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p>{loadingText}</p>
          <div className="load-track">
            <span style={{ width: `${progress}%` }} />
          </div>
          <strong>{progress}%</strong>
          <small>Kenney Blocky Characters / CC0</small>
        </section>
      ) : null}

      {phase === "intro" ? (
        <section
          className={`intro-screen ${
            introStep === "setup"
              ? "setup-screen"
              : introStep === "story"
                ? "story-screen"
                : "landing-screen"
          }`}
          aria-label={
            introStep === "setup"
              ? "選擇角色"
              : introStep === "story"
                ? "水瓶座起源"
                : "登陸星球"
          }
        >
          <div className="intro-audio-control" aria-label="背景音樂控制">
            <button type="button" onClick={toggleMusic} aria-pressed={musicEnabled}>
              {musicEnabled ? "音樂 ON" : "音樂 OFF"}
            </button>
          </div>
          {introStep === "landing" ? (
            <div className="landing-panel">
              <p className="eyebrow">THE AQUARIUS PLANET</p>
              <h1>AQUARIUS ARCHIVE</h1>
              <h2>水瓶座外星城市星球</h2>
              <p>在發光水道與糖果色街區之間，和水瓶人格、人類居民、飛牛與奇怪動物一起收集城市傳說。</p>
              <div className="landing-origin">
                <span>冬夜星群</span>
                <span>倒水者神話</span>
                <span>未來城市</span>
              </div>
              <div className="landing-actions">
                <button className="enter-world-button" type="button" onClick={openOriginStory}>
                  進入起源
                </button>
                <button className="secondary-button skip-button" type="button" onClick={openCharacterSetup}>
                  Skip
                </button>
              </div>
            </div>
          ) : introStep === "story" ? (
            <>
              <button
                className="circle-back-button"
                type="button"
                onClick={previousStoryPage}
                aria-label="返回上一頁"
              >
                ←
              </button>
              <button className="story-skip-button" type="button" onClick={openCharacterSetup}>
                Skip
              </button>
              <div className="story-pager" aria-label="水瓶座起源故事">
                {storyIndex < AQUARIUS_ORIGIN_STORY.length ? (
                  <article className="story-chapter" key={AQUARIUS_ORIGIN_STORY[storyIndex].chapter}>
                    <p className="eyebrow">{AQUARIUS_ORIGIN_STORY[storyIndex].chapter}</p>
                    <h2>{AQUARIUS_ORIGIN_STORY[storyIndex].title}</h2>
                    <p>{AQUARIUS_ORIGIN_STORY[storyIndex].copy}</p>
                    <span>{String(storyIndex + 1).padStart(2, "0")}</span>
                  </article>
                ) : (
                  <article className="story-chapter story-finale">
                  <p className="eyebrow">ENTER THE COMMONS</p>
                  <h2>現在，選一個身體進城。</h2>
                  <p>你的名字可以空白，星球會先叫你 player1。角色可以是人類、外星人，也可以是一隻準備闖入城市傳說的恐龍。</p>
                </article>
                )}
                <div className="story-page-actions">
                  <span>
                    {Math.min(storyIndex + 1, AQUARIUS_ORIGIN_STORY.length + 1)} / {AQUARIUS_ORIGIN_STORY.length + 1}
                  </span>
                  <button className="enter-world-button" type="button" onClick={storyIndex < AQUARIUS_ORIGIN_STORY.length ? advanceStoryPage : openCharacterSetup}>
                    {storyIndex < AQUARIUS_ORIGIN_STORY.length ? "下一頁" : "選擇角色"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <button
                className="circle-back-button"
                type="button"
                onClick={returnToLanding}
                aria-label="返回首頁"
              >
                ←
              </button>
              <div className="avatar-setup-layout">
                <aside className="avatar-preview-panel" aria-label={`${selectedAvatarData.title} 3D 預覽`}>
                  <canvas ref={previewCanvasRef} className="avatar-preview-canvas" />
                  <figure className="avatar-preview-fallback" data-avatar={selectedAvatar} aria-hidden="true">
                    <span className="avatar-preview-shadow" />
                    <span className="avatar-preview-tail" />
                    <span className="avatar-preview-body" />
                    <span className="avatar-preview-head" />
                    <span className="avatar-preview-arm left" />
                    <span className="avatar-preview-arm right" />
                    <span className="avatar-preview-leg left" />
                    <span className="avatar-preview-leg right" />
                  </figure>
                  <div className="avatar-preview-copy">
                    <span>SELECTED AVATAR</span>
                    <strong>{selectedAvatarData.title}</strong>
                    <p>{selectedAvatarData.description}</p>
                  </div>
                </aside>
                <div className="player-setup" aria-label="玩家設定">
                  <div className="setup-heading">
                    <p className="eyebrow">CREATE YOUR VISITOR</p>
                    <h2>選擇你的星球角色</h2>
                  </div>
                  <label>
                    <span>玩家名字（可不填）</span>
                    <input
                      value={playerName}
                      onChange={(event) => setPlayerName(event.target.value)}
                      placeholder="player1"
                      maxLength={18}
                    />
                  </label>
                  <div className="avatar-picker" aria-label="角色選擇">
                    {PLAYER_AVATARS.map((avatar) => (
                      <button
                        key={avatar.id}
                        type="button"
                        className={selectedAvatar === avatar.id ? "selected" : ""}
                        onClick={() => setSelectedAvatar(avatar.id)}
                      >
                        <span className="avatar-head" data-avatar={avatar.id} aria-hidden="true" />
                        <span>
                          <strong>{avatar.title}</strong>
                          <small>{avatar.description}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="setup-actions">
                    <button className="enter-world-button" type="button" onClick={enterWorld}>
                      登陸星球
                    </button>
                    <button className="secondary-button" type="button" onClick={openOriginStory}>
                      返回起源
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
          <div className="intro-controls" aria-label="基本操作">
            <span>WASD / 方向鍵：移動</span>
            <span>滑鼠拖曳：旋轉鏡頭</span>
            <span>R：預設視角</span>
            <span>Space：跳躍</span>
            <span>E：互動</span>
          </div>
        </section>
      ) : null}

      {phase === "playing" ? (
        <>
          <button
            className="circle-back-button in-game"
            type="button"
            onClick={returnToSetupFromGame}
            aria-label="返回角色選擇"
          >
            ←
          </button>
          <header className="minimal-hud" aria-label="目前狀態">
            <div>
              <span>♒</span>
              <strong>{playerName.trim() || "player1"}｜{currentRegion}</strong>
            </div>
            <nav aria-label="遊戲設定">
              <button type="button" onClick={resetCamera} title="回到預設視角">
                視角
              </button>
              <button type="button" onClick={toggleJournal} title="星象手札">
                手札
              </button>
              <button
                type="button"
                onClick={toggleMusic}
                title="背景音樂"
                aria-pressed={musicEnabled}
              >
                {musicEnabled ? "音樂" : "無音樂"}
              </button>
              <button
                type="button"
                onClick={() => setMuted((value) => !value)}
                title="音效"
              >
                {muted ? "靜音" : "音效"}
              </button>
              <button type="button" onClick={cycleQuality} title="畫質">
                {quality.toUpperCase()}
              </button>
            </nav>
          </header>

          {interactionLabel ? (
            <div className="interaction-hint" aria-live="polite">
              {interactionLabel}
            </div>
          ) : null}

          <aside className={helpOpen ? "shortcut-help open" : "shortcut-help"} aria-label="快捷指令">
            <button
              className="shortcut-help-toggle"
              type="button"
              onClick={() => setHelpOpen((value) => !value)}
              aria-expanded={helpOpen}
              aria-label="查看快捷指令"
            >
              ?
            </button>
            {helpOpen ? (
              <div className="shortcut-help-panel">
                <strong>快捷指令</strong>
                <span>WASD / 方向鍵：移動</span>
                <span>滑鼠拖曳：旋轉鏡頭</span>
                <span>Space：跳躍 / 對話繼續</span>
                <span>E：互動</span>
                <span>R：預設視角</span>
                <span>Tab：星象手札</span>
              </div>
            ) : null}
          </aside>

          <div className="mobile-joystick">
            <div
              className={joystickActive ? "joystick-base active" : "joystick-base"}
              onPointerDown={handleJoystickStart}
              onPointerMove={handleJoystickMove}
              onPointerUp={handleJoystickEnd}
              onPointerCancel={handleJoystickEnd}
            >
              <span
                style={{
                  transform: `translate(${joystickKnob.x}px, ${joystickKnob.y}px)`,
                }}
              />
            </div>
          </div>

          <button
            className="mobile-action"
            type="button"
            onClick={advanceDialogue}
            aria-label="互動"
          >
            E
          </button>

          <button
            className="mobile-jump"
            type="button"
            onClick={requestJump}
            aria-label="跳躍"
          >
            跳
          </button>
        </>
      ) : null}

      {dialogue && dialogueNpc ? (
        <section className="dialogue-panel" aria-label={`${dialogueNpc.title} 對話`}>
          <div className="dialogue-title">
            <div>
              <span>{dialogueNpc.english}</span>
              <h2>{dialogueNpc.title}</h2>
            </div>
            <button type="button" onClick={closeDialogue} aria-label="關閉對話">
              Esc
            </button>
          </div>
          <p className="dialogue-text">
            {dialogue.answer ?? dialogueLines[dialogue.lineIndex] ?? dialogueNpc.quote}
          </p>
          <p className="dialogue-key-hint">Space 繼續</p>
          {dialogue.lineIndex >= 2 ? (
            <div className="dialogue-choices">
              {DIALOGUE_QUESTIONS.map((question) => (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => chooseQuestion(question.id)}
                >
                  {question.label}
                </button>
              ))}
              <button type="button" onClick={closeDialogue}>
                離開
              </button>
            </div>
          ) : (
            <button className="continue-dialogue" type="button" onClick={advanceDialogue}>
              繼續
            </button>
          )}
        </section>
      ) : null}

      {humanDialogue && dialogueHuman ? (
        <section className="dialogue-panel human-panel" aria-label={`${dialogueHuman.title} 城市傳說`}>
          <div className="dialogue-title">
            <div>
              <span>{dialogueHuman.english}</span>
              <h2>{dialogueHuman.title}</h2>
            </div>
            <button type="button" onClick={closeHumanDialogue} aria-label="關閉人類對話">
              Esc
            </button>
          </div>
          <p className="artifact-trait">{dialogueHuman.role}</p>
          <p className="dialogue-text">
            {humanDialogueLines[humanDialogue.lineIndex] ?? dialogueHuman.legend}
          </p>
          <p className="dialogue-key-hint">Space 繼續</p>
          <button className="continue-dialogue" type="button" onClick={advanceDialogue}>
            {humanDialogue.lineIndex < 2 ? "繼續聽" : "離開"}
          </button>
        </section>
      ) : null}

      {artifact && activeArtifact ? (
        <section className="artifact-panel" aria-label={`${activeArtifact.title} 互動`}>
          <div className="dialogue-title">
            <div>
              <span>{activeArtifact.english}</span>
              <h2>{activeArtifact.title}</h2>
            </div>
            <button type="button" onClick={closeArtifact} aria-label="關閉物件">
              Esc
            </button>
          </div>
          <p className="artifact-trait">{activeArtifact.trait}</p>
          <p className="dialogue-text">{activeArtifact.response}</p>
          <p className="dialogue-key-hint">Space 收起</p>
          <button className="continue-dialogue" type="button" onClick={closeArtifact}>
            收起
          </button>
        </section>
      ) : null}

      {journalOpen ? (
        <section className="journal-panel" aria-label="星象手札">
          <div className="journal-heading">
            <div>
              <p className="eyebrow">ASTRAL FIELD NOTES</p>
              <h2>星象手札</h2>
            </div>
            <button type="button" onClick={() => setJournalOpen(false)}>
              Esc
            </button>
          </div>
          <div className="constellation-progress">
            {NPCS.map((npc, index) => (
              <span
                key={npc.id}
                className={unlocked.has(npc.id) ? "unlocked" : ""}
                style={
                  {
                    "--node-x": `${12 + (index % 4) * 25}%`,
                    "--node-y": `${index < 4 ? 30 : 70}%`,
                } as CSSProperties
                }
              />
            ))}
            <strong>
              已遇見 {unlocked.size} / {NPCS.length} 位水瓶人格
            </strong>
          </div>
          <div className="journal-grid">
            {NPCS.map((npc) => {
              const isUnlocked = unlocked.has(npc.id);
              return (
                <article className={isUnlocked ? "journal-card" : "journal-card locked"} key={npc.id}>
                  <span className="fragment" style={{ background: npc.accent }} />
                  <h3>{isUnlocked ? npc.title : "未知人格"}</h3>
                  <p>{isUnlocked ? npc.english : "????"}</p>
                  <small>{isUnlocked ? npc.keywords.join(" / ") : "尚未記錄"}</small>
                  <blockquote>{isUnlocked ? npc.quote : "靠近星球上的發光人物，解鎖這段星象記錄。"}</blockquote>
                  {isUnlocked ? (
                    <dl>
                      <dt>優勢</dt>
                      <dd>{npc.strength}</dd>
                      <dt>陰影</dt>
                      <dd>{npc.shadow}</dd>
                    </dl>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </main>
  );
}

function createLighting(THREE_REF: typeof THREE, scene: THREE.Scene) {
  scene.add(new THREE_REF.HemisphereLight("#dbeafe", "#130f1f", 1.7));
  const moon = new THREE_REF.DirectionalLight("#dbeafe", 2.6);
  moon.position.set(10, 16, 9);
  scene.add(moon);

  const fountain = new THREE_REF.PointLight("#5eead4", 16, 22);
  fountain.position.set(0, 2.2, 0);
  scene.add(fountain);

  const workshop = new THREE_REF.PointLight("#f6b04d", 10, 18);
  workshop.position.set(-13, 3, 0);
  scene.add(workshop);

  const temple = new THREE_REF.PointLight("#fb7185", 10, 18);
  temple.position.set(13, 3, 1);
  scene.add(temple);

  const observatory = new THREE_REF.SpotLight("#93c5fd", 34, 34, Math.PI / 5, 0.65, 1.3);
  observatory.position.set(0, 12, -13);
  observatory.target.position.set(0, 0, -17);
  scene.add(observatory);
  scene.add(observatory.target);
}

function createWorld(THREE_REF: typeof THREE, root: THREE.Group) {
  const ground = new THREE_REF.Mesh(
    new THREE_REF.CircleGeometry(WORLD_CONFIG.worldRadius + 1, 160),
    new THREE_REF.MeshStandardMaterial({
      color: "#071124",
      transparent: true,
      opacity: 0.36,
      roughness: 0.92,
      metalness: 0.04,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.name = "archive-ground";
  root.add(ground);

  addPlanetAtmosphere(THREE_REF, root);
  addAquariusToyCity(THREE_REF, root);

  return ground;
}

function addCityModelAssets(
  THREE_REF: typeof THREE,
  root: THREE.Group,
  loadedModels: Map<string, ModelResource>,
  cloneAnimatedModel: CloneModelFn,
  animationLibrary: THREE.AnimationClip[],
  actorMixers: THREE.AnimationMixer[]
) {
  const ambientModels: AmbientModel[] = [];
  CITY_MODEL_ASSETS.forEach((asset) => {
    if (shouldSkipLooseCityAsset(asset)) {
      return;
    }
    const source = loadedModels.get(asset.asset);
    if (!source) {
      return;
    }
    const group = new THREE_REF.Group();
    group.name = asset.id;
    group.position.set(scaleWorldValue(asset.position[0]), asset.position[1], scaleWorldValue(asset.position[2]));
    group.rotation.set(...asset.rotation);
    group.scale.set(...asset.scale);
    const model = cloneModel(THREE_REF, source.scene, cloneAnimatedModel);
    model.traverse((child) => {
      child.userData.cityAssetId = asset.id;
    });
    group.add(model);
    root.add(group);
    if (asset.motion) {
      const motionAction = (asset.motionAction ??
        (asset.motion === "wander" ? "walk" : "idle")) as ActorActionName;
      const animator =
        source.animations.length > 0
          ? createActorAnimator(THREE_REF, model, source.animations, animationLibrary)
          : undefined;
      if (animator) {
        actorMixers.push(animator.mixer);
        playActorAction(animator, motionAction, 0);
      }
      const home = new THREE_REF.Vector3(scaleWorldValue(asset.position[0]), asset.position[1], scaleWorldValue(asset.position[2]));
      ambientModels.push({
        group,
        home,
        target: pickWanderTarget(THREE_REF, home, scaleWorldValue(asset.motionRadius ?? 0.8)),
        mode: asset.motion,
        radius: scaleWorldValue(asset.motionRadius ?? 0.8),
        speed: asset.motionSpeed ?? 0.35,
        pauseUntil: 0,
        animator,
        motionAction,
      });
    }
  });
  const skyWhale = createSkyWhale(THREE_REF);
  const whaleHome = new THREE_REF.Vector3(-18, 7.6, -23);
  skyWhale.position.copy(whaleHome);
  root.add(skyWhale);
  ambientModels.push({
    group: skyWhale,
    home: whaleHome,
    target: pickWanderTarget(THREE_REF, whaleHome, 28),
    mode: "wander",
    radius: 28,
    speed: 1.25,
    pauseUntil: 0,
    motionAction: "idle",
  });
  return ambientModels;
}

function addPlanetAtmosphere(THREE_REF: typeof THREE, root: THREE.Group) {
  const rim = new THREE_REF.Mesh(
    new THREE_REF.TorusGeometry(WORLD_CONFIG.worldRadius + 0.9, 0.18, 12, 192),
    new THREE_REF.MeshBasicMaterial({ color: "#7dd3fc", transparent: true, opacity: 0.42 })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.08;
  root.add(rim);

  const atmosphere = new THREE_REF.Mesh(
    new THREE_REF.SphereGeometry(WORLD_CONFIG.worldRadius + 5.5, 48, 16),
    new THREE_REF.MeshBasicMaterial({
      color: "#5eead4",
      transparent: true,
      opacity: 0.045,
      side: THREE_REF.BackSide,
      depthWrite: false,
    })
  );
  atmosphere.scale.y = 0.32;
  atmosphere.position.y = 1.8;
  root.add(atmosphere);

  [0.18, -0.22].forEach((tilt, index) => {
    const orbit = new THREE_REF.Mesh(
      new THREE_REF.TorusGeometry(WORLD_CONFIG.worldRadius + 5 + index * 2.2, 0.035, 8, 220),
      new THREE_REF.MeshBasicMaterial({
        color: index === 0 ? "#c4b5fd" : "#f7d9ff",
        transparent: true,
        opacity: 0.28,
      })
    );
    orbit.rotation.set(Math.PI / 2 + tilt, index * 0.42, 0.2);
    orbit.position.y = 2.1 + index * 0.65;
    root.add(orbit);
  });
}

function addHexTerrainTiles(
  THREE_REF: typeof THREE,
  root: THREE.Group,
  soil: THREE.Material,
  stone: THREE.Material,
  water: THREE.Material
) {
  const tiles = [
    [-20, -10, 1.35, stone],
    [-17.4, -12.2, 1.08, stone],
    [-21.2, -6.8, 0.92, soil],
    [-14.8, 8.2, 1.2, soil],
    [-17.8, 11.2, 1.05, water],
    [-11.8, 17.2, 0.86, water],
    [14.8, 9.8, 1.2, soil],
    [18.4, 11.6, 1.08, stone],
    [21.2, 5.4, 0.96, soil],
    [17.6, -10.6, 1.16, stone],
    [21.2, -7.8, 0.92, soil],
    [4.2, 22.4, 0.88, water],
  ] as const;

  tiles.forEach(([x, z, scale, material], index) => {
    const tile = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(1.35 * scale, 1.45 * scale, 0.18, 6), material);
    tile.position.set(x, 0.08 + (index % 3) * 0.02, z);
    tile.rotation.y = index * 0.22;
    root.add(tile);
  });
}

function addHabitableDistricts(
  THREE_REF: typeof THREE,
  root: THREE.Group,
  habitat: THREE.Material,
  glass: THREE.Material,
  glow: THREE.Material
) {
  const homes = [
    [6.4, 6.6, 0.74, "#74f0d4"],
    [-7.1, 6.8, 0.68, "#7dd3fc"],
    [8.2, -4.2, 0.64, "#c4b5fd"],
    [16.4, 8.6, 1.15, "#74f0d4"],
    [19.4, 8.1, 0.88, "#7dd3fc"],
    [17.8, 11.2, 0.72, "#c4b5fd"],
    [-18.6, 7.8, 0.86, "#5eead4"],
  ] as const;

  homes.forEach(([x, z, scale, color], index) => {
    const base = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(1.05 * scale, 1.22 * scale, 0.42, 14), habitat);
    base.position.set(x, 0.22, z);
    root.add(base);

    const dome = new THREE_REF.Mesh(new THREE_REF.SphereGeometry(1.08 * scale, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass);
    dome.position.set(x, 0.45, z);
    root.add(dome);

    const door = new THREE_REF.Mesh(
      new THREE_REF.BoxGeometry(0.32 * scale, 0.5 * scale, 0.05),
      new THREE_REF.MeshBasicMaterial({ color })
    );
    door.position.set(x, 0.46, z - 1.08 * scale);
    root.add(door);

    const antenna = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.025, 0.035, 0.78 * scale, 7), glow);
    antenna.position.set(x + 0.5 * scale, 1.25 * scale, z + 0.35 * scale);
    antenna.rotation.z = 0.22 + index * 0.07;
    root.add(antenna);
  });
}

function addAquariusTransitRing(
  THREE_REF: typeof THREE,
  root: THREE.Group,
  stone: THREE.Material,
  glow: THREE.Material
) {
  const rail = new THREE_REF.Mesh(
    new THREE_REF.TorusGeometry(21.2, 0.045, 8, 192),
    new THREE_REF.MeshBasicMaterial({ color: "#7dd3fc", transparent: true, opacity: 0.48 })
  );
  rail.rotation.x = Math.PI / 2;
  rail.position.y = 0.48;
  root.add(rail);

  for (let index = 0; index < 20; index += 1) {
    const theta = (index / 20) * Math.PI * 2;
    const support = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.045, 0.065, 0.7, 6), stone);
    support.position.set(Math.cos(theta) * 21.2, 0.35, Math.sin(theta) * 21.2);
    root.add(support);
  }

  const train = new THREE_REF.Group();
  train.position.set(1.2, 0.78, 21.2);
  train.rotation.y = Math.PI / 2;
  for (let index = 0; index < 3; index += 1) {
    const car = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.78, 0.36, 0.42), glow);
    car.position.x = index * 0.82;
    train.add(car);
  }
  root.add(train);
}

function addAlienEcology(THREE_REF: typeof THREE, root: THREE.Group, glow: THREE.Material) {
  const leafMaterial = new THREE_REF.MeshStandardMaterial({
    color: "#3dd7b6",
    emissive: "#0f766e",
    emissiveIntensity: 0.2,
    roughness: 0.58,
  });
  const trunkMaterial = new THREE_REF.MeshStandardMaterial({
    color: "#263040",
    roughness: 0.82,
  });
  const forest = [
    [-19.2, 9.5, 1.2],
    [-16.8, 7.1, 0.9],
    [-18.2, 11.6, 0.72],
    [-8.4, 19.2, 0.82],
    [-4.5, 20.4, 0.68],
    [10.5, 18.6, 0.74],
  ] as const;

  forest.forEach(([x, z, scale], index) => {
    const trunk = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.08 * scale, 0.14 * scale, 1.05 * scale, 7), trunkMaterial);
    trunk.position.set(x, 0.54 * scale, z);
    trunk.rotation.z = Math.sin(index) * 0.18;
    root.add(trunk);

    const crown = new THREE_REF.Mesh(new THREE_REF.OctahedronGeometry(0.62 * scale, 0), leafMaterial);
    crown.position.set(x, 1.22 * scale, z);
    crown.rotation.set(index * 0.2, index * 0.7, 0.28);
    root.add(crown);

    const halo = new THREE_REF.Mesh(new THREE_REF.TorusGeometry(0.78 * scale, 0.025, 8, 40), glow);
    halo.position.set(x, 1.24 * scale, z);
    halo.rotation.x = Math.PI / 2;
    root.add(halo);
  });
}

function addLifeSupportSystems(
  THREE_REF: typeof THREE,
  root: THREE.Group,
  habitat: THREE.Material,
  glass: THREE.Material,
  water: THREE.Material
) {
  const tower = new THREE_REF.Group();
  tower.position.set(-6.1, 0, 18.3);
  const tank = new THREE_REF.Mesh(new THREE_REF.SphereGeometry(0.88, 22, 14), glass);
  tank.position.y = 2.05;
  tower.add(tank);
  const stem = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.12, 0.16, 2.2, 10), habitat);
  stem.position.y = 1.1;
  tower.add(stem);
  const basin = new THREE_REF.Mesh(new THREE_REF.TorusGeometry(1.2, 0.06, 8, 60), water);
  basin.position.y = 0.22;
  basin.rotation.x = Math.PI / 2;
  tower.add(basin);
  root.add(tower);

  for (let index = 0; index < 5; index += 1) {
    const pipe = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.035, 0.035, 2.2, 8), water);
    pipe.position.set(-7.5 + index * 0.74, 0.48, 16.7 + Math.sin(index) * 0.25);
    pipe.rotation.z = Math.PI / 2;
    root.add(pipe);

    const crop = new THREE_REF.Mesh(new THREE_REF.ConeGeometry(0.16, 0.5, 5), new THREE_REF.MeshStandardMaterial({
      color: index % 2 ? "#f6d365" : "#5eead4",
      emissive: index % 2 ? "#854d0e" : "#0f766e",
      emissiveIntensity: 0.16,
      roughness: 0.48,
    }));
    crop.position.set(-7.5 + index * 0.74, 0.78, 16.7 + Math.sin(index) * 0.25);
    root.add(crop);
  }
}

function addAquariusToyCity(THREE_REF: typeof THREE, root: THREE.Group) {
  const roadMaterial = new THREE_REF.MeshStandardMaterial({
    color: "#2e3b62",
    roughness: 0.76,
    metalness: 0.18,
  });
  const secondaryRoadMaterial = new THREE_REF.MeshStandardMaterial({
    color: "#38456e",
    roughness: 0.74,
    metalness: 0.14,
  });
  const alleyMaterial = new THREE_REF.MeshStandardMaterial({
    color: "#26314f",
    roughness: 0.82,
    metalness: 0.08,
  });
  const laneMaterial = new THREE_REF.MeshBasicMaterial({
    color: "#b8f7ff",
    transparent: true,
    opacity: 0.86,
  });
  const edgeMaterial = new THREE_REF.MeshBasicMaterial({
    color: "#d8b4fe",
    transparent: true,
    opacity: 0.72,
  });
  const waterMaterial = new THREE_REF.MeshStandardMaterial({
    color: "#55e0ff",
    emissive: "#0284c7",
    emissiveIntensity: 0.32,
    transparent: true,
    opacity: 0.76,
    roughness: 0.18,
    metalness: 0.08,
  });

  CITY_PLATFORMS.forEach((spec) => addCityPlatform(THREE_REF, root, scaleCityPlatform(spec)));
  CITY_CANALS.forEach((spec) => addCityCanal(THREE_REF, root, scaleCityCanal(spec), waterMaterial, edgeMaterial));
  CITY_ROADS.forEach((spec, index) => {
    const material =
      spec.kind === "main"
        ? roadMaterial
        : spec.kind === "secondary"
          ? secondaryRoadMaterial
          : alleyMaterial;
    addCityRoad(THREE_REF, root, scaleCityRoad(spec), material, laneMaterial, index);
  });
  CITY_BRIDGES.forEach((spec) => addCityBridge(THREE_REF, root, scaleCityBridge(spec)));
  CITY_BUILDINGS.forEach((spec) => addToyBuilding(THREE_REF, root, scaleCityBuilding(spec)));
  addCompleteVillageHouses(THREE_REF, root);
  addAquariusPlazaGlyph(THREE_REF, root);
  CITY_PROPS.forEach((spec) => addCityProp(THREE_REF, root, scaleCityProp(spec)));
  addStreetRhythm(THREE_REF, root);
  addAquariusLandmarks(THREE_REF, root);
}

function scaleCityPlatform(spec: CityPlatformSpec): CityPlatformSpec {
  const [x, z] = scaleWorldPoint(spec.position[0], spec.position[1]);
  return {
    ...spec,
    position: [x, z],
    size: [scaleWorldValue(spec.size[0]), scaleWorldValue(spec.size[1])],
  };
}

function scaleCityRoad(spec: CityRoadSpec): CityRoadSpec {
  return {
    ...spec,
    from: scaleWorldPoint(spec.from[0], spec.from[1]),
    to: scaleWorldPoint(spec.to[0], spec.to[1]),
  };
}

function scaleCityCanal(spec: CityCanalSpec): CityCanalSpec {
  return {
    ...spec,
    from: scaleWorldPoint(spec.from[0], spec.from[1]),
    to: scaleWorldPoint(spec.to[0], spec.to[1]),
  };
}

function scaleCityBridge(spec: CityBridgeSpec): CityBridgeSpec {
  return {
    ...spec,
    from: scaleWorldPoint(spec.from[0], spec.from[1]),
    to: scaleWorldPoint(spec.to[0], spec.to[1]),
  };
}

function scaleCityBuilding(spec: CityBuildingSpec): CityBuildingSpec {
  const [x, z] = scaleWorldPoint(spec.position[0], spec.position[1]);
  return {
    ...spec,
    position: [x, z],
  };
}

function scaleCityProp(spec: CityPropSpec): CityPropSpec {
  const [x, z] = scaleWorldPoint(spec.position[0], spec.position[1]);
  return {
    ...spec,
    position: [x, z],
  };
}

function addCityPlatform(
  THREE_REF: typeof THREE,
  root: THREE.Group,
  spec: CityPlatformSpec
) {
  const [x, z] = spec.position;
  const [width, depth] = spec.size;
  const group = new THREE_REF.Group();
  group.position.set(x, spec.elevation, z);
  group.rotation.y = spec.rotation ?? 0;
  const slab = new THREE_REF.Mesh(
    new THREE_REF.BoxGeometry(width, 0.24, depth),
    new THREE_REF.MeshStandardMaterial({
      color: spec.color,
      emissive: spec.color,
      emissiveIntensity: 0.08,
      roughness: 0.72,
      metalness: 0.04,
    })
  );
  slab.position.y = -0.05;
  group.add(slab);

  const lipMaterial = new THREE_REF.MeshBasicMaterial({
    color: spec.accent,
    transparent: true,
    opacity: 0.72,
  });
  const edgeThickness = 0.08;
  [
    [0, depth / 2, width, edgeThickness],
    [0, -depth / 2, width, edgeThickness],
    [width / 2, 0, edgeThickness, depth],
    [-width / 2, 0, edgeThickness, depth],
  ].forEach(([offsetX, offsetZ, edgeWidth, edgeDepth]) => {
    const edge = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(edgeWidth, 0.035, edgeDepth), lipMaterial);
    edge.position.set(offsetX, 0.09, offsetZ);
    group.add(edge);
  });
  root.add(group);
}

function addCityRoad(
  THREE_REF: typeof THREE,
  root: THREE.Group,
  spec: CityRoadSpec,
  roadMaterial: THREE.Material,
  laneMaterial: THREE.Material,
  index: number
) {
  const length = distance2(spec.from, spec.to);
  const angle = segmentRotation(spec.from, spec.to);
  const midpoint = midpoint2(spec.from, spec.to);
  const road = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(length, 0.06, spec.width), roadMaterial);
  road.position.set(midpoint[0], spec.elevation + 0.08, midpoint[1]);
  road.rotation.y = angle;
  root.add(road);

  const segments = Math.max(3, Math.floor(length / 2.2));
  for (let i = 0; i < segments; i += 1) {
    const lane = new THREE_REF.Mesh(
      new THREE_REF.BoxGeometry(0.72, 0.022, 0.055),
      laneMaterial
    );
    const offset = -length / 2 + 0.9 + i * ((length - 1.8) / Math.max(1, segments - 1));
    lane.position.set(midpoint[0], spec.elevation + 0.125, midpoint[1]);
    lane.rotation.y = angle;
    lane.translateX(offset);
    root.add(lane);
  }

  for (let i = 0; i < Math.min(5, segments); i += 1) {
    const wave = new THREE_REF.Mesh(
      new THREE_REF.BoxGeometry(0.24, 0.024, 0.055),
      laneMaterial
    );
    const offset = -length / 2 + 1.1 + i * 1.05;
    wave.position.set(midpoint[0], spec.elevation + 0.145, midpoint[1]);
    wave.rotation.y = angle + Math.sin(i + index) * 0.5;
    wave.translateX(offset);
    wave.translateZ((i % 2 ? -1 : 1) * spec.width * 0.22);
    root.add(wave);
  }
}

function addCityCanal(
  THREE_REF: typeof THREE,
  root: THREE.Group,
  spec: CityCanalSpec,
  waterMaterial: THREE.Material,
  edgeMaterial: THREE.Material
) {
  const length = distance2(spec.from, spec.to);
  const angle = segmentRotation(spec.from, spec.to);
  const midpoint = midpoint2(spec.from, spec.to);
  const water = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(length, 0.035, spec.width), waterMaterial);
  water.position.set(midpoint[0], spec.elevation, midpoint[1]);
  water.rotation.y = angle;
  root.add(water);

  [-1, 1].forEach((side) => {
    const edge = new THREE_REF.Mesh(
      new THREE_REF.BoxGeometry(length, 0.035, 0.055),
      edgeMaterial
    );
    edge.position.set(midpoint[0], spec.elevation + 0.045, midpoint[1]);
    edge.rotation.y = angle;
    edge.translateZ(side * (spec.width / 2 + 0.08));
    root.add(edge);
  });
}

function addCityBridge(
  THREE_REF: typeof THREE,
  root: THREE.Group,
  spec: CityBridgeSpec
) {
  const length = distance2(spec.from, spec.to);
  const angle = segmentRotation(spec.from, spec.to);
  const midpoint = midpoint2(spec.from, spec.to);
  const deckMaterial = new THREE_REF.MeshStandardMaterial({
    color: "#eef2ff",
    emissive: spec.accent,
    emissiveIntensity: 0.18,
    roughness: 0.46,
    metalness: 0.16,
  });
  const deck = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(length, 0.16, spec.width), deckMaterial);
  deck.position.set(midpoint[0], spec.elevation, midpoint[1]);
  deck.rotation.y = angle;
  root.add(deck);
  const railMaterial = new THREE_REF.MeshBasicMaterial({ color: spec.accent, transparent: true, opacity: 0.82 });
  [-1, 1].forEach((side) => {
    const rail = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(length, 0.08, 0.055), railMaterial);
    rail.position.set(midpoint[0], spec.elevation + 0.22, midpoint[1]);
    rail.rotation.y = angle;
    rail.translateZ(side * (spec.width / 2 + 0.12));
    root.add(rail);
  });
}

function addToyBuilding(THREE_REF: typeof THREE, root: THREE.Group, spec: CityBuildingSpec) {
  const [width, depth] = spec.size;
  const group = new THREE_REF.Group();
  group.position.set(spec.position[0], spec.elevation, spec.position[1]);
  group.rotation.y = spec.rotation ?? 0;
  const bodyMaterial = new THREE_REF.MeshStandardMaterial({
    color: spec.color,
    emissive: spec.color,
    emissiveIntensity: 0.05,
    roughness: 0.58,
    metalness: 0.08,
  });
  const capMaterial = new THREE_REF.MeshStandardMaterial({
    color: "#e9d5ff",
    emissive: spec.accent,
    emissiveIntensity: 0.13,
    roughness: 0.42,
    metalness: 0.12,
  });
  const glassMaterial = new THREE_REF.MeshStandardMaterial({
    color: spec.accent,
    emissive: spec.accent,
    emissiveIntensity: 0.34,
    transparent: true,
    opacity: 0.46,
    roughness: 0.14,
  });
  const lightMaterial = new THREE_REF.MeshBasicMaterial({ color: spec.accent });

  const base = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(width, 0.28, depth), capMaterial);
  base.position.y = 0.14;
  group.add(base);

  if (spec.kind === "tower") {
    const levels = Math.max(2, Math.round(spec.height / 1.1));
    for (let level = 0; level < levels; level += 1) {
      const scale = 1 - level * 0.08;
      const body = new THREE_REF.Mesh(
        new THREE_REF.BoxGeometry(width * scale, spec.height / levels, depth * scale),
        level % 2 ? capMaterial : bodyMaterial
      );
      body.position.y = 0.28 + (spec.height / levels) * (level + 0.5);
      group.add(body);
    }
    const roof = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(width * 0.82, 0.24, depth * 0.82), glassMaterial);
    roof.position.y = spec.height + 0.52;
    group.add(roof);
    addRoofSolarPanels(THREE_REF, group, spec, spec.height + 0.72);
  } else if (spec.kind === "dome") {
    const body = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(width * 0.45, width * 0.52, spec.height * 0.52, 18), bodyMaterial);
    body.position.y = 0.5 + spec.height * 0.26;
    group.add(body);
    const dome = new THREE_REF.Mesh(
      new THREE_REF.SphereGeometry(width * 0.58, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      glassMaterial
    );
    dome.position.y = 0.58 + spec.height * 0.54;
    group.add(dome);
  } else if (spec.kind === "coral") {
    const stems = 4;
    for (let index = 0; index < stems; index += 1) {
      const theta = (index / stems) * Math.PI * 2;
      const height = spec.height * (0.58 + index * 0.11);
      const stem = new THREE_REF.Mesh(
        new THREE_REF.CylinderGeometry(0.26 + index * 0.03, 0.34 + index * 0.03, height, 12),
        bodyMaterial
      );
      stem.position.set(Math.cos(theta) * width * 0.22, 0.32 + height / 2, Math.sin(theta) * depth * 0.2);
      group.add(stem);
      const cap = new THREE_REF.Mesh(new THREE_REF.SphereGeometry(0.36 + index * 0.04, 16, 12), glassMaterial);
      cap.position.set(stem.position.x, 0.34 + height, stem.position.z);
      group.add(cap);
    }
  } else if (spec.kind === "solar") {
    const body = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(width, spec.height, depth), bodyMaterial);
    body.position.y = 0.28 + spec.height / 2;
    group.add(body);
    addRoofSolarPanels(THREE_REF, group, spec, spec.height + 0.48);
  } else if (spec.kind === "greenhouse") {
    for (let level = 0; level < 3; level += 1) {
      const tray = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(width, 0.18, depth), bodyMaterial);
      tray.position.y = 0.45 + level * 0.62;
      group.add(tray);
      const glass = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(width * 0.88, 0.42, depth * 0.82), glassMaterial);
      glass.position.y = 0.75 + level * 0.62;
      group.add(glass);
    }
  } else if (spec.kind === "observatory") {
    const body = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(width * 0.43, width * 0.52, spec.height * 0.74, 16), bodyMaterial);
    body.position.y = 0.38 + spec.height * 0.37;
    group.add(body);
    const dome = new THREE_REF.Mesh(new THREE_REF.SphereGeometry(width * 0.47, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), glassMaterial);
    dome.position.y = spec.height + 0.28;
    group.add(dome);
    const telescope = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.09, 0.15, 1.05, 12), capMaterial);
    telescope.position.set(0.34, spec.height + 0.78, -0.18);
    telescope.rotation.set(Math.PI / 2.5, 0, -0.45);
    group.add(telescope);
  } else if (spec.kind === "workshop") {
    const body = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(width, spec.height * 0.68, depth), bodyMaterial);
    body.position.y = 0.34 + spec.height * 0.34;
    group.add(body);
    addRoofSolarPanels(THREE_REF, group, spec, spec.height * 0.8);
    for (let index = 0; index < 3; index += 1) {
      const gear = new THREE_REF.Mesh(new THREE_REF.TorusGeometry(0.28 + index * 0.08, 0.035, 8, 28), capMaterial);
      gear.position.set(-width * 0.28 + index * 0.42, 1.05 + index * 0.25, -depth / 2 - 0.05);
      gear.rotation.x = Math.PI / 2;
      group.add(gear);
    }
  } else if (spec.kind === "art") {
    const wall = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(width, spec.height, depth * 0.28), bodyMaterial);
    wall.position.set(0, 0.34 + spec.height / 2, 0);
    wall.rotation.y = 0.18;
    group.add(wall);
    ["#f6d365", "#7dd3fc", "#c084fc"].forEach((color, index) => {
      const slash = new THREE_REF.Mesh(
        new THREE_REF.BoxGeometry(width * 0.36, 0.08, 0.05),
        new THREE_REF.MeshBasicMaterial({ color })
      );
      slash.position.set(-width * 0.24 + index * 0.42, 1.1 + index * 0.35, -depth * 0.18);
      slash.rotation.set(0, 0.18, -0.5 + index * 0.38);
      group.add(slash);
    });
  } else if (spec.kind === "harbor") {
    const body = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(width, spec.height * 0.58, depth), bodyMaterial);
    body.position.y = 0.32 + spec.height * 0.29;
    group.add(body);
    const roof = new THREE_REF.Mesh(new THREE_REF.ConeGeometry(Math.max(width, depth) * 0.5, 0.52, 4), capMaterial);
    roof.position.y = spec.height * 0.72 + 0.42;
    roof.rotation.y = Math.PI / 4;
    group.add(roof);
  } else {
    const body = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(width * 0.92, spec.height * 0.72, depth * 0.86), bodyMaterial);
    body.position.y = 0.34 + spec.height * 0.36;
    group.add(body);
    const roof = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(width, 0.42, depth), capMaterial);
    roof.position.y = 0.48 + spec.height * 0.74;
    group.add(roof);
  }

  const door = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.42, 0.58, 0.045), lightMaterial);
  door.position.set(0, 0.61, -depth / 2 - 0.03);
  group.add(door);
  for (let index = 0; index < 4; index += 1) {
    const window = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.26, 0.22, 0.045), lightMaterial);
    window.position.set(
      -width * 0.28 + (index % 2) * width * 0.56,
      1.1 + Math.floor(index / 2) * 0.56,
      -depth / 2 - 0.04
    );
    group.add(window);
  }

  root.add(group);
}

function addRoofSolarPanels(
  THREE_REF: typeof THREE,
  group: THREE.Group,
  spec: CityBuildingSpec,
  y: number
) {
  const [width, depth] = spec.size;
  const panelMaterial = new THREE_REF.MeshStandardMaterial({
    color: "#596bb5",
    emissive: "#60a5fa",
    emissiveIntensity: 0.12,
    roughness: 0.34,
    metalness: 0.26,
  });
  for (let index = 0; index < 3; index += 1) {
    const panel = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(width * 0.22, 0.035, depth * 0.28), panelMaterial);
    panel.position.set(-width * 0.24 + index * width * 0.24, y, 0);
    panel.rotation.x = -0.48;
    group.add(panel);
  }
}

function addCompleteVillageHouses(THREE_REF: typeof THREE, root: THREE.Group) {
  COMPLETE_CITY_HOUSES.forEach((house, index) => {
    const group = new THREE_REF.Group();
    group.name = house.id;
    group.position.set(scaleWorldValue(house.position[0]), 0.34, scaleWorldValue(house.position[1]));
    group.rotation.y = house.rotation;

    const wallMaterial = new THREE_REF.MeshStandardMaterial({
      color: house.color,
      emissive: house.color,
      emissiveIntensity: 0.045,
      roughness: 0.64,
      metalness: 0.06,
    });
    const roofMaterial = new THREE_REF.MeshStandardMaterial({
      color: house.roof,
      emissive: house.accent,
      emissiveIntensity: 0.09,
      roughness: 0.52,
      metalness: 0.06,
    });
    const trimMaterial = new THREE_REF.MeshBasicMaterial({ color: house.accent });
    const shadowMaterial = new THREE_REF.MeshStandardMaterial({
      color: "#25304c",
      roughness: 0.82,
      metalness: 0.08,
    });

    const base = new THREE_REF.Mesh(
      new THREE_REF.BoxGeometry(house.width + 0.42, 0.24, house.depth + 0.34),
      shadowMaterial
    );
    base.position.y = 0.12;
    group.add(base);

    const body = new THREE_REF.Mesh(
      new THREE_REF.BoxGeometry(house.width, house.height, house.depth),
      wallMaterial
    );
    body.position.y = 0.24 + house.height / 2;
    group.add(body);

    [-1, 1].forEach((side) => {
      const panel = new THREE_REF.Mesh(
        new THREE_REF.BoxGeometry(house.width * 0.68, 0.24, house.depth * 1.18),
        roofMaterial
      );
      panel.position.set(side * house.width * 0.18, 0.35 + house.height, 0);
      panel.rotation.z = side * 0.62;
      group.add(panel);
    });

    const ridge = new THREE_REF.Mesh(
      new THREE_REF.BoxGeometry(0.18, 0.18, house.depth * 1.22),
      trimMaterial
    );
    ridge.position.y = 0.5 + house.height;
    group.add(ridge);

    const door = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.48, 0.78, 0.055), trimMaterial);
    door.position.set(0, 0.64, -house.depth / 2 - 0.032);
    group.add(door);

    [-1, 1].forEach((side) => {
      const window = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.32, 0.28, 0.055), trimMaterial);
      window.position.set(side * house.width * 0.28, 1.18, -house.depth / 2 - 0.034);
      group.add(window);
    });

    const chimney = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.28, 0.62, 0.28), shadowMaterial);
    chimney.position.set(-house.width * 0.22, house.height + 0.62, house.depth * 0.16);
    chimney.rotation.z = Math.sin(index) * 0.06;
    group.add(chimney);

    root.add(group);
  });
}

function addAquariusPlazaGlyph(THREE_REF: typeof THREE, root: THREE.Group) {
  const ringMaterial = new THREE_REF.MeshBasicMaterial({ color: "#d8b4fe", transparent: true, opacity: 0.82 });
  [3.1, 4.45, 5.8].forEach((radius, index) => {
    const ring = new THREE_REF.Mesh(new THREE_REF.TorusGeometry(radius, 0.035, 8, 120), ringMaterial);
    ring.position.y = 0.43 + index * 0.005;
    ring.rotation.x = Math.PI / 2;
    root.add(ring);
  });

  const waveMaterial = new THREE_REF.MeshBasicMaterial({ color: "#7dd3fc", transparent: true, opacity: 0.86 });
  for (let row = 0; row < 2; row += 1) {
    for (let index = 0; index < 5; index += 1) {
      const mark = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.58, 0.028, 0.08), waveMaterial);
      mark.position.set(-1.25 + index * 0.62, 0.48, -0.35 + row * 0.55 + Math.sin(index) * 0.08);
      mark.rotation.y = Math.sin(index * 1.3) * 0.42;
      root.add(mark);
    }
  }
}

function addCityProp(THREE_REF: typeof THREE, root: THREE.Group, spec: CityPropSpec) {
  const group = new THREE_REF.Group();
  group.position.set(spec.position[0], spec.elevation, spec.position[1]);
  group.rotation.y = spec.rotation ?? 0;
  const accent = new THREE_REF.MeshStandardMaterial({
    color: spec.accent,
    emissive: spec.accent,
    emissiveIntensity: 0.36,
    roughness: 0.42,
    metalness: 0.12,
  });
  const dark = new THREE_REF.MeshStandardMaterial({ color: "#1f2a44", roughness: 0.76, metalness: 0.1 });

  if (spec.kind === "lamp") {
    const post = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.035, 0.045, 1.15, 8), dark);
    post.position.y = 0.58;
    group.add(post);
    const bulb = new THREE_REF.Mesh(new THREE_REF.SphereGeometry(0.14, 14, 14), accent);
    bulb.position.y = 1.22;
    group.add(bulb);
  } else if (spec.kind === "bench") {
    const seat = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.95, 0.12, 0.32), dark);
    seat.position.y = 0.26;
    group.add(seat);
    const back = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.95, 0.35, 0.08), accent);
    back.position.set(0, 0.48, -0.17);
    group.add(back);
  } else if (spec.kind === "planter") {
    const pot = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.22, 0.3, 0.28, 10), dark);
    pot.position.y = 0.16;
    group.add(pot);
    const leaf = new THREE_REF.Mesh(new THREE_REF.ConeGeometry(0.3, 0.72, 5), accent);
    leaf.position.y = 0.64;
    group.add(leaf);
  } else if (spec.kind === "sign") {
    const post = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.035, 0.045, 0.86, 8), dark);
    post.position.y = 0.44;
    group.add(post);
    const board = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.74, 0.4, 0.06), accent);
    board.position.y = 0.93;
    group.add(board);
  } else if (spec.kind === "energy") {
    const box = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.72, 0.62, 0.56), dark);
    box.position.y = 0.36;
    group.add(box);
    const strip = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.58, 0.08, 0.035), accent);
    strip.position.set(0, 0.58, -0.29);
    group.add(strip);
  } else if (spec.kind === "sculpture") {
    const base = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.32, 0.42, 0.28, 10), dark);
    base.position.y = 0.14;
    group.add(base);
    const art = new THREE_REF.Mesh(new THREE_REF.OctahedronGeometry(0.42, 0), accent);
    art.position.y = 0.72;
    art.rotation.set(0.4, 0.6, 0.2);
    group.add(art);
  } else if (spec.kind === "fountain") {
    const base = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.72, 0.86, 0.22, 18), dark);
    base.position.y = 0.12;
    group.add(base);
    const water = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.09, 0.15, 1.18, 12), accent);
    water.position.y = 0.78;
    group.add(water);
  } else {
    const terminal = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.52, 0.74, 0.18), dark);
    terminal.position.y = 0.42;
    group.add(terminal);
    const screen = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.42, 0.24, 0.035), accent);
    screen.position.set(0, 0.58, -0.1);
    group.add(screen);
  }

  root.add(group);
}

function addStreetRhythm(THREE_REF: typeof THREE, root: THREE.Group) {
  const lampMaterial = new THREE_REF.MeshStandardMaterial({
    color: "#eef2ff",
    emissive: "#7dd3fc",
    emissiveIntensity: 0.14,
    roughness: 0.38,
    metalness: 0.18,
  });
  const matrix = new THREE_REF.Matrix4();
  const lampPositions = [
    [-4.6, 0.48, -4.1],
    [4.4, 0.48, -4.1],
    [-5.3, 0.43, 3.6],
    [5.4, 0.43, 3.5],
    [-11.3, 0.56, -6.4],
    [-16.9, 0.56, -9.4],
    [11.2, 0.58, -6.6],
    [17.3, 0.58, -9.2],
    [-12.5, 0.44, 7.1],
    [-18.4, 0.44, 9.1],
    [12.4, 0.44, 7.3],
    [18.2, 0.44, 9.4],
    [-5.8, 0.33, 16.2],
    [5.8, 0.33, 16.2],
  ] as const;

  const posts = new THREE_REF.InstancedMesh(new THREE_REF.CylinderGeometry(0.035, 0.045, 1.05, 8), lampMaterial, lampPositions.length);
  const bulbs = new THREE_REF.InstancedMesh(new THREE_REF.SphereGeometry(0.12, 12, 12), lampMaterial, lampPositions.length);
  lampPositions.forEach(([x, y, z], index) => {
    matrix.makeTranslation(scaleWorldValue(x), y + 0.52, scaleWorldValue(z));
    posts.setMatrixAt(index, matrix);
    matrix.makeTranslation(scaleWorldValue(x), y + 1.12, scaleWorldValue(z));
    bulbs.setMatrixAt(index, matrix);
  });
  posts.instanceMatrix.needsUpdate = true;
  bulbs.instanceMatrix.needsUpdate = true;
  root.add(posts);
  root.add(bulbs);
}

function addAquariusLandmarks(THREE_REF: typeof THREE, root: THREE.Group) {
  const glass = new THREE_REF.MeshStandardMaterial({
    color: "#7dd3fc",
    emissive: "#0284c7",
    emissiveIntensity: 0.42,
    transparent: true,
    opacity: 0.74,
    roughness: 0.18,
  });
  const pastel = new THREE_REF.MeshStandardMaterial({
    color: "#d8b4fe",
    emissive: "#7c3aed",
    emissiveIntensity: 0.12,
    roughness: 0.48,
    metalness: 0.08,
  });
  const mint = new THREE_REF.MeshStandardMaterial({
    color: "#5eead4",
    emissive: "#0f766e",
    emissiveIntensity: 0.24,
    roughness: 0.42,
  });
  const dark = new THREE_REF.MeshStandardMaterial({
    color: "#1f2a44",
    roughness: 0.78,
    metalness: 0.12,
  });

  const fountain = new THREE_REF.Group();
  fountain.position.set(scaleWorldValue(-2.8), 0.5, scaleWorldValue(2.8));
  fountain.add(new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(1.05, 1.22, 0.32, 28), dark));
  const bowl = new THREE_REF.Mesh(new THREE_REF.TorusGeometry(1.1, 0.08, 8, 72), glass);
  bowl.position.y = 0.24;
  bowl.rotation.x = Math.PI / 2;
  fountain.add(bowl);
  for (let index = 0; index < 5; index += 1) {
    const jet = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.025, 0.055, 1.1 - index * 0.08, 8), glass);
    const theta = (index / 5) * Math.PI * 2;
    jet.position.set(Math.cos(theta) * 0.34, 0.76, Math.sin(theta) * 0.34);
    jet.rotation.z = Math.sin(theta) * 0.24;
    fountain.add(jet);
  }
  root.add(fountain);

  const satellite = new THREE_REF.Group();
  satellite.position.set(scaleWorldValue(-20.4), 0.22, scaleWorldValue(-18.6));
  satellite.add(new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.18, 0.28, 1.6, 12), dark));
  const dish = new THREE_REF.Mesh(new THREE_REF.ConeGeometry(1.2, 0.42, 36, 1, true), glass);
  dish.position.set(0, 1.65, 0);
  dish.rotation.x = Math.PI / 2.4;
  satellite.add(dish);
  const signal = new THREE_REF.Mesh(new THREE_REF.TorusGeometry(1.6, 0.025, 8, 80), mint);
  signal.position.y = 1.78;
  signal.rotation.x = Math.PI / 2.4;
  satellite.add(signal);
  root.add(satellite);

  const lighthouse = new THREE_REF.Group();
  lighthouse.position.set(scaleWorldValue(22.2), 0.2, scaleWorldValue(16.6));
  const tower = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.48, 0.72, 3.4, 18), pastel);
  tower.position.y = 1.7;
  lighthouse.add(tower);
  const lantern = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.64, 0.64, 0.48, 18), glass);
  lantern.position.y = 3.58;
  lighthouse.add(lantern);
  const beam = new THREE_REF.Mesh(new THREE_REF.ConeGeometry(2.2, 3.8, 24, 1, true), new THREE_REF.MeshBasicMaterial({
    color: "#bfdbfe",
    transparent: true,
    opacity: 0.14,
    side: THREE_REF.DoubleSide,
  }));
  beam.position.set(-1.8, 3.58, -0.2);
  beam.rotation.z = Math.PI / 2;
  lighthouse.add(beam);
  root.add(lighthouse);

  const school = new THREE_REF.Group();
  school.position.set(scaleWorldValue(-19.3), 0.34, scaleWorldValue(3.2));
  const schoolBase = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(3.9, 1.45, 2.2), pastel);
  schoolBase.position.y = 0.95;
  school.add(schoolBase);
  const roof = new THREE_REF.Mesh(new THREE_REF.ConeGeometry(2.35, 0.72, 4), mint);
  roof.position.y = 1.98;
  roof.rotation.y = Math.PI / 4;
  school.add(roof);
  const sign = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(1.7, 0.36, 0.06), glass);
  sign.position.set(0, 1.36, -1.14);
  school.add(sign);
  root.add(school);

  const ufo = new THREE_REF.Group();
  ufo.position.set(scaleWorldValue(18.6), 3.8, scaleWorldValue(-18.4));
  const saucer = new THREE_REF.Mesh(new THREE_REF.SphereGeometry(1.65, 32, 12), glass);
  saucer.scale.set(1.45, 0.22, 1);
  ufo.add(saucer);
  const dome = new THREE_REF.Mesh(new THREE_REF.SphereGeometry(0.72, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), pastel);
  dome.position.y = 0.18;
  ufo.add(dome);
  const landingBeam = new THREE_REF.Mesh(new THREE_REF.ConeGeometry(0.92, 3.2, 28, 1, true), new THREE_REF.MeshBasicMaterial({
    color: "#5eead4",
    transparent: true,
    opacity: 0.18,
    side: THREE_REF.DoubleSide,
  }));
  landingBeam.position.y = -1.65;
  landingBeam.rotation.x = Math.PI;
  ufo.add(landingBeam);
  root.add(ufo);

  const alienMaterial = new THREE_REF.MeshStandardMaterial({ color: "#93e6d2", emissive: "#0f766e", emissiveIntensity: 0.18, roughness: 0.52 });
  [
    [16.8, -16.2],
    [20.1, -15.4],
    [-17.6, 4.8],
    [-21.2, 1.4],
  ].forEach(([x, z], index) => {
    const alien = new THREE_REF.Group();
    alien.position.set(scaleWorldValue(x), 0.4, scaleWorldValue(z));
    const body = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.42, 0.66, 0.32), alienMaterial);
    body.position.y = 0.48;
    alien.add(body);
    const head = new THREE_REF.Mesh(new THREE_REF.SphereGeometry(0.3, 18, 14), alienMaterial);
    head.position.y = 1.02;
    alien.add(head);
    const face = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.26, 0.08, 0.035), dark);
    face.position.set(0, 1.03, -0.28);
    alien.add(face);
    alien.rotation.y = index * 0.7;
    root.add(alien);
  });
}

function createSkyWhale(THREE_REF: typeof THREE) {
  const group = new THREE_REF.Group();
  group.name = "sky-whale";
  const bodyMaterial = new THREE_REF.MeshStandardMaterial({
    color: "#8bd3ff",
    emissive: "#0f4f77",
    emissiveIntensity: 0.24,
    roughness: 0.5,
  });
  const bellyMaterial = new THREE_REF.MeshStandardMaterial({
    color: "#e0f2fe",
    emissive: "#38bdf8",
    emissiveIntensity: 0.08,
    roughness: 0.56,
  });
  const body = new THREE_REF.Mesh(new THREE_REF.SphereGeometry(1.4, 28, 16), bodyMaterial);
  body.scale.set(2.2, 0.72, 0.82);
  group.add(body);
  const belly = new THREE_REF.Mesh(new THREE_REF.SphereGeometry(1.04, 24, 12), bellyMaterial);
  belly.position.set(0.2, -0.22, 0);
  belly.scale.set(1.8, 0.32, 0.64);
  group.add(belly);
  const tail = new THREE_REF.Group();
  tail.position.set(-2.95, 0, 0);
  [-1, 1].forEach((side) => {
    const fluke = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.8, 0.1, 0.42), bodyMaterial);
    fluke.position.set(-0.12, 0, side * 0.34);
    fluke.rotation.y = side * 0.55;
    tail.add(fluke);
  });
  group.add(tail);
  const fins = [-1, 1].map((side) => {
    const fin = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(1.12, 0.08, 0.36), bodyMaterial);
    fin.position.set(0.1, -0.12, side * 0.9);
    fin.rotation.y = side * 0.34;
    group.add(fin);
    return fin;
  });
  const eye = new THREE_REF.Mesh(new THREE_REF.SphereGeometry(0.08, 12, 12), new THREE_REF.MeshBasicMaterial({ color: "#06111f" }));
  eye.position.set(2.2, 0.16, -0.42);
  group.add(eye);
  group.userData.fins = fins;
  group.userData.tail = tail;
  group.scale.setScalar(1.35);
  return group;
}

function distance2(a: [number, number], b: [number, number]) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function midpoint2(a: [number, number], b: [number, number]): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function segmentRotation(a: [number, number], b: [number, number]) {
  return -Math.atan2(b[1] - a[1], b[0] - a[0]);
}

function addPath(root: THREE.Group, THREE_REF: typeof THREE, points: number[][]) {
  const material = new THREE_REF.LineBasicMaterial({
    color: "#5eead4",
    transparent: true,
    opacity: 0.34,
  });
  const positions: number[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    positions.push(points[index][0], 0.08, points[index][1], points[index + 1][0], 0.08, points[index + 1][1]);
  }
  const geometry = new THREE_REF.BufferGeometry();
  geometry.setAttribute("position", new THREE_REF.Float32BufferAttribute(positions, 3));
  root.add(new THREE_REF.LineSegments(geometry, material));
}

function addColumns(THREE_REF: typeof THREE, root: THREE.Group, stone: THREE.Material) {
  const positions = [
    [-5.2, 0, 5.2],
    [5.2, 0, 5.2],
    [-5.2, 0, -5.2],
    [5.2, 0, -5.2],
    [10.8, 0, -2.8],
    [12.6, 0, 4.7],
    [-10.8, 0, 4.4],
  ];
  positions.forEach(([x, y, z], index) => {
    const height = index === 4 ? 1.35 : 2.4;
    const column = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.28, 0.36, height, 12), stone);
    column.position.set(x, y + height / 2, z);
    column.rotation.z = index === 4 ? 0.45 : 0;
    root.add(column);
    const cap = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.9, 0.16, 0.9), stone);
    cap.position.set(x, y + height + 0.09, z);
    cap.rotation.z = column.rotation.z;
    root.add(cap);
  });
}

function addWorkshop(
  THREE_REF: typeof THREE,
  root: THREE.Group,
  stone: THREE.Material,
  brass: THREE.Material,
  glow: THREE.Material
) {
  const base = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(7.2, 0.28, 5.4), stone);
  base.position.set(-13.5, 0.12, -2.4);
  root.add(base);
  for (let i = 0; i < 5; i += 1) {
    const gear = new THREE_REF.Mesh(new THREE_REF.TorusGeometry(0.52 + i * 0.08, 0.045, 8, 32), brass);
    gear.position.set(-16 + i * 1.2, 1.2 + (i % 2) * 0.42, -3.6 + (i % 3) * 1.2);
    gear.rotation.set(Math.PI / 2, 0.4 * i, 0);
    root.add(gear);
  }
  const tube = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.08, 0.08, 5.8, 12), glow);
  tube.position.set(-12.4, 0.7, -2.4);
  tube.rotation.z = Math.PI / 2;
  root.add(tube);
}

function addArtTemple(THREE_REF: typeof THREE, root: THREE.Group, stone: THREE.Material) {
  const wallMaterial = new THREE_REF.MeshStandardMaterial({
    color: "#31233b",
    roughness: 0.88,
    metalness: 0.08,
  });
  const wall = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(6.6, 2.4, 0.34), wallMaterial);
  wall.position.set(14.5, 1.2, -1.7);
  wall.rotation.y = -0.32;
  root.add(wall);
  const graffitiColors = ["#fb7185", "#c084fc", "#5eead4"];
  graffitiColors.forEach((color, index) => {
    const mark = new THREE_REF.Mesh(
      new THREE_REF.BoxGeometry(1.4 - index * 0.18, 0.08, 0.08),
      new THREE_REF.MeshBasicMaterial({ color })
    );
    mark.position.set(13.3 + index * 0.85, 1.28 + index * 0.26, -1.47 + index * 0.07);
    mark.rotation.z = -0.5 + index * 0.55;
    mark.rotation.y = -0.32;
    root.add(mark);
  });
  const broken = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.34, 0.4, 2.8, 9), stone);
  broken.position.set(11.1, 1.2, -2.8);
  broken.rotation.z = 0.65;
  root.add(broken);
}

function addObservatory(
  THREE_REF: typeof THREE,
  root: THREE.Group,
  stone: THREE.Material,
  brass: THREE.Material,
  glow: THREE.Material
) {
  const platform = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(6.2, 6.8, 0.38, 64), stone);
  platform.position.set(0, 0.08, -15);
  root.add(platform);
  const armillary = new THREE_REF.Group();
  armillary.position.set(0, 2.1, -15.6);
  [0, Math.PI / 3, -Math.PI / 3].forEach((rotation) => {
    const ring = new THREE_REF.Mesh(new THREE_REF.TorusGeometry(1.45, 0.035, 8, 72), brass);
    ring.rotation.set(Math.PI / 2, rotation, 0);
    armillary.add(ring);
  });
  const core = new THREE_REF.Mesh(new THREE_REF.SphereGeometry(0.28, 24, 24), glow);
  armillary.add(core);
  root.add(armillary);
  const telescope = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.18, 0.26, 2.4, 14), brass);
  telescope.position.set(3.2, 1.55, -13.1);
  telescope.rotation.set(Math.PI / 2.7, 0, -0.55);
  root.add(telescope);
}

function addWindBridge(THREE_REF: typeof THREE, root: THREE.Group, stone: THREE.Material, glow: THREE.Material) {
  for (let index = 0; index < 8; index += 1) {
    const step = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(1.4, 0.18, 1.05), stone);
    step.position.set(1.8 + index * 1.1, 0.16 + Math.sin(index) * 0.1, 9.2 + index * 1.08);
    step.rotation.y = 0.32 + Math.sin(index) * 0.18;
    root.add(step);
  }
  const portal = new THREE_REF.Mesh(new THREE_REF.TorusGeometry(1.45, 0.07, 12, 72), glow);
  portal.position.set(8.8, 1.7, 17.8);
  portal.rotation.y = Math.PI / 2;
  root.add(portal);
}

function createStars(THREE_REF: typeof THREE) {
  const positions: number[] = [];
  const colors: number[] = [];
  const palette = ["#7dd3fc", "#f7d9ff", "#fff7db", "#5eead4"];
  for (let i = 0; i < 720; i += 1) {
    const radius = 34 + Math.random() * 36;
    const theta = Math.random() * Math.PI * 2;
    const y = 8 + Math.random() * 24;
    positions.push(Math.cos(theta) * radius, y, Math.sin(theta) * radius);
    const color = new THREE_REF.Color(palette[i % palette.length]);
    colors.push(color.r, color.g, color.b);
  }
  const geometry = new THREE_REF.BufferGeometry();
  geometry.setAttribute("position", new THREE_REF.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE_REF.Float32BufferAttribute(colors, 3));
  return new THREE_REF.Points(
    geometry,
    new THREE_REF.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
    })
  );
}

function createParticles(THREE_REF: typeof THREE) {
  const positions: number[] = [];
  for (let i = 0; i < 160; i += 1) {
    positions.push((Math.random() - 0.5) * 64, 0.5 + Math.random() * 6, (Math.random() - 0.5) * 64);
  }
  const geometry = new THREE_REF.BufferGeometry();
  geometry.setAttribute("position", new THREE_REF.Float32BufferAttribute(positions, 3));
  return new THREE_REF.Points(
    geometry,
    new THREE_REF.PointsMaterial({
      color: "#dbeafe",
      size: 0.045,
      transparent: true,
      opacity: 0.42,
    })
  );
}

function cloneModel(
  THREE_REF: typeof THREE,
  model: THREE.Group,
  cloneAnimatedModel?: CloneModelFn
) {
  const clone = (cloneAnimatedModel ? cloneAnimatedModel(model) : model.clone(true)) as THREE.Group;
  clone.traverse((child) => {
    if ("material" in child && child.material) {
      const material = child.material as THREE.Material | THREE.Material[];
      if (Array.isArray(material)) {
        child.material = material.map((item) => item.clone());
      } else {
        child.material = material.clone();
      }
    }
  });
  const box = new THREE_REF.Box3().setFromObject(clone);
  const center = box.getCenter(new THREE_REF.Vector3());
  clone.position.sub(center);
  clone.position.y -= box.min.y - center.y;
  return clone;
}

function groundModelToFloor(
  THREE_REF: typeof THREE,
  model: THREE.Object3D,
  floorOffset = 0
) {
  const box = new THREE_REF.Box3().setFromObject(model);
  if (!Number.isFinite(box.min.y)) {
    return;
  }
  model.position.y += floorOffset - box.min.y;
  model.userData.floorY = model.position.y;
}

function getModelFloorY(model: THREE.Object3D) {
  return typeof model.userData.floorY === "number" ? model.userData.floorY : PLAYER_FLOOR_OFFSET;
}

function applyNeutralPlayerMaterial(THREE_REF: typeof THREE, model: THREE.Object3D) {
  const skin = new THREE_REF.MeshBasicMaterial({
    color: "#d8a078",
  });
  model.traverse((child) => {
    const mesh = child as THREE.Mesh & { isMesh?: boolean; isSkinnedMesh?: boolean };
    if (mesh.isMesh || mesh.isSkinnedMesh) {
      mesh.material = skin.clone();
    }
  });
}

function setRuntimePlayerAvatar(runtime: Runtime, avatar: PlayerAvatarData) {
  const source = runtime.loadedModels.get(avatar.model);
  const loadedModel = source
    ? cloneModel(runtime.THREE, source.scene, runtime.cloneAnimatedModel)
    : null;
  const usesLoadedModel = Boolean(loadedModel && hasRenderableMesh(loadedModel));
  const nextModel = usesLoadedModel && loadedModel
    ? loadedModel
    : createFallbackPreviewAvatar(runtime.THREE, avatar);
  nextModel.scale.setScalar(usesLoadedModel ? avatar.scale : 1);
  nextModel.rotation.y = MODEL_FORWARD_OFFSET;
  if (avatar.neutralSkin) {
    applyNeutralPlayerMaterial(runtime.THREE, nextModel);
  }
  groundModelToFloor(runtime.THREE, nextModel, PLAYER_FLOOR_OFFSET);
  if (runtime.playerAnimator) {
    runtime.playerAnimator.mixer.stopAllAction();
    const mixerIndex = runtime.actorMixers.indexOf(runtime.playerAnimator.mixer);
    if (mixerIndex >= 0) {
      runtime.actorMixers.splice(mixerIndex, 1);
    }
  }
  runtime.player.remove(runtime.playerModel);
  runtime.playerModel = nextModel;
  runtime.player.add(nextModel);

  const animator = source && usesLoadedModel
    ? createActorAnimator(
        runtime.THREE,
        nextModel,
        source.animations,
        runtime.animationLibrary
      )
    : null;
  runtime.playerAnimator = animator;
  if (animator) {
    runtime.actorMixers.push(animator.mixer);
    playActorAction(animator, "idle", 0);
  }
  runtime.cameraReturnToDefault = true;
}

function setDefaultCameraView(runtime: Runtime, immediate = false) {
  const target = runtime.player.position
    .clone()
    .add(new runtime.THREE.Vector3(0, 0.96, 0));
  const desiredPosition = target
    .clone()
    .add(
      new runtime.THREE.Vector3(
        DEFAULT_CAMERA_OFFSET.x,
        DEFAULT_CAMERA_OFFSET.y,
        DEFAULT_CAMERA_OFFSET.z
      )
    );
  if (immediate) {
    runtime.controls.target.copy(target);
    runtime.camera.position.copy(desiredPosition);
    runtime.cameraReturnToDefault = false;
    return;
  }
  runtime.controls.target.lerp(target, 0.28);
  runtime.camera.position.lerp(desiredPosition, 0.22);
  if (
    runtime.camera.position.distanceTo(desiredPosition) < 0.08 &&
    runtime.controls.target.distanceTo(target) < 0.06
  ) {
    runtime.cameraReturnToDefault = false;
  }
}

function mountAvatarPreview(
  canvas: HTMLCanvasElement,
  runtime: Runtime,
  avatar: PlayerAvatarData
) {
  const THREE_REF = runtime.THREE;
  const source = runtime.loadedModels.get(avatar.model);
  const renderer = new THREE_REF.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.outputColorSpace = THREE_REF.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE_REF.Scene();
  scene.add(new THREE_REF.HemisphereLight("#e0f2fe", "#1e1838", 2.3));
  const key = new THREE_REF.DirectionalLight("#ffffff", 2.1);
  key.position.set(2.6, 4, 3);
  scene.add(key);
  const glow = new THREE_REF.PointLight("#5eead4", 4.5, 7);
  glow.position.set(-2, 1.5, 2.2);
  scene.add(glow);

  const camera = new THREE_REF.PerspectiveCamera(33, 1, 0.1, 40);
  const stage = new THREE_REF.Group();
  const loadedModel = source
    ? cloneModel(THREE_REF, source.scene, runtime.cloneAnimatedModel)
    : createFallbackPreviewAvatar(THREE_REF, avatar);
  const usesLoadedModel = Boolean(source && hasRenderableMesh(loadedModel));
  const model = usesLoadedModel
    ? loadedModel
    : createFallbackPreviewAvatar(THREE_REF, avatar);
  model.scale.setScalar(avatar.scale);
  model.rotation.y = -0.34;
  if (avatar.neutralSkin) {
    applyNeutralPlayerMaterial(THREE_REF, model);
  }
  groundModelToFloor(THREE_REF, model, 0);
  stage.add(model);
  scene.add(stage);

  const floor = new THREE_REF.Mesh(
    new THREE_REF.CylinderGeometry(1.54, 1.68, 0.1, 48),
    new THREE_REF.MeshStandardMaterial({
      color: "#23345c",
      emissive: "#0e7490",
      emissiveIntensity: 0.16,
      roughness: 0.48,
      metalness: 0.08,
    })
  );
  floor.position.y = -0.08;
  scene.add(floor);

  const ring = new THREE_REF.Mesh(
    new THREE_REF.TorusGeometry(1.68, 0.025, 8, 72),
    new THREE_REF.MeshBasicMaterial({ color: "#5eead4", transparent: true, opacity: 0.74 })
  );
  ring.rotation.x = Math.PI / 2;
  scene.add(ring);

  const animator = source && usesLoadedModel
    ? createActorAnimator(THREE_REF, model, source.animations, runtime.animationLibrary)
    : null;
  playActorAction(animator, "idle", 0);

  const initialBox = new THREE_REF.Box3().setFromObject(stage);
  const initialSize = initialBox.getSize(new THREE_REF.Vector3());
  const initialMax = Math.max(initialSize.x, initialSize.y, initialSize.z);
  const normalizedScale = 1.72 / Math.max(initialMax, 0.001);
  stage.scale.setScalar(Number.isFinite(normalizedScale) && normalizedScale > 0.0001 ? normalizedScale : 1);
  const normalizedBox = new THREE_REF.Box3().setFromObject(stage);
  const normalizedCenter = normalizedBox.getCenter(new THREE_REF.Vector3());
  stage.position.x -= normalizedCenter.x;
  stage.position.z -= normalizedCenter.z;
  stage.position.y -= normalizedBox.min.y;

  const resize = () => {
    const width = Math.max(260, canvas.clientWidth || 320);
    const height = Math.max(320, canvas.clientHeight || 420);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener("resize", resize);

  const finalBox = new THREE_REF.Box3().setFromObject(stage);
  const finalSize = finalBox.getSize(new THREE_REF.Vector3());
  const finalHeight = Math.max(finalSize.y, 1.2);
  const finalWidth = Math.max(finalSize.x, finalSize.z, 1.2);
  camera.position.set(0, finalHeight * 0.62, Math.max(2.55, finalHeight * 1.44, finalWidth * 1.75));
  camera.lookAt(0, finalHeight * 0.5, 0);

  let animationId = 0;
  let last = performance.now();
  const animate = () => {
    const now = performance.now();
    const delta = Math.min((now - last) / 1000, 0.05);
    last = now;
    stage.rotation.y += delta * 0.32;
    ring.rotation.z += delta * 0.7;
    animator?.mixer.update(delta);
    renderer.render(scene, camera);
    animationId = window.requestAnimationFrame(animate);
  };
  animate();

  return () => {
    window.cancelAnimationFrame(animationId);
    window.removeEventListener("resize", resize);
    animator?.mixer.stopAllAction();
    renderer.dispose();
  };
}

function createFallbackPreviewAvatar(
  THREE_REF: typeof THREE,
  avatar: PlayerAvatarData
) {
  const group = new THREE_REF.Group();
  const bodyColor = avatar.id === "raptor" ? "#8dd38c" : avatar.id.includes("alien") ? "#5eead4" : "#d8a078";
  if (avatar.id === "raptor") {
    const body = new THREE_REF.Mesh(
      new THREE_REF.BoxGeometry(1.2, 0.44, 0.42),
      new THREE_REF.MeshStandardMaterial({ color: bodyColor, roughness: 0.56 })
    );
    body.position.y = 0.66;
    group.add(body);
    const head = new THREE_REF.Mesh(
      new THREE_REF.BoxGeometry(0.46, 0.34, 0.32),
      new THREE_REF.MeshStandardMaterial({ color: bodyColor, roughness: 0.52 })
    );
    head.position.set(0.78, 0.86, 0);
    group.add(head);
    const tail = new THREE_REF.Mesh(
      new THREE_REF.BoxGeometry(0.72, 0.16, 0.18),
      new THREE_REF.MeshStandardMaterial({ color: bodyColor, roughness: 0.6 })
    );
    tail.position.set(-0.88, 0.72, 0);
    tail.rotation.z = -0.22;
    group.add(tail);
    for (let index = 0; index < 2; index += 1) {
      const leg = new THREE_REF.Mesh(
        new THREE_REF.BoxGeometry(0.14, 0.58, 0.14),
        new THREE_REF.MeshStandardMaterial({ color: "#2f4f3d", roughness: 0.7 })
      );
      leg.position.set(index === 0 ? -0.26 : 0.32, 0.28, index === 0 ? -0.14 : 0.14);
      group.add(leg);
    }
    return group;
  }
  const body = new THREE_REF.Mesh(
    new THREE_REF.BoxGeometry(0.42, 0.72, 0.28),
    new THREE_REF.MeshStandardMaterial({ color: bodyColor, roughness: 0.58 })
  );
  body.position.y = 0.48;
  group.add(body);
  const head = new THREE_REF.Mesh(
    new THREE_REF.BoxGeometry(0.5, 0.42, 0.38),
    new THREE_REF.MeshStandardMaterial({ color: bodyColor, roughness: 0.52 })
  );
  head.position.y = 1.08;
  group.add(head);
  return group;
}

function hasRenderableMesh(model: THREE.Object3D) {
  let hasMesh = false;
  model.traverse((child) => {
    const mesh = child as THREE.Mesh & { isMesh?: boolean; isSkinnedMesh?: boolean };
    if (mesh.isMesh || mesh.isSkinnedMesh) {
      hasMesh = true;
    }
  });
  return hasMesh;
}

function retargetUniversalAnimationClips(
  THREE_REF: typeof THREE,
  clips: THREE.AnimationClip[]
) {
  return clips
    .map((clip) => {
      const tracks = clip.tracks.flatMap((track) => {
        const [nodeName, propertyName] = track.name.split(".");
        const mappedNode = UNIVERSAL_BONE_MAP[nodeName];
        if (!mappedNode || !propertyName) {
          return [];
        }
        const clonedTrack = track.clone();
        clonedTrack.name = `${mappedNode}.${propertyName}`;
        return [clonedTrack];
      });
      if (tracks.length === 0) {
        return null;
      }
      return new THREE_REF.AnimationClip(clip.name, clip.duration, tracks);
    })
    .filter((clip): clip is THREE.AnimationClip => Boolean(clip));
}

function findClip(clips: THREE.AnimationClip[], names: string[]) {
  const normalizedNames = names.map((name) => name.toLowerCase());
  return (
    clips.find((clip) => normalizedNames.includes(clip.name.toLowerCase())) ??
    clips.find((clip) => {
      const clipName = clip.name.toLowerCase();
      return normalizedNames.some(
        (name) =>
          clipName.endsWith(`|${name}`) ||
          clipName.endsWith(`_${name}`) ||
          clipName.endsWith(name)
      );
    })
  );
}

function createActorAnimator(
  THREE_REF: typeof THREE,
  target: THREE.Object3D,
  embeddedClips: THREE.AnimationClip[],
  universalClips: THREE.AnimationClip[]
): ActorAnimator {
  const mixer = new THREE_REF.AnimationMixer(target);
  const clip = (universalNames: string[], embeddedNames: string[]) =>
    findClip(embeddedClips, embeddedNames) ?? findClip(universalClips, universalNames);

  const actions: Partial<Record<ActorActionName, THREE.AnimationAction>> = {};
  const register = (
    actionName: ActorActionName,
    universalNames: string[],
    embeddedNames: string[],
    loopOnce = false
  ) => {
    const resolvedClip = clip(universalNames, embeddedNames);
    if (!resolvedClip) {
      return;
    }
    const action = mixer.clipAction(resolvedClip);
    action.enabled = true;
    if (loopOnce) {
      action.setLoop(THREE_REF.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    actions[actionName] = action;
  };

  register("idle", ["Idle_Loop"], ["Idle", "Idle_Hold", "IdleHold", "Standing"]);
  register("walk", ["Walk_Loop", "Walk_Formal_Loop"], ["Walk", "Walk_Hold"]);
  register("run", ["Jog_Fwd_Loop", "Sprint_Loop"], ["Run", "Run_Hold"]);
  register("jump", ["Jump_Start", "Jump_Loop"], ["Jump", "Jump_Idle", "RunningJump"], true);
  register("talk", ["Idle_Talking_Loop"], ["Wave", "Yes", "No", "Clapping"]);
  register("wave", ["Interact"], ["Wave"]);
  register("dance", ["Dance_Loop"], ["Wave", "Yes", "Clapping"]);
  register("fix", ["Fixing_Kneeling"], ["Idle_Attack", "Punch", "Working"]);
  register("interact", ["Interact", "PickUp_Table"], ["Punch", "Idle_Attack", "Attack"]);

  return { mixer, actions, current: null };
}

function playActorAction(
  animator: ActorAnimator | null | undefined,
  actionName: ActorActionName,
  fade = 0.18
) {
  if (!animator) {
    return;
  }
  const next = animator.actions[actionName] ?? animator.actions.idle;
  if (!next) {
    return;
  }
  const current = animator.current ? animator.actions[animator.current] : null;
  if (animator.current === actionName && next.isRunning()) {
    return;
  }
  current?.fadeOut(fade);
  next.reset().fadeIn(fade).play();
  animator.current = actionName;
}

function getNpcIdleAction(id: ArchetypeId): ActorActionName {
  if (id === "inventor" || id === "hacker") {
    return "fix";
  }
  if (id === "rebel") {
    return "dance";
  }
  if (id === "humanitarian" || id === "visionary" || id === "futurist") {
    return "talk";
  }
  return "idle";
}

function createWanderState(
  THREE_REF: typeof THREE,
  home: THREE.Vector3,
  radius: number,
  speed: number,
  idleAction: ActorActionName
): WanderState {
  return {
    home: home.clone(),
    target: pickWanderTarget(THREE_REF, home, radius),
    radius,
    speed,
    pauseUntil: 0,
    nextGestureAt: 0,
    idleAction,
  };
}

function pickWanderTarget(
  THREE_REF: typeof THREE,
  home: THREE.Vector3,
  radius: number
) {
  const angle = Math.random() * Math.PI * 2;
  const distance = radius * (0.25 + Math.random() * 0.75);
  const target = home
    .clone()
    .add(new THREE_REF.Vector3(Math.sin(angle) * distance, 0, Math.cos(angle) * distance));
  const clamped = clampToWorld(target.x, target.z);
  target.x = clamped.x;
  target.z = clamped.z;
  return target;
}

function lerpAngle(from: number, to: number, amount: number) {
  const difference = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + difference * amount;
}

function faceTowards(
  group: THREE.Group,
  target: THREE.Vector3,
  amount: number
) {
  const direction = target.clone().sub(group.position).setY(0);
  if (direction.lengthSq() < 0.0001) {
    return;
  }
  const angle = Math.atan2(direction.x, direction.z) + MODEL_FORWARD_OFFSET;
  group.rotation.y = lerpAngle(group.rotation.y, angle, amount);
}

function createNpcGroup(
  THREE_REF: typeof THREE,
  npc: NpcData,
  source?: THREE.Group,
  cloneAnimatedModel?: CloneModelFn
) {
  const group = new THREE_REF.Group();
  group.position.set(...scaleWorldPosition(npc.position));
  group.rotation.y = npc.facing;
  group.userData.npcId = npc.id;

  const model = source ? cloneModel(THREE_REF, source, cloneAnimatedModel) : new THREE_REF.Group();
  model.scale.setScalar(WORLD_CONFIG.modelScale);
  groundModelToFloor(THREE_REF, model, 0.02);
  group.add(model);
  group.userData.actorModel = model;

  const floorRing = new THREE_REF.Mesh(
    new THREE_REF.TorusGeometry(1.15, 0.025, 8, 72),
    new THREE_REF.MeshBasicMaterial({ color: npc.accent, transparent: true, opacity: 0.58 })
  );
  floorRing.rotation.x = Math.PI / 2;
  floorRing.position.y = 0.035;
  group.add(floorRing);

  addNpcAccessory(THREE_REF, group, npc);
  const label = makeNpcLabel(THREE_REF, npc);
  label.position.set(0, 2.55, 0);
  label.visible = false;
  group.add(label);
  group.userData.label = label;
  const prompt = makeInteractionPrompt(THREE_REF, npc.accent);
  prompt.position.set(0.95, 1.62, 0);
  prompt.visible = false;
  group.add(prompt);
  group.userData.prompt = prompt;

  const light = new THREE_REF.PointLight(npc.accent, 3.8, 6);
  light.position.y = 1.6;
  group.add(light);

  group.traverse((child) => {
    child.userData.npcId = npc.id;
  });
  return group;
}

function createHumanGroup(
  THREE_REF: typeof THREE,
  human: HumanData,
  source?: THREE.Group,
  cloneAnimatedModel?: CloneModelFn
) {
  const group = new THREE_REF.Group();
  group.position.set(...scaleWorldPosition(human.position));
  group.rotation.y = human.facing;
  group.userData.humanId = human.id;

  const model = source ? cloneModel(THREE_REF, source, cloneAnimatedModel) : new THREE_REF.Group();
  model.scale.setScalar(WORLD_CONFIG.modelScale * 0.92);
  groundModelToFloor(THREE_REF, model, 0.02);
  group.add(model);
  group.userData.actorModel = model;

  const floorRing = new THREE_REF.Mesh(
    new THREE_REF.TorusGeometry(0.92, 0.022, 8, 64),
    new THREE_REF.MeshBasicMaterial({ color: human.accent, transparent: true, opacity: 0.42 })
  );
  floorRing.rotation.x = Math.PI / 2;
  floorRing.position.y = 0.03;
  group.add(floorRing);

  addHumanAccessory(THREE_REF, group, human);
  const label = makeHumanLabel(THREE_REF, human);
  label.position.set(0, 2.35, 0);
  label.visible = false;
  group.add(label);
  group.userData.label = label;
  const prompt = makeInteractionPrompt(THREE_REF, human.accent);
  prompt.position.set(0.86, 1.46, 0);
  prompt.visible = false;
  group.add(prompt);
  group.userData.prompt = prompt;

  const light = new THREE_REF.PointLight(human.accent, 2.5, 5.4);
  light.position.y = 1.35;
  group.add(light);

  group.traverse((child) => {
    child.userData.humanId = human.id;
  });
  return group;
}

function addHumanAccessory(THREE_REF: typeof THREE, group: THREE.Group, human: HumanData) {
  const accent = new THREE_REF.MeshStandardMaterial({
    color: human.accent,
    emissive: human.accent,
    emissiveIntensity: 0.38,
    roughness: 0.42,
    metalness: 0.18,
  });
  const dark = new THREE_REF.MeshStandardMaterial({
    color: "#172033",
    roughness: 0.82,
    metalness: 0.08,
  });

  if (human.id === "canal-guard") {
    const lamp = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.05, 0.07, 0.82, 8), dark);
    lamp.position.set(0.58, 1.05, 0.1);
    lamp.rotation.z = -0.28;
    group.add(lamp);
    const bulb = new THREE_REF.Mesh(new THREE_REF.SphereGeometry(0.16, 14, 14), accent);
    bulb.position.set(0.72, 1.45, 0.12);
    group.add(bulb);
  } else if (human.id === "solar-seller") {
    const tray = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.72, 0.12, 0.42), accent);
    tray.position.set(0.54, 1.05, 0.18);
    tray.rotation.y = -0.22;
    group.add(tray);
    for (let index = 0; index < 3; index += 1) {
      const panel = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.18, 0.03, 0.22), dark);
      panel.position.set(0.33 + index * 0.18, 1.16, 0.18);
      panel.rotation.set(-0.65, -0.22, 0);
      group.add(panel);
    }
  } else if (human.id === "bubble-commuter") {
    const bubble = new THREE_REF.Mesh(
      new THREE_REF.SphereGeometry(0.36, 20, 14),
      new THREE_REF.MeshStandardMaterial({
        color: human.accent,
        emissive: human.accent,
        emissiveIntensity: 0.16,
        transparent: true,
        opacity: 0.24,
        roughness: 0.16,
      })
    );
    bubble.position.set(0.55, 1.35, -0.08);
    group.add(bubble);
  } else if (human.id === "archive-courier") {
    const satchel = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.42, 0.48, 0.16), dark);
    satchel.position.set(-0.42, 0.92, -0.08);
    satchel.rotation.y = 0.28;
    group.add(satchel);
    const letter = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.36, 0.22, 0.025), accent);
    letter.position.set(0.55, 1.25, 0.18);
    letter.rotation.set(0.25, -0.45, 0.16);
    group.add(letter);
  } else if (human.id === "dome-neighbor") {
    const key = new THREE_REF.Mesh(new THREE_REF.TorusGeometry(0.18, 0.025, 8, 28), accent);
    key.position.set(0.58, 1.18, 0.12);
    key.rotation.y = -0.45;
    group.add(key);
    const stem = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.28, 0.045, 0.045), accent);
    stem.position.set(0.75, 1.18, 0.12);
    stem.rotation.y = -0.45;
    group.add(stem);
  } else {
    const clipboard = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.42, 0.52, 0.035), dark);
    clipboard.position.set(0.58, 1.16, 0.1);
    clipboard.rotation.y = -0.42;
    group.add(clipboard);
    const stamp = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.09, 0.09, 0.16, 12), accent);
    stamp.position.set(0.75, 1.44, 0.18);
    stamp.rotation.x = Math.PI / 2;
    group.add(stamp);
  }
}

function addNpcAccessory(THREE_REF: typeof THREE, group: THREE.Group, npc: NpcData) {
  const material = new THREE_REF.MeshStandardMaterial({
    color: npc.accent,
    emissive: npc.accent,
    emissiveIntensity: 0.55,
    roughness: 0.34,
    metalness: 0.28,
  });
  if (npc.id === "futurist") {
    const ring = new THREE_REF.Mesh(new THREE_REF.TorusGeometry(0.52, 0.035, 8, 56), material);
    ring.position.set(0.7, 1.65, 0.1);
    ring.rotation.set(Math.PI / 2, 0.2, 0);
    group.add(ring);
  } else if (npc.id === "rebel") {
    const brush = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.045, 0.065, 0.92, 8), material);
    brush.position.set(0.72, 1.05, 0.18);
    brush.rotation.z = -0.7;
    group.add(brush);
  } else if (npc.id === "observer") {
    for (let i = 0; i < 3; i += 1) {
      const shard = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.34, 0.22, 0.035), material);
      shard.position.set(-0.7 + i * 0.22, 1.35 + i * 0.22, -0.3);
      shard.rotation.set(0.4, i, 0.2);
      group.add(shard);
    }
  } else if (npc.id === "humanitarian") {
    const bowl = new THREE_REF.Mesh(new THREE_REF.TorusGeometry(0.44, 0.055, 8, 48), material);
    bowl.position.set(0.55, 1.05, 0.2);
    bowl.rotation.x = Math.PI / 2;
    group.add(bowl);
  } else if (npc.id === "inventor") {
    const gear = new THREE_REF.Mesh(new THREE_REF.TorusGeometry(0.38, 0.045, 8, 36), material);
    gear.position.set(0.62, 1.45, 0.25);
    gear.rotation.x = Math.PI / 2;
    group.add(gear);
  } else if (npc.id === "wanderer") {
    const star = new THREE_REF.Mesh(new THREE_REF.OctahedronGeometry(0.22, 0), material);
    star.position.set(0.72, 1.65, -0.25);
    group.add(star);
  } else if (npc.id === "visionary") {
    const halo = new THREE_REF.Mesh(new THREE_REF.TorusGeometry(0.52, 0.025, 8, 56), material);
    halo.position.set(0, 1.88, 0);
    halo.rotation.x = Math.PI / 2;
    group.add(halo);
  } else {
    const panel = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.58, 0.34, 0.035), material);
    panel.position.set(0.7, 1.34, 0.2);
    panel.rotation.y = -0.5;
    group.add(panel);
  }
}

function makeNpcLabel(THREE_REF: typeof THREE, npc: NpcData) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 192;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(7, 10, 18, 0.72)";
    context.fillRect(24, 34, 464, 112);
    context.strokeStyle = npc.accent;
    context.lineWidth = 4;
    context.strokeRect(32, 42, 448, 96);
    context.fillStyle = "#f8fafc";
    context.font = "700 36px serif";
    context.textAlign = "center";
    context.fillText(npc.title, 256, 86);
    context.fillStyle = npc.accent;
    context.font = "700 20px sans-serif";
    context.fillText(npc.english, 256, 116);
  }
  const texture = new THREE_REF.CanvasTexture(canvas);
  const sprite = new THREE_REF.Sprite(
    new THREE_REF.SpriteMaterial({ map: texture, transparent: true })
  );
  sprite.scale.set(2.65, 1, 1);
  return sprite;
}

function makeHumanLabel(THREE_REF: typeof THREE, human: HumanData) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 184;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(7, 10, 18, 0.7)";
    context.fillRect(28, 32, 456, 108);
    context.strokeStyle = human.accent;
    context.lineWidth = 4;
    context.strokeRect(36, 40, 440, 92);
    context.fillStyle = "#f8fafc";
    context.font = "700 34px serif";
    context.textAlign = "center";
    context.fillText(human.title, 256, 82);
    context.fillStyle = human.accent;
    context.font = "700 18px sans-serif";
    context.fillText("人類居民 / CITY LEGEND", 256, 114);
  }
  const texture = new THREE_REF.CanvasTexture(canvas);
  const sprite = new THREE_REF.Sprite(
    new THREE_REF.SpriteMaterial({ map: texture, transparent: true })
  );
  sprite.scale.set(2.55, 0.92, 1);
  return sprite;
}

function makeInteractionPrompt(THREE_REF: typeof THREE, accent: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 192;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.shadowColor = accent;
    context.shadowBlur = 18;
    context.fillStyle = "rgba(7, 12, 26, 0.86)";
    context.beginPath();
    context.roundRect(34, 34, 124, 124, 34);
    context.fill();
    context.shadowBlur = 0;
    context.strokeStyle = accent;
    context.lineWidth = 7;
    context.stroke();
    context.fillStyle = "#f8fafc";
    context.font = "900 76px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("E", 96, 96);
  }
  const texture = new THREE_REF.CanvasTexture(canvas);
  const sprite = new THREE_REF.Sprite(
    new THREE_REF.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    })
  );
  sprite.scale.set(0.62, 0.62, 0.62);
  return sprite;
}

function drawPlayerNameTexture(THREE_REF: typeof THREE, name: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(4, 7, 18, 0.76)";
    context.beginPath();
    context.roundRect(66, 30, 380, 68, 30);
    context.fill();
    context.strokeStyle = "rgba(94, 234, 212, 0.82)";
    context.lineWidth = 4;
    context.stroke();
    context.fillStyle = "#f8fafc";
    context.font = "800 34px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(name.slice(0, 18) || "player1", 256, 66);
  }
  return new THREE_REF.CanvasTexture(canvas);
}

function makePlayerNameLabel(THREE_REF: typeof THREE, name: string) {
  const texture = drawPlayerNameTexture(THREE_REF, name);
  const sprite = new THREE_REF.Sprite(
    new THREE_REF.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    })
  );
  sprite.scale.set(1.95, 0.48, 1);
  return sprite;
}

function updatePlayerNameLabel(
  THREE_REF: typeof THREE,
  sprite: THREE.Sprite,
  name: string
) {
  const material = sprite.material as THREE.SpriteMaterial;
  material.map?.dispose();
  material.map = drawPlayerNameTexture(THREE_REF, name);
  material.needsUpdate = true;
}

function createAquariusObjectGroup(THREE_REF: typeof THREE, item: AquariusObjectData) {
  const group = new THREE_REF.Group();
  group.position.set(...scaleWorldPosition(item.position));
  group.userData.objectId = item.id;

  const baseMaterial = new THREE_REF.MeshStandardMaterial({
    color: item.kind === "creature" ? "#dbeafe" : "#273347",
    roughness: 0.72,
    metalness: item.kind === "creature" ? 0.02 : 0.28,
  });
  const accentMaterial = new THREE_REF.MeshStandardMaterial({
    color: item.accent,
    emissive: item.accent,
    emissiveIntensity: 0.62,
    roughness: 0.36,
    metalness: 0.18,
  });
  const darkMaterial = new THREE_REF.MeshStandardMaterial({
    color: "#111827",
    roughness: 0.82,
    metalness: 0.08,
  });

  if (item.id === "reverse-clock") {
    addReverseClockObject(THREE_REF, group, baseMaterial, accentMaterial);
  } else if (item.id === "contrarian-vending") {
    addContrarianVendingObject(THREE_REF, group, darkMaterial, accentMaterial);
  } else if (item.id === "crowd-antenna") {
    addCrowdAntennaObject(THREE_REF, group, baseMaterial, accentMaterial);
  } else if (item.id === "unwritten-chair") {
    addUnwrittenChairObject(THREE_REF, group, darkMaterial, accentMaterial);
  } else if (item.id === "habitat-dome") {
    addHabitatDomeObject(THREE_REF, group, darkMaterial, accentMaterial);
  } else if (item.id === "oxygen-tree") {
    addOxygenTreeObject(THREE_REF, group, baseMaterial, accentMaterial);
  } else if (item.id === "hydroponic-kitchen") {
    addHydroponicKitchenObject(THREE_REF, group, darkMaterial, accentMaterial);
  } else if (item.id === "memory-market") {
    addMemoryMarketObject(THREE_REF, group, darkMaterial, accentMaterial);
  } else if (item.id === "monorail-station") {
    addMonorailStationObject(THREE_REF, group, baseMaterial, accentMaterial);
  } else if (item.id === "flying-cow") {
    addFlyingCowObject(THREE_REF, group, darkMaterial, accentMaterial);
  } else if (item.id === "signal-jellyfish") {
    addSignalJellyfishObject(THREE_REF, group, accentMaterial);
  } else if (item.id === "quantum-deer") {
    addQuantumDeerObject(THREE_REF, group, darkMaterial, accentMaterial);
  } else if (item.id === "bubble-dog") {
    addBubbleDogObject(THREE_REF, group, darkMaterial, accentMaterial);
  } else if (item.id === "solar-sheep") {
    addSolarSheepObject(THREE_REF, group, darkMaterial, accentMaterial);
  } else {
    addPaperRayObject(THREE_REF, group, accentMaterial);
  }

  const floorRing = new THREE_REF.Mesh(
    new THREE_REF.TorusGeometry(item.kind === "creature" ? 1.35 : 1.05, 0.024, 8, 64),
    new THREE_REF.MeshBasicMaterial({ color: item.accent, transparent: true, opacity: 0.48 })
  );
  floorRing.rotation.x = Math.PI / 2;
  floorRing.position.y = item.kind === "creature" ? -item.position[1] + 0.06 : 0.04;
  group.add(floorRing);

  const label = makeObjectLabel(THREE_REF, item);
  label.position.set(0, item.kind === "creature" ? 1.75 : 2.2, 0);
  label.visible = false;
  group.add(label);
  group.userData.label = label;
  const prompt = makeInteractionPrompt(THREE_REF, item.accent);
  prompt.position.set(item.kind === "creature" ? 0.9 : 0.82, item.kind === "creature" ? 1.2 : 1.52, 0);
  prompt.visible = false;
  group.add(prompt);
  group.userData.prompt = prompt;

  const light = new THREE_REF.PointLight(item.accent, item.kind === "creature" ? 3.2 : 2.4, 7);
  light.position.y = item.kind === "creature" ? 0.4 : 1.2;
  group.add(light);

  group.traverse((child) => {
    child.userData.objectId = item.id;
  });
  return group;
}

function addReverseClockObject(
  THREE_REF: typeof THREE,
  group: THREE.Group,
  baseMaterial: THREE.Material,
  accentMaterial: THREE.Material
) {
  const pedestal = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.5, 0.7, 0.55, 10), baseMaterial);
  pedestal.position.y = 0.28;
  group.add(pedestal);
  const hourglass = new THREE_REF.Mesh(new THREE_REF.OctahedronGeometry(0.58, 0), accentMaterial);
  hourglass.position.y = 1.12;
  hourglass.scale.set(0.72, 1.2, 0.72);
  group.add(hourglass);
  const ring = new THREE_REF.Mesh(new THREE_REF.TorusGeometry(0.72, 0.035, 8, 54), accentMaterial);
  ring.position.y = 1.12;
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  for (let index = 0; index < 3; index += 1) {
    const drop = new THREE_REF.Mesh(new THREE_REF.SphereGeometry(0.08, 12, 12), accentMaterial);
    drop.position.set(-0.16 + index * 0.16, 1.76 - index * 0.3, 0.1);
    group.add(drop);
  }
}

function addContrarianVendingObject(
  THREE_REF: typeof THREE,
  group: THREE.Group,
  darkMaterial: THREE.Material,
  accentMaterial: THREE.Material
) {
  const body = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(1.25, 2.05, 0.72), darkMaterial);
  body.position.y = 1.05;
  body.rotation.y = -0.25;
  group.add(body);
  const screen = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.72, 0.36, 0.035), accentMaterial);
  screen.position.set(-0.1, 1.62, 0.38);
  screen.rotation.y = -0.25;
  group.add(screen);
  for (let index = 0; index < 6; index += 1) {
    const button = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.12, 0.12, 0.04), accentMaterial);
    button.position.set(0.36, 1.2 - (index % 3) * 0.18, 0.4 + Math.floor(index / 3) * 0.015);
    button.rotation.y = -0.25;
    group.add(button);
  }
  const ideaCube = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.3, 0.16, 0.3), accentMaterial);
  ideaCube.position.set(-0.22, 0.42, 0.5);
  ideaCube.rotation.set(0.4, 0.2, 0.5);
  group.add(ideaCube);
}

function addCrowdAntennaObject(
  THREE_REF: typeof THREE,
  group: THREE.Group,
  baseMaterial: THREE.Material,
  accentMaterial: THREE.Material
) {
  const mast = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.06, 0.08, 1.8, 10), baseMaterial);
  mast.position.y = 0.9;
  group.add(mast);
  const dish = new THREE_REF.Mesh(new THREE_REF.ConeGeometry(0.72, 0.34, 32, 1, true), accentMaterial);
  dish.position.y = 1.74;
  dish.rotation.x = Math.PI / 2.7;
  group.add(dish);
  for (let index = 0; index < 5; index += 1) {
    const thought = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.16, 0.16, 0.16), accentMaterial);
    const theta = (index / 5) * Math.PI * 2;
    thought.position.set(Math.cos(theta) * 0.95, 1.7 + Math.sin(index) * 0.22, Math.sin(theta) * 0.95);
    thought.rotation.set(index * 0.4, index * 0.6, 0.2);
    group.add(thought);
  }
}

function addUnwrittenChairObject(
  THREE_REF: typeof THREE,
  group: THREE.Group,
  darkMaterial: THREE.Material,
  accentMaterial: THREE.Material
) {
  const seat = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(1.1, 0.16, 1), darkMaterial);
  seat.position.y = 0.72;
  seat.rotation.set(0.08, -0.42, 0.12);
  group.add(seat);
  const back = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(1.1, 1.05, 0.14), accentMaterial);
  back.position.set(0.08, 1.2, -0.44);
  back.rotation.set(-0.3, -0.42, 0.05);
  group.add(back);
  for (let index = 0; index < 4; index += 1) {
    const leg = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.045, 0.055, 0.7, 8), darkMaterial);
    leg.position.set(index < 2 ? -0.42 : 0.42, 0.34, index % 2 === 0 ? -0.34 : 0.34);
    leg.rotation.z = index % 2 === 0 ? 0.16 : -0.16;
    group.add(leg);
  }
  const stage = new THREE_REF.Mesh(new THREE_REF.TorusGeometry(0.78, 0.035, 8, 48), accentMaterial);
  stage.position.y = 0.58;
  stage.rotation.x = Math.PI / 2;
  group.add(stage);
}

function addHabitatDomeObject(
  THREE_REF: typeof THREE,
  group: THREE.Group,
  darkMaterial: THREE.Material,
  accentMaterial: THREE.Material
) {
  const base = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(1.12, 1.32, 0.42, 16), darkMaterial);
  base.position.y = 0.22;
  group.add(base);
  const glass = new THREE_REF.Mesh(
    new THREE_REF.SphereGeometry(1.12, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE_REF.MeshStandardMaterial({
      color: "#a7f3d0",
      emissive: "#0f766e",
      emissiveIntensity: 0.16,
      transparent: true,
      opacity: 0.36,
      roughness: 0.18,
    })
  );
  glass.position.y = 0.42;
  group.add(glass);
  for (let index = 0; index < 3; index += 1) {
    const pod = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.42, 0.36, 0.58), accentMaterial);
    const theta = index * (Math.PI * 2 / 3);
    pod.position.set(Math.cos(theta) * 0.62, 0.56, Math.sin(theta) * 0.62);
    pod.rotation.y = -theta;
    group.add(pod);
  }
}

function addOxygenTreeObject(
  THREE_REF: typeof THREE,
  group: THREE.Group,
  baseMaterial: THREE.Material,
  accentMaterial: THREE.Material
) {
  const trunk = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.14, 0.24, 1.35, 8), baseMaterial);
  trunk.position.y = 0.68;
  group.add(trunk);
  [0, 0.55, -0.55].forEach((x, index) => {
    const crown = new THREE_REF.Mesh(new THREE_REF.OctahedronGeometry(0.48 - index * 0.04, 0), accentMaterial);
    crown.position.set(x, 1.55 + index * 0.18, index === 0 ? 0 : 0.22);
    crown.rotation.set(index * 0.3, index * 0.8, 0.42);
    group.add(crown);
  });
  const halo = new THREE_REF.Mesh(new THREE_REF.TorusGeometry(1.05, 0.025, 8, 64), accentMaterial);
  halo.position.y = 1.55;
  halo.rotation.x = Math.PI / 2;
  group.add(halo);
}

function addHydroponicKitchenObject(
  THREE_REF: typeof THREE,
  group: THREE.Group,
  darkMaterial: THREE.Material,
  accentMaterial: THREE.Material
) {
  const counter = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(1.8, 0.32, 0.72), darkMaterial);
  counter.position.y = 0.5;
  group.add(counter);
  for (let index = 0; index < 4; index += 1) {
    const tube = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.055, 0.055, 1.45, 10), accentMaterial);
    tube.position.set(-0.64 + index * 0.42, 0.9, 0);
    tube.rotation.z = Math.PI / 2;
    group.add(tube);
    const crop = new THREE_REF.Mesh(new THREE_REF.ConeGeometry(0.13, 0.38, 5), accentMaterial);
    crop.position.set(-0.64 + index * 0.42, 1.15, 0.18);
    group.add(crop);
  }
  const sign = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.7, 0.36, 0.05), accentMaterial);
  sign.position.set(0, 1.38, -0.36);
  group.add(sign);
}

function addMemoryMarketObject(
  THREE_REF: typeof THREE,
  group: THREE.Group,
  darkMaterial: THREE.Material,
  accentMaterial: THREE.Material
) {
  const table = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(1.55, 0.24, 0.92), darkMaterial);
  table.position.y = 0.58;
  group.add(table);
  const canopy = new THREE_REF.Mesh(new THREE_REF.ConeGeometry(1.05, 0.52, 4), accentMaterial);
  canopy.position.y = 1.55;
  canopy.rotation.y = Math.PI / 4;
  group.add(canopy);
  for (let index = 0; index < 5; index += 1) {
    const memory = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.18, 0.18, 0.18), accentMaterial);
    memory.position.set(-0.58 + index * 0.29, 0.86 + Math.sin(index) * 0.08, 0.08);
    memory.rotation.set(index * 0.4, index * 0.8, 0.2);
    group.add(memory);
  }
}

function addMonorailStationObject(
  THREE_REF: typeof THREE,
  group: THREE.Group,
  baseMaterial: THREE.Material,
  accentMaterial: THREE.Material
) {
  const platform = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(2.1, 0.22, 0.95), baseMaterial);
  platform.position.y = 0.42;
  group.add(platform);
  const rail = new THREE_REF.Mesh(new THREE_REF.TorusGeometry(1.15, 0.035, 8, 72), accentMaterial);
  rail.position.y = 0.75;
  rail.rotation.x = Math.PI / 2;
  group.add(rail);
  const train = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.78, 0.34, 0.42), accentMaterial);
  train.position.set(0.35, 1.08, 0);
  train.rotation.y = -0.42;
  group.add(train);
  const mast = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.045, 0.065, 1.24, 8), baseMaterial);
  mast.position.set(-0.82, 1, -0.24);
  group.add(mast);
}

function addFlyingCowObject(
  THREE_REF: typeof THREE,
  group: THREE.Group,
  darkMaterial: THREE.Material,
  accentMaterial: THREE.Material
) {
  const cowWhite = new THREE_REF.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.72 });
  const cowBlack = new THREE_REF.MeshStandardMaterial({ color: "#1f2937", roughness: 0.7 });
  const body = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(1.45, 0.68, 0.72), cowWhite);
  body.position.y = 0.15;
  group.add(body);
  const head = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.48, 0.5, 0.5), cowWhite);
  head.position.set(0.92, 0.22, 0.02);
  group.add(head);
  [-0.34, 0.26].forEach((z, index) => {
    const spot = new THREE_REF.Mesh(new THREE_REF.SphereGeometry(0.18 + index * 0.03, 12, 12), cowBlack);
    spot.position.set(-0.22 + index * 0.24, 0.24, z);
    spot.scale.set(1.1, 0.46, 0.3);
    group.add(spot);
  });
  [-0.18, 0.18].forEach((z) => {
    const horn = new THREE_REF.Mesh(new THREE_REF.ConeGeometry(0.08, 0.22, 8), accentMaterial);
    horn.position.set(1.16, 0.56, z);
    horn.rotation.z = -Math.PI / 2;
    group.add(horn);
  });
  const wings = [-1, 1].map((side) => {
    const wing = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.78, 0.08, 0.42), accentMaterial);
    wing.position.set(-0.22, 0.32, side * 0.55);
    wing.rotation.y = side * 0.25;
    group.add(wing);
    return wing;
  });
  for (let index = 0; index < 4; index += 1) {
    const leg = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.14, 0.42, 0.14), darkMaterial);
    leg.position.set(index < 2 ? -0.42 : 0.38, -0.46, index % 2 === 0 ? -0.22 : 0.22);
    group.add(leg);
  }
  group.userData.wings = wings;
}

function addSignalJellyfishObject(
  THREE_REF: typeof THREE,
  group: THREE.Group,
  accentMaterial: THREE.Material
) {
  const bellMaterial = new THREE_REF.MeshStandardMaterial({
    color: "#d8b4fe",
    emissive: "#7c3aed",
    emissiveIntensity: 0.45,
    transparent: true,
    opacity: 0.72,
    roughness: 0.24,
  });
  const bell = new THREE_REF.Mesh(new THREE_REF.SphereGeometry(0.58, 24, 16), bellMaterial);
  bell.scale.set(1, 0.58, 1);
  group.add(bell);
  const tendrils: THREE.Object3D[] = [];
  for (let index = 0; index < 6; index += 1) {
    const theta = (index / 6) * Math.PI * 2;
    const tendril = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.018, 0.028, 1.25, 6), accentMaterial);
    tendril.position.set(Math.cos(theta) * 0.3, -0.72, Math.sin(theta) * 0.3);
    tendril.rotation.z = Math.cos(theta) * 0.22;
    group.add(tendril);
    tendrils.push(tendril);
  }
  group.userData.tendrils = tendrils;
}

function addQuantumDeerObject(
  THREE_REF: typeof THREE,
  group: THREE.Group,
  darkMaterial: THREE.Material,
  accentMaterial: THREE.Material
) {
  const body = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(1.2, 0.55, 0.48), darkMaterial);
  body.position.y = 0.78;
  group.add(body);
  const neck = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.24, 0.58, 0.24), darkMaterial);
  neck.position.set(0.55, 1.12, 0);
  neck.rotation.z = -0.18;
  group.add(neck);
  const head = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.42, 0.34, 0.34), darkMaterial);
  head.position.set(0.83, 1.42, 0);
  group.add(head);
  for (let index = 0; index < 4; index += 1) {
    const leg = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.045, 0.06, 0.72, 7), darkMaterial);
    leg.position.set(index < 2 ? -0.36 : 0.36, 0.34, index % 2 === 0 ? -0.17 : 0.17);
    group.add(leg);
  }
  [-1, 1].forEach((side) => {
    const antler = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.08, 0.78, 0.08), accentMaterial);
    antler.position.set(0.82, 1.86, side * 0.15);
    antler.rotation.z = side * 0.34;
    group.add(antler);
    const branch = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.06, 0.44, 0.06), accentMaterial);
    branch.position.set(0.7, 1.95, side * 0.34);
    branch.rotation.set(0.18, 0, side * 0.85);
    group.add(branch);
  });
  const ghost = new THREE_REF.Mesh(
    new THREE_REF.BoxGeometry(1.24, 0.58, 0.5),
    new THREE_REF.MeshBasicMaterial({ color: "#7dd3fc", transparent: true, opacity: 0.16 })
  );
  ghost.position.set(-0.18, 0.82, 0.18);
  group.add(ghost);
}

function addBubbleDogObject(
  THREE_REF: typeof THREE,
  group: THREE.Group,
  darkMaterial: THREE.Material,
  accentMaterial: THREE.Material
) {
  const body = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(1.05, 0.48, 0.55), darkMaterial);
  body.position.y = 0.62;
  group.add(body);
  const head = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.48, 0.46, 0.46), darkMaterial);
  head.position.set(0.68, 0.78, 0);
  group.add(head);
  [-0.16, 0.16].forEach((z) => {
    const ear = new THREE_REF.Mesh(new THREE_REF.ConeGeometry(0.12, 0.32, 4), accentMaterial);
    ear.position.set(0.72, 1.13, z);
    ear.rotation.z = -0.2;
    group.add(ear);
  });
  const tail = new THREE_REF.Mesh(new THREE_REF.TorusGeometry(0.22, 0.035, 8, 30), accentMaterial);
  tail.position.set(-0.62, 0.8, 0);
  tail.rotation.y = Math.PI / 2;
  group.add(tail);
  for (let index = 0; index < 4; index += 1) {
    const leg = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.12, 0.34, 0.12), darkMaterial);
    leg.position.set(index < 2 ? -0.32 : 0.34, 0.24, index % 2 === 0 ? -0.18 : 0.18);
    group.add(leg);
  }
  const bubbles: THREE.Object3D[] = [];
  for (let index = 0; index < 5; index += 1) {
    const bubble = new THREE_REF.Mesh(
      new THREE_REF.SphereGeometry(0.11 + index * 0.018, 12, 10),
      new THREE_REF.MeshStandardMaterial({
        color: "#d8b4fe",
        emissive: "#8b5cf6",
        emissiveIntensity: 0.22,
        transparent: true,
        opacity: 0.38,
        roughness: 0.16,
      })
    );
    bubble.position.set(-0.45 + index * 0.22, 1.22 + (index % 2) * 0.22, -0.32 + index * 0.13);
    group.add(bubble);
    bubbles.push(bubble);
  }
  group.userData.bubbles = bubbles;
}

function addSolarSheepObject(
  THREE_REF: typeof THREE,
  group: THREE.Group,
  darkMaterial: THREE.Material,
  accentMaterial: THREE.Material
) {
  const wool = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(1.12, 0.72, 0.66), accentMaterial);
  wool.position.y = 0.74;
  group.add(wool);
  const head = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.42, 0.42, 0.42), darkMaterial);
  head.position.set(0.78, 0.78, 0);
  group.add(head);
  const panel = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.76, 0.035, 0.48), darkMaterial);
  panel.position.set(-0.1, 1.18, 0);
  panel.rotation.x = -0.28;
  group.add(panel);
  for (let index = 0; index < 4; index += 1) {
    const leg = new THREE_REF.Mesh(new THREE_REF.CylinderGeometry(0.045, 0.055, 0.42, 6), darkMaterial);
    leg.position.set(index < 2 ? -0.34 : 0.34, 0.24, index % 2 === 0 ? -0.22 : 0.22);
    group.add(leg);
  }
  [-0.18, 0.18].forEach((z) => {
    const horn = new THREE_REF.Mesh(new THREE_REF.TorusGeometry(0.14, 0.025, 8, 24), accentMaterial);
    horn.position.set(0.88, 0.98, z);
    horn.rotation.y = Math.PI / 2;
    group.add(horn);
  });
}

function addPaperRayObject(
  THREE_REF: typeof THREE,
  group: THREE.Group,
  accentMaterial: THREE.Material
) {
  const wingMaterial = new THREE_REF.MeshStandardMaterial({
    color: "#fbcfe8",
    emissive: "#fb7185",
    emissiveIntensity: 0.28,
    roughness: 0.42,
    metalness: 0.04,
  });
  const body = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(1.45, 0.08, 0.72), wingMaterial);
  body.rotation.z = 0.06;
  group.add(body);
  const nose = new THREE_REF.Mesh(new THREE_REF.ConeGeometry(0.24, 0.54, 4), accentMaterial);
  nose.position.set(0.82, 0, 0);
  nose.rotation.z = -Math.PI / 2;
  group.add(nose);
  [-1, 1].forEach((side) => {
    const fin = new THREE_REF.Mesh(new THREE_REF.BoxGeometry(0.64, 0.04, 0.28), accentMaterial);
    fin.position.set(-0.1, 0.02, side * 0.52);
    fin.rotation.set(0, side * 0.18, side * 0.28);
    group.add(fin);
  });
  group.userData.paperRay = body;
}

function makeObjectLabel(THREE_REF: typeof THREE, item: AquariusObjectData) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 184;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(7, 10, 18, 0.74)";
    context.fillRect(28, 32, 456, 110);
    context.strokeStyle = item.accent;
    context.lineWidth = 4;
    context.strokeRect(36, 40, 440, 94);
    context.fillStyle = "#f8fafc";
    context.font = "700 34px serif";
    context.textAlign = "center";
    context.fillText(item.title, 256, 82);
    context.fillStyle = item.accent;
    context.font = "700 18px sans-serif";
    context.fillText(item.trait, 256, 116);
  }
  const texture = new THREE_REF.CanvasTexture(canvas);
  const sprite = new THREE_REF.Sprite(
    new THREE_REF.SpriteMaterial({ map: texture, transparent: true })
  );
  sprite.scale.set(2.55, 0.92, 1);
  return sprite;
}

function updateRuntime(
  runtime: Runtime,
  delta: number,
  callbacks: {
    phase: Phase;
    dialogue: DialogueState | null;
    humanDialogue: HumanDialogueState | null;
    artifact: ArtifactState | null;
    onRegion: (region: string) => void;
    onNearestNpc: (id: ArchetypeId | null) => void;
    onNearestTarget: (target: InteractionTarget | null) => void;
    onOpenDialogue: (id: ArchetypeId) => void;
    onOpenHumanDialogue: (id: HumanId) => void;
    onOpenArtifact: (id: AquariusObjectId) => void;
    isJournalOpen: () => boolean;
    onTutorialMove: () => void;
    onFootstep: () => void;
  }
) {
  const { THREE: THREE_REF, player, controls } = runtime;
  const time = performance.now() * 0.001;
  runtime.particles.rotation.y += delta * 0.018;
  runtime.actorMixers.forEach((mixer) => mixer.update(delta));
  updateAmbientModels(runtime, delta, time);

  runtime.npcGroups.forEach((group, id) => {
    const label = runtime.npcLabels.get(id);
    const prompt = runtime.npcPrompts.get(id);
    const distance = player.position.distanceTo(group.position);
    const animator = runtime.npcAnimators.get(id);
    const motion = runtime.npcMotion.get(id);
    const inDialogue = callbacks.dialogue?.npcId === id;
    if (inDialogue || distance < 2.6) {
      playActorAction(animator, inDialogue ? "talk" : getNpcIdleAction(id));
      faceTowards(group, player.position, Math.min(1, delta * 5));
    } else if (motion) {
      updateWanderActor(runtime, group, motion, animator, delta, time);
    }
    group.position.y = Math.sin(time * 1.8 + motionSeed(id)) * 0.035;
    runtime.npcPositions.set(id, group.position.clone());
    if (label) {
      label.visible = distance < WORLD_CONFIG.revealDistance || callbacks.dialogue?.npcId === id;
    }
    if (prompt) {
      const active = distance < WORLD_CONFIG.interactDistance && !callbacks.dialogue;
      prompt.visible = active;
      prompt.scale.setScalar(0.62 + Math.sin(time * 7) * 0.035);
    }
  });

  runtime.humanGroups.forEach((group, id) => {
    const label = runtime.humanLabels.get(id);
    const prompt = runtime.humanPrompts.get(id);
    const distance = player.position.distanceTo(group.position);
    const animator = runtime.humanAnimators.get(id);
    const motion = runtime.humanMotion.get(id);
    const inDialogue = callbacks.humanDialogue?.humanId === id;
    if (inDialogue || distance < 2.35) {
      playActorAction(animator, inDialogue ? "talk" : motion?.idleAction ?? "idle");
      faceTowards(group, player.position, Math.min(1, delta * 4.5));
    } else if (motion) {
      updateWanderActor(runtime, group, motion, animator, delta, time);
    }
    group.position.y = Math.sin(time * 1.35 + motionSeed(id)) * 0.026;
    runtime.humanPositions.set(id, group.position.clone());
    if (label) {
      label.visible = distance < WORLD_CONFIG.revealDistance || callbacks.humanDialogue?.humanId === id;
    }
    if (prompt) {
      const active = distance < WORLD_CONFIG.interactDistance && !callbacks.humanDialogue;
      prompt.visible = active;
      prompt.scale.setScalar(0.58 + Math.sin(time * 7 + 0.7) * 0.032);
    }
  });

  runtime.objectGroups.forEach((group, id) => {
    const item = getAquariusObject(id);
    const label = runtime.objectLabels.get(id);
    const prompt = runtime.objectPrompts.get(id);
    const distance = player.position.distanceTo(runtime.objectPositions.get(id) ?? group.position);
    const floatBase = item.position[1];
    group.position.y = floatBase + Math.sin(time * (item.kind === "creature" ? 1.5 : 1.05) + group.position.x) * 0.14;
    group.rotation.y += delta * (item.kind === "creature" ? 0.18 : 0.08);
    const wings = group.userData.wings as THREE.Object3D[] | undefined;
    wings?.forEach((wing, index) => {
      wing.rotation.z = (index === 0 ? 0.45 : -0.45) + Math.sin(time * 6.2) * (index === 0 ? 0.42 : -0.42);
    });
    const tendrils = group.userData.tendrils as THREE.Object3D[] | undefined;
    tendrils?.forEach((tendril, index) => {
      tendril.rotation.x = Math.sin(time * 2.4 + index) * 0.22;
    });
    const bubbles = group.userData.bubbles as THREE.Object3D[] | undefined;
    bubbles?.forEach((bubble, index) => {
      bubble.position.y += Math.sin(time * 2.1 + index) * 0.0025;
      bubble.rotation.y += delta * 0.7;
    });
    const paperRay = group.userData.paperRay as THREE.Object3D | undefined;
    if (paperRay) {
      paperRay.rotation.z = 0.05 + Math.sin(time * 2.2) * 0.14;
    }
    if (label) {
      label.visible = distance < WORLD_CONFIG.revealDistance || callbacks.artifact?.objectId === id;
    }
    if (prompt) {
      const active = distance < WORLD_CONFIG.interactDistance && !callbacks.artifact;
      prompt.visible = active;
      prompt.scale.setScalar(0.56 + Math.sin(time * 7 + 1.2) * 0.03);
    }
  });

  if (
    callbacks.phase === "playing" &&
    !callbacks.dialogue &&
    !callbacks.humanDialogue &&
    !callbacks.artifact &&
    !callbacks.isJournalOpen()
  ) {
    updatePlayerMovement(runtime, delta, callbacks.onTutorialMove, callbacks.onFootstep);
  } else {
    runtime.velocity.lerp(new THREE_REF.Vector3(0, 0, 0), Math.min(1, delta * 8));
    updateJump(runtime, delta);
  }

  const region = getRegionName(player.position.x, player.position.z);
  if (runtime.frame % 12 === 0) {
    callbacks.onRegion(region);
  }

  const nearestNpc = findNearestNpc(runtime);
  const nearestTarget = findNearestInteraction(runtime);
  if (runtime.frame % 8 === 0) {
    callbacks.onNearestNpc(nearestNpc && nearestNpc.distance < WORLD_CONFIG.interactDistance ? nearestNpc.id : null);
    callbacks.onNearestTarget(
      nearestTarget && nearestTarget.distance < WORLD_CONFIG.interactDistance ? nearestTarget : null
    );
  }

  if (
    runtime.pendingNpcId &&
    nearestTarget?.kind === "npc" &&
    nearestTarget.id === runtime.pendingNpcId &&
    nearestTarget.distance < WORLD_CONFIG.interactDistance
  ) {
    callbacks.onOpenDialogue(runtime.pendingNpcId);
  }

  if (
    runtime.pendingObjectId &&
    nearestTarget?.kind === "object" &&
    nearestTarget.id === runtime.pendingObjectId &&
    nearestTarget.distance < WORLD_CONFIG.interactDistance
  ) {
    callbacks.onOpenArtifact(runtime.pendingObjectId);
  }

  if (
    runtime.pendingHumanId &&
    nearestTarget?.kind === "human" &&
    nearestTarget.id === runtime.pendingHumanId &&
    nearestTarget.distance < WORLD_CONFIG.interactDistance
  ) {
    callbacks.onOpenHumanDialogue(runtime.pendingHumanId);
  }

  if (callbacks.dialogue) {
    focusDialogueCamera(runtime, callbacks.dialogue.npcId, delta);
  } else if (callbacks.humanDialogue) {
    focusHumanCamera(runtime, callbacks.humanDialogue.humanId, delta);
  } else if (callbacks.artifact) {
    focusArtifactCamera(runtime, callbacks.artifact.objectId, delta);
  } else {
    followPlayerCamera(runtime, delta);
  }

  controls.update();
}

function motionSeed(id: string) {
  let seed = 0;
  for (let index = 0; index < id.length; index += 1) {
    seed += id.charCodeAt(index) * (index + 1);
  }
  return seed * 0.013;
}

function updateWanderActor(
  runtime: Runtime,
  group: THREE.Group,
  motion: WanderState,
  animator: ActorAnimator | undefined,
  delta: number,
  time: number
) {
  if (time < motion.pauseUntil) {
    playActorAction(animator, motion.idleAction);
    group.rotation.y += Math.sin(time * 1.8 + motion.home.x) * delta * 0.18;
    return;
  }

  const targetOffset = motion.target.clone().sub(group.position).setY(0);
  const distance = targetOffset.length();
  if (distance < 0.18) {
    motion.pauseUntil = time + 1.2 + Math.random() * 1.6;
    motion.target = pickWanderTarget(runtime.THREE, motion.home, motion.radius);
    if (time > motion.nextGestureAt) {
      motion.nextGestureAt = time + 4 + Math.random() * 4;
      playActorAction(animator, motion.idleAction, 0.16);
    }
    return;
  }

  const direction = targetOffset.normalize();
  const step = Math.min(distance, motion.speed * delta);
  group.position.addScaledVector(direction, step);
  const angle = Math.atan2(direction.x, direction.z) + MODEL_FORWARD_OFFSET;
  group.rotation.y = lerpAngle(group.rotation.y, angle, Math.min(1, delta * 5.5));
  playActorAction(animator, motion.speed > 0.62 ? "run" : "walk");
}

function updateAmbientModels(runtime: Runtime, delta: number, time: number) {
  runtime.ambientModels.forEach((ambient) => {
    const fins = ambient.group.userData.fins as THREE.Object3D[] | undefined;
    fins?.forEach((fin, index) => {
      fin.rotation.z = (index === 0 ? 0.45 : -0.45) + Math.sin(time * 2.8) * (index === 0 ? 0.26 : -0.26);
    });
    const tail = ambient.group.userData.tail as THREE.Object3D | undefined;
    if (tail) {
      tail.rotation.y = Math.sin(time * 3.1) * 0.34;
    }

    if (ambient.mode === "spin") {
      playActorAction(ambient.animator, "idle");
      ambient.group.rotation.y += delta * ambient.speed;
      ambient.group.position.y =
        ambient.home.y + Math.sin(time * 1.7 + ambient.home.x) * 0.08;
      return;
    }

    if (ambient.mode === "float") {
      playActorAction(ambient.animator, "idle");
      ambient.group.position.y =
        ambient.home.y + Math.sin(time * (1.3 + ambient.speed) + ambient.home.z) * 0.12;
      ambient.group.rotation.y += delta * ambient.speed * 0.35;
      return;
    }

    if (ambient.mode === "idle") {
      playActorAction(ambient.animator, "idle");
      ambient.group.position.y =
        ambient.home.y + Math.sin(time * 1.1 + ambient.home.x) * 0.025;
      ambient.group.rotation.y += Math.sin(time + ambient.home.z) * delta * 0.08;
      return;
    }

    if (time < ambient.pauseUntil) {
      playActorAction(ambient.animator, "idle");
      ambient.group.position.y =
        ambient.home.y + Math.sin(time * 2 + ambient.home.x) * 0.02;
      return;
    }

    const targetOffset = ambient.target.clone().sub(ambient.group.position).setY(0);
    const distance = targetOffset.length();
    if (distance < 0.16) {
      ambient.pauseUntil = time + 0.9 + Math.random() * 1.5;
      ambient.target = pickWanderTarget(runtime.THREE, ambient.home, ambient.radius);
      return;
    }

    const direction = targetOffset.normalize();
    playActorAction(ambient.animator, ambient.motionAction);
    ambient.group.position.addScaledVector(direction, Math.min(distance, ambient.speed * delta));
    ambient.group.rotation.y = lerpAngle(
      ambient.group.rotation.y,
      Math.atan2(direction.x, direction.z) + MODEL_FORWARD_OFFSET,
      Math.min(1, delta * 4)
    );
    ambient.group.position.y = ambient.home.y + Math.sin(time * 6 + ambient.home.x) * 0.025;
  });
}

function updatePlayerMovement(
  runtime: Runtime,
  delta: number,
  onTutorialMove: () => void,
  onFootstep: () => void
) {
  const { THREE: THREE_REF, player, camera, controls } = runtime;
  let horizontal = 0;
  let vertical = 0;
  if (runtime.keys.has("KeyW") || runtime.keys.has("ArrowUp")) vertical += 1;
  if (runtime.keys.has("KeyS") || runtime.keys.has("ArrowDown")) vertical -= 1;
  if (runtime.keys.has("KeyA") || runtime.keys.has("ArrowLeft")) horizontal -= 1;
  if (runtime.keys.has("KeyD") || runtime.keys.has("ArrowRight")) horizontal += 1;
  horizontal += runtime.joystick.x;
  vertical += -runtime.joystick.y;

  const cameraForward = new THREE_REF.Vector3()
    .subVectors(controls.target, camera.position)
    .setY(0)
    .normalize();
  const cameraRight = new THREE_REF.Vector3().crossVectors(cameraForward, new THREE_REF.Vector3(0, 1, 0)).normalize();
  const desired = new THREE_REF.Vector3();
  let usingKeyboard = Math.abs(horizontal) + Math.abs(vertical) > 0.05;

  if (usingKeyboard) {
    desired.addScaledVector(cameraForward, vertical);
    desired.addScaledVector(cameraRight, horizontal);
    if (desired.lengthSq() > 0.001) {
      desired.normalize();
    }
    runtime.clickTarget = null;
    runtime.pendingNpcId = null;
    runtime.pendingHumanId = null;
    runtime.pendingObjectId = null;
  } else if (runtime.clickTarget) {
    desired.subVectors(runtime.clickTarget, player.position).setY(0);
    if (desired.length() < 0.22) {
      runtime.clickTarget = null;
      desired.set(0, 0, 0);
    } else {
      desired.normalize();
      usingKeyboard = true;
    }
  }

  const speed =
    runtime.keys.has("ShiftLeft") || runtime.keys.has("ShiftRight")
      ? WORLD_CONFIG.runSpeed
      : WORLD_CONFIG.moveSpeed;
  const desiredVelocity = desired.multiplyScalar(speed);
  runtime.velocity.lerp(
    desiredVelocity,
    Math.min(1, delta * (usingKeyboard ? WORLD_CONFIG.acceleration : WORLD_CONFIG.damping))
  );

  if (!usingKeyboard && runtime.velocity.length() < 0.02) {
    runtime.velocity.set(0, 0, 0);
  }

  const next = player.position.clone().addScaledVector(runtime.velocity, delta);
  const clamped = clampToWorld(next.x, next.z);
  next.x = clamped.x;
  next.z = clamped.z;

  if (!collides(runtime, next.x, next.z)) {
    player.position.copy(next);
  } else {
    const tryX = player.position.clone();
    tryX.x = next.x;
    const tryZ = player.position.clone();
    tryZ.z = next.z;
    if (!collides(runtime, tryX.x, tryX.z)) {
      player.position.copy(tryX);
    } else if (!collides(runtime, tryZ.x, tryZ.z)) {
      player.position.copy(tryZ);
    } else {
      runtime.velocity.multiplyScalar(0.2);
    }
  }

  const moving = runtime.velocity.length() > 0.12;
  const playerFloorY = getModelFloorY(runtime.playerModel);
  if (moving) {
    onTutorialMove();
    const angle = Math.atan2(runtime.velocity.x, runtime.velocity.z);
    runtime.playerModel.rotation.y = angle + MODEL_FORWARD_OFFSET;
    const running = speed > WORLD_CONFIG.moveSpeed;
    playActorAction(runtime.playerAnimator, running ? "run" : "walk");
    const bob = Math.sin(performance.now() * 0.016 * (running ? 1.4 : 1)) * 0.018;
    runtime.playerModel.position.y = playerFloorY + Math.max(-0.006, bob);
    const now = performance.now();
    if (now - runtime.lastStepAt > (speed > WORLD_CONFIG.moveSpeed ? 260 : 390)) {
      runtime.lastStepAt = now;
      onFootstep();
    }
  } else {
    if (runtime.grounded) {
      playActorAction(runtime.playerAnimator, "idle");
    }
    runtime.playerModel.position.y = playerFloorY + Math.sin(performance.now() * 0.0025) * 0.008;
  }

  updateJump(runtime, delta);
}

function updateJump(runtime: Runtime, delta: number) {
  if (!runtime.grounded || runtime.player.position.y > 0) {
    playActorAction(runtime.playerAnimator, "jump", 0.08);
    runtime.jumpVelocity -= WORLD_CONFIG.gravity * delta;
    runtime.player.position.y += runtime.jumpVelocity * delta;
    if (runtime.player.position.y <= 0) {
      runtime.player.position.y = 0;
      runtime.jumpVelocity = 0;
      runtime.grounded = true;
      playActorAction(
        runtime.playerAnimator,
        runtime.velocity.length() > 0.12 ? "walk" : "idle",
        0.12
      );
    }
  }
}

function collides(runtime: Runtime, x: number, z: number) {
  for (const obstacle of runtime.obstacles) {
    if (Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.radius + 0.42) {
      return true;
    }
  }
  return false;
}

function findNearestNpc(runtime: Runtime) {
  let nearest: { id: ArchetypeId; distance: number } | null = null;
  runtime.npcPositions.forEach((position, id) => {
    const distance = runtime.player.position.distanceTo(position);
    if (!nearest || distance < nearest.distance) {
      nearest = { id, distance };
    }
  });
  return nearest;
}

function findNearestInteraction(runtime: Runtime): InteractionTarget | null {
  let nearest: InteractionTarget | null = null;
  runtime.npcPositions.forEach((position, id) => {
    const distance = runtime.player.position.distanceTo(position);
    if (!nearest || distance < nearest.distance) {
      nearest = { kind: "npc", id, distance };
    }
  });
  runtime.humanPositions.forEach((position, id) => {
    const distance = runtime.player.position.distanceTo(position);
    if (!nearest || distance < nearest.distance) {
      nearest = { kind: "human", id, distance };
    }
  });
  runtime.objectPositions.forEach((position, id) => {
    const distance = runtime.player.position.distanceTo(position);
    if (!nearest || distance < nearest.distance) {
      nearest = { kind: "object", id, distance };
    }
  });
  return nearest;
}

function followPlayerCamera(runtime: Runtime, delta: number) {
  if (runtime.cameraReturnToDefault) {
    setDefaultCameraView(runtime);
    runtime.controls.enableRotate = true;
    return;
  }
  const desiredTarget = runtime.player.position.clone().add(new runtime.THREE.Vector3(0, 0.92, 0));
  const factor = Math.min(1, delta * 5.2);
  const previous = runtime.controls.target.clone();
  runtime.controls.target.lerp(desiredTarget, factor);
  const movement = runtime.controls.target.clone().sub(previous);
  runtime.camera.position.add(movement);
  runtime.controls.enableRotate = true;
}

function focusDialogueCamera(runtime: Runtime, npcId: ArchetypeId, delta: number) {
  const npcPosition = runtime.npcPositions.get(npcId);
  if (!npcPosition) {
    return;
  }
  const midpoint = runtime.player.position.clone().lerp(npcPosition, 0.5);
  midpoint.y = 1.35;
  const direction = runtime.player.position.clone().sub(npcPosition).setY(0).normalize();
  const side = new runtime.THREE.Vector3(-direction.z, 0, direction.x);
  const desiredPosition = midpoint.clone().add(side.multiplyScalar(3.3)).add(new runtime.THREE.Vector3(0, 2.25, 3.1));
  runtime.camera.position.lerp(desiredPosition, Math.min(1, delta * 3.8));
  runtime.controls.target.lerp(midpoint, Math.min(1, delta * 5));
  runtime.controls.enableRotate = false;
}

function focusHumanCamera(runtime: Runtime, humanId: HumanId, delta: number) {
  const humanPosition = runtime.humanPositions.get(humanId);
  if (!humanPosition) {
    return;
  }
  const midpoint = runtime.player.position.clone().lerp(humanPosition, 0.5);
  midpoint.y = 1.18;
  const direction = runtime.player.position.clone().sub(humanPosition).setY(0).normalize();
  const side = new runtime.THREE.Vector3(-direction.z, 0, direction.x);
  const desiredPosition = midpoint.clone().add(side.multiplyScalar(2.6)).add(new runtime.THREE.Vector3(0, 1.9, 2.6));
  runtime.camera.position.lerp(desiredPosition, Math.min(1, delta * 3.8));
  runtime.controls.target.lerp(midpoint, Math.min(1, delta * 5));
  runtime.controls.enableRotate = false;
}

function focusArtifactCamera(runtime: Runtime, objectId: AquariusObjectId, delta: number) {
  const objectPosition = runtime.objectPositions.get(objectId);
  if (!objectPosition) {
    return;
  }
  const midpoint = runtime.player.position.clone().lerp(objectPosition, 0.55);
  midpoint.y = 1.12;
  const direction = runtime.player.position.clone().sub(objectPosition).setY(0);
  if (direction.lengthSq() < 0.01) {
    direction.set(0, 0, 1);
  }
  direction.normalize();
  const side = new runtime.THREE.Vector3(-direction.z, 0, direction.x);
  const desiredPosition = midpoint
    .clone()
    .add(side.multiplyScalar(2.15))
    .add(new runtime.THREE.Vector3(0, 1.75, 2.2));
  runtime.camera.position.lerp(desiredPosition, Math.min(1, delta * 3.8));
  runtime.controls.target.lerp(midpoint, Math.min(1, delta * 5));
  runtime.controls.enableRotate = false;
}

function findNpcId(object: THREE.Object3D) {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (typeof current.userData.npcId === "string") {
      return current.userData.npcId;
    }
    current = current.parent;
  }
  return null;
}

function findHumanId(object: THREE.Object3D) {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (typeof current.userData.humanId === "string") {
      return current.userData.humanId;
    }
    current = current.parent;
  }
  return null;
}

function findObjectId(object: THREE.Object3D) {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (typeof current.userData.objectId === "string") {
      return current.userData.objectId;
    }
    current = current.parent;
  }
  return null;
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
