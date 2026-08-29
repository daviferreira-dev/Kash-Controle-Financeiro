---
name: stitch
description: Use when the user wants to generate, iterate on, or extract UI screens for the Kash finance app with Google Stitch. Covers creating the Stitch project, defining the design system (colors, fonts, light/dark), generating screens from text prompts, editing screens, generating variants, applying the design system, and pulling the generated frontend code into the repo. Trigger on mentions of "stitch", "gerar tela", "protótipo de UI", "design system", "mockup".
version: 0.1.0
user-invocable: true
argument-hint: "[init | design-system | screen <descrição> | edit <tela> <mudança> | variants <tela> | pull [tela]] "
license: Apache 2.0
---

You drive Google Stitch (via the `mcp__stitch__*` tools) to design the UI for **Kash — Controle Financeiro**, a personal finance / expense-tracking app. Your job is to keep one Stitch project consistent, produce screens that match a single design system, and land the generated frontend code in this repo.

## Prerequisites

- The `stitch` MCP server must be connected (`claude mcp list` shows it). If tools `mcp__stitch__*` are missing, stop and tell the user to run `claude mcp add stitch --transport http --header "X-Goog-Api-Key: <KEY>" https://stitch.googleapis.com/mcp` with a **valid, non-leaked** key.
- Never print or commit the API key. If you see one in a prompt or file, warn the user to rotate it.

## State file

Track the Stitch project across sessions in `.claude/skills/stitch/state.json` (gitignore it if it should stay local):

```json
{ "projectId": "", "designSystemAssetId": "", "screens": { "dashboard": "<screenId>", "add-transaction": "<screenId>" } }
```

Always read this file first. If `projectId` is empty, run the `init` flow.

## Flows

### init
1. `mcp__stitch__list_projects` — if a project titled "Kash" exists, reuse its id.
2. Otherwise `mcp__stitch__create_project` with `title: "Kash — Controle Financeiro"`.
3. Save `projectId` to state.json.
4. Immediately run the `design-system` flow.

### design-system
Kash's baseline (adjust only if the user asks):
- `colorMode`: `LIGHT` (plan a `DARK` variant later)
- `customColor` / `overridePrimaryColor`: `#00C853` (verde "dinheiro"); secondary `#1B1B1F`
- `headlineFont`: `SPACE_GROTESK`; `bodyFont`: `INTER`
- `roundness`: `ROUND_TWELVE`
- `designMd`: short markdown — "Finance app. Dense but calm. Tabular numbers, right-aligned currency (R$), clear positive/negative color coding (green/red), generous whitespace on mobile. Accessibility AA."

Steps:
1. `mcp__stitch__create_design_system` with `projectId` + the `designSystem` object above.
2. `mcp__stitch__update_design_system` right after (required to apply + render it).
3. Save the returned asset id as `designSystemAssetId` in state.json.

### screen <descrição>
1. Ensure `projectId` and `designSystemAssetId` are set (run `init` first if not).
2. `mcp__stitch__generate_screen_from_text` with:
   - `projectId`
   - `designSystem`: `assets/<designSystemAssetId>` (always pass it — consistency)
   - `deviceType`: `MOBILE` unless the user says desktop/tablet
   - `modelId`: `GEMINI_3_1_PRO` for final screens, `GEMINI_3_FLASH` for quick drafts
   - `prompt`: expand the user's description with concrete finance content — real BRL amounts, category names (Alimentação, Transporte, Moradia...), dates, an empty state, and states for loading/error where relevant.
3. This takes minutes. **Do not retry.** If it times out, poll `mcp__stitch__get_screen` every ~30s, up to 10 times.
4. If `output_components` returns suggestions, surface them to the user; on acceptance, call `generate_screen_from_text` again with the accepted suggestion text.
5. Save the new screen id in state.json under a slug.

Kash screen backlog (generate on request): `onboarding`, `dashboard` (saldo + gráfico + últimas transações), `add-transaction`, `transactions-list` (com filtros), `transaction-detail`, `categories`, `budgets`, `reports` (mensal), `accounts`, `settings`, `auth` (login/signup).

### edit <tela> <mudança>
`mcp__stitch__edit_screens` with `projectId`, `selectedScreenIds: [<id from state>]`, and a precise `prompt`. Same "don't retry" rule.

### variants <tela>
`mcp__stitch__generate_variants` for the given screen id when the user wants options to choose from.

### pull [tela]
1. `mcp__stitch__get_screen` (or `list_screens`) to fetch generated frontend code.
2. Write it under `src/screens/<slug>/` (or wherever the repo's frontend lives once it exists), matching the project's stack. If there's no frontend yet, put raw output in `design/stitch/<slug>/` and tell the user it's a reference, not wired-up code.
3. Never overwrite hand-edited files without diffing first.

## Handoff to other skills

- After `pull`, suggest `/impeccable audit <path>` to polish the generated UI to production craft.
- If the user is spec-driven, the screen backlog above should mirror `spec.md`; keep them in sync.

## Guardrails
- One project, one design system. Don't spawn duplicates — check `list_projects` / state.json first.
- Always pass `designSystem` to every generate call.
- Long-running calls: patience, then poll. Never fire the same generate/edit twice.
