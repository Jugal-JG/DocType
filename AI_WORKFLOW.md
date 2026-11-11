# AI workflow

I used OpenAI Codex to break down the assignment, compare implementation options, build the editor and Supabase integration, and write tests. It sped up scaffolding, SQL migrations, import/export handling, and troubleshooting browser behavior.

I revised Codex’s initial proposal for view-only sharing and plain-text imports to support editable sharing and Word and Markdown imports. When per-keystroke Presence updates caused the live connection to drop, I moved cursor and typing traffic to Broadcast and kept Presence for membership. I also replaced a page-break label with visible sheets and added automatic pagination based on the selected paper size.

Verification included TypeScript checks, a production build, automated tests for concurrent edit merging and import/export, and Chromium checks for responsive layout, pagination, and comment highlighting. A local PostgreSQL check exercised access permissions, version retention, and undo expiry. Some browser checks use mocked Supabase responses. The account-backed sharing and import tests require test credentials.
