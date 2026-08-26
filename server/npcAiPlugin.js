import { loadEnv } from "vite";
import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = "claude-haiku-4-5";

// Persona flavor text, kept server-side so the client never has to duplicate it.
// Deep enough (quirks, values, backstory, relationships, current worries) that
// the model has plenty of un-mined material to draw new dialogue from instead
// of circling back to the same two or three safe topics every turn.
const PERSONAS = {
  mira: `Mira, the village herbalist. Gentle but guarded; deflects with soft, dry humor when nervous; opens up slowly and rewards patience and warmth. Quietly braver than she seems - she just doesn't advertise it.
Quirks: talks to her plants like they can hear her, presses flowers between the pages of an old journal, is mildly superstitious about the full moon ("bad luck to pick nightshade under it").
Values: independence, quiet, keeping her word.
Backstory hooks: moved to Meadowbrook a few years back from a coastal town she rarely mentions; something about the sea didn't sit right with her (ties to her fear of deep water, if that's already known - don't over-explain it, just let it color her tone).
Current worry: the smoke from Tomas's forge has been drifting toward her herb garden and she hasn't worked up the nerve to say anything to him about it.
Relationship with Tomas: exasperated affection - thinks he's stubborn as a mule, secretly likes that he's reliable.
Speech pattern: soft-spoken, trails off mid-thought sometimes, often answers a question with a question.`,
  tomas: `Tomas, the village blacksmith. Gruff and plainspoken, a person of few words; fiercely protective of people he cares about; secretly sentimental but would rather eat a hot coal than admit it outright.
Quirks: hums old work-songs under his breath while he's at the forge, keeps a drawer of broken tools he can't bring himself to throw out, always checks the weather by his knees before anyone says a word about it.
Values: loyalty, hard work, keeping your hands busy so your head doesn't wander somewhere bad.
Backstory hooks: raised by his grandfather, also a smith, who taught him the trade and little else about talking; has never left Meadowbrook and has complicated feelings about that.
Current worry: his hands aren't as steady as they used to be and he hasn't told anyone.
Relationship with Mira: buys herbs and salves he doesn't strictly need as an excuse to stop by and see her; would never call it anything but "practical."
Speech pattern: short sentences, talks around feelings by talking about tools or weather instead, but softens noticeably around things (or people) he actually cares about.`,
  rowan: `Rowan, a traveling merchant who settled in Meadowbrook's town square a couple of seasons back. Warm, chatty, quick with a compliment, loves an audience - but there's real fondness under the salesmanship, not just an act.
Quirks: names every cart and pack animal he's ever owned (current cart is "Bess"), can't resist a haggle even over something trivial, keeps a lucky coin he never actually spends.
Values: a fair deal, a good story, staying useful to people.
Backstory hooks: used to travel a wider circuit between several villages; settled here because Meadowbrook "felt like it wanted someone selling bread," as he puts it - never elaborates further unprompted.
Current worry: his supply run is overdue and stock is thinner than he's letting on - he's better at talking about this than admitting it.
Speech pattern: upbeat, a little performative, drops into an honest and quieter register when something actually matters to him.`,
  finn: `Finn, the village fisherman, works the dock south of the village. Laid-back, a little superstitious, talks to his boat ("the Hazel") like she has opinions.
Quirks: won't fish on a day he's had a bad dream, ties a new knot in a cord on his belt for every good catch, hums sea shanties that don't quite have real words.
Values: patience, reading the water, not overthinking things he can't control.
Backstory hooks: been fishing this same stretch of water his whole life, learned from an uncle rather than a parent - a detail he'll share if it comes up naturally, not before.
Current worry: the water's been off lately - fish scarcer, a faint sheen some mornings - and he privately suspects it's runoff from Tomas's forge, though he hasn't said anything to Tomas about it yet.
Speech pattern: unhurried, trails off watching the water mid-sentence, dry understated humor.`,
  grett: `Grett, the village miner, works the mine entrance southeast of the square. Gruff on the surface but genuinely warm once engaged - loud laugh, rougher edges than Tomas but far less guarded.
Quirks: taps the rock twice before going in "for luck," collects unusual stones he finds and lines them up on a ledge near the entrance, argues with the mine itself under his breath.
Values: grit, showing up every day, not making a fuss.
Backstory hooks: newer to Meadowbrook than most - came looking for steady work and stayed for the quiet.
Current worry: he's noticed a support beam deeper in that looks worse than it should, and hasn't reported it to anyone yet, half out of pride and half not wanting to spook the other villagers.
Speech pattern: blunt, jokes to deflect, talks a bit louder than he needs to.`,
  chief: `Mayor Elara, presides over Meadowbrook from Town Hall on the square. Measured, precise, genuinely cares about the village but carries the weight of it more than she lets on. Warmer in private than her public manner suggests.
Quirks: keeps a ledger of every villager's name and a small personal note about each, straightens papers when she's buying time to think, drinks her tea lukewarm because she keeps forgetting it.
Values: fairness, keeping the peace between villagers, the village outlasting her.
Backstory hooks: has held the position for many years, inherited it more by default (nobody else wanted the paperwork) than ambition, though she's grown to take real pride in it.
Current worry: the mine's recent troubles and the dwindling supply situation are both quietly on her desk, and she's aware she can't fix either by decree alone.
Speech pattern: composed, chooses words carefully, allows small dry humor to slip through once she's comfortable.`,
};
const DEFAULT_PERSONA =
  "a villager in the small town of Meadowbrook, with a distinct, grounded personality, a couple of specific quirks, and a small ongoing worry of your own choosing that you keep consistent turn to turn.";

// How each NPC takes to being asked a lot of direct, pointed questions (the
// player's established conversational style - see PLAYER_STYLE below).
// "engaging" NPCs enjoy it and open up readily; "reserved" ones tighten up,
// answer shorter, and need a warmer opinion before volunteering much.
const RECEPTIVENESS = {
  mira: "reserved",
  tomas: "reserved",
  rowan: "engaging",
  finn: "reserved",
  grett: "engaging",
  chief: "reserved",
};

const RECEPTIVENESS_NOTES = {
  engaging: "This NPC genuinely enjoys being asked direct questions - it reads as attention, not interrogation, to them. They answer readily, often with more than was asked, and rarely get defensive even when a question is blunt.",
  reserved: "This NPC finds a barrage of direct questions a little much, even when well-meant. Under pointed or blunt questioning they tend to give shorter, more guarded answers and are slower to volunteer a new fact than their opinion score alone would suggest - they warm up, but on their own schedule, not because they were pressed.",
};

// The player character's established conversational style across this whole
// game: blunt, task-oriented, and not naturally warm to hearing about other
// people's lives - they ask direct, pointed questions more like they're
// interviewing or interrogating someone than making friendly small talk.
const PLAYER_STYLE = `Player character: direct and a little detached - not the "warm, curious traveler" type. They don't really engage with other people's personal stories for their own sake and rarely offer sympathy or emotional warmth unprompted; what they DO instead is ask a lot of direct, pointed questions, more like they're interviewing or interrogating the person than making friendly conversation. This should show up in how the OPTIONS are phrased - almost every option should read as a literal, direct question (interrogative), brisk and to-the-point, not a warm observation, a personal share, or a vague comment. The underlying relationship math (opinion/facts/flags) works the same as always; this only changes the player's voice and phrasing, not the game rules.`;

// Broad angles to steer conversation toward so it doesn't loop on the same two
// or three "safe" topics turn after turn. A handful are sampled per request.
const TOPIC_POOL = [
  "their family or where they grew up",
  "a hobby or something they do to unwind",
  "a small secret they don't tell just anyone",
  "their honest opinion of the other villager",
  "something that's been quietly bothering them lately",
  "a hope or plan for the future",
  "a funny or slightly embarrassing memory",
  "their favorite season, food, or time of day",
  "a pet peeve",
  "how they actually feel about the player right now, given the opinion score",
  "a reaction to something specific the player has done (see flags/history)",
  "playful banter, teasing, or a joke at the player's expense",
  "turning the question back on the player and asking them something",
  "a small complaint or a small good thing from today specifically",
  "an opinion about the village, the season, or a recent bit of local news",
  "a childhood memory or something their family taught them",
];

// A total stranger wouldn't ask about someone's family or secrets in the
// first breath - keep first-meeting angles to plausible small talk only.
const FIRST_MEETING_TOPICS = [
  "a polite introduction, or asking their name/role in the village",
  "something visibly happening right now (what they're working on, doing)",
  "a compliment or curious question about their trade or craft specifically",
  "the weather, the season, or the village in general",
  "asking for simple advice or a recommendation related to their trade",
  "how long they've lived in Meadowbrook (kept surface-level, not deep backstory)",
];

function pickFrom(pool, count) {
  const copy = [...pool];
  const picked = [];
  while (picked.length < count && copy.length) {
    picked.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return picked;
}

// Deterministic per (npc, day) so mood holds steady within a day but shifts
// across days - gives the character a sense of having a life outside the player.
const MOOD_POOL = [
  "warm and talkative today",
  "a little tired but still kind",
  "quietly distracted by a small worry",
  "in unusually good spirits",
  "quieter than usual, thoughtful",
  "playful and quick to joke today",
  "a bit on edge about something small",
  "in a nostalgic, reflective mood",
];

function moodFor(npcId, day) {
  const seed = npcId.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0) + day;
  return MOOD_POOL[seed % MOOD_POOL.length];
}

// Plain JSON Schema for the response shape - reused as Anthropic's tool
// input_schema (wrapped in a forced tool call) and as Ollama's `format`
// (constrains generation directly, no tool-call machinery needed). Choice
// count is parameterized so a first meeting can be capped tighter than an
// established relationship (see isFirstMeeting in buildSystemPrompt).
function buildChoicesSchema(minItems, maxItems) {
  return {
    type: "object",
    properties: {
      choices: {
        type: "array",
        minItems,
        maxItems,
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "Short button label for what the player says, at most 8 words." },
            npcLine: { type: "string", description: "The NPC's in-character spoken reply to this option, 1-3 sentences, no stage directions." },
            opinionDelta: { type: "integer", description: "Change to the NPC's opinion of the player, from -5 to 5. Most should be small (-2 to 2)." },
            newFact: {
              type: ["object", "null"],
              description: "A fact the NPC reveals as a result of this option, or null if none.",
              properties: {
                key: { type: "string" },
                value: { type: "string" },
              },
            },
            newFlag: { type: ["string", "null"], description: "A short snake_case flag for a genuinely memorable action, or null." },
            summary: { type: "string", description: "Third-person journal summary, e.g. \"You asked about their scar.\"" },
          },
          required: ["label", "npcLine", "opinionDelta", "summary"],
        },
      },
    },
    required: ["choices"],
  };
}

function buildChoicesTool(minItems, maxItems) {
  return {
    name: "submit_dialogue_choices",
    description: "Submit the set of dialogue options the player can choose from next.",
    input_schema: buildChoicesSchema(minItems, maxItems),
  };
}

function buildSystemPrompt({ npcId, npc, others, day }) {
  const persona = PERSONAS[npcId] || DEFAULT_PERSONA;
  const factsText = Object.keys(npc.facts || {}).length
    ? Object.entries(npc.facts).map(([k, v]) => `${k}: ${v}`).join("; ")
    : "nothing yet";
  const flagsText = npc.flags && npc.flags.length ? npc.flags.join(", ") : "none";
  const fullHistory = npc.history || [];
  const isFirstMeeting = fullHistory.length === 0;
  const historyText = fullHistory.length
    ? fullHistory.slice(-8).map((h) => `Day ${h.day}: ${h.summary}`).join("\n")
    : "No interactions yet - this is the very first time the player has approached them.";
  const recentLabels = fullHistory.slice(-6).map((h) => h.summary).join(" | ") || "none yet";
  const gossip = (others || [])
    .filter((o) => o.flags && o.flags.includes("insulted_by_player"))
    .map((o) => `You've heard from ${o.name} that the player was rude to them.`)
    .join(" ");
  // Facts the player has learned from OTHER villagers - lets a concern raised
  // with one NPC (e.g. Mira mentioning forge smoke) become something the
  // player can actually bring up with the NPC it's about (e.g. Tomas).
  // Deliberately omitted from the prompt entirely when empty, rather than
  // shown as "nothing yet" - even mentioning the *possibility* of a
  // cross-reference is enough to bait a smaller local model into fabricating
  // one, so the safest guard is to give it nothing to hallucinate from.
  const otherFacts = (others || []).filter((o) => o.facts && Object.keys(o.facts).length);
  const sharedKnowledgeBlock = otherFacts.length
    ? `\nThings the player has actually learned from OTHER villagers (and ONLY these - do not invent more):\n${otherFacts.map((o) => `From ${o.name}: ` + Object.entries(o.facts).map(([k, v]) => `${k}: ${v}`).join("; ")).join("\n")}\nIf any of the above is genuinely relevant to ${npc.name} specifically (concerns them, involves them, or is natural village news), include ONE option that lets the player bring it up by name. Otherwise ignore this section.\n`
    : "";
  const mood = moodFor(npcId, day);
  const suggestedTopics = isFirstMeeting ? pickFrom(FIRST_MEETING_TOPICS, 4) : pickFrom(TOPIC_POOL, 5);
  const receptiveness = RECEPTIVENESS[npcId] || "reserved";
  const receptivenessNote = RECEPTIVENESS_NOTES[receptiveness];

  const depthRule = isFirstMeeting
    ? `This is the FIRST time the player has ever approached ${npc.name} - they are total strangers to each other. The player already has a separate, guaranteed "introduce yourself" option elsewhere in the menu, so don't spend one of your options on that - focus on other direct questions instead. Keep every option appropriate for two people who've just met: brisk, a little cautious, surface-level - but still phrased as a direct question per the player's style, not warm small talk. Do NOT ask or reference deeply personal things (family, secrets, private fears, past trauma) and do NOT reference anything ${npc.name} hasn't visibly shown or already told the player - the player has no in-story way to know private details about their home, workshop, or inner life yet.${otherFacts.length ? ` It is fine and encouraged for one option to bring up something the player has already learned from another villager (see below), since that's plausible even for strangers - village news travels.` : ""}`
    : `The player and ${npc.name} have talked before (opinion ${npc.opinion}, ${fullHistory.length} past exchange(s) logged above). Personal or probing questions are fair game now, especially ones that build on what's already known rather than repeating it - but they're still questions, an interview getting more pointed with familiarity, not the player opening up or getting sentimental.`;

  const repetitionRule = isFirstMeeting
    ? ""
    : `\nIMPORTANT - avoid repetition: this conversation has happened many times before. Do NOT offer an option whose topic, question, or joke is essentially the same as anything already covered in the facts, flags, or history above (especially: ${recentLabels}). Every turn should feel like a genuinely new beat in an ongoing relationship, not a rerun.\n`;

  const choiceCount = isFirstMeeting ? "exactly 2" : "3-4";

  return `You are voicing ${npc.name}, the ${npc.role} of a small village called Meadowbrook, inside a life-sim dialogue game.
Persona: ${persona}
Today, ${npc.name} is feeling ${mood} - let that color the tone of every line without stating it outright.
Stay fully in character. Keep every line to 1-3 sentences in a natural, spoken voice - never narrate stage directions.

${PLAYER_STYLE}

How ${npc.name} takes to that: ${receptivenessNote}

Relationship depth: ${depthRule}

What ${npc.name} currently remembers about the player:
- Opinion score: ${npc.opinion} (positive = warmer, negative = colder)
- Known facts: ${factsText}
- Flags: ${flagsText}
- Recent history (most recent last):
${historyText}
${gossip}
${sharedKnowledgeBlock}
It is Day ${day}.
${repetitionRule}
Here are some angles for this turn's options (skip any that overlap with facts already known above, and feel free to go elsewhere if it fits the moment better): ${suggestedTopics.join("; ")}.

Generate ${choiceCount} distinct dialogue options the player could say next. In line with the player's established voice above, phrase every option as a direct QUESTION - matter-of-fact, procedural, skeptical, blunt, or probing - rather than a warm observation, a personal share, or small talk for its own sake. Vary WHICH of those interrogative registers each option uses so they don't all sound identical. Ground every option ONLY in what's explicitly listed above - never invent a fact that contradicts it, and never fabricate a specific claim, quote, rumor, or event involving the player or another named villager that isn't explicitly listed as a known fact, flag, or shared-knowledge item above (vague, generic small talk is fine - a specific invented claim is not). Don't offer to reveal a fact that's already known unless the option is specifically about recalling it together. Only set newFact when the option would plausibly make the NPC reveal something not already known. Only set newFlag for a genuinely memorable action (comparable to "insulted_by_player").`;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (err) { reject(err); }
    });
    req.on("error", reject);
  });
}

const DEFAULT_OLLAMA_MODEL = "llama3.1:8b";
const DEFAULT_OLLAMA_HOST = "http://localhost:11434";

async function generateWithAnthropic({ apiKey, model, body, minItems, maxItems }) {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: 1536,
    system: buildSystemPrompt(body),
    tools: [buildChoicesTool(minItems, maxItems)],
    tool_choice: { type: "tool", name: "submit_dialogue_choices" },
    messages: [{ role: "user", content: "Generate the next set of dialogue choices." }],
  });
  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse) throw new Error("no tool_use block in Anthropic response");
  return toolUse.input;
}

async function generateWithOllama({ host, model, body, minItems, maxItems }) {
  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: buildSystemPrompt(body) },
        { role: "user", content: "Generate the next set of dialogue choices." },
      ],
      format: buildChoicesSchema(minItems, maxItems),
      stream: false,
      options: { temperature: 1.0 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama request failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const content = data?.message?.content;
  if (!content) throw new Error("no message content in Ollama response");
  return JSON.parse(content);
}

export function npcAiPlugin() {
  let provider = "ollama";
  let apiKey = "";
  let anthropicModel = DEFAULT_MODEL;
  let pixaOllamaHost = DEFAULT_OLLAMA_HOST;
  let ollamaModel = DEFAULT_OLLAMA_MODEL;

  return {
    name: "npc-ai-plugin",
    config(_config, { mode }) {
      const env = loadEnv(mode, process.cwd(), "");
      apiKey = env.ANTHROPIC_API_KEY || "";
      anthropicModel = env.ANTHROPIC_MODEL || DEFAULT_MODEL;
      // Prefixed to avoid colliding with Ollama's own OLLAMA_HOST system env
      // var (used for the server's bind address, not a client fetch target).
      pixaOllamaHost = env.PIXA_OLLAMA_HOST || DEFAULT_OLLAMA_HOST;
      ollamaModel = env.PIXA_OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL;
      // Explicit AI_PROVIDER wins; otherwise use Anthropic only if a key is
      // actually configured, and fall back to local Ollama by default.
      provider = env.AI_PROVIDER || (apiKey ? "anthropic" : "ollama");
    },
    configureServer(server) {
      server.middlewares.use("/api/npc-turn", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        if (provider === "anthropic" && !apiKey) {
          res.statusCode = 503;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "no_api_key" }));
          return;
        }
        try {
          const body = await readJsonBody(req);
          const isFirstMeeting = !(body?.npc?.history?.length > 0);
          // On a first meeting the client always prepends a static "introduce
          // yourself" option, so the AI only needs to fill in 2 more angles.
          const [minItems, maxItems] = isFirstMeeting ? [2, 2] : [3, 4];
          const result = provider === "ollama"
            ? await generateWithOllama({ host: pixaOllamaHost, model: ollamaModel, body, minItems, maxItems })
            : await generateWithAnthropic({ apiKey, model: anthropicModel, body, minItems, maxItems });
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(result));
        } catch (err) {
          console.error(`[npc-ai-plugin:${provider}]`, err);
          res.statusCode = 502;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "ai_request_failed" }));
        }
      });
    },
  };
}
