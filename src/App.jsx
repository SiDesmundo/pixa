import React, { useState, useEffect, useRef } from "react";

// ---------- BACKGROUND MUSIC ----------
// Auto-discovers every track dropped into src/assets/bgm/ at build time (Vite
// glob-imports the folder) - no code change needed to add more music, just
// drop a file in. Shuffles between them; a single track just repeats itself.
const BGM_MODULES = import.meta.glob("./assets/bgm/*.{mp3,ogg,wav}", { eager: true, query: "?url", import: "default" });
const BGM_TRACKS = Object.values(BGM_MODULES);

function pickRandomTrack(excludeIdx) {
  if (BGM_TRACKS.length === 0) return null;
  if (BGM_TRACKS.length === 1) return 0;
  let idx;
  do { idx = Math.floor(Math.random() * BGM_TRACKS.length); } while (idx === excludeIdx);
  return idx;
}

// ---------- CONSTANTS ----------
const TILE = 40;
const MAP_W = 30;
const MAP_H = 20;
const MOVE_SPEED = 4; // tiles per second
const NPC_RADIUS = 0.4; // half-width of an NPC's collision box, in tiles
const VIEW_TILES_W = 20;
const VIEW_TILES_H = 13;
const VIEW_W = VIEW_TILES_W * TILE; // 800 - viewport width in px
const VIEW_H = VIEW_TILES_H * TILE; // 520 - viewport height in px

// Map legend: 0 grass, 1 path, 2 water, 3 tree(solid), 4 flower, 5 fence(solid),
// 6 house wall(solid), 7 house door, 8 dock plank, 9 mine rock(solid),
// 10 mine entrance, 11 town-square stone, 12 well(solid), 13 interior wood floor
//
// Four quadrants: NW village (original, untouched interior) / NE town square,
// SW dock / SE mine - connected by corridor gaps cut through the shared
// border rows/columns. Verified reachable via a one-off flood-fill script
// before landing (every NPC tile + player start are in one connected region).
const MAP = [
  [3,3,3,3,0,0,0,0,0,0,0,0,3,3,3,3, 3,3,3,3,3,3,3,3,3,3,3,3,3,3],
  [3,0,0,0,0,4,0,0,0,0,4,0,0,0,0,3, 3,11,11,11,11,11,11,11,11,11,11,11,11,3],
  [3,0,6,6,7,6,0,0,6,6,7,6,0,0,0,3, 3,11,6,6,6,11,12,12,11,6,6,6,11,3],
  [3,0,6,0,0,6,0,0,6,0,0,6,0,4,0,3, 3,11,6,7,6,11,12,12,11,6,7,6,11,3],
  [0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0, 11,11,11,11,11,11,11,11,11,11,11,11,11,3],
  [0,4,1,0,0,0,0,0,0,0,0,0,1,0,4,0, 11,11,11,11,11,11,11,11,11,11,11,11,11,3],
  [0,0,1,1,1,1,0,0,1,1,1,1,1,0,0,0, 11,11,11,11,11,11,11,11,11,11,11,11,11,3],
  [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3, 3,11,11,11,11,11,11,11,11,11,11,11,11,3],
  [3,0,2,2,0,0,6,6,7,6,0,0,2,2,0,3, 3,11,11,11,11,11,11,11,11,11,11,11,11,3],
  [3,0,2,2,0,0,6,0,0,6,0,0,2,2,0,3, 3,11,11,11,11,11,11,11,11,11,11,11,11,3],
  [3,3,3,3,0,0,3,3,3,3,3,3,3,3,3,3, 3,3,3,3,11,11,11,11,3,3,3,3,3,3],
  [3,3,3,3,0,0,3,3,3,3,3,3,3,3,3,3, 3,3,3,3,11,11,11,11,3,3,3,3,3,3],
  [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3, 3,0,0,0,0,0,0,0,0,0,0,0,0,3],
  [3,0,0,2,2,2,2,2,2,2,2,2,0,0,0,3, 3,0,9,9,0,0,0,0,0,0,9,9,0,3],
  [3,0,0,2,2,2,2,2,2,2,2,2,0,0,0,3, 3,0,9,9,0,0,10,10,0,0,9,9,0,3],
  [3,0,0,2,2,2,2,2,2,2,2,2,0,0,8,8, 8,0,9,9,0,0,9,9,0,0,9,9,0,3],
  [3,0,0,2,2,2,2,2,2,2,2,2,0,0,8,8, 8,0,0,0,0,0,9,9,0,0,0,0,0,3],
  [3,0,0,2,2,2,2,2,2,2,2,2,0,0,0,3, 3,0,9,9,9,9,9,9,9,9,9,9,0,3],
  [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3, 3,0,0,0,0,0,0,0,0,0,0,0,0,3],
  [3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3, 3,3,3,3,3,3,3,3,3,3,3,3,3,3],
];
const SOLID = new Set([2, 3, 5, 6, 9, 12]);

// ---------- NPC MEMORY ENGINE ----------
// Each NPC has: opinion (numeric affinity), facts (structured memory of what player told them),
// flags (things player did that they witnessed/heard about), and a log of past exchanges.
const initialNPCs = {
  mira: {
    name: "Mira",
    role: "Herbalist",
    x: 4, y: 3,
    color: "#e0a458",
    sprite: "herbalist",
    opinion: 0,
    facts: {},       // e.g. { job: "fisherman", fear: "spiders" }
    flags: [],        // e.g. "helped_with_herbs", "was_rude_to_tomas"
    history: [],      // log of {day, summary}
    lastTopic: null,
  },
  tomas: {
    name: "Tomas",
    role: "Blacksmith",
    x: 9, y: 3,
    color: "#8a8a9a",
    sprite: "smith",
    opinion: 0,
    facts: {},
    flags: [],
    history: [],
    lastTopic: null,
  },
  rowan: {
    name: "Rowan",
    role: "Merchant",
    x: 3, y: 2,
    scene: "rowan_shop",
    color: "#c97b3d",
    sprite: "vendor",
    opinion: 0,
    facts: {},
    flags: [],
    history: [],
    lastTopic: null,
    talkative: true,
    isVendor: true,
  },
  chief: {
    name: "Mayor Elara",
    role: "Town Mayor",
    x: 4, y: 2,
    scene: "town_hall",
    color: "#6b4a7a",
    sprite: "mayor",
    opinion: 0,
    facts: {},
    flags: [],
    history: [],
    lastTopic: null,
    talkative: true,
  },
  finn: {
    name: "Finn",
    role: "Fisherman",
    x: 14, y: 15,
    color: "#4a7a8c",
    sprite: "fisherman",
    opinion: 0,
    facts: {},
    flags: [],
    history: [],
    lastTopic: null,
    talkative: true,
  },
  grett: {
    name: "Grett",
    role: "Miner",
    x: 20, y: 14,
    color: "#7a6a5a",
    sprite: "miner",
    opinion: 0,
    facts: {},
    flags: [],
    history: [],
    lastTopic: null,
    talkative: true,
  },
  bramwell: {
    name: "Bramwell",
    role: "Old Villager",
    x: 24, y: 2,
    color: "#6a6258",
    sprite: "quiet",
    opinion: 0,
    facts: {},
    flags: [],
    history: [],
    lastTopic: null,
    talkative: false,
  },
  watcher: {
    name: "The Watcher",
    role: "???",
    x: 19, y: 16,
    color: "#3a3038",
    sprite: "quiet",
    opinion: 0,
    facts: {},
    flags: [],
    history: [],
    lastTopic: null,
    talkative: false,
  },
};

// Dialogue tree: functions receive (npc, allNpcs, day) and return { text, choices }
// choices: [{ label, apply(npc, allNpcs) => mutates and returns summary string }]

// Per-NPC first-meeting lines so 7 different characters don't all say the
// literal same paragraph on first contact. Kept local/instant (no AI call)
// so opening a conversation never has to wait on a network round trip.
const FIRST_MEETING_LINES = {
  mira: (n) => `${n.name} glances up from her herbs, a little wary. "Oh — hello. I don't think we've met properly."`,
  tomas: (n) => `${n.name} looks up from the anvil, wiping his hands on his apron. "Don't believe I've seen you before. Something you need?"`,
  rowan: (n) => `${n.name}'s whole face brightens at the sight of a new customer. "Well now! Don't believe we've met - the name's Rowan."`,
  finn: (n) => `${n.name} glances over from his line without much urgency. "Huh. New face. Don't get many of those out here."`,
  grett: (n) => `${n.name} straightens up from his pickaxe, squinting at you. "Don't recognize you. Lost, or lookin' for work?"`,
  chief: (n) => `${n.name} looks up from a stack of papers, polite but measured. "I don't believe we've been introduced. What can I do for you?"`,
};

function greet(npc, npcId) {
  if (npc.opinion >= 6) return `${npc.name} lights up when they see you. "There you are! I was hoping you'd stop by."`;
  if (npc.opinion >= 3) return `${npc.name} smiles. "Good to see you again."`;
  if (npc.opinion <= -4) return `${npc.name} barely looks up. "...oh. It's you."`;
  if (npc.opinion <= -1) return `${npc.name} gives a cool nod. "Hm."`;
  if (npc.history.length === 0) {
    const line = FIRST_MEETING_LINES[npcId];
    return line ? line(npc) : `${npc.name} glances over, a little unsure. "Oh — hello. I don't think we've met properly."`;
  }
  return `${npc.name} nods. "Hey."`;
}

function buildDialogue(npcId, npc, allNpcs, day) {
  const opts = [];

  // Reference remembered facts
  if (npc.facts.job) {
    opts.push({
      key: "recall_job",
      label: `Ask about their work as a ${npc.facts.job}`,
      npcLine: `"Still ${npc.facts.job === "fisherman" ? "out on the water most mornings" : "at it every day"}. Thanks for remembering, actually."`,
      apply: (n) => { n.opinion += 1; return `You asked ${n.name} about being a ${npc.facts.job} — they appreciated you remembering.`; }
    });
  } else {
    opts.push({
      key: "ask_job",
      label: "Ask what they do for work",
      npcLine: npcId === "mira" ? `"I gather herbs up past the tree line, mostly. Keeps me busy."` : `"Blacksmith. Been shoeing horses and mending fences here twenty years."`,
      apply: (n) => { n.facts.job = npcId === "mira" ? "herbalist" : "blacksmith"; n.opinion += 1; return `${n.name} told you about their work.`; }
    });
  }

  if (!npc.facts.fear) {
    opts.push({
      key: "ask_fear",
      label: "Ask if anything scares them",
      npcLine: npcId === "mira" ? `"...deep water. Don't like not seeing the bottom." She looks a little embarrassed to admit it.` : `"Losing the forge. Fire's fickle — one bad night and it's all gone." He says it flatly, like he's thought about it a lot.`,
      apply: (n) => { n.facts.fear = npcId === "mira" ? "deep water" : "losing the forge"; n.opinion += 2; return `${n.name} confided a fear in you.`; }
    });
  } else {
    opts.push({
      key: "recall_fear",
      label: `Bring up their fear of ${npc.facts.fear}`,
      npcLine: npc.opinion >= 2
        ? `"...you remembered that." A pause. "Not many people hold onto things like that."`
        : `They stiffen slightly. "I'd rather not talk about that again."`,
      apply: (n) => {
        if (n.opinion >= 2) { n.opinion += 2; return `You brought up ${n.name}'s fear gently — it clearly meant something.`; }
        n.opinion -= 1; return `You brought up ${n.name}'s fear again and it felt intrusive.`;
      }
    });
  }

  // Cross-NPC gossip / relationship awareness
  const other = npcId === "mira" ? allNpcs.tomas : allNpcs.mira;
  if (other.flags.includes("insulted_by_player")) {
    opts.push({
      key: "confront_gossip",
      label: `Mention you heard ${other.name} was upset with you`,
      npcLine: `${npc.name} crosses their arms. "Word travels fast here. What did you say to them?"`,
      apply: (n) => { n.opinion -= 1; return `${n.name} already knew you'd upset ${other.name}.`; }
    });
  }

  opts.push({
    key: "compliment",
    label: "Compliment them",
    npcLine: npc.opinion >= 3 ? `They laugh, a little flustered. "Careful — I'll start expecting that."` : `A small, genuine smile. "That's kind of you to say."`,
    apply: (n) => { n.opinion += 1; return `You complimented ${n.name}.`; }
  });

  opts.push({
    key: "insult",
    label: "Make a cutting remark",
    npcLine: `${npc.name}'s expression closes off immediately. "...Right. Good talk."`,
    apply: (n) => { n.opinion -= 3; if (!n.flags.includes("insulted_by_player")) n.flags.push("insulted_by_player"); return `You insulted ${n.name}. They won't forget it quickly.`; }
  });

  opts.push({ key: "leave", label: "Step away", npcLine: null, apply: () => null });

  return opts;
}

// ---------- AI-GENERATED DIALOGUE CHOICES ----------
// Calls the local dev-server plugin (server/npcAiPlugin.js), which forwards to
// Claude with the NPC's memory as context and forces a structured tool-call
// response. Throws on any failure - callers should use getDialogueChoices()
// below, which falls back to the static buildDialogue() tree.
async function requestAiChoices(npcId, npc, allNpcs, day, signal) {
  const others = Object.entries(allNpcs)
    .filter(([id]) => id !== npcId)
    .map(([, n]) => ({ name: n.name, flags: n.flags, facts: n.facts }));

  const res = await fetch("/api/npc-turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      npcId,
      npc: { name: npc.name, role: npc.role, opinion: npc.opinion, facts: npc.facts, flags: npc.flags, history: npc.history },
      others,
      day,
    }),
    signal,
  });
  if (!res.ok) throw new Error(`npc-turn request failed: ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.choices) || data.choices.length === 0) throw new Error("malformed AI response");

  return data.choices.map((c, i) => ({
    key: `ai_${i}`,
    label: c.label,
    npcLine: c.npcLine,
    apply: (n) => {
      n.opinion += Number(c.opinionDelta) || 0;
      if (c.newFact && c.newFact.key) n.facts[c.newFact.key] = c.newFact.value;
      if (c.newFlag && !n.flags.includes(c.newFlag)) n.flags.push(c.newFlag);
      return c.summary || `${n.name} responded to you.`;
    },
  }));
}

// Guaranteed rather than left to the model's discretion - same reliability
// pattern as the static "Step away" option - so a true first meeting always
// has a natural opening move on the very first render, no generation needed.
function introduceYourselfChoice(npc) {
  return {
    key: "introduce",
    label: "Introduce yourself",
    npcLine: `${npc.name} gives a small, polite nod. "Good to meet you too."`,
    apply: (n) => { n.opinion += 1; return `You introduced yourself to ${n.name}.`; },
  };
}

// Guaranteed for any vendor, on every visit - commerce is a mechanical action,
// not something worth leaving to the model's discretion or generation delay.
function browseGoodsChoice() {
  return { key: "shop", label: "Browse goods for sale", npcLine: null, apply: () => null };
}

// Never throws: tries the AI first, falls back to the static dialogue tree on
// any failure (no API key configured, network error, timeout, bad response).
async function getDialogueChoices(npcId, npc, allNpcs, day, onOffline) {
  const isFirstMeeting = npc.history.length === 0;
  const controller = new AbortController();
  // Generous timeout: local Ollama models can take 10-30s+ depending on model
  // size and hardware, well beyond what a cloud API like Anthropic needs.
  const timeout = setTimeout(() => controller.abort(), 45000);
  let choices;
  try {
    const aiChoices = await requestAiChoices(npcId, npc, allNpcs, day, controller.signal);
    choices = isFirstMeeting ? [introduceYourselfChoice(npc), ...aiChoices] : aiChoices;
  } catch (err) {
    console.warn("AI dialogue unavailable, falling back to offline choices:", err);
    onOffline?.();
    choices = buildDialogue(npcId, npc, allNpcs, day);
  } finally {
    clearTimeout(timeout);
  }
  return npc.isVendor ? [browseGoodsChoice(), ...choices] : choices;
}

// ---------- PIXEL SPRITES (inline SVG, drawn as simple pixel-art blocks) ----------
function PlayerSprite({ dir }) {
  return (
    <svg width={TILE} height={TILE} viewBox="0 0 16 16" shapeRendering="crispEdges">
      <rect x="5" y="2" width="6" height="5" fill="#f2c9a1" />
      <rect x="5" y="1" width="6" height="2" fill="#4a2f1c" />
      <rect x="4" y="7" width="8" height="6" fill="#3a6ea5" />
      <rect x="4" y="13" width="3" height="2" fill="#2b2b2b" />
      <rect x="9" y="13" width="3" height="2" fill="#2b2b2b" />
      {dir === "left" && <rect x="3" y="8" width="2" height="4" fill="#f2c9a1" />}
      {dir === "right" && <rect x="11" y="8" width="2" height="4" fill="#f2c9a1" />}
    </svg>
  );
}

function NPCSprite({ color, sprite }) {
  const hairColor = sprite === "smith" ? "#3d2b1f" : sprite === "quiet" ? color : "#7a4a2f";
  return (
    <svg width={TILE} height={TILE} viewBox="0 0 16 16" shapeRendering="crispEdges">
      <rect x="5" y="2" width="6" height="5" fill="#e8b98a" />
      <rect x="5" y="1" width="6" height="2" fill={hairColor} />
      <rect x="4" y="7" width="8" height="6" fill={color} />
      <rect x="4" y="13" width="3" height="2" fill="#2b2b2b" />
      <rect x="9" y="13" width="3" height="2" fill="#2b2b2b" />
      {sprite === "smith" && <rect x="2" y="8" width="2" height="3" fill="#888" />}
      {sprite === "vendor" && <rect x="4" y="9" width="8" height="4" fill="#e8dcc8" />}
      {sprite === "fisherman" && <rect x="3" y="0" width="10" height="2" fill="#2f5a52" />}
      {sprite === "miner" && (
        <>
          <rect x="4" y="0" width="8" height="3" fill="#5a5a5a" />
          <rect x="7" y="0" width="2" height="1" fill="#f4d35e" />
        </>
      )}
      {sprite === "quiet" && <rect x="4" y="0" width="8" height="3" fill={color} />}
      {sprite === "mayor" && <rect x="4" y="7" width="8" height="2" fill="#f4d35e" />}
    </svg>
  );
}

function SignSprite() {
  return (
    <svg width={TILE} height={TILE} viewBox="0 0 16 16" shapeRendering="crispEdges">
      <rect x="7" y="6" width="2" height="9" fill="#5a4632" />
      <rect x="2" y="2" width="12" height="6" fill="#8b6f47" />
      <rect x="2" y="2" width="12" height="6" fill="none" stroke="#4a3a28" strokeWidth="1" />
      <rect x="4" y="4" width="8" height="1" fill="#e8dcc8" />
      <rect x="4" y="6" width="5" height="1" fill="#e8dcc8" />
    </svg>
  );
}

function tileColor(v) {
  switch (v) {
    case 0: return "#5a9c4a";
    case 1: return "#c9a876";
    case 2: return "#3f7fb0";
    case 3: return "#2d5a2d";
    case 4: return "#e0669a";
    case 5: return "#8b6f47";
    case 6: return "#9c8365";
    case 7: return "#6b4a2f";
    case 8: return "#a97c50";
    case 9: return "#4a4a52";
    case 10: return "#1a1a1f";
    case 11: return "#8a8a86";
    case 12: return "#5c6670";
    case 13: return "#7a5a3a";
    default: return "#5a9c4a";
  }
}

// ---------- INVENTORY / SHOP ----------
// First pass: ownership only, no eating/consuming mechanic yet.
const ITEMS = [
  { id: "bread", name: "Loaf of bread", price: 3 },
  { id: "apple", name: "Apple", price: 2 },
  { id: "cheese", name: "Wedge of cheese", price: 4 },
  { id: "dried_fish", name: "Dried fish", price: 5 },
];

function quietStareLine(npc) {
  return `${npc.name} stares at you... unblinking.`;
}

// ---------- SIGNS ----------
// Static, read-only world text - no memory, no AI, no choices. Separate from
// the NPC conversation system entirely since the data shape doesn't match
// (no name/role/opinion), rather than force-fitting it into that panel.
const SIGNS = [
  { id: "mine_warning", x: 20, y: 13, text: "WARNING: The old mine has partially collapsed. Enter at your own risk." },
  { id: "square_welcome", x: 18, y: 4, text: "Welcome to Meadowbrook Town Square." },
  { id: "dock_notice", x: 5, y: 12, text: "Please don't feed the gulls.\n- Finn" },
];

// ---------- INTERIORS ----------
// Small standalone rooms, entered via a real scene transition rather than
// baked into the world map. Reuse the same tile legend as the world (6 wall,
// 7 door) plus one interior-only tile (13, wood floor) so canMove/SOLID need
// no special-casing - just point them at whichever map is "current".
const INTERIORS = {
  rowan_shop: {
    name: "Rowan's Shop",
    map: [
      [6,6,6,6,6,6,6],
      [6,13,13,13,13,13,6],
      [6,13,13,13,13,13,6],
      [6,13,13,13,13,13,6],
      [6,13,13,13,13,13,6],
      [6,6,6,7,6,6,6],
    ],
    entry: { x: 3.5, y: 4 },
    exitTile: { x: 3, y: 5 },
  },
  town_hall: {
    name: "Town Hall",
    map: [
      [6,6,6,6,6,6,6,6],
      [6,13,13,13,13,13,13,6],
      [6,13,13,13,13,13,13,6],
      [6,13,13,13,13,13,13,6],
      [6,13,13,13,13,13,13,6],
      [6,6,6,6,7,6,6,6],
    ],
    entry: { x: 4.5, y: 4 },
    exitTile: { x: 4, y: 5 },
  },
};

// World door-tile coordinates ("x,y") that lead into an interior.
const WORLD_ENTRANCES = {
  "19,3": "rowan_shop",
  "26,3": "town_hall",
};

// ---------- MAIN APP ----------
export default function App() {
  const [player, setPlayer] = useState({ x: 7.5, y: 6, dir: "down" });
  const keysRef = useRef({});
  const [npcs, setNpcs] = useState(initialNPCs);
  const npcsRef = useRef(npcs);
  useEffect(() => { npcsRef.current = npcs; }, [npcs]);
  const [activeConvo, setActiveConvo] = useState(null); // npcId
  const activeConvoRef = useRef(activeConvo);
  useEffect(() => { activeConvoRef.current = activeConvo; }, [activeConvo]);
  const [activeSign, setActiveSign] = useState(null); // the sign object being read, or null
  const activeSignRef = useRef(null);
  useEffect(() => { activeSignRef.current = activeSign; }, [activeSign]);
  const [scene, setScene] = useState("world");
  const sceneRef = useRef("world");
  useEffect(() => { sceneRef.current = scene; }, [scene]);
  const returnPosRef = useRef(null); // world {x,y} to restore on exiting an interior
  const [dialogueLine, setDialogueLine] = useState(null);
  const [choices, setChoices] = useState([]);
  const [toast, setToast] = useState(null);
  const [day, setDay] = useState(1);
  const dayRef = useRef(day);
  useEffect(() => { dayRef.current = day; }, [day]);
  const [showJournal, setShowJournal] = useState(false);
  const loopRef = useRef();
  const lastTimeRef = useRef(null);
  const nearbyRef = useRef(null);
  const audioRef = useRef(null);
  const musicStartedRef = useRef(false);
  const currentTrackRef = useRef(null);
  const [muted, setMuted] = useState(false);
  useEffect(() => { if (audioRef.current) audioRef.current.muted = muted; }, [muted]);
  useEffect(() => { if (audioRef.current) audioRef.current.volume = 0.2; }, []);
  const [eDebug, setEDebug] = useState({ count: 0, flash: false });
  const eFlashTimeoutRef = useRef(null);
  const [dialogueLoading, setDialogueLoading] = useState(false);
  const requestIdRef = useRef(0);
  const offlineNoticeShownRef = useRef(false);
  const [coins, setCoins] = useState(15);
  const [inventory, setInventory] = useState({});
  const [shopOpen, setShopOpen] = useState(false);
  const shopOpenRef = useRef(false);
  useEffect(() => { shopOpenRef.current = shopOpen; }, [shopOpen]);
  const [showInventory, setShowInventory] = useState(false);
  const showInventoryRef = useRef(false);
  useEffect(() => { showInventoryRef.current = showInventory; }, [showInventory]);
  const showJournalRef = useRef(false);
  useEffect(() => { showJournalRef.current = showJournal; }, [showJournal]);
  const choicesRef = useRef([]);
  useEffect(() => { choicesRef.current = choices; }, [choices]);

  // Purely functional-update based (never reads `coins`/`inventory` from an
  // outer closure) so it's safe to call from the stable key-listener effect
  // below even though `buyItem` itself is redefined every render.
  function buyItem(item) {
    setCoins((c) => {
      if (c < item.price) {
        setToast("Not enough coins.");
        setTimeout(() => setToast(null), 2000);
        return c;
      }
      setInventory((prev) => ({ ...prev, [item.id]: (prev[item.id] || 0) + 1 }));
      setToast(`You bought ${item.name.toLowerCase()}.`);
      setTimeout(() => setToast(null), 2200);
      return c - item.price;
    });
  }

  function showOfflineNoticeOnce() {
    if (offlineNoticeShownRef.current) return;
    offlineNoticeShownRef.current = true;
    setToast("AI dialogue unavailable — using offline responses.");
    setTimeout(() => setToast(null), 3200);
  }

  // Movement + interaction key listener (mounted once; reads live state via refs
  // so it never has to be torn down/re-attached while the render loop is running)
  useEffect(() => {
    function onDown(e) {
      const key = e.key.toLowerCase();
      keysRef.current[key] = true;

      // Browsers block autoplay-with-sound until a user gesture - the first
      // keypress of any kind counts, so kick off music here rather than on load.
      if (!musicStartedRef.current) {
        musicStartedRef.current = true;
        const idx = pickRandomTrack(null);
        if (idx != null && audioRef.current) {
          currentTrackRef.current = idx;
          audioRef.current.src = BGM_TRACKS[idx];
          audioRef.current.play().catch(() => {});
        }
      }

      // Journal/Inventory hotkeys - available from anywhere, no mouse needed.
      if (key === "j") { setShowJournal((v) => !v); return; }
      if (key === "i") { setShowInventory((v) => !v); return; }
      if (key === "m") { setMuted((v) => !v); return; }

      if (key === "e") {
        setEDebug((d) => ({ count: d.count + 1, flash: true }));
        clearTimeout(eFlashTimeoutRef.current);
        eFlashTimeoutRef.current = setTimeout(() => setEDebug((d) => ({ ...d, flash: false })), 400);
        if (!activeConvoRef.current && !activeSignRef.current && nearbyRef.current) {
          const id = nearbyRef.current;
          const npc = npcsRef.current[id];
          setActiveConvo(id);
          if (npc.talkative === false) {
            // Quiet NPCs skip the AI pipeline entirely - instant canned line,
            // no network request, no loading state. Only "Step away" applies.
            setDialogueLine(quietStareLine(npc));
            setChoices([]);
            return;
          }
          setDialogueLine(greet(npc, id));
          setChoices([]);
          setDialogueLoading(true);
          const myReq = ++requestIdRef.current;
          getDialogueChoices(id, npc, npcsRef.current, dayRef.current, showOfflineNoticeOnce).then((result) => {
            if (requestIdRef.current !== myReq) return;
            setChoices(result);
            setDialogueLoading(false);
          });
        } else if (!activeConvoRef.current && !activeSignRef.current && nearbySignRef.current) {
          // Signs are static read-only text - no memory, no AI, no choices.
          setActiveSign(nearbySignRef.current);
        }
      } else if (/^[1-9]$/.test(key) && activeConvoRef.current) {
        // Keyboard-only choice selection, matching the numbers shown next to
        // each button. Shop mode maps digits to the item catalog instead.
        const idx = Number(key) - 1;
        if (shopOpenRef.current) {
          if (ITEMS[idx]) buyItem(ITEMS[idx]);
        } else {
          const visible = choicesRef.current.filter((c) => c.key !== "leave");
          if (visible[idx]) pickChoiceRef.current(visible[idx]);
        }
      } else if (e.key === "Escape") {
        // Back out one level at a time: journal/inventory modal, then shop,
        // then the conversation itself - never jumps straight past a layer.
        if (showJournalRef.current) { setShowJournal(false); return; }
        if (showInventoryRef.current) { setShowInventory(false); return; }
        if (activeSignRef.current) { setActiveSign(null); return; }
        if (shopOpenRef.current) { setShopOpen(false); return; }
        if (activeConvoRef.current) {
          requestIdRef.current++; // invalidate any in-flight dialogue request
          setActiveConvo(null);
          setDialogueLine(null);
          setChoices([]);
          setDialogueLoading(false);
        }
      }
    }
    function onUp(e) { keysRef.current[e.key.toLowerCase()] = false; }
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, []);

  useEffect(() => {
    function step(t) {
      if (lastTimeRef.current == null) lastTimeRef.current = t;
      const dt = Math.min((t - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = t;

      if (!activeConvo && !activeSign && !showJournal && !showInventory) {
        setPlayer((p) => {
          let { x, y, dir } = p;
          const k = keysRef.current;
          let dx = 0, dy = 0;
          if (k["arrowup"] || k["w"]) { dy -= 1; dir = "up"; }
          if (k["arrowdown"] || k["s"]) { dy += 1; dir = "down"; }
          if (k["arrowleft"] || k["a"]) { dx -= 1; dir = "left"; }
          if (k["arrowright"] || k["d"]) { dx += 1; dir = "right"; }
          if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }
          const nx = x + dx * MOVE_SPEED * dt;
          const ny = y + dy * MOVE_SPEED * dt;
          const map = scene === "world" ? MAP : INTERIORS[scene].map;
          const mapW = map[0].length, mapH = map.length;
          const canMove = (tx, ty) => {
            const gx = Math.floor(tx), gy = Math.floor(ty);
            if (gx < 0 || gy < 0 || gx >= mapW || gy >= mapH) return false;
            if (SOLID.has(map[gy][gx])) return false;
            for (const npc of Object.values(npcsRef.current)) {
              if ((npc.scene || "world") !== scene) continue;
              const cx = npc.x + 0.5, cy = npc.y + 0.5;
              if (Math.abs(tx - cx) < NPC_RADIUS && Math.abs(ty - cy) < NPC_RADIUS) return false;
            }
            return true;
          };
          let fx = x, fy = y;
          if (canMove(nx, y + 0.3) && canMove(nx, y - 0.3)) fx = nx;
          if (canMove(fx, ny + 0.3) && canMove(fx, ny - 0.3)) fy = ny;
          return { x: fx, y: fy, dir };
        });
      }
      loopRef.current = requestAnimationFrame(step);
    }
    loopRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(loopRef.current);
  }, [activeConvo, activeSign, showJournal, showInventory, scene]);

  // Check proximity to NPCs for interaction prompt. Runs on a stable interval
  // (mounted once) reading live player/npc positions via refs, so it isn't torn
  // down and restarted every animation frame the way a `[player, npcs]`-keyed
  // effect would be.
  const playerRef = useRef(player);
  useEffect(() => { playerRef.current = player; }, [player]);

  const [nearby, setNearby] = useState(null);
  const [nearbySign, setNearbySign] = useState(null);
  const nearbySignRef = useRef(null);
  useEffect(() => {
    const id = setInterval(() => {
      const curScene = sceneRef.current;

      let found = null;
      for (const [npcId, npc] of Object.entries(npcsRef.current)) {
        if ((npc.scene || "world") !== curScene) continue;
        const dist = Math.hypot(playerRef.current.x - (npc.x + 0.5), playerRef.current.y - (npc.y + 0.5));
        if (dist < 1.1) { found = npcId; break; }
      }
      nearbyRef.current = found;
      setNearby(found);

      // Signs are world-only.
      let foundSign = null;
      if (curScene === "world") {
        for (const sign of SIGNS) {
          const dist = Math.hypot(playerRef.current.x - (sign.x + 0.5), playerRef.current.y - (sign.y + 0.5));
          if (dist < 1.1) { foundSign = sign; break; }
        }
      }
      nearbySignRef.current = foundSign;
      setNearbySign(foundSign);

      // Scene transitions: walking onto a world door enters its interior;
      // walking onto an interior's exit tile returns to the saved world spot.
      const px = Math.floor(playerRef.current.x), py = Math.floor(playerRef.current.y);
      if (curScene === "world") {
        const targetId = WORLD_ENTRANCES[`${px},${py}`];
        if (targetId) {
          returnPosRef.current = { x: playerRef.current.x, y: playerRef.current.y + 1 };
          setScene(targetId);
          setPlayer({ x: INTERIORS[targetId].entry.x, y: INTERIORS[targetId].entry.y, dir: "up" });
          setToast(`Entered ${INTERIORS[targetId].name}.`);
          setTimeout(() => setToast(null), 2200);
        }
      } else {
        const exit = INTERIORS[curScene].exitTile;
        if (px === exit.x && py === exit.y) {
          const back = returnPosRef.current || { x: 3.5, y: 3 };
          setScene("world");
          setPlayer({ x: back.x, y: back.y, dir: "down" });
        }
      }
    }, 100);
    return () => clearInterval(id);
  }, []);

  function pickChoice(choice) {
    if (choice.key === "leave") {
      requestIdRef.current++; // invalidate any in-flight dialogue request
      setActiveConvo(null);
      setDialogueLine(null);
      setChoices([]);
      setDialogueLoading(false);
      setShopOpen(false);
      return;
    }
    if (choice.key === "shop") {
      setShopOpen(true); // pure UI mode switch - no memory mutation, no network call
      return;
    }
    setNpcs((prev) => {
      const updated = { ...prev };
      const npcCopy = { ...updated[activeConvo], facts: { ...updated[activeConvo].facts }, flags: [...updated[activeConvo].flags], history: [...updated[activeConvo].history] };
      const summary = choice.apply(npcCopy, updated);
      if (summary) {
        npcCopy.history.push({ day, summary });
        setToast(summary);
        setTimeout(() => setToast(null), 2800);
      }
      updated[activeConvo] = npcCopy;
      return updated;
    });
    setDialogueLine(choice.npcLine);
    setChoices([]);
    setDialogueLoading(true);
    const myReq = ++requestIdRef.current;
    setTimeout(() => {
      setNpcs((prev) => {
        getDialogueChoices(activeConvo, prev[activeConvo], prev, day, showOfflineNoticeOnce).then((result) => {
          if (requestIdRef.current !== myReq) return;
          setChoices(result);
          setDialogueLoading(false);
        });
        return prev;
      });
    }, 50);
  }

  // "Latest ref" pattern: pickChoice is redefined every render (it closes
  // over activeConvo/day/etc), but the stable key-listener effect below is
  // mounted once and needs to call whatever the CURRENT pickChoice is -
  // calling a stale captured reference would use stale activeConvo/day forever.
  const pickChoiceRef = useRef(pickChoice);
  useEffect(() => { pickChoiceRef.current = pickChoice; });

  function opinionLabel(v) {
    if (v >= 8) return { text: "Devoted", color: "#e0669a" };
    if (v >= 4) return { text: "Fond", color: "#7fc97f" };
    if (v >= 1) return { text: "Friendly", color: "#a8d8a8" };
    if (v >= -2) return { text: "Neutral", color: "#c9c9c9" };
    if (v >= -5) return { text: "Wary", color: "#e0a458" };
    return { text: "Resentful", color: "#c0504d" };
  }

  const currentInterior = scene !== "world" ? INTERIORS[scene] : null;
  const curMap = currentInterior ? currentInterior.map : MAP;
  const curMapW = currentInterior ? currentInterior.map[0].length : MAP_W;
  const curMapH = currentInterior ? currentInterior.map.length : MAP_H;

  // A map smaller than the viewport (any interior) gets centered instead of
  // clamped to 0,0 - the plain clamp formula always bottoms out at the
  // top-left corner when mapPixelDim - VIEW_DIM is negative.
  function computeCam(mapPixelDim, viewDim, playerPx) {
    if (mapPixelDim <= viewDim) return -(viewDim - mapPixelDim) / 2;
    return Math.max(0, Math.min(mapPixelDim - viewDim, playerPx - viewDim / 2));
  }
  const camX = computeCam(curMapW * TILE, VIEW_W, player.x * TILE);
  const camY = computeCam(curMapH * TILE, VIEW_H, player.y * TILE);

  return (
    <div style={{
      fontFamily: "'Courier New', monospace",
      background: "#1a1410",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "16px",
      color: "#e8dcc8",
    }}>
      <style>{`
        @keyframes pop { 0% { transform: scale(0.9); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes slideUp { 0% { transform: translateY(10px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
        * { box-sizing: border-box; }
        button { font-family: inherit; cursor: pointer; }
      `}</style>

      {/* Debug badge: confirms the E-key listener fires and shows live proximity state */}
      <div style={{
        position: "fixed", top: 8, right: 8, padding: "6px 10px", borderRadius: 4, fontSize: 11,
        fontFamily: "monospace", zIndex: 20, border: "1px solid #4a3a28",
        background: eDebug.flash ? "#2f6d2f" : "rgba(20,16,10,0.85)",
        color: eDebug.flash ? "#d8f0d8" : "#8a7a63",
        transition: "background 0.15s, color 0.15s",
      }}>
        E presses: {eDebug.count} · nearby: {nearby ?? "none"}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", width: VIEW_W, marginBottom: 10, alignItems: "center" }}>
        <div style={{ fontSize: 18, letterSpacing: 1, color: "#c9a876" }}>
          ◆ {currentInterior ? currentInterior.name.toUpperCase() : "MEADOWBROOK"} ◆ Day {day}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ fontSize: 15, color: "#f4d35e" }}>{coins}c</div>
          <button
            onClick={() => setShowInventory(true)}
            style={{ background: "#2d2418", border: "1px solid #4a3a28", color: "#e8dcc8", padding: "6px 14px", fontSize: 14, borderRadius: 3 }}
          >
            Inventory <span style={{ color: "#8a7a63" }}>(I)</span>
          </button>
          <button
            onClick={() => setShowJournal(true)}
            style={{ background: "#2d2418", border: "1px solid #4a3a28", color: "#e8dcc8", padding: "6px 14px", fontSize: 14, borderRadius: 3 }}
          >
            Journal <span style={{ color: "#8a7a63" }}>(J)</span>
          </button>
          <button
            onClick={() => setMuted((v) => !v)}
            style={{ background: "#2d2418", border: "1px solid #4a3a28", color: "#e8dcc8", padding: "6px 14px", fontSize: 14, borderRadius: 3 }}
          >
            {muted ? "Unmute" : "Mute"} <span style={{ color: "#8a7a63" }}>(M)</span>
          </button>
        </div>
      </div>

      <audio
        ref={audioRef}
        onEnded={() => {
          const idx = pickRandomTrack(currentTrackRef.current);
          if (idx != null && audioRef.current) {
            currentTrackRef.current = idx;
            audioRef.current.src = BGM_TRACKS[idx];
            audioRef.current.play().catch(() => {});
          }
        }}
      />

      <div style={{
        width: VIEW_W, height: VIEW_H, position: "relative", overflow: "hidden",
        border: "3px solid #4a3a28", borderRadius: 4, imageRendering: "pixelated",
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      }}>
        <div style={{
          position: "absolute", left: -camX, top: -camY,
          width: curMapW * TILE, height: curMapH * TILE,
        }}>
          {/* Map tiles */}
          {curMap.map((row, gy) => row.map((v, gx) => (
            <div key={`${gx}-${gy}`} style={{
              position: "absolute", left: gx * TILE, top: gy * TILE, width: TILE, height: TILE,
              background: tileColor(v),
              borderRight: v === 2 ? "none" : "1px solid rgba(0,0,0,0.04)",
            }}>
              {v === 7 && <div style={{ position: "absolute", inset: 4, background: "#3d2b1f", borderRadius: "2px 2px 0 0" }} />}
              {v === 3 && <div style={{ position: "absolute", top: -6, left: 2, width: TILE - 4, height: TILE - 4, background: "#1f4020", borderRadius: "50%" }} />}
            </div>
          )))}

          {/* Signs - world-only */}
          {scene === "world" && SIGNS.map((sign) => (
            <div key={sign.id} style={{ position: "absolute", left: sign.x * TILE, top: sign.y * TILE }}>
              <SignSprite />
              {nearbySign?.id === sign.id && !activeConvo && !activeSign && (
                <div style={{
                  position: "absolute", top: -16, left: 10, fontSize: 14, animation: "pop 0.3s",
                  color: "#f4d35e", textShadow: "0 0 3px #000",
                }}>!</div>
              )}
            </div>
          ))}

          {/* NPCs - only the ones that live in the current scene */}
          {Object.entries(npcs).filter(([, npc]) => (npc.scene || "world") === scene).map(([id, npc]) => (
            <div key={id} style={{ position: "absolute", left: npc.x * TILE, top: npc.y * TILE, transition: "none" }}>
              <NPCSprite color={npc.color} sprite={npc.sprite} />
              {nearby === id && !activeConvo && !activeSign && (
                <div style={{
                  position: "absolute", top: -16, left: 10, fontSize: 14, animation: "pop 0.3s",
                  color: "#f4d35e", textShadow: "0 0 3px #000",
                }}>!</div>
              )}
            </div>
          ))}

          {/* Player */}
          <div style={{ position: "absolute", left: player.x * TILE - TILE / 2, top: player.y * TILE - TILE / 2 }}>
            <PlayerSprite dir={player.dir} />
          </div>
        </div>

        {/* Interaction prompt */}
        {nearby && !activeConvo && !activeSign && (
          <div style={{
            position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
            background: "rgba(20,16,10,0.9)", padding: "5px 12px", borderRadius: 4, fontSize: 12,
            border: "1px solid #4a3a28", animation: "slideUp 0.2s",
          }}>
            Press <b>E</b> to talk to {npcs[nearby].name}
          </div>
        )}
        {!nearby && nearbySign && !activeConvo && !activeSign && (
          <div style={{
            position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
            background: "rgba(20,16,10,0.9)", padding: "5px 12px", borderRadius: 4, fontSize: 12,
            border: "1px solid #4a3a28", animation: "slideUp 0.2s",
          }}>
            Press <b>E</b> to read the sign
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div style={{
            position: "absolute", top: 8, left: 8, right: 8, background: "rgba(20,16,10,0.92)",
            padding: "6px 10px", borderRadius: 4, fontSize: 11, color: "#a8d8a8",
            border: "1px solid #3a4a2a", animation: "slideUp 0.2s",
          }}>
            📝 {toast}
          </div>
        )}
      </div>

      {/* Controls hint */}
      <div style={{ marginTop: 8, fontSize: 13, color: "#8a7a63" }}>
        WASD / arrows to move · E to interact · number keys to pick a reply · Escape to back out · J journal · I inventory · M mute
      </div>

      {/* Sign reading panel */}
      {activeSign && (
        <div style={{
          width: VIEW_W, marginTop: 10, background: "#2d2418", border: "2px solid #4a3a28",
          borderRadius: 6, padding: 18, animation: "slideUp 0.25s",
        }}>
          <div style={{ fontWeight: "bold", color: "#e0a458", fontSize: 16, marginBottom: 10 }}>◆ SIGN ◆</div>
          <div style={{ fontSize: 16, lineHeight: 1.5, marginBottom: 14, whiteSpace: "pre-line" }}>{activeSign.text}</div>
          <button
            onClick={() => setActiveSign(null)}
            style={{
              textAlign: "left", background: "#241d15",
              border: "1px solid #4a3a28", color: "#e8dcc8", padding: "10px 14px", fontSize: 15, borderRadius: 4,
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = "#c9a876"}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = "#4a3a28"}
          >
            Step away <span style={{ color: "#8a7a63" }}>(Esc)</span>
          </button>
        </div>
      )}

      {/* Dialogue panel */}
      {activeConvo && (
        <div style={{
          width: VIEW_W, marginTop: 10, background: "#2d2418", border: "2px solid #4a3a28",
          borderRadius: 6, padding: 18, animation: "slideUp 0.25s",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontWeight: "bold", color: "#e0a458", fontSize: 18 }}>
              {npcs[activeConvo].name} <span style={{ fontWeight: "normal", fontSize: 14, color: "#8a7a63" }}>· {npcs[activeConvo].role}</span>
            </div>
            <div style={{ fontSize: 14, color: opinionLabel(npcs[activeConvo].opinion).color }}>
              {opinionLabel(npcs[activeConvo].opinion).text}
            </div>
          </div>
          <div style={{ fontSize: 16, lineHeight: 1.5, marginBottom: 14, minHeight: 48 }}>{dialogueLine}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {shopOpen ? (
              <>
                <div style={{ fontSize: 14, color: "#8a7a63", marginBottom: 2 }}>Your coins: {coins}c</div>
                {ITEMS.map((item, i) => (
                  <button
                    key={item.id}
                    onClick={() => buyItem(item)}
                    style={{
                      textAlign: "left", display: "flex", justifyContent: "space-between",
                      background: "#3a2f20", border: "1px solid #4a3a28", color: "#e8dcc8",
                      padding: "10px 14px", fontSize: 15, borderRadius: 4,
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = "#c9a876"}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = "#4a3a28"}
                  >
                    <span><span style={{ color: "#8a7a63" }}>{i + 1}.</span> {item.name}</span>
                    <span>{item.price}c</span>
                  </button>
                ))}
                <button
                  onClick={() => setShopOpen(false)}
                  style={{
                    textAlign: "left", background: "#241d15",
                    border: "1px solid #4a3a28", color: "#e8dcc8", padding: "10px 14px", fontSize: 15, borderRadius: 4,
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = "#c9a876"}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = "#4a3a28"}
                >
                  Back <span style={{ color: "#8a7a63" }}>(Esc)</span>
                </button>
              </>
            ) : (
              <>
                {choices.filter((c) => c.key !== "leave").map((c, i) => (
                  <button
                    key={c.key}
                    onClick={() => pickChoice(c)}
                    style={{
                      textAlign: "left", background: c.key === "insult" ? "#3a2020" : "#3a2f20",
                      border: "1px solid #4a3a28", color: "#e8dcc8", padding: "10px 14px", fontSize: 15, borderRadius: 4,
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = "#c9a876"}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = "#4a3a28"}
                  >
                    <span style={{ color: "#8a7a63" }}>{i + 1}.</span> {c.label}
                  </button>
                ))}
                {dialogueLoading && (
                  <div style={{ padding: "10px 14px", fontSize: 15, color: "#8a7a63", fontStyle: "italic", animation: "slideUp 0.2s" }}>
                    {npcs[activeConvo].name} is thinking…
                  </div>
                )}
              </>
            )}
            {/* Always rendered, never waits on the network, so the player can never get stuck mid-request */}
            <button
              onClick={() => pickChoice({ key: "leave" })}
              style={{
                textAlign: "left", background: "#241d15",
                border: "1px solid #4a3a28", color: "#e8dcc8", padding: "10px 14px", fontSize: 15, borderRadius: 4,
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = "#c9a876"}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = "#4a3a28"}
            >
              Step away <span style={{ color: "#8a7a63" }}>(Esc)</span>
            </button>
          </div>
        </div>
      )}

      {/* Journal modal */}
      {showJournal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 10,
        }} onClick={() => setShowJournal(false)}>
          <div
            style={{ width: 600, maxHeight: 640, overflowY: "auto", background: "#241d15", border: "2px solid #4a3a28", borderRadius: 8, padding: 22 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 18, color: "#c9a876", marginBottom: 14, letterSpacing: 1 }}>◆ RELATIONSHIP JOURNAL ◆</div>
            {Object.entries(npcs).map(([id, npc]) => (
              <div key={id} style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <b style={{ color: "#e0a458", fontSize: 15 }}>{npc.name}</b>
                  <span style={{ fontSize: 13, color: opinionLabel(npc.opinion).color }}>{opinionLabel(npc.opinion).text} ({npc.opinion})</span>
                </div>
                <div style={{ fontSize: 13, color: "#8a7a63", marginBottom: 5 }}>
                  Known facts: {Object.keys(npc.facts).length === 0 ? "none yet" : Object.entries(npc.facts).map(([k, v]) => `${k}: ${v}`).join(", ")}
                </div>
                <div style={{ fontSize: 13 }}>
                  {npc.history.length === 0 && <div style={{ color: "#5a5040", fontStyle: "italic" }}>No interactions yet.</div>}
                  {npc.history.slice().reverse().map((h, i) => (
                    <div key={i} style={{ padding: "4px 0", borderTop: i > 0 ? "1px solid #3a3020" : "none", color: "#c9bfa8" }}>
                      Day {h.day}: {h.summary}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <button
              onClick={() => setShowJournal(false)}
              style={{ marginTop: 8, background: "#3a2f20", border: "1px solid #4a3a28", color: "#e8dcc8", padding: "8px 16px", borderRadius: 4, fontSize: 14 }}
            >
              Close <span style={{ color: "#8a7a63" }}>(Esc)</span>
            </button>
          </div>
        </div>
      )}

      {/* Inventory modal */}
      {showInventory && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 10,
        }} onClick={() => setShowInventory(false)}>
          <div
            style={{ width: 480, maxHeight: 640, overflowY: "auto", background: "#241d15", border: "2px solid #4a3a28", borderRadius: 8, padding: 22 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 18, color: "#c9a876", marginBottom: 14, letterSpacing: 1 }}>◆ INVENTORY ◆</div>
            <div style={{ fontSize: 15, color: "#f4d35e", marginBottom: 14 }}>Coins: {coins}c</div>
            {Object.keys(inventory).length === 0 && (
              <div style={{ color: "#5a5040", fontStyle: "italic", fontSize: 14 }}>You don't have anything yet.</div>
            )}
            {ITEMS.filter((item) => inventory[item.id] > 0).map((item) => (
              <div key={item.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid #3a3020", fontSize: 14, color: "#c9bfa8" }}>
                <span>{item.name}</span>
                <span>x{inventory[item.id]}</span>
              </div>
            ))}
            <button
              onClick={() => setShowInventory(false)}
              style={{ marginTop: 14, background: "#3a2f20", border: "1px solid #4a3a28", color: "#e8dcc8", padding: "8px 16px", borderRadius: 4, fontSize: 14 }}
            >
              Close <span style={{ color: "#8a7a63" }}>(Esc)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
