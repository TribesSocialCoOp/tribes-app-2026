-- ============================================================
-- TRIBES PROD METRICS — "Poor Man's Analytics"
-- Run against your production DATABASE_URL
-- Usage: psql $DATABASE_URL -f scripts/prod-metrics.sql
-- ============================================================

-- 1. SIGNUPS BY DAY (last 30 days)
SELECT '📈 SIGNUPS BY DAY' AS section;
SELECT
  DATE(created_at AT TIME ZONE 'America/Los_Angeles') AS day,
  COUNT(*) AS signups,
  STRING_AGG(SUBSTRING(name FROM 1 FOR 12), ', ' ORDER BY created_at) AS who
FROM users
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1 DESC;

-- 2. SIGNUPS BY DAY-OF-WEEK (pattern detection)
SELECT '📊 SIGNUPS BY DAY OF WEEK' AS section;
SELECT
  TO_CHAR(created_at AT TIME ZONE 'America/Los_Angeles', 'Day') AS day_name,
  EXTRACT(DOW FROM created_at AT TIME ZONE 'America/Los_Angeles') AS dow,
  COUNT(*) AS signups
FROM users
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY 1, 2
ORDER BY 2;

-- 3. TOTAL USER COUNTS
SELECT '👥 USER TOTALS' AS section;
SELECT
  COUNT(*) AS total_users,
  COUNT(*) FILTER (WHERE role != 'Human_Free') AS paid_or_founding,
  COUNT(*) FILTER (WHERE role = 'Human_Free') AS free_users,
  COUNT(*) FILTER (WHERE email_verified = true) AS email_verified,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS signups_last_7d,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS signups_last_24h
FROM users;

-- 4. AUTH METHOD BREAKDOWN
SELECT '🔐 AUTH METHODS' AS section;
SELECT
  'Passkey' AS method,
  COUNT(DISTINCT c.user_id) AS users
FROM credentials c
UNION ALL
SELECT
  'Google OAuth',
  COUNT(DISTINCT user_id)
FROM oauth_accounts WHERE provider = 'google'
UNION ALL
SELECT
  'Apple OAuth',
  COUNT(DISTINCT user_id)
FROM oauth_accounts WHERE provider = 'apple';

-- 5. ACTIVE SESSIONS (logged-in users right now)
SELECT '🟢 ACTIVE SESSIONS' AS section;
SELECT
  COUNT(*) AS active_sessions,
  COUNT(DISTINCT user_id) AS unique_users
FROM sessions
WHERE expires_at > NOW()
  AND revoked_at IS NULL;

-- 6. SESSIONS CREATED BY DAY (login activity)
SELECT '🔑 LOGINS BY DAY (last 14 days)' AS section;
SELECT
  DATE(created_at AT TIME ZONE 'America/Los_Angeles') AS day,
  COUNT(*) AS logins,
  COUNT(DISTINCT user_id) AS unique_users
FROM sessions
WHERE created_at >= NOW() - INTERVAL '14 days'
GROUP BY 1
ORDER BY 1 DESC;

-- 7. CONTENT VOLUME
SELECT '📝 CONTENT VOLUME' AS section;
SELECT
  (SELECT COUNT(*) FROM posts WHERE is_removed = false) AS total_posts,
  (SELECT COUNT(*) FROM posts WHERE is_removed = false AND created_at >= NOW() - INTERVAL '7 days') AS posts_last_7d,
  (SELECT COUNT(*) FROM comments) AS total_comments,
  (SELECT COUNT(*) FROM comments WHERE created_at >= NOW() - INTERVAL '7 days') AS comments_last_7d,
  (SELECT COUNT(*) FROM vibes) AS total_vibes,
  (SELECT COUNT(*) FROM vibes WHERE created_at >= NOW() - INTERVAL '7 days') AS vibes_last_7d;

-- 8. POSTS BY DAY (last 14 days)
SELECT '📄 POSTS BY DAY' AS section;
SELECT
  DATE(created_at AT TIME ZONE 'America/Los_Angeles') AS day,
  COUNT(*) AS posts,
  COUNT(DISTINCT author_id) AS unique_authors
FROM posts
WHERE created_at >= NOW() - INTERVAL '14 days'
  AND is_removed = false
GROUP BY 1
ORDER BY 1 DESC;

-- 9. TOP ENGAGED USERS (by actions last 7 days)
SELECT '🏆 TOP ENGAGED USERS (last 7 days)' AS section;
SELECT
  u.name,
  u.role,
  COALESCE(p.cnt, 0) AS posts,
  COALESCE(c.cnt, 0) AS comments,
  COALESCE(v.cnt, 0) AS vibes,
  COALESCE(p.cnt, 0) + COALESCE(c.cnt, 0) + COALESCE(v.cnt, 0) AS total_actions
FROM users u
LEFT JOIN (
  SELECT author_id, COUNT(*) AS cnt FROM posts
  WHERE created_at >= NOW() - INTERVAL '7 days' AND is_removed = false
  GROUP BY 1
) p ON p.author_id = u.id
LEFT JOIN (
  SELECT author_id, COUNT(*) AS cnt FROM comments
  WHERE created_at >= NOW() - INTERVAL '7 days'
  GROUP BY 1
) c ON c.author_id = u.id
LEFT JOIN (
  SELECT user_id, COUNT(*) AS cnt FROM vibes
  WHERE created_at >= NOW() - INTERVAL '7 days'
  GROUP BY 1
) v ON v.user_id = u.id
WHERE COALESCE(p.cnt, 0) + COALESCE(c.cnt, 0) + COALESCE(v.cnt, 0) > 0
ORDER BY total_actions DESC
LIMIT 15;

-- 10. TRIBE HEALTH
SELECT '🏘️ TRIBE HEALTH' AS section;
SELECT
  t.name,
  t.member_count,
  COUNT(DISTINCT p.id) FILTER (WHERE p.created_at >= NOW() - INTERVAL '7 days') AS posts_7d,
  COUNT(DISTINCT p.author_id) FILTER (WHERE p.created_at >= NOW() - INTERVAL '7 days') AS active_posters_7d,
  t.created_at::date AS created
FROM tribes t
LEFT JOIN posts p ON p.tribe_id = t.id AND p.is_removed = false
GROUP BY t.id, t.name, t.member_count, t.created_at
ORDER BY t.member_count DESC NULLS LAST
LIMIT 20;

-- 11. BONDS FORMED
SELECT '🔗 BOND ACTIVITY' AS section;
SELECT
  (SELECT COUNT(*) FROM bonds) AS total_bonds,
  (SELECT COUNT(*) FROM bond_requests WHERE status = 'pending') AS pending_requests,
  (SELECT COUNT(*) FROM bonds WHERE inner_circle = true) AS inner_circle_bonds;

-- 12. INVITE CODE USAGE
SELECT '🎟️ INVITE CODE USAGE' AS section;
SELECT
  ic.id AS code,
  ic.type,
  p.name AS plan,
  ic.max_uses,
  ic.used_count,
  ic.created_at::date AS created
FROM invite_codes ic
JOIN plans p ON p.id = ic.grants_plan_id
ORDER BY ic.created_at DESC
LIMIT 20;

-- 13. RETENTION PROXY: Users who logged in this week who signed up before this week
SELECT '🔄 RETURNING USERS (rough retention)' AS section;
SELECT
  COUNT(DISTINCT s.user_id) AS returning_users
FROM sessions s
JOIN users u ON u.id = s.user_id
WHERE s.created_at >= NOW() - INTERVAL '7 days'
  AND u.created_at < NOW() - INTERVAL '7 days';

-- 14. MESSAGES SENT (DM activity)
SELECT '💬 DM ACTIVITY' AS section;
SELECT
  (SELECT COUNT(*) FROM messages) AS total_messages,
  (SELECT COUNT(*) FROM messages WHERE sent_at >= NOW() - INTERVAL '7 days') AS messages_7d,
  (SELECT COUNT(DISTINCT sender_id) FROM messages WHERE sent_at >= NOW() - INTERVAL '7 days') AS active_senders_7d;

-- 15. PLATFORM SUMMARY
SELECT '🎯 PLATFORM SUMMARY' AS section;
SELECT
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(*) FROM tribes) AS tribes,
  (SELECT COUNT(*) FROM bonds) AS bonds,
  (SELECT COUNT(*) FROM posts WHERE is_removed = false) AS posts,
  (SELECT COUNT(*) FROM comments) AS comments,
  (SELECT COUNT(*) FROM messages) AS dms,
  (SELECT COUNT(*) FROM events) AS events;
