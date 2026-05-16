import type { Colaborador } from 'iso-pro-shared';

import { getMobileSessionCache } from './mobileAuth';

export function getAtendenteRegisto(colaboradores?: Colaborador[] | null): {
  nome: string;
  matricula: string;
  funcao: string;
} {
  const session = getMobileSessionCache();
  if (!session) {
    return { nome: 'Utilizador app', matricula: '-', funcao: '—' };
  }

  const nome = (session.nome || session.login).trim() || 'Utilizador app';
  const matricula = (session.login || '-').trim() || '-';
  let funcao = (session.perfil || '').trim();

  const lista = colaboradores?.length ? colaboradores : [];
  if (lista.length) {
    const matNorm = matricula.replace(/\s/g, '');
    const porMat =
      matNorm && matNorm !== '-'
        ? lista.find((c) => String(c.matricula ?? '').trim().replace(/\s/g, '') === matNorm)
        : undefined;
    const porNome = lista.find((c) => (c.nome || '').trim().toLowerCase() === nome.toLowerCase());
    const match = porMat ?? porNome;
    const f = String(match?.funcao ?? '').trim();
    if (f) funcao = f;
  }

  return {
    nome,
    matricula,
    funcao: funcao || '—',
  };
}
