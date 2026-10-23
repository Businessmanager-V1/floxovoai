# Floxovo v3

A kid-friendly study app: upload PDFs, Word files, or notes, then study with flashcards (spaced repetition), quizzes, notes, and an AI tutor. Progress syncs across devices when you sign in.

## Files
- `index.html`: page structure
- `styles.css`: colors, animations, light and dark themes (follows the device)
- `config.js`: your Supabase URL and anon key (safe to be public)
- `app.js`: all app logic
- `api/tutor.js`: server function for the AI tutor (keeps your OpenRouter key secret)
- `supabase/schema.sql`: database tables and privacy rules
- `SETUP.md`: step-by-step setup, including Google login and Vercel deployment

## Features
- Email sign-up and sign-in, password reset, and Google sign-in
- Guest mode: everything works without an account, saved on the device
- Upload PDF, DOCX, TXT, and MD files (up to 10 MB), read entirely in the browser
- Flashcards with a flip animation and Leitner boxes (missed cards come back sooner)
- Fill-in-the-blank quiz with instant feedback
- Notes built from each section of your text
- Library of study sets, synced to your account
- AI tutor that gives hints first and keeps answers short
- Progress dashboard across all sets
- Light and dark themes that follow your device, with a manual toggle
- Animations that turn off for people who prefer reduced motion

## Quick start
1. Follow `SETUP.md` steps 1 and 2 to connect Supabase.
2. Open `index.html` in a browser (or deploy to Vercel for the tutor and Google sign-in).

## Known limits
- Flashcards and quizzes use simple rules, not AI. The tutor is the only AI feature so far.
- Scanned PDFs (pictures of pages) aren't read yet.
- Public launch needs a privacy policy, terms, and a review for children's data.
