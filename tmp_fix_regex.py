from pathlib import Path
import re
path = Path("client/src/App.tsx")
text = path.read_text(encoding="utf-8")
# Restore optional chaining/ternary markers replaced with hyphen
patterns = {
    r'([A-Za-z0-9_\)\]])-\.': r'\1?.',
    r'([A-Za-z0-9_\)\]])-:': r'\1?:',
    r'([A-Za-z0-9_\)\]])-\(': r'\1?(',
    r'([A-Za-z0-9_\)\]])-\[': r'\1?[',
    r'([A-Za-z0-9_\)\]])-\{': r'\1?{',
}
for pattern, repl in patterns.items():
    text = re.sub(pattern, repl, text)
# Restore ternary operators
text = re.sub(r' \- ([^:]+) :', r' ? \1 :', text)
# Replace sequences representing em/en dashes or apostrophes
text = text.replace('---', "'")
text = text.replace('--', '–')
path.write_text(text, encoding="utf-8")
