# Dev Update: Ternary Governance UX & Admin Voting is Live!

We've just pushed a major update to **Co-Op Governance** to fully support ternary (3-option) voting frameworks (such as platform-wide NSFW policy proposals). 

Here is what's new and how it works:

---

### 🗳️ Ternary Governance (Support, Revise, Oppose)

Rather than forcing complex policy drafts into a raw Binary (Yes/No) box, proposals can now declare a three-option framework:
1. **Support/Adopt** (Green segment)
2. **Revise/Send Back** (Amber segment)
3. **Oppose/Reject** (Red segment)

This ensures active community members don't have to vote "No" just because they want a minor change. They can vote "Revise" to return the proposal to its authors with feedback.

---

### 📊 Three-Segment Stacked Progress Bars

The quick-glance progress bar on both the proposal feed and detail cards now features a multi-color stacked bar showing the exact breakdown of votes in real-time. 

* The segment sizes scale perfectly according to absolute voting ratios, keeping all options transparent at a glance without conflating revision requests with total opposition.

---

### 📱 Responsive Detail Layout & Clean Badges

We've removed the fixed `max-w-2xl` boundaries on the proposal details page. The page now spans the **full responsive fluid container size** of your regular feed posts, making it look natural on wide screens and mobile viewports alike.

Additionally, we removed cramped Badge pills from the option headers. "Your Vote" and "Leading" indicators now sit elegantly on a dedicated row below the title in clear, color-themed text.

Here is a shot of the updated interface in dark mode showing a close vote:

![Ternary Governance Results UI](/docs/images/ternary-governance-results.png)

---

### 🔑 Admin Override & Seamless Voting

To ensure frictionless testing and platform moderation, **Admins** can now vote on any proposal directly, bypassing standard paid co-op subscription locks:
* **Client-side UI checks** now automatically hydrate the voting cards for active platform admins.
* **Server action constraints** in `castVote` securely bypass the `'coop_voting'` subscription feature check and `'earned'` source exclusions.

---

### 🔧 Under the Hood

* **Extended Keyword Matching:** Added automatic detection support for common policy terms like `allow` (Support) and `restrict` (Oppose) so that the ternary parser hydrates custom actions seamlessly.
* **Stable Docker Rollouts:** Deployed cleanly using standard CI builds and zero-downtime blue/green Docker container swaps.

---

### What's Next

* Community-wide voting on the official NSFW content policy draft is officially open.
* Mobile notification triggers for close votes.
* Inline image grid updates.

Go cast your vote on the active proposals and let us know what you think!
