import type { IsoSnapshotPayload } from 'iso-pro-shared';

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function historicoEntryKey(entry: Record<string, unknown>): string {
  const id = String(entry.id ?? '').trim();
  if (id) return `id:${id}`;
  const lote = String(entry.loteNumero ?? '').trim();
  const codigo = String(entry.codigo ?? '').trim();
  const data = String(entry.data ?? '').trim();
  return `fallback:${lote}|${codigo}|${data}`;
}

function mergeInventarioItensById(
  cloudItens: Array<Record<string, unknown>>,
  queuedItens: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const byId = new Map<string, Record<string, unknown>>();
  for (const item of cloudItens) {
    const id = String(item.id ?? '').trim();
    if (!id) continue;
    byId.set(id, deepClone(item));
  }
  for (const qItem of queuedItens) {
    const id = String(qItem.id ?? '').trim();
    if (!id) continue;
    const cloud = byId.get(id);
    if (!cloud) {
      byId.set(id, deepClone(qItem));
      continue;
    }
    const qQtd = Number(qItem.quantidadeContada ?? 0);
    const cQtd = Number(cloud.quantidadeContada ?? 0);
    if (Number.isFinite(qQtd) && qQtd > cQtd) {
      cloud.quantidadeContada = qQtd;
    }
    const qLoc = String(qItem.localizacaoContada ?? '').trim();
    if (qLoc && !String(cloud.localizacaoContada ?? '').trim()) {
      cloud.localizacaoContada = qLoc;
    } else if (qLoc && Number.isFinite(qQtd) && qQtd >= cQtd) {
      // Mesma linha: localização acompanha a contagem vencedora.
      cloud.localizacaoContada = qLoc;
    }
  }
  return Array.from(byId.values());
}

function mergeInventarioRecord(
  cloud: Record<string, unknown>,
  queued: Record<string, unknown>,
): Record<string, unknown> {
  const merged = deepClone(cloud);
  const cloudItens = Array.isArray(cloud.itens) ? (cloud.itens as Array<Record<string, unknown>>) : [];
  const queuedItens = Array.isArray(queued.itens) ? (queued.itens as Array<Record<string, unknown>>) : [];
  merged.itens = mergeInventarioItensById(cloudItens, queuedItens);

  const cloudStatus = String(cloud.status ?? '').toLowerCase();
  if (cloudStatus !== 'fechado' && cloudStatus !== 'cancelado' && queued.status != null) {
    merged.status = queued.status;
  }
  for (const key of ['observacoes', 'responsavel', 'descricao', 'contagemMobileHabilitada'] as const) {
    if (queued[key] != null && queued[key] !== '') {
      merged[key] = queued[key];
    }
  }
  return merged;
}

/** Mescla payload offline sobre snapshot fresco antes de enviar à nuvem. */
export function mergeSnapshotForOfflineReplay(
  fresh: IsoSnapshotPayload,
  queuedNext: IsoSnapshotPayload,
): IsoSnapshotPayload {
  const merged = deepClone(fresh);

  const histFresh = (merged.atendimentoHistorico ?? []) as Record<string, unknown>[];
  const histKeys = new Set(histFresh.map(historicoEntryKey));
  for (const h of (queuedNext.atendimentoHistorico ?? []) as Record<string, unknown>[]) {
    const key = historicoEntryKey(h);
    if (!histKeys.has(key)) {
      histFresh.push(deepClone(h));
      histKeys.add(key);
    }
  }
  if (histFresh.length) {
    merged.atendimentoHistorico = histFresh as IsoSnapshotPayload['atendimentoHistorico'];
  }

  if (queuedNext.recebimentos?.length) {
    const byId = new Map(
      (merged.recebimentos ?? []).map((r) => [String((r as { id?: unknown }).id ?? ''), deepClone(r)]),
    );
    for (const rec of queuedNext.recebimentos) {
      const id = String((rec as { id?: unknown }).id ?? '').trim();
      if (!id || !byId.has(id)) continue;
      byId.set(id, deepClone(rec));
    }
    merged.recebimentos = Array.from(byId.values()) as IsoSnapshotPayload['recebimentos'];
  }

  if (queuedNext.documentos?.length && merged.documentos?.length) {
    for (const qDoc of queuedNext.documentos) {
      const docId = String((qDoc as { id?: unknown }).id ?? '').trim();
      const mDoc = merged.documentos!.find((d) => String((d as { id?: unknown }).id ?? '') === docId);
      if (!mDoc?.itens?.length) continue;
      for (const qItem of (qDoc as { itens?: Array<Record<string, unknown>> }).itens ?? []) {
        const itemId = String(qItem.id ?? '').trim();
        const mItem = mDoc.itens.find((it) => String((it as { id?: unknown }).id ?? '') === itemId) as
          | Record<string, unknown>
          | undefined;
        if (!mItem) continue;
        const qAtd = Number(qItem.quantidadeAtendida ?? qItem.quantidade_atendida ?? 0);
        const mAtd = Number(mItem.quantidadeAtendida ?? mItem.quantidade_atendida ?? 0);
        if (Number.isFinite(qAtd) && qAtd > mAtd) {
          mItem.quantidadeAtendida = qAtd;
        }
      }
    }
  }

  // saldoAtual é absoluto (não delta). Em divergência offline×nuvem, manter a nuvem
  // evita apagar movimentos concurrentes do PC/outro aparelho. Deltas reais vão
  // por atendimentoHistorico / movimentos — não por overwrite de saldo.
  if (queuedNext.materiais?.length && merged.materiais?.length) {
    const byCodigo = new Map(
      merged.materiais.map((m) => [
        String((m as { codigo?: unknown }).codigo ?? '')
          .trim()
          .toUpperCase(),
        m as Record<string, unknown>,
      ]),
    );
    for (const qMat of queuedNext.materiais) {
      const codigo = String((qMat as { codigo?: unknown }).codigo ?? '')
        .trim()
        .toUpperCase();
      const mMat = byCodigo.get(codigo);
      if (!mMat) continue;
      const qSaldo = qMat.saldoAtual;
      const mSaldo = mMat.saldoAtual;
      if (qSaldo == null) continue;
      if (mSaldo == null) {
        mMat.saldoAtual = qSaldo;
        continue;
      }
      // Ambos definidos e diferentes → keep cloud (já em merged).
    }
  }

  if (queuedNext.inventarios?.length) {
    const byId = new Map(
      (merged.inventarios ?? []).map((inv) => [
        String((inv as { id?: unknown }).id ?? ''),
        deepClone(inv) as Record<string, unknown>,
      ]),
    );
    for (const inv of queuedNext.inventarios) {
      const id = String((inv as { id?: unknown }).id ?? '').trim();
      if (!id) continue;
      const cloud = byId.get(id);
      if (!cloud) {
        byId.set(id, deepClone(inv) as Record<string, unknown>);
        continue;
      }
      byId.set(id, mergeInventarioRecord(cloud, inv as Record<string, unknown>));
    }
    merged.inventarios = Array.from(byId.values()) as IsoSnapshotPayload['inventarios'];
  }

  merged.dataAtualizacao = new Date().toISOString();
  return merged;
}
