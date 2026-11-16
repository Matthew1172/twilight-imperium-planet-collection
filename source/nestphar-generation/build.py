from pathlib import Path
from PIL import Image
import numpy as np
import base64

Image.MAX_IMAGE_PIXELS = None
root = Path(__file__).parent
assets = Path('/Users/matthewpecko/Documents/Codex/2026-11-13/can-x20/outputs/twilight-imperium-collection/assets/planet-materials')
out = assets / 'nestphar-satellite-global-v1'
out.mkdir(exist_ok=True)
size = 2048
atlas = Image.new('RGB', (size * 4, size * 2))
for y in range(2):
    for x in range(4):
        img = Image.open(root / f'{x}-{y}.png').convert('RGB')
        atlas.paste(img.resize((size, size), Image.Resampling.LANCZOS), (x * size, y * size))

# Feather across the independently generated edges, including the longitude wrap.
# Mirrored continuation makes the two boundary pixels match without exposing the
# original illustrated map at the edges. Some geography will still be approximate.
a = np.array(atlas)
w = 128
weights = (0.5 * (1 - (np.arange(w, dtype=np.float32) + .5) / w))[None, :, None]
for boundary in (0, size, size * 2, size * 3):
    li = (boundary - 1 - np.arange(w)) % a.shape[1]
    ri = (boundary + np.arange(w)) % a.shape[1]
    left, right = a[:, li, :].astype(np.float32), a[:, ri, :].astype(np.float32)
    a[:, li, :] = np.uint8(left * (1 - weights) + right * weights)
    a[:, ri, :] = np.uint8(right * (1 - weights) + left * weights)
weights_y = weights.transpose(1, 0, 2)
li = size - 1 - np.arange(w)
ri = size + np.arange(w)
top, bottom = a[li].astype(np.float32), a[ri].astype(np.float32)
a[li] = np.uint8(top * (1 - weights_y) + bottom * weights_y)
a[ri] = np.uint8(bottom * (1 - weights_y) + top * weights_y)
# Converge the texture at the poles so longitude does not pinch into a starburst.
for y in list(range(96)) + list(range(a.shape[0] - 96, a.shape[0])):
    d = min(y, a.shape[0] - 1 - y) / 96
    t = d*d*(3-2*d)
    row = a[y].astype(np.float32)
    a[y] = np.uint8(row*t + row.mean(axis=0)*(1-t))
atlas = Image.fromarray(a)

def save(img, path, **opts):
    img.save(path, **opts)
    mime = 'image/webp' if path.suffix == '.webp' else 'image/jpeg'
    path.with_suffix(path.suffix + '.js').write_text('window[document.currentScript.src.split("#").pop()]("data:' + mime + ';base64,' + base64.b64encode(path.read_bytes()).decode() + '");')

save(atlas.resize((4096, 2048), Image.Resampling.LANCZOS), out / 'orbit.webp', quality=91, method=4)
save(atlas.crop((0, 0, 4096, 4096)), out / 'orbit-0.webp', quality=91, method=4)
save(atlas.crop((4096, 0, 8192, 4096)), out / 'orbit-1.webp', quality=91, method=4)
for y in range(4):
    for x in range(8):
        tile = atlas.crop((x*1024, y*1024, (x+1)*1024, (y+1)*1024))
        save(tile, out / f'{x}-{y}.jpg', quality=93, subsampling=0)
atlas.resize((2048, 1024), Image.Resampling.LANCZOS).save(root / 'overview.jpg', quality=90)
print('Built globe and 32 regional tiles:', out, flush=True)
