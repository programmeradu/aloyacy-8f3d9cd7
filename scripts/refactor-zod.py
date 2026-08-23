import os
import re

TARGET_DIR = r"c:\Users\USER\Documents\GitHub\aloyacy-8f3d9cd7\src\routes\api\public"

# We want to replace:
# const parsed = await parseJsonBody(req, MySchema, CORS);
# if (!parsed.ok) return parsed.response;
# WITH:
# const body = await readJsonBody(req, CORS);
# if (!body.ok) return body.response;
# const parsed = MySchema.safeParse(body.value);
# if (!parsed.success) return badRequest("Invalid request", zodDetails(parsed.error), CORS);

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # 1. parseJsonBody(req, Schema, CORS) or parseJsonBody(req, Schema)
    content = re.sub(
        r'const (\w+) = await parseJsonBody\(([^,]+),\s*([^,)]+)(?:,\s*([^)]+))?\);',
        lambda m: (
            f'const __body = await readJsonBody({m.group(2)}{", " + m.group(4) if m.group(4) else ""});\n'
            f'  if (!__body.ok) return __body.response;\n'
            f'  const {m.group(1)} = {m.group(3)}.safeParse(__body.value);\n'
            f'  if (!{m.group(1)}.success) return badRequest("Invalid request", zodDetails({m.group(1)}.error){", " + m.group(4) if m.group(4) else ""});\n'
            f'  const {m.group(1)}Data = {m.group(1)}.data; // Keep it somewhat compatible if they used parsed.data'
        ).replace('__body', m.group(1) + '_body'),
        content
    )

    # 2. parseQuery(req.url, Schema, CORS)
    content = re.sub(
        r'const (\w+) = parseQuery\(([^,]+),\s*([^,)]+)(?:,\s*([^)]+))?\);',
        lambda m: (
            f'const {m.group(1)}_q = readQuery({m.group(2)});\n'
            f'  const {m.group(1)} = {m.group(3)}.safeParse({m.group(1)}_q);\n'
            f'  if (!{m.group(1)}.success) return badRequest("Invalid request", zodDetails({m.group(1)}.error){", " + m.group(4) if m.group(4) else ""});'
        ),
        content
    )

    # 3. parseJsonInput(req, Schema, CORS)
    content = re.sub(
        r'const (\w+) = await parseJsonInput\(([^,]+),\s*([^,)]+)(?:,\s*([^)]+))?\);',
        lambda m: (
            f'const __body = await readJsonInput({m.group(2)}{", " + m.group(4) if m.group(4) else ""});\n'
            f'  if (!__body.ok) return __body.response;\n'
            f'  const {m.group(1)} = {m.group(3)}.safeParse(__body.value);\n'
            f'  if (!{m.group(1)}.success) return invalidRequest({m.group(1)}.error{", " + m.group(4) if m.group(4) else ""});'
        ).replace('__body', m.group(1) + '_body'),
        content
    )

    # 4. parseQueryInput(req.url, Schema, CORS)
    content = re.sub(
        r'const (\w+) = parseQueryInput\(([^,]+),\s*([^,)]+)(?:,\s*([^)]+))?\);',
        lambda m: (
            f'const {m.group(1)}_q = readQuery({m.group(2)});\n'
            f'  const {m.group(1)} = {m.group(3)}.safeParse({m.group(1)}_q);\n'
            f'  if (!{m.group(1)}.success) return invalidRequest({m.group(1)}.error{", " + m.group(4) if m.group(4) else ""});'
        ),
        content
    )

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

for root, dirs, files in os.walk(TARGET_DIR):
    for f in files:
        if f.endswith('.ts'):
            process_file(os.path.join(root, f))
