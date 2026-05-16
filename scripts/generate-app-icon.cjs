/**
 * Gera assets/app-icon.png (1024×1024) para icon / adaptiveIcon.
 * O logo horizontal em logo.png não serve como ícone — o sistema mete-o num quadrado com margens brancas.
 */
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const logoPath = path.join(root, 'assets', 'logo.png');
const outPath = path.join(root, 'assets', 'app-icon.png');
const size = 1024;
/** #0B1426 — igual a app.config brandBackground */
const brand = { r: 11, g: 20, b: 38, alpha: 1 };

async function main() {
  const resizedLogo = await sharp(logoPath)
    .resize(Math.floor(size * 0.78), null, { fit: 'inside' })
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: brand,
    },
  })
    .composite([{ input: resizedLogo, gravity: 'center' }])
    .png()
    .toFile(outPath);

  console.log('Gerado:', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
