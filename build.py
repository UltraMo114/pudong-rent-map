"""Build a single offline HTML file from a local dataset and source modules."""
import json
from pathlib import Path

base = Path(__file__).resolve().parent
dataset = json.loads((base / "data.json").read_text(encoding="utf-8"))
html = (base / "template.html").read_text(encoding="utf-8")
html = html.replace("/*DATA*/", json.dumps(dataset, ensure_ascii=False).replace("<", r"\u003c"))
for marker, file in (("/*MODEL*/", "model.js"), ("/*APP*/", "app.js")):
    html = html.replace(marker, (base / file).read_text(encoding="utf-8"))
(base / "index.html").write_text(html, encoding="utf-8")
