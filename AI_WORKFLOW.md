# AI workflow

Codex helped interpret the assignment, choose a scope, and implement the editor, database schema, import flow, and browser tests. The initial proposal used view-only sharing and text-only import. The project direction changed to editable sharing and support for Markdown and Word after review.

The implementation uses database access policies with the signed-in user’s session, which removed the need for a server admin key from the initial architecture. Live editing uses Yjs to merge simultaneous changes and database revision checks to protect saves.

Verification included a production build, TypeScript checks, automated conversion checks for all three formats, and browser checks of the sign-in screen in desktop light and mobile dark modes. See [SUBMISSION.md](SUBMISSION.md) for the remaining live checks.
