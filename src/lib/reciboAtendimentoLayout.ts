/** Layout HTML/CSS do recibo de atendimento — alinhado ao I.S.O PRO desktop (imprimirReciboAtendimento). */

export function escapeHtmlRecibo(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Mesmo texto do PC (`segmentoInstituicaoRodapeEletronico`). */
export function segmentoRodapeInstituicaoRecibo(nome?: string, cnpj?: string): string {
  const n = (nome ?? '').trim();
  const c = (cnpj ?? '').trim();
  if (c) return ` CNPJ: ${escapeHtmlRecibo(c)}`;
  if (n) return ` · ${escapeHtmlRecibo(n)}`;
  return '';
}

export function linhaMatriculaFuncaoAssinatura(mat?: string, funcao?: string): string {
  const m = (mat ?? '').trim();
  const f = (funcao ?? '').trim();
  const mOk = m && m !== '—';
  const fOk = f && f !== '—';
  if (!mOk && !fOk) return '—';
  const partes: string[] = [];
  if (mOk) partes.push(`Mat. ${m}`);
  if (fOk) partes.push(f);
  return partes.join(' · ');
}

export function nomeExibicaoAtendenteAssinatura(atendente: string, matricula?: string): string {
  const full = atendente.trim();
  const mat = (matricula ?? '').trim();
  if (mat && mat !== '—' && full.endsWith(` - ${mat}`)) return full.slice(0, full.length - mat.length - 3).trim();
  return full;
}

export function htmlLogoRecibo(logoUrl?: string | null): string {
  const url = (logoUrl ?? '').trim();
  if (url) {
    return `<div class="recibo-logo-wrap"><img class="inst-logo-img" src="${escapeHtmlRecibo(url)}" alt="Logo institucional" /></div>`;
  }
  return `<div class="recibo-logo-wrap"><div class="inst-logo-placeholder"><span class="inst-logo-hint">I.S.O PRO<br/><span class="inst-logo-sub">Gestao de Materiais</span></span></div></div>`;
}

export function htmlAssinaturasRecibo(
  atendenteNome: string,
  atendenteMeta: string,
  atendidoNome: string,
  atendidoMeta: string,
): string {
  return `
  <section class="assinaturas" aria-label="Assinaturas">
    <div class="assinatura-box">
      <p class="rotulo-ass">Atendente (operador)</p>
      <div class="espaco-assinatura" aria-hidden="true"></div>
      <div class="linha-ass" aria-hidden="true"></div>
      <div class="bloco-ass-pessoa">
        <p class="ass-nome-principal">${escapeHtmlRecibo(atendenteNome)}</p>
        <p class="ass-meta-linha">${escapeHtmlRecibo(atendenteMeta)}</p>
      </div>
    </div>
    <div class="assinatura-box">
      <p class="rotulo-ass">Atendido (quem retirou)</p>
      <div class="espaco-assinatura" aria-hidden="true"></div>
      <div class="linha-ass" aria-hidden="true"></div>
      <div class="bloco-ass-pessoa">
        <p class="ass-nome-principal">${escapeHtmlRecibo(atendidoNome)}</p>
        <p class="ass-meta-linha">${escapeHtmlRecibo(atendidoMeta)}</p>
      </div>
    </div>
  </section>`;
}

export function htmlLinhaItemRecibo(
  idx: number,
  codigo: string,
  descricao: string,
  unidade: string,
  quantidade: number,
  documentoNumero?: string,
): string {
  const colDoc =
    documentoNumero != null && documentoNumero.trim() !== ''
      ? `<td class="col-doc">${escapeHtmlRecibo(documentoNumero.trim())}</td>`
      : '';
  return `<tr>
          <td class="col-num">${idx + 1}</td>${colDoc}
          <td class="col-codigo">${escapeHtmlRecibo(codigo)}</td>
          <td class="col-desc">${escapeHtmlRecibo(descricao)}</td>
          <td class="col-un">${escapeHtmlRecibo(unidade)}</td>
          <td class="col-qtd">${escapeHtmlRecibo(String(quantidade))}</td>
        </tr>`;
}

export function cssReciboAtendimentoLayout(): string {
  return `
    * { box-sizing: border-box; }
    body.recibo-body { font-family: 'Noto Sans', 'Segoe UI', system-ui, sans-serif; font-size: 11pt; line-height: 1.4; margin: 0; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
    .grid2 p { margin: 4px 0; }
    .inst-logo-placeholder { width: 150px; min-height: 76px; border: 1px dashed #cbd5e1; border-radius: 10px; display: flex; align-items: center; justify-content: center; text-align: center; padding: 8px; background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%); }
    .inst-logo-hint { font-size: 8.5pt; color: #777; line-height: 1.3; }
    .inst-logo-sub { font-size: 7.5pt; color: #999; }
    .inst-logo-img { max-width: 150px; max-height: 76px; width: auto; height: auto; object-fit: contain; display: block; }

    body.recibo-body { padding: 0; color: #0f172a; }
    @media screen {
      body.recibo-body {
        background: linear-gradient(165deg, #dbeafe 0%, #e8eef5 40%, #f1f5f9 100%);
        min-height: 100vh;
        padding: 20px 14px 48px;
      }
      .recibo-sheet {
        max-width: 880px;
        margin: 0 auto;
        background: #ffffff;
        border-radius: 14px;
        box-shadow: 0 12px 40px rgba(15, 23, 42, 0.12), 0 2px 8px rgba(15, 23, 42, 0.06);
        padding: 28px 32px 36px;
        border: 1px solid rgba(148, 163, 184, 0.45);
      }
    }
    @page {
      size: A4 portrait;
      margin: 10mm 12mm 11mm;
    }
    @media print {
      body.recibo-body { background: #fff !important; padding: 0 !important; }
      .recibo-sheet {
        box-shadow: none !important;
        border: none !important;
        border-radius: 0 !important;
        max-width: none !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      .recibo-topbar {
        margin-bottom: 8px !important;
        padding: 6px 10px !important;
        font-size: 8.5pt !important;
      }
      .recibo-header-main {
        margin-bottom: 10px !important;
        padding-bottom: 10px !important;
        gap: 10px !important;
      }
      .recibo-header-main--titulo-centro {
        position: relative !important;
        display: block !important;
        min-height: 48px !important;
      }
      .recibo-header-main--titulo-centro .recibo-logo-wrap {
        position: relative !important;
        z-index: 2 !important;
        display: inline-block !important;
      }
      .recibo-header-main--titulo-centro .recibo-titulo-centro {
        position: absolute !important;
        left: 0 !important;
        right: 0 !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        width: 100% !important;
        text-align: center !important;
        z-index: 1 !important;
      }
      .recibo-header-main--titulo-centro .recibo-titulo-centro h1 {
        font-size: 13pt !important;
        text-align: center !important;
        display: inline-block !important;
        max-width: 72% !important;
      }
      .recibo-header-main--titulo-centro .recibo-titulo-centro h1::after {
        margin-top: 6px !important;
        margin-left: auto !important;
        margin-right: auto !important;
        height: 2px !important;
        width: 48px !important;
      }
      .recibo-subtitulo-consolidado {
        font-size: 9pt !important;
        margin-top: 4px !important;
      }
      .recibo-logo-wrap .inst-logo-img {
        max-height: 44px !important;
        max-width: 112px !important;
        padding: 4px !important;
      }
      .recibo-bloco-info {
        padding: 10px 12px !important;
        margin-bottom: 8px !important;
      }
      .recibo-bloco-info .grid2 p,
      .recibo-doc-desc,
      .recibo-grid-externo p {
        font-size: 9pt !important;
        margin: 3px 0 !important;
      }
      .recibo-bloco-info .recibo-doc-desc {
        margin-top: 8px !important;
        padding-top: 8px !important;
      }
      .recibo-tipo-badge {
        margin: 0 0 8px !important;
        padding: 6px 10px !important;
        font-size: 8.5pt !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .recibo-bloco-tipo--externa {
        padding: 8px 12px !important;
        margin-bottom: 8px !important;
      }
      .bloco h2 { margin-bottom: 6px !important; font-size: 7.5pt !important; }
      .recibo-bloco-itens { margin-bottom: 8px !important; }
      .recibo-bloco-itens h2 { margin-bottom: 6px !important; }
      .recibo-tabela-wrap { margin-top: 4px !important; }
      .recibo-tabela-itens { font-size: 9pt !important; }
      .recibo-tabela-itens th,
      .recibo-tabela-itens td {
        padding: 5px 10px !important;
      }
      .recibo-tabela-itens thead th {
        padding: 6px 10px !important;
        font-size: 7.5pt !important;
      }
      .recibo-total-linha {
        margin-top: 8px !important;
        padding: 6px 10px !important;
        font-size: 9.5pt !important;
      }
      .recibo-total-geral {
        margin-top: 10px !important;
        padding: 8px 12px !important;
        font-size: 10pt !important;
      }
      .recibo-rodape-fin {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .recibo-fechamento {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .assinaturas {
        margin-top: 10px !important;
        gap: 18px !important;
      }
      .assinatura-box {
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        text-align: center !important;
      }
      .linha-ass {
        margin: 0 0 6px !important;
        width: 88% !important;
        max-width: 280px !important;
      }
      .espaco-assinatura {
        width: 88% !important;
        max-width: 280px !important;
        min-height: 36px !important;
      }
      .rotulo-ass { margin: 0 0 2px !important; font-size: 8pt !important; text-align: center !important; width: 100%; }
      .ass-nome-principal { font-size: 10pt !important; margin: 0 0 2px !important; text-align: center !important; width: 100%; }
      .ass-meta-linha { font-size: 8.5pt !important; text-align: center !important; width: 100%; }
      .bloco-ass-pessoa {
        margin: 0 !important;
        width: 88% !important;
        max-width: 280px !important;
        text-align: center !important;
      }
      body.recibo-body--denso .recibo-tabela-itens { font-size: 8.25pt !important; }
      body.recibo-body--denso .recibo-tabela-itens th,
      body.recibo-body--denso .recibo-tabela-itens td {
        padding: 3px 8px !important;
      }
      body.recibo-body--denso .recibo-tabela-itens .col-desc { line-height: 1.28 !important; }
      body.recibo-body--denso .recibo-tabela-itens thead th { font-size: 7pt !important; padding: 4px 8px !important; }
      .recibo-doc-foot {
        margin-top: 8px !important;
        padding-top: 6px !important;
        font-size: 7pt !important;
      }
      .recibo-bloco-itens tbody tr:nth-child(even) { background: transparent !important; }
      .recibo-tabela-itens tbody tr:nth-child(even) { background: #f8fafc !important; }
      .recibo-total-linha,
      .recibo-total-geral,
      .recibo-bloco-info,
      .recibo-tipo-badge,
      .recibo-bloco-tipo--externa {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .recibo-secao-doc h2,
      .recibo-secao-meta,
      .recibo-secao-doc .recibo-total-linha {
        page-break-after: avoid;
      }
      .recibo-bloco-itens thead { display: table-header-group; }
      .recibo-tabela-itens tr { page-break-inside: avoid; }
    }
    .recibo-topbar.inst-topbar {
      margin-bottom: 22px;
      padding: 11px 16px;
      background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
      border-radius: 10px;
      border: 1px solid #e2e8f0;
      font-size: 9.5pt;
      color: #64748b;
    }
    .recibo-topbar.inst-topbar span:last-child { color: #0f172a; font-weight: 600; }
    .recibo-logo-wrap .inst-logo-img {
      border-radius: 10px;
      padding: 10px;
      background: #fafafa;
      border: 1px solid #e2e8f0;
      box-sizing: content-box;
    }
    .recibo-logo-wrap .inst-logo-placeholder {
      border-radius: 10px;
      border-color: #cbd5e1;
      background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
    }
    .recibo-header-main {
      display: flex;
      gap: 22px;
      align-items: flex-start;
      margin-bottom: 22px;
      padding-bottom: 20px;
      border-bottom: 1px solid #e2e8f0;
    }
    .recibo-header-main--titulo-centro {
      position: relative;
      display: block;
      min-height: 56px;
    }
    .recibo-header-main--titulo-centro .recibo-logo-wrap {
      position: relative;
      z-index: 2;
      display: inline-block;
      vertical-align: middle;
    }
    .recibo-header-main--titulo-centro .recibo-titulo-centro {
      position: absolute;
      left: 0;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 100%;
      text-align: center;
      pointer-events: none;
      z-index: 1;
    }
    .recibo-header-main--titulo-centro .recibo-titulo-centro h1 {
      display: inline-block;
      text-align: center;
      max-width: 72%;
    }
    .recibo-header-main--titulo-centro .recibo-titulo-centro h1::after {
      margin-left: auto;
      margin-right: auto;
    }
    .recibo-subtitulo-consolidado {
      margin: 8px 0 0;
      font-size: 11pt;
      color: #475569;
      text-align: center;
    }
    .recibo-header-main .inst-title-col h1,
    .recibo-header-main .recibo-titulo-centro h1 {
      font-size: 1.45rem;
      font-weight: 700;
      letter-spacing: -0.025em;
      color: #0f172a;
      margin: 0;
      padding: 0;
      border-bottom: none;
      line-height: 1.25;
    }
    .recibo-header-main .inst-title-col h1::after,
    .recibo-header-main .recibo-titulo-centro h1::after {
      content: '';
      display: block;
      margin-top: 12px;
      height: 3px;
      width: 64px;
      background: linear-gradient(90deg, #0d9488, #2dd4bf);
      border-radius: 2px;
    }
    .recibo-bloco-info {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 16px 18px;
      margin-bottom: 18px;
    }
    .recibo-bloco-info .grid2 p { margin: 6px 0; font-size: 10.5pt; }
    .recibo-bloco-info .grid2 strong { color: #475569; font-weight: 600; }
    .recibo-doc-desc { margin: 10px 0 12px; font-size: 10.5pt; line-height: 1.45; color: #334155; }
    .recibo-bloco-info .recibo-doc-desc {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px dashed #cbd5e1;
    }
    .recibo-tipo-badge {
      margin: 0 0 16px;
      padding: 10px 14px;
      font-size: 10pt;
      line-height: 1.45;
      color: #334155;
      background: linear-gradient(90deg, #f0fdfa 0%, #f8fafc 100%);
      border: 1px solid #99f6e4;
      border-left: 4px solid #0d9488;
      border-radius: 8px;
    }
    .recibo-tipo-badge strong { color: #0f766e; font-weight: 700; }
    .recibo-bloco-tipo--externa {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 14px 18px 16px;
      margin-bottom: 18px;
    }
    .recibo-grid-externo p { margin: 6px 0; font-size: 10.5pt; color: #334155; }
    .bloco h2 {
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #64748b;
      margin: 0 0 10px;
    }
    .bloco:not(.recibo-bloco-itens) { margin-bottom: 18px; }
    .bloco:not(.recibo-bloco-itens) p { color: #334155; line-height: 1.5; }
    .recibo-tabela-wrap {
      margin-top: 10px;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      overflow: hidden;
      background: #fff;
    }
    .recibo-tabela-itens {
      width: 100%;
      border-collapse: collapse;
      border: none !important;
      font-size: 10pt;
      margin-top: 0 !important;
    }
    .recibo-tabela-itens th,
    .recibo-tabela-itens td {
      border: none !important;
      padding: 10px 12px;
      text-align: left;
      vertical-align: top;
    }
    .recibo-tabela-itens thead th {
      background: linear-gradient(180deg, #f0fdfa 0%, #ecfdf5 100%) !important;
      border-bottom: 2px solid #0d9488 !important;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #0f766e !important;
      padding: 9px 12px;
    }
    .recibo-tabela-itens tbody td {
      border-bottom: 1px solid #eef2f6 !important;
      color: #334155;
    }
    .recibo-tabela-itens tbody tr:last-child td { border-bottom: none !important; }
    .recibo-tabela-itens tbody tr:nth-child(even) { background: #f8fafc; }
    .recibo-tabela-itens tbody tr:hover { background: #f0fdfa; }
    .recibo-tabela-itens .col-num {
      width: 32px;
      text-align: center;
      color: #94a3b8;
      font-size: 9pt;
      font-variant-numeric: tabular-nums;
    }
    .recibo-tabela-itens .col-doc {
      width: 14%;
      font-size: 8pt;
      color: #475569;
      word-break: break-all;
      line-height: 1.25;
    }
    .recibo-tabela-itens .col-codigo {
      width: 18%;
      font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
      font-size: 8.5pt;
      color: #475569;
      word-break: break-all;
    }
    .recibo-tabela-itens .col-desc {
      color: #0f172a;
      line-height: 1.38;
    }
    .recibo-tabela-itens .col-un {
      width: 44px;
      text-align: center;
      color: #64748b;
      font-size: 9pt;
      white-space: nowrap;
    }
    .recibo-tabela-itens .col-qtd {
      width: 52px;
      text-align: right;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: #0d9488;
      white-space: nowrap;
    }
    .recibo-tabela-itens thead .col-qtd { text-align: right; }
    .recibo-tabela-itens thead .col-num,
    .recibo-tabela-itens thead .col-un { text-align: center; }
    .recibo-total-linha {
      margin-top: 14px;
      padding: 10px 14px;
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      border-radius: 8px;
      font-size: 10.5pt;
      color: #065f46;
      text-align: right;
    }
    .recibo-total-geral {
      margin-top: 20px;
      padding: 14px 16px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 10px;
      text-align: right;
      font-size: 11.5pt;
      color: #1e3a8a;
      page-break-inside: avoid;
    }
    .recibo-secao-doc {
      margin-top: 22px;
      padding-top: 18px;
      border-top: 2px solid #e2e8f0;
    }
    .recibo-secao-doc:first-of-type {
      border-top: none;
      padding-top: 0;
      margin-top: 0;
    }
    .recibo-secao-doc h2 {
      font-size: 11pt;
      letter-spacing: normal;
      text-transform: none;
      color: #0f172a;
      margin: 0 0 8px;
    }
    .recibo-secao-meta {
      font-size: 10pt;
      color: #475569;
      margin: 0 0 10px;
      line-height: 1.45;
    }
    .assinaturas {
      margin-top: 22px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 28px;
    }
    .assinatura-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .rotulo-ass {
      font-weight: 700;
      font-size: 9pt;
      color: #475569;
      margin: 0 0 4px;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      width: 100%;
      text-align: center;
    }
    .espaco-assinatura {
      width: 88%;
      max-width: 280px;
      min-height: 48px;
      flex-shrink: 0;
    }
    .bloco-ass-pessoa {
      margin: 0;
      width: 88%;
      max-width: 280px;
      text-align: center;
    }
    .ass-nome-principal {
      font-size: 11pt;
      font-weight: 650;
      color: #0f172a;
      margin: 0 0 3px;
      line-height: 1.28;
      text-align: center;
      width: 100%;
    }
    .ass-meta-linha {
      font-size: 9.25pt;
      color: #64748b;
      margin: 0;
      line-height: 1.45;
      text-align: center;
      width: 100%;
    }
    .linha-ass {
      border-top: 1px solid #0f172a;
      margin: 0 0 8px;
      width: 88%;
      max-width: 280px;
      min-height: 1px;
    }
    .recibo-fechamento {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    body.recibo-body--denso .recibo-tabela-itens .col-desc { line-height: 1.28; font-size: 8.5pt; }
    body.recibo-body--denso .recibo-tabela-itens th,
    body.recibo-body--denso .recibo-tabela-itens td { padding: 6px 10px; }
    .recibo-doc-foot {
      margin-top: 16px;
      padding-top: 10px;
      border-top: 1px solid #cbd5e1;
      font-size: 8pt;
      color: #64748b;
      line-height: 1.45;
      text-align: center;
    }
  `;
}
