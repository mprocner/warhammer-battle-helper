# Dark Warhammer FRP Theme

A dark theme for the Warhammer Battle Helper application, featuring deep browns, aged gold accents, and a gothic aesthetic inspired by the Warhammer Fantasy Roleplay universe.

## Theme Characteristics

- **Dark parchment backgrounds** - Deep brown tones (#1a1612, #2a2420)
- **Aged gold accents** - Muted gold highlights (#c9a227, #d4af37)
- **Gothic typography** - Dark text on subtle backgrounds
- **Atmospheric styling** - Shadows and textures for immersion

## Included Files

```
themes/dark-warhammer-frp/
├── README.md
├── style.css                      # Main stylesheet
├── index.css                      # Base styles
└── components/
    ├── LogWindow.css              # Log window styles
    ├── panels/
    │   ├── RightPanel.css         # Right panel styles
    │   └── PanelToggle.css        # Panel toggle styles
    └── tabs/
        ├── GeneralTab.css         # General tab styles
        └── TabPlaceholder.css     # Tab placeholder styles
```

## How to Apply This Theme

### Option 1: Manual Copy

Copy the theme files to replace the current source files:

```bash
# From the warhammer-battle-helper-front directory:
cp themes/dark-warhammer-frp/style.css src/style.css
cp themes/dark-warhammer-frp/index.css src/index.css
cp themes/dark-warhammer-frp/components/LogWindow.css src/components/LogWindow.css
cp themes/dark-warhammer-frp/components/panels/RightPanel.css src/components/panels/RightPanel.css
cp themes/dark-warhammer-frp/components/panels/PanelToggle.css src/components/panels/PanelToggle.css
cp themes/dark-warhammer-frp/components/tabs/GeneralTab.css src/components/tabs/GeneralTab.css
cp themes/dark-warhammer-frp/components/tabs/TabPlaceholder.css src/components/tabs/TabPlaceholder.css
```

### Option 2: Shell Script

Create and run a script to apply the theme:

```bash
#!/bin/bash
# apply-dark-theme.sh
THEME_DIR="themes/dark-warhammer-frp"
SRC_DIR="src"

cp "$THEME_DIR/style.css" "$SRC_DIR/style.css"
cp "$THEME_DIR/index.css" "$SRC_DIR/index.css"
cp "$THEME_DIR/components/LogWindow.css" "$SRC_DIR/components/LogWindow.css"
cp "$THEME_DIR/components/panels/RightPanel.css" "$SRC_DIR/components/panels/RightPanel.css"
cp "$THEME_DIR/components/panels/PanelToggle.css" "$SRC_DIR/components/panels/PanelToggle.css"
cp "$THEME_DIR/components/tabs/GeneralTab.css" "$SRC_DIR/components/tabs/GeneralTab.css"
cp "$THEME_DIR/components/tabs/TabPlaceholder.css" "$SRC_DIR/components/tabs/TabPlaceholder.css"

echo "Dark Warhammer FRP theme applied!"
```

## How to Revert to Light Theme

To restore the original light parchment theme, use git:

```bash
git checkout HEAD -- \
  src/style.css \
  src/index.css \
  src/components/LogWindow.css \
  src/components/panels/RightPanel.css \
  src/components/panels/PanelToggle.css \
  src/components/tabs/GeneralTab.css \
  src/components/tabs/TabPlaceholder.css
```

## After Applying

1. Restart the development server if it's running
2. Hard refresh the browser (Ctrl+Shift+R or Cmd+Shift+R) to clear cached styles
