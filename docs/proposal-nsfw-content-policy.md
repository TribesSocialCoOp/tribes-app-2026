# 🗳️ Co-Op Proposal: NSFW Content Policy

**Title:** Adult Content: Platform Rules and Privacy Framework

---

**Description:**

Let's talk about adult content.

You've probably noticed we didn't populate Tribes with porn on day one. That was deliberate. But our position isn't a blanket ban. It's a framework that treats you like adults while keeping the platform legal, safe, and honest about what we can and can't do.

## Our Line in the Sand

Before anything else: **we are here to build a good-faith community, not to protect predators.** If you are looking for a platform to hide abuse or exploit anyone, you are explicitly not welcome here. Full stop. This is non-negotiable and supersedes every other section of this proposal.

## The Architecture Problem

Our foundational design principle is: **private should be private, public should be public.**

Because of our E2E encryption, we *physically cannot see* what you send your Bond contacts. Your personal content is encrypted on your device with keys we never hold. That's by design.

Tribes (our group spaces) are different. We have members who want zero exposure to NSFW content, and age-verification laws are rapidly expanding across the US and internationally. We need a policy that works today, future-proofs the platform, and doesn't get the Co-op sued out of existence.

## The Proposal

### 1. Sanctioned NSFW Tribes
We will officially allow 18+ Tribes. Adult content has a home here, inside clearly marked, privacy-enforced boundaries.

### 2. Strict Opacity
Like adult venues in the real world, NSFW Tribes will be explicitly flagged to outsiders, but zero content leaks to non-members. No previews, no snippets in feeds, no ambient exposure.

### 3. Automatic Privacy Lock
Any Tribe flagged as NSFW is automatically and permanently locked to **Private** status. Internal content is E2E encrypted and zero-knowledge to the platform. This isn't optional. The system enforces it.

### 4. Edge Moderation for CSAM & Abuse
Because we cannot scan E2E encrypted content (by design), moderation responsibility lives at the edges.

We will build a secure reporting mechanism. When a member flags severe illegal content (CSAM, abuse material), their client decrypts the offending post locally and re-encrypts it with the platform's moderation public key. Only authorized moderators holding the corresponding private key can view the reported content. This lets us verify the report, ban the actors, remove the Tribe, and report to authorities, all without breaking the privacy model for everyone else.

**Note:** This reporting tool will be built as part of this policy's implementation. It does not exist today.

### 5. Age-Gating & Legal Compliance
This is the part where we have to be honest about what we think versus what the law requires.

We are not the internet's parents. Teenagers have been lying about their ages online since the internet was born, and age-gate checkboxes have never stopped a determined 16-year-old. We believe that young people deserve private digital spaces, and that many of the age verification laws being pushed right now are less about protecting kids and more about surveillance infrastructure dressed up as child safety.

But beliefs don't keep a Co-op out of court.

Over half of US states have passed or are actively passing laws mandating strict age verification for platforms hosting adult content. Our home state of Washington has HB 2112 pending right now. If we host NSFW content without age-gating, we are liable. Not theoretically. Actually. A single lawsuit from a state AG could end this platform.

So here's how we comply without becoming the thing we hate.

**How age verification would actually work:**

Think of it like a wristband at a venue. A bouncer checks your ID at the door and gives you a wristband. Inside the venue, nobody checks your ID again. They just see the wristband.

Zero-knowledge age verification works the same way, digitally. You verify your age once with a third-party provider. That provider gives your browser a cryptographic token (the "wristband"). When you access NSFW content on Tribes, your browser shows the token. We can verify it's real without ever seeing your name, birthday, or ID. The third party knows you're verified but doesn't know what you're using it for. Neither side gets the full picture.

**Real services that do this today:**

The most established provider is **Yoti**. Instagram, Discord, Bluesky, and PlayStation all use them. They offer AI-based facial age estimation (take a selfie, the AI estimates your age, no image is stored) and traditional ID scanning. The platform only receives a pass/fail result.

Other providers exist but are mostly focused on retail, not social platforms. Apple and Google are both building age attestation into their mobile wallets, which would let you verify once at the OS level and carry that proof across apps. Not widely available yet, but when it is, it's the ideal solution.

The industry is also moving toward **private identity services**: a trusted third party that holds your verified identity on your behalf and issues anonymous proofs to platforms as needed. You trust one provider with your ID once. Every other platform just gets a yes/no. This is the model we'd prefer to adopt as it matures.

We have not selected a provider yet. That decision will be made based on cost, integration complexity, and jurisdictional requirements. The community will be updated before implementation.

**Geo-blocking as last resort.** In jurisdictions that legally require government ID submission for adult content access, we will geo-block NSFW Tribes for those regions rather than collect identity documents.

**Advocacy.** As a Co-op, we have a collective voice. If our members believe that current age verification laws are overreaching or poorly designed, we can use our governance structure to formally advocate for better legislation. That's a conversation for a future proposal.

### 6. Enforcement
If a Tribe hosts NSFW content without flagging itself, moderators will flag it upon discovery. The Tribe founder gets one chance to self-correct. Repeated or intentional failure to flag will result in the Tribe being permanently shut down and the founder's ability to create new Tribes revoked.

### 7. Platform Survival Comes First
If NSFW content ever threatens our ability to process payments, NSFW content goes. The Co-op comes before nudes. No exceptions.

Our payment processors (Stripe, Visa, Mastercard) have their own policies on adult content. We believe this proposal is compatible because members pay for Co-op membership, not for adult content. NSFW tribes are a permitted feature, not a product being sold. This is the same model Reddit and Discord operate under.

To stay on the right side of this line: there will be **zero direct monetization of adult content** on the platform. No tipping for NSFW posts. No paid NSFW tribes. No premium content marketplace. Violation of this rule will result in immediate permanent suspension from the platform.

If a payment processor tells us this policy doesn't work, we comply first and figure out alternatives second. The platform lives. That's the priority.

---

## Document Updates

If this proposal passes, the following *principles* will be codified into our Privacy Policy and Terms of Service. The language below is illustrative, not final. Actual document updates will be drafted with legal counsel.

### 📝 Privacy Policy (example language)
> **NSFW Tribes & Edge Moderation:** When a Tribe is flagged as NSFW, it operates in a Private, E2E-encrypted state. The platform has zero knowledge of internal content, and no automated scanning is performed. Authorized participants can use direct reporting tools. In the event of a user reporting severe illegal content (e.g., CSAM), the reporting client will decrypt the content locally and re-encrypt it with the platform's moderation public key, ensuring only authorized moderators can access the reported material for compliance and legal action.

### 📝 Terms of Service (example language)
> **Age Verification & Jurisdiction:** While the platform baseline age requirement is 13+, creation of, moderation of, or participation in any NSFW Tribe is strictly limited to users verified as 18 years or older. The platform reserves the right to employ geo-blocking or third-party zero-knowledge age verification tokens for NSFW features in any jurisdiction where local laws impose identity-verification mandates.

---

## Vote

* **Option 1:** Adopt the NSFW Policy & Document Updates
* **Option 2:** Reject. Maintain a strict ban on all NSFW content
* **Option 3:** Send back to Founders for revision

