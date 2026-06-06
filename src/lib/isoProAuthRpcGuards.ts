/** Detecção de RPC em falta (sem importar Supabase — seguro para testes unitários). */
export function isIsoProAuthRpcMissing(errorMessage: string): boolean {
  return /iso_pro_autenticar_usuario|could not find the function/i.test(errorMessage);
}
