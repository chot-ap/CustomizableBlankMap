import os
import math
from PIL import Image, ImageDraw, ImageFont

os.makedirs('icons', exist_ok=True)

def create_app_icon(size):
    # Create image with RGBA
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. Background gradient squircle
    radius = int(size * 0.22)
    # Draw rounded rectangle background
    # Gradient colors
    c_start = (37, 99, 235)  # #2563eb
    c_end = (79, 70, 229)    # #4f46e5

    # Create background mask
    mask = Image.new('L', (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    margin = int(size * 0.04)
    mask_draw.rounded_rectangle([margin, margin, size - margin, size - margin], radius=radius, fill=255)

    # Create gradient
    grad = Image.new('RGBA', (size, size), 0)
    grad_draw = ImageDraw.Draw(grad)
    for y in range(size):
        r = int(c_start[0] + (c_end[0] - c_start[0]) * (y / size))
        g = int(c_start[1] + (c_end[1] - c_start[1]) * (y / size))
        b = int(c_start[2] + (c_end[2] - c_start[2]) * (y / size))
        grad_draw.line([(0, y), (size, y)], fill=(r, g, b, 255))

    img.paste(grad, (0, 0), mask)

    # 2. Subtle map folds (White translucent lines/polygons)
    # 3 folds of a map
    map_w = size * 0.58
    map_h = size * 0.44
    map_x = (size - map_w) / 2
    map_y = size * 0.36
    panel_w = map_w / 3

    # Panel 1 (left)
    p1 = [(map_x, map_y + map_h * 0.1),
          (map_x + panel_w, map_y),
          (map_x + panel_w, map_y + map_h),
          (map_x, map_y + map_h * 1.1)]
    draw.polygon(p1, fill=(255, 255, 255, 180), outline=(255, 255, 255, 220))

    # Panel 2 (center)
    p2 = [(map_x + panel_w, map_y),
          (map_x + panel_w * 2, map_y + map_h * 0.1),
          (map_x + panel_w * 2, map_y + map_h * 1.1),
          (map_x + panel_w, map_y + map_h)]
    draw.polygon(p2, fill=(255, 255, 255, 140), outline=(255, 255, 255, 200))

    # Panel 3 (right)
    p3 = [(map_x + panel_w * 2, map_y + map_h * 0.1),
          (map_x + map_w, map_y),
          (map_x + map_w, map_y + map_h),
          (map_x + panel_w * 2, map_y + map_h * 1.1)]
    draw.polygon(p3, fill=(255, 255, 255, 190), outline=(255, 255, 255, 230))

    # 3. Location Pin in center
    pin_cx = size * 0.5
    pin_cy = size * 0.42
    pin_r = size * 0.17

    # Pin drop shadow
    shadow_offset = int(size * 0.04)
    draw.ellipse([pin_cx - pin_r, pin_cy - pin_r + shadow_offset, pin_cx + pin_r, pin_cy + pin_r + shadow_offset], fill=(0, 0, 0, 50))

    # Pin point triangle
    point_y = pin_cy + pin_r * 1.6
    draw.polygon([(pin_cx - pin_r * 0.7, pin_cy + pin_r * 0.3),
                  (pin_cx + pin_r * 0.7, pin_cy + pin_r * 0.3),
                  (pin_cx, point_y)],
                 fill=(239, 68, 68, 255)) # #ef4444

    # Pin head circle
    draw.ellipse([pin_cx - pin_r, pin_cy - pin_r, pin_cx + pin_r, pin_cy + pin_r], fill=(239, 68, 68, 255), outline=(255, 255, 255, 255), width=max(2, int(size * 0.02)))

    # Inner white star/circle
    inner_r = pin_r * 0.45
    draw.ellipse([pin_cx - inner_r, pin_cy - inner_r, pin_cx + inner_r, pin_cy + inner_r], fill=(255, 255, 255, 255))

    return img

icon_192 = create_app_icon(192)
icon_192.save('icons/icon-192.png', 'PNG')

icon_512 = create_app_icon(512)
icon_512.save('icons/icon-512.png', 'PNG')

# Favicon
icon_32 = create_app_icon(32)
icon_32.save('icons/favicon.png', 'PNG')

print("Icons successfully created in icons/ directory")
