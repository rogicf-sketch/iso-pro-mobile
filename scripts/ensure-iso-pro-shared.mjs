/**
 * Garante dist/ de iso-pro-shared em node_modules após npm ci (EAS Build).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendor = path.join(root, 'vendor', 'iso-pro-shared');
const target = path.join(root, 'node_modules', 'iso-pro-shared');
const marker = path.join(target, 'dist', 'index.js');

if (fs.existsSync(marker)) {
  process.exit(0);
}

const vendorMarker = path.join(vendor, 'dist', 'index.js');
if (!fs.existsSync(vendorMarker)) {
  console.error(
    '[ensure-iso-pro-shared] Falta vendor/iso-pro-shared/dist. Corra scripts/sync-vendor-iso-pro-shared.ps1',
  );
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(vendor, target, { recursive: true });
console.log('[ensure-iso-pro-shared] Copiado vendor → node_modules/iso-pro-shared');
