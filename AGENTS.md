# AGENTS.md instructions for /home/jcs/projects/current/goat_accounting

<INSTRUCTIONS>
## Approved estimator architecture

The approved target architecture is SvelteKit 3 on Cloudflare Workers with static assets, using `@sveltejs/adapter-cloudflare`. `wrangler.toml` is the deployment-configuration authority. This is the target for the estimator migration, not evidence that the production site has already migrated.

At PR 0's base commit (`8c4e3e7923d516e2c6897dca837ea8020b4e9fac`), this repository still declared SvelteKit 2 and `wrangler.toml` still contained `pages_build_output_dir`. That repository state does not establish the deployed site's runtime. Do not claim a production migration without deployment evidence for the relevant release.

Use Supabase PostgreSQL for persistent application data and Supabase Auth for staff/admin identity. Keep schema changes in version-controlled Supabase migrations. Do not create database schemas outside the approved Supabase design or assume an unidentified Supabase project is the Goat environment.

Estimator pricing must be pure, deterministic, typed and data-driven. Keep pricing models immutable and versioned. Save each estimate with the pricing-model and engine versions used to calculate it so later changes cannot alter historical results. Supabase is authoritative for estimator data. Do not use Cloudflare KV as estimator persistence or as an authority for prices or estimates. Use KV only for a specifically justified cache or ephemeral purpose allowed by the technical specification.

Follow the approved specifications and roadmap:
- `docs/product/GOAT_ACCOUNTING_ESTIMATOR_PRODUCT_SPEC_v0.1.0.md`
- `docs/architecture/GOAT_ACCOUNTING_ESTIMATOR_TECH_SPEC_v0.1.0.md`
- `docs/superpowers/plans/2026-11-03-goat-accounting-estimator.md`
- `docs/superpowers/plans/2026-11-03-goat-accounting-estimator-parallel-roadmap.md`

All styling must use Tailwind CSS utility classes. Do not generate backend database schemas outside the approved Supabase migration workflow.

## Skills
A skill is a set of local instructions to follow that is stored in a `SKILL.md` file. Below is the list of skills that can be used. Each entry includes a name, description, and file path so you can open the source for full instructions when using a specific skill.
### Available skills
- skill-creator: Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Codex's capabilities with specialized knowledge, workflows, or tool integrations. (file: /home/jcs/.codex/skills/.system/skill-creator/SKILL.md)
- skill-installer: Install Codex skills into $CODEX_HOME/skills from a curated list or a GitHub repo path. Use when a user asks to list installable skills, install a curated skill, or install a skill from another repo (including private repos). (file: /home/jcs/.codex/skills/.system/skill-installer/SKILL.md)
### How to use skills
- Discovery: The list above is the skills available in this session (name + description + file path). Skill bodies live on disk at the listed paths.
- Trigger rules: If the user names a skill (with `$SkillName` or plain text) OR the task clearly matches a skill's description shown above, you must use that skill for that turn. Multiple mentions mean use them all. Do not carry skills across turns unless re-mentioned.
- Missing/blocked: If a named skill isn't in the list or the path can't be read, say so briefly and continue with the best fallback.
- How to use a skill (progressive disclosure):
  1) After deciding to use a skill, open its `SKILL.md`. Read only enough to follow the workflow.
  2) When `SKILL.md` references relative paths (e.g., `scripts/foo.py`), resolve them relative to the skill directory listed above first, and only consider other paths if needed.
  3) If `SKILL.md` points to extra folders such as `references/`, load only the specific files needed for the request; don't bulk-load everything.
  4) If `scripts/` exist, prefer running or patching them instead of retyping large code blocks.
  5) If `assets/` or templates exist, reuse them instead of recreating from scratch.
- Coordination and sequencing:
  - If multiple skills apply, choose the minimal set that covers the request and state the order you'll use them.
  - Announce which skill(s) you're using and why (one short line). If you skip an obvious skill, say why.
- Context hygiene:
  - Keep context small: summarize long sections instead of pasting them; only load extra files when needed.
  - Avoid deep reference-chasing: prefer opening only files directly linked from `SKILL.md` unless you're blocked.
  - When variants exist (frameworks, providers, domains), pick only the relevant reference file(s) and note that choice.
- Safety and fallback: If a skill can't be applied cleanly (missing files, unclear instructions), state the issue, pick the next-best approach, and continue.
</INSTRUCTIONS>
