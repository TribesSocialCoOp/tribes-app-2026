import re

with open('src/db/schema.ts', 'r') as f:
    lines = f.readlines()

indexes_to_add = {
    "posts": """}, (table) => [
  index('idx_posts_ring_author').on(table.ring, table.authorId),
  index('idx_posts_tribe_ring').on(table.tribeId, table.ring),
  index('idx_posts_author_created').on(table.authorId, table.createdAt),
  index('idx_posts_wall').on(table.authorId, table.pinnedToWall)
]);\n""",
    "bonds": """}, (table) => [
  index('idx_bonds_user_target').on(table.userId, table.targetType),
  index('idx_bonds_target_user').on(table.targetId, table.userId)
]);\n""",
    "tribeMembers": """}, (table) => [
  index('idx_tribe_members_user').on(table.userId, table.tribeId),
  index('idx_tribe_members_tribe').on(table.tribeId, table.role)
]);\n""",
    "postMoodTags": """}, (table) => [
  index('idx_post_mood_tags_mood').on(table.moodSlug, table.promotedAt),
  index('idx_post_mood_tags_post').on(table.postId)
]);\n""",
    "sessions": """}, (table) => [
  index('idx_sessions_user').on(table.userId, table.expiresAt)
]);\n""",
    "messages": """}, (table) => [
  index('idx_messages_bond').on(table.bondId, table.sentAt),
  index('idx_messages_sender').on(table.senderId)
]);\n""",
    "blockedUsers": """}, (table) => [
  index('idx_blocked_users_user').on(table.userId)
]);\n""",
    "subscriptions": """}, (table) => [
  index('idx_subscriptions_user').on(table.userId),
  index('idx_subscriptions_stripe').on(table.stripeSubscriptionId)
]);\n""",
    "comments": """}, (table) => [
  index('idx_comments_post').on(table.postId, table.createdAt)
]);\n""",
    "mentions": """}, (table) => [
  index('idx_mentions_user').on(table.mentionedUserId, table.read)
]);\n""",
    "vibes": """}, (table) => [
  index('idx_vibes_target').on(table.targetId, table.targetType),
  uniqueIndex('vibes_user_target_idx').on(table.userId, table.targetId, table.targetType)
]);\n""",
    "mediaFiles": """}, (table) => [
  index('idx_media_files_user').on(table.userId, table.createdAt)
]);\n""",
    "credentials": """}, (table) => [
  index('idx_credentials_user').on(table.userId)
]);\n"""
}

current_table = None

for i, line in enumerate(lines):
    match = re.match(r'^export const (\w+) = pgTable', line)
    if match:
        current_table = match.group(1)
    
    if current_table in indexes_to_add and line.strip() == "});":
        lines[i] = indexes_to_add[current_table]
        current_table = None
    elif current_table == "vibes" and line.strip() == "]);":
        # vibes already has the uniqueIndex, so it ends with "]);"
        lines[i] = indexes_to_add["vibes"]
        current_table = None

with open('src/db/schema.ts', 'w') as f:
    f.writelines(lines)
    
print("Indexes successfully added by line matching.")
