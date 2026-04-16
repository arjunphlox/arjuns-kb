#!/usr/bin/env python3
"""
Stello — Tag Enrichment Script

Adds style, mood, tool, color, and location tags to items that only have
subject/domain/format tags from the auto-tagger.

Usage:
  python3 enrich.py preview          # Show what would change (dry run)
  python3 enrich.py run              # Apply enrichment to all items
  python3 enrich.py run --collection "Websites"  # Only items from a collection
"""

import os
import sys
import re
import json
from pathlib import Path

KB_ROOT = Path(__file__).parent.parent
ITEMS_DIR = KB_ROOT / "_items"

# ─── Enrichment Rules ────────────────────────────────────────────────

# Tool tags: keyword patterns → tool tag
TOOL_RULES = {
    "figma": "figma",
    "framer": "framer",
    "webflow": "webflow",
    "sketch app": "sketch",
    "sketch design": "sketch",
    "adobe illustrator": "illustrator",
    "illustrator": "illustrator",
    "photoshop": "photoshop",
    "after effects": "after-effects",
    "aftereffects": "after-effects",
    "premiere": "premiere",
    "final cut": "final-cut-pro",
    "procreate": "procreate",
    "blender": "blender",
    "cinema 4d": "cinema-4d",
    "cinema4d": "cinema-4d",
    "c4d": "cinema-4d",
    "midjourney": "midjourney",
    "stable diffusion": "stable-diffusion",
    "dall-e": "dall-e",
    "dalle": "dall-e",
    "chatgpt": "chatgpt",
    "openai": "openai",
    "spline": "spline",
    "rive": "rive",
    "lottie": "lottie",
    "gsap": "gsap",
    "three.js": "three-js",
    "threejs": "three-js",
    "react": "react",
    "nextjs": "nextjs",
    "next.js": "nextjs",
    "tailwind": "tailwind",
    "swift": "swift",
    "swiftui": "swiftui",
    "visionos": "visionos",
    "vision pro": "vision-pro",
    "unity": "unity",
    "unreal": "unreal-engine",
    "notion": "notion",
    "obsidian": "obsidian",
    "linear": "linear",
    "airtable": "airtable",
    "zapier": "zapier",
    "wordpress": "wordpress",
    "shopify": "shopify",
    "vercel": "vercel",
    "supabase": "supabase",
    "firebase": "firebase",
    "claude": "claude",
    "cursor": "cursor",
    "p5.js": "p5-js",
    "d3.js": "d3-js",
    "anime.js": "anime-js",
    "origami": "origami-studio",
    "principle": "principle",
    "protopie": "protopie",
    "marvel": "marvel",
    "invision": "invision",
    "zeplin": "zeplin",
    "github": "github",
    "lightroom": "lightroom",
    "davinci resolve": "davinci-resolve",
    "capcut": "capcut",
    "canva": "canva",
}

# Style tags: keyword patterns → style tag
STYLE_RULES = {
    "minimalist": "minimalist",
    "minimal": "minimalist",
    "brutalist": "brutalist",
    "editorial": "editorial",
    "retro": "retro",
    "vintage": "vintage",
    "futuristic": "futuristic",
    "geometric": "geometric",
    "organic": "organic",
    "flat": "flat",
    "skeuomorphic": "skeuomorphic",
    "neumorphic": "neumorphism",
    "glassmorphism": "glassmorphism",
    "gradient": "gradient",
    "monochrome": "monochrome",
    "isometric": "isometric",
    "3d": "3d",
    "hand-drawn": "hand-drawn",
    "hand drawn": "hand-drawn",
    "handwritten": "handwritten",
    "grunge": "grunge",
    "clean": "clean",
    "bold": "bold",
    "serif": "serif",
    "sans-serif": "sans-serif",
    "display": "display",
    "script": "script",
    "calligraphy": "calligraphic",
    "pixel": "pixel-art",
    "voxel": "voxel",
    "wireframe": "wireframe",
    "low-poly": "low-poly",
    "abstract": "abstract",
    "swiss": "swiss-style",
    "bauhaus": "bauhaus",
    "art deco": "art-deco",
    "art nouveau": "art-nouveau",
    "psychedelic": "psychedelic",
    "neon": "neon",
    "glitch": "glitch",
    "halftone": "halftone",
    "stipple": "stipple",
    "watercolor": "watercolor",
    "collage": "collage",
    "photorealistic": "photorealistic",
    "cinematic": "cinematic",
    "animated": "animated",
    "interactive": "interactive",
    "responsive": "responsive",
    "modular": "modular",
    "grid": "grid-based",
    "typographic": "typographic",
    "experimental": "experimental",
    "generative": "generative",
    "procedural": "procedural",
    "parametric": "parametric",
    "data-driven": "data-driven",
}

# Mood tags: keyword patterns → mood tag
MOOD_RULES = {
    "dark": "dark",
    "light": "light",
    "vibrant": "vibrant",
    "colorful": "vibrant",
    "calm": "calm",
    "serene": "calm",
    "peaceful": "calm",
    "elegant": "elegant",
    "luxurious": "luxurious",
    "luxury": "luxurious",
    "premium": "premium",
    "playful": "playful",
    "fun": "playful",
    "whimsical": "whimsical",
    "energetic": "energetic",
    "dynamic": "dynamic",
    "professional": "professional",
    "corporate": "corporate",
    "friendly": "friendly",
    "warm": "warm",
    "cool": "cool",
    "moody": "moody",
    "dramatic": "dramatic",
    "mysterious": "mysterious",
    "dreamy": "dreamy",
    "nostalgic": "nostalgic",
    "futuristic": "futuristic",
    "techy": "techy",
    "craft": "crafted",
    "artisan": "crafted",
    "handmade": "crafted",
    "raw": "raw",
    "bold": "bold",
    "subtle": "subtle",
    "delicate": "delicate",
}

# Domain-based style inference
DOMAIN_STYLE_MAP = {
    "typography": ["typographic"],
    "type-design": ["typographic"],
    "typefaces": ["typographic"],
    "type-foundries": ["typographic"],
    "calligraphy": ["calligraphic", "hand-drawn"],
    "isometric-graphics": ["isometric", "3d"],
    "3d-graphics": ["3d"],
    "generative-graphics": ["generative"],
    "motion-graphics": ["animated"],
    "web-interactions": ["interactive", "animated"],
    "graphic-design": ["graphic"],
    "illustration": ["illustrated"],
    "photography": ["photographic"],
    "packaging-design": ["tactile"],
    "branding": ["brand-identity"],
    "spatial-computing": ["3d", "immersive"],
    "simple-graphics": ["minimalist"],
}

# Domain-based mood inference
DOMAIN_MOOD_MAP = {
    "cinema": ["cinematic"],
    "cinematography": ["cinematic"],
    "industrial-design": ["crafted"],
    "craft-work": ["crafted"],
    "icon-design": ["precise"],
}

# Collection name → tool tag
COLLECTION_TOOL_MAP = {
    "figma": "figma",
    "framer": "framer",
    "webflow": "webflow",
    "procreate": "procreate",
    "midjourney": "midjourney",
    "rive": "rive",
    "spline": "spline",
    "adobe-illustrator": "illustrator",
}

# Location patterns (in title/summary/domain)
LOCATION_RULES = {
    "tokyo": "japan",
    "japan": "japan",
    "japanese": "japan",
    "india": "india",
    "indian": "india",
    "mumbai": "india",
    "bangalore": "india",
    "delhi": "india",
    "london": "uk",
    "british": "uk",
    "england": "uk",
    "berlin": "germany",
    "german": "germany",
    "paris": "france",
    "french": "france",
    "new york": "usa",
    "nyc": "usa",
    "san francisco": "usa",
    "california": "usa",
    "los angeles": "usa",
    "seattle": "usa",
    "portland": "usa",
    "brooklyn": "usa",
    "vancouver": "canada",
    "toronto": "canada",
    "canada": "canada",
    "amsterdam": "netherlands",
    "dutch": "netherlands",
    "copenhagen": "denmark",
    "danish": "denmark",
    "stockholm": "sweden",
    "swedish": "sweden",
    "helsinki": "finland",
    "finnish": "finland",
    "milan": "italy",
    "italian": "italy",
    "zurich": "switzerland",
    "swiss": "switzerland",
    "seoul": "south-korea",
    "korean": "south-korea",
    "singapore": "singapore",
    "sydney": "australia",
    "australian": "australia",
    "melbourne": "australia",
    "oslo": "norway",
    "norwegian": "norway",
    "barcelona": "spain",
    "spanish": "spain",
    "lisbon": "portugal",
    "portuguese": "portugal",
    "prague": "czech-republic",
    "jakarta": "indonesia",
    "bangkok": "thailand",
    "dubai": "uae",
    "são paulo": "brazil",
    "sao paulo": "brazil",
    "brazilian": "brazil",
    "mexico": "mexico",
    "china": "china",
    "chinese": "china",
    "beijing": "china",
    "shanghai": "china",
    "taiwan": "taiwan",
    "taipei": "taiwan",
}

# TLD → location (weak signal)
TLD_LOCATION = {
    ".jp": "japan",
    ".de": "germany",
    ".fr": "france",
    ".uk": "uk",
    ".co.uk": "uk",
    ".it": "italy",
    ".nl": "netherlands",
    ".se": "sweden",
    ".dk": "denmark",
    ".no": "norway",
    ".fi": "finland",
    ".ch": "switzerland",
    ".kr": "south-korea",
    ".au": "australia",
    ".br": "brazil",
    ".mx": "mexico",
    ".cn": "china",
    ".tw": "taiwan",
    ".sg": "singapore",
    ".pt": "portugal",
}


# ─── Parse & Update ──────────────────────────────────────────────────

def parse_item(item_path):
    """Parse item.md and return (frontmatter_text, body, tags_list, all_text_for_matching)."""
    with open(item_path, "r") as f:
        content = f.read()

    if not content.startswith("---"):
        return None

    end = content.index("---", 3)
    fm_text = content[3:end]
    body = content[end + 3:]

    # Extract tags
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

    # Extract text fields for matching
    title_match = re.search(r'title:\s*"([^"]*)"', fm_text)
    summary_match = re.search(r'summary:\s*"([^"]*)"', fm_text)
    domain_match = re.search(r'domain:\s*"?([^"\n]+)"?', fm_text)
    url_match = re.search(r'source_url:\s*"([^"]*)"', fm_text)

    all_text = " ".join(filter(None, [
        title_match.group(1) if title_match else "",
        summary_match.group(1) if summary_match else "",
        body,
    ])).lower()

    domain = (domain_match.group(1).strip() if domain_match else "").replace('"', '')
    url = url_match.group(1) if url_match else ""

    return {
        "content": content,
        "fm_text": fm_text,
        "body": body,
        "tags": tags,
        "all_text": all_text,
        "domain": domain,
        "url": url,
        "title": title_match.group(1) if title_match else "",
    }


def enrich_tags(item_data):
    """Generate new tags for an item based on rules. Returns list of new tags to add."""
    existing = {(t["tag"], t["category"]) for t in item_data["tags"]}
    existing_tags = {t["tag"] for t in item_data["tags"]}
    text = item_data["all_text"]
    domain = item_data["domain"]
    url = item_data["url"]
    new_tags = []

    def add_tag(tag, category, weight):
        if (tag, category) not in existing and tag not in existing_tags:
            new_tags.append({"tag": tag, "category": category, "weight": weight})
            existing.add((tag, category))
            existing_tags.add(tag)

    # Get domain tag from existing tags
    domain_tags = [t["tag"] for t in item_data["tags"] if t["category"] == "domain"]

    # Tool tags from text (use word boundaries to avoid false matches like "community" → "unity")
    for pattern, tool in TOOL_RULES.items():
        if re.search(r'\b' + re.escape(pattern) + r'\b', text):
            add_tag(tool, "tool", 0.7)

    # Tool tags from collection/domain
    for col_key, tool in COLLECTION_TOOL_MAP.items():
        if col_key in domain_tags:
            add_tag(tool, "tool", 0.8)

    # Style tags from text
    for pattern, style in STYLE_RULES.items():
        if re.search(r'\b' + re.escape(pattern) + r'\b', text):
            add_tag(style, "style", 0.65)

    # Style tags from domain
    for dom, styles in DOMAIN_STYLE_MAP.items():
        if dom in domain_tags:
            for style in styles:
                add_tag(style, "style", 0.6)

    # Mood tags from text
    for pattern, mood in MOOD_RULES.items():
        if re.search(r'\b' + re.escape(pattern) + r'\b', text):
            add_tag(mood, "mood", 0.55)

    # Mood tags from domain
    for dom, moods in DOMAIN_MOOD_MAP.items():
        if dom in domain_tags:
            for mood in moods:
                add_tag(mood, "mood", 0.5)

    # Location tags from text
    for pattern, loc in LOCATION_RULES.items():
        if re.search(r'\b' + re.escape(pattern) + r'\b', text):
            add_tag(loc, "location", 0.6)

    # Location from TLD
    if domain:
        for tld, loc in TLD_LOCATION.items():
            if domain.endswith(tld):
                add_tag(loc, "location", 0.3)

    return new_tags


def update_item_file(item_path, new_tags):
    """Add new tags to an item.md file."""
    with open(item_path, "r") as f:
        content = f.read()

    # Find the last tag line
    lines = content.split("\n")
    last_tag_idx = -1
    for i, line in enumerate(lines):
        if line.strip().startswith("- { tag:"):
            last_tag_idx = i

    if last_tag_idx == -1:
        return False

    # Insert new tags after last existing tag
    new_lines = []
    for t in new_tags:
        new_lines.append(f'  - {{ tag: "{t["tag"]}", category: "{t["category"]}", weight: {t["weight"]} }}')

    lines = lines[:last_tag_idx + 1] + new_lines + lines[last_tag_idx + 1:]

    with open(item_path, "w") as f:
        f.write("\n".join(lines))

    return True


# ─── CLI ──────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 enrich.py preview|run [--collection NAME]")
        sys.exit(1)

    mode = sys.argv[1]
    collection_filter = None
    if "--collection" in sys.argv:
        idx = sys.argv.index("--collection")
        if idx + 1 < len(sys.argv):
            collection_filter = sys.argv[idx + 1].lower().replace(" ", "-")

    dry_run = mode == "preview"

    enriched = 0
    skipped = 0
    total_new_tags = 0
    category_counts = {}

    item_dirs = sorted(ITEMS_DIR.iterdir())
    total = len([d for d in item_dirs if d.is_dir()])

    for item_dir in item_dirs:
        if not item_dir.is_dir():
            continue

        item_path = item_dir / "item.md"
        if not item_path.exists():
            continue

        item_data = parse_item(item_path)
        if not item_data:
            continue

        # Filter by collection if specified
        if collection_filter:
            domain_tags = [t["tag"] for t in item_data["tags"] if t["category"] == "domain"]
            if collection_filter not in domain_tags:
                continue

        # Check if already enriched (has style/color/mood/tool/location tags)
        cats = {t["category"] for t in item_data["tags"]}
        rich_cats = cats.intersection({"style", "color", "mood", "tool", "location"})

        new_tags = enrich_tags(item_data)

        if not new_tags:
            skipped += 1
            continue

        enriched += 1
        total_new_tags += len(new_tags)

        for t in new_tags:
            category_counts[t["category"]] = category_counts.get(t["category"], 0) + 1

        if dry_run:
            if enriched <= 20:  # Show first 20 examples
                print(f"\n  {item_data['title'][:60]}")
                for t in new_tags:
                    print(f"    + {t['category']}: {t['tag']} ({t['weight']})")
        else:
            update_item_file(item_path, new_tags)
            if enriched % 100 == 0:
                print(f"  [{enriched}] enriched...", flush=True)

    print(f"\n{'[DRY RUN] ' if dry_run else ''}Enrichment complete:")
    print(f"  Items enriched: {enriched}")
    print(f"  Items skipped (no rules matched): {skipped}")
    print(f"  New tags added: {total_new_tags}")
    print(f"  By category:")
    for cat, count in sorted(category_counts.items(), key=lambda x: -x[1]):
        print(f"    {cat}: {count}")

    if dry_run:
        print(f"\n  Run 'python3 enrich.py run' to apply changes.")


if __name__ == "__main__":
    main()
