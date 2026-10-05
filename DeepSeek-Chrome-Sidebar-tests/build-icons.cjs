// Rasterize the checked-in vector; no model-generated assets or remote downloads.
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
(async () => {
  const dir = path.resolve(__dirname, '../DeepSeek-Chrome-Sidebar/icons');
  const whale = await loadImage(fs.readFileSync(path.join(dir, 'whale.svg')));
  for (const size of [16, 32, 48, 128]) {
    const canvas = createCanvas(size, size);
    canvas.getContext('2d').drawImage(whale, 0, 0, size, size);
    fs.writeFileSync(path.join(dir, `whale-${size}.png`), canvas.toBuffer('image/png'));
  }
})();
