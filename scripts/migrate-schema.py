import re

with open('src/db/schema.ts', 'r') as f:
    content = f.read()

# 1. Update imports
content = content.replace(
    "import { sqliteTable, text, integer, real, blob, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core';",
    "import { pgTable, text, integer, boolean, timestamp, doublePrecision, customType, jsonb, primaryKey, uniqueIndex } from 'drizzle-orm/pg-core';\n\nconst bytea = customType<{ data: Buffer }>({ dataType() { return 'bytea'; } });"
)

# 2. Update table definitions
content = content.replace("sqliteTable(", "pgTable(")

# 3. Update data types
content = re.sub(r"integer\('([^']+)',\s*\{\s*mode:\s*'boolean'\s*\}\)", r"boolean('\1')", content)
content = re.sub(r"integer\('([^']+)',\s*\{\s*mode:\s*'timestamp'\s*\}\)", r"timestamp('\1', { withTimezone: true })", content)
content = re.sub(r"real\(", r"doublePrecision(", content)
content = re.sub(r"blob\(", r"bytea(", content)
content = re.sub(r"text\('([^']+)',\s*\{\s*mode:\s*'json'\s*\}\)", r"jsonb('\1')", content)

# 4. Update default values
content = content.replace("sql`CURRENT_TIMESTAMP`", "sql`NOW()`")
content = content.replace("sql`(unixepoch())`", "sql`NOW()`")

# Fix boolean defaults
content = re.sub(r"\.default\(0\)(?!\s*//)", r".default(false)", content)
content = re.sub(r"\.default\(1\)(?!\s*//)", r".default(true)", content)

with open('src/db/schema.ts', 'w') as f:
    f.write(content)
print("Schema migrated successfully.")
