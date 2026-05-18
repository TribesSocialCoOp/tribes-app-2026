# What Shipped This Week: Your Voice, Your URLs, and Easier Bonding

Big update. This one's less about encryption plumbing and more about making Tribes feel like *yours*. Here's what landed today.

---

## 🏛️ Co-Op Governance Is Live

This is the one I'm most excited about.

If you've been here since the beginning, you know the thesis: Tribes is a co-op, not a startup. That means you're not just a user, you're a stakeholder. Starting today, that's not just philosophy. It's infrastructure.

**What you can do now:**

- **Browse and vote on platform proposals.** Head to [Governance](/voting) to see what's on the table. If you're a paid co-op member, you can vote.
- **Submit proposals if you're a tribe founder.** You've invested in building a community here. You get a voice in how the platform evolves. Any founder, even of a private tribe, can submit a proposal.
- **Debate proposals with threaded replies.** Each proposal has its own discussion thread with nested comments. Reactions are intentionally limited to 👍 😐 👎 to keep signal high.

We put a legal framework around this too: "Tribes reserves the right to refuse any proposal, but is committed to giving a reason." Transparency goes both directions.

**Coming up:** Additional voting gates (account age, reputation) will activate after the founding phase. Right now, if you're a paid member, you're in.

### First Up: The NSFW Content Policy

The first real proposal going to vote is our NSFW content policy. This isn't a top-down mandate, it's a draft for the co-op to debate and shape. The proposal covers edge-responsibility moderation, privacy-first age gating, and how encrypted content interacts with content policies. It's a hard problem and we want your input before it becomes policy.

---

## 🤝 Bonding Just Got Easier

We heard you. The old invite flow was too complicated and the 5-minute expiry was absurd. You'd generate a link, text it to someone, and by the time they opened it the invite had expired.

**What changed:**

- **Invite links now last a full year.** No more racing against the clock. Send it when it's convenient, they'll use it when they're ready.
- **Search and bond directly.** The invite dialog now lets you search for people who are already on Tribes and send them a bond request, no link needed.
- **Share with the system dialog.** On mobile, tapping "Share" brings up your native share sheet: text, WhatsApp, email, whatever you use. One tap.

The old flow assumed everyone was in the same room. The new flow works for the friend you haven't talked to in six months but want to reconnect with.

---

## 🔗 Clean URLs Everywhere

You might have noticed your profile URL changed. That's intentional.

Every user and tribe now has a human-readable URL:

| Before | After |
|--------|-------|
| `/profile/ebdee0d3-7ceb-4496...` | `/u/dustin-moore` |
| `/tribes/a5b2c3d4-e5f6-7890...` | `/t/mini-owners-in-the-north-of-england` |

All 112 existing users were backfilled automatically. Old links still work, they redirect to the new clean URL. No bookmarks broken. Post URLs got the same treatment, so when you share a link to a post it looks like `/t/tribes-app-development/your-post-title` instead of a wall of random characters.

**Why this matters:** Shareable links are how people discover Tribes. A URL that looks like a database dump doesn't exactly scream "come check this out." Now when you share a post or your profile, the link is clean and readable.

For those keeping track: this is the same slug system we used for tribes, now extended to users, posts, and profiles. We also opened tribe pages to guests. If a tribe is public, anyone can browse it without logging in. Private tribes stay private. This is how [nate's feature request](https://tribes.app/t/tribes-app-development/feature-request-a-direct-link-to-a-tribe-post-currently-in) about direct post links comes full circle: clean, shareable permalinks for everything.

---

## ✏️ Comment Editing Fixed

Small but annoying: you couldn't edit your comments from certain pages. The tribe-specific comment card was missing the Edit option. Fixed. You can now edit your comments from anywhere: post detail, tribe page, feed.

---

## 🔧 Under the Hood

We hardened our deploy pipeline this cycle. Database migrations now fail the deploy if anything goes wrong (instead of deploying code that expects schema changes that didn't land). We also added a rollback script that restores the previous build in about 10 seconds if something goes sideways. You shouldn't notice this, and that's the point.

We also added a database-level constraint on governance voting to enforce one-vote-per-user at the database layer, not just the application layer. Belt and suspenders.

---

## What's Next

- **The NSFW proposal goes to vote.** We want founding members weighing in.
- Mobile polish continues. We're squashing touch-target and keyboard issues on iOS.
- Encryption key sync improvements based on the [multi-device fixes we shipped last week](https://tribes.app/t/tribes-app-development/dev-update-multi-device-key-sync-and-the-split-brain-fix).
- We're closing in on our **100th user milestone** 👀

As always, bugs, ideas, and hot takes go right here. This is a co-op. We're building it together.

---

**Tags:** `#devupdate` `#governance` `#bonds` `#ux`
