# -*- coding: utf-8 -*-
"""Generate 30 K0 app icon candidates as 1024x1024 SVGs."""
import os

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

# K0 palette
BRICK   = "#C80306"
SAPPHIRE= "#284EA9"
YOLK    = "#F8D34A"
BROWN   = "#652300"
ROSE    = "#C14F94"
OLIVE   = "#6B6A4E"
PAPER_M = "#E8D9B8"
PAPER_C = "#F5EBD3"
PAPER_D = "#DDCEA9"
INK     = "#1a1a1a"
WHITE   = "#ffffff"

# iOS mask: 1024 * 22.5% = 230.4 corner radius
CORNER = 230

HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">'

# Common defs: paper texture filter (subtle noise), torn edge displacement
DEFS = '''
<defs>
  <filter id="paper" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/>
    <feColorMatrix values="0 0 0 0 0.4  0 0 0 0 0.3  0 0 0 0 0.15  0 0 0 0.08 0"/>
    <feComposite in2="SourceGraphic" operator="in"/>
    <feComposite in="SourceGraphic" operator="over"/>
  </filter>
  <filter id="torn" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="5"/>
    <feDisplacementMap in="SourceGraphic" scale="8"/>
  </filter>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="6"/>
    <feOffset dx="0" dy="4"/>
    <feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer>
    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <clipPath id="mask">
    <rect x="0" y="0" width="1024" height="1024" rx="230" ry="230"/>
  </clipPath>
</defs>
'''

def wrap(body, bg=PAPER_M):
    """Wrap icon body in iOS-rounded mask with background."""
    return f'''{HEADER}
{DEFS}
<g clip-path="url(#mask)">
  <rect x="0" y="0" width="1024" height="1024" fill="{bg}"/>
  {body}
</g>
</svg>'''

def save(idx, svg):
    path = os.path.join(OUT_DIR, f"icon-{idx:02d}.svg")
    with open(path, "w", encoding="utf-8") as f:
        f.write(svg)

# ========== ICON 1: Uppercase K, paper patchwork ==========
def icon_01():
    body = f'''
    <g filter="url(#torn)">
      <rect x="120" y="140" width="180" height="740" fill="{BRICK}"/>
      <polygon points="300,510 780,150 900,240 400,570" fill="{SAPPHIRE}"/>
      <polygon points="400,470 900,830 780,900 300,560" fill="{YOLK}"/>
    </g>
    <rect x="120" y="140" width="180" height="740" fill="none" stroke="{INK}" stroke-width="6" opacity="0.15"/>
    '''
    save(1, wrap(body, PAPER_M))

# ========== ICON 2: lowercase k, hand-drawn ==========
def icon_02():
    body = f'''
    <g stroke="{INK}" stroke-width="14" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 300 180 Q 295 500 305 850" stroke="{BRICK}" stroke-width="80"/>
      <path d="M 305 560 Q 500 400 720 250" stroke="{SAPPHIRE}" stroke-width="70"/>
      <path d="M 340 570 Q 550 700 750 870" stroke="{YOLK}" stroke-width="70"/>
    </g>
    <circle cx="720" cy="250" r="18" fill="{INK}"/>
    <circle cx="750" cy="870" r="18" fill="{INK}"/>
    '''
    save(2, wrap(body, PAPER_C))

# ========== ICON 3: K0 dual character ==========
def icon_03():
    body = f'''
    <g font-family="Georgia, serif" font-weight="900">
      <text x="140" y="720" font-size="720" fill="{BRICK}">K</text>
      <text x="560" y="720" font-size="720" fill="{SAPPHIRE}">0</text>
    </g>
    <rect x="80" y="820" width="864" height="18" fill="{YOLK}"/>
    '''
    save(3, wrap(body, PAPER_M))

# ========== ICON 4: 0 ring emphasized ==========
def icon_04():
    body = f'''
    <circle cx="512" cy="512" r="360" fill="none" stroke="{BRICK}" stroke-width="80"/>
    <circle cx="512" cy="512" r="280" fill="none" stroke="{SAPPHIRE}" stroke-width="40" stroke-dasharray="30 20"/>
    <text x="512" y="600" font-family="Georgia, serif" font-weight="900" font-size="380" fill="{INK}" text-anchor="middle">K</text>
    '''
    save(4, wrap(body, PAPER_C))

# ========== ICON 5: K with 0 in middle ==========
def icon_05():
    body = f'''
    <g font-family="Georgia, serif" font-weight="900">
      <text x="512" y="780" font-size="900" fill="{BRICK}" text-anchor="middle">K</text>
    </g>
    <circle cx="512" cy="500" r="120" fill="{YOLK}" stroke="{INK}" stroke-width="12"/>
    <circle cx="512" cy="500" r="60" fill="{PAPER_M}"/>
    '''
    save(5, wrap(body, PAPER_M))

# ========== ICON 6: Chinese 零 ==========
def icon_06():
    body = f'''
    <rect x="80" y="80" width="864" height="864" fill="{BRICK}" rx="60"/>
    <text x="512" y="720" font-family="'STKaiti','KaiTi',serif" font-weight="900" font-size="640" fill="{PAPER_C}" text-anchor="middle">零</text>
    <circle cx="180" cy="180" r="30" fill="{YOLK}"/>
    <circle cx="844" cy="844" r="30" fill="{YOLK}"/>
    '''
    save(6, wrap(body, PAPER_M))

# ========== ICON 7: Chinese 知 ==========
def icon_07():
    body = f'''
    <text x="512" y="740" font-family="'STKaiti','KaiTi',serif" font-weight="900" font-size="720" fill="{SAPPHIRE}" text-anchor="middle">知</text>
    <path d="M 100 900 Q 512 940 924 900" stroke="{BRICK}" stroke-width="18" fill="none"/>
    '''
    save(7, wrap(body, PAPER_C))

# ========== ICON 8: K + headphones ==========
def icon_08():
    body = f'''
    <path d="M 200 480 Q 200 260 512 260 Q 824 260 824 480" stroke="{INK}" stroke-width="60" fill="none"/>
    <rect x="160" y="460" width="120" height="200" rx="30" fill="{BRICK}"/>
    <rect x="744" y="460" width="120" height="200" rx="30" fill="{BRICK}"/>
    <text x="512" y="800" font-family="Georgia, serif" font-weight="900" font-size="360" fill="{INK}" text-anchor="middle">K</text>
    '''
    save(8, wrap(body, PAPER_M))

# ========== ICON 9: cutout podcast mic ==========
def icon_09():
    body = f'''
    <g filter="url(#torn)">
      <rect x="400" y="200" width="224" height="380" rx="112" fill="{BRICK}"/>
      <rect x="440" y="260" width="30" height="70" fill="{PAPER_C}"/>
      <rect x="500" y="260" width="30" height="70" fill="{PAPER_C}"/>
      <rect x="560" y="260" width="30" height="70" fill="{PAPER_C}"/>
      <path d="M 320 500 Q 320 720 512 720 Q 704 720 704 500" stroke="{SAPPHIRE}" stroke-width="30" fill="none"/>
      <rect x="490" y="720" width="44" height="120" fill="{BROWN}"/>
      <rect x="380" y="840" width="264" height="30" rx="15" fill="{BROWN}"/>
    </g>
    '''
    save(9, wrap(body, PAPER_M))

# ========== ICON 10: open book + soundwave ==========
def icon_10():
    body = f'''
    <g filter="url(#torn)">
      <polygon points="140,300 512,380 512,880 140,780" fill="{PAPER_C}" stroke="{INK}" stroke-width="8"/>
      <polygon points="512,380 884,300 884,780 512,880" fill="{PAPER_D}" stroke="{INK}" stroke-width="8"/>
    </g>
    <g stroke="{BRICK}" stroke-width="20" stroke-linecap="round">
      <line x1="380" y1="160" x2="380" y2="240"/>
      <line x1="460" y1="120" x2="460" y2="280"/>
      <line x1="540" y1="100" x2="540" y2="300"/>
      <line x1="620" y1="140" x2="620" y2="260"/>
      <line x1="700" y1="170" x2="700" y2="230"/>
    </g>
    '''
    save(10, wrap(body, PAPER_M))

# ========== ICON 11: brain + wave ==========
def icon_11():
    body = f'''
    <path d="M 260 340 Q 200 340 200 440 Q 160 500 220 560 Q 200 660 300 680 Q 320 780 440 760 Q 500 820 580 760 Q 700 780 720 680 Q 820 660 800 560 Q 860 500 820 440 Q 820 340 760 340 Q 720 260 620 280 Q 550 240 480 280 Q 400 260 340 300 Q 280 300 260 340 Z" fill="{ROSE}" stroke="{INK}" stroke-width="10"/>
    <path d="M 380 500 Q 460 450 540 500 Q 620 550 700 500" stroke="{INK}" stroke-width="10" fill="none"/>
    <path d="M 400 580 Q 500 540 600 580" stroke="{INK}" stroke-width="8" fill="none"/>
    <g stroke="{BRICK}" stroke-width="16" stroke-linecap="round">
      <line x1="140" y1="870" x2="140" y2="920"/>
      <line x1="220" y1="840" x2="220" y2="950"/>
      <line x1="300" y1="810" x2="300" y2="980"/>
      <line x1="380" y1="850" x2="380" y2="940"/>
      <line x1="460" y1="820" x2="460" y2="970"/>
      <line x1="540" y1="850" x2="540" y2="940"/>
      <line x1="620" y1="810" x2="620" y2="980"/>
      <line x1="700" y1="840" x2="700" y2="950"/>
      <line x1="780" y1="820" x2="780" y2="970"/>
      <line x1="860" y1="870" x2="860" y2="920"/>
    </g>
    '''
    save(11, wrap(body, PAPER_C))

# ========== ICON 12: tape K ==========
def icon_12():
    body = f'''
    <g transform="rotate(-8 512 512)">
      <rect x="140" y="380" width="744" height="240" fill="{YOLK}" opacity="0.85"/>
      <rect x="140" y="380" width="744" height="240" fill="none" stroke="{INK}" stroke-width="4" stroke-dasharray="12 8" opacity="0.4"/>
    </g>
    <text x="512" y="640" font-family="Georgia, serif" font-weight="900" font-size="500" fill="{INK}" text-anchor="middle">K</text>
    '''
    save(12, wrap(body, PAPER_M))

# ========== ICON 13: sticky note K ==========
def icon_13():
    body = f'''
    <g transform="rotate(-5 512 512)" filter="url(#shadow)">
      <polygon points="180,180 844,200 860,860 200,844" fill="{YOLK}"/>
      <polygon points="180,180 260,220 200,270" fill="{PAPER_D}" opacity="0.6"/>
    </g>
    <text x="512" y="700" font-family="Georgia, serif" font-weight="900" font-size="520" fill="{BRICK}" text-anchor="middle" transform="rotate(-5 512 512)">K</text>
    '''
    save(13, wrap(body, PAPER_M))

# ========== ICON 14: strawberry K ==========
def icon_14():
    body = f'''
    <path d="M 512 240 Q 260 300 260 560 Q 260 820 512 900 Q 764 820 764 560 Q 764 300 512 240 Z" fill="{BRICK}"/>
    <g fill="{YOLK}">
      <circle cx="380" cy="480" r="14"/><circle cx="460" cy="560" r="14"/><circle cx="560" cy="500" r="14"/>
      <circle cx="640" cy="600" r="14"/><circle cx="420" cy="680" r="14"/><circle cx="580" cy="720" r="14"/>
      <circle cx="500" cy="620" r="14"/><circle cx="360" cy="600" r="14"/><circle cx="660" cy="480" r="14"/>
    </g>
    <path d="M 400 260 Q 440 180 480 240 Q 512 160 544 240 Q 584 180 624 260 Z" fill="{OLIVE}"/>
    <text x="512" y="620" font-family="Georgia, serif" font-weight="900" font-size="320" fill="{PAPER_C}" text-anchor="middle" opacity="0.9">K</text>
    '''
    save(14, wrap(body, PAPER_C))

# ========== ICON 15: coffee + K ==========
def icon_15():
    body = f'''
    <path d="M 260 380 L 720 380 L 690 820 Q 690 880 630 880 L 350 880 Q 290 880 290 820 Z" fill="{BROWN}"/>
    <path d="M 720 460 Q 860 460 860 580 Q 860 700 720 700" fill="none" stroke="{BROWN}" stroke-width="40"/>
    <ellipse cx="490" cy="380" rx="230" ry="40" fill="{PAPER_D}"/>
    <text x="490" y="720" font-family="Georgia, serif" font-weight="900" font-size="400" fill="{PAPER_C}" text-anchor="middle">K</text>
    <g stroke="{INK}" stroke-width="10" fill="none" opacity="0.5">
      <path d="M 400 260 Q 380 220 400 180 Q 420 140 400 100"/>
      <path d="M 500 260 Q 480 220 500 180 Q 520 140 500 100"/>
      <path d="M 600 260 Q 580 220 600 180 Q 620 140 600 100"/>
    </g>
    '''
    save(15, wrap(body, PAPER_C))

# ========== ICON 16: scholar hat + headphones ==========
def icon_16():
    body = f'''
    <polygon points="140,420 512,280 884,420 512,560" fill="{INK}"/>
    <rect x="240" y="440" width="544" height="60" fill="{INK}"/>
    <line x1="800" y1="420" x2="840" y2="600" stroke="{YOLK}" stroke-width="10"/>
    <circle cx="840" cy="620" r="30" fill="{YOLK}"/>
    <path d="M 220 640 Q 220 500 512 500 Q 804 500 804 640" stroke="{BRICK}" stroke-width="50" fill="none"/>
    <rect x="180" y="620" width="100" height="180" rx="24" fill="{BRICK}"/>
    <rect x="744" y="620" width="100" height="180" rx="24" fill="{BRICK}"/>
    '''
    save(16, wrap(body, PAPER_M))

# ========== ICON 17: cutout cassette ==========
def icon_17():
    body = f'''
    <rect x="120" y="280" width="784" height="480" rx="40" fill="{BRICK}"/>
    <rect x="180" y="360" width="664" height="240" fill="{PAPER_C}"/>
    <circle cx="340" cy="480" r="80" fill="{INK}"/>
    <circle cx="340" cy="480" r="30" fill="{PAPER_C}"/>
    <circle cx="684" cy="480" r="80" fill="{INK}"/>
    <circle cx="684" cy="480" r="30" fill="{PAPER_C}"/>
    <rect x="380" y="470" width="264" height="20" fill="{BROWN}"/>
    <text x="512" y="720" font-family="Georgia, serif" font-weight="900" font-size="100" fill="{PAPER_C}" text-anchor="middle">K0</text>
    '''
    save(17, wrap(body, PAPER_M))

# ========== ICON 18: vinyl + K center ==========
def icon_18():
    body = f'''
    <circle cx="512" cy="512" r="400" fill="{INK}"/>
    <circle cx="512" cy="512" r="380" fill="none" stroke="{PAPER_D}" stroke-width="2" opacity="0.5"/>
    <circle cx="512" cy="512" r="340" fill="none" stroke="{PAPER_D}" stroke-width="2" opacity="0.5"/>
    <circle cx="512" cy="512" r="300" fill="none" stroke="{PAPER_D}" stroke-width="2" opacity="0.5"/>
    <circle cx="512" cy="512" r="260" fill="none" stroke="{PAPER_D}" stroke-width="2" opacity="0.5"/>
    <circle cx="512" cy="512" r="180" fill="{BRICK}"/>
    <circle cx="512" cy="512" r="20" fill="{PAPER_C}"/>
    <text x="512" y="560" font-family="Georgia, serif" font-weight="900" font-size="180" fill="{PAPER_C}" text-anchor="middle">K</text>
    '''
    save(18, wrap(body, PAPER_M))

# ========== ICON 19: 3-color patchwork blocks ==========
def icon_19():
    body = f'''
    <g filter="url(#torn)">
      <rect x="100" y="100" width="440" height="440" fill="{BRICK}"/>
      <rect x="540" y="100" width="384" height="200" fill="{SAPPHIRE}"/>
      <rect x="540" y="320" width="384" height="220" fill="{YOLK}"/>
      <rect x="100" y="560" width="200" height="364" fill="{YOLK}"/>
      <rect x="320" y="560" width="240" height="364" fill="{SAPPHIRE}"/>
      <rect x="580" y="560" width="344" height="364" fill="{BRICK}"/>
    </g>
    <text x="512" y="600" font-family="Georgia, serif" font-weight="900" font-size="360" fill="{PAPER_C}" text-anchor="middle" opacity="0.9">K</text>
    '''
    save(19, wrap(body, PAPER_M))

# ========== ICON 20: cutout circles overlay ==========
def icon_20():
    body = f'''
    <g filter="url(#torn)" opacity="0.9">
      <circle cx="360" cy="400" r="280" fill="{BRICK}"/>
      <circle cx="680" cy="440" r="240" fill="{SAPPHIRE}"/>
      <circle cx="520" cy="680" r="260" fill="{YOLK}"/>
    </g>
    '''
    save(20, wrap(body, PAPER_M))

# ========== ICON 21: waveform abstract ==========
def icon_21():
    heights = [180, 320, 200, 460, 280, 560, 380, 640, 420, 700, 380, 640, 280, 560, 200, 320, 180]
    bars = ""
    x = 100
    for h in heights:
        bars += f'<rect x="{x}" y="{512 - h//2}" width="36" height="{h}" rx="18" fill="{BRICK}"/>'
        x += 52
    body = f'''
    {bars}
    '''
    save(21, wrap(body, PAPER_C))

# ========== ICON 22: cross structure ==========
def icon_22():
    body = f'''
    <rect x="440" y="120" width="144" height="784" fill="{SAPPHIRE}"/>
    <rect x="120" y="440" width="784" height="144" fill="{BRICK}"/>
    <circle cx="512" cy="512" r="90" fill="{YOLK}"/>
    <text x="512" y="558" font-family="Georgia, serif" font-weight="900" font-size="140" fill="{INK}" text-anchor="middle">K</text>
    '''
    save(22, wrap(body, PAPER_M))

# ========== ICON 23: winding line K ==========
def icon_23():
    body = f'''
    <path d="M 260 140 Q 260 380 300 512 Q 260 640 260 900" stroke="{BRICK}" stroke-width="70" fill="none" stroke-linecap="round"/>
    <path d="M 300 512 Q 500 320 720 180" stroke="{SAPPHIRE}" stroke-width="70" fill="none" stroke-linecap="round"/>
    <path d="M 300 512 Q 500 700 720 880" stroke="{YOLK}" stroke-width="70" fill="none" stroke-linecap="round"/>
    <circle cx="260" cy="140" r="24" fill="{BRICK}"/>
    <circle cx="260" cy="900" r="24" fill="{BRICK}"/>
    <circle cx="720" cy="180" r="24" fill="{SAPPHIRE}"/>
    <circle cx="720" cy="880" r="24" fill="{YOLK}"/>
    '''
    save(23, wrap(body, PAPER_C))

# ========== ICON 24: spiral ear to brain ==========
def icon_24():
    body = f'''
    <path d="M 512 512 m -60 0 a 60 60 0 1 1 120 0 a 120 120 0 1 1 -240 0 a 180 180 0 1 1 360 0 a 240 240 0 1 1 -480 0 a 300 300 0 1 1 600 0" fill="none" stroke="{BRICK}" stroke-width="30" stroke-linecap="round"/>
    <circle cx="512" cy="512" r="20" fill="{SAPPHIRE}"/>
    '''
    save(24, wrap(body, PAPER_M))

# ========== ICON 25: asterisk + K ==========
def icon_25():
    body = f'''
    <g stroke="{YOLK}" stroke-width="50" stroke-linecap="round">
      <line x1="512" y1="140" x2="512" y2="880"/>
      <line x1="140" y1="512" x2="884" y2="512"/>
      <line x1="240" y1="240" x2="784" y2="784"/>
      <line x1="784" y1="240" x2="240" y2="784"/>
    </g>
    <circle cx="512" cy="512" r="180" fill="{BRICK}"/>
    <text x="512" y="580" font-family="Georgia, serif" font-weight="900" font-size="220" fill="{PAPER_C}" text-anchor="middle">K</text>
    '''
    save(25, wrap(body, PAPER_M))

# ========== ICON 26: gear + K ==========
def icon_26():
    teeth = ""
    import math
    for i in range(12):
        angle = i * 30
        rad = math.radians(angle)
        cx = 512 + math.cos(rad) * 380
        cy = 512 + math.sin(rad) * 380
        teeth += f'<rect x="{cx-40}" y="{cy-40}" width="80" height="80" fill="{OLIVE}" transform="rotate({angle} {cx} {cy})"/>'
    body = f'''
    {teeth}
    <circle cx="512" cy="512" r="330" fill="{OLIVE}"/>
    <circle cx="512" cy="512" r="230" fill="{PAPER_M}"/>
    <text x="512" y="600" font-family="Georgia, serif" font-weight="900" font-size="280" fill="{BRICK}" text-anchor="middle">K</text>
    '''
    save(26, wrap(body, PAPER_M))

# ========== ICON 27: pure black bg white K ==========
def icon_27():
    body = f'''
    <rect x="0" y="0" width="1024" height="1024" fill="{INK}"/>
    <text x="512" y="720" font-family="Georgia, serif" font-weight="900" font-size="700" fill="{WHITE}" text-anchor="middle">K</text>
    '''
    save(27, wrap(body, INK))

# ========== ICON 28: brick bg cream K ==========
def icon_28():
    body = f'''
    <text x="512" y="740" font-family="Georgia, serif" font-weight="900" font-size="760" fill="{PAPER_C}" text-anchor="middle">K</text>
    '''
    save(28, wrap(body, BRICK))

# ========== ICON 29: paperMain bg ink K ==========
def icon_29():
    body = f'''
    <text x="512" y="740" font-family="Georgia, serif" font-weight="900" font-size="760" fill="{INK}" text-anchor="middle">K</text>
    '''
    save(29, wrap(body, PAPER_M))

# ========== ICON 30: dual-color overprint K ==========
def icon_30():
    body = f'''
    <text x="480" y="740" font-family="Georgia, serif" font-weight="900" font-size="760" fill="{BRICK}" text-anchor="middle" opacity="0.85">K</text>
    <text x="544" y="740" font-family="Georgia, serif" font-weight="900" font-size="760" fill="{SAPPHIRE}" text-anchor="middle" opacity="0.7" style="mix-blend-mode:multiply">K</text>
    '''
    save(30, wrap(body, PAPER_C))

# Run all
for i in range(1, 31):
    globals()[f"icon_{i:02d}"]()

print("Generated 30 icons.")
