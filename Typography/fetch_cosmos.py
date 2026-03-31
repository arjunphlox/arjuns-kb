#!/usr/bin/env python3
"""Fetch Cosmos.so typography collection and export as markdown with media."""

import json
import os
import re
import time
import urllib.request
import urllib.error
from urllib.parse import urlparse

CLUSTER_ID = "244784689"
GRAPHQL_URL = "https://api.www.cosmos.so/graphql"
BASE_DIR = "/Users/arjunphlox/Documents/Personal Projects/Arjun's KB/Typography"
IMAGES_DIR = os.path.join(BASE_DIR, "images")
MD_PATH = os.path.join(BASE_DIR, "Typography.md")

QUERY_TEMPLATE = """{{ elements(filters: {{ clusterId: {cluster_id} }}, meta: {{ pageSize: 40{cursor_part} }}) {{ items {{ __typename ... on ArticleElement {{ id articleTitle sourceUrl type image {{ url }} generatedCaption {{ text }} computerVisionTags }} ... on ImageElement {{ id sourceUrl type image {{ url }} generatedCaption {{ text }} computerVisionTags }} ... on PinterestElement {{ id sourceUrl type image {{ url }} generatedCaption {{ text }} computerVisionTags }} ... on InstagramElement {{ id sourceUrl type image {{ url }} generatedCaption {{ text }} computerVisionTags }} ... on TwitterElement {{ id sourceUrl type image {{ url }} generatedCaption {{ text }} computerVisionTags }} ... on Element {{ id sourceUrl type image {{ url }} generatedCaption {{ text }} computerVisionTags }} }} meta {{ nextPageCursor count }} }} }}"""


def fetch_graphql(cursor=None):
    cursor_part = f', pageCursor: "{cursor}"' if cursor else ""
    query = QUERY_TEMPLATE.format(cluster_id=CLUSTER_ID, cursor_part=cursor_part)
    payload = json.dumps({"query": query}).encode("utf-8")
    req = urllib.request.Request(
        GRAPHQL_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def clean_caption(text):
    if not text:
        return ""
    # Strip <n> tags and extra whitespace
    text = re.sub(r"</?n>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def title_from_caption(text, max_words=10):
    words = text.split()[:max_words]
    return " ".join(words)


def title_from_tags(tags, max_tags=4):
    if not tags:
        return ""
    return " ".join(t.title() for t in tags[:max_tags])


def domain_from_url(url):
    try:
        d = urlparse(url).netloc
        return d.replace("www.", "")
    except Exception:
        return ""


def generate_title(item):
    article_title = item.get("articleTitle") or ""
    caption_raw = (item.get("generatedCaption") or {}).get("text") or ""
    caption = clean_caption(caption_raw)
    tags = item.get("computerVisionTags") or []
    source_url = item.get("sourceUrl") or ""
    item_id = item.get("id", "unknown")

    if source_url:
        # Link-based item
        if article_title and article_title.strip():
            return article_title.strip()
        if caption:
            return title_from_caption(caption)
        if tags:
            return title_from_tags(tags)
        return domain_from_url(source_url) or f"Link {item_id}"
    else:
        # Media-only item
        if caption:
            return title_from_caption(caption, max_words=10)
        if tags:
            return title_from_tags(tags)
        return f"Untitled Image {item_id}"


def sanitize_filename(title, max_len=50):
    s = title.lower()
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    s = re.sub(r"\s+", "-", s).strip("-")
    return s[:max_len]


def download_image(url, filepath):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
            "Referer": "https://www.cosmos.so/",
            "Accept": "image/webp,image/*,*/*",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            with open(filepath, "wb") as f:
                f.write(resp.read())
        return True
    except Exception as e:
        print(f"  Failed to download {url}: {e}")
        return False


def main():
    os.makedirs(IMAGES_DIR, exist_ok=True)

    # Step 1 & 2: Fetch all items via paginated GraphQL
    all_items = []
    cursor = None
    page = 0
    total_count = None

    while True:
        page += 1
        print(f"Fetching page {page} (cursor: {cursor})...")
        try:
            data = fetch_graphql(cursor)
        except Exception as e:
            print(f"  Error fetching page {page}: {e}")
            break

        elements = data.get("data", {}).get("elements", {})
        items = elements.get("items", [])
        meta = elements.get("meta", {})

        if total_count is None:
            total_count = meta.get("count", "?")
            print(f"Total items reported by API: {total_count}")

        all_items.extend(items)
        print(f"  Got {len(items)} items (total so far: {len(all_items)})")

        next_cursor = meta.get("nextPageCursor")
        if not next_cursor:
            print("No more pages.")
            break
        cursor = next_cursor
        time.sleep(0.3)  # Be polite

    print(f"\nFetched {len(all_items)} items total.")

    # Step 3 & 4: Process items
    rows = []  # (title, source_or_image_link)
    media_download_count = 0
    media_fail_count = 0

    for i, item in enumerate(all_items):
        title = generate_title(item)
        source_url = item.get("sourceUrl") or ""
        item_id = item.get("id", "unknown")
        image_url = (item.get("image") or {}).get("url") or ""

        if source_url:
            rows.append((title, source_url))
        else:
            # Media-only: download image
            if image_url:
                safe_title = sanitize_filename(title)
                filename = f"{safe_title}_{item_id}.webp"
                filepath = os.path.join(IMAGES_DIR, filename)
                rel_path = f"images/{filename}"

                if not os.path.exists(filepath):
                    ok = download_image(image_url, filepath)
                    if ok:
                        media_download_count += 1
                    else:
                        media_fail_count += 1
                else:
                    print(f"  Already exists: {filename}")

                rows.append((title, f"[View Image]({rel_path})"))
            else:
                rows.append((title, "*(no source or image)*"))

        if (i + 1) % 50 == 0:
            print(f"  Processed {i + 1}/{len(all_items)} items...")

    print(f"\nDownloaded {media_download_count} images, {media_fail_count} failures.")

    # Step 5: Create markdown
    lines = []
    lines.append("# Typography\n")
    lines.append(f"Total items: {len(all_items)}\n")
    lines.append("| Item | Source |")
    lines.append("|------|--------|")

    for title, source in rows:
        # Escape pipes in title and source
        safe_title = title.replace("|", "\\|")
        safe_source = source.replace("|", "\\|")
        # If source is a URL (not a markdown link), make it a link
        if safe_source.startswith("http"):
            lines.append(f"| {safe_title} | {safe_source} |")
        else:
            lines.append(f"| {safe_title} | {safe_source} |")

    with open(MD_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(f"\nMarkdown written to {MD_PATH}")
    print(f"Total rows: {len(rows)}")


if __name__ == "__main__":
    main()
