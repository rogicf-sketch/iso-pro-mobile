import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { appAlert } from '@/src/lib/appDialog';
import { buildInventarioStyles } from '@/src/theme/buildInventarioStyles';
import { useMobileUiPreferences } from '@/src/theme/MobileUiPreferencesContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { commitDefaultSnapshotWrite, fetchDefaultSnapshot } from '@/src/lib/snapshot';
import { useSnapshotRefreshOnAppActive } from '@/src/lib/useSnapshotRefreshOnAppActive';
import { hasSupabaseConfig } from '@/src/lib/config';
import { formatarDataHoraLocal } from '@/src/lib/formatData';
import { formatQuantidadeExibicao } from '@/src/lib/formatQuantidade';
import {
  inventarioLocalDifereDoSnapshot,
  mergeQuantidadesContadasEmInventario,
} from '@/src/lib/inventarioEstado';
import {
  lerRascunhoInventario,
  limparRascunhoInventario,
  salvarRascunhoInventario,
} from '@/src/lib/inventarioRascunhoStorage';
import { registerInventarioSessaoGate } from '@/src/lib/inventarioSessaoGate';
import { useDebouncedEffect } from '@/src/lib/useDebouncedEffect';
import type { InventarioItemSnapshot, InventarioSnapshot, IsoSnapshotPayload } from 'iso-pro-shared';

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function normalizeInventarioItem(raw: unknown, index: number): InventarioItemSnapshot {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const saldoRaw = o.saldoSistema;
  let saldoSistema: number | undefined;
  if (typeof saldoRaw === 'number' && Number.isFinite(saldoRaw)) saldoSistema = saldoRaw;
  else if (saldoRaw != null) {
    const n = Number(String(saldoRaw).replace(',', '.'));
    if (Number.isFinite(n)) saldoSistema = n;
  }
  const qc = o.quantidadeContada;
  let quantidadeContada: number | undefined;
  if (typeof qc === 'number' && Number.isFinite(qc)) quantidadeContada = qc;
  else if (qc != null && String(qc).trim() !== '') {
    const n = Number(String(qc).replace(',', '.'));
    if (Number.isFinite(n)) quantidadeContada = n;
  }
  return {
    id: String(o.id ?? `item-${index}`),
    codigoMaterial: o.codigoMaterial != null ? String(o.codigoMaterial) : undefined,
    descricaoMaterial: o.descricaoMaterial != null ? String(o.descricaoMaterial) : undefined,
    unidade: o.unidade != null ? String(o.unidade) : undefined,
    saldoSistema,
    quantidadeContada,
  };
}

function mergeLinesPreserveLocal(
  prev: Record<string, string>,
  inv: InventarioSnapshot,
): Record<string, string> {
  const next: Record<string, string> = {};
  (inv.itens ?? []).forEach((it, i) => {
    const kid = String(it.id ?? `item-${i}`);
    if (Object.prototype.hasOwnProperty.call(prev, kid)) {
      next[kid] = prev[kid];
    } else {
      const qc = it.quantidadeContada as number | string | undefined | null;
      if (qc === undefined || qc === null) {
        next[kid] = '';
      } else if (typeof qc === 'string' && qc.trim() === '') {
        next[kid] = '';
      } else {
        const n = typeof qc === 'number' ? qc : Number(String(qc).replace(',', '.'));
        if (Number.isFinite(n) && n === 0) next[kid] = '';
        else next[kid] = String(qc);
      }
    }
  });
  return next;
}

function qtdTextoInicialDoServidor(inv: InventarioSnapshot): Record<string, string> {
  return mergeLinesPreserveLocal({}, inv);
}

export default function InventarioDetalheScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = idParam ? decodeURIComponent(String(idParam)) : '';
  const navigation = useNavigation();
  const router = useRouter();
  const { colors } = useTheme();
  const { mostrarTextosAjudaModulos } = useMobileUiPreferences();
  const styles = useMemo(() => buildInventarioStyles(colors), [colors]);
  const configured = useMemo(() => hasSupabaseConfig(), []);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [nuvemAt, setNuvemAt] = useState<string | null>(null);
  const [payload, setPayload] = useState<IsoSnapshotPayload | null>(null);
  const [qtdTextoPorItemId, setQtdTextoPorItemId] = useState<Record<string, string>>({});

  const firstLoadParaIdRef = useRef<string | null>(null);

  const serverInv = useMemo((): InventarioSnapshot | null => {
    if (!payload?.inventarios?.length || !id) return null;
    const raw = payload.inventarios.find((inv) => String(inv.id) === String(id));
    if (!raw) return null;
    const itens = Array.isArray(raw.itens) ? raw.itens.map((it, i) => normalizeInventarioItem(it, i)) : [];
    return { ...raw, itens };
  }, [payload, id]);

  const validoParaContagem = useMemo(() => {
    if (!serverInv) return false;
    return String(serverInv.status ?? '') === 'aberto' && Boolean(serverInv.contagemMobileHabilitada);
  }, [serverInv]);

  const localInventario = useMemo(() => {
    if (!serverInv) return null;
    return mergeQuantidadesContadasEmInventario(serverInv, qtdTextoPorItemId);
  }, [serverInv, qtdTextoPorItemId]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: serverInv?.codigo ? String(serverInv.codigo) : 'Contagem',
    });
  }, [navigation, serverInv?.codigo]);

  const carregarNuvem = useCallback(async () => {
    setLoadErr(null);
    setLoading(true);
    try {
      const { payload: p, updatedAt, error } = await fetchDefaultSnapshot();
      if (error) {
        setLoadErr(error);
        setPayload(null);
        return;
      }
      const next = p ? deepClone(p) : null;
      setPayload(next);
      setNuvemAt(updatedAt);

      if (!next?.inventarios?.length || !id) {
        return;
      }
      const raw = next.inventarios.find((inv) => String(inv.id) === String(id));
      if (!raw) return;
      const invNorm: InventarioSnapshot = {
        ...raw,
        itens: Array.isArray(raw.itens) ? raw.itens.map((it, i) => normalizeInventarioItem(it, i)) : [],
      };
      const primeiraVezEsteId = firstLoadParaIdRef.current !== id;
      if (primeiraVezEsteId) {
        firstLoadParaIdRef.current = id;
        let base = qtdTextoInicialDoServidor(invNorm);
        const draft = await lerRascunhoInventario(id);
        if (draft?.qtdTextoPorItemId) {
          const validK = new Set((invNorm.itens ?? []).map((it, i) => String(it.id ?? `item-${i}`)));
          for (const [k, v] of Object.entries(draft.qtdTextoPorItemId)) {
            if (validK.has(k)) base[k] = v;
          }
        }
        setQtdTextoPorItemId(base);
      } else {
        setQtdTextoPorItemId((prev) => mergeLinesPreserveLocal(prev, invNorm));
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void carregarNuvem();
    }, [carregarNuvem]),
  );

  useSnapshotRefreshOnAppActive(carregarNuvem);

  useLayoutEffect(() => {
    firstLoadParaIdRef.current = null;
  }, [id]);

  const persistirRascunhoDispositivo = useCallback(async () => {
    if (!serverInv || !validoParaContagem || !id) return;
    await salvarRascunhoInventario({
      inventarioId: id,
      qtdTextoPorItemId: { ...qtdTextoPorItemId },
      updatedAt: new Date().toISOString(),
    });
  }, [serverInv, validoParaContagem, id, qtdTextoPorItemId]);

  const guardarNaNuvem = useCallback(
    async (opts?: { silentSuccess?: boolean }): Promise<boolean> => {
      if (!serverInv || !payload || !localInventario || !validoParaContagem) {
        appAlert('Indisponível', 'Este inventário não está aberto para contagem no mobile ou não foi encontrado.');
        return false;
      }
      setSaving(true);
      try {
        const result = await commitDefaultSnapshotWrite(async () => {
          const { payload: fresh, updatedAt, error } = await fetchDefaultSnapshot();
          if (error) {
            throw new Error(error);
          }
          if (!fresh?.inventarios?.length) {
            throw new Error('Não foi possível localizar o inventário no pacote.');
          }
          const nextPayload = deepClone(fresh);
          const idx = nextPayload.inventarios!.findIndex((inv) => String(inv.id) === String(id));
          if (idx === -1) {
            throw new Error('Não foi possível localizar o inventário no pacote.');
          }
          nextPayload.inventarios![idx] = deepClone(localInventario);
          nextPayload.dataAtualizacao = new Date().toISOString();
          return { nextPayload, baselineUpdatedAt: updatedAt };
        });
        if (result.error) {
          appAlert(result.conflict ? 'Conflito de dados' : 'Supabase', result.error);
          if (result.conflict) {
            void carregarNuvem();
          }
          return false;
        }
        const nextPayload = deepClone(payload);
        const idx = nextPayload.inventarios?.findIndex((inv) => String(inv.id) === String(id)) ?? -1;
        if (idx !== -1 && nextPayload.inventarios) {
          nextPayload.inventarios[idx] = deepClone(localInventario);
          nextPayload.dataAtualizacao = new Date().toISOString();
          setPayload(nextPayload);
        }
        if (result.updatedAt) {
          setNuvemAt(result.updatedAt);
        }
        await limparRascunhoInventario(id);
        if (!opts?.silentSuccess) {
          appAlert('Guardado', 'Quantidades contadas gravadas na nuvem.');
        }
        return true;
      } finally {
        setSaving(false);
      }
    },
    [carregarNuvem, serverInv, payload, localInventario, validoParaContagem, id],
  );

  useDebouncedEffect(
    () => {
      if (!serverInv || !validoParaContagem || !id) return;
      void salvarRascunhoInventario({
        inventarioId: id,
        qtdTextoPorItemId: { ...qtdTextoPorItemId },
        updatedAt: new Date().toISOString(),
      });
    },
    [serverInv, validoParaContagem, id, qtdTextoPorItemId],
    750,
  );

  useEffect(() => {
    registerInventarioSessaoGate({
      temAlteracoesNaoGuardadasNaNuvem: () =>
        Boolean(serverInv && payload && localInventario && inventarioLocalDifereDoSnapshot(localInventario, payload)),
      guardarNaNuvem: () => guardarNaNuvem({ silentSuccess: true }),
      persistirRascunhoDispositivo,
    });
    return () => registerInventarioSessaoGate(null);
  }, [serverInv, payload, localInventario, guardarNaNuvem, persistirRascunhoDispositivo]);

  /** Header back, gesto iOS e botão físico Android — mesmo alerta que o separador (gate). */
  useEffect(() => {
    const MSG =
      'Há quantidades contadas que ainda não foram guardadas na nuvem com «Guardar na nuvem». Um rascunho é guardado neste telemóvel automaticamente; pode continuar depois.\n\nO que deseja fazer?';

    const sub = navigation.addListener('beforeRemove', (e) => {
      if (!serverInv || !payload || !localInventario) return;
      if (!inventarioLocalDifereDoSnapshot(localInventario, payload)) return;
      e.preventDefault();
      const action = e.data?.action;
      if (!action) return;
      appAlert('Contagem incompleta', MSG, [
        { text: 'Continuar a contar', style: 'cancel' },
        {
          text: 'Guardar na nuvem e sair',
          onPress: () => {
            void (async () => {
              const ok = await guardarNaNuvem({ silentSuccess: true });
              if (ok) navigation.dispatch(action);
            })();
          },
        },
        {
          text: 'Sair sem gravar na nuvem',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await persistirRascunhoDispositivo();
              navigation.dispatch(action);
            })();
          },
        },
      ]);
    });
    return sub;
  }, [navigation, serverInv, payload, localInventario, guardarNaNuvem, persistirRascunhoDispositivo]);

  const atualizarItem = useCallback((itemId: string, texto: string) => {
    setQtdTextoPorItemId((prev) => ({ ...prev, [itemId]: texto }));
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: InventarioItemSnapshot; index: number }) => {
      const kid = String(item.id ?? `item-${index}`);
      const saldo = item.saldoSistema;
      const saldoTxt =
        typeof saldo === 'number' && Number.isFinite(saldo) ? formatQuantidadeExibicao(saldo) : '—';
      return (
        <View style={styles.itemCard}>
          <Text style={styles.itemCodigo}>{String(item.codigoMaterial ?? '—')}</Text>
          <Text style={styles.itemDesc}>{String(item.descricaoMaterial ?? '—')}</Text>
          <View style={styles.itemRow}>
            <Text style={styles.itemLabel}>Saldo sistema</Text>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
              {saldoTxt} {item.unidade ? String(item.unidade) : ''}
            </Text>
          </View>
          <View style={styles.itemRow}>
            <Text style={styles.itemLabel}>Qtd contada</Text>
            <TextInput
              editable={validoParaContagem && !saving}
              keyboardType="decimal-pad"
              onChangeText={(t) => atualizarItem(kid, t)}
              placeholder="—"
              placeholderTextColor={colors.textMuted}
              style={styles.qtdInput}
              value={qtdTextoPorItemId[kid] ?? ''}
            />
          </View>
        </View>
      );
    },
    [atualizarItem, colors.text, colors.textMuted, qtdTextoPorItemId, saving, styles, validoParaContagem],
  );

  if (!configured) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Inventário</Text>
        <Text style={styles.hint}>
          Cria um ficheiro `.env` na raiz do projeto com EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY. Reinicia o Expo depois de alterar o `.env`.
        </Text>
      </View>
    );
  }

  if (!id) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>Identificador do inventário em falta.</Text>
        <Pressable onPress={() => router.back()} style={styles.btn}>
          <Text style={styles.btnText}>Voltar</Text>
        </Pressable>
      </View>
    );
  }

  if (loadErr) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>{loadErr}</Text>
        <Pressable onPress={() => void carregarNuvem()} style={styles.btn}>
          <Text style={styles.btnText}>Tentar outra vez</Text>
        </Pressable>
      </View>
    );
  }

  if (loading && !payload) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!serverInv) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>Inventário não encontrado no snapshot. Atualize a lista no PC ou puxe para atualizar.</Text>
        <Pressable onPress={() => void carregarNuvem()} style={styles.btn}>
          <Text style={styles.btnText}>Atualizar</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={styles.btnSecondary}>
          <Text style={styles.btnSecondaryText}>Voltar</Text>
        </Pressable>
      </View>
    );
  }

  if (!validoParaContagem) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>
          Este inventário não está disponível para contagem no app (fechado ou sem «contagem pelo mobile» no PC).
        </Text>
        <Pressable onPress={() => router.back()} style={styles.btn}>
          <Text style={styles.btnText}>Voltar</Text>
        </Pressable>
      </View>
    );
  }

  const itens = serverInv.itens ?? [];
  const dirty = Boolean(payload && localInventario && inventarioLocalDifereDoSnapshot(localInventario, payload));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        contentContainerStyle={[styles.container, { paddingBottom: 32 }]}
        data={itens}
        keyExtractor={(it, i) => String(it.id ?? i)}
        ListFooterComponent={
          <>
            <Pressable
              disabled={saving || !dirty}
              onPress={() => void guardarNaNuvem()}
              style={[styles.btn, (saving || !dirty) && { opacity: 0.55 }]}
            >
              <Text style={styles.btnText}>{saving ? 'A guardar…' : 'Guardar na nuvem'}</Text>
            </Pressable>
            <Pressable disabled={loading} onPress={() => void carregarNuvem()} style={styles.btnSecondary}>
              <Text style={styles.btnSecondaryText}>{loading ? 'A atualizar…' : 'Atualizar do servidor'}</Text>
            </Pressable>
          </>
        }
        ListHeaderComponent={
          <>
            {nuvemAt ? (
              <Text style={styles.meta}>Snapshot nuvem: {formatarDataHoraLocal(nuvemAt)}</Text>
            ) : null}
            <Text style={styles.detailHint}>
              {String(serverInv.descricao ?? '—')}
              {mostrarTextosAjudaModulos
                ? dirty
                  ? '\n\nAlterações por guardar na nuvem.'
                  : '\n\nEm dia com o último snapshot.'
                : dirty
                  ? '\n(Alterações locais — guardar na nuvem.)'
                  : ''}
            </Text>
          </>
        }
        renderItem={renderItem}
      />
    </View>
  );
}
