from pathlib import Path
from PIL import Image, ImageOps

source_path = Path('Icons/icon.png')
out_dir = Path('Icons')
out_dir.mkdir(exist_ok=True)

if not source_path.exists():
    raise FileNotFoundError(f'Missing source icon: {source_path}')

source = Image.open(source_path).convert('RGBA')

sizes = [16, 24, 32, 48, 128]

for size in sizes:
    resized = source.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(out_dir / f'icon{size}.png')

    dark = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    # Invert colors to create a visible dark-theme variant
    for img in [resized]:
        data = list(img.getdata())
        new_data = []
        for r, g, b, a in data:
            if a <= 0:
                new_data.append((0, 0, 0, 0))
            else:
                new_data.append((255 - r, 255 - g, 255 - b, a))
        dark.putdata(new_data)
    dark.save(out_dir / f'icon{size}-dark.png')

print('Generated icons:', ', '.join(str(out_dir / f'icon{size}.png') for size in sizes))
print('Generated dark icons:', ', '.join(str(out_dir / f'icon{size}-dark.png') for size in sizes))
