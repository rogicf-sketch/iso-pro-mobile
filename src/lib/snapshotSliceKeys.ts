/** Chaves de leitura/escrita por ecrã — alinhadas ao desktop (`isoProSnapshot.ts`) + mobile. */

export const SNAPSHOT_MOBILE_ATENDIMENTO_READ_KEYS = [
  'documentos',
  'recebimentos',
  'atendimentos',
  'atendimentoHistorico',
  'atendimentoEstornoLog',
  'materiais',
  'estoqueAjustes',
  'colaboradores',
  'configuracoesSistema',
  'atendimentoLotes',
] as const;

/** Boot atendimento: sem documentos[] (carregados por RPC incremental). */
export const SNAPSHOT_MOBILE_ATENDIMENTO_BOOT_KEYS = [
  'recebimentos',
  'atendimentos',
  'atendimentoHistorico',
  'atendimentoEstornoLog',
  'materiais',
  'estoqueAjustes',
  'colaboradores',
  'configuracoesSistema',
  'atendimentoLotes',
] as const;

export const SNAPSHOT_MOBILE_ATENDIMENTO_PATCH_KEYS = [
  'documentos',
  'atendimentoHistorico',
  'atendimentoLotes',
  'dataAtualizacao',
] as const;

export const SNAPSHOT_MOBILE_CONFERENCIA_READ_KEYS = ['materiais', 'colaboradores'] as const;

/** Leitura para gravar patch — inclui recebimentos[] (merge no snapshot). */
export const SNAPSHOT_MOBILE_CONFERENCIA_WRITE_READ_KEYS = [
  'recebimentos',
  'materiais',
  'colaboradores',
] as const;

export const SNAPSHOT_MOBILE_CONFERENCIA_PATCH_KEYS = ['recebimentos', 'dataAtualizacao'] as const;

/**
 * Delta fundido por id no RPC `iso_pro_patch_snapshot`.
 * Sem isto, um patch com `recebimentos: [1 NF]` SUBSTITUI a lista inteira na nuvem
 * (incidente 2026-07-18: 125 → 1).
 */
export const SNAPSHOT_MOBILE_CONFERENCIA_MERGE_KEYS = ['recebimentos'] as const;

/** Consulta: só materiais/colaboradores — docs/recebimentos vêm de RPCs paginadas. */
export const SNAPSHOT_MOBILE_CONSULTA_READ_KEYS = ['materiais', 'colaboradores'] as const;

/** Lista inventário: materiais para scan; inventário completo via RPC read no detalhe. */
export const SNAPSHOT_MOBILE_INVENTARIO_READ_KEYS = ['materiais', 'estoqueAjustes'] as const;

/** Leitura para gravar patch — inclui inventarios[] (fallback sem merge + retry de conflito). */
export const SNAPSHOT_MOBILE_INVENTARIO_WRITE_READ_KEYS = [
  'inventarios',
  'materiais',
  'estoqueAjustes',
] as const;

export const SNAPSHOT_MOBILE_INVENTARIO_PATCH_KEYS = ['inventarios', 'dataAtualizacao'] as const;

/** Delta fundido por id no RPC `iso_pro_patch_snapshot` (não substitui o array inteiro). */
export const SNAPSHOT_MOBILE_INVENTARIO_MERGE_KEYS = ['inventarios'] as const;

/** União para replay offline (merge parcial antes do patch). */
export const SNAPSHOT_MOBILE_OFFLINE_MERGE_READ_KEYS = [
  'documentos',
  'recebimentos',
  'materiais',
  'atendimentoHistorico',
  'atendimentoLotes',
  'inventarios',
] as const;

export const SNAPSHOT_MOBILE_DIAGNOSTICS_READ_KEYS = [
  'documentos',
  'materiais',
  'recebimentos',
  'colaboradores',
] as const;
