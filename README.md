# DocType

DocType is a collaborative document editor built for the Ajaia product-engineering assignment. Create or import a document, format it in the browser, and share it with another user for live editing.

[Open the live app](https://doc-type-lime.vercel.app) · [Architecture](ARCHITECTURE.md) · [AI workflow](AI_WORKFLOW.md) · [Submission](SUBMISSION.md)

## Features

- Sign in with Google or email and password. The dashboard distinguishes documents you own from documents shared with you.
- Create, rename, edit, and reopen documents. Changes save automatically. The editor supports headings, bold, italic, underline, and bulleted and numbered lists.
- Import Word (.docx), Markdown (.md), and UTF-8 plain text (.txt) files up to 1 MB. Word and Markdown imports preserve supported text formatting and structure.
- Grant another account edit access. Collaborators can type simultaneously and see each other’s cursors, typing indicators, and presence.
- Comment on a document or selected passage. Preview and restore saved checkpoints in version history. Owners can delete a document and undo the deletion for ten seconds.
- Choose a Word paper size, let text flow between pages, or insert a manual break. Download Word, Markdown, or plain text, or save a PDF through the browser print dialog.

## Review the app

1. Open the live link in two separate browser profiles and sign in with two accounts. Sign in once with the second account before sharing.
2. In the first account, create a document, rename it, and add a heading and list. Wait for **Saved**, then reopen the document to verify persistence.
3. Use **Share** to grant access to the second account’s email. Open the document under **Shared with me** in the second profile. Edit from both profiles to see changes and cursors appear.
4. Import a supported file and try **Download**. Select a passage to leave a comment, or open **Version history** to preview a checkpoint.

## Run locally

1. Install Node.js 22 or 24 and run `npm ci`.
2. For a fresh Supabase project, run these scripts in the SQL Editor in order. For an existing project, apply its pending scripts only.
   1. [schema.sql](supabase/schema.sql)
   2. [realtime.sql](supabase/realtime.sql)
   3. [cursor-broadcast.sql](supabase/cursor-broadcast.sql)
   4. [document-formats.sql](supabase/document-formats.sql)
   5. [document-activity.sql](supabase/document-activity.sql)
   6. [comment-anchors.sql](supabase/comment-anchors.sql)
3. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Create and confirm two email/password users in Supabase Auth to test sharing locally. Google sign-in also works locally when the provider is configured for your local origin.
4. Run `npm run dev` and open [http://localhost:3000](http://localhost:3000).

## Tests

```sh
npm run typecheck
npm run build
npx playwright install chromium
npm test
```

For the account-backed browser tests, set `TEST_OWNER_EMAIL`, `TEST_OWNER_PASSWORD`, `TEST_RECIPIENT_EMAIL`, and `TEST_RECIPIENT_PASSWORD` against a dedicated test project. The tests create documents. Set `TEST_BASE_URL` to run against an existing deployment.
