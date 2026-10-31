"""Cut the site's web fonts down to what it uses. Run by hand; commit the output.

    pip install -r sites/hacklytics2027/scripts/subset-fonts.requirements.txt
    python sites/hacklytics2027/scripts/subset-fonts.py          # rebuild the fonts
    python sites/hacklytics2027/scripts/subset-fonts.py --check  # after next build

Not part of the build: the output is committed, so CI needs no Python.

Rerun when:
- --check reports a character outside the core, or one no font file has. New
  copy can do that: add it to `used` below, or accept the extended download.
- an axis or OpenType feature in use changes (`axes`, `features`).
- the `url` and `sha256` pins move to a newer upstream font.

Writes the fonts and OFL texts to public/fonts/, plus app/fonts.generated.css
and lib/fonts.generated.ts. Reads every font back before keeping it, and stops
if one came out wrong.
"""
import argparse
import hashlib
import html.parser
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
UPSTREAM = "https://raw.githubusercontent.com/google/fonts"

ASCII = set(range(0x20, 0x7F))
# NBSP, then the punctuation most pages use: curly quotes, dashes, ellipsis.
PUNCTUATION = {0xA0, 0x2018, 0x2019, 0x201C, 0x201D, 0x2013, 0x2014, 0x2026}
LATIN = set(range(0xA0, 0x100)) | set(range(0x100, 0x180))

FONTS = [
    {
        "key": "instrument-sans",
        "family": "Instrument Sans",
        "css_var": "--font-instrument",
        "source": "InstrumentSans[wdth,wght].ttf",
        "url": f"{UPSTREAM}/0b58fb370093f9a9f4ff785d94405710b79de67c/ofl/instrumentsans",
        "sha256": "b24f1812584816958afcf22e22d08e44318c5e51651e25d2438efdde389b33b1",
        # wdth is pinned because nothing sets font-stretch. wght stays 400-700
        # though the site only uses 400 and 500. Narrowing it saves 2.8 KB but
        # moves text at 500: gvar and HVAR store whole units, so the fractional
        # advances at 500 get rounded and glyphs land on other sub-pixels.
        "axes": {"wdth": 100},
        "weights": [400, 500],
        "descriptors": "font-style:normal;font-weight:400 700;font-stretch:100%;font-display:swap",
        # kern, liga, ccmp, mark, mkmk are on by default in browsers; tnum is
        # tabular-nums. Without these the text would shape differently.
        "features": ["kern", "liga", "ccmp", "mark", "mkmk", "tnum"],
        # Used on every page (footer ©, hero and menu ·), so these sit in the
        # core: in the extended file, every page would download it.
        "used": {0xA9, 0xB7},
        # next/font's generated face, verbatim. Do not regenerate.
        "fallback": 'src:local(Arial);ascent-override:94.42%;descent-override:24.33%;line-gap-override:0.0%;size-adjust:102.74%',
    },
    {
        "key": "silkscreen",
        "family": "Silkscreen",
        "css_var": "--font-silkscreen",
        "source": "Silkscreen-Regular.ttf",
        "url": f"{UPSTREAM}/8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5/ofl/silkscreen",
        "sha256": "c845473330b94c2079ce9af01c51ac8ba2d99c24f4d14c039843bbb8e642ebd8",
        "axes": None,
        "weights": [400],
        "descriptors": "font-style:normal;font-weight:400;font-display:swap",
        "features": ["mark", "mkmk"],
        "used": set(),
        "fallback": 'src:local(Arial);ascent-override:68.84%;descent-override:16.71%;line-gap-override:0.0%;size-adjust:149.62%',
    },
]


def source_path(cfg):
    """The pinned upstream TTF, downloaded once and checked against its hash."""
    CACHE.mkdir(exist_ok=True)
    path = CACHE / cfg["source"]
    if not path.exists():
        url = f"{cfg['url']}/{cfg['source'].replace('[', '%5B').replace(']', '%5D')}"
        with urllib.request.urlopen(url) as response:
            path.write_bytes(response.read())
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != cfg["sha256"]:
        path.unlink()
        sys.exit(f"{cfg['source']}: hash {digest} does not match the pin")
    return path


def license_path(cfg):
    path = CACHE / f"OFL-{cfg['key']}.txt"
    if not path.exists():
        with urllib.request.urlopen(f"{cfg['url']}/OFL.txt") as response:
            path.write_bytes(response.read())
    return path


def narrowed(cfg):
    font = TTFont(source_path(cfg), recalcTimestamp=False)
    if cfg["axes"]:
        font = instancer.instantiateVariableFont(font, cfg["axes"])
        # Named instances and STAT only feed font menus. Nothing here reads them.
        font["fvar"].instances = []
    return font


def cut(cfg, unicodes, path):
    font = narrowed(cfg)
    options = subset.Options()
    options.layout_features = cfg["features"]
    options.hinting = False
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
    return font


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


def pinned(font, wght):
    if "fvar" not in font:
        return font
    return instancer.instantiateVariableFont(font, {"wght": wght})


def verify(cfg, path, expected):
    """Font tools have quirks, so trust the file on disk and not the options."""
    problems = []
    font = TTFont(path)
    source = TTFont(source_path(cfg))
    cmap = set(font.getBestCmap())
    if cmap != expected:
        problems.append(f"cmap differs from the plan: {sorted(cmap ^ expected)[:8]}")
    for table in ("fpgm", "prep", "cvt ", "cvar", "hdmx", "VDMX", "LTSH", "STAT", "DSIG"):
        if table in font:
            problems.append(f"{table} survived")
    if "glyf" in font:
        glyf = font["glyf"]
        if any(hasattr(glyf[g], "program") and glyf[g].program.getBytecode() for g in glyf.keys()):
            problems.append("glyph instructions survived")
    for table in ("GSUB", "GPOS"):
        if table in font and font[table].table.FeatureList:
            extra = {r.FeatureTag for r in font[table].table.FeatureList.FeatureRecord} - set(cfg["features"])
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
    if cfg["axes"]:
        wght = next(a for a in font["fvar"].axes if a.axisTag == "wght")
        if (wght.minValue, wght.defaultValue, wght.maxValue) != (400, 400, 700):
            problems.append("wght range is wrong")
        if [a.axisTag for a in font["fvar"].axes] != ["wght"]:
            problems.append("an axis survived that should be pinned")
    # Every glyph, at every weight in use, against the source at that weight.
    for weight in cfg["weights"]:
        ours = pinned(TTFont(path), weight)
        theirs = TTFont(source_path(cfg))
        if cfg["axes"]:
            theirs = instancer.instantiateVariableFont(theirs, {"wdth": 100, "wght": weight})
        for codepoint in cmap:
            (our_advance, our_shape), (their_advance, their_shape) = (
                outline(ours, codepoint),
                outline(theirs, codepoint),
            )
            moved = drift(our_shape, their_shape)
            if our_advance != their_advance or moved is None or moved > 0:
                problems.append(f"U+{codepoint:04X} differs from the source at {weight}: {moved}")
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
    if OUT.exists():
        for old in OUT.iterdir():
            old.unlink()
    OUT.mkdir(parents=True, exist_ok=True)

    faces, fallbacks, variables, preloads = [], [], [], []
    for cfg in FONTS:
        available = set(TTFont(source_path(cfg)).getBestCmap())
        core = (ASCII | PUNCTUATION | cfg["used"]) & available
        extended = LATIN & available - core
        for part, unicodes in (("extended", extended), ("core", core)):
            scratch = CACHE / f"{cfg['key']}-{part}.woff2"
            cut(cfg, unicodes, scratch)
            verify(cfg, scratch, unicodes)
            digest = hashlib.sha256(scratch.read_bytes()).hexdigest()[:10]
            name = f"{cfg['key']}-{part}.{digest}.woff2"
            shutil.copy(scratch, OUT / name)
            # From the file, not the plan: list only what it really contains.
            actual = set(TTFont(OUT / name).getBestCmap())
            faces.append(
                f'@font-face{{font-family:"{cfg["family"]}";{cfg["descriptors"]};'
                f'src:url(/fonts/{name})format("woff2");unicode-range:{unicode_range(actual)}}}'
            )
            if part == "core":
                preloads.append(f"/fonts/{name}")
            print(f"{name}: {(OUT / name).stat().st_size} bytes, {len(actual)} characters")
        fallbacks.append(f'@font-face{{font-family:"{cfg["family"]} Fallback";{cfg["fallback"]}}}')
        variables.append(f'{cfg["css_var"]}:"{cfg["family"]}","{cfg["family"]} Fallback"')
        shutil.copy(license_path(cfg), OUT / f"OFL-{cfg['key']}.txt")

    note = "/* Generated by scripts/subset-fonts.py. Do not edit. */\n"
    # Each font's core and extended faces share a family name, so the browser
    # treats them as one font: nothing can sit between them in the stack, and
    # the generated fallback only ever draws what neither file has.
    (SITE / "app" / "fonts.generated.css").write_text(
        note + "\n".join(faces + fallbacks) + "\n:root{" + ";".join(variables) + "}\n",
        encoding="utf-8",
        newline="\n",
    )
    (SITE / "lib" / "fonts.generated.ts").write_text(
        "// Generated by scripts/subset-fonts.py. Do not edit.\n"
        "export const FONT_PRELOADS = [\n"
        + "".join(f'  "{path}",\n' for path in preloads)
        + "];\n",
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
    """Compare the built pages against the committed fonts."""
    built = SITE / "out"
    if not built.exists():
        sys.exit("No out/ folder: run next build first.")
    fonts = {}
    for cfg in FONTS:
        for part in ("core", "extended"):
            path = next(OUT.glob(f"{cfg['key']}-{part}.*.woff2"))
            fonts.setdefault(part, set()).update(TTFont(path).getBestCmap())
    clean = True
    for page in sorted(built.glob("*.html")):
        parser = Visible()
        parser.feed(page.read_text(encoding="utf-8"))
        chars = {ord(c) for c in "".join(parser.text)} - {0x09, 0x0A, 0x0D}
        extended = sorted(chars - fonts["core"] & fonts["extended"])
        missing = sorted(chars - fonts["core"] - fonts["extended"])
        if extended:
            clean = False
            print(f"{page.name}: needs the extended file for", ", ".join(f"U+{c:04X} {chr(c)}" for c in extended))
        if missing:
            clean = False
            print(f"{page.name}: in no font file, so system fonts draw", ", ".join(f"U+{c:04X} {chr(c)}" for c in missing))
        if not extended and not missing:
            print(f"{page.name}: every character is in the core")
    sys.exit(0 if clean else 1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Cut the site's web fonts down to what it uses.")
    parser.add_argument("--check", action="store_true", help="compare out/ against the committed fonts")
    if parser.parse_args().check:
        check()
    else:
        build()
