"""Cut mainweb's web fonts down to what it uses. Run by hand; commit the output.

    pip install -r sites/mainweb/scripts/subset-fonts.requirements.txt
    python sites/mainweb/scripts/subset-fonts.py          # rebuild the fonts
    python sites/mainweb/scripts/subset-fonts.py --check  # after next build

Not part of the build: the output is committed, so CI needs no Python.

Rerun when:
- a page starts using a weight that has no file. Geist Sans has 400, 500, 600,
  700 and 900, Geist Mono 400 to 700, Silkscreen 700, and a browser picks the
  nearest. New italic Newsreader needs its italic file adding back: there is
  none, so the browser would slant it.
- a font-display element goes below 18px: opsz stops there.
- --check reports a character outside the core, or one no font file has. New
  copy can do that: add it to `used` below, or accept the extended download.
- an OpenType feature in use changes (`features`).
- the `geist` package moves, or a `url` and `sha256` pin moves: the version and
  hash checks stop the script until the pin is updated on purpose.

Writes the fonts and OFL texts to public/fonts/, one fonts.generated.css beside
each layout that loads them, and lib/fonts.generated.ts. Reads every font back
before keeping it, and stops if one came out wrong.
"""
import argparse
import hashlib
import html.parser
import io
import itertools
import json
import re
import shutil
import sys
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

SITE = Path(__file__).resolve().parent.parent
CACHE = SITE / "scripts" / ".font-cache"
OUT = SITE / "public" / "fonts"
GEIST = SITE / "node_modules" / "geist"
GEIST_VERSION = "1.7.2"
UPSTREAM = "https://raw.githubusercontent.com/google/fonts"

ASCII = set(range(0x20, 0x7F))
# NBSP, then the punctuation most pages use: curly quotes, dashes, ellipsis.
PUNCTUATION = {0xA0, 0x2018, 0x2019, 0x201C, 0x201D, 0x2013, 0x2014, 0x2026}
LATIN = set(range(0xA0, 0x100)) | set(range(0x100, 0x180))
# Used in the source but not Latin: arrows, minus, midline ellipsis.
SYMBOLS = {0x2190, 0x2192, 0x2193, 0x2212, 0x22EF}

# A browser turns these on by itself, so dropping one would change the shaping.
# tnum is tabular-nums, used all over the admin tables.
FEATURES = ["calt", "ccmp", "clig", "kern", "liga", "mark", "mkmk", "rlig", "rvrn", "tnum"]

SCOPES = {
    "root": SITE / "app" / "fonts.generated.css",
    "portal": SITE / "app" / "(portal)" / "fonts.generated.css",
    "hacklytics": SITE / "app" / "(portal)" / "hacklytics" / "fonts.generated.css",
}


def geist(folder, prefix, key, family, weights, **first):
    """One static cut per weight, because the variable Geist renders differently.

    The static files carry TrueType hinting and the variable font has none, so
    on Windows at 1x every Geist glyph would change. Hinting is kept here for
    that reason, at about 5 KB a file. Set `hinting` to False to trade the
    pixels for the bytes. These files, not the variable one, are what the site
    has always shipped, and their names are off by one: "Black" is at 800 and
    "UltraBlack", which is the ExtraBold drawing, is at 900.

    Geist has no glyph for the breve letters in Latin Extended-A. A browser
    builds them from a letter and U+0306, but Chrome only sees the characters
    in a face's unicode-range, and plain E belongs to the core. So they come
    from the fallback stack: the one thing this split could not keep.
    """
    return [
        {
            "key": f"{key}-{weight}",
            "license_key": key,
            "scope": "root",
            "family": family,
            "local": GEIST / "dist" / "fonts" / folder / f"{prefix}-{name}.woff2",
            "license": GEIST / "LICENSE.txt",
            "axes": None,
            "hinting": True,
            "weights": [f"font-weight:{weight}"],
            "checks": [{}],
            "used": {0xA9, 0xB7, 0x2190, 0x2192},
            "fallback": None,
            # Only Regular: pages use a few weights each, and nearly half use no
            # Geist at all, so the rest arrive when a page asks for them.
            "preload": weight == 400,
            **(first if weight == 400 else {}),
        }
        for weight, name in weights.items()
    ]


FONTS = [
    *geist(
        "geist-sans",
        "Geist",
        "geist-sans",
        "GeistSans",
        {400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 900: "UltraBlack"},
        css_var="--font-geist-sans",
        stack='"GeistSans", "GeistSans Fallback", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Inter, Segoe UI, Roboto, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji',
        fallback="src:local(Arial);ascent-override:94.56%;descent-override:27.76%;line-gap-override:0.0%;size-adjust:106.28%",
    ),
    *geist(
        "geist-mono",
        "GeistMono",
        "geist-mono",
        "GeistMono",
        {400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold"},
        css_var="--font-geist-mono",
        # adjustFontFallback is off for this one upstream, so no fallback face.
        stack='"GeistMono", ui-monospace, SFMono-Regular, Roboto Mono, Menlo, Monaco, Liberation Mono, DejaVu Sans Mono, Courier New, monospace',
    ),
    {
        "key": "schibsted-grotesk",
        "scope": "portal",
        "family": "Schibsted Grotesk",
        "css_var": "--font-schibsted",
        "stack": '"Schibsted Grotesk", "Schibsted Grotesk Fallback"',
        "source": "SchibstedGrotesk[wght].ttf",
        "url": f"{UPSTREAM}/cc054e5ee906ac9b9024971b64d821aa2561c582/ofl/schibstedgrotesk",
        "sha256": "6ceeadf6be8e1fd7687011c7fa38ed0edd1abe967a0b73d97caec183552e823d",
        # The whole axis. Narrowing to 700 saves 1.8 KB but moves 58 advances.
        "axes": None,
        "weights": ["font-weight:400 900"],
        "checks": [{"wght": w} for w in (400, 500, 600, 700)],
        "used": {0xB7, 0x2193},
        # In the font, but in no subset Google serves, so a system font draws
        # them today. Adding them would redraw every back link.
        "exclude": {0x2190, 0x2192},
        "fallback": "src:local(Arial);ascent-override:93.46%;descent-override:24.67%;line-gap-override:0.0%;size-adjust:104.49%",
    },
    {
        "key": "newsreader",
        "scope": "portal",
        "family": "Newsreader",
        "css_var": "--font-newsreader",
        "stack": '"Newsreader", "Newsreader Fallback"',
        "source": "Newsreader[opsz,wght].ttf",
        "url": f"{UPSTREAM}/991ce1de6075188e6b8977a5aa9fcd3610a4e946/ofl/newsreader",
        "sha256": "8a08d13f8a6c0d51be379a60af84f945f65369a67e509ee3c3bdcc421254d7c1",
        # Headlines are 600 and the submit error screen is 700, but the range
        # keeps the 400 master: 600-700 saves 3.6 KB and moves 1719 advances.
        # opsz follows the font size, and the smallest headline is 18px.
        "axes": {"wght": (400, 800), "opsz": (18, 72)},
        "weights": ["font-weight:400 800"],
        "checks": [
            {"wght": w, "opsz": o}
            for w, o in itertools.product((600, 700), (18, 20, 22, 26, 28, 32, 36, 40, 56, 72))
        ],
        "used": set(),
        "fallback": "src:local(Times New Roman);ascent-override:69.68%;descent-override:25.12%;line-gap-override:0.0%;size-adjust:105.48%",
    },
    {
        "key": "instrument-sans",
        "scope": "hacklytics",
        "family": "Instrument Sans",
        "css_var": "--font-hl-sans",
        "stack": '"Instrument Sans", "Instrument Sans Fallback"',
        "source": "InstrumentSans[wdth,wght].ttf",
        "url": f"{UPSTREAM}/0b58fb370093f9a9f4ff785d94405710b79de67c/ofl/instrumentsans",
        "sha256": "b24f1812584816958afcf22e22d08e44318c5e51651e25d2438efdde389b33b1",
        # wdth is pinned because nothing sets font-stretch.
        "axes": {"wdth": 100},
        "weights": ["font-weight:400 700;font-stretch:100%"],
        "checks": [{"wght": w} for w in (400, 500, 600, 700)],
        "pin_in_source": {"wdth": 100},
        "used": set(),
        "exclude": {0x2190, 0x2192},  # As Schibsted Grotesk.
        "fallback": "src:local(Arial);ascent-override:94.42%;descent-override:24.33%;line-gap-override:0.0%;size-adjust:102.74%",
    },
    {
        "key": "silkscreen",
        "scope": "hacklytics",
        "family": "Silkscreen",
        "css_var": "--font-hl-pixel",
        "stack": '"Silkscreen", "Silkscreen Fallback"',
        "source": "Silkscreen-Bold.ttf",
        "url": f"{UPSTREAM}/7e8d490955e9d2629cd3095e8dadd6fafe3c16b8/ofl/silkscreen",
        "sha256": "768476aa712d4f5c3e18d3bce80f980a8bd3f72b7094d22ec5e768df3acfed61",
        # Only headings use it and .hl-theme sets them to 700, so Regular is gone.
        "axes": None,
        "weights": ["font-weight:700"],
        "checks": [{}],
        "used": set(),
        "fallback": "src:local(Arial);ascent-override:68.84%;descent-override:16.71%;line-gap-override:0.0%;size-adjust:149.62%",
    },
]


def source_path(cfg):
    """The pinned source font, downloaded once and checked against its hash."""
    if "local" in cfg:
        version = json.loads((GEIST / "package.json").read_text(encoding="utf-8"))["version"]
        if version != GEIST_VERSION:
            sys.exit(f"geist is {version}, not the pinned {GEIST_VERSION}")
        return cfg["local"]
    CACHE.mkdir(exist_ok=True)
    path = CACHE / cfg["source"]
    if not path.exists():
        url = f"{cfg['url']}/{cfg['source'].replace('[', '%5B').replace(']', '%5D')}"
        with urllib.request.urlopen(url) as response:
            path.write_bytes(response.read())
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != cfg["sha256"]:
        sys.exit(f"{path.name}: hash {digest} does not match the pin")
    return path


def license_path(cfg):
    if "license" in cfg:
        return cfg["license"]
    path = CACHE / f"OFL-{cfg['key']}.txt"
    if not path.exists():
        with urllib.request.urlopen(f"{cfg['url']}/OFL.txt") as response:
            path.write_bytes(response.read())
    return path


def check_license(cfg):
    """A Reserved Font Name would mean renaming the font once it is subset."""
    text = license_path(cfg).read_text(encoding="utf-8", errors="replace")
    if re.search(r"with Reserved Font Name", text, re.IGNORECASE):
        sys.exit(f"{cfg['key']}: its OFL reserves a font name, so the subset must be renamed")


def narrowed(cfg):
    font = TTFont(source_path(cfg), recalcTimestamp=False)
    if cfg["axes"]:
        font = instancer.instantiateVariableFont(font, cfg["axes"])
    if "fvar" not in font:
        return font
    # Named instances only feed font menus. Nothing here reads them.
    font["fvar"].instances = []
    # The instancer leaves glyphs with no deltas out of gvar, and the subsetter
    # then stops on them. Saving and reloading writes an entry for every glyph.
    font.flavor = None
    buffer = io.BytesIO()
    font.save(buffer)
    buffer.seek(0)
    return TTFont(buffer, recalcTimestamp=False)


def cut(cfg, unicodes, path):
    font = narrowed(cfg)
    options = subset.Options()
    options.layout_features = FEATURES
    options.hinting = cfg.get("hinting", False)
    options.glyph_names = False
    options.notdef_outline = True
    options.recalc_timestamp = False
    options.name_IDs = [0, 1, 2, 4, 6]  # The OFL text ships as a file beside the fonts.
    options.name_languages = [0x409]
    options.drop_tables += ["STAT", "DSIG", "meta"]
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=sorted(unicodes))
    subsetter.subset(font)
    font.flavor = "woff2"
    font.save(path)


def outline(font, codepoint):
    name = font.getBestCmap()[codepoint]
    glyphs = font.getGlyphSet()
    pen = DecomposingRecordingPen(glyphs)
    glyphs[name].draw(pen)
    return font["hmtx"][name][0], pen.value


def drift(ours, theirs):
    """Furthest any point moved, in font units; None if the shapes don't match."""
    if [op for op, _ in ours] != [op for op, _ in theirs]:
        return None
    worst = 0
    for (_, a), (_, b) in zip(ours, theirs):
        if len(a) != len(b):
            return None
        for (x1, y1), (x2, y2) in zip(a, b):
            worst = max(worst, abs(x1 - x2), abs(y1 - y2))
    return worst


def pinned(path, location):
    font = TTFont(path)
    if "fvar" not in font:
        return font
    return instancer.instantiateVariableFont(font, location)


def verify(cfg, path, expected):
    """Font tools have quirks, so trust the file on disk and not the options."""
    problems = []
    font = TTFont(path)
    source = TTFont(source_path(cfg))
    cmap = set(font.getBestCmap())
    if cmap != expected:
        problems.append(f"cmap differs from the plan: {sorted(cmap ^ expected)[:8]}")
    hinted = cfg.get("hinting", False)
    for table in ("cvar", "hdmx", "VDMX", "LTSH", "STAT", "DSIG", *(() if hinted else ("fpgm", "prep", "cvt "))):
        if table in font:
            problems.append(f"{table} survived")
    if hinted and "fpgm" not in font:
        problems.append("hinting was meant to stay and did not")
    if "glyf" in font and not hinted:
        glyf = font["glyf"]
        if any(hasattr(glyf[g], "program") and glyf[g].program.getBytecode() for g in glyf.keys()):
            problems.append("glyph instructions survived")
    for table in ("GSUB", "GPOS"):
        if table in font and font[table].table.FeatureList:
            extra = {r.FeatureTag for r in font[table].table.FeatureList.FeatureRecord} - set(FEATURES)
            if extra:
                problems.append(f"{table} kept {sorted(extra)}")
    # The numbers that set line height have to survive untouched.
    for table, field in (
        ("head", "unitsPerEm"), ("hhea", "ascent"), ("hhea", "descent"), ("hhea", "lineGap"),
        ("OS/2", "sTypoAscender"), ("OS/2", "sTypoDescender"), ("OS/2", "sTypoLineGap"),
        ("OS/2", "usWinAscent"), ("OS/2", "usWinDescent"), ("OS/2", "fsSelection"),
    ):
        if getattr(font[table], field) != getattr(source[table], field):
            problems.append(f"{table}.{field} changed")
    if "fvar" in font:
        for axis in font["fvar"].axes:
            planned = (cfg["axes"] or {}).get(axis.axisTag)
            if isinstance(planned, tuple) and (axis.minValue, axis.maxValue) != planned:
                problems.append(f"{axis.axisTag} range is {axis.minValue}-{axis.maxValue}")
            if isinstance(planned, (int, float)):
                problems.append(f"{axis.axisTag} survived but should be pinned")
    # Every glyph, at every weight in use, against the source at that weight.
    worst = 0
    for location in cfg["checks"]:
        ours = pinned(path, location)
        theirs = pinned(source_path(cfg), {**location, **cfg.get("pin_in_source", {})})
        for codepoint in cmap:
            (our_advance, our_shape), (their_advance, their_shape) = (
                outline(ours, codepoint),
                outline(theirs, codepoint),
            )
            moved = drift(our_shape, their_shape)
            if moved is None:
                problems.append(f"U+{codepoint:04X} changed shape at {location}")
            else:
                worst = max(worst, moved)
            if our_advance != their_advance:
                problems.append(f"U+{codepoint:04X} advance {their_advance} became {our_advance} at {location}")
    # Under a unit is floating-point interpolation, not a drawing that moved.
    if worst >= 1:
        problems.append(f"an outline point moved {worst} units")
    if problems:
        sys.exit(f"{path.name}:\n  " + "\n  ".join(problems[:12]))


def unicode_range(codepoints):
    runs, start, last = [], None, None
    for codepoint in sorted(codepoints):
        if start is None:
            start = last = codepoint
        elif codepoint == last + 1:
            last = codepoint
        else:
            runs.append((start, last))
            start = last = codepoint
    runs.append((start, last))
    return ",".join(f"U+{a:X}" if a == b else f"U+{a:X}-{b:X}" for a, b in runs)


def build():
    CACHE.mkdir(exist_ok=True)
    if OUT.exists():
        for old in OUT.iterdir():
            old.unlink()
    OUT.mkdir(parents=True, exist_ok=True)

    css = {scope: {"faces": [], "fallbacks": [], "variables": []} for scope in SCOPES}
    preloads = {scope: [] for scope in SCOPES}
    for cfg in FONTS:
        check_license(cfg)
        scope = css[cfg["scope"]]
        available = set(TTFont(source_path(cfg)).getBestCmap()) - cfg.get("exclude", set())
        core = (ASCII | PUNCTUATION | cfg["used"]) & available
        extended = (LATIN | SYMBOLS) & available - core
        for part, unicodes in (("extended", extended), ("core", core)):
            scratch = CACHE / f"{cfg['key']}-{part}.woff2"
            cut(cfg, unicodes, scratch)
            verify(cfg, scratch, unicodes)
            digest = hashlib.sha256(scratch.read_bytes()).hexdigest()[:10]
            name = f"{cfg['key']}-{part}.{digest}.woff2"
            shutil.copy(scratch, OUT / name)
            # From the file, not the plan: list only what it really contains.
            actual = set(TTFont(OUT / name).getBestCmap())
            for weight in cfg["weights"]:
                scope["faces"].append(
                    f'@font-face{{font-family:"{cfg["family"]}";font-style:normal;{weight};font-display:swap;'
                    f'src:url(/fonts/{name})format("woff2");unicode-range:{unicode_range(actual)}}}'
                )
            if part == "core" and cfg.get("preload", True):
                preloads[cfg["scope"]].append(f"/fonts/{name}")
            print(f"{name}: {(OUT / name).stat().st_size} bytes, {len(actual)} characters")
        if cfg.get("fallback"):
            scope["fallbacks"].append(f'@font-face{{font-family:"{cfg["family"]} Fallback";{cfg["fallback"]}}}')
        if "css_var" in cfg:
            scope["variables"].append(f'{cfg["css_var"]}:{cfg["stack"]}')
        shutil.copy(license_path(cfg), OUT / f"OFL-{cfg.get('license_key', cfg['key'])}.txt")

    note = "/* Generated by scripts/subset-fonts.py. Do not edit. */\n"
    # Each font's core and extended faces share a family name, so the browser
    # treats them as one font: nothing can sit between them in the stack, and
    # the generated fallback only ever draws what neither file has.
    for name, path in SCOPES.items():
        scope = css[name]
        path.write_text(
            note + "\n".join(scope["faces"] + scope["fallbacks"]) + "\n:root{" + ";".join(scope["variables"]) + "}\n",
            encoding="utf-8",
            newline="\n",
        )
    (SITE / "lib" / "fonts.generated.ts").write_text(
        "// Generated by scripts/subset-fonts.py. Do not edit.\n"
        "export const FONT_PRELOADS = {\n"
        + "".join(
            f"  {scope}: [\n" + "".join(f'    "{path}",\n' for path in paths) + "  ],\n"
            for scope, paths in preloads.items()
        )
        + "};\n",
        encoding="utf-8",
        newline="\n",
    )


class Visible(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.text, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        self.skip += tag in ("script", "style", "title")

    def handle_endtag(self, tag):
        self.skip -= tag in ("script", "style", "title")

    def handle_data(self, data):
        if not self.skip:
            self.text.append(data)


def check():
    """Compare the prerendered pages against the committed fonts. The portal
    renders per request, so its pages are not covered: --check reads no database."""
    built = SITE / ".next" / "server" / "app"
    if not built.exists():
        sys.exit("No .next folder: run next build first.")
    fonts = {}
    for cfg in FONTS:
        if cfg["scope"] != "root" or "-400" not in cfg["key"]:
            continue
        for part in ("core", "extended"):
            path = next(OUT.glob(f"{cfg['key']}-{part}.*.woff2"))
            fonts.setdefault(part, set()).update(TTFont(path).getBestCmap())
    clean = True
    for page in sorted(built.rglob("*.html")):
        parser = Visible()
        parser.feed(page.read_text(encoding="utf-8"))
        chars = {ord(c) for c in "".join(parser.text)} - {0x09, 0x0A, 0x0D}
        extended = sorted(chars - fonts["core"] & fonts["extended"])
        missing = sorted(chars - fonts["core"] - fonts["extended"])
        name = page.relative_to(built)
        if extended:
            clean = False
            print(f"{name}: needs the extended file for", ", ".join(f"U+{c:04X} {chr(c)}" for c in extended))
        if missing:
            clean = False
            print(f"{name}: in no font file, so system fonts draw", ", ".join(f"U+{c:04X} {chr(c)}" for c in missing))
        if not extended and not missing:
            print(f"{name}: every character is in the core")
    sys.exit(0 if clean else 1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Cut mainweb's web fonts down to what it uses.")
    parser.add_argument("--check", action="store_true", help="compare .next/ against the committed fonts")
    if parser.parse_args().check:
        check()
    else:
        build()
