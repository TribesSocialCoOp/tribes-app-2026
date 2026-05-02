import re

with open('src/db/schema.ts', 'r') as f:
    content = f.read()

# Find lines with integer(...) and .default(false) and replace false with 0
# We can do a line-by-line replace
lines = content.split('\n')
for i, line in enumerate(lines):
    if "integer(" in line and ".default(false)" in line:
        lines[i] = line.replace(".default(false)", ".default(0)")

with open('src/db/schema.ts', 'w') as f:
    f.write('\n'.join(lines))
print("Schema defaults fixed.")
