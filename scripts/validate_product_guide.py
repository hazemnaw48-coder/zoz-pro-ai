from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path("product-guide")
PAGES = ["index.html", "guide.html", "data-notice.html", "privacy.html"]

class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.duplicates = set()
        self.links = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        element_id = attrs.get("id")
        if element_id:
            if element_id in self.ids:
                self.duplicates.add(element_id)
            self.ids.add(element_id)
        for key in ("href", "src"):
            value = attrs.get(key)
            if value:
                self.links.append(value)

errors = []
parsers = {}
for filename in PAGES:
    path = ROOT / filename
    if not path.is_file():
        errors.append(f"Missing page: {path}")
        continue
    source = path.read_text(encoding="utf-8")
    parser = PageParser()
    parser.feed(source)
    parser.close()
    parsers[filename] = parser
    if parser.duplicates:
        errors.append(f"{filename}: duplicate ids: {sorted(parser.duplicates)}")
    if '<html lang="ar" dir="rtl">' not in source:
        errors.append(f"{filename}: Arabic RTL document declaration missing")

for filename, parser in parsers.items():
    for link in parser.links:
        parsed = urlsplit(link)
        if parsed.scheme or link.startswith("//") or not parsed.path:
            continue
        target = (ROOT / parsed.path).resolve()
        if not target.is_file():
            errors.append(f"{filename}: broken local link: {link}")
            continue
        if parsed.fragment:
            target_name = target.name
            target_parser = parsers.get(target_name)
            if target_parser and parsed.fragment not in target_parser.ids:
                errors.append(f"{filename}: missing anchor {link}")

landing = (ROOT / "index.html").read_text(encoding="utf-8")
guide = (ROOT / "guide.html").read_text(encoding="utf-8")
notice = (ROOT / "data-notice.html").read_text(encoding="utf-8")
if 'id="consent"' not in landing or 'required' not in landing:
    errors.append("Landing page must require explicit consent.")
if "zoz-product-leads" not in landing:
    errors.append("Landing page is not connected to the lead-capture Edge Function.")
if "service_role" in landing.lower() or "service_role" in notice.lower():
    errors.append("A privileged Supabase key must never appear in public HTML.")
if "grant select, insert, update, delete" in guide.lower():
    errors.append("Guide RLS example grants DELETE without a corresponding delete policy.")
if "لا ترسل الصفحة رسائل بريد آلية حالياً" not in landing:
    errors.append("Landing page must accurately disclose that automated email is not enabled.")
if "طلب حذف" not in notice:
    errors.append("Data notice must describe how to request deletion.")

if errors:
    print("\n".join(f"ERROR: {item}" for item in errors))
    raise SystemExit(1)
print(f"Validated {len(parsers)} Arabic product-guide pages: local links, anchors, consent, lead endpoint, and public-key checks passed.")
