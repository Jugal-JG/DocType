# Architecture

The browser runs a Next.js and React interface. Tiptap turns formatted text into JSON. Supabase Auth issues a session, and the browser uses that session to read or write documents through Supabase. Postgres stores the document JSON and access grants.

Postgres row-level security limits reads and edits to the owner and the recipients of an edit grant. Sharing runs through a database function that verifies ownership, resolves the email of an account that has signed in, and inserts a grant. The document API permits updates to title, content, and collaboration state. The private Supabase Presence channel checks access against the same document policies.

Yjs merges concurrent rich-text changes. Editors automatically save the shared state with a revision check. If another user saved first, the editor loads and merges their changes, then retries. Supabase Postgres Changes distributes the saved state. Each older document is initialized from its saved JSON once, with the same revision check preventing two editors from initializing it independently. Titles use the latest saved value and URLs use document IDs.

The authenticated Next.js import endpoint converts text, Markdown, or Word into text or sanitized HTML. The browser converts that result into the same editor JSON used for manually written documents. Supabase stores the converted document. Vercel hosts the interface and import endpoint.

Presence lists users with the document visible and deduplicates accounts across sessions. Typing indicators expire after a short pause. Google sign-in and preserving complex Word layouts are future enhancements.
