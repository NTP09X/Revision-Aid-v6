# ReviseFlow v6

Includes:
- dark / light mode
- login + sync
- calendar
- subject pages
- RAG confidence tracking
- English quotes, themes and characters

## Simple setup
1. Create a public GitHub repo.
2. Upload every file from this folder to the repo root.
3. Turn on GitHub Pages:
   - Settings
   - Pages
   - Deploy from a branch
   - main
   - /(root)
4. In Supabase, run `supabase_progress_setup.sql`
5. In Supabase:
   - Authentication -> Providers -> enable Email
   - Authentication -> URL Configuration -> set Site URL to your GitHub Pages URL
6. Open your GitHub Pages link and sign in.

## Easy updates
- timetable: schedule.json
- subject pages: subjects.json
- links: resources.json
- settings: settings.json
- design: styles.css
- app logic: app.js
