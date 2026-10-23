# Floxovo v3 setup

This guide takes about 30 to 45 minutes. Everything here is free to start.

Order: 1. Supabase, 2. config.js, 3. Google login (optional), 4. Vercel deploy, 5. test.

---

## 1. Create the Supabase project

1. Sign up at supabase.com (free) and click **New project**.
2. Choose a name, a strong database password (save it somewhere safe), and the region closest to your users.
3. Wait about two minutes for it to finish setting up.
4. Open **SQL Editor > New query**, paste the whole contents of `supabase/schema.sql`, and click **Run**. You should see "Success".

## 2. Connect the app to Supabase

1. In Supabase, go to **Project Settings > API**.
2. Copy the **Project URL** and the **anon public** key.
3. Open `config.js` and paste them in:

```js
window.STUDYFLOW_CONFIG = {
  SUPABASE_URL: "https://abcdxyz.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi..."
};
```

Only the **anon** key goes in this file. Never use the **service_role** key in the app. Row Level Security (set up in step 1) keeps each person's data private even though the anon key is public.

## 3. Set the sign-in URLs

1. In Supabase, go to **Authentication > URL Configuration**.
2. Set **Site URL** to your app's address, for example `https://floxovo.com`. Use `http://localhost:3000` only while testing locally.
3. Under **Redirect URLs**, add the same addresses. Add `https://*-yourname.vercel.app/**` if you use Vercel preview links.
4. Go to **Authentication > Providers > Email** and keep it enabled. For a quick test you can turn off "Confirm email", but turn it back on before launch.

Email sign-up now works. Next is Google.

## 4. Add Google sign-in (optional but recommended)

### 4a. Create a Google OAuth client

1. Go to console.cloud.google.com and sign in with a Google account.
2. Create a project: click the project picker at the top, then **New project**. Name it "Floxovo".
3. Go to **APIs & Services > OAuth consent screen**.
   - User type: **External**, then **Create**.
   - App name: Floxovo. Add your email for support and developer contact.
   - Scopes: you don't need to add any beyond the defaults (email, profile, openid).
   - Test users: add your own Google email while the app is in testing mode.
   - Save.
4. Go to **APIs & Services > Credentials > Create credentials > OAuth client ID**.
   - Application type: **Web application**.
   - Name: Floxovo web.
   - **Authorized redirect URI:** `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
     (replace `YOUR-PROJECT` with your Supabase project reference, the part before `.supabase.co` in your URL).
   - Click **Create**. Copy the **Client ID** and **Client secret**.

### 4b. Turn it on in Supabase

1. In Supabase, go to **Authentication > Providers > Google**.
2. Turn it on, paste the Client ID and Client secret, and save.

### 4c. Publish the consent screen

While the consent screen is in "Testing", only the test users you added can sign in. When you're ready for everyone, go to **OAuth consent screen** and click **Publish app**. Basic sign-in (email, profile) normally doesn't need Google's full verification, but Google may ask for more details if you request extra permissions later.

### 4d. Test it

Open the app, click **Sign in > Continue with Google**, choose your account, and you should land back in Floxovo signed in.

**Important for kids:** Google's terms require Google Accounts to be held by people 13 or older, or managed through Google Family Link. For users under 13, use email sign-up with a parent or guardian managing the account. The app asks everyone to confirm they are 13 or older or that a parent is creating the account.

## 5. Deploy on Vercel (free)

1. Put the `studyflow-v3` folder in a GitHub repository.
2. At vercel.com, click **Add New > Project** and import the repository. No build settings are needed.
3. Under **Settings > Environment Variables**, add:
   - `OPENROUTER_API_KEY`: your new OpenRouter key (create a new one at openrouter.ai/keys; the one shared in chat should be deleted).
   - `OPENROUTER_MODEL` (optional): any free model ID from openrouter.ai/models.
4. Deploy. Copy the URL Vercel gives you and put it in Supabase's **Site URL** and **Redirect URLs** (step 3).

## 6. Test checklist

- [ ] Create an account with email and confirm the email link.
- [ ] Sign in, create a study set, and check that it appears in Library.
- [ ] Sign out and back in: your set is still there.
- [ ] Open the app on your phone while signed in: the same set appears.
- [ ] Sign in with Google.
- [ ] Use "Forgot password?" and check the reset email.
- [ ] Upload a PDF and a DOCX. Each should fill the text box.
- [ ] Ask the tutor a question (needs the OpenRouter key set on Vercel).
- [ ] Delete a set. Confirm it's gone after refreshing.

## Troubleshooting

- **"Accounts aren't connected yet"**: config.js still has the placeholder values.
- **Google says "redirect_uri_mismatch"**: the redirect URI in Google must be exactly `https://YOUR-PROJECT.supabase.co/auth/v1/callback`.
- **Email link goes to localhost**: fix the Site URL in Supabase.
- **Sets don't save**: check that schema.sql ran without errors, and that you're signed in.
- **Tutor says it's not configured**: add `OPENROUTER_API_KEY` in Vercel, then redeploy.
- **PDF says no readable text**: the file is probably a scan. OCR is not included yet.

## Privacy notes before a public launch

- The app stores only the study text, generated flashcards, quiz items, and scores. Uploaded PDF and Word files are not stored; only their extracted text is.
- Add a real privacy policy and terms page before sharing widely, and have them reviewed. Morocco's Law 09-08 and, for US users, COPPA apply to collecting data about children.
- Supabase's free tier is fine for testing. Check its limits before launch.
