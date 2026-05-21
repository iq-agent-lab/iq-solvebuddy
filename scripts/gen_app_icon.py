#!/usr/bin/env python3
"""Generate the Solve Buddy app icon.

Design: dark glass squircle + faceted solve-stone + soft orbital spark.
No third-party Python dependency is required; macOS `sips` renders the SVG.
"""

from pathlib import Path
import shutil
import subprocess
import tempfile

SIZE = 1024


def require_sips() -> str:
    sips = shutil.which('sips')
    if not sips:
        raise SystemExit('macOS `sips` is required to render the app icon PNGs.')
    return sips


def icon_svg() -> str:
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE}" height="{SIZE}" viewBox="0 0 {SIZE} {SIZE}">
  <defs>
    <clipPath id="squircle">
      <rect width="{SIZE}" height="{SIZE}" rx="230" ry="230"/>
    </clipPath>
    <linearGradient id="bg" x1="128" y1="24" x2="920" y2="1000" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#191426"/>
      <stop offset="0.48" stop-color="#0f0d18"/>
      <stop offset="1" stop-color="#07060c"/>
    </linearGradient>
    <linearGradient id="auraA" x1="56" y1="116" x2="836" y2="636" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#9b7cff" stop-opacity="0"/>
      <stop offset="0.35" stop-color="#9b7cff" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#9b7cff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="auraB" x1="1048" y1="296" x2="164" y2="884" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#72d7cf" stop-opacity="0"/>
      <stop offset="0.46" stop-color="#72d7cf" stop-opacity="0.15"/>
      <stop offset="1" stop-color="#72d7cf" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="auraC" x1="188" y1="940" x2="940" y2="292" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#d8866f" stop-opacity="0"/>
      <stop offset="0.56" stop-color="#d8866f" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#d8866f" stop-opacity="0"/>
    </linearGradient>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="2" seed="12"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.032"/>
      </feComponentTransfer>
    </filter>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="170%">
      <feDropShadow dx="0" dy="34" stdDeviation="26" flood-color="#000000" flood-opacity="0.42"/>
    </filter>
    <filter id="softBlur" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="13"/>
    </filter>
  </defs>

  <g clip-path="url(#squircle)">
    <rect width="{SIZE}" height="{SIZE}" fill="url(#bg)"/>
    <path d="M-72 156 C180 84 326 170 522 316 C708 455 828 514 1110 430 L1110 0 L-72 0 Z" fill="url(#auraA)"/>
    <path d="M1060 208 C790 306 720 420 566 620 C404 830 220 898 -86 768 L-86 1080 L1060 1080 Z" fill="url(#auraB)"/>
    <path d="M126 962 C296 698 436 610 646 488 C812 392 908 300 1078 72 L1078 1080 L126 1080 Z" fill="url(#auraC)"/>
    <rect width="{SIZE}" height="{SIZE}" filter="url(#grain)" opacity="0.8"/>
    <rect x="1.5" y="1.5" width="1021" height="1021" rx="228" ry="228" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="3"/>

    <g transform="rotate(-18 512 520)" opacity="0.68">
      <ellipse cx="512" cy="520" rx="364" ry="128" fill="none" stroke="#fff1e8" stroke-opacity="0.36" stroke-width="7"/>
      <ellipse cx="512" cy="520" rx="332" ry="104" fill="none" stroke="#9b7cff" stroke-opacity="0.18" stroke-width="4"/>
    </g>

    <polygon points="512,144 682,220 818,428 734,732 518,884 300,766 204,522 300,272"
      fill="#d8866f" opacity="0.32" filter="url(#softBlur)"/>

    <g filter="url(#shadow)">
      <g>
        <polygon points="512,144 682,220 818,428 734,732 518,884 300,766 204,522 300,272" fill="#523a87"/>
        <polygon points="512,144 300,272 430,484" fill="#b796ff"/>
        <polygon points="512,144 682,220 598,470 430,484" fill="#dfabff"/>
        <polygon points="682,220 818,428 598,470" fill="#8869ff"/>
        <polygon points="818,428 734,732 598,470" fill="#5f4bb7"/>
        <polygon points="734,732 518,884 520,590 598,470" fill="#c45779"/>
        <polygon points="518,884 300,766 430,484 520,590" fill="#482f6f"/>
        <polygon points="300,766 204,522 430,484" fill="#332a5c"/>
        <polygon points="204,522 300,272 430,484" fill="#7453c6"/>
        <polygon points="430,484 598,470 520,590" fill="#ffb792" opacity="0.96"/>
        <polygon points="430,484 520,590 300,766" fill="#704090" opacity="0.96"/>
        <polygon points="312,268 492,168 426,404 274,512" fill="#ffffff" opacity="0.18"/>
        <polygon points="506,156 640,224 588,324 436,414" fill="#ffe9dc" opacity="0.2"/>
        <polyline points="512,144 682,220 818,428 734,732 518,884 300,766 204,522 300,272 512,144"
          fill="none" stroke="#fff0e8" stroke-opacity="0.54" stroke-width="5" stroke-linejoin="round"/>
        <g fill="none" stroke="#fff8ef" stroke-opacity="0.3" stroke-width="4" stroke-linecap="round">
          <line x1="512" y1="144" x2="430" y2="484"/>
          <line x1="682" y1="220" x2="598" y2="470"/>
          <line x1="818" y1="428" x2="598" y2="470"/>
          <line x1="734" y1="732" x2="520" y2="590"/>
          <line x1="518" y1="884" x2="520" y2="590"/>
          <line x1="300" y1="766" x2="430" y2="484"/>
          <line x1="204" y1="522" x2="430" y2="484"/>
          <line x1="430" y1="484" x2="598" y2="470"/>
          <line x1="430" y1="484" x2="520" y2="590"/>
          <line x1="598" y1="470" x2="520" y2="590"/>
        </g>
      </g>
    </g>

    <circle cx="798" cy="262" r="35" fill="#f8f3e8" opacity="0.96"/>
    <circle cx="798" cy="262" r="47" fill="#f8f3e8" opacity="0.24" filter="url(#softBlur)"/>
    <circle cx="786" cy="250" r="11" fill="#ffffff" opacity="0.92"/>
  </g>
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
    print('Generating app icon...')
    icon = Path('build/icon.png')
    render_svg(icon_svg(), icon)
    print(f'  ✓ {icon}  ({SIZE}x{SIZE})')

    for sz in [512, 256, 128, 64]:
        out = Path(f'build/icon-{sz}.png')
        resize_png(icon, sz, out)
        print(f'  ✓ {out}')


if __name__ == '__main__':
    main()
