#!/usr/bin/env python3
"""Generate the Solve Buddy tray icon.

Transparent faceted stone, rendered via macOS `sips` from SVG.
"""

from pathlib import Path
import shutil
import subprocess
import tempfile


def require_sips() -> str:
    sips = shutil.which('sips')
    if not sips:
        raise SystemExit('macOS `sips` is required to render tray icon PNGs.')
    return sips


def tray_svg(size: int = 256) -> str:
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 256 256">
  <defs>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="170%">
      <feDropShadow dx="0" dy="8" stdDeviation="7" flood-color="#000000" flood-opacity="0.38"/>
    </filter>
  </defs>
  <g filter="url(#shadow)">
    <g>
      <polygon points="128,25 174,45 213,103 190,185 130,228 70,195 42,131 70,66" fill="#523a87"/>
      <polygon points="128,25 70,66 106,118" fill="#b796ff"/>
      <polygon points="128,25 174,45 152,118 106,118" fill="#dfabff"/>
      <polygon points="174,45 213,103 152,118" fill="#8869ff"/>
      <polygon points="213,103 190,185 152,118" fill="#5f4bb7"/>
      <polygon points="190,185 130,228 130,151 152,118" fill="#c45779"/>
      <polygon points="130,228 70,195 106,118 130,151" fill="#482f6f"/>
      <polygon points="70,195 42,131 106,118" fill="#332a5c"/>
      <polygon points="42,131 70,66 106,118" fill="#7453c6"/>
      <polygon points="106,118 152,118 130,151" fill="#ffb792" opacity="0.96"/>
      <polyline points="128,25 174,45 213,103 190,185 130,228 70,195 42,131 70,66 128,25"
        fill="none" stroke="#fff0e8" stroke-opacity="0.58" stroke-width="2" stroke-linejoin="round"/>
      <g fill="none" stroke="#fff8ef" stroke-opacity="0.33" stroke-width="1.4" stroke-linecap="round">
        <line x1="128" y1="25" x2="106" y2="118"/>
        <line x1="174" y1="45" x2="152" y2="118"/>
        <line x1="213" y1="103" x2="152" y2="118"/>
        <line x1="190" y1="185" x2="130" y2="151"/>
        <line x1="130" y1="228" x2="130" y2="151"/>
        <line x1="70" y1="195" x2="106" y2="118"/>
        <line x1="42" y1="131" x2="106" y2="118"/>
        <line x1="106" y1="118" x2="152" y2="118"/>
        <line x1="106" y1="118" x2="130" y2="151"/>
        <line x1="152" y1="118" x2="130" y2="151"/>
      </g>
    </g>
  </g>
  <circle cx="201" cy="54" r="10" fill="#f8f3e8" opacity="0.96"/>
  <circle cx="94" cy="77" r="5" fill="#72d7cf" opacity="0.82"/>
</svg>'''


def render_svg(svg: str, output: Path) -> None:
    sips = require_sips()
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', suffix='.svg', delete=False) as handle:
        handle.write(svg)
        svg_path = Path(handle.name)
    try:
        subprocess.run([sips, '-s', 'format', 'png', str(svg_path), '--out', str(output)], check=True)
    finally:
        svg_path.unlink(missing_ok=True)


def resize_png(source: Path, size: int, output: Path) -> None:
    sips = require_sips()
    subprocess.run([sips, '-z', str(size), str(size), str(source), '--out', str(output)], check=True)


def main() -> None:
    source = Path('assets/tray-icon.png')
    render_svg(tray_svg(), source)
    print('tray-icon.png 256x256 generated')

    for sz in (32, 18):
        out = Path(f'assets/tray-icon-{sz}.png')
        resize_png(source, sz, out)
        print(f'tray-icon-{sz}.png generated')


if __name__ == '__main__':
    main()
