# Dev Update: Your Wall, Pinning Posts, and a Security Fix

Another build week. Here's what shipped:

### 🧱 My Wall Is Live

Your Wall is now your living profile. Think MySpace, but encrypted.

- **Bio and Given Name** edit inline with autosave. No save button, no page reload
- **"Now Playing" widget** embeds Spotify, YouTube, SoundCloud, or any oEmbed URL right on your Wall
- **Customize your look** with cover photos, gradient themes, and layout options
- **Public profile parity**: everything on your Wall is mirrored on your public profile at `/profile/[you]`, so visitors see the same thing

Your Wall replaces the old separate "Profile" and "Settings" identity sections. One place to be you.

### 📌 Pin to Wall (Encrypted → Public)

You can now pin encrypted posts to your public Wall. Here's how it works:

1. Find a Journal or encrypted post you wrote
2. Click **"Pin to Wall"**
3. A confirmation dialog shows you the decrypted preview and explains: *"This will create a public copy on your Wall. The original stays encrypted."*
4. Confirm, and a plaintext copy is created on your Wall with a "Shared from Journal" badge

**What's happening under the hood:** The original encrypted post is untouched. A new plaintext copy is created in your Journal ring with `pinnedToWall: true` and a link back to the original via `originalPostId`. Your encryption is never weakened. The clone is a deliberate, user-confirmed public copy.

**Security guard:** You can only clone a post once. The server blocks duplicate clones, so a malicious client can't flood your Wall with copies of the same encrypted post.

### 🔗 Profile Links Everywhere

Every author name in posts, replies, tribe feeds, and the intercom now links to that person's public profile. Previously this was inconsistent (some linked, some didn't). Now it's uniform.

### 🌙 Dark Mode: No More Flash

If you use dark mode and open a post in a new tab, you may have noticed a white flash before the theme kicked in. Fixed. The dark mode script now runs in `<head>` before the page paints, so the theme is applied before you see anything.

### 🔧 Under the Hood

A batch of type-safety and integration fixes that don't change what you see but make the build cleaner:

- **Mobile reply dialog** on post detail pages was silently broken (wrong component interface). Fixed. Replies now save correctly from the bottom sheet.
- Fixed broken import paths on the Wall page that would have caused build failures.
- Repaired a structural JSX bug in the profile page that broke rendering.
- Tightened type contracts across 4 components to eliminate `tsc` errors.

### What's Next

- Fresh dev update on encryption keys published today. Check [Your Encryption Keys: What They Are and What to Do](dev-post-your-encryption-keys.md) if you've ever been confused by the amber or blue banners
- Inline image improvements (image grids, alt text)
- Continued mobile polish

As always, report bugs and feature requests right here. We're building this together.
