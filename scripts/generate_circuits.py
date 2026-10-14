"""Generate simplified SVG circuit outlines for the 24 championship circuits."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
circuits_dir = ROOT / "frontend" / "assets" / "circuits"
circuits_dir.mkdir(parents=True, exist_ok=True)

img_dir = ROOT / "frontend" / "assets" / "img"
img_dir.mkdir(parents=True, exist_ok=True)

paths = {
    "monaco": "M 35,90 L 55,42 L 85,30 L 115,35 L 130,52 L 108,66 L 118,72 L 142,66 L 168,76 L 162,96 L 138,90 L 112,96 L 86,90 L 52,96 Z",
    "silverstone": "M 35,45 L 72,30 L 122,25 L 162,35 L 176,62 L 156,76 L 122,60 L 106,80 L 142,96 L 86,96 L 62,76 L 46,86 L 26,66 Z",
    "monza": "M 30,40 L 132,28 L 168,44 L 172,76 L 142,86 L 102,76 L 76,86 L 40,82 L 24,60 Z",
    "spa": "M 30,70 L 46,86 L 72,80 L 102,34 L 142,24 L 172,40 L 162,72 L 142,86 L 112,80 L 82,96 L 46,96 Z",
    "suzuka": "M 36,66 L 66,34 L 102,46 L 136,34 L 166,56 L 152,86 L 116,76 L 92,86 L 62,76 L 42,86 Z",
    "red_bull_ring": "M 36,82 L 42,40 L 96,24 L 146,34 L 168,66 L 132,82 L 92,76 L 62,86 Z",
    "interlagos": "M 42,36 L 76,24 L 122,36 L 162,52 L 146,82 L 116,92 L 92,76 L 76,86 L 52,76 L 36,56 Z",
    "albert_park": "M 46,86 L 36,52 L 62,30 L 112,24 L 156,40 L 166,76 L 136,92 L 96,86 L 66,96 Z",
    "bahrain": "M 36,86 L 42,34 L 76,30 L 102,52 L 132,34 L 166,52 L 152,86 L 112,80 L 82,96 Z",
    "baku": "M 30,86 L 30,34 L 72,30 L 96,52 L 122,40 L 166,46 L 172,86 L 112,86 L 72,86 Z",
    "catalunya": "M 32,76 L 52,34 L 102,30 L 146,46 L 166,72 L 142,86 L 112,76 L 82,86 L 52,82 Z",
    "hungaroring": "M 42,82 L 42,40 L 82,30 L 116,46 L 156,34 L 166,72 L 136,86 L 102,76 L 72,86 Z",
    "imola": "M 36,76 L 46,34 L 86,30 L 126,46 L 166,40 L 156,82 L 122,86 L 82,76 L 56,86 Z",
    "jeddah": "M 40,92 L 46,24 L 72,20 L 76,62 L 86,30 L 92,86 L 66,96 Z",
    "losail": "M 42,82 L 52,34 L 92,30 L 136,46 L 166,66 L 146,86 L 106,80 L 72,92 Z",
    "marina_bay": "M 36,82 L 42,40 L 76,30 L 112,40 L 146,34 L 166,66 L 146,86 L 116,76 L 82,86 Z",
    "miami": "M 36,76 L 46,34 L 96,30 L 142,40 L 166,72 L 146,86 L 106,76 L 76,86 Z",
    "rodriguez": "M 36,82 L 42,34 L 86,30 L 132,40 L 166,56 L 152,86 L 116,80 L 82,92 Z",
    "shanghai": "M 36,76 L 66,30 L 112,46 L 142,30 L 166,62 L 146,86 L 102,76 L 66,86 Z",
    "vegas": "M 30,82 L 30,40 L 82,34 L 126,40 L 166,52 L 166,82 L 116,82 L 76,82 Z",
    "villeneuve": "M 36,82 L 46,34 L 86,30 L 132,34 L 166,56 L 152,86 L 116,80 L 72,86 Z",
    "yas_marina": "M 36,82 L 46,40 L 86,30 L 126,40 L 166,62 L 152,86 L 112,76 L 72,86 Z",
    "zandvoort": "M 42,82 L 46,34 L 86,30 L 126,46 L 166,66 L 142,86 L 102,76 L 72,86 Z",
    "americas": "M 36,82 L 52,30 L 92,46 L 132,30 L 166,56 L 156,86 L 116,76 L 76,86 Z",
}

generic_path = "M 42,82 L 46,34 L 92,30 L 136,40 L 166,66 L 146,86 L 102,76 L 66,86 Z"

all_circuits = [
    "albert_park", "americas", "bahrain", "baku", "catalunya",
    "hungaroring", "imola", "interlagos", "jeddah", "losail",
    "marina_bay", "miami", "monaco", "monza", "red_bull_ring",
    "rodriguez", "shanghai", "silverstone", "spa", "suzuka",
    "vegas", "villeneuve", "yas_marina", "zandvoort",
]

for ref in all_circuits:
    d = paths.get(ref, generic_path)
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" fill="none" stroke="#e10600" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-label="{ref} circuit layout">
  <path d="{d}" />
</svg>
"""
    (circuits_dir / f"{ref}.svg").write_text(svg, encoding="utf-8")

# Generic fallback
(circuits_dir / "generic.svg").write_text(
    f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" fill="none" stroke="#e10600" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-label="Generic circuit layout">
  <path d="{generic_path}" />
</svg>
""",
    encoding="utf-8",
)

print(f"Generated {len(all_circuits)} circuit SVGs in {circuits_dir}")
