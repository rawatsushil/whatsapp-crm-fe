#!/usr/bin/env python3
"""
Generate placeholder icons for WhatsApp CRM Chrome Extension
Creates simple colored square icons in WhatsApp green
"""

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("PIL/Pillow not installed. Install with: pip install Pillow")
    print("Or use one of the other methods in README.md")
    exit(1)

# WhatsApp green color
WHATSAPP_GREEN = (37, 211, 102)  # #25d366

sizes = [16, 48, 128]

for size in sizes:
    # Create image with WhatsApp green background
    img = Image.new('RGB', (size, size), WHATSAPP_GREEN)
    
    # Draw a simple chat bubble icon
    draw = ImageDraw.Draw(img)
    
    # Draw a simple circle/chat bubble
    margin = size // 8
    draw.ellipse(
        [margin, margin, size - margin, size - margin],
        fill=(255, 255, 255),  # White
        outline=None
    )
    
    # Add a small tail (chat bubble tail)
    if size >= 48:
        tail_points = [
            (size // 4, size - margin),
            (size // 3, size - margin // 2),
            (size // 2, size - margin)
        ]
        draw.polygon(tail_points, fill=(255, 255, 255))
    
    # Save icon
    filename = f'icon{size}.png'
    img.save(filename)
    print(f'Created {filename} ({size}x{size})')

print('\nIcons generated successfully!')
print('You can now load the extension in Chrome.')



