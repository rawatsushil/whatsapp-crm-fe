# Extension Icons

This directory should contain three icon files:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)  
- `icon128.png` (128x128 pixels)

## Quick Setup

### Option 1: Generate Placeholder Icons (Python)

Run this script to generate simple placeholder icons:

```bash
python3 generate_icons.py
```

### Option 2: Use Online Tool

1. Create a simple icon (e.g., a chat bubble or CRM symbol)
2. Use an online tool like https://www.favicon-generator.org/ or https://realfavicongenerator.net/
3. Download the icons and place them in this directory

### Option 3: Use ImageMagick

```bash
# Create a simple green square icon (WhatsApp green: #25d366)
convert -size 16x16 xc:#25d366 icon16.png
convert -size 48x48 xc:#25d366 icon48.png
convert -size 128x128 xc:#25d366 icon128.png
```

### Option 4: Temporary Workaround

For development, you can use any 16x16, 48x48, and 128x128 PNG images. The extension will work without custom icons, but Chrome will show a default icon.

## Icon Design Suggestions

- Use WhatsApp green (#25d366) as primary color
- Include a chat bubble or CRM symbol
- Keep it simple and recognizable at small sizes
- Ensure good contrast for visibility



