# LearnHub Premium

A responsive HTML/CSS/JavaScript learning dashboard with Supabase authentication and cloud tasks, a teacher assignment workspace, quiz-result saving, and a server-side AI study assistant endpoint.

## Project structure

```text
LearnHub_Premium/
├── index.html
├── style.css
├── app.js
├── config.js
├── teacher.html          # optional standalone teacher entry page
├── teacher.js            # optional teacher entry redirect
├── api/
│   └── study-assistant.js
├── supabase/
│   └── schema.sql
├── package.json
├── vercel.json
└── .env.example
```

## 1. Set up Supabase

1. Create a project at https://supabase.com.
2. Open **SQL Editor**, paste the contents of `supabase/schema.sql`, and run it.
3. In **Project Settings → API**, copy the Project URL and publishable key (or legacy anon key).
4. Put them into `config.js` as `SUPABASE_URL` and `SUPABASE_ANON_KEY`. These are browser-facing values; never put the service-role key in `config.js`.
5. In **Authentication → URL Configuration**, add your local and production site URLs to the allowed redirect URLs. Configure email confirmation according to your needs.
6. Create an account through LearnHub. The database trigger always creates it with the `student` role, regardless of a role requested by the browser.

### Approve a teacher

A user cannot grant themselves teacher permissions. In Supabase SQL Editor, find the approved user's ID under **Authentication → Users**, then run:

```sql
update public.profiles
set role = 'teacher'
where id = 'REPLACE-WITH-APPROVED-AUTH-USER-UUID';
```

Only promote trusted staff. Teacher approval is a manual administrative action in this starter.

## 2. Run locally

This project uses a Vercel serverless endpoint for AI, so use a local web server rather than opening `index.html` with `file://`.

1. Install Node.js 18 or newer.
2. Open this folder in a terminal.
3. Run `npm install`.
4. Copy `.env.example` to `.env.local` and fill in the values. Keep `.env.local` private and out of source control.
5. Run `npm run start` and open the local URL Vercel prints.

If you only want to preview the interface, VS Code Live Server can serve the static page. Authentication/cloud sync will work after Supabase is configured, but `/api/study-assistant` needs the Vercel dev server.

## 3. Deploy to Vercel

1. Push this folder to a private or public Git repository (never commit `.env.local`).
2. Import the repository into https://vercel.com.
3. Add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `OPENAI_API_KEY` under Project Settings → Environment Variables. Optionally set `OPENAI_MODEL`.
4. Deploy and add the deployed URL to Supabase Auth's allowed redirect URLs.
5. Test sign-up, sign-in, task create/update/delete, quiz-result saving, teacher role permissions, and AI response in the deployed site.

The AI provider key is read only by `api/study-assistant.js`; it must never be added to `config.js` or any frontend JavaScript.

## Security notes

- Supabase Row Level Security is enabled on every application table.
- Students can only read and manage their own tasks and quiz results.
- Profiles are created as `student`; role promotion must be performed by a trusted project administrator.
- Teacher assignment policies restrict management to the assignment's teacher (or an admin).
- A production school deployment should add a reviewed class-enrolment flow, account recovery, rate limiting, audit logging, privacy notices, and tests with separate student/teacher accounts before real student records are used.
- Do not store sensitive student information unless you have the appropriate consent and data-handling process.

## Current feature scope

- Responsive dashboard, subject cards, task management, progress, dark mode, and a five-question practice quiz.
- Supabase email/password sign-in and registration, student profile display, and cloud task persistence.
- Teacher-only assignment creation/listing and submission count placeholder/schema foundation.
- Server-side AI study assistant with authenticated requests and private API key handling.

The database includes classes, class membership, assignments, and submissions tables with RLS. The included interface is a starter foundation, not a fully audited production LMS: class joining, student assignment submission screens, grading UI, email flows, and automated integration tests should be added before a school-wide rollout.
