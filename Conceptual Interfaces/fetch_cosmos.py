#!/usr/bin/env python3
"""Fetch Cosmos.so collection 'conceptual-interfaces' and export as enhanced markdown."""

import json
import os
import re
import urllib.request
import urllib.error
import ssl
import hashlib
from pathlib import Path

CLUSTER_ID = "873394047"
API_URL = "https://api.www.cosmos.so/graphql"
BASE_DIR = Path(__file__).parent
IMAGES_DIR = BASE_DIR / "images"
OUTPUT_MD = BASE_DIR / "Conceptual Interfaces.md"

GRAPHQL_QUERY = """
{ elements(filters: { clusterId: CLUSTER_ID_PLACEHOLDER }, meta: { pageSize: 40 PAGE_CURSOR_PLACEHOLDER }) {
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

# Allow unverified SSL for CDN image downloads if needed
ssl_ctx = ssl.create_default_context()


def graphql_request(cursor=None):
    """Send a GraphQL request and return parsed JSON."""
    query = GRAPHQL_QUERY.replace("CLUSTER_ID_PLACEHOLDER", CLUSTER_ID)
    if cursor:
        query = query.replace("PAGE_CURSOR_PLACEHOLDER", f', pageCursor: "{cursor}"')
    else:
        query = query.replace("PAGE_CURSOR_PLACEHOLDER", "")

    payload = json.dumps({"query": query}).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, context=ssl_ctx, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_all_items():
    """Paginate through all items in the collection."""
    all_items = []
    cursor = None
    page = 0
    while True:
        page += 1
        print(f"Fetching page {page}...")
        data = graphql_request(cursor)
        elements = data.get("data", {}).get("elements", {})
        items = elements.get("items", [])
        meta = elements.get("meta", {})
        all_items.extend(items)
        print(f"  Got {len(items)} items (total so far: {len(all_items)}, API count: {meta.get('count')})")
        cursor = meta.get("nextPageCursor")
        if not cursor:
            break
    return all_items


def download_image(url, item_id):
    """Download an image and return the local filename, or None on failure."""
    if not url:
        return None
    # Determine extension from URL
    ext = ".jpg"
    url_path = url.split("?")[0]
    for candidate in [".png", ".webp", ".gif", ".jpeg", ".jpg", ".svg"]:
        if candidate in url_path.lower():
            ext = candidate
            break

    # Create a short but unique filename
    url_hash = hashlib.md5(url.encode()).hexdigest()[:8]
    filename = f"{item_id}_{url_hash}{ext}"
    filepath = IMAGES_DIR / filename

    if filepath.exists():
        print(f"  Image already exists: {filename}")
        return filename

    try:
        req = urllib.request.Request(url, headers=CDN_HEADERS)
        with urllib.request.urlopen(req, context=ssl_ctx, timeout=30) as resp:
            data = resp.read()
        filepath.write_bytes(data)
        size_kb = len(data) / 1024
        print(f"  Downloaded: {filename} ({size_kb:.1f} KB)")
        return filename
    except Exception as e:
        print(f"  Failed to download image for {item_id}: {e}")
        return None


def sanitize_title(text):
    """Clean up a title string."""
    if not text:
        return ""
    # Remove HTML tags
    text = re.sub(r"<[^>]+>", "", text)
    return text.strip()


def build_markdown(items):
    """Build the enhanced markdown content."""
    lines = []
    lines.append("# Conceptual Interfaces")
    lines.append("")
    lines.append(f"> Cosmos.so collection by [@arjunphlox](https://www.cosmos.so/arjunphlox/conceptual-interfaces)")
    lines.append(f">")
    lines.append(f"> {len(items)} items collected")
    lines.append("")
    lines.append("---")
    lines.append("")

    for i, item in enumerate(items, 1):
        typename = item.get("__typename", "Element")
        item_id = item.get("id", "unknown")
        source_url = item.get("sourceUrl", "")
        item_type = item.get("type", "")
        article_title = sanitize_title(item.get("articleTitle", ""))
        caption_obj = item.get("generatedCaption")
        caption = caption_obj.get("text", "") if caption_obj else ""
        tags = item.get("computerVisionTags") or []
        image_obj = item.get("image")
        image_url = image_obj.get("url", "") if image_obj else ""

        # Title: use articleTitle if available, otherwise derive from type/caption
        if article_title:
            title = article_title
        elif caption:
            title = caption[:80] + ("..." if len(caption) > 80 else "")
        else:
            title = f"{typename} #{item_id}"

        lines.append(f"## {i}. {title}")
        lines.append("")

        # Type badge
        type_label = typename.replace("Element", "").strip() or item_type or "Item"
        lines.append(f"**Type:** {type_label}  ")

        # Source link
        if source_url:
            lines.append(f"**Source:** [{source_url}]({source_url})  ")

        lines.append("")

        # Image
        if image_url:
            local_file = download_image(image_url, item_id)
            if local_file:
                lines.append(f"![{title}](images/{local_file})")
            else:
                lines.append(f"![{title}]({image_url})")
            lines.append("")

        # Caption
        if caption:
            lines.append(f"*{caption}*")
            lines.append("")

        # Tags
        if tags:
            tag_str = " ".join(f"`{t}`" for t in tags)
            lines.append(f"**Tags:** {tag_str}")
            lines.append("")

        lines.append("---")
        lines.append("")

    return "\n".join(lines)


def main():
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    print("=== Fetching Cosmos.so collection: Conceptual Interfaces ===")
    items = fetch_all_items()
    print(f"\nTotal items fetched: {len(items)}")

    if not items:
        print("No items found. Exiting.")
        return

    print("\n=== Building markdown and downloading images ===")
    md_content = build_markdown(items)

    OUTPUT_MD.write_text(md_content, encoding="utf-8")
    print(f"\nMarkdown saved to: {OUTPUT_MD}")

    image_count = len(list(IMAGES_DIR.glob("*")))
    print(f"Images downloaded: {image_count}")
    print("Done!")


if __name__ == "__main__":
    main()
