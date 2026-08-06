#!/usr/bin/env python3
"""
FishSmart Pro — Blog Build Script
Converts growth-engine markdown posts to styled HTML blog pages.

Usage:
    python build_blog.py                # build all posts
    python build_blog.py --watch         # rebuild on change (polls every 5s)

Reads from:  ../../docs/growth/pipeline/blog/*.md
Writes to:   ./posts/*.html + ./index.html
"""

import os
import re
import sys
import glob
import html
import time
from pathlib import Path

import markdown

# ---- Paths ----
SCRIPT_DIR = Path(__file__).parent.resolve()
LANDING_DIR = SCRIPT_DIR.parent
SOURCE_DIR = LANDING_DIR.parent / "docs" / "growth" / "pipeline" / "blog"
OUTPUT_DIR = SCRIPT_DIR / "posts"
INDEX_PATH = SCRIPT_DIR / "index.html"

# ---- Markdown config ----
MD = markdown.Markdown(
    extensions=["extra", "tables", "fenced_code", "sane_lists", "toc", "nl2br"],
    extension_configs={"toc": {"permalink": False}},
)

# ---- Helpers ----


def parse_metadata(content: str) -> tuple[dict, str]:
    """Extract metadata from the blockquote-style header and meta lines."""
    meta = {
        "title": "Untitled",
        "date": "",
        "author": "FishSmart Pro",
        "keywords": [],
        "meta_title": "",
        "meta_description": "",
    }

    # Extract H1 title
    h1_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    if h1_match:
        meta["title"] = h1_match.group(1).strip()

    # Extract blockquote metadata block
    bq_match = re.search(r"^>\s+(.*?)(?=^---|^\n[^>])", content, re.MULTILINE | re.DOTALL)
    if bq_match:
        bq_text = bq_match.group(1)

        date_match = re.search(r"Date:\s*(.+)", bq_text)
        if date_match:
            meta["date"] = date_match.group(1).strip()

        author_match = re.search(r"Author:\s*(.+)", bq_text)
        if author_match:
            meta["author"] = author_match.group(1).strip()

        kw_match = re.search(r"(?:Primary|Secondary)\s+keyword[s]?:\s*(.+)", bq_text)
        if kw_match:
            keywords = [k.strip() for k in kw_match.group(1).split(",")]
            meta["keywords"].extend(keywords)

        kw_match2 = re.search(r"Secondary keyword[s]?:\s*(.+)", bq_text)
        if kw_match2:
            keywords2 = [k.strip() for k in kw_match2.group(1).split(",")]
            meta["keywords"].extend(keywords2)

    # Extract Meta Title / Meta Description
    mt_match = re.search(r"\*\*Meta Title:\*\*\s*(.+)", content)
    if mt_match:
        meta["meta_title"] = mt_match.group(1).strip()

    md_match = re.search(r"\*\*Meta Description:\*\*\s*(.+)", content)
    if md_match:
        meta["meta_description"] = md_match.group(1).strip()

    # Clean body: remove the blockquote metadata, meta title/desc lines
    body = content
    body = re.sub(r"^>\s+.*?$", "", body, flags=re.MULTILINE)
    body = re.sub(r"^>\s+", "", body, flags=re.MULTILINE)
    body = re.sub(r"\*\*Meta Title:\*\*.*?$", "", body, flags=re.MULTILINE)
    body = re.sub(r"\*\*Meta Description:\*\*.*?$", "", body, flags=re.MULTILINE)
    body = re.sub(r"^#\s+.+$", "", body, count=1, flags=re.MULTILINE)
    body = re.sub(r"\n{3,}", "\n\n", body).strip()

    # Deduplicate keywords while preserving order
    seen = set()
    meta["keywords"] = [k for k in meta["keywords"] if not (k in seen or seen.add(k))]

    return meta, body


def slugify(title: str) -> str:
    """Create URL-safe slug from title."""
    slug = re.sub(r"[^a-zA-Z0-9\s-]", "", title.lower())
    slug = re.sub(r"[-\s]+", "-", slug).strip("-")
    return slug


def format_date(date_str: str) -> str:
    """Format ISO date to human-readable."""
    try:
        from datetime import datetime
        dt = datetime.strptime(date_str.strip(), "%Y-%m-%d")
        return dt.strftime("%B %d, %Y")
    except Exception:
        return date_str


def generate_excerpt(html_body: str, max_chars: int = 180) -> str:
    """Extract first paragraph as excerpt."""
    text = re.sub(r"<[^>]+>", "", html_body)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > max_chars:
        text = text[:max_chars].rsplit(" ", 1)[0] + "..."
    return text


def nav_html() -> str:
    return """  <header class="nav" id="nav">
    <div class="nav-inner">
      <a href="../index.html" class="nav-logo">
        <img src="../assets/store_icon.png" alt="FishSmart Pro" class="nav-logo-icon">
        <span class="nav-logo-text">FishSmart<span class="text-neon"> Pro</span></span>
      </a>
      <nav class="nav-links" id="nav-links">
        <a href="../index.html#app-preview">App Preview</a>
        <a href="../index.html#features">Features</a>
        <a href="../index.html#science">The Science</a>
        <a href="../index.html#pricing">Pricing</a>
        <a href="../blog/index.html" class="active">Blog</a>
        <a href="https://fishsmart-pro.onrender.com" class="btn btn-outline btn-sm">Open App</a>
      </nav>
      <button class="nav-toggle" id="nav-toggle" aria-label="Toggle navigation menu" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
    </div>
  </header>"""


def footer_html() -> str:
    return """  <footer class="footer">
    <div class="container footer-inner">
      <div class="footer-brand"><img src="../assets/store_icon.png" alt="FishSmart Pro" class="footer-logo"><span class="footer-name">FishSmart<span class="text-neon"> Pro</span></span></div>
      <nav class="footer-links">
        <a href="../index.html#app-preview">App Preview</a>
        <a href="../index.html#features">Features</a>
        <a href="../index.html#science">Science</a>
        <a href="../index.html#pricing">Pricing</a>
        <a href="../blog/index.html">Blog</a>
        <a href="https://fishsmart-pro.onrender.com/privacy.html">Privacy Policy</a>
        <a href="https://fishsmart-pro.onrender.com">Open App</a>
      </nav>
      <div class="footer-copy">© 2026 FishSmart Pro. Science-first fishing intelligence.<br>Built for anglers who want to know <em>why</em>.</div>
    </div>
  </footer>"""


def post_nav_html(active: str = "blog") -> str:
    return f"""  <header class="nav" id="nav">
    <div class="nav-inner">
      <a href="../../index.html" class="nav-logo">
        <img src="../../assets/store_icon.png" alt="FishSmart Pro" class="nav-logo-icon">
        <span class="nav-logo-text">FishSmart<span class="text-neon"> Pro</span></span>
      </a>
      <nav class="nav-links" id="nav-links">
        <a href="../../index.html#app-preview">App Preview</a>
        <a href="../../index.html#features">Features</a>
        <a href="../../index.html#science">The Science</a>
        <a href="../../index.html#pricing">Pricing</a>
        <a href="../index.html" class="{('active' if active == 'blog' else '')}">Blog</a>
        <a href="https://fishsmart-pro.onrender.com" class="btn btn-outline btn-sm">Open App</a>
      </nav>
      <button class="nav-toggle" id="nav-toggle" aria-label="Toggle navigation menu" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
    </div>
  </header>"""


def post_footer_html() -> str:
    return """  <footer class="footer">
    <div class="container footer-inner">
      <div class="footer-brand"><img src="../../assets/store_icon.png" alt="FishSmart Pro" class="footer-logo"><span class="footer-name">FishSmart<span class="text-neon"> Pro</span></span></div>
      <nav class="footer-links">
        <a href="../../index.html#app-preview">App Preview</a>
        <a href="../../index.html#features">Features</a>
        <a href="../../index.html#science">Science</a>
        <a href="../../index.html#pricing">Pricing</a>
        <a href="../index.html">Blog</a>
        <a href="https://fishsmart-pro.onrender.com/privacy.html">Privacy Policy</a>
        <a href="https://fishsmart-pro.onrender.com">Open App</a>
      </nav>
      <div class="footer-copy">© 2026 FishSmart Pro. Science-first fishing intelligence.<br>Built for anglers who want to know <em>why</em>.</div>
    </div>
  </footer>"""


def build_post_page(meta: dict, html_body: str, slug: str) -> str:
    """Generate full HTML for an individual blog post."""
    title = meta["meta_title"] or meta["title"]
    desc = meta["meta_description"] or generate_excerpt(html_body)
    date_display = format_date(meta["date"])
    tags_html = "\n".join(
        f'<span class="blog-tag">{html.escape(kw)}</span>' for kw in meta["keywords"][:5]
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{html.escape(title)}</title>
  <meta name="description" content="{html.escape(desc)}">
  <meta name="keywords" content="{html.escape(', '.join(meta['keywords']))}">
  <meta name="author" content="{html.escape(meta['author'])}">
  <meta property="og:title" content="{html.escape(title)}">
  <meta property="og:description" content="{html.escape(desc)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="https://fishsmart-pro.com/blog/posts/{slug}.html">
  <meta property="og:image" content="../../assets/store_icon.png">
  <meta name="theme-color" content="#0f172a">
  <link rel="icon" href="../../assets/store_icon.png" type="image/png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Orbitron:wght@500;700;900&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../../style.css">
  <link rel="stylesheet" href="../blog.css">
</head>
<body>

  <div class="bg-waves" aria-hidden="true">
    <div class="wave"></div>
    <div class="wave"></div>
    <div class="wave"></div>
  </div>

{post_nav_html()}

  <article class="blog-post-container">
    <a href="../index.html" class="blog-post-back">← All Posts</a>

    <div class="blog-post-meta">
      <span class="blog-post-date">{html.escape(date_display)}</span>
      <div class="blog-post-tags">{tags_html}</div>
    </div>

    <h1 class="blog-post-title">{html.escape(meta['title'])}</h1>

    <div class="blog-post-body">
{html_body}
    </div>

    <div class="blog-post-cta">
      <h3>🎣 Try FishSmart Pro Free</h3>
      <p>Get <strong>3 full AI-powered fishing forecasts</strong> — no credit card required. See the science behind the bite.</p>
      <a href="https://fishsmart-pro.onrender.com" class="btn btn-primary btn-lg">Get My Free Forecast</a>
    </div>
  </article>

{post_footer_html()}

  <script src="../../script.js"></script>
</body>
</html>"""


def build_index_page(posts: list[dict]) -> str:
    """Generate the blog index listing page."""
    cards_html = ""
    for post in sorted(posts, key=lambda p: p["date"], reverse=True):
        tags = "\n".join(
            f'<span class="blog-tag">{html.escape(kw)}</span>'
            for kw in post["keywords"][:3]
        )
        cards_html += f"""      <a href="posts/{post['slug']}.html" class="blog-card">
        <div class="blog-card-header">
          <div class="blog-card-date">{html.escape(format_date(post['date']))}</div>
          <h2 class="blog-card-title">{html.escape(post['title'])}</h2>
        </div>
        <div class="blog-card-excerpt">{html.escape(post['excerpt'])}</div>
        <div class="blog-card-tags">{tags}</div>
      </a>
"""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FishSmart Pro Blog — Fishing Science & Tips</title>
  <meta name="description" content="Science-backed fishing tips, gear guides, and strategies from the FishSmart Pro team. Learn the why behind the bite.">
  <meta property="og:title" content="FishSmart Pro Blog — Fishing Science & Tips">
  <meta property="og:description" content="Science-backed fishing tips, gear guides, and strategies from the FishSmart Pro team.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://fishsmart-pro.com/blog/index.html">
  <meta name="theme-color" content="#0f172a">
  <link rel="icon" href="../assets/store_icon.png" type="image/png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Orbitron:wght@500;700;900&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../style.css">
  <link rel="stylesheet" href="blog.css">
</head>
<body>

  <div class="bg-waves" aria-hidden="true">
    <div class="wave"></div>
    <div class="wave"></div>
    <div class="wave"></div>
  </div>

{nav_html()}

  <section class="blog-hero">
    <div class="container">
      <span class="blog-hero-tag">🎣 Fishing Science Blog</span>
      <h1>The <span class="gradient-text">FishSmart Pro</span> Blog</h1>
      <p>Science-backed fishing tips, gear guides, and strategies. Learn the <em>why</em> behind the bite — then go catch more fish.</p>
    </div>
  </section>

  <div class="container">
    <div class="blog-grid">
{cards_html}    </div>
  </div>

{footer_html()}

  <script src="../script.js"></script>
</body>
</html>"""


def build_all() -> list[str]:
    """Build all blog posts and the index page. Returns list of built slugs."""
    md_files = sorted(glob.glob(str(SOURCE_DIR / "*.md")))
    if not md_files:
        print(f"⚠ No markdown files found in {SOURCE_DIR}")
        return []

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    all_posts = []

    for md_path in md_files:
        md_file = Path(md_path)
        print(f"📝 Processing: {md_file.name}")

        content = md_file.read_text(encoding="utf-8")
        meta, body = parse_metadata(content)

        # Reset markdown processor for each post
        MD.reset()
        html_body = MD.convert(body)

        slug = slugify(meta["title"])
        excerpt = generate_excerpt(html_body)

        post_html = build_post_page(meta, html_body, slug)
        output_path = OUTPUT_DIR / f"{slug}.html"
        output_path.write_text(post_html, encoding="utf-8")
        print(f"   ✅ → {output_path.name}")

        all_posts.append(
            {
                "title": meta["title"],
                "date": meta["date"],
                "slug": slug,
                "excerpt": excerpt,
                "keywords": meta["keywords"],
            }
        )

    # Build index
    index_html = build_index_page(all_posts)
    INDEX_PATH.write_text(index_html, encoding="utf-8")
    print(f"\n📋 Index: {INDEX_PATH.name} ({len(all_posts)} posts)")

    return [p["slug"] for p in all_posts]


def watch_mode():
    """Watch for changes and rebuild."""
    print(f"👁 Watching {SOURCE_DIR} for changes (Ctrl+C to stop)...\n")
    last_mtimes = {}

    while True:
        md_files = sorted(glob.glob(str(SOURCE_DIR / "*.md")))
        changed = False

        for md_path in md_files:
            mtime = os.path.getmtime(md_path)
            if md_path not in last_mtimes or last_mtimes[md_path] != mtime:
                last_mtimes[md_path] = mtime
                changed = True

        if changed:
            print(f"\n[{time.strftime('%H:%M:%S')}] Change detected, rebuilding...\n")
            build_all()
            print("\n✅ Build complete. Waiting for changes...\n")

        time.sleep(5)


if __name__ == "__main__":
    print("=" * 60)
    print("  FishSmart Pro — Blog Build Script")
    print("=" * 60 + "\n")

    if "--watch" in sys.argv:
        build_all()
        watch_mode()
    else:
        slugs = build_all()
        print(f"\n✅ Build complete: {len(slugs)} post(s)")
        print(f"   Output: {OUTPUT_DIR}")
        print(f"   Index:  {INDEX_PATH}\n")
