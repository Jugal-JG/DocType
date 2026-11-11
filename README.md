# DocType

DocType is a shared document editor. Sign in, create or import a document, format it, and give another account permission to edit.

## Run locally

1. Install Node.js 22 or newer and run `npm ci`.
2. Create a [Supabase project](https://supabase.com/dashboard). In **SQL Editor**, run [schema.sql](supabase/schema.sql), [realtime.sql](supabase/realtime.sql), [cursor-broadcast.sql](supabase/cursor-broadcast.sql), [document-formats.sql](supabase/document-formats.sql), [document-activity.sql](supabase/document-activity.sql), and [comment-anchors.sql](supabase/comment-anchors.sql) in that order. For an existing project, run only the scripts it still needs.
3. In **Authentication → Users**, create and confirm two email/password users. Use dedicated demo addresses and passwords.
4. Copy `.env.example` to `.env.local`. From the Supabase project’s **Connect** panel or API settings, copy its project URL and publishable key into the matching variables. The app uses the publishable key and each user’s session. It requires no database password or service-role key.
5. Run `npm run dev` and visit [localhost:3000](http://localhost:3000).

## Try the main workflow

1. Sign into the owner account and sign into the second account once in a separate browser profile.
2. Choose **New document** and select Word, Markdown, or plain text. Rename the document and format some text. DocType saves changes automatically.
3. Click **Share**, enter the second account’s email, and grant edit access. In the second profile, refresh **Documents** and look under **Shared with me**.
4. Open the same document in both profiles. The title bar shows the people with the document visible and highlights a viewer while they type. Edit from both profiles and watch the changes appear automatically.
5. Try **Import** with a UTF-8 `.txt`, `.md`, or `.docx` file up to 1 MB. Imports create a new editable document. Markdown and Word imports preserve basic formatting such as paragraphs, headings, lists, bold, and italic where supported. Images and complex Word layout are omitted.
6. Word documents flow onto new sheets based on the selected paper size. Use **Insert page break** to force a new sheet at a particular position. **Download** offers Word, Markdown, plain text, and **Save as PDF**, which opens the browser’s print dialog.
7. **Comments** and **Version history** open beside the editor. Select text to attach it to a comment, then click a comment’s quoted passage to find and highlight it. Owners can delete documents and undo the action for ten seconds.

## Google sign-in

1. In Supabase **Authentication → Sign In / Providers → Google**, copy the callback URL shown on the Google provider panel.
2. In Google Cloud **Google Auth Platform**, configure **Branding** with the app name DocType and your support and contact emails. Under **Audience**, choose **External** for personal Google accounts. Under **Data Access**, use the basic identity scopes `openid`, `email`, and `profile`. Google exempts these basic sign-in scopes from the Testing test-user list requirement.
3. Under **Clients**, choose **Create client → Web application**. Add your app origins under **Authorized JavaScript origins**, such as `http://localhost:3000` and your deployed app’s HTTPS origin. Under **Authorized redirect URIs**, paste the Supabase callback URL from step 1. Copy the generated Client ID and Client Secret.
4. Back in Supabase, enable Google, enter the Client ID and Client Secret, and save. In **Authentication → URL Configuration**, set **Site URL** to the production app URL, or your local app URL if you only run locally. Add the exact app root URLs with trailing slashes under **Redirect URLs**, such as `http://localhost:3000/` and `https://your-app.vercel.app/`.
5. If new Google users should be able to create an account, enable new user sign-ups in Supabase Auth. Existing demo email/password sign-ins remain available. Start DocType and choose **Continue with Google**. Keep the Google Client Secret in the Supabase provider settings.

## Verify

```sh
npm run build
npm run typecheck
npx playwright install chromium
npm test
```

Set `TEST_OWNER_EMAIL`, `TEST_OWNER_PASSWORD`, `TEST_RECIPIENT_EMAIL`, and `TEST_RECIPIENT_PASSWORD` in your shell or `.env.local` to enable the full sharing and import tests. Use a dedicated test project as these tests create documents. Set `TEST_BASE_URL` to run the same suite against a deployment. The theme tests also run without Supabase credentials.

## Deploy on Vercel

1. From the DocType folder, run `npx vercel login` and `npx vercel link`. Choose your Vercel account and create a project. The CLI can deploy directly from this folder.
2. Open the project in [Vercel](https://vercel.com/). In **Settings → Environment Variables**, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` using the values from `.env.local`. Select **Production** for both. Add **Preview** too if you plan to deploy a preview.
3. Apply any pending Supabase scripts from the setup section above. Run `npx vercel --prod` and open the production domain printed by the CLI.
4. Test email/password sign-in, editing, and sharing on the production domain. Open the same link in a private browser to verify that reviewers reach the DocType sign-in screen.
5. Use the live URL when configuring Google sign-in. Give reviewers the live URL and demo account credentials in the private submission folder.
