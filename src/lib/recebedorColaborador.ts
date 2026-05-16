import type { Colaborador } from 'iso-pro-shared';

/**
 * Resolve o texto do campo «recebedor» para um colaborador do cadastro (nome exato ou matrícula).
 */
export function resolverRecebedorColaborador(
  texto: string,
  colaboradores: Colaborador[]
): { ok: true; colaborador: Colaborador; nomeOficial: string } | { ok: false; motivo: string } {
  const t = texto.trim();
  if (!t) {
    return { ok: false, motivo: 'Indique quem recebeu ou retirou o material.' };
  }
  if (!colaboradores?.length) {
    return {
      ok: false,
      motivo:
        'Não há colaboradores no cadastro deste snapshot. Cadastre no I.S.O PRO (web), grave na nuvem e carregue de novo.',
    };
  }
  const lower = t.toLowerCase();
  const porNome = colaboradores.find((c) => (c.nome || '').trim().toLowerCase() === lower);
  if (porNome) {
    const nomeOficial = (porNome.nome || '').trim() || String(porNome.matricula ?? '');
    return { ok: true, colaborador: porNome, nomeOficial };
  }
  const matNorm = t.replace(/\s/g, '');
  const porMat = colaboradores.find(
    (c) => String(c.matricula ?? '').trim().replace(/\s/g, '') === matNorm && matNorm.length > 0
  );
  if (porMat) {
    const nomeOficial = (porMat.nome || '').trim() || String(porMat.matricula ?? '');
    return { ok: true, colaborador: porMat, nomeOficial };
  }
  return {
    ok: false,
    motivo:
      'Este nome não está no cadastro de colaboradores. Toque numa sugestão da lista ou use o nome exatamente como no I.S.O PRO.',
  };
}
