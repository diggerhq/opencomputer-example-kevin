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
  text: string;
  muted: string;
  faint: string;
  rule: string;
  card: string;
  ghostStroke: string;
  accent: Record<Role, string>;
  tint: Record<Role, string>;
}

const LIGHT: Palette = {
  bg: "#ffffff",
  text: "#1f2328",
  muted: "#59636e",
  faint: "#8c959f",
  rule: "#d8dee4",
  card: "#ffffff",
  ghostStroke: "#c8d1da",
  accent: { you: "#1f2328", lead: "#5b4fd6", builder: "#0f8a6f", reviewer: "#b86e00", git: "#57606a" },
  tint: { you: "#f2f4f7", lead: "#f0eefd", builder: "#e8f6f1", reviewer: "#fdf3e3", git: "#f2f4f7" },
};

const DARK: Palette = {
  bg: "#0d1117",
  text: "#e6edf3",
  muted: "#9198a1",
  faint: "#6e7681",
  rule: "#30363d",
  card: "#161b22",
  ghostStroke: "#3d444d",
  accent: { you: "#e6edf3", lead: "#a49bff", builder: "#3fcf9f", reviewer: "#f0b04a", git: "#9198a1" },
  tint: { you: "#1c2128", lead: "#1f1b3a", builder: "#0f2a22", reviewer: "#2e2410", git: "#1c2128" },
};

const STAGES = ["Brief", "Design", "Plan", "Build", "Review", "PR"];

const ROWS: { role: Role; name: string; sub: string; height: number }[] = [
  { role: "you", name: "You", sub: "in a Slack thread", height: 58 },
  { role: "lead", name: "Lead", sub: "Fable · the thread", height: 74 },
  { role: "builder", name: "Builders", sub: "Opus · ×N", height: 92 },
  { role: "reviewer", name: "Reviewer", sub: "Fable · cold read", height: 62 },
  { role: "git", name: "GitHub", sub: "the only state", height: 74 },
];

/** A line of text; `code` lines are set in monospace. */
type Line = string | { code: string };

interface Card {
  stage: number;
  role: Role;
  lines: Line[];
  ghost?: boolean;
  /** Drawn as a stack of cards: several running in parallel. */
  deck?: boolean;
  /** Pushed right so the column's arrows pass on its left. */
  inset?: boolean;
}

const CARDS: Card[] = [
  { stage: 0, role: "you", lines: [{ code: "@Kevin <sentence>" }] },
  { stage: 1, role: "you", lines: [{ code: "design" }, "then go"] },
  { stage: 2, role: "you", lines: [{ code: "plan" }, "then go"] },
  { stage: 3, role: "you", lines: [{ code: "build" }] },
  { stage: 4, role: "you", lines: [{ code: "status?" }] },
  { stage: 5, role: "you", lines: [{ code: "open · ready" }, "you merge"] },

  { stage: 0, role: "lead", lines: ["brief, v1", "assumptions,", "unknowns, steps"] },
  { stage: 1, role: "lead", lines: ["reads the code", "preview → design", "decision sheet"] },
  { stage: 2, role: "lead", lines: ["plan", "streams by files", "preview → plan"] },
  { stage: 3, role: "lead", lines: ["delegates streams", "merges each one", "as it lands"] },
  { stage: 4, role: "lead", lines: ["consults reviewer", "judges findings", "folds what holds"] },
  { stage: 5, role: "lead", lines: ["PR description", "for a human", "opens the draft"] },

  { stage: 1, role: "builder", lines: ["investigate", "read only"], ghost: true, inset: true },
  { stage: 3, role: "builder", lines: ["one per stream", "own computer", "own branch"], deck: true },

  { stage: 1, role: "reviewer", lines: ["design review", "on request"], ghost: true, inset: true },
  { stage: 4, role: "reviewer", lines: ["reads the branch", "findings, verdict"] },

  { stage: 1, role: "git", lines: [{ code: ".agents/design/" }, { code: "<slug>.md" }] },
  { stage: 2, role: "git", lines: [{ code: ".agents/work/" }, { code: "<slug>.md" }] },
  { stage: 3, role: "git", lines: [{ code: "agent/<slug>--api" }, { code: "agent/<slug>--ui" }, "→ agent/<slug>"] },
  { stage: 5, role: "git", lines: ["draft PR → ready"] },
];

/**
 * Arrows inside one stage column. `back` arrows run upward (an answer
 * returning); `lane` shifts an arrow left (-) or right (+) of the centre;
 * `left` routes it along the cards' left edge, past inset cards.
 */
const LINKS: { stage: number; from: Role; to: Role; label?: string; back?: boolean; lane?: number; left?: boolean }[] = [
  { stage: 0, from: "you", to: "lead" },
  { stage: 1, from: "you", to: "lead" },
  { stage: 1, from: "lead", to: "git", left: true },
  { stage: 2, from: "you", to: "lead" },
  { stage: 2, from: "lead", to: "git" },
  { stage: 3, from: "you", to: "lead" },
  { stage: 3, from: "lead", to: "builder", lane: -10 },
  { stage: 3, from: "builder", to: "lead", back: true, lane: 10, label: "outcomes" },
  { stage: 3, from: "builder", to: "git" },
  { stage: 4, from: "you", to: "lead" },
  { stage: 4, from: "lead", to: "reviewer", lane: -10, label: "consult" },
  { stage: 4, from: "reviewer", to: "lead", back: true, lane: 10, label: "verdict" },
  { stage: 5, from: "you", to: "lead" },
  { stage: 5, from: "lead", to: "git" },
];

const W = 960;
const LABEL_W = 140;
const COL_W = (W - LABEL_W - 16) / STAGES.length;
const TOP = 92;
const GAP = 10;
const PAD = 6;
const LINE_H = 14;
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function rowTops(): number[] {
  const tops: number[] = [];
  let y = TOP;
  for (const row of ROWS) {
    tops.push(y);
    y += row.height + GAP;
  }
  return tops;
}

function cardBox(card: Card, tops: number[]): { x: number; y: number; w: number; h: number } {
  const rowIndex = ROWS.findIndex((row) => row.role === card.role);
  const row = ROWS[rowIndex]!;
  const inset = card.inset ? 26 : 0;
  const x = LABEL_W + card.stage * COL_W + PAD + inset;
  const w = COL_W - PAD * 2 - inset;
  const h = card.lines.length * LINE_H + 16;
  return { x, y: tops[rowIndex]! + (row.height - h) / 2 + (card.deck ? -4 : 0), w, h };
}

function svg(p: Palette): string {
  const tops = rowTops();
  const height = tops[tops.length - 1]! + ROWS[ROWS.length - 1]!.height + 44;
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" role="img" aria-label="How Kevin works: who acts at each stage and what lands in git">`,
    `<defs>`,
    `<linearGradient id="res" x1="0" x2="1"><stop offset="0" stop-color="${p.accent.lead}" stop-opacity="0.12"/><stop offset="1" stop-color="${p.accent.lead}" stop-opacity="0.9"/></linearGradient>`,
    ...(["you", "lead", "builder", "reviewer", "git"] as Role[]).map(
      (role) =>
        `<marker id="arrow-${role}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="${p.accent[role]}"/></marker>`,
    ),
    `</defs>`,
    `<rect width="${W}" height="${height}" rx="12" fill="${p.bg}"/>`,
  );

  // Resolution bar: blurry and cheap to correct first, sharp and expensive last.
  const barX = LABEL_W + PAD;
  const barW = W - LABEL_W - 16 - PAD * 2;
  out.push(
    `<text x="${barX}" y="24" font-family="${SANS}" font-size="11" fill="${p.muted}">blurry · cheap to change</text>`,
    `<text x="${barX + barW}" y="24" font-family="${SANS}" font-size="11" fill="${p.muted}" text-anchor="end">sharp · expensive to change</text>`,
    `<rect x="${barX}" y="32" width="${barW}" height="4" rx="2" fill="url(#res)"/>`,
  );

  // Stage headers and column rules.
  STAGES.forEach((stage, index) => {
    const x = LABEL_W + index * COL_W;
    out.push(
      `<text x="${x + COL_W / 2}" y="66" font-family="${SANS}" font-size="13" font-weight="600" fill="${p.text}" text-anchor="middle">${stage}</text>`,
    );
    if (index > 0) out.push(`<line x1="${x}" y1="52" x2="${x}" y2="${height - 40}" stroke="${p.rule}" stroke-width="1" stroke-dasharray="2 4"/>`);
  });
  out.push(`<line x1="16" y1="${TOP - 12}" x2="${W - 16}" y2="${TOP - 12}" stroke="${p.rule}" stroke-width="1"/>`);

  // Row labels.
  ROWS.forEach((row, index) => {
    const mid = tops[index]! + row.height / 2;
    out.push(
      `<rect x="16" y="${tops[index]! + 6}" width="3" height="${row.height - 12}" rx="1.5" fill="${p.accent[row.role]}"/>`,
      `<text x="28" y="${mid - 2}" font-family="${SANS}" font-size="13" font-weight="600" fill="${p.text}">${row.name}</text>`,
      `<text x="28" y="${mid + 14}" font-family="${SANS}" font-size="10.5" fill="${p.muted}">${esc(row.sub)}</text>`,
    );
  });

  // Links first, so cards sit on top of them.
  const boxOf = (stage: number, role: Role) => {
    const card = CARDS.find((candidate) => candidate.stage === stage && candidate.role === role && !candidate.ghost);
    return card ? cardBox(card, tops) : undefined;
  };
  for (const link of LINKS) {
    const from = boxOf(link.stage, link.from);
    const to = boxOf(link.stage, link.to);
    if (!from || !to) continue;
    const upper = link.back ? to : from;
    const lower = link.back ? from : to;
    const x = link.left ? upper.x + 13 : upper.x + upper.w / 2 + (link.lane ?? 0);
    const deckBelow = CARDS.some((card) => card.stage === link.stage && card.deck && card.role === (link.back ? link.from : link.to));
    const top = upper.y + upper.h;
    const bottom = lower.y - (deckBelow ? 8 : 0);
    const color = p.accent[link.back ? link.from : link.to];
    const [y1, y2] = link.back ? [bottom, top + 2] : [top, bottom - 2];
    out.push(
      `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${color}" stroke-width="1.4" marker-end="url(#arrow-${link.back ? link.from : link.to})"${link.back ? ' stroke-dasharray="4 3"' : ""} opacity="0.9"/>`,
    );
    if (link.label) {
      const anchor = (link.lane ?? 0) < 0 ? "end" : "start";
      const dx = (link.lane ?? 0) < 0 ? -5 : 5;
      out.push(
        `<text x="${x + dx}" y="${(top + bottom) / 2 + 3.5}" font-family="${SANS}" font-size="10" fill="${p.muted}" text-anchor="${anchor}">${link.label}</text>`,
      );
    }
  }

  // Cards.
  for (const card of CARDS) {
    const box = cardBox(card, tops);
    const stroke = card.ghost ? p.ghostStroke : p.accent[card.role];
    const fill = card.ghost ? p.bg : p.tint[card.role];
    if (card.deck) {
      for (const offset of [8, 4]) {
        out.push(
          `<rect x="${box.x + offset}" y="${box.y + offset}" width="${box.w}" height="${box.h}" rx="8" fill="${p.card}" stroke="${stroke}" stroke-width="1" opacity="${offset === 8 ? 0.45 : 0.7}"/>`,
        );
      }
    }
    out.push(
      `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="${card.ghost ? 1 : 1.2}"${card.ghost ? ' stroke-dasharray="3 3"' : ""}/>`,
    );
    card.lines.forEach((line, index) => {
      const y = box.y + 8 + LINE_H * index + 10.5;
      const code = typeof line !== "string";
      const color = card.ghost ? p.faint : index === 0 && !code ? p.text : code ? p.accent[card.role] : p.muted;
      const weight = index === 0 && !card.ghost && !code ? ' font-weight="600"' : "";
      out.push(
        `<text x="${box.x + box.w / 2}" y="${y}" font-family="${code ? MONO : SANS}" font-size="${code ? 10.5 : 11}"${weight} fill="${color}" text-anchor="middle">${esc(code ? line.code : line)}</text>`,
      );
    });
  }

  out.push(
    `<text x="${W / 2}" y="${height - 16}" font-family="${SANS}" font-size="11" fill="${p.muted}" text-anchor="middle">You move it on with one word per stage. Builders exist only in Build: code is written once, against an agreed plan. Dashed boxes run only when needed.</text>`,
    `</svg>`,
  );
  return `${out.join("\n")}\n`;
}

const ROOT = resolve(import.meta.dirname, "..");
await mkdir(resolve(ROOT, "docs"), { recursive: true });
await writeFile(resolve(ROOT, "docs", "how-it-works-light.svg"), svg(LIGHT));
await writeFile(resolve(ROOT, "docs", "how-it-works-dark.svg"), svg(DARK));
console.log("docs/how-it-works-{light,dark}.svg written");
