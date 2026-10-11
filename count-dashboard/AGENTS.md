# Count Desk development

- Follow the repository's Trading Research guidance.
- Use the installed `typesafe-ai` skill when developing Taper's typed decision integration. Read `~/.agents/skills/typesafe-ai/SKILL.md` and the current TypeSafe API documentation before changing the contract.
- Taper's active decision provider is TypeSafe Jev. Keep `TYPESAFE_API_KEY` server-side in the private `.env` or server environment; never put it in browser bundles, logs or Git.
- Preserve Wave Court calculations, source/cutoff evidence, session histories, risk gates and human-confirmed paper tickets when changing the AI provider.
