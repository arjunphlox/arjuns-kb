#!/usr/bin/env python3
"""Fetch Cosmos.so collection and export as markdown with images."""

import json
import os
import re
import time
import urllib.request
import urllib.error
from urllib.parse import urlparse

CLUSTER_ID = "292283556"
GRAPHQL_URL = "https://api.www.cosmos.so/graphql"
PAGE_SIZE = 40

BASE_DIR = "/Users/arjunphlox/Documents/Personal Projects/Arjun's KB/Digital Product Design"
IMAGES_DIR = os.path.join(BASE_DIR, "images")
OUTPUT_MD = os.path.join(BASE_DIR, "Digital Product Design.md")

GRAPHQL_QUERY = """
{
  elements(filters: { clusterId: CLUSTER_ID }, meta: { pageSize: PAGE_SIZE, pageCursor: PAGE_CURSOR }) {
    items {
      __typename
      ... on ArticleElement { id articleTitle sourceUrl type image { url } generatedCaption { text } computerVisionTags }
      ... on ImageElement { id sourceUrl type image { url } generatedCaption { text } computerVisionTags }
      ... on PinterestElement { id sourceUrl type image { url } generatedCaption { text } computerVisionTags }
      ... on InstagramElement { id sourceUrl type image { url } generatedCaption { text } computerVisionTags }
      ... on TwitterElement { id sourceUrl type image { url } generatedCaption { text } computerVisionTags }
      ... on Element { id sourceUrl type image { url } generatedCaption { text } computerVisionTags }
    }
    meta { nextPageCursor count }
  }
}
"""

CDN_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "Referer": "https://www.cosmos.so/",
    "Accept": "image/webp,image/*,*/*",
}


def sanitize_filename(text):
    """Sanitize text for use as a filename."""
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'\s+', '_', text.strip())
    return text[:80] if text else "untitled"


def get_title(item):
    """Get title from item using fallback chain."""
    # 1. articleTitle
    title = item.get("articleTitle")
    if title and title.strip():
        return title.strip()

    # 2. generatedCaption.text (cleaned)
    caption = item.get("generatedCaption")
    if caption and isinstance(caption, dict):
        text = caption.get("text", "")
        if text and text.strip():
            # Clean: take first sentence, limit length
            clean = text.strip().split(".")[0].strip()
            if clean:
                return clean[:120]

    # 3. computerVisionTags
    tags = item.get("computerVisionTags")
    if tags and isinstance(tags, list) and len(tags) > 0:
        return ", ".join(tags[:5])

    # 4. domain from sourceUrl
    source_url = item.get("sourceUrl")
    if source_url:
        try:
            domain = urlparse(source_url).netloc
            if domain:
                return domain
        except Exception:
            pass

    return "Untitled"


def build_query(cursor=None):
    """Build GraphQL query string."""
    q = GRAPHQL_QUERY.replace("CLUSTER_ID", CLUSTER_ID)
    q = q.replace("PAGE_SIZE", str(PAGE_SIZE))
    if cursor:
        q = q.replace("PAGE_CURSOR", f'"{cursor}"')
    else:
        q = q.replace(', pageCursor: PAGE_CURSOR', '')
    return q


def fetch_graphql(cursor=None):
    """Fetch one page of items from the GraphQL API."""
    query = build_query(cursor)
    payload = json.dumps({"query": query}).encode("utf-8")
    req = urllib.request.Request(
        GRAPHQL_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
            "Origin": "https://www.cosmos.so",
            "Referer": "https://www.cosmos.so/",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_all_items():
    """Fetch all items with pagination."""
    all_items = []
    cursor = None
    page = 0

    while True:
        page += 1
        print(f"Fetching page {page}...")
        data = fetch_graphql(cursor)

        elements = data.get("data", {}).get("elements", {})
        items = elements.get("items", [])
        meta = elements.get("meta", {})

        all_items.extend(items)
        print(f"  Got {len(items)} items (total: {len(all_items)}/{meta.get('count', '?')})")

        cursor = meta.get("nextPageCursor")
        if not cursor:
            break
        time.sleep(0.5)

    return all_items


def download_image(url, filepath):
    """Download an image file."""
    if os.path.exists(filepath):
        return True
    try:
        req = urllib.request.Request(url, headers=CDN_HEADERS)
        with urllib.request.urlopen(req, timeout=30) as resp:
            with open(filepath, "wb") as f:
                f.write(resp.read())
        return True
    except Exception as e:
        print(f"  Failed to download image: {e}")
        return False


def main():
    os.makedirs(IMAGES_DIR, exist_ok=True)

    print("Fetching all items from Cosmos.so collection...")
    items = fetch_all_items()
    print(f"\nTotal items fetched: {len(items)}")

    # Build markdown
    md_lines = [
        "# Digital Product Design",
        "",
        f"> Cosmos.so collection: [digital-product-design](https://www.cosmos.so/arjunphlox/digital-product-design)",
        f"> Total items: {len(items)}",
        "",
        "---",
        "",
    ]

    # Group by type
    type_groups = {}
    for item in items:
        t = item.get("__typename", item.get("type", "Unknown"))
        type_groups.setdefault(t, []).append(item)

    print(f"\nTypes found: {', '.join(f'{k} ({len(v)})' for k, v in type_groups.items())}")
    print(f"\nDownloading images and building markdown...")

    downloaded = 0
    failed = 0

    for idx, item in enumerate(items, 1):
        title = get_title(item)
        element_id = item.get("id", f"unknown_{idx}")
        source_url = item.get("sourceUrl", "")
        typename = item.get("__typename", "")
        image_url = None

        img_data = item.get("image")
        if img_data and isinstance(img_data, dict):
            image_url = img_data.get("url")

        caption = ""
        cap_data = item.get("generatedCaption")
        if cap_data and isinstance(cap_data, dict):
            caption = cap_data.get("text", "")

        tags = item.get("computerVisionTags", []) or []

        # Download image
        local_image = None
        if image_url:
            safe_title = sanitize_filename(title)
            filename = f"{safe_title}_{element_id}.webp"
            filepath = os.path.join(IMAGES_DIR, filename)
            if download_image(image_url, filepath):
                local_image = f"images/{filename}"
                downloaded += 1
            else:
                failed += 1

        # Write markdown entry
        md_lines.append(f"## {idx}. {title}")
        md_lines.append("")

        if local_image:
            md_lines.append(f"![{title}]({local_image})")
            md_lines.append("")

        if source_url:
            md_lines.append(f"**Source:** [{source_url}]({source_url})")
            md_lines.append("")

        if typename:
            md_lines.append(f"**Type:** {typename}")
            md_lines.append("")

        if caption:
            md_lines.append(f"**Caption:** {caption}")
            md_lines.append("")

        if tags:
            md_lines.append(f"**Tags:** {', '.join(tags)}")
            md_lines.append("")

        md_lines.append("---")
        md_lines.append("")

        if idx % 20 == 0:
            print(f"  Processed {idx}/{len(items)} items...")

    # Write markdown file
    with open(OUTPUT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(md_lines))

    print(f"\nDone!")
    print(f"  Markdown: {OUTPUT_MD}")
    print(f"  Images downloaded: {downloaded}")
    print(f"  Images failed: {failed}")
    print(f"  Total entries: {len(items)}")


if __name__ == "__main__":
    main()
