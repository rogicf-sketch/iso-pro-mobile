/**
 * Formata quantidade para ecrã: inteiros sem casas decimais (`1` em vez de `1.000`);
 * valores fracionários com até 3 casas, sem zeros à direita (`1,5` depende do separador — aqui usa `.`).
 */
export function formatQuantidadeExibicao(n: number): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return '0';
  const r = Math.round(x * 1000) / 1000;
  const inteiro = Math.round(r);
  if (Math.abs(r - inteiro) < 1e-9) return String(inteiro);
  return r.toFixed(3).replace(/\.?0+$/, '');
}
