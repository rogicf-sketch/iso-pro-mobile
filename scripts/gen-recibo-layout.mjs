import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopTs = path.join(
  __dirname,
  '..',
  '..',
  'iso-pro-desktop',
  'src',
  'modules',
  'atendimento',
  'utils',
  'imprimirReciboAtendimento.ts',
);
const outPath = path.join(__dirname, '..', 'src', 'lib', 'reciboAtendimentoLayout.ts');
const s = fs.readFileSync(desktopTs, 'utf8');
const m = s.match(/function cssReciboAtendimentoBase\(\): string \{\s*return `([\s\S]*?)`;\s*\}/);
if (!m) throw new Error('cssReciboAtendimentoBase not found');

const extra = `
    * { box-sizing: border-box; }
    body.recibo-body { font-family: 'Noto Sans', 'Segoe UI', system-ui, sans-serif; font-size: 11pt; line-height: 1.4; margin: 0; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
    .grid2 p { margin: 4px 0; }
    .inst-logo-placeholder { width: 150px; min-height: 76px; border: 1px dashed #cbd5e1; border-radius: 10px; display: flex; align-items: center; justify-content: center; text-align: center; padding: 8px; background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%); }
    .inst-logo-hint { font-size: 8.5pt; color: #777; line-height: 1.3; }
    .inst-logo-sub { font-size: 7.5pt; color: #999; }
    .inst-logo-img { max-width: 150px; max-height: 76px; width: auto; height: auto; object-fit: contain; display: block; }
`;

const header = `/** Layout HTML/CSS do recibo de atendimento — alinhado ao I.S.O PRO desktop (imprimirReciboAtendimento). */

export function escapeHtmlRecibo(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Mesmo texto do PC (\`segmentoInstituicaoRodapeEletronico\`). */
export function segmentoRodapeInstituicaoRecibo(nome?: string, cnpj?: string): string {
  const n = (nome ?? '').trim();
  const c = (cnpj ?? '').trim();
  if (c) return \` CNPJ: \${escapeHtmlRecibo(c)}\`;
  if (n) return \` · \${escapeHtmlRecibo(n)}\`;
  return '';
}

export function linhaMatriculaFuncaoAssinatura(mat?: string, funcao?: string): string {
  const m = (mat ?? '').trim();
  const f = (funcao ?? '').trim();
  const mOk = m && m !== '—';
  const fOk = f && f !== '—';
  if (!mOk && !fOk) return '—';
  const partes: string[] = [];
  if (mOk) partes.push(\`Mat. \${m}\`);
  if (fOk) partes.push(f);
  return partes.join(' · ');
}

export function nomeExibicaoAtendenteAssinatura(atendente: string, matricula?: string): string {
  const full = atendente.trim();
  const mat = (matricula ?? '').trim();
  if (mat && mat !== '—' && full.endsWith(\` - \${mat}\`)) return full.slice(0, full.length - mat.length - 3).trim();
  return full;
}

export function htmlLogoRecibo(logoUrl?: string | null): string {
  const url = (logoUrl ?? '').trim();
  if (url) {
    return \`<div class="recibo-logo-wrap"><img class="inst-logo-img" src="\${escapeHtmlRecibo(url)}" alt="Logo institucional" /></div>\`;
  }
  return \`<div class="recibo-logo-wrap"><div class="inst-logo-placeholder"><span class="inst-logo-hint">I.S.O PRO<br/><span class="inst-logo-sub">Gestao de Materiais</span></span></div></div>\`;
}

export function htmlAssinaturasRecibo(
  atendenteNome: string,
  atendenteMeta: string,
  atendidoNome: string,
  atendidoMeta: string,
): string {
  return \`
  <section class="assinaturas" aria-label="Assinaturas">
    <div class="assinatura-box">
      <p class="rotulo-ass">Atendente (operador)</p>
      <div class="espaco-assinatura" aria-hidden="true"></div>
      <div class="linha-ass" aria-hidden="true"></div>
      <div class="bloco-ass-pessoa">
        <p class="ass-nome-principal">\${escapeHtmlRecibo(atendenteNome)}</p>
        <p class="ass-meta-linha">\${escapeHtmlRecibo(atendenteMeta)}</p>
      </div>
    </div>
    <div class="assinatura-box">
      <p class="rotulo-ass">Atendido (quem retirou)</p>
      <div class="espaco-assinatura" aria-hidden="true"></div>
      <div class="linha-ass" aria-hidden="true"></div>
      <div class="bloco-ass-pessoa">
        <p class="ass-nome-principal">\${escapeHtmlRecibo(atendidoNome)}</p>
        <p class="ass-meta-linha">\${escapeHtmlRecibo(atendidoMeta)}</p>
      </div>
    </div>
  </section>\`;
}

export function htmlLinhaItemRecibo(
  idx: number,
  codigo: string,
  descricao: string,
  unidade: string,
  quantidade: number,
): string {
  return \`<tr>
          <td class="col-num">\${idx + 1}</td>
          <td class="col-codigo">\${escapeHtmlRecibo(codigo)}</td>
          <td class="col-desc">\${escapeHtmlRecibo(descricao)}</td>
          <td class="col-un">\${escapeHtmlRecibo(unidade)}</td>
          <td class="col-qtd">\${escapeHtmlRecibo(String(quantidade))}</td>
        </tr>\`;
}

export function cssReciboAtendimentoLayout(): string {
  return \`${extra}${m[1]}\`;
}
`;

fs.writeFileSync(outPath, header);
console.log('OK', outPath);
