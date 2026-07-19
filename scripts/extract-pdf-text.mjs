import fs from 'node:fs';

const files = [
  String.raw`c:\Users\rogic\Downloads\supa.pdf`,
  String.raw`c:\Users\rogic\Downloads\supa 2.pdf`,
];

for (const f of files) {
  const b = fs.readFileSync(f);
  const t = b.toString('latin1');
  const words = [...t.matchAll(/[\x20-\x7E]{6,}/g)]
    .map((m) => m[0])
    .filter((s) =>
      /iso|snapshot|query|SELECT|RAM|CPU|postgres|tenant|payload|Unhealthy|calls|time|read|patch|atendimento|supabase|MB|bytes|cron|function|rpc|ms|Query|Performance|Database|Advisor|slow|index|table|row|size|memory|disk|connection|pool|statement|mean|total|p95|cache|hit/i.test(
        s,
      ),
    );
  console.log('===', f.split('\\').pop(), '===');
  console.log([...new Set(words)].slice(0, 120).join('\n'));
  console.log('');
}
