"""
K0 App Icon Generator v2 — PURE GRAPHICS, NO TEXT/LETTERS/NUMBERS.
Style: Torn-paper collage (feTurbulence + feDisplacementMap filter).
30 icons across 3 series: Audio/Podcast, Learning/Thinking, Collage/Abstract.

Each icon:
- viewBox 0 0 1024 1024
- iOS rounded mask (rx=230)
- 3-layer structure per element: shadow copy + main + highlight
- 6-color palette collage
- No <text>, no letters, no numbers, no Chinese characters
"""

import os

# 6-color palette (Frank's confirmed)
C = {
    "brick": "#C80306",
    "sapphire": "#284EA9",
    "yolk": "#F8D34A",
    "brown": "#652300",
    "rose": "#C14F94",
    "olive": "#6B6A4E",
    "paperMain": "#E8D9B8",
    "paperCream": "#F5EBD3",
    "paperDark": "#DDCEA9",
    "ink": "#2A1A0A",
}


def svg_head(bg=C["paperCream"]):
    """SVG header with tearing filters + iOS mask + background + paper speckles + confetti."""
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <filter id="ts" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="6"/>
    </filter>
    <filter id="tm" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="12" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="4"/>
    </filter>
    <filter id="tf" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.4" numOctaves="2" seed="3" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="3"/>
    </filter>
    <filter id="tx" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="3" seed="21" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="8"/>
    </filter>
    <clipPath id="ios">
      <rect x="0" y="0" width="1024" height="1024" rx="230" ry="230"/>
    </clipPath>
    <pattern id="dots" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
      <circle cx="30" cy="30" r="1.5" fill="{C['brown']}" opacity="0.15"/>
    </pattern>
  </defs>
  <g clip-path="url(#ios)">
    <rect x="0" y="0" width="1024" height="1024" fill="{bg}"/>
    <rect x="0" y="0" width="1024" height="1024" fill="url(#dots)"/>
    <!-- Paper texture speckles -->
    <g opacity="0.1">
      <circle cx="180" cy="220" r="4" fill="{C['brown']}"/>
      <circle cx="820" cy="140" r="3" fill="{C['brown']}"/>
      <circle cx="740" cy="880" r="5" fill="{C['brown']}"/>
      <circle cx="200" cy="820" r="3" fill="{C['brown']}"/>
      <circle cx="500" cy="500" r="2" fill="{C['brown']}"/>
      <circle cx="360" cy="620" r="4" fill="{C['brown']}"/>
      <circle cx="640" cy="380" r="3" fill="{C['brown']}"/>
      <circle cx="120" cy="460" r="3" fill="{C['brown']}"/>
      <circle cx="900" cy="500" r="4" fill="{C['brown']}"/>
      <circle cx="440" cy="180" r="3" fill="{C['brown']}"/>
      <circle cx="580" cy="920" r="4" fill="{C['brown']}"/>
    </g>
    <!-- Corner confetti shreds - torn paper corners -->
    <g filter="url(#tx)" opacity="0.5">
      <polygon points="60,60 140,80 100,140 40,120" fill="{C['brick']}"/>
      <polygon points="880,60 960,90 920,160 850,130" fill="{C['sapphire']}"/>
      <polygon points="60,880 140,860 130,940 50,960" fill="{C['yolk']}"/>
      <polygon points="880,880 960,900 940,970 860,950" fill="{C['rose']}"/>
    </g>
    <g filter="url(#tf)" opacity="0.35">
      <circle cx="90" cy="500" r="18" fill="{C['olive']}"/>
      <circle cx="940" cy="620" r="14" fill="{C['brick']}"/>
      <circle cx="150" cy="700" r="12" fill="{C['sapphire']}"/>
      <circle cx="880" cy="360" r="16" fill="{C['yolk']}"/>
    </g>
    <!-- Scattered mini paper triangles for wabi collage feel -->
    <g filter="url(#tx)" opacity="0.28">
      <polygon points="240,140 280,150 260,190" fill="{C['rose']}"/>
      <polygon points="780,780 820,790 800,830" fill="{C['brown']}"/>
      <polygon points="180,380 220,390 200,430" fill="{C['yolk']}"/>
      <polygon points="820,480 860,490 840,530" fill="{C['olive']}"/>
      <polygon points="440,80 480,90 460,130" fill="{C['brick']}"/>
      <polygon points="560,940 600,950 580,990" fill="{C['sapphire']}"/>
    </g>
    <!-- Faint torn horizontal band mid-height for collage layer -->
    <g filter="url(#tx)" opacity="0.12">
      <rect x="0" y="920" width="1024" height="30" fill="{C['brown']}"/>
      <rect x="0" y="80" width="1024" height="22" fill="{C['brown']}"/>
    </g>
'''


def svg_tail():
    return '''  </g>
</svg>
'''


def layered_shape(shape_svg, main_color, shadow_offset=(8, 10), highlight_color=None):
    """Return 3-layer torn-paper structure for a given shape template.
    shape_svg: a callable(fill, tx, ty) returning inner SVG shape markup.
    """
    dx, dy = shadow_offset
    out = []
    # Layer 1 — deep shadow
    out.append(f'    <g filter="url(#ts)" opacity="0.35" transform="translate({dx} {dy})">')
    out.append(f'      {shape_svg(C["ink"], 0, 0)}')
    out.append('    </g>')
    # Layer 2 — mid shadow
    out.append(f'    <g filter="url(#tm)" opacity="0.5" transform="translate({dx//2} {dy//2})">')
    out.append(f'      {shape_svg(C["brown"], 0, 0)}')
    out.append('    </g>')
    # Layer 3 — main
    out.append(f'    <g filter="url(#ts)">')
    out.append(f'      {shape_svg(main_color, 0, 0)}')
    out.append('    </g>')
    # Layer 4 — highlight
    if highlight_color:
        out.append(f'    <g filter="url(#tf)" opacity="0.55">')
        out.append(f'      {shape_svg(highlight_color, -6, -8)}')
        out.append('    </g>')
    return "\n".join(out)


# ============================================================
# 30 ICON DEFINITIONS
# ============================================================


def icon_01_headphones():
    """Headphones — twin cups + band."""
    body = svg_head(C["paperCream"])
    # headband (sapphire arc)
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(8 12)">
      <path d="M 240 520 Q 240 240 512 220 Q 784 220 784 520 L 784 540 L 720 540 Q 720 300 512 288 Q 304 300 304 540 L 240 540 Z" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <path d="M 240 520 Q 240 240 512 220 Q 784 240 784 520 L 784 540 L 720 540 Q 720 300 512 288 Q 304 300 304 540 L 240 540 Z" fill="{sapphire}"/>
    </g>
    '''.format(**C)
    # left cup (brick)
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(6 8)">
      <ellipse cx="260" cy="620" rx="120" ry="150" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <ellipse cx="260" cy="620" rx="120" ry="150" fill="{brick}"/>
      <ellipse cx="260" cy="620" rx="70" ry="90" fill="{yolk}"/>
      <circle cx="260" cy="620" r="30" fill="{sapphire}"/>
    </g>
    '''.format(**C)
    # right cup (rose)
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(6 8)">
      <ellipse cx="764" cy="620" rx="120" ry="150" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <ellipse cx="764" cy="620" rx="120" ry="150" fill="{rose}"/>
      <ellipse cx="764" cy="620" rx="70" ry="90" fill="{olive}"/>
      <circle cx="764" cy="620" r="30" fill="{yolk}"/>
    </g>
    '''.format(**C)
    body += svg_tail()
    return body


def icon_02_microphone():
    """Vintage mic — capsule + grille + stand."""
    body = svg_head(C["paperMain"])
    # stand
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(8 10)">
      <rect x="480" y="700" width="64" height="180" fill="{ink}"/>
      <rect x="380" y="860" width="264" height="40" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <rect x="480" y="700" width="64" height="180" fill="{brown}"/>
      <rect x="380" y="860" width="264" height="40" fill="{brown}"/>
    </g>
    '''.format(**C)
    # mic body
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(10 12)">
      <rect x="360" y="200" width="304" height="500" rx="152" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <rect x="360" y="200" width="304" height="500" rx="152" fill="{brick}"/>
    </g>
    <g filter="url(#tm)">
      <rect x="400" y="260" width="224" height="360" rx="112" fill="{yolk}"/>
    </g>
    '''.format(**C)
    # grille lines
    for i in range(6):
        y = 300 + i * 55
        body += f'    <rect x="400" y="{y}" width="224" height="8" fill="{C["brown"]}" opacity="0.55" filter="url(#tf)"/>\n'
    body += svg_tail()
    return body


def icon_03_vinyl():
    """Vinyl record — black disc + red label."""
    body = svg_head(C["paperCream"])
    body += '''    <g filter="url(#ts)" opacity="0.4" transform="translate(12 14)">
      <circle cx="512" cy="512" r="360" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <circle cx="512" cy="512" r="360" fill="{ink}"/>
      <circle cx="512" cy="512" r="340" fill="{brown}" opacity="0.35"/>
    </g>
    '''.format(**C)
    # concentric grooves
    for r in [320, 300, 280, 260, 240, 220, 200, 180]:
        body += f'    <circle cx="512" cy="512" r="{r}" fill="none" stroke="{C["brown"]}" stroke-width="2" opacity="0.4" filter="url(#tf)"/>\n'
    # label
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(6 8)">
      <circle cx="512" cy="512" r="150" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <circle cx="512" cy="512" r="150" fill="{brick}"/>
      <circle cx="512" cy="512" r="30" fill="{yolk}"/>
      <circle cx="512" cy="512" r="10" fill="{ink}"/>
    </g>
    <g filter="url(#tf)" opacity="0.6">
      <path d="M 420 470 Q 512 440 604 470" stroke="{paperCream}" stroke-width="6" fill="none"/>
      <path d="M 430 550 Q 512 580 594 550" stroke="{paperCream}" stroke-width="6" fill="none"/>
    </g>
    '''.format(**C)
    body += svg_tail()
    return body


def icon_04_cassette():
    """Cassette tape."""
    body = svg_head(C["paperMain"])
    # tape body
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(10 12)">
      <rect x="140" y="280" width="744" height="464" rx="40" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <rect x="140" y="280" width="744" height="464" rx="40" fill="{sapphire}"/>
    </g>
    <g filter="url(#tm)">
      <rect x="180" y="360" width="664" height="180" rx="16" fill="{paperCream}"/>
    </g>
    '''.format(**C)
    # reels
    for cx in [340, 684]:
        body += f'''    <g filter="url(#ts)">
      <circle cx="{cx}" cy="450" r="70" fill="{C['brown']}"/>
      <circle cx="{cx}" cy="450" r="40" fill="{C['ink']}"/>
    </g>
'''
        # spokes
        body += f'    <g filter="url(#tf)">\n'
        for angle_deg in [0, 60, 120]:
            import math
            a = math.radians(angle_deg)
            x1 = cx + math.cos(a) * 20
            y1 = 450 + math.sin(a) * 20
            x2 = cx + math.cos(a) * 55
            y2 = 450 + math.sin(a) * 55
            body += f'      <line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{C["yolk"]}" stroke-width="8"/>\n'
        body += '    </g>\n'
    # label strip
    body += f'''    <g filter="url(#tm)">
      <rect x="220" y="580" width="584" height="120" fill="{C['yolk']}"/>
      <rect x="240" y="610" width="180" height="12" fill="{C['brick']}"/>
      <rect x="240" y="640" width="240" height="12" fill="{C['brown']}"/>
      <rect x="240" y="670" width="140" height="12" fill="{C['sapphire']}"/>
    </g>
'''
    body += svg_tail()
    return body


def icon_05_play():
    """Play triangle — layered."""
    body = svg_head(C["paperCream"])
    # bg circle
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(10 12)">
      <circle cx="512" cy="512" r="380" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <circle cx="512" cy="512" r="380" fill="{brick}"/>
      <circle cx="512" cy="512" r="330" fill="{yolk}"/>
    </g>
    '''.format(**C)
    # triangle 3 layers
    body += '''    <g filter="url(#ts)" opacity="0.4" transform="translate(10 14)">
      <polygon points="410,320 720,512 410,704" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <polygon points="410,320 720,512 410,704" fill="{sapphire}"/>
    </g>
    <g filter="url(#tf)" opacity="0.55">
      <polygon points="430,360 660,510 430,650" fill="{rose}"/>
    </g>
    '''.format(**C)
    body += svg_tail()
    return body


def icon_06_soundwave():
    """Sound wave — vertical bars."""
    body = svg_head(C["paperMain"])
    # bars of varying heights
    heights = [180, 320, 460, 620, 460, 320, 180, 380, 540, 380, 220]
    colors_list = [C["brick"], C["sapphire"], C["yolk"], C["rose"], C["olive"],
                   C["brown"], C["brick"], C["sapphire"], C["yolk"], C["rose"], C["olive"]]
    bar_w = 60
    gap = 20
    total_w = len(heights) * (bar_w + gap) - gap
    x_start = (1024 - total_w) // 2
    for i, (h, col) in enumerate(zip(heights, colors_list)):
        x = x_start + i * (bar_w + gap)
        y = (1024 - h) // 2
        body += f'''    <g filter="url(#ts)" opacity="0.35" transform="translate(6 8)">
      <rect x="{x}" y="{y}" width="{bar_w}" height="{h}" rx="20" fill="{C['ink']}"/>
    </g>
    <g filter="url(#ts)">
      <rect x="{x}" y="{y}" width="{bar_w}" height="{h}" rx="20" fill="{col}"/>
    </g>
'''
    body += svg_tail()
    return body


def icon_07_speaker():
    """Vintage horn speaker."""
    body = svg_head(C["paperCream"])
    # horn cone
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(10 12)">
      <polygon points="200,300 200,724 700,860 700,164" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <polygon points="200,300 200,724 700,860 700,164" fill="{brick}"/>
    </g>
    <g filter="url(#tm)">
      <polygon points="260,360 260,664 660,780 660,244" fill="{yolk}"/>
    </g>
    <g filter="url(#ts)">
      <rect x="140" y="380" width="80" height="264" fill="{brown}"/>
      <rect x="700" y="440" width="140" height="140" fill="{sapphire}"/>
    </g>
    '''.format(**C)
    # sound rings on right
    for r in [40, 80, 120]:
        body += f'    <path d="M 860 512 a {r} {r} 0 0 1 0 -1 z" fill="none" stroke="{C["olive"]}" stroke-width="14" opacity="0.7" filter="url(#tf)" transform="translate(0 0)"/>\n'
    body += f'    <g filter="url(#tf)" stroke="{C["olive"]}" stroke-width="14" fill="none">\n'
    body += '      <path d="M 870 460 Q 920 512 870 564"/>\n'
    body += '      <path d="M 900 420 Q 970 512 900 604"/>\n'
    body += '    </g>\n'
    body += svg_tail()
    return body


def icon_08_walkman():
    """Walkman-style player."""
    body = svg_head(C["paperMain"])
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(10 12)">
      <rect x="200" y="180" width="624" height="700" rx="30" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <rect x="200" y="180" width="624" height="700" rx="30" fill="{yolk}"/>
      <rect x="240" y="240" width="544" height="280" rx="12" fill="{brown}"/>
    </g>
    <g filter="url(#tm)">
      <rect x="270" y="270" width="484" height="220" fill="{paperCream}"/>
    </g>
    '''.format(**C)
    # window reels
    body += f'''    <g filter="url(#ts)">
      <circle cx="380" cy="380" r="60" fill="{C['brick']}"/>
      <circle cx="380" cy="380" r="30" fill="{C['ink']}"/>
      <circle cx="644" cy="380" r="60" fill="{C['sapphire']}"/>
      <circle cx="644" cy="380" r="30" fill="{C['ink']}"/>
    </g>
'''
    # buttons
    button_colors = [C["brick"], C["sapphire"], C["olive"], C["rose"], C["brown"]]
    for i, col in enumerate(button_colors):
        x = 240 + i * 110
        body += f'''    <g filter="url(#ts)">
      <rect x="{x}" y="580" width="80" height="80" rx="10" fill="{col}"/>
    </g>
'''
    # headphone jack cable
    body += f'    <path d="M 512 880 Q 512 940 620 940" stroke="{C["ink"]}" stroke-width="14" fill="none" filter="url(#tf)"/>\n'
    body += svg_tail()
    return body


def icon_09_ear():
    """Ear — listening."""
    body = svg_head(C["paperCream"])
    # skin backing
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(10 12)">
      <path d="M 340 240 Q 720 200 740 500 Q 720 780 480 800 Q 380 800 360 720 Q 380 640 440 620 Q 500 600 480 540 Q 460 480 400 470 Q 320 460 320 380 Q 320 280 340 240 Z" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <path d="M 340 240 Q 720 200 740 500 Q 720 780 480 800 Q 380 800 360 720 Q 380 640 440 620 Q 500 600 480 540 Q 460 480 400 470 Q 320 460 320 380 Q 320 280 340 240 Z" fill="{rose}"/>
    </g>
    <g filter="url(#tm)" opacity="0.7">
      <path d="M 400 320 Q 640 300 640 480 Q 620 660 500 700 Q 460 700 460 660 Q 480 600 520 580 Q 560 560 540 500 Q 520 460 470 450 Q 400 440 400 380 Z" fill="{brick}"/>
    </g>
    <g filter="url(#tf)" opacity="0.55">
      <ellipse cx="500" cy="520" rx="60" ry="90" fill="{yolk}"/>
    </g>
    '''.format(**C)
    # sound waves entering from right
    body += f'    <g filter="url(#tf)" stroke="{C["sapphire"]}" stroke-width="18" fill="none">\n'
    body += '      <path d="M 820 440 Q 880 520 820 600"/>\n'
    body += '      <path d="M 870 380 Q 940 520 870 660"/>\n'
    body += '    </g>\n'
    body += svg_tail()
    return body


def icon_10_mic_headphone_combo():
    """Mic + headphone combo — broadcaster kit."""
    body = svg_head(C["paperMain"])
    # headphone band
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(8 10)">
      <path d="M 260 440 Q 260 200 512 180 Q 764 200 764 440 L 764 480 L 700 480 Q 700 260 512 248 Q 324 260 324 480 L 260 480 Z" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <path d="M 260 440 Q 260 200 512 180 Q 764 200 764 440 L 764 480 L 700 480 Q 700 260 512 248 Q 324 260 324 480 L 260 480 Z" fill="{sapphire}"/>
    </g>
    <g filter="url(#ts)">
      <ellipse cx="270" cy="540" rx="80" ry="100" fill="{brick}"/>
      <ellipse cx="754" cy="540" rx="80" ry="100" fill="{brick}"/>
      <ellipse cx="270" cy="540" rx="46" ry="60" fill="{yolk}"/>
      <ellipse cx="754" cy="540" rx="46" ry="60" fill="{yolk}"/>
    </g>
    '''.format(**C)
    # mic capsule
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(8 10)">
      <rect x="440" y="500" width="144" height="280" rx="72" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <rect x="440" y="500" width="144" height="280" rx="72" fill="{brown}"/>
    </g>
    <g filter="url(#tm)">
      <rect x="460" y="540" width="104" height="200" rx="52" fill="{rose}"/>
    </g>
    '''.format(**C)
    # grille lines
    for i in range(5):
        y = 570 + i * 32
        body += f'    <rect x="460" y="{y}" width="104" height="6" fill="{C["brown"]}" opacity="0.6" filter="url(#tf)"/>\n'
    # mic stand
    body += f'    <g filter="url(#ts)"><rect x="490" y="780" width="44" height="80" fill="{C["brown"]}"/><rect x="420" y="860" width="184" height="24" fill="{C["brown"]}"/></g>\n'
    body += svg_tail()
    return body


# ============================================================
# LEARNING/THINKING (11-20)
# ============================================================


def icon_11_book():
    """Open book."""
    body = svg_head(C["paperCream"])
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(10 14)">
      <path d="M 100 260 L 100 800 L 512 780 L 924 800 L 924 260 L 512 240 Z" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <path d="M 100 260 L 100 800 L 512 780 L 924 800 L 924 260 L 512 240 Z" fill="{brown}"/>
    </g>
    <g filter="url(#tm)">
      <path d="M 140 300 L 140 760 L 496 740 L 496 280 Z" fill="{paperCream}"/>
      <path d="M 884 300 L 884 760 L 528 740 L 528 280 Z" fill="{paperCream}"/>
    </g>
    '''.format(**C)
    # text lines (as RECTANGLES not text)
    for i, w in enumerate([260, 300, 240, 280, 260, 300, 220]):
        y = 340 + i * 50
        body += f'    <rect x="180" y="{y}" width="{w}" height="12" fill="{C["ink"]}" opacity="0.55" filter="url(#tf)"/>\n'
        body += f'    <rect x="568" y="{y}" width="{w}" height="12" fill="{C["ink"]}" opacity="0.55" filter="url(#tf)"/>\n'
    # spine
    body += f'    <rect x="506" y="240" width="16" height="540" fill="{C["ink"]}" filter="url(#ts)"/>\n'
    body += svg_tail()
    return body


def icon_12_brain():
    """Brain — hemispheres."""
    body = svg_head(C["paperMain"])
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(10 12)">
      <path d="M 200 460 Q 200 220 380 200 Q 460 180 512 240 Q 564 180 644 200 Q 824 220 824 460 Q 824 640 700 760 Q 600 840 512 820 Q 424 840 324 760 Q 200 640 200 460 Z" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <path d="M 200 460 Q 200 220 380 200 Q 460 180 512 240 Q 564 180 644 200 Q 824 220 824 460 Q 824 640 700 760 Q 600 840 512 820 Q 424 840 324 760 Q 200 640 200 460 Z" fill="{rose}"/>
    </g>
    <g filter="url(#tm)" opacity="0.6">
      <path d="M 250 460 Q 250 260 400 240 Q 480 220 508 280 L 508 800 Q 460 810 380 760 Q 260 660 250 460 Z" fill="{brick}"/>
    </g>
    '''.format(**C)
    # brain folds (curves)
    body += f'    <g filter="url(#tf)" fill="none" stroke="{C["brown"]}" stroke-width="10" opacity="0.7">\n'
    body += '      <path d="M 300 380 Q 380 340 460 380"/>\n'
    body += '      <path d="M 300 480 Q 380 440 460 480"/>\n'
    body += '      <path d="M 300 580 Q 380 540 460 580"/>\n'
    body += '      <path d="M 564 380 Q 644 340 724 380"/>\n'
    body += '      <path d="M 564 480 Q 644 440 724 480"/>\n'
    body += '      <path d="M 564 580 Q 644 540 724 580"/>\n'
    body += '      <line x1="512" y1="240" x2="512" y2="820" stroke-width="8"/>\n'
    body += '    </g>\n'
    body += svg_tail()
    return body


def icon_13_bulb():
    """Lightbulb — idea."""
    body = svg_head(C["paperCream"])
    # rays
    body += f'    <g filter="url(#tf)" stroke="{C["yolk"]}" stroke-width="20" fill="none" opacity="0.75">\n'
    for angle in range(0, 360, 45):
        import math
        a = math.radians(angle)
        cx, cy = 512, 400
        x1 = cx + math.cos(a) * 260
        y1 = cy + math.sin(a) * 260
        x2 = cx + math.cos(a) * 340
        y2 = cy + math.sin(a) * 340
        body += f'      <line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}"/>\n'
    body += '    </g>\n'
    # bulb glass
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(8 12)">
      <path d="M 380 200 Q 380 140 512 140 Q 644 140 644 200 Q 660 340 620 460 Q 580 560 580 640 L 444 640 Q 444 560 404 460 Q 364 340 380 200 Z" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <path d="M 380 200 Q 380 140 512 140 Q 644 140 644 200 Q 660 340 620 460 Q 580 560 580 640 L 444 640 Q 444 560 404 460 Q 364 340 380 200 Z" fill="{yolk}"/>
    </g>
    <g filter="url(#tm)" opacity="0.6">
      <ellipse cx="470" cy="280" rx="40" ry="80" fill="{paperCream}"/>
    </g>
    '''.format(**C)
    # screw base
    body += f'''    <g filter="url(#ts)">
      <rect x="440" y="640" width="144" height="80" fill="{C['brown']}"/>
      <rect x="440" y="660" width="144" height="8" fill="{C['ink']}"/>
      <rect x="440" y="680" width="144" height="8" fill="{C['ink']}"/>
      <rect x="440" y="700" width="144" height="8" fill="{C['ink']}"/>
      <rect x="460" y="720" width="104" height="60" fill="{C['ink']}"/>
    </g>
'''
    # filament
    body += f'    <path d="M 460 400 Q 480 320 512 360 Q 544 400 564 320" stroke="{C["brick"]}" stroke-width="10" fill="none" filter="url(#tf)"/>\n'
    body += svg_tail()
    return body


def icon_14_pencil():
    """Pencil — diagonal."""
    body = svg_head(C["paperMain"])
    # rotated 45deg pencil - body along diagonal
    # wood tip (top-left)
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(10 12) rotate(-45 512 512)">
      <rect x="200" y="480" width="624" height="80" fill="{ink}"/>
    </g>
    <g filter="url(#ts)" transform="rotate(-45 512 512)">
      <rect x="240" y="480" width="500" height="80" fill="{yolk}"/>
      <rect x="240" y="480" width="500" height="20" fill="{brown}" opacity="0.4"/>
    </g>
    <g filter="url(#ts)" transform="rotate(-45 512 512)">
      <polygon points="160,520 240,480 240,560" fill="{paperCream}"/>
      <polygon points="160,520 200,500 200,540" fill="{ink}"/>
      <rect x="740" y="480" width="80" height="80" fill="{brick}"/>
      <rect x="820" y="490" width="16" height="60" fill="{olive}"/>
    </g>
    '''.format(**C)
    # sparkle
    body += f'    <g filter="url(#tf)"><circle cx="200" cy="820" r="18" fill="{C["yolk"]}"/><circle cx="820" cy="200" r="14" fill="{C["brick"]}"/></g>\n'
    body += svg_tail()
    return body


def icon_15_glasses():
    """Round glasses — reading."""
    body = svg_head(C["paperCream"])
    # bridge
    body += f'    <g filter="url(#ts)"><rect x="470" y="500" width="84" height="20" fill="{C["brown"]}"/></g>\n'
    # left lens
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(10 12)">
      <circle cx="320" cy="512" r="180" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <circle cx="320" cy="512" r="180" fill="{brown}"/>
      <circle cx="320" cy="512" r="150" fill="{paperCream}"/>
    </g>
    <g filter="url(#tf)" opacity="0.6">
      <circle cx="280" cy="470" r="40" fill="{sapphire}"/>
    </g>
    '''.format(**C)
    # right lens
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(10 12)">
      <circle cx="704" cy="512" r="180" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <circle cx="704" cy="512" r="180" fill="{brown}"/>
      <circle cx="704" cy="512" r="150" fill="{paperCream}"/>
    </g>
    <g filter="url(#tf)" opacity="0.6">
      <circle cx="664" cy="470" r="40" fill="{rose}"/>
    </g>
    '''.format(**C)
    # temples
    body += f'    <g filter="url(#ts)"><path d="M 140 500 Q 100 480 120 420" stroke="{C["brown"]}" stroke-width="20" fill="none"/><path d="M 884 500 Q 924 480 904 420" stroke="{C["brown"]}" stroke-width="20" fill="none"/></g>\n'
    body += svg_tail()
    return body


def icon_16_coffee():
    """Coffee cup with steam."""
    body = svg_head(C["paperMain"])
    # steam
    body += f'    <g filter="url(#tf)" stroke="{C["brown"]}" stroke-width="18" fill="none" opacity="0.55">\n'
    body += '      <path d="M 400 200 Q 440 260 400 320 Q 360 380 400 440"/>\n'
    body += '      <path d="M 512 160 Q 552 220 512 280 Q 472 340 512 400"/>\n'
    body += '      <path d="M 624 200 Q 664 260 624 320 Q 584 380 624 440"/>\n'
    body += '    </g>\n'
    # cup
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(10 12)">
      <path d="M 240 480 L 240 780 Q 240 860 340 860 L 660 860 Q 760 860 760 780 L 760 480 Z" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <path d="M 240 480 L 240 780 Q 240 860 340 860 L 660 860 Q 760 860 760 780 L 760 480 Z" fill="{brick}"/>
    </g>
    <g filter="url(#tm)">
      <ellipse cx="500" cy="500" rx="240" ry="40" fill="{brown}"/>
    </g>
    '''.format(**C)
    # handle
    body += f'''    <g filter="url(#ts)">
      <path d="M 760 540 Q 880 540 880 660 Q 880 780 760 780 L 760 740 Q 840 740 840 660 Q 840 580 760 580 Z" fill="{C['brick']}"/>
    </g>
'''
    # saucer
    body += f'''    <g filter="url(#ts)" opacity="0.35" transform="translate(6 10)">
      <ellipse cx="500" cy="880" rx="340" ry="30" fill="{C['ink']}"/>
    </g>
    <g filter="url(#ts)">
      <ellipse cx="500" cy="880" rx="340" ry="30" fill="{C['sapphire']}"/>
    </g>
'''
    # coffee ring/foam
    body += f'    <g filter="url(#tf)" opacity="0.6"><ellipse cx="500" cy="500" rx="180" ry="24" fill="{C["yolk"]}"/></g>\n'
    body += svg_tail()
    return body


def icon_17_hourglass():
    """Hourglass — SRS."""
    body = svg_head(C["paperCream"])
    # frame top/bottom
    body += f'''    <g filter="url(#ts)" opacity="0.35" transform="translate(8 12)">
      <rect x="240" y="160" width="544" height="60" fill="{C['ink']}"/>
      <rect x="240" y="804" width="544" height="60" fill="{C['ink']}"/>
    </g>
    <g filter="url(#ts)">
      <rect x="240" y="160" width="544" height="60" fill="{C['brown']}"/>
      <rect x="240" y="804" width="544" height="60" fill="{C['brown']}"/>
    </g>
'''
    # glass silhouette
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(10 12)">
      <path d="M 280 220 L 744 220 L 620 480 Q 560 512 560 512 Q 620 544 744 804 L 280 804 Q 404 544 464 512 Q 404 480 280 220 Z" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <path d="M 280 220 L 744 220 L 620 480 Q 560 512 560 512 Q 620 544 744 804 L 280 804 Q 404 544 464 512 Q 404 480 280 220 Z" fill="{rose}"/>
    </g>
    '''.format(**C)
    # sand top (yolk)
    body += f'    <g filter="url(#tm)"><path d="M 320 240 L 704 240 L 600 460 L 424 460 Z" fill="{C["yolk"]}"/></g>\n'
    # sand bottom (brick)
    body += f'    <g filter="url(#tm)"><path d="M 340 780 L 684 780 L 620 620 L 404 620 Z" fill="{C["brick"]}"/></g>\n'
    # sand stream
    body += f'    <g filter="url(#tf)"><rect x="500" y="512" width="24" height="180" fill="{C["yolk"]}"/></g>\n'
    body += svg_tail()
    return body


def icon_18_sprout():
    """Growing sprout."""
    body = svg_head(C["paperMain"])
    # pot
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(8 12)">
      <path d="M 300 620 L 724 620 L 680 880 L 344 880 Z" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <path d="M 300 620 L 724 620 L 680 880 L 344 880 Z" fill="{brick}"/>
      <rect x="280" y="600" width="464" height="50" fill="{brown}"/>
    </g>
    '''.format(**C)
    # stem
    body += f'    <g filter="url(#ts)"><rect x="500" y="360" width="24" height="260" fill="{C["olive"]}"/></g>\n'
    # left leaf
    body += f'''    <g filter="url(#ts)" opacity="0.35" transform="translate(6 8)">
      <path d="M 500 460 Q 340 400 300 500 Q 340 560 500 500 Z" fill="{C['ink']}"/>
    </g>
    <g filter="url(#ts)">
      <path d="M 500 460 Q 340 400 300 500 Q 340 560 500 500 Z" fill="{C['olive']}"/>
    </g>
'''
    # right leaf
    body += f'''    <g filter="url(#ts)" opacity="0.35" transform="translate(6 8)">
      <path d="M 524 420 Q 684 360 724 460 Q 684 520 524 460 Z" fill="{C['ink']}"/>
    </g>
    <g filter="url(#ts)">
      <path d="M 524 420 Q 684 360 724 460 Q 684 520 524 460 Z" fill="{C['olive']}"/>
    </g>
'''
    # top sprout leaves
    body += f'''    <g filter="url(#ts)">
      <ellipse cx="470" cy="320" rx="60" ry="100" fill="{C['rose']}"/>
      <ellipse cx="554" cy="320" rx="60" ry="100" fill="{C['yolk']}"/>
    </g>
'''
    body += svg_tail()
    return body


def icon_19_key():
    """Key — unlock knowledge."""
    body = svg_head(C["paperCream"])
    # bow (round head)
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(10 12)">
      <circle cx="320" cy="512" r="200" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <circle cx="320" cy="512" r="200" fill="{yolk}"/>
      <circle cx="320" cy="512" r="100" fill="{paperMain}"/>
    </g>
    '''.format(**C)
    # shaft
    body += f'''    <g filter="url(#ts)" opacity="0.35" transform="translate(8 10)">
      <rect x="520" y="480" width="360" height="64" fill="{C['ink']}"/>
    </g>
    <g filter="url(#ts)">
      <rect x="520" y="480" width="360" height="64" fill="{C['brown']}"/>
    </g>
'''
    # teeth
    body += f'''    <g filter="url(#ts)">
      <rect x="720" y="544" width="40" height="60" fill="{C['brown']}"/>
      <rect x="800" y="544" width="40" height="90" fill="{C['brown']}"/>
      <rect x="860" y="544" width="20" height="50" fill="{C['brown']}"/>
    </g>
'''
    # decoration on bow
    body += f'    <g filter="url(#tf)"><circle cx="220" cy="440" r="20" fill="{C["brick"]}"/><circle cx="420" cy="440" r="20" fill="{C["sapphire"]}"/><circle cx="320" cy="380" r="16" fill="{C["rose"]}"/></g>\n'
    body += svg_tail()
    return body


def icon_20_magnifier():
    """Magnifying glass — explore."""
    body = svg_head(C["paperMain"])
    # handle
    body += f'''    <g filter="url(#ts)" opacity="0.35" transform="translate(10 12) rotate(45 640 640)">
      <rect x="620" y="640" width="60" height="300" rx="20" fill="{C['ink']}"/>
    </g>
    <g filter="url(#ts)" transform="rotate(45 640 640)">
      <rect x="620" y="640" width="60" height="300" rx="20" fill="{C['brown']}"/>
    </g>
'''
    # lens
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(10 12)">
      <circle cx="440" cy="440" r="260" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <circle cx="440" cy="440" r="260" fill="{brick}"/>
      <circle cx="440" cy="440" r="220" fill="{paperCream}"/>
    </g>
    <g filter="url(#tf)" opacity="0.5">
      <ellipse cx="360" cy="360" rx="80" ry="50" fill="{sapphire}"/>
    </g>
    '''.format(**C)
    # things inside lens (dots/pattern to suggest exploration)
    body += f'    <g filter="url(#tf)"><circle cx="500" cy="500" r="24" fill="{C["yolk"]}"/><circle cx="380" cy="480" r="18" fill="{C["olive"]}"/><circle cx="460" cy="380" r="14" fill="{C["rose"]}"/></g>\n'
    body += svg_tail()
    return body


# ============================================================
# COLLAGE/ABSTRACT (21-30)
# ============================================================


def icon_21_tricolor_squares():
    """3 overlapping color squares."""
    body = svg_head(C["paperMain"])
    # brick square rotated left
    body += f'''    <g filter="url(#ts)" opacity="0.35" transform="translate(10 12) rotate(-8 320 400)">
      <rect x="140" y="220" width="360" height="360" fill="{C['ink']}"/>
    </g>
    <g filter="url(#ts)" transform="rotate(-8 320 400)">
      <rect x="140" y="220" width="360" height="360" fill="{C['brick']}"/>
    </g>
'''
    # yolk square center
    body += f'''    <g filter="url(#ts)" opacity="0.35" transform="translate(10 12) rotate(4 512 512)">
      <rect x="340" y="340" width="360" height="360" fill="{C['ink']}"/>
    </g>
    <g filter="url(#ts)" transform="rotate(4 512 512)">
      <rect x="340" y="340" width="360" height="360" fill="{C['yolk']}"/>
    </g>
'''
    # sapphire square right
    body += f'''    <g filter="url(#ts)" opacity="0.35" transform="translate(10 12) rotate(10 700 620)">
      <rect x="520" y="440" width="360" height="360" fill="{C['ink']}"/>
    </g>
    <g filter="url(#ts)" transform="rotate(10 700 620)">
      <rect x="520" y="440" width="360" height="360" fill="{C['sapphire']}"/>
    </g>
'''
    # highlight overlay
    body += f'    <g filter="url(#tf)" opacity="0.5"><rect x="380" y="460" width="120" height="120" fill="{C["rose"]}" transform="rotate(-3 440 520)"/></g>\n'
    body += svg_tail()
    return body


def icon_22_sun():
    """Sun with rays."""
    body = svg_head(C["paperCream"])
    # rays
    import math
    body += f'    <g filter="url(#ts)">\n'
    for angle in range(0, 360, 30):
        a = math.radians(angle)
        cx, cy = 512, 512
        x1 = cx + math.cos(a) * 280
        y1 = cy + math.sin(a) * 280
        x2 = cx + math.cos(a) * 440
        y2 = cy + math.sin(a) * 440
        col = C["brick"] if angle % 60 == 0 else C["yolk"]
        body += f'      <line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{col}" stroke-width="30" stroke-linecap="round"/>\n'
    body += '    </g>\n'
    # sun disc
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(10 12)">
      <circle cx="512" cy="512" r="220" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <circle cx="512" cy="512" r="220" fill="{yolk}"/>
    </g>
    <g filter="url(#tm)" opacity="0.65">
      <circle cx="512" cy="512" r="160" fill="{brick}"/>
    </g>
    <g filter="url(#tf)" opacity="0.55">
      <ellipse cx="460" cy="460" rx="60" ry="40" fill="{paperCream}"/>
    </g>
    '''.format(**C)
    body += svg_tail()
    return body


def icon_23_moon():
    """Crescent moon — bedtime learning."""
    body = svg_head(C["sapphire"])
    # stars
    body += f'    <g filter="url(#tf)">\n'
    stars = [(200, 200), (820, 260), (180, 780), (760, 800), (300, 460), (740, 480)]
    for cx, cy in stars:
        body += f'      <circle cx="{cx}" cy="{cy}" r="14" fill="{C["yolk"]}"/>\n'
    body += '    </g>\n'
    # crescent — big circle + offset circle to cut
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(10 14)">
      <path d="M 640 260 Q 340 280 340 560 Q 340 820 640 800 Q 460 780 460 560 Q 460 340 640 260 Z" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <path d="M 640 260 Q 340 280 340 560 Q 340 820 640 800 Q 460 780 460 560 Q 460 340 640 260 Z" fill="{paperCream}"/>
    </g>
    <g filter="url(#tm)" opacity="0.5">
      <path d="M 620 320 Q 400 360 400 560 Q 400 760 620 760 Q 500 720 500 560 Q 500 400 620 320 Z" fill="{yolk}"/>
    </g>
    '''.format(**C)
    body += svg_tail()
    return body


def icon_24_mountain():
    """Mountain range — learning path."""
    body = svg_head(C["paperCream"])
    # sky
    body += f'    <rect x="0" y="0" width="1024" height="620" fill="{C["sapphire"]}" opacity="0.3" filter="url(#tf)"/>\n'
    # sun behind
    body += f'    <g filter="url(#ts)"><circle cx="760" cy="280" r="100" fill="{C["yolk"]}"/></g>\n'
    # back mountain
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(10 12)">
      <polygon points="0,700 340,340 620,600 924,380 1024,700" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <polygon points="0,700 340,340 620,600 1024,380 1024,700" fill="{olive}"/>
    </g>
    '''.format(**C)
    # front mountain
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(10 12)">
      <polygon points="0,800 240,500 500,720 780,440 1024,800" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <polygon points="0,800 240,500 500,720 780,440 1024,800" fill="{brick}"/>
    </g>
    '''.format(**C)
    # snow caps
    body += f'    <g filter="url(#tm)"><polygon points="240,500 280,540 200,540" fill="{C["paperCream"]}"/><polygon points="780,440 820,480 740,480" fill="{C["paperCream"]}"/></g>\n'
    # ground
    body += f'    <rect x="0" y="800" width="1024" height="224" fill="{C["brown"]}" filter="url(#ts)"/>\n'
    body += svg_tail()
    return body


def icon_25_waves():
    """Concentric waves — sound diffusion."""
    body = svg_head(C["paperMain"])
    # center dot
    body += f'    <g filter="url(#ts)"><circle cx="512" cy="512" r="60" fill="{C["brick"]}"/></g>\n'
    # concentric rings
    for i, (r, col) in enumerate([(140, C["yolk"]), (220, C["rose"]), (300, C["sapphire"]),
                                    (380, C["olive"]), (460, C["brown"])]):
        body += f'    <g filter="url(#ts)" opacity="0.35" transform="translate(6 8)"><circle cx="512" cy="512" r="{r}" fill="none" stroke="{C["ink"]}" stroke-width="34"/></g>\n'
        body += f'    <g filter="url(#ts)"><circle cx="512" cy="512" r="{r}" fill="none" stroke="{col}" stroke-width="30"/></g>\n'
    body += svg_tail()
    return body


def icon_26_flower():
    """Flower — 6 petals."""
    body = svg_head(C["paperCream"])
    import math
    petal_colors = [C["brick"], C["rose"], C["yolk"], C["sapphire"], C["olive"], C["brown"]]
    # petals around center
    cx, cy = 512, 512
    for i, col in enumerate(petal_colors):
        a = math.radians(60 * i - 90)
        px = cx + math.cos(a) * 200
        py = cy + math.sin(a) * 200
        body += f'    <g filter="url(#ts)" opacity="0.35" transform="translate(6 8)"><ellipse cx="{px:.1f}" cy="{py:.1f}" rx="130" ry="80" transform="rotate({60*i} {px:.1f} {py:.1f})" fill="{C["ink"]}"/></g>\n'
        body += f'    <g filter="url(#ts)"><ellipse cx="{px:.1f}" cy="{py:.1f}" rx="130" ry="80" transform="rotate({60*i} {px:.1f} {py:.1f})" fill="{col}"/></g>\n'
    # center
    body += f'    <g filter="url(#ts)"><circle cx="512" cy="512" r="90" fill="{C["yolk"]}"/><circle cx="512" cy="512" r="60" fill="{C["brown"]}"/></g>\n'
    # seed dots
    body += f'    <g filter="url(#tf)">\n'
    for i in range(8):
        a = math.radians(45 * i)
        px = 512 + math.cos(a) * 34
        py = 512 + math.sin(a) * 34
        body += f'      <circle cx="{px:.1f}" cy="{py:.1f}" r="8" fill="{C["ink"]}"/>\n'
    body += '    </g>\n'
    body += svg_tail()
    return body


def icon_27_star():
    """5-pointed star (torn)."""
    body = svg_head(C["sapphire"])
    # small star sparkles
    body += f'    <g filter="url(#tf)"><circle cx="200" cy="180" r="16" fill="{C["yolk"]}"/><circle cx="820" cy="220" r="12" fill="{C["yolk"]}"/><circle cx="180" cy="820" r="14" fill="{C["yolk"]}"/><circle cx="840" cy="800" r="18" fill="{C["yolk"]}"/></g>\n'
    # big star
    # calculate 5-pointed star path
    import math
    cx, cy, R, r = 512, 512, 320, 140
    pts = []
    for i in range(10):
        angle = math.radians(-90 + i * 36)
        radius = R if i % 2 == 0 else r
        pts.append(f"{cx + math.cos(angle) * radius:.1f},{cy + math.sin(angle) * radius:.1f}")
    star_pts = " ".join(pts)
    body += f'''    <g filter="url(#ts)" opacity="0.4" transform="translate(10 14)">
      <polygon points="{star_pts}" fill="{C['ink']}"/>
    </g>
    <g filter="url(#ts)">
      <polygon points="{star_pts}" fill="{C['yolk']}"/>
    </g>
    <g filter="url(#tm)" opacity="0.55">
      <polygon points="{star_pts}" fill="{C['brick']}" transform="scale(0.7) translate(220 220)"/>
    </g>
'''
    body += svg_tail()
    return body


def icon_28_heart():
    """Heart — love for learning."""
    body = svg_head(C["paperCream"])
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(12 16)">
      <path d="M 512 800 Q 200 620 200 380 Q 200 220 340 220 Q 460 220 512 340 Q 564 220 684 220 Q 824 220 824 380 Q 824 620 512 800 Z" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <path d="M 512 800 Q 200 620 200 380 Q 200 220 340 220 Q 460 220 512 340 Q 564 220 684 220 Q 824 220 824 380 Q 824 620 512 800 Z" fill="{brick}"/>
    </g>
    <g filter="url(#tm)" opacity="0.55">
      <path d="M 512 720 Q 280 580 280 400 Q 280 280 360 280 Q 460 280 512 380 Q 564 280 664 280 Q 744 280 744 400 Q 744 580 512 720 Z" fill="{rose}"/>
    </g>
    <g filter="url(#tf)" opacity="0.5">
      <ellipse cx="400" cy="360" rx="60" ry="40" fill="{yolk}"/>
    </g>
    '''.format(**C)
    body += svg_tail()
    return body


def icon_29_bird():
    """Bird — freedom."""
    body = svg_head(C["paperMain"])
    # body
    body += '''    <g filter="url(#ts)" opacity="0.35" transform="translate(10 14)">
      <ellipse cx="500" cy="560" rx="220" ry="160" fill="{ink}"/>
    </g>
    <g filter="url(#ts)">
      <ellipse cx="500" cy="560" rx="220" ry="160" fill="{sapphire}"/>
    </g>
    '''.format(**C)
    # wing
    body += f'''    <g filter="url(#ts)" opacity="0.35" transform="translate(8 10)">
      <path d="M 400 480 Q 300 340 200 400 Q 260 500 380 540 Z" fill="{C['ink']}"/>
    </g>
    <g filter="url(#ts)">
      <path d="M 400 480 Q 300 340 200 400 Q 260 500 380 540 Z" fill="{C['brick']}"/>
    </g>
    <g filter="url(#tm)">
      <path d="M 420 500 Q 340 400 260 440 Q 300 500 400 520 Z" fill="{C['yolk']}"/>
    </g>
'''
    # head
    body += f'''    <g filter="url(#ts)">
      <circle cx="720" cy="500" r="110" fill="{C['sapphire']}"/>
    </g>
'''
    # beak
    body += f'    <g filter="url(#ts)"><polygon points="810,500 900,510 810,540" fill="{C["yolk"]}"/></g>\n'
    # eye
    body += f'    <g filter="url(#tf)"><circle cx="740" cy="480" r="16" fill="{C["paperCream"]}"/><circle cx="746" cy="482" r="8" fill="{C["ink"]}"/></g>\n'
    # tail
    body += f'    <g filter="url(#ts)"><path d="M 280 620 L 180 700 L 300 660 Z" fill="{C["brick"]}"/></g>\n'
    # feet
    body += f'    <g filter="url(#tf)"><line x1="480" y1="720" x2="480" y2="800" stroke="{C["brown"]}" stroke-width="10"/><line x1="540" y1="720" x2="540" y2="800" stroke="{C["brown"]}" stroke-width="10"/></g>\n'
    body += svg_tail()
    return body


def icon_30_hands():
    """Two hands lifting up."""
    body = svg_head(C["paperCream"])
    # small sun/light between hands
    body += f'    <g filter="url(#ts)"><circle cx="512" cy="360" r="80" fill="{C["yolk"]}"/></g>\n'
    import math
    body += f'    <g filter="url(#tf)" stroke="{C["yolk"]}" stroke-width="16" fill="none">\n'
    for angle in range(0, 360, 45):
        a = math.radians(angle)
        cx, cy = 512, 360
        x1 = cx + math.cos(a) * 100
        y1 = cy + math.sin(a) * 100
        x2 = cx + math.cos(a) * 140
        y2 = cy + math.sin(a) * 140
        body += f'      <line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}"/>\n'
    body += '    </g>\n'
    # left hand — palm up
    body += f'''    <g filter="url(#ts)" opacity="0.35" transform="translate(8 12)">
      <path d="M 120 500 Q 100 460 140 440 L 260 440 Q 320 380 340 440 Q 360 380 380 440 Q 400 380 420 440 L 420 620 Q 400 700 320 700 L 200 700 Q 120 700 120 620 Z" fill="{C['ink']}"/>
    </g>
    <g filter="url(#ts)">
      <path d="M 120 500 Q 100 460 140 440 L 260 440 Q 320 380 340 440 Q 360 380 380 440 Q 400 380 420 440 L 420 620 Q 400 700 320 700 L 200 700 Q 120 700 120 620 Z" fill="{C['rose']}"/>
    </g>
'''
    # right hand — mirror
    body += f'''    <g filter="url(#ts)" opacity="0.35" transform="translate(8 12)">
      <path d="M 904 500 Q 924 460 884 440 L 764 440 Q 704 380 684 440 Q 664 380 644 440 Q 624 380 604 440 L 604 620 Q 624 700 704 700 L 824 700 Q 904 700 904 620 Z" fill="{C['ink']}"/>
    </g>
    <g filter="url(#ts)">
      <path d="M 904 500 Q 924 460 884 440 L 764 440 Q 704 380 684 440 Q 664 380 644 440 Q 624 380 604 440 L 604 620 Q 624 700 704 700 L 824 700 Q 904 700 904 620 Z" fill="{C['brick']}"/>
    </g>
'''
    # arms
    body += f'''    <g filter="url(#ts)">
      <rect x="180" y="700" width="200" height="240" fill="{C['brown']}"/>
      <rect x="644" y="700" width="200" height="240" fill="{C['brown']}"/>
    </g>
'''
    # palm highlights
    body += f'    <g filter="url(#tf)" opacity="0.5"><ellipse cx="270" cy="560" rx="60" ry="40" fill="{C["paperCream"]}"/><ellipse cx="754" cy="560" rx="60" ry="40" fill="{C["paperCream"]}"/></g>\n'
    body += svg_tail()
    return body


# ============================================================
# MAIN
# ============================================================


ICONS = [
    (1, "耳机", icon_01_headphones),
    (2, "麦克风", icon_02_microphone),
    (3, "唱片", icon_03_vinyl),
    (4, "录音带", icon_04_cassette),
    (5, "播放", icon_05_play),
    (6, "声波", icon_06_soundwave),
    (7, "喇叭", icon_07_speaker),
    (8, "随身听", icon_08_walkman),
    (9, "耳朵", icon_09_ear),
    (10, "麦耳组合", icon_10_mic_headphone_combo),
    (11, "打开的书", icon_11_book),
    (12, "大脑", icon_12_brain),
    (13, "灯泡", icon_13_bulb),
    (14, "铅笔", icon_14_pencil),
    (15, "眼镜", icon_15_glasses),
    (16, "咖啡", icon_16_coffee),
    (17, "沙漏", icon_17_hourglass),
    (18, "树苗", icon_18_sprout),
    (19, "钥匙", icon_19_key),
    (20, "放大镜", icon_20_magnifier),
    (21, "拼布方块", icon_21_tricolor_squares),
    (22, "太阳", icon_22_sun),
    (23, "月亮", icon_23_moon),
    (24, "山峰", icon_24_mountain),
    (25, "波浪", icon_25_waves),
    (26, "花朵", icon_26_flower),
    (27, "星星", icon_27_star),
    (28, "心", icon_28_heart),
    (29, "鸟", icon_29_bird),
    (30, "双手", icon_30_hands),
]


def main():
    out_dir = os.path.dirname(os.path.abspath(__file__))
    for num, title, fn in ICONS:
        svg = fn()
        path = os.path.join(out_dir, f"icon-{num:02d}.svg")
        with open(path, "w", encoding="utf-8") as f:
            f.write(svg)
        size = len(svg.encode("utf-8"))
        print(f"icon-{num:02d}.svg = {size} bytes")

    # Regenerate index.html
    html_head = '''<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>K0 Icon Candidates v2 — Torn Paper Pure Graphics</title>
<style>
  body { background: #F5EBD3; font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 40px; margin: 0; }
  h1 { color: #652300; text-align: center; font-size: 34px; margin-bottom: 8px; }
  .sub { color: #6B6A4E; text-align: center; margin-bottom: 40px; }
  .grid { display: grid; grid-template-columns: repeat(5, 200px); gap: 40px; justify-content: center; }
  .cell { text-align: center; }
  .cell img { width: 200px; height: 200px; border-radius: 45px; box-shadow: 0 4px 12px rgba(101,35,0,0.2); }
  .cell .label { color: #652300; margin-top: 8px; font-size: 15px; }
  .cell .num { color: #C80306; font-weight: bold; }
</style>
</head>
<body>
<h1>K0 App Icon 候选 v2</h1>
<div class="sub">30 个纯图形撕纸拼贴 · 无字母 · 无数字 · 无汉字</div>
<div class="grid">
'''
    html_body = ""
    for num, title, _ in ICONS:
        html_body += f'  <div class="cell"><img src="icon-{num:02d}.svg" alt="{title}"><div class="label"><span class="num">{num:02d}</span> {title}</div></div>\n'
    html_tail = '''</div>
</body>
</html>
'''
    with open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(html_head + html_body + html_tail)
    print("index.html regenerated")


if __name__ == "__main__":
    main()
