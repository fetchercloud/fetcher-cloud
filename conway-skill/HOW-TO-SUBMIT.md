# Submitting the fetcher skill to Conway

Conway's skills registry accepts community skills by pull request. The skill
here (`fetcher/SKILL.md`) is ready to go.

1. Fork **github.com/Conway-Research/skills**.
2. Copy the `fetcher/` folder (containing `SKILL.md`) into the repo root.
3. Open a pull request titled something like
   *"Add fetcher skill — web capability layer (render, DNS, SSL, extract… via x402)"*.
4. In the PR description, note that it's a paid capability an Automaton can use
   out of the box (USDC on Base via x402) with a free daily tier.

The skill format is Markdown + YAML frontmatter (`name`, `description`,
`auto-activate`, `triggers`) — already set. Keep it concise; Conway values
low-token skills.

Note: the same `SKILL.md` pattern works for other agent runtimes too; loading
and activation may differ per runtime.
