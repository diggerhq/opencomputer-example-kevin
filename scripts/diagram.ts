/**
 * Draws docs/how-it-works-{light,dark}.svg: who acts at each stage and what
 * lands in git. One source for both themes; the README picks one with
 * <picture>.
 *
 *   npm run diagram
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type Role = "you" | "lead" | "builder" | "reviewer" | "git";

interface Palette {
  bg: string;
  lane: string;
  card: string;
  hairline: string;
  text: string;
  muted: string;
  faint: string;
  trigger: string;
  write: string;
  accent: Record<Role, string>;
  tint: Record<Role, string>;
}

const LIGHT: Palette = {
  bg: "#ffffff",
  lane: "#f6f8fa",
  card: "#ffffff",
  hairline: "#d8dee4",
  text: "#1f2328",
  muted: "#656d76",
  faint: "#9aa3ad",
  trigger: "#b6bec7",
  write: "#8c959f",
  accent: { you: "#1f2328", lead: "#6e56cf", builder: "#0e9384", reviewer: "#c2780a", git: "#57606a" },
  tint: { you: "#ffffff", lead: "#f6f4ff", builder: "#effaf7", reviewer: "#fff8ec", git: "#ffffff" },
};

const DARK: Palette = {
  bg: "#0d1117",
  lane: "#151b23",
  card: "#0d1117",
  hairline: "#30363d",
  text: "#e6edf3",
  muted: "#9198a1",
  faint: "#656c76",
  trigger: "#4a525c",
  write: "#6e7681",
  accent: { you: "#e6edf3", lead: "#a495f7", builder: "#3cc9b4", reviewer: "#f0b24a", git: "#9198a1" },
  tint: { you: "#0d1117", lead: "#1b1830", builder: "#0e2421", reviewer: "#271f10", git: "#0d1117" },
};

const STAGES = ["Brief", "Design", "Plan", "Build", "Review", "PR"];

const ROWS: { role: Role; name: string; sub: string }[] = [
  { role: "you", name: "You", sub: "in a Slack thread" },
  { role: "lead", name: "Lead", sub: "Fable · the thread" },
  { role: "builder", name: "Builders", sub: "Opus · per stream" },
  { role: "reviewer", name: "Reviewer", sub: "Fable · cold read" },
  { role: "git", name: "GitHub", sub: "the only state" },
];

/** A line of text; `code` lines are set in monospace. The first plain line of a card is its title. */
type Line = string | { code: string };

interface Card {
  stage: number;
  role: Role;
  lines: Line[];
  /** Drawn as a stack: several running in parallel. */
  deck?: boolean;
}

const CARDS: Card[] = [
  { stage: 0, role: "you", lines: [{ code: "@Kevin …" }] },
  { stage: 1, role: "you", lines: [{ code: "design · go" }] },
  { stage: 2, role: "you", lines: [{ code: "plan · go" }] },
  { stage: 3, role: "you", lines: [{ code: "build" }] },
  { stage: 4, role: "you", lines: [{ code: "status?" }] },
  { stage: 5, role: "you", lines: [{ code: "open · ready" }] },

  { stage: 0, role: "lead", lines: ["Brief", "what it will take"] },
  { stage: 1, role: "lead", lines: ["Design", "reads the code"] },
  { stage: 2, role: "lead", lines: ["Plan", "streams by file"] },
  { stage: 3, role: "lead", lines: ["Delegates", "merges streams"] },
  { stage: 4, role: "lead", lines: ["Judges", "folds what holds"] },
  { stage: 5, role: "lead", lines: ["Opens the PR", "for a human"] },

  { stage: 3, role: "builder", lines: ["Build", "own computer"], deck: true },

  { stage: 4, role: "reviewer", lines: ["Review", "reads it cold"] },

  { stage: 1, role: "git", lines: ["design doc"] },
  { stage: 2, role: "git", lines: ["plan doc"] },
  { stage: 3, role: "git", lines: [{ code: "agent/<slug>" }] },
  { stage: 5, role: "git", lines: ["pull request"] },
];

/**
 * Arrows inside one stage column. `trigger`: your word starting the stage
 * (quiet). `write`: a commit to the repository. `back`: an answer returning
 * (dashed, upward). `lane` shifts a pair of arrows apart.
 */
const LINKS: {
  stage: number;
  from: Role;
  to: Role;
  kind?: "trigger" | "write";
  back?: boolean;
  lane?: number;
  label?: string;
}[] = [
  ...STAGES.map((_, stage) => ({ stage, from: "you" as Role, to: "lead" as Role, kind: "trigger" as const })),
  { stage: 1, from: "lead", to: "git", kind: "write" },
  { stage: 2, from: "lead", to: "git", kind: "write" },
  { stage: 3, from: "lead", to: "builder", lane: -10, label: "delegate" },
  { stage: 3, from: "builder", to: "lead", back: true, lane: 10, label: "outcomes" },
  { stage: 3, from: "builder", to: "git", kind: "write" },
  { stage: 4, from: "lead", to: "reviewer", lane: -10, label: "consult" },
  { stage: 4, from: "reviewer", to: "lead", back: true, lane: 10, label: "verdict" },
  { stage: 5, from: "lead", to: "git", kind: "write" },
];

const W = 960;
const MARGIN = 20;
const LABEL_W = 156;
const COL_W = (W - LABEL_W - MARGIN) / STAGES.length;
const CARD_PAD_X = 12;
const LINE_H = 16;
const ROW_PAD = 18;
const ROW_GAP = 14;
const DECK = 6;
const HEADER_H = 128;
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const colX = (stage: number) => LABEL_W + stage * COL_W;
const colMid = (stage: number) => colX(stage) + COL_W / 2;

interface Layout {
  top: number;
  height: number;
  cardH: number;
}

/** Every card in a row has the row's height, so the rows read as lines. */
function layout(): Layout[] {
  const rows: Layout[] = [];
  let y = HEADER_H;
  for (const row of ROWS) {
    const cards = CARDS.filter((card) => card.role === row.role);
    const lines = Math.max(...cards.map((card) => card.lines.length));
    const cardH = lines * LINE_H + 22;
    const deck = cards.some((card) => card.deck) ? DECK : 0;
    const height = cardH + ROW_PAD * 2 + deck;
    rows.push({ top: y, height, cardH });
    y += height + ROW_GAP;
  }
  return rows;
}

function cardBox(card: Card, rows: Layout[]): { x: number; y: number; w: number; h: number } {
  const row = rows[ROWS.findIndex((candidate) => candidate.role === card.role)]!;
  return { x: colX(card.stage) + CARD_PAD_X, y: row.top + ROW_PAD, w: COL_W - CARD_PAD_X * 2, h: row.cardH };
}

function svg(p: Palette): string {
  const rows = layout();
  const last = rows[rows.length - 1]!;
  const height = last.top + last.height + 60;
  const out: string[] = [];
  const roles: Role[] = ["you", "lead", "builder", "reviewer", "git"];

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" role="img" aria-label="How Kevin works: who acts at each stage and what lands in git">`,
    `<defs>`,
    ...roles.map(
      (role) =>
        `<marker id="head-${role}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M1,1 L9,5 L1,9" fill="none" stroke="${p.accent[role]}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker>`,
    ),
    ...(["trigger", "write"] as const).map(
      (kind) =>
        `<marker id="head-${kind}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M1,1 L9,5 L1,9" fill="none" stroke="${p[kind]}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker>`,
    ),
    `</defs>`,
    `<rect width="${W}" height="${height}" rx="16" fill="${p.bg}"/>`,
  );

  // Header: a timeline whose nodes sharpen left to right — blurry and cheap first, sharp and expensive last.
  const lineY = 50;
  out.push(
    `<text x="${colMid(0)}" y="26" font-family="${SANS}" font-size="10.5" fill="${p.faint}" text-anchor="middle">blurry · cheap to change</text>`,
    `<text x="${colMid(STAGES.length - 1)}" y="26" font-family="${SANS}" font-size="10.5" fill="${p.faint}" text-anchor="middle">sharp · expensive to change</text>`,
    `<line x1="${colMid(0)}" y1="${lineY}" x2="${colMid(STAGES.length - 1)}" y2="${lineY}" stroke="${p.hairline}" stroke-width="1.5"/>`,
  );
  STAGES.forEach((stage, index) => {
    const x = colMid(index);
    const t = index / (STAGES.length - 1);
    out.push(
      `<circle cx="${x}" cy="${lineY}" r="${3 + t * 2.5}" fill="${p.accent.lead}" fill-opacity="${0.22 + t * 0.78}" stroke="${p.bg}" stroke-width="3"/>`,
      `<text x="${x}" y="${lineY + 30}" font-family="${MONO}" font-size="9.5" fill="${p.faint}" text-anchor="middle" letter-spacing="0.6">0${index + 1}</text>`,
      `<text x="${x}" y="${lineY + 50}" font-family="${SANS}" font-size="14" font-weight="600" fill="${p.text}" text-anchor="middle">${stage}</text>`,
    );
  });

  // Lanes and row labels.
  ROWS.forEach((row, index) => {
    const { top, height: h } = rows[index]!;
    out.push(
      `<rect x="${MARGIN}" y="${top}" width="${W - MARGIN * 2}" height="${h}" rx="12" fill="${p.lane}"/>`,
      `<circle cx="${MARGIN + 18}" cy="${top + h / 2 - 7}" r="3.5" fill="${p.accent[row.role]}"/>`,
      `<text x="${MARGIN + 30}" y="${top + h / 2 - 2.5}" font-family="${SANS}" font-size="13" font-weight="600" fill="${p.text}">${row.name}</text>`,
      `<text x="${MARGIN + 30}" y="${top + h / 2 + 13}" font-family="${SANS}" font-size="10.5" fill="${p.muted}">${esc(row.sub)}</text>`,
    );
  });

  // Arrows, under the cards.
  const boxOf = (stage: number, role: Role) => {
    const card = CARDS.find((candidate) => candidate.stage === stage && candidate.role === role);
    return card ? { card, box: cardBox(card, rows) } : undefined;
  };
  for (const link of LINKS) {
    const from = boxOf(link.stage, link.from);
    const to = boxOf(link.stage, link.to);
    if (!from || !to) continue;
    const upper = link.back ? to : from;
    const lower = link.back ? from : to;
    const top = upper.box.y + upper.box.h + (upper.card.deck ? DECK : 0);
    const bottom = lower.box.y;
    const x = colMid(link.stage) + (link.lane ?? 0);
    const role = link.back ? link.from : link.to;
    const stroke = link.kind === "trigger" ? p.trigger : link.kind === "write" ? p.write : p.accent[role];
    const marker = link.kind === "trigger" ? "head-trigger" : link.kind === "write" ? "head-write" : `head-${role}`;
    const [y1, y2] = link.back ? [bottom - 1, top + 3] : [top + 1, bottom - 3];
    const dash = link.back ? ' stroke-dasharray="3 3"' : "";
    out.push(
      `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${stroke}" stroke-width="1.3"${dash} stroke-linecap="round" marker-end="url(#${marker})"/>`,
    );
    if (link.kind === "write") out.push(`<circle cx="${x}" cy="${y1 + 1}" r="2" fill="${stroke}"/>`);
    if (link.label) {
      const left = (link.lane ?? 0) < 0;
      out.push(
        `<text x="${x + (left ? -7 : 7)}" y="${(top + bottom) / 2 + 3.5}" font-family="${SANS}" font-size="10" fill="${p.muted}" text-anchor="${left ? "end" : "start"}">${link.label}</text>`,
      );
    }
  }

  // Cards.
  for (const card of CARDS) {
    const box = cardBox(card, rows);
    const accent = p.accent[card.role];
    if (card.deck) {
      for (const offset of [DECK, DECK / 2]) {
        out.push(
          `<rect x="${box.x + offset}" y="${box.y + offset}" width="${box.w}" height="${box.h}" rx="9" fill="${p.card}" stroke="${accent}" stroke-opacity="${offset === DECK ? 0.25 : 0.45}"/>`,
        );
      }
    }
    const neutral = card.role === "you" || card.role === "git";
    out.push(
      `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="9" fill="${p.tint[card.role]}" stroke="${neutral ? p.hairline : accent}" stroke-opacity="${neutral ? 1 : 0.5}"/>`,
    );
    const blockH = card.lines.length * LINE_H;
    const firstY = box.y + (box.h - blockH) / 2 + LINE_H - 4;
    card.lines.forEach((line, index) => {
      const code = typeof line !== "string";
      const title = !code && index === 0 && card.role !== "git";
      const color = title ? accent : code ? p.text : p.muted;
      out.push(
        `<text x="${box.x + box.w / 2}" y="${firstY + index * LINE_H}" font-family="${code ? MONO : SANS}" font-size="${code ? 11 : title ? 12 : 11}"${title ? ' font-weight="600"' : ""} fill="${color}" text-anchor="middle">${esc(code ? line.code : line)}</text>`,
      );
    });
  }

  out.push(
    `<text x="${W / 2}" y="${height - 24}" font-family="${SANS}" font-size="11" fill="${p.muted}" text-anchor="middle">One click from you moves each stage. Builders run only at Build, against an agreed plan. On request: a design review, read-only investigations.</text>`,
    `</svg>`,
  );
  return `${out.join("\n")}\n`;
}

const ROOT = resolve(import.meta.dirname, "..");
await mkdir(resolve(ROOT, "docs"), { recursive: true });
await writeFile(resolve(ROOT, "docs", "how-it-works-light.svg"), svg(LIGHT));
await writeFile(resolve(ROOT, "docs", "how-it-works-dark.svg"), svg(DARK));
console.log("docs/how-it-works-{light,dark}.svg written");
