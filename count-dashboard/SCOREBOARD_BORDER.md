# Session Tracker border

The scoreboard uses a continuous 2px yellow frame at 75% opacity, with a soft yellow glow doubled from 20% to 40% opacity. The striped pseudo-element is disabled.

`web/scoreboard-border.css` supplies the style; the pre-existing untracked `web/crypto-day-desk.css` imports it. `scoreboard-border-integration.patch` records that already-applied import without including earlier app edits.

Verified in the running browser at http://127.0.0.1:8770/crypto-day.html?strategy=day by visual inspection and computed styles for all four border edges, box shadow, and disabled stripe. No tests were added for this cosmetic change. Full notes and screenshot are in the MYM chart workspace under Charts/Analysis/1M.
