# Your Encryption Keys: What They Are, What the Warnings Mean, and What to Do

If you've seen an amber banner that says "N bonds need key sync" or a blue banner that says "Vault backup recommended," don't panic. Your data is fine. Here's what's happening and what to do.

---

## What Are Encryption Keys?

When you bond with someone on Tribes, your browser generates a unique pair of encryption keys, one public, one private. Your public key gets shared with your bond partner. Your private key stays in your browser and never leaves your device.

Together, these keys create a **shared secret** that only you and your bond partner can compute. Every message between you is encrypted with that secret before it leaves your device. The Tribes server only ever sees encrypted gibberish. We can't read it. We don't want to.

**The short version:** Your encryption keys are what make your private conversations actually private. Not "private until someone at the company decides to look." Private as in: mathematically impossible to read without your key.

---

## "N Bonds Need Key Sync" (Amber Banner)

This means you have a bond where the encryption key was generated on a **different device or browser session**, and your current device doesn't have the private key yet.

Common causes:
- You logged in on a new phone or laptop
- You cleared your browser data
- You restored from a vault backup that didn't include the latest keys
- You're using Tribes on multiple devices

**Your bond partner is unaffected.** Their encryption still works. The messages aren't lost. You just need to get the right key to this device.

### What To Do

![The amber banner shows which bonds need syncing and provides step-by-step instructions for recovery.](/Users/dustmoo/Sites/tribes-app-2026/docs/images/key-sync/banner-amber.png)

**Option 1: Restore from Vault Backup** (recommended)

If you've backed up your Key Vault (Settings > Key Vault), tap **"Restore with Password"** on the banner and enter your recovery passphrase. If your backup is up to date, you'll see a success notification confirming how many keys were restored. Done.

**Option 2: Reset Keys** (if you don't have a backup)

If you never backed up your vault, the app will warn you to go to your other device and create a backup first. If you lost your passphrase or no longer have the other device, you can reset the affected bond keys. Tap **"Advanced: Reset keys"** on the banner to reveal the reset option.

![The advanced reset option is tucked away to prevent accidental data loss. It warns you that past messages will become unreadable.](/Users/dustmoo/Sites/tribes-app-2026/docs/images/key-sync/banner-amber-advanced.png)

What happens when you reset:
- New encryption keys are generated for the affected bonds
- **Future messages** will work normally with the new keys
- **Past encrypted messages** in those specific bonds will show as "encrypted content." They were encrypted with the old key, which no longer exists
- The other person will see a key change notification

This sounds scary, but think of it this way: resetting a bond key is like changing the lock on a specific door. Everything behind the old lock stays locked. Everything going forward uses the new lock. Your other bonds, your tribes, your journal, none of those are affected.

---

## "Vault Backup Recommended" (Blue Banner)

This is the opposite situation. Your encryption is **healthy** on this device, but your vault backup is out of date (or doesn't exist yet).

The app is telling you: your keys are good here, but if you switch to another device right now, that device won't have them.

### What To Do

![The blue banner prompts you to update your vault when your local keys are newer than your backup.](/Users/dustmoo/Sites/tribes-app-2026/docs/images/key-sync/banner-blue.png)

1. Go to **Settings > Key Vault**
2. Enter your recovery passphrase
3. Tap **"Create Backup"**

That's it. Your keys are now safely in the vault, and any other device you restore to will have them.

---

## "Sync Needed" Badge on a Bond

This badge appears next to specific bonds in your Bonds list. It means the same thing as the banner: that particular bond's encryption key was generated elsewhere and isn't on this device yet.

The fix is the same: restore from vault backup, or reset the key.

---

## "Unable to Decrypt (Key Mismatch)" on Messages

This means the messages in this conversation were encrypted with a key that your current device doesn't have. This can happen after a key reset or if your vault restore didn't include the right key.

**The messages aren't corrupted or deleted.** They still exist on the server, fully encrypted. Your bond partner can still read them. But without the matching key on your device, you can't decrypt them.

If you've recently reset keys: this is expected. New messages going forward will work. The old ones from before the reset will show this way permanently on your device.

---

## How to Prevent Key Issues

**Back up your Key Vault.** That's it. That's the whole thing.

![The Key Vault section in Settings allows you to manage your passphrase and see the health of your local and cloud keys.](/Users/dustmoo/Sites/tribes-app-2026/docs/images/key-sync/vault-settings.png)
  
1. Go to **Settings > Key Vault**
2. Create a recovery passphrase (something you'll remember)
3. Tap **"Back Up"**

Your vault backup is encrypted with your passphrase before it's uploaded. We can't read it. It's just an opaque blob on our server that only your passphrase can unlock. (We wrote a [whole post about why this is safe](dev-post-trust-and-encryption.md).)

**When to back up:**
- After you create a new bond
- After you switch devices
- Before you clear browser data
- Whenever the app shows the blue banner

**A Note on Friction:**
We know the multi-device experience is high-friction right now. Having to manually sync keys or enter passphrases across every phone and laptop you own is a pain. We aren't ignoring that. We're working to make it easier.

**Coming Soon: Biometric Sync.** We're implementing support for WebAuthn/Passkeys, which will allow you to sync your vault using FaceID, TouchID, or your device's native biometric unlock on supported browsers.

Until then, the vault is your best friend. If you're on multiple devices, the vault merges keys from all of them. Back up from Device A, restore on Device B, and both devices have all your keys.

---

## Why Can't You Just "Fix It" For Me?

Because we don't have your keys. That's the entire point.

On every other social platform, "forgot my password" or "lost my device" is a minor inconvenience. You email support, verify your identity, and you're back in. That works because those platforms store your data in plaintext on their servers. They can read it. They can recover it. They can also hand it to advertisers, governments, or whoever compromises their database.

Tribes is different. Your private data is encrypted in your browser before it reaches our servers. We store ciphertext, random-looking bytes that are useless without your private key. When you ask "can you recover my messages?" the honest answer is: **no, and that's a feature.**

The trade-off is real: you need to take care of your keys. Back up your vault. If you lose your keys without a backup, the encrypted content is gone for you. Not because we won't help, because we mathematically can't.

---

## The Beauty of Impermanence

Here's something that might reframe how you think about this.

Most social platforms store everything forever. Every DM, every comment, every photo. It lives on a server somewhere until the company goes bankrupt or gets breached. Your digital footprint is permanent, whether you want it to be or not.

Tribes doesn't work that way. Bonds expire. Content has a natural lifespan. And encryption keys, the mathematical secrets that protect your conversations, age out too. If you rotate a key, the old conversation becomes part of the past. It existed, it mattered, and now it's sealed. Your bond partner might still have their copy. But the shared moment has a boundary.

This isn't a limitation. It's a design philosophy. Real relationships aren't permanent archives. They're living things that grow, change, and sometimes end. Your digital life should work the same way.

**The Power of Letting Go.**
We build Tribes around the idea that **not everything needs to last forever.** Some things are meant to age out. The encryption enforces that at a mathematical level. If you lose a key and a conversation from three years ago becomes unreadable, maybe that's okay. It existed in its time, and now it's gone. It's not a bug. It's the point.

We want to hear from you, our early members, about this. Does this philosophy of digital decay resonate with you, or is the friction of losing access too high? We're building this together, and your feedback on these core trade-offs is what will shape Tribes.

---

## Quick Reference

| What you see | What it means | What to do |
|---|---|---|
| "Encryption Keys Missing" banner (red) | A bond key was generated on another device | Restore from vault backup, or reset keys |
| "Vault backup recommended" banner (blue) | Your keys are healthy but not backed up | Go to Settings > Key Vault and back up |
| "Sync needed" badge on a bond | That bond's key isn't on this device | Restore from vault backup, or reset keys |
| "Unable to decrypt (key mismatch)" | Messages encrypted with a key you don't have | If after a reset: expected. New messages will work |
| "Encrypted message" in feed | A bond post you can't decrypt (no shared secret) | Ensure bond keys are synced (check Bonds page) |
| Everything green | All keys synced, encryption active | You're good. Maybe back up your vault. |

---

## Still Confused?

Post in this tribe. We'll help. This is a co-op. We're building it together, and no question about your encryption is a dumb question.

If you want the deep technical explanation of how all this works under the hood, check out our companion post: [What Happens When You Lose an Encryption Key](dev-post-key-rotation.md).

---

**Tags:** `#howto` `#encryption` `#security` `#bonds`
