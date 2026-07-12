import { getActiveTenantId } from './isoProTenant';
import { getSupabase } from './supabase';

function isRpcMissingError(message: string): boolean {
  return /function .* does not exist|PGRST202|404|could not find the function/i.test(message);
}

/** Drena a outbox servidor (snapshot → tabelas de escala) após patch. */
export async function flushEscalaOutboxBestEffort(maxJobs = 5): Promise<void> {
  try {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.rpc('iso_pro_flush_escala_outbox', {
      p_tenant_id: getActiveTenantId(),
      p_max: maxJobs,
    });
    if (error && !isRpcMissingError(error.message)) {
      console.warn('[escala-outbox] flush:', error.message);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!isRpcMissingError(message)) {
      console.warn('[escala-outbox] flush:', message);
    }
  }
}
