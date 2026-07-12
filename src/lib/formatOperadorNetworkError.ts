type Contexto = 'carregar' | 'sincronizar' | 'geral';

function isNetworkFailureMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('network request failed') ||
    m.includes('failed to fetch') ||
    m.includes('network error') ||
    m.includes('timeout') ||
    m.includes('timed out') ||
    m.includes('abort') ||
    m.includes('internet') ||
    m.includes('offline') ||
    m.includes('enotfound') ||
    m.includes('econnrefused') ||
    m.includes('socket')
  );
}

/**
 * Mensagem curta para o operador de campo — evita expor `TypeError: Network request failed`.
 */
export function formatOperadorNetworkError(
  error: unknown,
  opts?: { contexto?: Contexto; tinhaDadosLocais?: boolean },
): string {
  const raw = error instanceof Error ? error.message : String(error ?? 'Erro desconhecido');
  const contexto = opts?.contexto ?? 'geral';
  const tinhaDados = opts?.tinhaDadosLocais === true;

  if (!isNetworkFailureMessage(raw)) {
    return raw.trim() || 'Operação falhou. Tente novamente.';
  }

  if (contexto === 'carregar') {
    return tinhaDados
      ? 'Sem ligação à internet. Os dados já carregados neste telemóvel foram mantidos — tente «Carregar dados da nuvem» quando a rede estabilizar.'
      : 'Sem ligação à internet. Verifique Wi‑Fi ou dados móveis e toque em «Carregar dados da nuvem».';
  }

  if (contexto === 'sincronizar') {
    return 'Sem ligação à internet. A baixa ficou guardada neste telemóvel e será enviada quando houver rede.';
  }

  return 'Sem ligação à internet. Verifique a rede e tente novamente.';
}
