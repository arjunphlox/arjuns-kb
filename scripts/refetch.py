#!/usr/bin/env python3
"""
Stello — Re-fetch script for items without images

Re-attempts OG metadata + image fetching for items that don't have images.
Skips domains known to block scraping (Twitter/X, Instagram, etc.).
Also improves titles for items with junk/numeric titles.

Usage:
  python3 refetch.py preview          # Show what would be re-fetched
  python3 refetch.py run              # Re-fetch all eligible items
  python3 refetch.py run --limit 50   # Re-fetch first 50 eligible items
"""

import os
import sys
import re
import html
import json
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime, timezone

KB_ROOT = Path(__file__).parent.parent
ITEMS_DIR = KB_ROOT / "_items"

# Domains that block OG scraping — skip these
BLOCKED_DOMAINS = {
    "x.com", "twitter.com", "instagram.com", "threads.net",
    "facebook.com", "fb.com", "tiktok.com",
}

# Domains where images are unlikely but metadata might improve
METADATA_ONLY_DOMAINS = {
    "figma.com",  # Figma community pages sometimes have OG images
}


def parse_frontmatter(item_md_path):
    """Parse frontmatter fields from item.md."""
    with open(item_md_path, "r") as f:
        content = f.read()

    if not content.startswith("---"):
        return None, content

    end = content.index("---", 3)
    fm_text = content[3:end].strip()
    body = content[end + 3:]

    data = {}
    for line in fm_text.split("\n"):
        line = line.strip()
        if not line or line.startswith("-") or line.startswith("#"):
            continue
        match = re.match(r'^(\w+):\s*(.*)', line)
        if match:
            key = match.group(1)
            val = match.group(2).strip()
            if val.startswith('"') and val.endswith('"'):
                val = val[1:-1]
            elif val == "null":
                val = None
            data[key] = val

    return data, content


def fetch_og_metadata(url):
    """Fetch Open Graph metadata from a URL."""
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        })
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read(80000).decode("utf-8", errors="replace")

        meta = {}

        # OG tags (both attribute orders)
        for m in re.finditer(r'<meta\s+(?:property|name)=["\']og:(\w+)["\']\s+content=["\']([^"\']*)["\']', raw, re.I):
            meta[f"og:{m.group(1)}"] = m.group(2)
        for m in re.finditer(r'<meta\s+content=["\']([^"\']*)["\'].*?(?:property|name)=["\']og:(\w+)["\']', raw, re.I):
            meta[f"og:{m.group(2)}"] = m.group(1)

        # Twitter card image (fallback)
        if "og:image" not in meta:
            tw_match = re.search(r'<meta\s+(?:name|property)=["\']twitter:image["\']\s+content=["\']([^"\']+)["\']', raw, re.I)
            if not tw_match:
                tw_match = re.search(r'<meta\s+content=["\']([^"\']+)["\']\s+(?:name|property)=["\']twitter:image["\']', raw, re.I)
            if tw_match:
                meta["og:image"] = tw_match.group(1)

        # Favicon / apple-touch-icon as last resort
        if "og:image" not in meta:
            icon_match = re.search(r'<link[^>]+rel=["\']apple-touch-icon["\'][^>]+href=["\']([^"\']+)["\']', raw, re.I)
            if icon_match:
                icon_url = icon_match.group(1)
                if not icon_url.startswith("http"):
                    from urllib.parse import urljoin
                    icon_url = urljoin(url, icon_url)
                meta["og:image"] = icon_url
                meta["_icon_fallback"] = True

        # Title
        title_match = re.search(r'<title[^>]*>([^<]+)</title>', raw, re.I)
        if title_match:
            meta["title"] = html.unescape(title_match.group(1).strip())

        # Description
        desc_match = re.search(r'<meta\s+name=["\']description["\']\s+content=["\']([^"\']*)["\']', raw, re.I)
        if not desc_match:
            desc_match = re.search(r'<meta\s+content=["\']([^"\']*)["\'].*?name=["\']description["\']', raw, re.I)
        if desc_match:
            meta["description"] = html.unescape(desc_match.group(1))

        meta["_status"] = "fetched"
        return meta

    except urllib.error.HTTPError as e:
        return {"_status": "error", "_code": e.code}
    except Exception as e:
        return {"_status": "error", "_error": str(e)[:100]}


def download_image(img_url, dest_path, source_url=None):
    """Download image to destination path. Returns True on success."""
    try:
        # Resolve relative URLs
        if not img_url.startswith("http"):
            if source_url:
                from urllib.parse import urljoin
                img_url = urljoin(source_url, img_url)
            else:
                return False

        req = urllib.request.Request(img_url, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
            "Accept": "image/webp,image/avif,image/*,*/*",
            "Referer": source_url or "",
        })
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = resp.read()
            if len(data) > 2000:  # Skip tiny/broken images (icons < 2KB)
                with open(dest_path, "wb") as f:
                    f.write(data)
                return True
    except Exception:
        pass
    return False


def update_item_md(item_path, updates):
    """Update specific fields in item.md frontmatter."""
    with open(item_path, "r") as f:
        content = f.read()

    for key, value in updates.items():
        if value is None:
            continue
        # Escape quotes in value
        safe_val = str(value).replace('"', "'")

        # Try to replace existing field
        pattern = rf'^{key}:\s*.*$'
        replacement = f'{key}: "{safe_val}"'
        new_content, count = re.subn(pattern, replacement, content, count=1, flags=re.MULTILINE)
        if count > 0:
            content = new_content
        # If field doesn't exist, add before tags: line
        else:
            content = content.replace("\ntags:", f"\n{key}: \"{safe_val}\"\ntags:")

    with open(item_path, "w") as f:
        f.write(content)


def get_image_ext(url):
    """Determine image extension from URL."""
    url_lower = url.lower()
    if ".png" in url_lower:
        return ".png"
    elif ".webp" in url_lower:
        return ".webp"
    elif ".svg" in url_lower:
        return ".svg"
    return ".jpg"


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 refetch.py preview|run [--limit N]")
        sys.exit(1)

    mode = sys.argv[1]
    limit = None
    if "--limit" in sys.argv:
        idx = sys.argv.index("--limit")
        if idx + 1 < len(sys.argv):
            limit = int(sys.argv[idx + 1])

    dry_run = mode == "preview"

    # Find items without images
    eligible = []
    skipped_blocked = 0
    already_has_image = 0

    for item_dir in sorted(ITEMS_DIR.iterdir()):
        if not item_dir.is_dir():
            continue
        item_md = item_dir / "item.md"
        if not item_md.exists():
            continue

        # Check if already has an image
        has_image = any(
            f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp", ".gif")
            and f.stat().st_size > 2000
            for f in item_dir.iterdir() if f.is_file()
        )
        if has_image:
            already_has_image += 1
            continue

        data, _ = parse_frontmatter(item_md)
        if not data:
            continue

        source_url = data.get("source_url", "")
        domain = data.get("domain", "")
        title = data.get("title", "")

        # Skip blocked domains
        if domain in BLOCKED_DOMAINS:
            skipped_blocked += 1
            continue

        eligible.append({
            "dir": item_dir,
            "md": item_md,
            "url": source_url,
            "domain": domain,
            "title": title,
            "slug": item_dir.name,
        })

    print(f"\n  Items with images: {already_has_image}")
    print(f"  Items blocked (Twitter/IG): {skipped_blocked}")
    print(f"  Eligible for re-fetch: {len(eligible)}")

    if limit:
        eligible = eligible[:limit]
        print(f"  Processing first {limit}")

    if dry_run:
        print(f"\n  Top 20 eligible items:")
        for item in eligible[:20]:
            print(f"    {item['title'][:60]} ({item['domain']})")
        print(f"\n  Run 'python3 refetch.py run' to re-fetch.")
        return

    # Re-fetch
    fetched_images = 0
    improved_titles = 0
    failed = 0

    for i, item in enumerate(eligible):
        slug = item["slug"]
        url = item["url"]
        title = item["title"]

        print(f"  [{i+1}/{len(eligible)}] {item['domain']}: {title[:50]}...", end=" ", flush=True)

        if not url:
            print("(no url)")
            failed += 1
            continue

        og = fetch_og_metadata(url)

        if og.get("_status") != "fetched":
            code = og.get("_code", og.get("_error", "?"))
            print(f"({code})")
            failed += 1
            continue

        updates = {}

        # Try to get image
        og_image = og.get("og:image")
        if og_image:
            ext = get_image_ext(og_image)
            dest = item["dir"] / f"og-image{ext}"
            if download_image(og_image, dest, url):
                updates["og_image"] = f"og-image{ext}"
                fetched_images += 1
                print("img", end=" ")
            else:
                print("(img fail)", end=" ")

        # Improve title if current one is junk
        is_junk = len(title) <= 5 or title.isdigit() or title.lower() in ("reel", "home", "untitled")
        og_title = og.get("og:title", og.get("title", ""))
        if is_junk and og_title and len(og_title) > 5:
            updates["title"] = html.unescape(og_title)[:200]
            improved_titles += 1
            print("title", end=" ")

        # Improve summary if empty or generic
        summary = ""
        with open(item["md"], "r") as f:
            content = f.read()
            sm = re.search(r'summary:\s*"([^"]*)"', content)
            if sm:
                summary = sm.group(1)

        og_desc = og.get("og:description", og.get("description", ""))
        if og_desc and (not summary or summary.startswith("Saved from")):
            updates["summary"] = html.unescape(og_desc)[:200]

        if updates:
            update_item_md(item["md"], updates)

        print("done")

    print(f"\n  Re-fetch complete:")
    print(f"    Images fetched: {fetched_images}")
    print(f"    Titles improved: {improved_titles}")
    print(f"    Failed/unreachable: {failed}")
    print(f"\n  Run 'python3 analyze.py index' to rebuild index.")


if __name__ == "__main__":
    main()
