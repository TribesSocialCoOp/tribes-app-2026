# 🔞 Age Verification Is Live (v1). Here's Why It Took So Long

Hi friends,

v1 of our NSFW and age-verification work is deployed. I'm calling it **v1** because I genuinely never imagined how hard it would be to build something that's both *lawful* and still *friendly to you*. So first: thank you for your patience through the weeks of darkness while I built this.

Here's the honest version of what happened.

## Why this was such a mess

As I started building, I found that both the **law** and the **tools** for age-gating are still deeply immature:

- **Apple Wallet is off the table.** Apple only permits Wallet-based ID checks for a short list of approved categories — air travel, healthcare, ticketing, government services, and the like. A social platform isn't one of them. [See Apple's approved category list →](https://developer.apple.com/wallet/get-started-with-verify-with-wallet/)
- **The U.S. is a patchwork.** More than two dozen states now have some form of age-assurance law, and a handful have hard requirements. No two are quite the same.
- **The UK is its own thing.** Their Online Safety Act (live since July 2025) demands "highly effective" age checks that a simple toggle can't meet, and their regulator is enforcing it hard — dozens of investigations and multiple fines already. The rest of the EU hasn't gone this far.

Wrapping all of that into something that doesn't turn Tribes into a surveillance machine took a while. That's the darkness. Here's the light.

## The good news

Age-gating is quietly moving **to the app stores** instead of digital wallets, and that shift let us go further than I originally thought possible. Instead of asking you to hand over an ID, we can lean on a privacy-preserving age signal from the platform itself.

The core principle throughout: **we only ever learn that you're over 18, never your ID, your birthdate, or your location.** Nothing about you is stored.

## What we actually built

- **NSFW lives only in dedicated, clearly-marked (18+) Tribes** — automatically **Private** and **end-to-end encrypted**. It never shows up in feeds or search for anyone who hasn't opted in.
- **Blurred by default.** Even inside, adult media is hidden until you tap to reveal it.
- **A privacy-first age check.** No government ID collection, ever. No IP or region is stored — we read it for the moment and throw it away.
- **Your choice, on the web.** The "show adult content" switch lives in Settings on the website (an App Store requirement), off by default. If you never flip it, nothing changes for you.

## What to expect, by device

- **On iPhone (the app): live now.** Where your state's law requires age verification, you confirm you're 18+ right through the App Store, on-device. We only ever receive a yes/no, cryptographically tied to your device so it can't be faked.
- **On the web: geo-based.** We check your region (privately, in memory, never stored) and apply the rule for where you are. In most places that's just the one-time "show adult content" switch in Settings.
- **On Android (the app): parked for now.** The Android verification path (Google's Play age signals) needs real hardware to test properly, and I need to get two phones in hand to do it right before switching it on. Android folks can still use the web in the meantime.

## This is v1, on purpose

The law and the tooling are moving fast, so we built this to move with them. Android verification comes online once I've tested it on real devices, and other methods roll out as they mature. If a region has no privacy-respecting way to verify age, we'd rather pause access there than compromise on the "no surveillance" line.

As always: this is a co-op. If you think we drew a line in the wrong place, tell me, and bring it to [Governance](/voting).

More soon.

---

**Tags:** `#announcement` `#nsfw` `#privacy` `#coop`
