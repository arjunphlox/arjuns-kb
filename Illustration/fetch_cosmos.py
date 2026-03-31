#!/usr/bin/env python3
"""Fetch Cosmos.so 'illustration' collection and export as markdown with images."""

import json
import re
import ssl
import sys
import time
import urllib.request
import urllib.error
import hashlib
from pathlib import Path

BASE_DIR = Path(__file__).parent
IMAGES_DIR = BASE_DIR / "images"
OUTPUT_MD = BASE_DIR / "Illustration.md"
COLLECTION_URL = "https://www.cosmos.so/arjunphlox/illustration"
GRAPHQL_URL = "https://api.www.cosmos.so/graphql"
CLUSTER_ID = 1952514795  # Extracted from __NEXT_DATA__

CDN_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "Referer": "https://www.cosmos.so/",
    "Accept": "image/webp,image/*,*/*",
}

# SSL context that doesn't verify (some CDNs cause issues with system Python)
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE


def build_query(cluster_id, cursor=None):
    cursor_part = f', pageCursor: "{cursor}"' if cursor else ""
    return json.dumps({"query": f"""{{
  elements(filters: {{ clusterId: {cluster_id} }}, meta: {{ pageSize: 40{cursor_part} }}) {{
    items {{
      __typename
      ... on ArticleElement {{ id articleTitle sourceUrl type image {{ url }} generatedCaption {{ text }} computerVisionTags }}
      ... on ImageElement {{ id sourceUrl type image {{ url }} generatedCaption {{ text }} computerVisionTags }}
      ... on PinterestElement {{ id sourceUrl type image {{ url }} generatedCaption {{ text }} computerVisionTags }}
      ... on InstagramElement {{ id sourceUrl type image {{ url }} generatedCaption {{ text }} computerVisionTags }}
      ... on TwitterElement {{ id sourceUrl type image {{ url }} generatedCaption {{ text }} computerVisionTags }}
      ... on Element {{ id sourceUrl type image {{ url }} generatedCaption {{ text }} computerVisionTags }}
    }}
    meta {{ nextPageCursor count }}
  }}
}}"""})


def fetch_url(url, headers=None, data=None, retries=3, timeout=30):
    """Fetch URL with retries."""
    hdrs = headers or {}
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=data, headers=hdrs)
            with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as resp:
                return resp.read()
        except (urllib.error.URLError, urllib.error.HTTPError, OSError) as e:
            print(f"  Attempt {attempt+1}/{retries} failed for {url[:80]}: {e}")
            if attempt < retries - 1:
                time.sleep(2 * (attempt + 1))
            else:
                raise


def fetch_all_items():
    """Fetch all items from the collection via paginated GraphQL."""
    print(f"Fetching items via GraphQL API (cluster ID: {CLUSTER_ID})...")
    all_items = []
    cursor = None
    page = 0

    while True:
        page += 1
        payload = build_query(CLUSTER_ID, cursor).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "User-Agent": CDN_HEADERS["User-Agent"],
            "Referer": "https://www.cosmos.so/",
            "Origin": "https://www.cosmos.so",
        }

        raw = fetch_url(GRAPHQL_URL, headers=headers, data=payload)
        data = json.loads(raw.decode("utf-8"))

        if "errors" in data:
            print(f"  GraphQL errors: {data['errors']}")
            break

        elements = data.get("data", {}).get("elements", {})
        items = elements.get("items", [])
        meta = elements.get("meta", {})
        total = meta.get("count", "?")
        next_cursor = meta.get("nextPageCursor")

        all_items.extend(items)
        print(f"  Page {page}: fetched {len(items)} items (total so far: {len(all_items)}/{total})")

        if not next_cursor or not items:
            break
        cursor = next_cursor
        time.sleep(0.5)

    print(f"  Total items fetched: {len(all_items)}")
    return all_items


def download_image(url, item_id):
    """Download an image and return the local filename."""
    if not url:
        return None

    ext = ".jpg"
    url_lower = url.lower()
    for check_ext in [".png", ".webp", ".gif", ".svg"]:
        if check_ext in url_lower:
            ext = check_ext
            break

    url_hash = hashlib.md5(url.encode()).hexdigest()[:10]
    short_id = str(item_id or url_hash)[:8]
    filename = f"{short_id}_{url_hash}{ext}"
    filepath = IMAGES_DIR / filename

    if filepath.exists():
        return filename

    try:
        img_data = fetch_url(url, headers=CDN_HEADERS, timeout=20)
        with open(filepath, "wb") as f:
            f.write(img_data)
        return filename
    except Exception as e:
        print(f"  Failed to download image: {e}")
        return None


def generate_markdown(items):
    """Generate markdown content from items."""
    print("Downloading images and generating markdown...")

    lines = [
        "# Illustration",
        "",
        f"*Collection from [Cosmos.so]({COLLECTION_URL}) -- {len(items)} items*",
        "",
        "---",
        "",
    ]

    for i, item in enumerate(items):
        if not item:
            continue

        item_id = item.get("id", f"item-{i}")
        typename = item.get("__typename", "Element")
        source_url = item.get("sourceUrl", "")
        title = item.get("articleTitle", "")
        image_info = item.get("image") or {}
        image_url = image_info.get("url", "")
        caption_obj = item.get("generatedCaption") or {}
        caption_text = re.sub(r'</?n>', '', caption_obj.get("text", ""))
        tags = item.get("computerVisionTags") or []

        # Download image
        local_img = None
        if image_url:
            local_img = download_image(image_url, item_id)
            if (i + 1) % 10 == 0:
                print(f"  Progress: {i+1}/{len(items)} items processed")

        # Build display title
        display_title = title or caption_text or f"Item {i+1}"
        if len(display_title) > 120:
            display_title = display_title[:117] + "..."

        lines.append(f"### {i+1}. {display_title}")
        lines.append("")

        if local_img:
            lines.append(f"![{display_title}](images/{local_img})")
            lines.append("")

        if source_url:
            display_url = source_url[:60] + ("..." if len(source_url) > 60 else "")
            lines.append(f"**Source:** [{display_url}]({source_url})")
        if typename and typename != "Element":
            lines.append(f"**Type:** {typename.replace('Element', '')}")
        if caption_text and caption_text != display_title:
            lines.append(f"**Caption:** {caption_text}")
        if tags:
            tag_str = ", ".join(f"`{t}`" for t in tags[:15])
            lines.append(f"**Tags:** {tag_str}")

        lines.append("")
        lines.append("---")
        lines.append("")

    return "\n".join(lines)


def main():
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    items = fetch_all_items()
    if not items:
        print("No items found. Exiting.")
        sys.exit(1)

    md_content = generate_markdown(items)
    with open(OUTPUT_MD, "w", encoding="utf-8") as f:
        f.write(md_content)

    img_count = len(list(IMAGES_DIR.glob("*")))
    print(f"\nDone! Markdown saved to: {OUTPUT_MD}")
    print(f"Images saved to: {IMAGES_DIR}")
    print(f"Total items: {len(items)}, Images downloaded: {img_count}")


if __name__ == "__main__":
    main()
