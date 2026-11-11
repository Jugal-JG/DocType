# DocType architecture

The [production app](https://doc-type-lime.vercel.app) runs on Vercel. Next.js serves the React interface and the authenticated file import endpoint. Supabase provides authentication, PostgreSQL storage, and Realtime.

## Identity and permissions

Supabase Auth handles Google OAuth and email/password sign-in. The browser uses a PKCE flow for Google sign-in, and Supabase holds the Google client secret. The app uses a publishable Supabase key and the signed-in user’s session.

PostgreSQL row-level security restricts document reads and writes to the owner and people with an edit grant. The owner grants access by email to a user who has already signed in. The database records grants by user ID. The same document access rules protect comments, history, and private Realtime channels.

## Editing and persistence

Tiptap provides the rich-text editor. Yjs merges simultaneous content edits. The app saves the merged state and structured document content in PostgreSQL. A revision check detects when another editor saved first. The client fetches the newer state, merges it, and retries.

Supabase Postgres Changes delivers saved revisions to collaborators. Presence tracks who is in the document. Broadcast carries cursor positions and typing indicators. Comment anchors use Yjs-relative positions so highlights can follow text as nearby content changes. History groups saves into minute-level checkpoints and preserves the current saved revision before a restore. Owner deletion hides the document immediately and permits undo for ten seconds.

## Files and scope

The import endpoint validates the upload and converts it to text or sanitized HTML. The browser turns the result into editable content. Word downloads preserve supported formatting, selected paper dimensions, and manual page breaks. The browser paginates the on-screen editor and handles PDF printing.

The assignment prioritized a complete workflow from sign-in through editing, sharing, and reopening. Current limits include complex Word layout and images, offline draft recovery, and exact page-for-page parity with Word. With another two to four hours, I would add offline recovery and expand end-to-end coverage of sharing, history, and Google sign-in.
