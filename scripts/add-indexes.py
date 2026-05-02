import re

with open('src/db/schema.ts', 'r') as f:
    content = f.read()

if "import { index" not in content:
    content = content.replace("uniqueIndex", "index, uniqueIndex")

indexes_to_add = {
    "posts": """}, (table) => [
  index('idx_posts_ring_author').on(table.ring, table.authorId),
  index('idx_posts_tribe_ring').on(table.tribeId, table.ring),
  index('idx_posts_author_created').on(table.authorId, table.createdAt),
  index('idx_posts_wall').on(table.authorId, table.pinnedToWall)
]);""",
    "bonds": """}, (table) => [
  index('idx_bonds_user_target').on(table.userId, table.targetType),
  index('idx_bonds_target_user').on(table.targetId, table.userId)
]);""",
    "tribeMembers": """}, (table) => [
  index('idx_tribe_members_user').on(table.userId, table.tribeId),
  index('idx_tribe_members_tribe').on(table.tribeId, table.role)
]);""",
    "postMoodTags": """}, (table) => [
  index('idx_post_mood_tags_mood').on(table.moodSlug, table.promotedAt),
  index('idx_post_mood_tags_post').on(table.postId)
]);""",
    "sessions": """}, (table) => [
  index('idx_sessions_user').on(table.userId, table.expiresAt)
]);""",
    "messages": """}, (table) => [
  index('idx_messages_bond').on(table.bondId, table.sentAt),
  index('idx_messages_sender').on(table.senderId)
]);""",
    "blockedUsers": """}, (table) => [
  index('idx_blocked_users_user').on(table.userId)
]);""",
    "subscriptions": """}, (table) => [
  index('idx_subscriptions_user').on(table.userId),
  index('idx_subscriptions_stripe').on(table.stripeSubscriptionId)
]);""",
    "comments": """}, (table) => [
  index('idx_comments_post').on(table.postId, table.createdAt)
]);""",
    "mentions": """}, (table) => [
  index('idx_mentions_user').on(table.mentionedUserId, table.read)
]);""",
    "vibes": """}, (table) => [
  index('idx_vibes_target').on(table.targetId, table.targetType),
  uniqueIndex('vibes_user_target_idx').on(table.userId, table.targetId, table.targetType)
]);""",
    "mediaFiles": """}, (table) => [
  index('idx_media_files_user').on(table.userId, table.createdAt)
]);""",
    "credentials": """}, (table) => [
  index('idx_credentials_user').on(table.userId)
]);"""
}

# The vibes table already has a unique index, we need to replace it.
# Find the vibes definition:
content = re.sub(
    r"export const vibes = pgTable\('vibes', \{.*?\}, \(table\) => \[\s*uniqueIndex\('vibes_user_target_idx'\)\.on\(table\.userId, table\.targetId, table\.targetType\),\s*\]\);",
    lambda m: m.group(0).replace("]);", indexes_to_add["vibes"].replace("}, (table) => [\n", "")),
    content,
    flags=re.DOTALL
)

def table_name(var_name):
    return re.sub(r'(?<!^)(?=[A-Z])', '_', var_name).lower()

for table, idx_str in indexes_to_add.items():
    if table == "vibes":
        continue
    t_name = table_name(table)
    # Replace the end of the table definition "});" with the index string
    content = re.sub(
        rf"export const {table} = pgTable\('{t_name}', {{(.*?)}} \);",
        lambda m: f"export const {table} = pgTable('{t_name}', {{{m.group(1)}{idx_str}",
        content,
        flags=re.DOTALL
    )

for table, idx_str in indexes_to_add.items():
    if table == "vibes":
        continue
    t_name = table_name(table)
    # The regex needs to match the exact end of the pgTable call: "});\n"
    content = re.sub(
        rf"(export const {table} = pgTable\('{t_name}', {{.*?)(}});\n",
        rf"\1{idx_str}\n",
        content,
        flags=re.DOTALL
    )

with open('src/db/schema.ts', 'w') as f:
    f.write(content)
print("Indexes added to schema.")
