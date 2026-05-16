import { Linking, Share } from 'react-native';
import { appAlert } from '@/src/lib/appDialog';
import * as Print from 'expo-print';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function abrirWhatsAppComTexto(texto: string): Promise<void> {
  const enc = encodeURIComponent(texto);
  const waDeep = `whatsapp://send?text=${enc}`;
  const waWeb = `https://wa.me/?text=${enc}`;

  // Não usar só canOpenURL: no iOS devolve false sem LSApplicationQueriesSchemes (whatsapp).
  try {
    await Linking.openURL(waDeep);
    return;
  } catch {
    /* tenta wa.me (navegador / app) */
  }
  try {
    await Linking.openURL(waWeb);
  } catch {
    appAlert('WhatsApp', 'Não foi possível abrir o WhatsApp. Use «Compartilhar».');
  }
}

export async function imprimirComprovanteTexto(texto: string): Promise<void> {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><style>
body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:11px;line-height:1.45;padding:14px;color:#111;max-width:100%;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere;-webkit-print-color-adjust:exact;}
</style></head><body>${escapeHtml(texto)}</body></html>`;
  await Print.printAsync({ html });
}

/** Documento HTML completo (já com `<style>` e dados escapados). Preferir em vez de texto para o recibo de sessão. */
export async function imprimirComprovanteHtml(htmlDocument: string): Promise<void> {
  const t = htmlDocument.trim();
  if (!t) return;
  await Print.printAsync({ html: t });
}

export function compartilharTexto(texto: string): void {
  Share.share({ message: texto, title: 'Comprovante I.S.O PRO' }).catch(() => {});
}
