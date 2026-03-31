#!/usr/bin/env python3
"""
Arjun's KB — Item Analysis Pipeline

Reads collection markdown files, extracts URLs, checks for duplicates,
and generates rich item.md files with weighted categorized tags.

Usage:
  python3 analyze.py scan <collection.md>         # Show items to analyze
  python3 analyze.py analyze <collection.md> [N]   # Analyze N items (default: all)
  python3 analyze.py index                         # Rebuild index.json from _items/
  python3 analyze.py status                        # Show analysis progress
"""

import os
import sys
import json
import re
import hashlib
import html
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from difflib import SequenceMatcher

KB_ROOT = Path(__file__).parent.parent
ITEMS_DIR = KB_ROOT / "_items"
INDEX_FILE = KB_ROOT / "index.json"


# ─── URL Extraction ────────────────────────────────────────────────

def extract_links_from_markdown(md_path):
    """Extract all URLs from a collection markdown table."""
    links = []
    with open(md_path, "r") as f:
        lines = f.readlines()

    collection_name = None
    for line in lines:
        if line.startswith("# "):
            collection_name = line[2:].strip()
            break

    for line in lines:
        if not line.startswith("|"):
            continue
        if "---" in line or "Item" in line and "Source" in line:
            continue

        # Handle escaped pipes in markdown tables: \| should not split
        safe_line = line.replace("\\|", "\x00")
        parts = [p.strip().replace("\x00", "|") for p in safe_line.split("|")]
        if len(parts) < 3:
            continue

        # Find the column with a URL — works for 3-col and 4-col tables
        title = ""
        source = ""
        for idx, p in enumerate(parts):
            if re.search(r'https?://', p):
                source = p
                # Title is the column before the URL column (skip empty leading col)
                title_idx = idx - 1
                while title_idx >= 0 and not parts[title_idx]:
                    title_idx -= 1
                if title_idx >= 0:
                    title = parts[title_idx]
                break

        if not source:
            continue

        # Skip View Image links (media-only items handled separately)
        if "[View Image]" in source:
            continue

        # Extract URL from markdown link or plain URL
        url_match = re.search(r'https?://[^\s\)]+', source)
        if url_match:
            url = url_match.group(0)
            links.append({
                "title": title,
                "url": url,
                "collection": collection_name or md_path.stem,
            })

    return links, collection_name


# ─── Duplicate Detection ───────────────────────────────────────────

def get_analyzed_items():
    """Load all already-analyzed items from _items/ folders."""
    items = []
    if not ITEMS_DIR.exists():
        return items

    for item_dir in ITEMS_DIR.iterdir():
        if not item_dir.is_dir():
            continue
        item_md = item_dir / "item.md"
        if not item_md.exists():
            continue

        frontmatter = parse_frontmatter(item_md)
        if frontmatter:
            frontmatter["_dir"] = str(item_dir)
            items.append(frontmatter)

    return items


def parse_frontmatter(md_path):
    """Parse YAML frontmatter from an item.md file."""
    with open(md_path, "r") as f:
        content = f.read()

    if not content.startswith("---"):
        return None

    end = content.index("---", 3)
    yaml_str = content[3:end].strip()

    # Simple YAML parser for our flat structure
    data = {}
    current_key = None
    current_list = None

    for line in yaml_str.split("\n"):
        line_stripped = line.strip()

        if not line_stripped or line_stripped.startswith("#"):
            continue

        # Handle list items (tags)
        if line_stripped.startswith("- "):
            if current_list is not None:
                # Parse tag objects: - { tag: "x", category: "y", weight: 0.9 }
                tag_match = re.search(r'tag:\s*"?([^",}]+)"?', line_stripped)
                if tag_match:
                    tag_data = {"tag": tag_match.group(1).strip()}
                    cat_match = re.search(r'category:\s*"?([^",}]+)"?', line_stripped)
                    weight_match = re.search(r'weight:\s*([0-9.]+)', line_stripped)
                    if cat_match:
                        tag_data["category"] = cat_match.group(1).strip()
                    if weight_match:
                        tag_data["weight"] = float(weight_match.group(1))
                    current_list.append(tag_data)
            continue

        # Handle key: value pairs
        kv_match = re.match(r'^(\w+):\s*(.*)', line_stripped)
        if kv_match:
            key = kv_match.group(1)
            value = kv_match.group(2).strip()

            if value == "":
                # Start of a list
                current_key = key
                current_list = []
                data[key] = current_list
            else:
                current_key = None
                current_list = None
                # Clean quotes
                if value.startswith('"') and value.endswith('"'):
                    value = value[1:-1]
                elif value == "null":
                    value = None
                data[key] = value

    return data


def check_duplicate(url, title, existing_items):
    """Check if an item is a duplicate of an existing item.

    Returns: (is_duplicate, confidence, matching_item) or (False, 0, None)
    """
    for item in existing_items:
        # Exact URL match
        item_url = item.get("source_url", "")
        if item_url and url and normalize_url(item_url) == normalize_url(url):
            return True, 1.0, item

        # Domain + path similarity
        if item_url and url:
            sim = url_similarity(item_url, url)
            if sim > 0.85:
                return True, sim, item

        # Title similarity
        item_title = item.get("title", "")
        if item_title and title:
            title_sim = SequenceMatcher(None, title.lower(), item_title.lower()).ratio()
            if title_sim > 0.8:
                return True, title_sim, item

    return False, 0, None


def normalize_url(url):
    """Normalize URL for comparison."""
    url = url.rstrip("/")
    url = re.sub(r'\?.*$', '', url)  # Remove query params
    url = re.sub(r'#.*$', '', url)  # Remove fragment
    url = url.replace("http://", "https://")
    url = url.replace("www.", "")
    return url.lower()


def url_similarity(url1, url2):
    """Calculate similarity between two URLs."""
    n1 = normalize_url(url1)
    n2 = normalize_url(url2)
    return SequenceMatcher(None, n1, n2).ratio()


# ─── Slug Generation ───────────────────────────────────────────────

def generate_slug(title, url):
    """Generate a URL-safe slug for the item folder."""
    # Use title if available, otherwise domain + path
    if title and title.strip():
        base = title.strip()
    elif url:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        base = parsed.netloc + parsed.path
    else:
        base = "untitled"

    # Sanitize
    slug = base.lower()
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    slug = re.sub(r'\s+', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    slug = slug.strip('-')[:50]

    # Add short hash for uniqueness
    url_hash = hashlib.md5((url or title or "").encode()).hexdigest()[:6]
    return f"{slug}-{url_hash}"


# ─── OG Metadata Extraction ───────────────────────────────────────

def fetch_og_metadata(url):
    """Fetch Open Graph metadata from a URL."""
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "text/html,application/xhtml+xml",
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            # Read first 50KB (enough for meta tags)
            html = resp.read(50000).decode("utf-8", errors="replace")

        meta = {}

        # Extract OG tags
        for match in re.finditer(r'<meta\s+(?:property|name)=["\']og:(\w+)["\']\s+content=["\']([^"\']*)["\']', html, re.I):
            meta[f"og:{match.group(1)}"] = match.group(2)
        # Also check reverse order (content before property)
        for match in re.finditer(r'<meta\s+content=["\']([^"\']*)["\'].*?(?:property|name)=["\']og:(\w+)["\']', html, re.I):
            meta[f"og:{match.group(2)}"] = match.group(1)

        # Extract title
        title_match = re.search(r'<title[^>]*>([^<]+)</title>', html, re.I)
        if title_match:
            meta["title"] = title_match.group(1).strip()

        # Extract meta description
        desc_match = re.search(r'<meta\s+name=["\']description["\']\s+content=["\']([^"\']*)["\']', html, re.I)
        if desc_match:
            meta["description"] = desc_match.group(1)

        meta["_status"] = "fetched"
        return meta

    except urllib.error.HTTPError as e:
        return {"_status": "error", "_code": e.code}
    except Exception as e:
        return {"_status": "error", "_error": str(e)}


def download_og_image(og_url, dest_path):
    """Download OG image to destination path."""
    try:
        req = urllib.request.Request(og_url, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
            "Accept": "image/webp,image/*,*/*",
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = resp.read()
            if len(data) > 1000:  # Skip tiny/broken images
                with open(dest_path, "wb") as f:
                    f.write(data)
                return True
    except Exception:
        pass
    return False


# ─── Tag Generation ────────────────────────────────────────────────

def extract_domain(url):
    """Extract clean domain from URL."""
    from urllib.parse import urlparse
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.replace("www.", "")
        return domain
    except Exception:
        return None


def generate_tags_from_metadata(title, url, og_meta, collection_name):
    """Generate weighted categorized tags from available metadata.

    This is the basic auto-tagger. Returns list of {tag, category, weight} dicts.
    """
    tags = []
    domain = extract_domain(url) if url else None

    # Format tag (from URL domain)
    if domain:
        format_map = {
            "instagram.com": "instagram",
            "x.com": "tweet",
            "twitter.com": "tweet",
            "pinterest.com": "pinterest",
            "behance.net": "behance",
            "dribbble.com": "dribbble",
            "youtube.com": "youtube",
            "youtu.be": "youtube",
            "vimeo.com": "vimeo",
            "codepen.io": "codepen",
            "codesandbox.io": "codesandbox",
            "github.com": "github",
            "medium.com": "article",
            "substack.com": "article",
            "figma.com": "figma",
        }
        fmt = format_map.get(domain, "website")
        tags.append({"tag": fmt, "category": "format", "weight": 0.4})

    # Domain tag from collection name
    if collection_name:
        col_tag = collection_name.lower().replace(" ", "-")
        tags.append({"tag": col_tag, "category": "domain", "weight": 0.7})

    # Extract keywords from title for subject tags
    if title:
        # Decode HTML entities first
        clean_title = html.unescape(title)

        # Common stop words + noise words
        stops = {"the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
                 "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
                 "has", "have", "had", "do", "does", "did", "will", "would", "could",
                 "should", "may", "might", "can", "this", "that", "it", "its", "not",
                 "no", "so", "if", "as", "into", "about", "up", "out", "all", "more",
                 "also", "how", "what", "when", "where", "who", "which", "than", "then",
                 "just", "like", "over", "such", "very", "your", "my", "our", "their",
                 "new", "one", "two", "three", "four", "five", "first", "last", "most",
                 "other", "some", "any", "each", "every", "both", "few", "many",
                 "inside", "story", "part", "page", "view", "click", "here", "see",
                 "use", "using", "used", "make", "made", "get", "got", "know",
                 "codesandbox", "codepen", "github", "medium", "www", "http", "https"}

        # Platform names to exclude (already captured as format tags)
        platform_noise = {d.replace(".com", "").replace(".io", "").replace(".net", "")
                          for d in format_map.keys()}
        stops.update(platform_noise)

        words = re.findall(r'[a-zA-Z]{3,}', clean_title.lower())
        # Filter: not stop word, not too short, not a middot/html artifact
        keywords = [w for w in words if w not in stops and len(w) > 2
                    and w not in ("middot", "nbsp", "amp", "quot")][:5]
        for i, kw in enumerate(keywords):
            weight = max(0.5, 0.8 - i * 0.1)
            tags.append({"tag": kw, "category": "subject", "weight": round(weight, 2)})

    # Extract from OG metadata
    if og_meta:
        og_desc = og_meta.get("og:description", og_meta.get("description", ""))
        if og_desc:
            desc_words = re.findall(r'[a-zA-Z]{4,}', html.unescape(og_desc).lower())
            stops_ext = {"this", "that", "with", "from", "have", "been", "will", "about",
                        "more", "also", "your", "their", "which", "when", "what", "where",
                        "years", "building", "based", "tool", "looking", "find", "work",
                        "best", "need", "help", "want", "take", "give", "keep", "thing"}
            existing_tags = {t["tag"] for t in tags}
            desc_kws = [w for w in desc_words if w not in stops and w not in stops_ext
                       and w not in platform_noise and w not in existing_tags][:3]
            for kw in desc_kws:
                tags.append({"tag": kw, "category": "subject", "weight": 0.5})

    # Skip adding raw domain as tag — it's noise (already captured in frontmatter)

    # Cap at 12 tags
    tags = sorted(tags, key=lambda t: t["weight"], reverse=True)[:12]
    return tags


# ─── Item Generation ───────────────────────────────────────────────

def generate_item_md(title, url, og_meta, tags, collection_name, slug):
    """Generate the item.md content with YAML frontmatter."""
    domain = extract_domain(url) if url else None
    og_title = og_meta.get("og:title", og_meta.get("title", title)) if og_meta else title
    og_title = html.unescape(og_title)
    og_desc = og_meta.get("og:description", og_meta.get("description", "")) if og_meta else ""
    if og_desc:
        og_desc = html.unescape(og_desc)
    has_og_image = og_meta and og_meta.get("og:image")

    # Determine og_image filename
    og_image_file = "null"
    if has_og_image:
        ext = ".jpg"
        og_img_url = og_meta["og:image"]
        if ".png" in og_img_url.lower():
            ext = ".png"
        elif ".webp" in og_img_url.lower():
            ext = ".webp"
        og_image_file = f'"og-image{ext}"'

    # Build summary from OG description or title
    summary = og_desc if og_desc else f"Saved from {domain or 'unknown source'}: {og_title}"
    summary = summary[:200]  # Cap length

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Build tags YAML
    tags_yaml = ""
    for t in tags:
        tags_yaml += f'  - {{ tag: "{t["tag"]}", category: "{t["category"]}", weight: {t["weight"]} }}\n'

    # Build frontmatter
    fm = f'''---
title: "{og_title.replace('"', "'")}"
source_url: "{url}"
slug: "{slug}"
domain: {f'"{domain}"' if domain else 'null'}
author: null
summary: "{summary.replace('"', "'")}"
og_image: {og_image_file}
status: active
link_last_checked: "{now[:10]}"
location: null
added_at: "{now}"
analyzed_at: "{now}"

tags:
{tags_yaml.rstrip()}
---

## Summary
{summary}

## Key Details
- **Source:** [{domain or "Unknown"}]({url})
- **Title:** {og_title}
{f"- **Description:** {og_desc[:150]}" if og_desc else ""}

## Visual Assets
{f"![OG Image](og-image{ext if has_og_image else '.jpg'})" if has_og_image else "_No image available_"}
'''
    return fm


# ─── Index Builder ─────────────────────────────────────────────────

def build_index():
    """Build index.json from all _items/ folders."""
    items = []
    if not ITEMS_DIR.exists():
        print("No _items/ directory found.")
        return

    for item_dir in sorted(ITEMS_DIR.iterdir()):
        if not item_dir.is_dir():
            continue
        item_md = item_dir / "item.md"
        if not item_md.exists():
            continue

        fm = parse_frontmatter(item_md)
        if not fm:
            continue

        # Check for og-image
        og_files = list(item_dir.glob("og-image.*"))
        has_image = len(og_files) > 0

        entry = {
            "slug": fm.get("slug", item_dir.name),
            "title": fm.get("title", "Untitled"),
            "source_url": fm.get("source_url"),
            "domain": fm.get("domain"),
            "author": fm.get("author"),
            "summary": fm.get("summary", ""),
            "status": fm.get("status", "active"),
            "location": fm.get("location"),
            "added_at": fm.get("added_at"),
            "has_image": has_image,
            "image_path": f"_items/{item_dir.name}/{og_files[0].name}" if has_image else None,
            "tags": fm.get("tags", []),
        }
        items.append(entry)

    # Write index
    with open(INDEX_FILE, "w") as f:
        json.dump({"items": items, "count": len(items), "built_at": datetime.now(timezone.utc).isoformat()}, f, indent=2)

    print(f"Built index.json with {len(items)} items.")
    return items


# ─── Main Commands ─────────────────────────────────────────────────

def cmd_scan(md_path):
    """Scan a collection markdown and show what can be analyzed."""
    path = Path(md_path)
    if not path.exists():
        # Try resolving relative to KB_ROOT
        path = KB_ROOT / md_path
    if not path.exists():
        print(f"File not found: {md_path}")
        return

    links, collection_name = extract_links_from_markdown(path)
    existing = get_analyzed_items()

    print(f"\n Collection: {collection_name or path.stem}")
    print(f" Total links: {len(links)}")

    new_items = []
    duplicates = []

    for link in links:
        is_dup, confidence, match = check_duplicate(link["url"], link["title"], existing)
        if is_dup:
            duplicates.append((link, confidence, match))
        else:
            new_items.append(link)

    print(f" New items to analyze: {len(new_items)}")
    print(f" Already analyzed (duplicates): {len(duplicates)}")

    if new_items:
        print(f"\n New items:")
        for i, item in enumerate(new_items, 1):
            domain = extract_domain(item["url"]) or "?"
            print(f"  {i}. [{domain}] {item['title'][:60]}")

    if duplicates:
        print(f"\n Duplicates (skipped):")
        for link, conf, match in duplicates:
            print(f"  ~ {link['title'][:40]} (matches: {match.get('title', '?')[:30]}, {conf:.0%})")

    return new_items


def cmd_analyze(md_path, batch_size=None):
    """Analyze items from a collection markdown."""
    path = Path(md_path)
    if not path.exists():
        path = KB_ROOT / md_path
    if not path.exists():
        print(f"File not found: {md_path}")
        return

    links, collection_name = extract_links_from_markdown(path)
    existing = get_analyzed_items()

    # Filter out duplicates
    new_items = []
    for link in links:
        is_dup, _, _ = check_duplicate(link["url"], link["title"], existing)
        if not is_dup:
            new_items.append(link)

    if not new_items:
        print(f"All items from '{collection_name}' are already analyzed!")
        return

    # Apply batch size
    if batch_size:
        new_items = new_items[:batch_size]

    print(f"\n Analyzing {len(new_items)} items from '{collection_name}'...\n")

    ITEMS_DIR.mkdir(exist_ok=True)
    analyzed = 0

    for i, item in enumerate(new_items, 1):
        title = item["title"]
        url = item["url"]
        domain = extract_domain(url) or "unknown"
        print(f"  [{i}/{len(new_items)}] {domain}: {title[:50]}...", end=" ", flush=True)

        # Fetch OG metadata
        og_meta = fetch_og_metadata(url)
        status = og_meta.get("_status", "error")

        if status == "fetched":
            print("fetched", end=" ", flush=True)
        else:
            code = og_meta.get("_code", "?")
            print(f"({code})", end=" ", flush=True)

        # Generate slug and tags
        og_title = og_meta.get("og:title", og_meta.get("title", title)) if status == "fetched" else title
        og_title = html.unescape(og_title)  # Decode HTML entities
        slug = generate_slug(og_title, url)
        tags = generate_tags_from_metadata(og_title, url, og_meta if status == "fetched" else None, collection_name)

        # Create item directory
        item_dir = ITEMS_DIR / slug
        item_dir.mkdir(exist_ok=True)
        (item_dir / "media").mkdir(exist_ok=True)

        # Download OG image
        og_image_url = og_meta.get("og:image") if status == "fetched" else None
        if og_image_url:
            # Make absolute URL if relative
            if og_image_url.startswith("//"):
                og_image_url = "https:" + og_image_url
            elif og_image_url.startswith("/"):
                from urllib.parse import urlparse
                parsed = urlparse(url)
                og_image_url = f"{parsed.scheme}://{parsed.netloc}{og_image_url}"

            ext = ".jpg"
            if ".png" in og_image_url.lower():
                ext = ".png"
            elif ".webp" in og_image_url.lower():
                ext = ".webp"

            img_path = item_dir / f"og-image{ext}"
            if download_og_image(og_image_url, img_path):
                print("img", end=" ", flush=True)

        # Generate and write item.md
        content = generate_item_md(title, url, og_meta if status == "fetched" else {}, tags, collection_name, slug)
        with open(item_dir / "item.md", "w") as f:
            f.write(content)

        analyzed += 1
        print("done")

    print(f"\n Analyzed {analyzed} items. Run 'analyze.py index' to rebuild search index.")


def cmd_status():
    """Show overall analysis progress."""
    if not ITEMS_DIR.exists():
        print("No _items/ directory found. Start by analyzing a collection.")
        return

    items = get_analyzed_items()
    print(f"\n Analysis Status")
    print(f" Total analyzed items: {len(items)}")

    # Count by status
    statuses = {}
    for item in items:
        s = item.get("status", "unknown")
        statuses[s] = statuses.get(s, 0) + 1

    for s, count in sorted(statuses.items()):
        print(f"  {s}: {count}")

    # Count with images
    with_images = sum(1 for d in ITEMS_DIR.iterdir()
                      if d.is_dir() and list(d.glob("og-image.*")))
    print(f" Items with images: {with_images}")

    # List collections and how many items are analyzed
    print(f"\n To scan a collection: python3 analyze.py scan <collection.md>")


# ─── Entry Point ───────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1]

    if command == "scan":
        if len(sys.argv) < 3:
            print("Usage: analyze.py scan <collection.md>")
            sys.exit(1)
        cmd_scan(sys.argv[2])

    elif command == "analyze":
        if len(sys.argv) < 3:
            print("Usage: analyze.py analyze <collection.md> [batch_size]")
            sys.exit(1)
        batch = int(sys.argv[3]) if len(sys.argv) > 3 else None
        cmd_analyze(sys.argv[2], batch)

    elif command == "index":
        build_index()

    elif command == "status":
        cmd_status()

    else:
        print(f"Unknown command: {command}")
        print(__doc__)
