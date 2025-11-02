from pathlib import Path
text = Path(r"client/src/App.tsx").read_text(encoding="utf-8")
chars = sorted({ch for ch in text if ord(ch) > 127})
print(chars)
