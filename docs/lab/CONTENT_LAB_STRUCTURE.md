# WanWan Lab Content Structure (MVP)

## Goals
- Keep product UI code, content source files, and scoring logic separated.
- Allow fast AI-assisted content production without polluting `app/` routes.
- Support a future manifest build pipeline while keeping MVP manual and readable.

## Directory Boundaries
- `app/`: UI routes and API adapters only.
- `content-lab/`: content source files, prompts, manifests, generated JSON.
- `services/`: scoring/session/summary logic only.
- `docs/lab/`: schema, telemetry, and shadow-mode reporting docs.

## Content Source Layout
- `content-lab/stories/<series_id>/ep-0001.md`
- `content-lab/cases/<case_id>/v001.yaml`
- `content-lab/daily-logs/YYYY/YYYY-MM-DD-<slug>.md`
- `content-lab/pressure-events/evt-YYYYMMDD-<slug>.yaml`

## Generated Output Layout
- `content-lab/generated/index.json`
- `content-lab/generated/stories/<series_id>/<episode_id>.json`
- `content-lab/generated/cases/<case_id>.json`
- `content-lab/generated/pressure-events/<event_id>.json`

## Story Frontmatter Required Keys
- `id`
- `series_id`
- `title`
- `lang`
- `status`
- `release_at`
- `teaser_only`
- `canon_tags`
- `quiz`

## MVP Build Workflow
1. Author source files under `content-lab/`.
2. Run `node scripts/content/build_lab_manifest.js` to validate story naming/frontmatter.
3. Update `content-lab/generated/*.json` manually (MVP).
4. Consume generated JSON from `app/lab/*` pages and `services/behavior-lab-engine`.

## Future Upgrade (Not in MVP)
- Add YAML/frontmatter parsing dependencies.
- Auto-compile Markdown/YAML to generated JSON.
- Auto-generate manifest index and release bundles.
