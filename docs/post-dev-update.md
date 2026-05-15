# Dev Update: Encryption Receipts, Mobile App & Deep Linking

Big week. Here's what's been shipping:

### 🔐 Encryption: Open-Sourced & Audited

We open-sourced our entire crypto module under the MIT license. You can now inspect every line of code that encrypts and decrypts your content:

**https://github.com/TribesSocialCoOp/tribes-encryption-audit**

But we went further. We ran a 30-vector internal red-team test against our own encryption. We tried to read private content from the server, database, API, network layer, and even as a rogue admin. Every vector failed. The server stores only ciphertext. We published the full results so you don't have to trust us. You can verify.

We also built an SRI (Subresource Integrity) pipeline that hashes the production crypto code on every deploy and commits those hashes to the public repo. This means you can verify in your browser's DevTools that the crypto code running on your device matches the open-source exactly. Trust-by-math, not trust-by-promise.

### 📱 Native Mobile App (Coming Soon)

The Tribes mobile app is in final preparation for App Store submission. It's a native iOS shell (Capacitor) wrapping our web app, which means you get:

- **Push notifications** for new posts, bond requests, and tribe activity
- **NFC tap-to-bond**: tap phones together to create an encrypted bond in person
- **QR code bonding**: scan a code to connect when NFC isn't available
- **Native share sheet**: share posts directly from the iOS share menu

We're finalizing screenshots and the review submission this week. Android is on the roadmap after iOS launches.

### 🔗 Deep Linking & SEO

Every post, tribe, and profile now has a shareable permalink. Links shared on social media unfurl with proper Open Graph previews: title, description, and a branded image. Private/encrypted content is protected. Link previews never leak private content, they just show a "This content is encrypted" placeholder.

We also added universal link support so that clicking a tribes.app link on your phone opens directly in the native app (once installed) instead of the browser.

### 🛡️ UI Hardening

A bunch of quality-of-life fixes that make the platform feel more solid:

- **Swipe gestures for the sidebar** on mobile: swipe from the left edge to open the nav, swipe left on the panel to close it. No buttons needed.
- **Mobile-friendly reply**: replies now open as a bottom sheet instead of an inline input that gets buried under the keyboard
- **Confirmation dialogs** everywhere: no more accidental deletes. Every destructive action now gets a proper modal confirmation
- **Bond management cleanup**: chat moved to the three-dot menu so tapping a bond row doesn't accidentally navigate you away
- **Vault backup/restore**: your encryption keys can now be backed up and restored across devices without losing access to your history

### What's Next

- App Store launch (pending Apple review)
- Android build
- Organization memberships and event bonds

As always, report bugs and feature requests right here in this tribe. We're building this together.
