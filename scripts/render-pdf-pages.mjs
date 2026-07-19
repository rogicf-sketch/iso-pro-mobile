import fs from 'node:fs';
import path from 'node:path';
import { pdf } from 'pdf-to-img';

const outDir = String.raw`c:\Users\rogic\Downloads\supa-pdf-export`;
fs.mkdirSync(outDir, { recursive: true });

const files = [
  String.raw`c:\Users\rogic\Downloads\supa.pdf`,
  String.raw`c:\Users\rogic\Downloads\supa 2.pdf`,
];

for (const file of files) {
  const base = path.basename(file, '.pdf').replace(/\s+/g, '-');
  const doc = await pdf(file, { scale: 2 });
  let page = 1;
  for await (const image of doc) {
    const out = path.join(outDir, `${base}-p${page}.png`);
    fs.writeFileSync(out, image);
    console.log('wrote', out);
    page += 1;
  }
}
