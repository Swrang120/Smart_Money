# Smart Money Social — Standalone Preview

This folder is an isolated, mobile-first social community prototype. It is intentionally separate from the live Smart Money user experience.

## Open the preview
Open `index.html` in a browser, or use the hosting provider's preview deployment for branch `preview/smart-money-social` and visit `/social-preview/`.

## Included interactions
- Responsive mobile and desktop feed
- Demo creator profiles and stories
- Create text, image, and video posts
- Like / unlike, comment, share, save
- Follow / unfollow creators
- For You, Following, Trending, Latest feeds
- Explore search and hashtag discovery
- Notifications UI
- Edit/delete own posts, report posts, and a demo moderation panel
- Profile editing and browser-local persistence

## Preview-only boundary
- No Smart Money login, Supabase, payments, packages, commission, withdrawals, or admin credentials are connected.
- Data is stored in the current browser's localStorage. Media is stored as browser data URLs and limited to 8 MB per file (profile photo 3 MB).
- This is suitable for UI/interaction testing on one browser/device. It is **not** a multi-user production social network: actions are not synced between devices or users.
- Real multi-user functionality requires a separate backend integration, authenticated user identity, database tables, private media storage, server-side authorization/RLS, moderation workflows, and security testing. Do not connect it to production until those are implemented and tested.

## Reset preview data
Clear site data/localStorage for the preview origin, or run `localStorage.removeItem('sm_social_preview_v1')` in the browser console and reload.
