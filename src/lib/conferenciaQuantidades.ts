import type { RecebimentoItem } from 'iso-pro-shared';

/** Quantidade na NF / recebida (linha do snapshot). */
export function parseQuantidadeNf(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  const n = Number(String(val ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function quantidadeConferidaCampoVazio(qc: unknown): boolean {
  return (
    qc === undefined ||
    qc === null ||
    (typeof qc === 'string' && qc.trim() === '')
  );
}

/**
 * Na finalização, campo vazio vira igual à qtd da NF — para alertas usamos esse efeito.
 */
export function quantidadeConferidaEfetivaAposFinalizar(it: RecebimentoItem): { qRec: number; qc: number } {
  const qRec = parseQuantidadeNf(it.quantidade);
  const qcRaw = it.quantidadeConferida;
  if (quantidadeConferidaCampoVazio(qcRaw)) {
    return { qRec, qc: qRec };
  }
  return { qRec, qc: parseQuantidadeNf(qcRaw) };
}

/** Linha com qtd explícita inferior à NF (campo vazio não conta — será preenchido na finalização). */
export function linhaComDivergenciaVisual(it: RecebimentoItem): boolean {
  const qRec = parseQuantidadeNf(it.quantidade);
  if (qRec <= 0) return false;
  if (quantidadeConferidaCampoVazio(it.quantidadeConferida)) return false;
  const qc = parseQuantidadeNf(it.quantidadeConferida);
  return qc < qRec;
}

export type ResumoDivergenciasConferencia = {
  tem: boolean;
  naoRecebidos: number;
  parciais: number;
  total: number;
  linhas: { codigo: string; tipo: 'nao_recebido' | 'parcial' }[];
};

/** Situação depois de aplicar a regra “vazio = NF” na finalização. */
export function analisarDivergenciasAposFinalizar(rec: { itens?: RecebimentoItem[] | null }): ResumoDivergenciasConferencia {
  const linhas: ResumoDivergenciasConferencia['linhas'] = [];
  let naoRecebidos = 0;
  let parciais = 0;
  for (const it of rec.itens || []) {
    if (!it) continue;
    const { qRec, qc } = quantidadeConferidaEfetivaAposFinalizar(it);
    if (qRec <= 0) continue;
    if (qc >= qRec) continue;
    if (qc <= 0) {
      naoRecebidos += 1;
      linhas.push({ codigo: String(it.codigo ?? '—'), tipo: 'nao_recebido' });
    } else {
      parciais += 1;
      linhas.push({ codigo: String(it.codigo ?? '—'), tipo: 'parcial' });
    }
  }
  const total = naoRecebidos + parciais;
  return { tem: total > 0, naoRecebidos, parciais, total, linhas };
}

export function mensagemResumoDivergencias(r: ResumoDivergenciasConferencia, maxCodigos = 8): string {
  const partes: string[] = [];
  if (r.naoRecebidos > 0) {
    partes.push(`${r.naoRecebidos} item(ns) com quantidade conferida zero (não recebido na prática)`);
  }
  if (r.parciais > 0) {
    partes.push(`${r.parciais} item(ns) com conferência parcial (menos que a NF)`);
  }
  const amostra = r.linhas
    .slice(0, maxCodigos)
    .map((l) => `${l.codigo} (${l.tipo === 'nao_recebido' ? 'não recebido' : 'parcial'})`)
    .join(', ');
  const resto = r.linhas.length > maxCodigos ? ` … +${r.linhas.length - maxCodigos}` : '';
  return `${partes.join(' · ')}\n\nCódigos: ${amostra}${resto}`;
}
