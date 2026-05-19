# Dev Update: Three-Way Voting and Governance Polish

Quick one. We launched governance voting yesterday and immediately started iterating on it based on how real proposals actually look.

---

### 🗳️ You Can Now Vote "Revise"

The initial voting UI was binary: yes or no. That works for simple stuff, but the NSFW policy draft isn't simple. Voting "No" when you actually mean "I like the direction but the wording needs work" loses signal.

So proposals now support three options:

- **Support** -- you're in, ship it
- **Revise** -- send it back to the authors with feedback
- **Oppose** -- hard no

This showed up immediately in the NSFW proposal, which now has all three options live. If you haven't voted yet, go weigh in: [Governance](/voting).

---

### 📊 The Progress Bars Got Smarter

The voting bars on the proposal list and detail page now show all three segments stacked together -- green, amber, red -- so you can see the full breakdown at a glance without opening the proposal. Previously the bars only understood two options. Now they scale to three.

---

### 📱 Layout and Readability Fixes

Two things that were bugging me:

1. **The proposal detail page was too narrow.** It had a fixed max-width that didn't match the rest of the platform. If you looked at a proposal and then went back to your feed, it felt like a different app. Fixed. The detail page now uses the same fluid layout as your posts.

2. **The vote badges were cramped.** "Your vote" and "Leading" were crammed inline next to the option label and it looked cluttered, especially on mobile. Those indicators now sit on their own line below the label in matching colors. Much cleaner.

Here's what the updated interface looks like with a close vote in dark mode:

![Ternary Governance Results UI](/docs/images/ternary-governance-results.png)

---

### 🔧 Under the Hood

- Extended the keyword matching so proposals using terms like "allow" or "restrict" in their options get picked up automatically by the three-way detector.
- Clean deploy via the standard CI pipeline. No incidents.

---

### What's Next

- The NSFW content policy proposal is officially open for voting. We want founding members weighing in.
- Mobile notification triggers for close votes.
- Continued image and media polish.

As always, bugs and ideas go right here. We're building this together.
