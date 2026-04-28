#!/usr/bin/env python3
"""
Migrate 'The Trials' tribe (id=0) to 'Welcome to Tribes' and seed onboarding posts.
Run: python3 scripts/migrate-welcome-tribe.py
"""

import json, uuid, time, subprocess, sys

REMOTE_HOST = "root@5.78.189.222"
SQLD_CONTAINER = "tribes-sqld-1"
DUSTIN_ID = "0d1f3d91-d940-4562-a55b-7a6390e2e877"
TRIBE_ID = "0"

def get_sqld_ip():
    result = subprocess.run(
        ["ssh", "-o", "StrictHostKeyChecking=no", REMOTE_HOST,
         f"docker inspect {SQLD_CONTAINER} --format '{{{{range .NetworkSettings.Networks}}}}{{{{.IPAddress}}}}{{{{end}}}}'"],
        capture_output=True, text=True
    )
    return result.stdout.strip().strip("'")

def execute_pipeline(sqld_url, requests):
    payload = json.dumps({"requests": requests})
    # Write to local temp, scp to remote, curl from file
    import tempfile, os
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        f.write(payload)
        local_path = f.name
    
    remote_path = "/tmp/_tribes_migration_payload.json"
    
    # SCP the file
    subprocess.run(
        ["scp", "-o", "StrictHostKeyChecking=no", local_path, f"{REMOTE_HOST}:{remote_path}"],
        capture_output=True, text=True, check=True
    )
    os.unlink(local_path)
    
    # Execute curl with file input
    result = subprocess.run(
        ["ssh", "-o", "StrictHostKeyChecking=no", REMOTE_HOST,
         f"curl -sf -X POST '{sqld_url}/v2/pipeline' -H 'Content-Type: application/json' -d @{remote_path} && rm -f {remote_path}"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"ERROR: {result.stderr}")
        sys.exit(1)
    return json.loads(result.stdout)

def main():
    sqld_ip = get_sqld_ip()
    sqld_url = f"http://{sqld_ip}:8080"
    print(f"[migrate] sqld at {sqld_url}")

    now_ts = int(time.time())
    post1_id = str(uuid.uuid4())
    post2_id = str(uuid.uuid4())
    post3_id = str(uuid.uuid4())

    # ── 1. Update tribe metadata ───────────────────────────────
    stmts = [{
        "type": "execute",
        "stmt": {
            "sql": """UPDATE tribes SET
                name = 'Welcome to Tribes',
                slug = 'welcome',
                description = 'Your starting point on Tribes.app! Learn how to navigate, form bonds, join communities, and make this platform your own.',
                homepage_url = 'https://tribes.app',
                created_by = ?
            WHERE id = '0'""",
            "args": [{"type": "text", "value": DUSTIN_ID}]
        }
    }]

    # ── 2. Add Dustin as founder ───────────────────────────────
    stmts.append({
        "type": "execute",
        "stmt": {
            "sql": "INSERT OR IGNORE INTO tribe_members (tribe_id, user_id, role, joined_at) VALUES ('0', ?, 'founder', ?)",
            "args": [
                {"type": "text", "value": DUSTIN_ID},
                {"type": "integer", "value": str(now_ts)}
            ]
        }
    })

    # ── 3. Welcome post (pinned) ──────────────────────────────
    welcome_content = """Welcome to Tribes! 🎉

Hey, I'm Dustin. I built this place because I was tired of social platforms that treat people like content to be consumed. Tribes is different.

**This isn't a platform for scrolling. It's a platform for sharing.** There are no algorithms here. No engagement tricks. Your feed is just the people and communities you actually connect with.

## How it works

**🔗 Bonds** are your connections with real people. When you bond with someone, you both get encrypted passkeys that let you see each other's stuff. Bonds are mutual and they stay alive as long as you keep interacting. If you drift apart, the bond goes dormant. No hard cutoff, and you can always reconnect.

**🛡️ Inner Circle** is for your closest people. Any bond can be toggled into your Inner Circle for longer access and your most personal content ring.

**🏕️ Tribes** are communities. Each one has its own feed, members, and vibe. Some you can join right away, others need approval.

**🔔 Rings** control who sees what:
- *Journal* is private, just for you
- *Inner Circle* goes to your closest bonds
- *My People* goes to everyone you're bonded with
- *Tribes* goes to tribe members

## Getting started

1. **Check out Discover** and find some tribes that interest you
2. **Form some bonds** with people via invite links or NFC tap
3. **Post something!** Share a thought with your people or a tribe
4. **Set a mood** on your posts to help others find your vibe

Welcome aboard. This is your space, make it yours. ✌️"""

    stmts.append({
        "type": "execute",
        "stmt": {
            "sql": "INSERT INTO posts (id, tribe_id, author_id, author_name, author_avatar_fallback, title, content, is_pinned, ring, created_at, vibe_count, comment_count) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'tribes', ?, 0, 0)",
            "args": [
                {"type": "text", "value": post1_id},
                {"type": "text", "value": TRIBE_ID},
                {"type": "text", "value": DUSTIN_ID},
                {"type": "text", "value": "Dustin Moore"},
                {"type": "text", "value": "DM"},
                {"type": "text", "value": "Welcome to Tribes! 🎉 Start H    bonds_content = """## Understanding Bonds 🔗

Bonds are how you connect with people on Tribes. Think of them like a handshake that actually means something.

### How it works

When you connect with someone, you each get a **passkey**. It's an encrypted key that lets you access each other's shared content. These passkeys have a lifespan:

| Bond Type | Duration | How it refreshes |
|-----------|----------|-----------------|
| **Person Bond** | 180 days | Refreshes automatically when you interact |
| **Inner Circle** | 365 days | Same, but with access to closer content |
| **Tribe Bond** | 90 days | Refreshes when you engage with the tribe |

### When bonds expire

**Person bonds go dormant**, not deleted. Your connection is still there, but content access pauses. Either person can send a **Reconnect Request** and if the other says yes, you're back.

Tribe bonds just expire. Rejoin the tribe to get back in.

### Ways to form bonds

- **Invite Link** from your Circles page
- **NFC Tap** if your phone supports it (pretty cool honestly)
- **Bond Request** by searching for someone
- **Introduction** from a mutual connection

### Inner Circle

Any bond can be promoted to your **Inner Circle**. These are your most trusted people. They see content you post to the Inner Circle ring and get a longer 365-day passkey. You can toggle this on or off anytime from the bond menu.

The idea behind all of this is simple: **relationships that matter should be maintained.** And ones that naturally drift? Let them rest. No hard cutoffs. Just gentle fading, with the door always open to reconnect."""

    stmts.append({
        "type": "execute",
        "stmt": {
            "sql": "INSERT INTO posts (id, tribe_id, author_id, author_name, author_avatar_fallback, title, content, is_pinned, ring, created_at, vibe_count, comment_count) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'tribes', ?, 0, 0)",
            "args": [
                {"type": "text", "value": post2_id},
                {"type": "text", "value": TRIBE_ID},
                {"type": "text", "value": DUSTIN_ID},
                {"type": "text", "value": "Dustin Moore"},
                {"type": "text", "value": "DM"},
                {"type": "text", "value": "Understanding Bonds"},
                {"type": "text", "value": bonds_content},
                {"type": "integer", "value": str(now_ts - 60)}
            ]
        }
    })

    # ── 5. Getting Around post ────────────────────────────────
    nav_content = """## Getting Around Tribes 🧭

Quick tour of the main areas:

### 📰 Your Comms (Feed)
This is your main feed. Everything shows up here: posts from bonds, tribes, and mood streams. Use the **ring filters** at the top to focus:
- **All** for the full stream
- **Journal** for your private posts
- **Inner Circle** for your closest bonds
- **My People** for all bonded users
- **Tribes** for tribe content
- **Streams** for mood-promoted posts across the platform

### ⭕ Circles
This is where you manage your connections:
- **Bonds tab** to see all your bonds, their status, and settings
- **Tribes tab** to see what tribes you belong to

### 🏕️ Discover
Find new tribes to join. Browse around, search, or see what's popular.

### 🧱 My Wall
Your public profile. Pin journal posts to your wall to curate what people see when they visit you. Think of it like a living portfolio that updates as you go.

### 🎨 Moods
Every post can carry a mood tag (Chill, Focus, Discover, Connect, etc.). Tribe founders can promote posts to **Mood Streams**, which are platform-wide feeds filtered by vibe. It's how good content gets found without needing an algorithm.

---

Got questions? Post them right here. That's what this tribe is for! 💬"""

    stmts.append({
        "type": "execute",
        "stmt": {
            "sql": "INSERT INTO posts (id, tribe_id, author_id, author_name, author_avatar_fallback, title, content, is_pinned, ring, created_at, vibe_count, comment_count) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'tribes', ?, 0, 0)",
            "args": [
                {"type": "text", "value": post3_id},
                {"type": "text", "value": TRIBE_ID},
                {"type": "text", "value": DUSTIN_ID},
                {"type": "text", "value": "Dustin Moore"},
                {"type": "text", "value": "DM"},
                {"type": "text", "value": "Getting Around Tribes"},
                {"type": "text", "value": nav_content},
                {"type": "integer", "value": str(now_ts - 120)}
            ]
        }
    })

    # Execute
    print(f"[migrate] Executing {len(stmts)} statements...")
    data = execute_pipeline(sqld_url, stmts)

    for i, r in enumerate(data["results"]):
        if r["type"] == "ok":
            affected = r["response"]["result"].get("affected_row_count", 0)
            print(f"  ✓ Statement {i+1}: OK ({affected} rows)")
        else:
            print(f"  ✗ Statement {i+1}: ERROR — {r['error']['message']}")

    print("\n[migrate] Done! Tribe '0' is now 'Welcome to Tribes'")
    print(f"  Posts created: {post1_id}, {post2_id}, {post3_id}")

if __name__ == "__main__":
    main()
