import React, { useState, useEffect, useRef, useCallback } from "react";

// ---------- CONSTANTS ----------
const TILE = 32;
const MAP_W = 16;
const MAP_H = 11;
const MOVE_SPEED = 4; // tiles per second
const NPC_RADIUS = 0.4; // half-width of an NPC's collision box, in tiles

// Map legend: 0 grass, 1 path, 2 water, 3 tree(solid), 4 flower, 5 fence(solid), 6 house wall(solid), 7 house door
const MAP = [
  [3,3,3,3,0,0,0,0,0,0,0,0,3,3,3,3],
  [3,0,0,0,0,4,0,0,0,0,4,0,0,0,0,3],
  [3,0,6,6,7,6,0,0,6,6,7,6,0,0,0,3],
  [3,0,6,0,0,6,0,0,6,0,0,6,0,4,0,3],
  [0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
  [0,4,1,0,0,0,0,0,0,0,0,0,1,0,4,0],
  [0,0,1,1,1,1,0,0,1,1,1,1,1,0,0,0],
  [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],
  [3,0,2,2,0,0,6,6,7,6,0,0,2,2,0,3],
  [3,0,2,2,0,0,6,0,0,6,0,0,2,2,0,3],
  [3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],
];
const SOLID = new Set([2, 3, 5, 6]);

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
};

// Dialogue tree: functions receive (npc, allNpcs, day) and return { text, choices }
// choices: [{ label, apply(npc, allNpcs) => mutates and returns summary string }]

function greet(npc) {
  if (npc.opinion >= 6) return `${npc.name} lights up when they see you. "There you are! I was hoping you'd stop by."`;
  if (npc.opinion >= 3) return `${npc.name} smiles. "Good to see you again."`;
  if (npc.opinion <= -4) return `${npc.name} barely looks up. "...oh. It's you."`;
  if (npc.opinion <= -1) return `${npc.name} gives a cool nod. "Hm."`;
  if (npc.history.length === 0) return `${npc.name} glances over, a little unsure. "Oh — hello. I don't think we've met properly."`;
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
  return (
    <svg width={TILE} height={TILE} viewBox="0 0 16 16" shapeRendering="crispEdges">
      <rect x="5" y="2" width="6" height="5" fill="#e8b98a" />
      <rect x="5" y="1" width="6" height="2" fill={sprite === "smith" ? "#3d2b1f" : "#7a4a2f"} />
      <rect x="4" y="7" width="8" height="6" fill={color} />
      <rect x="4" y="13" width="3" height="2" fill="#2b2b2b" />
      <rect x="9" y="13" width="3" height="2" fill="#2b2b2b" />
      {sprite === "smith" && <rect x="2" y="8" width="2" height="3" fill="#888" />}
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
    default: return "#5a9c4a";
  }
}

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

  // Movement + interaction key listener (mounted once; reads live state via refs
  // so it never has to be torn down/re-attached while the render loop is running)
  useEffect(() => {
    function onDown(e) {
      const key = e.key.toLowerCase();
      keysRef.current[key] = true;
      if (key === "e") {
        if (!activeConvoRef.current && nearbyRef.current) {
          const id = nearbyRef.current;
          const npc = npcsRef.current[id];
          setActiveConvo(id);
          setDialogueLine(greet(npc));
          setChoices(buildDialogue(id, npc, npcsRef.current, dayRef.current));
        }
      } else if (e.key === "Escape" && activeConvoRef.current) {
        setActiveConvo(null);
        setDialogueLine(null);
        setChoices([]);
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

      if (!activeConvo) {
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
          const canMove = (tx, ty) => {
            const gx = Math.floor(tx), gy = Math.floor(ty);
            if (gx < 0 || gy < 0 || gx >= MAP_W || gy >= MAP_H) return false;
            if (SOLID.has(MAP[gy][gx])) return false;
            for (const npc of Object.values(npcsRef.current)) {
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
  }, [activeConvo]);

  // Check proximity to NPCs for interaction prompt
  const nearbyNPC = useCallback(() => {
    for (const [id, npc] of Object.entries(npcs)) {
      const dist = Math.hypot(player.x - (npc.x + 0.5), player.y - (npc.y + 0.5));
      if (dist < 1.1) return id;
    }
    return null;
  }, [player, npcs]);

  const [nearby, setNearby] = useState(null);
  useEffect(() => {
    const id = setInterval(() => {
      const found = nearbyNPC();
      nearbyRef.current = found;
      setNearby(found);
    }, 100);
    return () => clearInterval(id);
  }, [nearbyNPC]);

  function pickChoice(choice) {
    if (choice.key === "leave") {
      setActiveConvo(null);
      setDialogueLine(null);
      setChoices([]);
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
    setTimeout(() => {
      setNpcs((prev) => {
        setChoices(buildDialogue(activeConvo, prev[activeConvo], prev, day));
        return prev;
      });
    }, 50);
  }

  function opinionLabel(v) {
    if (v >= 8) return { text: "Devoted", color: "#e0669a" };
    if (v >= 4) return { text: "Fond", color: "#7fc97f" };
    if (v >= 1) return { text: "Friendly", color: "#a8d8a8" };
    if (v >= -2) return { text: "Neutral", color: "#c9c9c9" };
    if (v >= -5) return { text: "Wary", color: "#e0a458" };
    return { text: "Resentful", color: "#c0504d" };
  }

  const camX = Math.max(0, Math.min(MAP_W * TILE - 480, player.x * TILE - 240));
  const camY = Math.max(0, Math.min(MAP_H * TILE - 320, player.y * TILE - 160));

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

      <div style={{ display: "flex", justifyContent: "space-between", width: 480, marginBottom: 8, alignItems: "center" }}>
        <div style={{ fontSize: 13, letterSpacing: 1, color: "#c9a876" }}>◆ MEADOWBROOK ◆ Day {day}</div>
        <button
          onClick={() => setShowJournal(true)}
          style={{ background: "#2d2418", border: "1px solid #4a3a28", color: "#e8dcc8", padding: "4px 10px", fontSize: 11, borderRadius: 3 }}
        >
          Journal
        </button>
      </div>

      <div style={{
        width: 480, height: 320, position: "relative", overflow: "hidden",
        border: "3px solid #4a3a28", borderRadius: 4, imageRendering: "pixelated",
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      }}>
        <div style={{
          position: "absolute", left: -camX, top: -camY,
          width: MAP_W * TILE, height: MAP_H * TILE,
        }}>
          {/* Map tiles */}
          {MAP.map((row, gy) => row.map((v, gx) => (
            <div key={`${gx}-${gy}`} style={{
              position: "absolute", left: gx * TILE, top: gy * TILE, width: TILE, height: TILE,
              background: tileColor(v),
              borderRight: v === 2 ? "none" : "1px solid rgba(0,0,0,0.04)",
            }}>
              {v === 7 && <div style={{ position: "absolute", inset: 4, background: "#3d2b1f", borderRadius: "2px 2px 0 0" }} />}
              {v === 3 && <div style={{ position: "absolute", top: -6, left: 2, width: TILE - 4, height: TILE - 4, background: "#1f4020", borderRadius: "50%" }} />}
            </div>
          )))}

          {/* NPCs */}
          {Object.entries(npcs).map(([id, npc]) => (
            <div key={id} style={{ position: "absolute", left: npc.x * TILE, top: npc.y * TILE, transition: "none" }}>
              <NPCSprite color={npc.color} sprite={npc.sprite} />
              {nearby === id && !activeConvo && (
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
        {nearby && !activeConvo && (
          <div style={{
            position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
            background: "rgba(20,16,10,0.9)", padding: "5px 12px", borderRadius: 4, fontSize: 12,
            border: "1px solid #4a3a28", animation: "slideUp 0.2s",
          }}>
            Press <b>E</b> to talk to {npcs[nearby].name}
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
      <div style={{ marginTop: 8, fontSize: 11, color: "#8a7a63" }}>WASD / arrows to move · E to talk</div>

      {/* Dialogue panel */}
      {activeConvo && (
        <div style={{
          width: 480, marginTop: 10, background: "#2d2418", border: "2px solid #4a3a28",
          borderRadius: 6, padding: 14, animation: "slideUp 0.25s",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontWeight: "bold", color: "#e0a458", fontSize: 14 }}>
              {npcs[activeConvo].name} <span style={{ fontWeight: "normal", fontSize: 11, color: "#8a7a63" }}>· {npcs[activeConvo].role}</span>
            </div>
            <div style={{ fontSize: 11, color: opinionLabel(npcs[activeConvo].opinion).color }}>
              {opinionLabel(npcs[activeConvo].opinion).text}
            </div>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 12, minHeight: 40 }}>{dialogueLine}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {choices.map((c) => (
              <button
                key={c.key}
                onClick={() => pickChoice(c)}
                style={{
                  textAlign: "left", background: c.key === "insult" ? "#3a2020" : c.key === "leave" ? "#241d15" : "#3a2f20",
                  border: "1px solid #4a3a28", color: "#e8dcc8", padding: "8px 10px", fontSize: 12, borderRadius: 4,
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = "#c9a876"}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = "#4a3a28"}
              >
                {c.label}
              </button>
            ))}
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
            style={{ width: 440, maxHeight: 480, overflowY: "auto", background: "#241d15", border: "2px solid #4a3a28", borderRadius: 8, padding: 18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 15, color: "#c9a876", marginBottom: 12, letterSpacing: 1 }}>◆ RELATIONSHIP JOURNAL ◆</div>
            {Object.entries(npcs).map(([id, npc]) => (
              <div key={id} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <b style={{ color: "#e0a458" }}>{npc.name}</b>
                  <span style={{ fontSize: 11, color: opinionLabel(npc.opinion).color }}>{opinionLabel(npc.opinion).text} ({npc.opinion})</span>
                </div>
                <div style={{ fontSize: 11, color: "#8a7a63", marginBottom: 4 }}>
                  Known facts: {Object.keys(npc.facts).length === 0 ? "none yet" : Object.entries(npc.facts).map(([k, v]) => `${k}: ${v}`).join(", ")}
                </div>
                <div style={{ fontSize: 11 }}>
                  {npc.history.length === 0 && <div style={{ color: "#5a5040", fontStyle: "italic" }}>No interactions yet.</div>}
                  {npc.history.slice().reverse().map((h, i) => (
                    <div key={i} style={{ padding: "3px 0", borderTop: i > 0 ? "1px solid #3a3020" : "none", color: "#c9bfa8" }}>
                      Day {h.day}: {h.summary}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <button
              onClick={() => setShowJournal(false)}
              style={{ marginTop: 8, background: "#3a2f20", border: "1px solid #4a3a28", color: "#e8dcc8", padding: "6px 14px", borderRadius: 4, fontSize: 12 }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
