import os
from PIL import Image, ImageDraw

# Image size
width, height = 800, 600
# Background color (light office wall)
bg_color = (240, 240, 240)

# Create image and drawing context
img = Image.new('RGB', (width, height), bg_color)
draw = ImageDraw.Draw(img)

# Draw a simple sun painting on the back wall (left side)
sun_center = (150, 150)
sun_radius = 80
sun_color = (255, 204, 0)  # bright yellow
# Sun circle
draw.ellipse([
    sun_center[0] - sun_radius, sun_center[1] - sun_radius,
    sun_center[0] + sun_radius, sun_center[1] + sun_radius
], fill=sun_color, outline=None)
# Sun rays (simple lines)
for i in range(12):
    angle = i * 30
    # Convert angle to radians
    import math
    rad = math.radians(angle)
    # Start from sun edge
    start_x = sun_center[0] + sun_radius * math.cos(rad)
    start_y = sun_center[1] + sun_radius * math.sin(rad)
    # End point further out
    end_x = sun_center[0] + (sun_radius + 30) * math.cos(rad)
    end_y = sun_center[1] + (sun_radius + 30) * math.sin(rad)
    draw.line([ (start_x, start_y), (end_x, end_y) ], fill=sun_color, width=2)

# Draw a desk (simple rectangle)
desk_top = 400
desk_bottom = 440
desk_left = 150
desk_right = 650
desk_color = (100, 100, 100)
draw.rectangle([desk_left, desk_top, desk_right, desk_bottom], fill=desk_color)

# Draw a simple man sitting at the desk
# Head
head_center = (350, 350)
head_radius = 30
head_color = (255, 224, 189)
draw.ellipse([
    head_center[0] - head_radius, head_center[1] - head_radius,
    head_center[0] + head_radius, head_center[1] + head_radius
], fill=head_color, outline=None)
# Body (torso)
body_top = head_center[1] + head_radius
body_bottom = 430
body_left = head_center[0] - 20
body_right = head_center[0] + 20
body_color = (30, 60, 120)  # dark blue suit
draw.rectangle([body_left, body_top, body_right, body_bottom], fill=body_color)
# Arms (simple lines)
arm_y = body_top + 20
draw.line([ (body_left, arm_y), (body_left - 30, arm_y + 30) ], fill=body_color, width=6)  # left arm
draw.line([ (body_right, arm_y), (body_right + 30, arm_y + 30) ], fill=body_color, width=6)  # right arm
# Legs (simple lines)
leg_y_start = body_bottom
draw.line([ (head_center[0] - 10, leg_y_start), (head_center[0] - 10, leg_y_start + 40) ], fill=body_color, width=6)  # left leg
draw.line([ (head_center[0] + 10, leg_y_start), (head_center[0] + 10, leg_y_start + 40) ], fill=body_color, width=6)  # right leg

# Represent multiple businesses with briefcase icons floating above the head
briefcase_width = 30
briefcase_height = 20
briefcase_color = (180, 30, 30)  # red briefcase
# Positions of three briefcases
briefcase_offsets = [(-50, -80), (0, -100), (50, -80)]
for dx, dy in briefcase_offsets:
    x0 = head_center[0] + dx - briefcase_width // 2
    y0 = head_center[1] + dy - briefcase_height // 2
    x1 = x0 + briefcase_width
    y1 = y0 + briefcase_height
    draw.rectangle([x0, y0, x1, y1], fill=briefcase_color)
    # handle of briefcase
    handle_y = y0
    draw.line([ (x0 + 5, handle_y), (x1 - 5, handle_y) ], fill=(255, 255, 255), width=2)

# Save the image
output_dir = os.path.join(os.getcwd(), 'assets', 'generated')
os.makedirs(output_dir, exist_ok=True)
output_path = os.path.join(output_dir, 'successful_man.png')
img.save(output_path)
print(f'Image saved to {output_path}')
