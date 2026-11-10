"""Default-theme token palette used by tokenize.py (PLAYRPG-346, one-off migration tool).

Each family maps a CSS property group to its semantic tokens. A hex value found in a
declaration of that family is replaced by the nearest token of the same family (CIE76
distance in Lab), so the default theme keeps its look while every colour becomes
themeable. Delete this directory once PLAYRPG-346 is merged.
"""

# family -> [(token, default hex)]
FAMILIES = {
    'text': [
        ('--c-text', '#3a2f1f'),            # body text
        ('--c-text-deep', '#3d2b1a'),       # near-black brown
        ('--c-heading', '#6b4423'),         # headings, dark leather
        ('--c-label', '#7a5c42'),           # field labels, categories
        ('--c-text-muted', '#8a7d6a'),      # hints, disabled
        ('--c-text-accent', '#c9975b'),     # gold text
        ('--c-text-on-dark', '#fff9f0'),    # text on leather / accent buttons
        ('--c-text-danger', '#c0392b'),
        ('--c-text-success', '#4a7c59'),
        ('--c-text-info', '#3864aa'),
        ('--c-text-magic', '#6b3fa0'),
        ('--c-text-neutral', '#666666'),    # grey UI text
        ('--c-text-neutral-light', '#aaaaaa'),
        ('--c-text-on-dark-muted', '#f0d8b0'), # secondary text on dark surfaces
        ('--c-text-danger-dark', '#8b2424'),
        ('--c-text-gold', '#8b6914'),        # dark gold text
        ('--c-text-danger-light', '#e59a9a'),  # danger text on dark overlays
        ('--c-text-magic-light', '#e8d0ff'),
    ],
    'bg': [
        ('--c-input-bg', '#fff9f0'),        # inputs, warm white
        ('--c-surface', '#f4e8d8'),         # parchment panels
        ('--c-surface-alt', '#e8dcc4'),     # darker parchment
        ('--c-surface-raised', '#f9f3e8'),  # cards on parchment
        ('--c-surface-sunken', '#ede0ce'),
        ('--c-surface-white', '#ffffff'),
        ('--c-accent-bg', '#c9975b'),       # gold buttons
        ('--c-accent-bg-light', '#d4a574'),
        ('--c-accent-bg-dark', '#a67c52'),
        ('--c-leather-bg', '#7a5c42'),      # leather buttons / bars
        ('--c-leather-bg-dark', '#6b4423'),
        ('--c-dark-bg', '#3a2920'),         # dark surfaces (tooltips, overlays)
        ('--c-danger-bg', '#a93434'),
        ('--c-success-bg', '#4a7c59'),
        ('--c-info-bg', '#3864aa'),
        ('--c-magic-bg', '#6b3fa0'),
        ('--c-neutral-bg', '#888888'),
        ('--c-danger-bg-light', '#e07676'),
        ('--c-danger-bg-dark', '#6b1818'),
        ('--c-success-bg-light', '#6db88a'),
        ('--c-night-bg', '#252540'),        # dark navy (minigames)
        ('--c-success-bg-pale', '#d4ecd4'),
        ('--c-success-bg-vivid', '#4caf50'),
    ],
    'border': [
        ('--c-border-accent', '#c9975b'),   # gold frames
        ('--c-border-strong', '#7a5c42'),   # popup border, focus
        ('--c-border', '#c4a882'),          # input borders
        ('--c-border-light', '#d4a574'),
        ('--c-border-dark', '#6b4423'),
        ('--c-border-gold', '#d4af37'),     # metallic gold highlights
        ('--c-border-danger', '#c94444'),
        ('--c-border-success', '#4a7c59'),
        ('--c-border-info', '#3864aa'),
        ('--c-border-magic', '#6b3fa0'),
        ('--c-border-neutral', '#888888'),
        ('--c-border-faint', '#e8dcc4'),     # parchment-on-parchment separators
        ('--c-border-neutral-dark', '#333333'),
        ('--c-border-neutral-light', '#cccccc'),
        ('--c-border-danger-dark', '#8b2424'),
        ('--c-border-success-light', '#8fd9af'),
        ('--c-border-danger-deep', '#4a1a1a'),
    ],
}

# rgb triplets for rgba(): base colour -> token (alpha stays literal)
RGB = [
    ('--c-accent-rgb', '#c9975b'),
    ('--c-leather-rgb', '#7a5c42'),
    ('--c-leather-dark-rgb', '#6b4423'),
    ('--c-text-rgb', '#3a2f1f'),
    ('--c-deep-rgb', '#3d2b1a'),
    ('--c-gold-rgb', '#d4af37'),
    ('--c-light-rgb', '#fff9f0'),
    ('--c-highlight-rgb', '#ffffff'),
    ('--c-shadow-rgb', '#000000'),
    ('--c-danger-rgb', '#c0392b'),
    ('--c-success-rgb', '#38825a'),
    ('--c-info-rgb', '#3864aa'),
    ('--c-magic-rgb', '#6b3fa0'),
]
