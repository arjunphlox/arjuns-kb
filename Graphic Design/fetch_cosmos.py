#!/usr/bin/env python3
"""Fetch Cosmos.so graphic-design collection and export as markdown with media."""

import json
import os
import re
import time
import urllib.request
import urllib.error
from urllib.parse import urlparse

CLUSTER_ID = 2121356043
GRAPHQL_URL = "https://api.www.cosmos.so/graphql"
OUTPUT_DIR = "/Users/arjunphlox/Documents/Personal Projects/Stello/Graphic Design"
IMAGES_DIR = os.path.join(OUTPUT_DIR, "images")
MD_PATH = os.path.join(OUTPUT_DIR, "Graphic Design.md")
PAGE_SIZE = 40

GRAPHQL_QUERY = """{ elements(filters: { clusterId: %d }, meta: { pageSize: %d%s }) { items { __typename ... on ArticleElement { id articleTitle sourceUrl type image { url } generatedCaption { text } computerVisionTags } ... on ImageElement { id sourceUrl type image { url } generatedCaption { text } computerVisionTags } ... on PinterestElement { id sourceUrl type image { url } generatedCaption { text } computerVisionTags } ... on InstagramElement { id sourceUrl type image { url } generatedCaption { text } computerVisionTags } ... on TwitterElement { id sourceUrl type image { url } generatedCaption { text } computerVisionTags } ... on Element { id sourceUrl type image { url } generatedCaption { text } computerVisionTags } } meta { nextPageCursor count } } }"""


def fetch_page(cursor=None):
    cursor_str = ', pageCursor: "%s"' % cursor if cursor else ""
    query = GRAPHQL_QUERY % (CLUSTER_ID, PAGE_SIZE, cursor_str)
    payload = json.dumps({"query": query}).encode("utf-8")
    req = urllib.request.Request(
        GRAPHQL_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def sanitize_filename(title, max_len=50):
    s = title.lower().strip()
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:max_len]


def clean_caption(text):
    if not text:
        return ""
    text = re.sub(r"</?n>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def generate_title_from_caption(caption, max_words=10):
    words = caption.split()
    title = " ".join(words[:max_words])
    if len(words) > max_words:
        title += "..."
    return title


def generate_title_from_tags(tags, max_tags=4):
    if not tags:
        return ""
    return " ".join(t.title() for t in tags[:max_tags])


def domain_from_url(url):
    try:
        parsed = urlparse(url)
        d = parsed.netloc
        if d.startswith("www."):
            d = d[4:]
        return d
    except Exception:
        return ""


def get_title(item):
    article_title = item.get("articleTitle")
    caption_raw = item.get("generatedCaption", {})
    caption_text = clean_caption(caption_raw.get("text") if caption_raw else "")
    tags = item.get("computerVisionTags") or []
    source_url = item.get("sourceUrl") or ""
    item_id = item.get("id", "")

    if article_title and article_title.strip():
        return article_title.strip()
    if caption_text:
        return generate_title_from_caption(caption_text)
    if tags:
        return generate_title_from_tags(tags)
    if source_url:
        return domain_from_url(source_url)
    return "Untitled Image %s" % item_id


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
                while True:
                    chunk = resp.read(8192)
                    if not chunk:
                        break
                    f.write(chunk)
        return True
    except Exception as e:
        print("  Failed to download %s: %s" % (url, e))
        return False


def main():
    os.makedirs(IMAGES_DIR, exist_ok=True)

    # Step 1: Fetch all items via paginated GraphQL
    all_items = []
    cursor = None
    page_num = 0
    total_count = None

    while True:
        page_num += 1
        print("Fetching page %d (cursor=%s)..." % (page_num, cursor))
        try:
            data = fetch_page(cursor)
        except Exception as e:
            print("Error fetching page %d: %s" % (page_num, e))
            break

        elements = data.get("data", {}).get("elements", {})
        items = elements.get("items", [])
        meta = elements.get("meta", {})

        if total_count is None:
            total_count = meta.get("count", 0)
            print("Total items reported: %d" % total_count)

        all_items.extend(items)
        print("  Got %d items (total so far: %d)" % (len(items), len(all_items)))

        next_cursor = meta.get("nextPageCursor")
        if not next_cursor or not items:
            print("No more pages.")
            break
        cursor = next_cursor
        time.sleep(0.3)  # polite delay

    print("\nFetched %d items total." % len(all_items))

    # Step 2: Process items
    rows = []  # list of (title, source_or_image_link)
    media_download_count = 0
    media_skip_count = 0

    for i, item in enumerate(all_items):
        source_url = (item.get("sourceUrl") or "").strip()
        title = get_title(item)
        item_id = item.get("id", "unknown")
        image_info = item.get("image") or {}
        image_url = image_info.get("url", "")

        if source_url:
            # Link-based item
            rows.append((title, source_url))
        else:
            # Media-only item - download image
            if image_url:
                safe_title = sanitize_filename(title)
                if not safe_title:
                    safe_title = "untitled"
                filename = "%s_%s.webp" % (safe_title, item_id)
                filepath = os.path.join(IMAGES_DIR, filename)
                rel_path = "images/%s" % filename

                if os.path.exists(filepath):
                    media_skip_count += 1
                else:
                    if (i + 1) % 20 == 0 or media_download_count == 0:
                        print("Downloading image %d: %s" % (media_download_count + 1, filename))
                    ok = download_image(image_url, filepath)
                    if ok:
                        media_download_count += 1
                    else:
                        # Still add row even if download failed
                        pass
                    time.sleep(0.15)

                rows.append((title, "[View Image](%s)" % rel_path))
            else:
                rows.append((title, "*(no source)*"))

    print("\nDownloaded %d images (%d skipped/cached)." % (media_download_count, media_skip_count))

    # Step 3: Write markdown
    with open(MD_PATH, "w", encoding="utf-8") as f:
        f.write("# Graphic Design\n\n")
        f.write("Total items: %d\n\n" % len(rows))
        f.write("| Item | Source |\n")
        f.write("|------|--------|\n")
        for title, source in rows:
            # Escape pipes in title and source
            safe_t = title.replace("|", "\\|")
            safe_s = source.replace("|", "\\|")
            f.write("| %s | %s |\n" % (safe_t, safe_s))

    print("\nMarkdown written to: %s" % MD_PATH)
    print("Done!")


if __name__ == "__main__":
    main()
