#!/usr/bin/env python3
"""
Stello — Vision-based tag enrichment using Claude API

Analyzes OG images with Claude's vision to generate color, style, and mood tags.

Usage:
  python3 vision_enrich.py preview          # Show eligible items
  python3 vision_enrich.py run              # Enrich all eligible items
  python3 vision_enrich.py run --limit 10   # Enrich first 10 items
"""

import os
import sys
import re
import json
import base64
import time
from pathlib import Path

KB_ROOT = Path(__file__).parent.parent
ITEMS_DIR = KB_ROOT / "_items"

VISION_CATEGORIES = {"color", "style", "mood"}

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_IMAGE_SIZE = 20 * 1024 * 1024  # 20MB

MEDIA_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}

SYSTEM_PROMPT = """You analyze images from a design knowledge base. Based on the visual content, provide tags in three categories.

Return ONLY valid JSON with this exact structure:
{
  "color": [{"tag": "name", "weight": 0.0}],
  "style": [{"tag": "name", "weight": 0.0}],
  "mood": [{"tag": "name", "weight": 0.0}]
}

Rules:
- color: 2-4 specific colors visible in the image. Use descriptive names like "burgundy", "teal", "charcoal", "ivory", "coral", "sage", "slate", "amber" — not generic "blue" or "red". Weight = how dominant (0.0-1.0).
- style: 1-3 visual/design styles. Examples: "minimalist", "brutalist", "editorial", "geometric", "organic", "typographic", "illustrated", "photographic", "3d", "hand-drawn", "flat", "retro", "futuristic", "grunge". Weight = how strongly (0.0-1.0).
- mood: 1-2 emotional tones. Examples: "dark", "vibrant", "elegant", "playful", "calm", "energetic", "moody", "warm", "cool", "dramatic", "professional", "whimsical". Weight = confidence (0.0-1.0).

Return ONLY the JSON object, no explanation."""


def parse_item(item_path):
    """Parse item.md frontmatter and extract tags."""
    with open(item_path, "r") as f:
        content = f.read()

    if not content.startswith("---"):
        return None

    end = content.index("---", 3)
    fm_text = content[3:end]

    tags = []
    for match in re.finditer(
        r'\{\s*tag:\s*"([^"]+)",\s*category:\s*"([^"]+)",\s*weight:\s*([0-9.]+)\s*\}',
        fm_text
    ):
        tags.append({
            "tag": match.group(1),
            "category": match.group(2),
            "weight": float(match.group(3)),
        })

    title_match = re.search(r'title:\s*"([^"]*)"', fm_text)
    title = title_match.group(1) if title_match else ""

    return {"tags": tags, "title": title}


def find_image(item_dir):
    """Find the OG image file in the item directory."""
    for ext in IMAGE_EXTENSIONS:
        img = item_dir / f"og-image{ext}"
        if img.exists() and img.stat().st_size > 2000:
            return img
    return None


def find_eligible_items():
    """Find items with images but missing color/style/mood tags."""
    eligible = []
    skipped_no_image = 0
    skipped_has_tags = 0

    for item_dir in sorted(ITEMS_DIR.iterdir()):
        if not item_dir.is_dir():
            continue
        item_md = item_dir / "item.md"
        if not item_md.exists():
            continue

        image_path = find_image(item_dir)
        if not image_path:
            skipped_no_image += 1
            continue

        data = parse_item(item_md)
        if not data:
            continue

        existing_cats = {t["category"] for t in data["tags"]}
        missing = VISION_CATEGORIES - existing_cats
        if not missing:
            skipped_has_tags += 1
            continue

        eligible.append({
            "dir": item_dir,
            "md": item_md,
            "image": image_path,
            "title": data["title"],
            "tags": data["tags"],
            "missing": missing,
            "slug": item_dir.name,
        })

    return eligible, skipped_no_image, skipped_has_tags


def encode_image(image_path):
    """Base64-encode an image and return (b64_str, media_type)."""
    ext = image_path.suffix.lower()
    media_type = MEDIA_TYPES.get(ext, "image/jpeg")

    with open(image_path, "rb") as f:
        data = f.read()

    if len(data) > MAX_IMAGE_SIZE:
        return None, None

    return base64.standard_b64encode(data).decode("utf-8"), media_type


def call_claude_vision(client, image_b64, media_type, title, existing_tags):
    """Send image to Claude for visual analysis."""
    context_tags = [t["tag"] for t in existing_tags if t["category"] in ("domain", "subject")]
    context = f'Item titled "{title}"'
    if context_tags:
        context += f', tagged with: {", ".join(context_tags[:6])}'

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=300,
        system=SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": image_b64,
                    },
                },
                {
                    "type": "text",
                    "text": context,
                },
            ],
        }],
    )

    raw = message.content[0].text.strip()
    # Strip markdown code fences if present
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)

    return json.loads(raw)


def merge_new_tags(existing_tags, vision_result):
    """Convert vision result to tag format, skipping duplicates."""
    existing_names = {t["tag"] for t in existing_tags}
    new_tags = []

    for category in VISION_CATEGORIES:
        items = vision_result.get(category, [])
        for item in items:
            tag_name = item["tag"].lower().strip()
            weight = min(1.0, max(0.0, float(item["weight"])))
            if tag_name and tag_name not in existing_names:
                new_tags.append({
                    "tag": tag_name,
                    "category": category,
                    "weight": round(weight, 2),
                })
                existing_names.add(tag_name)

    return new_tags


def update_item_file(item_path, new_tags):
    """Add new tags to item.md frontmatter."""
    with open(item_path, "r") as f:
        content = f.read()

    lines = content.split("\n")
    last_tag_idx = -1
    for i, line in enumerate(lines):
        if line.strip().startswith("- { tag:"):
            last_tag_idx = i

    if last_tag_idx == -1:
        return False

    new_lines = []
    for t in new_tags:
        new_lines.append(f'  - {{ tag: "{t["tag"]}", category: "{t["category"]}", weight: {t["weight"]} }}')

    lines = lines[:last_tag_idx + 1] + new_lines + lines[last_tag_idx + 1:]

    with open(item_path, "w") as f:
        f.write("\n".join(lines))

    return True


TITLE_PROMPT = """Look at this image and give it a short, descriptive title (3-5 words).
The title should describe what the image shows — e.g., "Geometric Pattern Grid", "Dark Typography Specimen", "Minimalist Watch Design".
Return ONLY the title text, nothing else."""


def enrich_single(slug):
    """Enrich a single item by slug. Outputs JSON to stdout for the server."""
    item_dir = ITEMS_DIR / slug
    item_md = item_dir / "item.md"
    if not item_md.exists():
        print(json.dumps({"error": "Item not found"}))
        return

    image_path = find_image(item_dir)
    data = parse_item(item_md)
    if not data:
        print(json.dumps({"error": "Could not parse item"}))
        return

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print(json.dumps({"error": "No API key"}))
        return

    import anthropic
    client = anthropic.Anthropic(api_key=api_key)

    result = {"slug": slug}
    new_tags = []

    # Vision enrichment if image exists
    if image_path:
        try:
            image_b64, media_type = encode_image(image_path)
            if image_b64:
                vision_result = call_claude_vision(client, image_b64, media_type, data["title"], data["tags"])
                new_tags = merge_new_tags(data["tags"], vision_result)
                if new_tags:
                    update_item_file(item_md, new_tags)

                # Generate smart title for image-only items (no source URL or placeholder title)
                title = data.get("title", "")
                if title.startswith("Image upload") or title.startswith("Saved from"):
                    smart_title = generate_smart_title(client, image_b64, media_type)
                    if smart_title:
                        update_title_in_file(item_md, smart_title)
                        result["title"] = smart_title
        except Exception as e:
            result["vision_error"] = str(e)[:100]

    # Determine needs_review based on novelty criteria
    all_tags = data["tags"] + new_tags
    needs_review = should_review(slug, all_tags)
    update_needs_review(item_md, needs_review)
    result["needs_review"] = needs_review

    # Return all tags for index update
    all_tag_dicts = data["tags"] + new_tags
    result["tags"] = all_tag_dicts

    print(json.dumps(result))


def generate_smart_title(client, image_b64, media_type):
    """Use Claude vision to generate a descriptive title for an image."""
    try:
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=50,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_b64}},
                    {"type": "text", "text": TITLE_PROMPT},
                ],
            }],
        )
        return message.content[0].text.strip().strip('"').strip("'")
    except Exception:
        return None


def update_title_in_file(item_path, new_title):
    """Update the title in item.md frontmatter."""
    with open(item_path, "r") as f:
        content = f.read()
    content = re.sub(
        r'^title:\s*"[^"]*"',
        f'title: "{new_title.replace(chr(34), chr(39))}"',
        content,
        count=1,
        flags=re.MULTILINE
    )
    with open(item_path, "w") as f:
        f.write(content)


def update_needs_review(item_path, needs_review):
    """Update the needs_review field in frontmatter."""
    with open(item_path, "r") as f:
        content = f.read()
    if "needs_review:" in content:
        content = re.sub(
            r'needs_review:\s*\w+',
            f'needs_review: {"true" if needs_review else "false"}',
            content,
            count=1
        )
    else:
        # Insert before tags:
        content = content.replace("\ntags:", f"\nneeds_review: {'true' if needs_review else 'false'}\n\ntags:")
    with open(item_path, "w") as f:
        f.write(content)


def should_review(slug, tags):
    """Determine if this item should trigger a question card.

    Returns True if the item brings novel signal that could improve tagging.
    """
    # Count tags by category
    cats = {}
    for t in tags:
        cat = t.get("category", "")
        cats[cat] = cats.get(cat, 0) + 1

    total_tags = len(tags)
    high_weight = sum(1 for t in tags if t.get("weight", 0) >= 0.6)

    # Low tag confidence — fewer than 3 tags total
    if total_tags < 3:
        return True

    # Ambiguous — all weights below 0.5
    if all(t.get("weight", 0) < 0.5 for t in tags):
        return True

    # Check if domain is new (first item from this source)
    domain_tags = [t["tag"] for t in tags if t.get("category") == "format"]
    item_domain = None
    item_dir = ITEMS_DIR / slug
    item_md = item_dir / "item.md"
    if item_md.exists():
        with open(item_md, "r") as f:
            for line in f:
                m = re.match(r'^domain:\s*"?([^"]*)"?', line.strip())
                if m:
                    item_domain = m.group(1)
                    break

    if item_domain:
        domain_count = 0
        for d in ITEMS_DIR.iterdir():
            if not d.is_dir() or d.name == slug:
                continue
            md = d / "item.md"
            if md.exists():
                with open(md, "r") as f:
                    for line in f:
                        if f'domain: "{item_domain}"' in line:
                            domain_count += 1
                            break
                if domain_count >= 3:
                    break
        if domain_count == 0:
            return True

    # Confident and diverse — skip review
    if total_tags >= 8 and high_weight >= 4 and len(cats) >= 3:
        return False

    # Periodic calibration — every ~20 items
    total_items = sum(1 for d in ITEMS_DIR.iterdir() if d.is_dir())
    if total_items % 20 == 0:
        return True

    return False


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 vision_enrich.py preview|run|enrich-single [--limit N]")
        sys.exit(1)

    mode = sys.argv[1]

    if mode == "enrich-single":
        if len(sys.argv) < 3:
            print("Usage: vision_enrich.py enrich-single <slug>")
            sys.exit(1)
        enrich_single(sys.argv[2])
        return

    limit = None
    if "--limit" in sys.argv:
        idx = sys.argv.index("--limit")
        if idx + 1 < len(sys.argv):
            limit = int(sys.argv[idx + 1])

    dry_run = mode == "preview"

    eligible, no_img, has_tags = find_eligible_items()

    print(f"\n  Items without images (skipped): {no_img}")
    print(f"  Items already enriched (skipped): {has_tags}")
    print(f"  Eligible for vision enrichment: {len(eligible)}")

    if limit:
        eligible = eligible[:limit]
        print(f"  Processing first {limit}")

    if dry_run:
        print(f"\n  Sample eligible items:")
        for item in eligible[:20]:
            missing = ", ".join(sorted(item["missing"]))
            print(f"    {item['title'][:55]}  [missing: {missing}]")
        print(f"\n  Run 'python3 vision_enrich.py run' to enrich.")
        return

    # Check API key
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("\n  Error: ANTHROPIC_API_KEY environment variable not set.")
        print("  Set it with: export ANTHROPIC_API_KEY=sk-ant-...")
        sys.exit(1)

    import anthropic
    client = anthropic.Anthropic(api_key=api_key)

    total_tags = 0
    by_category = {"color": 0, "style": 0, "mood": 0}
    processed = 0
    failed = 0

    for i, item in enumerate(eligible):
        print(f"  [{i+1}/{len(eligible)}] {item['title'][:50]}...", end=" ", flush=True)

        try:
            image_b64, media_type = encode_image(item["image"])
            if not image_b64:
                print("(too large)")
                failed += 1
                continue

            result = call_claude_vision(client, image_b64, media_type, item["title"], item["tags"])
            new_tags = merge_new_tags(item["tags"], result)

            if new_tags:
                update_item_file(item["md"], new_tags)
                tag_names = [t["tag"] for t in new_tags]
                print(f"+{len(new_tags)} ({', '.join(tag_names[:4])})")
                total_tags += len(new_tags)
                for t in new_tags:
                    by_category[t["category"]] = by_category.get(t["category"], 0) + 1
            else:
                print("(no new tags)")

            processed += 1
            time.sleep(0.5)

        except json.JSONDecodeError as e:
            print(f"(JSON error: {str(e)[:40]})")
            failed += 1
        except Exception as e:
            print(f"(error: {str(e)[:50]})")
            failed += 1

    print(f"\n  Vision enrichment complete:")
    print(f"    Items processed: {processed}")
    print(f"    Items failed: {failed}")
    print(f"    Total new tags: {total_tags}")
    for cat, count in sorted(by_category.items()):
        print(f"      {cat}: {count}")
    print(f"\n  Run 'python3 scripts/analyze.py index' to rebuild index.")


if __name__ == "__main__":
    main()
