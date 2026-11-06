SMART MONEY SKILL ACADEMY INTEGRATION
======================================

Files:
- skill-academy.html: Student-facing learning page.
- skill-academy-admin.html: Admin manager for courses, lessons/videos and meeting links.
- supabase/migrations/202611060001_skill_academy.sql: database tables and RLS policies.

SETUP REQUIRED BEFORE USE
1. Run the SQL migration in Supabase SQL Editor.
2. Confirm the configured admin email in the SQL and admin page matches the existing Smart Money admin Auth email.
3. Deploy the repository branch to Vercel.
4. Student page: /skill-academy.html
5. Admin manager: /skill-academy-admin.html (login with the existing Smart Money admin Auth account).
6. Add a navigation link from the main admin panel to /skill-academy-admin.html and a student dashboard link to /skill-academy.html.

ADMIN FEATURES
- Create/edit/delete courses and categories.
- Add/edit/delete video lessons, articles, assignments and resource links.
- Publish/unpublish courses and lessons.
- Schedule meetings by pasting Google Meet, Zoom or Jitsi meeting URLs; choose date/time and publish.
- Student page embeds YouTube/Vimeo videos where possible and opens meeting links in a new tab.

IMPORTANT
- This branch adds the module files; it does not alter existing payment, referral or package logic.
- The SQL must be applied in Supabase before the pages can load data.
- Meeting hosting is not included; the admin provides a meeting URL from the meeting service being used.
- Admin email restriction is also enforced by database RLS. Do not rely only on hiding the admin page.
- No service-role key is used in browser code.
- Students can read only published learning content. Admin writes are restricted by RLS.
