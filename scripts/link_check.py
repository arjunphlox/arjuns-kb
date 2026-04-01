#!/usr/bin/env python3
"""
Arjun's KB — Link Health Checker

Checks source_url for each item via HTTP HEAD (falling back to GET),
updates status and link_last_checked fields in frontmatter.
Skips items already checked within the last 7 days.
Skips domains known to block bots (marks them active by default).

Usage:
  python3 link_check.py preview          # Show count + sample 20
  python3 link_check.py run              # Check all eligible items
  python3 link_check.py run --limit 50   # Check first 50 eligible items
"""

import os
import sys
import re
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime, timedelta

KB_ROOT = Path(__file__).parent.parent
ITEMS_DIR = KB_ROOT / "_items"

# Domains that block bot requests — mark active by default, skip HTTP check
BLOCKED_DOMAINS = {
    "x.com", "twitter.com", "instagram.com", "threads.net",
    "facebook.com", "fb.com", "tiktok.com",
}

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
TIMEOUT = 10
RECHECK_DAYS = 7


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


def check_url(url):
    """Check URL with HEAD, fall back to GET on 405. Returns (status_label, code_or_error)."""
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
    }

    # Try HEAD first
    try:
        req = urllib.request.Request(url, method="HEAD", headers=headers)
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            code = resp.getcode()
            if 200 <= code < 400:
                return "active", code
            return "dead", code
    except urllib.error.HTTPError as e:
        if e.code == 405:
            # Method Not Allowed — fall back to GET
            pass
        elif e.code in (301, 302, 303, 307, 308):
            return "active", e.code
        elif e.code in (403, 404, 410, 451):
            return "dead", e.code
        else:
            return "dead", e.code
    except Exception:
        # Connection error on HEAD — try GET before giving up
        pass

    # Fall back to GET
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            code = resp.getcode()
            if 200 <= code < 400:
                return "active", code
            return "dead", code
    except urllib.error.HTTPError as e:
        if 200 <= e.code < 400:
            return "active", e.code
        return "dead", e.code
    except Exception as e:
        return "dead", str(e)[:60]


def update_item_md(item_path, status, date_str):
    """Update status and link_last_checked fields in item.md frontmatter."""
    with open(item_path, "r") as f:
        content = f.read()

    # Update or insert status field
    if re.search(r'^status:\s*', content, re.MULTILINE):
        content = re.sub(r'^status:\s*.*$', f'status: "{status}"', content, count=1, flags=re.MULTILINE)
    else:
        content = re.sub(
            r'^(source_url:\s*.*$)',
            rf'\1\nstatus: "{status}"',
            content, count=1, flags=re.MULTILINE
        )

    # Update or insert link_last_checked field
    if re.search(r'^link_last_checked:\s*', content, re.MULTILINE):
        content = re.sub(r'^link_last_checked:\s*.*$', f'link_last_checked: "{date_str}"', content, count=1, flags=re.MULTILINE)
    else:
        content = re.sub(
            r'^(source_url:\s*.*$)',
            rf'\1\nlink_last_checked: "{date_str}"',
            content, count=1, flags=re.MULTILINE
        )

    with open(item_path, "w") as f:
        f.write(content)


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 link_check.py preview|run [--limit N]")
        sys.exit(1)

    mode = sys.argv[1]
    limit = None
    if "--limit" in sys.argv:
        idx = sys.argv.index("--limit")
        if idx + 1 < len(sys.argv):
            limit = int(sys.argv[idx + 1])

    dry_run = mode == "preview"
    today = datetime.now().strftime("%Y-%m-%d")
    cutoff = datetime.now() - timedelta(days=RECHECK_DAYS)

    # Gather eligible items
    eligible = []
    skipped_recent = 0
    skipped_blocked = 0
    total_items = 0

    for item_dir in sorted(ITEMS_DIR.iterdir()):
        if not item_dir.is_dir():
            continue
        item_md = item_dir / "item.md"
        if not item_md.exists():
            continue

        total_items += 1
        data, _ = parse_frontmatter(item_md)
        if not data:
            continue

        source_url = data.get("source_url", "")
        if not source_url:
            continue

        domain = data.get("domain", "")
        title = data.get("title", "")

        # Skip if checked recently
        last_checked = data.get("link_last_checked")
        if last_checked:
            try:
                checked_date = datetime.strptime(last_checked, "%Y-%m-%d")
                if checked_date >= cutoff:
                    skipped_recent += 1
                    continue
            except ValueError:
                pass  # bad date format — re-check

        # Handle blocked domains — mark active, update date, skip HTTP
        if domain in BLOCKED_DOMAINS:
            skipped_blocked += 1
            if not dry_run:
                update_item_md(item_md, "active", today)
            continue

        eligible.append({
            "dir": item_dir,
            "md": item_md,
            "url": source_url,
            "domain": domain,
            "title": title,
        })

    print(f"\n  Total items: {total_items}")
    print(f"  Skipped (checked within {RECHECK_DAYS} days): {skipped_recent}")
    print(f"  Skipped (blocked domains, marked active): {skipped_blocked}")
    print(f"  Eligible for checking: {len(eligible)}")

    if limit:
        eligible = eligible[:limit]
        print(f"  Processing first {limit}")

    if dry_run:
        print(f"\n  Sample (first 20):")
        for item in eligible[:20]:
            print(f"    {item['domain']}: {item['title'][:60]}")
        print(f"\n  Run 'python3 link_check.py run' to check links.")
        return

    # Check links
    active_count = 0
    dead_count = 0
    error_count = 0

    for i, item in enumerate(eligible):
        title = item["title"]
        domain = item["domain"]
        url = item["url"]

        print(f"  [{i+1}/{len(eligible)}] {domain}: {title[:50]}...", end=" ", flush=True)

        status, code = check_url(url)
        update_item_md(item["md"], status, today)

        if status == "active":
            active_count += 1
            print(f"active ({code})")
        else:
            dead_count += 1
            print(f"DEAD ({code})")

    print(f"\n  Link check complete:")
    print(f"    Checked: {len(eligible)}")
    print(f"    Active: {active_count}")
    print(f"    Dead: {dead_count}")
    print(f"    Skipped (recent): {skipped_recent}")
    print(f"    Skipped (blocked): {skipped_blocked}")


if __name__ == "__main__":
    main()
