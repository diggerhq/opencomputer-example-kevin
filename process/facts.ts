/**
 * What the platform does, stated as facts (design 019 §12 mechanics, §3
 * constraints). The lead reads them on every turn and decides what to do
 * with them; nothing here says which tool to call or in what order.
 */

export const FACTS = `# Platform facts
- Typed replies reach you only with an @mention; button clicks always do. Say so once per thread.
- Slack renders Markdown; \`*word*\` is italic, \`**word**\` bold; no tables.
- Only the last message you write in a turn posts; your thinking is never shown. A turn that only calls tools posts nothing.
- \`ask(question, options)\` ends the turn and posts your last message with the question and its buttons under it, so write what the person needs to decide before asking; the click, or a typed reply, arrives as your next input (a typed reply carries an "Open question:" line). A question never holds the thread.
- \`consult\` ends the turn and holds the thread until the reviewer answers; the answer arrives as your next input.
- Builders you started report through events: a turn starts with their report parsed.
- Your \`/workspace\` persists between turns; a clone there is a cache, the remote is the truth. The GitHub token refreshes on a shell command; after a long gap run one before any tool that uses GitHub.
- A failed tool says what failed and what to do next; tell the person in a sentence, never paste raw output.`;
