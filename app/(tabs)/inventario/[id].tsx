import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { appAlert } from '@/src/lib/appDialog';
import { CloudSyncStrip } from '@/src/components/mobile/CloudSyncStrip';
import { MetaRow } from '@/src/components/mobile/MetaRow';
import { PrimaryActionButton } from '@/src/components/mobile/PrimaryActionButton';
import { SectionCard } from '@/src/components/mobile/SectionCard';
import { StatPillRow } from '@/src/components/mobile/StatPillRow';
import { StatusBadge } from '@/src/components/mobile/StatusBadge';
import { buildMobileShellStyles } from '@/src/theme/buildMobileShellStyles';
import { buildInventarioStyles } from '@/src/theme/buildInventarioStyles';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchSnapshotSlices } from '@/src/lib/snapshot';
import { createSnapshotPatchPrepareWithBaseline } from '@/src/lib/snapshotWritePrepare';
import { commitDefaultSnapshotPatchWriteResilient as commitDefaultSnapshotWrite } from '@/src/lib/offlineSnapshotQueue';
import { buildInventarioContagemPatchPlan } from '@/src/lib/inventarioSnapshotPatch';
import {
  SNAPSHOT_MOBILE_INVENTARIO_READ_KEYS,
  SNAPSHOT_MOBILE_INVENTARIO_WRITE_READ_KEYS,
} from '@/src/lib/snapshotSliceKeys';
import { readInventarioFromCloud } from '@/src/lib/escalaCloud';
import { useSnapshotRefreshOnAppActive } from '@/src/lib/useSnapshotRefreshOnAppActive';
import { hasSupabaseConfig } from '@/src/lib/config';
import { formatQuantidadeExibicao } from '@/src/lib/formatQuantidade';
import {
  calcularEstatisticasInventarioContagem,
  criarItemInventarioDoMaterial,
  descreverLeituraInventarioParaErro,
  encontrarIndiceItemInventarioPorLeitura,
  filtrarItensInventarioPorBusca,
  indiceItemInventarioPorCodigoMaterial,
  itemKey,
  parseQuantidadeContadaTexto,
  recebimentoBuscaCombina,
  resolverMaterialParaInventario,
} from '@/src/lib/inventarioContagem';
import {
  buildMetricasOperacionaisPorCodigo,
  codigoMaterialKey,
} from '@/src/lib/saldoMaterial';
import {
  inventarioLocalDifereDoSnapshot,
  mergeContagemLocalEmInventario,
  mergeLinhasContagemPreserveLocal,
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
    localizacaoContada: o.localizacaoContada != null ? String(o.localizacaoContada) : undefined,
  };
}

export default function InventarioDetalheScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = idParam ? decodeURIComponent(String(idParam)) : '';
  const navigation = useNavigation();
  const router = useRouter();
  const { colors } = useTheme();
  const shell = useMemo(() => buildMobileShellStyles(colors), [colors]);
  const styles = useMemo(() => buildInventarioStyles(colors), [colors]);
  const configured = useMemo(() => hasSupabaseConfig(), []);
  const [camPermission, requestCamPermission] = useCameraPermissions();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [nuvemAt, setNuvemAt] = useState<string | null>(null);
  const [payload, setPayload] = useState<IsoSnapshotPayload | null>(null);
  const [qtdTextoPorItemId, setQtdTextoPorItemId] = useState<Record<string, string>>({});
  const [localTextoPorItemId, setLocalTextoPorItemId] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [focoItemId, setFocoItemId] = useState<string | null>(null);
  const [ultimoLocal, setUltimoLocal] = useState('');

  const firstLoadParaIdRef = useRef<string | null>(null);
  const scanLockRef = useRef(false);
  const qtdRef = useRef(qtdTextoPorItemId);
  const locRef = useRef(localTextoPorItemId);
  qtdRef.current = qtdTextoPorItemId;
  locRef.current = localTextoPorItemId;

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
    return mergeContagemLocalEmInventario(serverInv, qtdTextoPorItemId, localTextoPorItemId);
  }, [serverInv, qtdTextoPorItemId, localTextoPorItemId]);

  const itens = serverInv?.itens ?? [];
  const stats = useMemo(
    () => calcularEstatisticasInventarioContagem(itens, qtdTextoPorItemId),
    [itens, qtdTextoPorItemId],
  );
  const itensFiltrados = useMemo(
    () => filtrarItensInventarioPorBusca(itens, busca, payload),
    [itens, busca, payload],
  );
  const metricasOperacionais = useMemo(
    () => (payload ? buildMetricasOperacionaisPorCodigo(payload) : new Map()),
    [payload],
  );
  const buscaPorNfSemItens = useMemo(() => {
    if (!busca.trim() || itensFiltrados.length > 0) return false;
    return recebimentoBuscaCombina(payload, busca);
  }, [busca, itensFiltrados.length, payload]);
  const materialCandidatoBusca = useMemo(() => {
    if (!busca.trim() || itensFiltrados.length > 0) return null;
    return resolverMaterialParaInventario(payload, busca);
  }, [busca, itensFiltrados.length, payload]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: serverInv?.codigo ? String(serverInv.codigo) : 'Contagem',
    });
  }, [navigation, serverInv?.codigo]);

  const carregarNuvem = useCallback(async () => {
    setLoadErr(null);
    setLoading(true);
    try {
      const { payload: p, updatedAt, error } = await fetchSnapshotSlices(SNAPSHOT_MOBILE_INVENTARIO_READ_KEYS, {
        bypassCache: true,
      });
      if (error) {
        setLoadErr(error);
        setPayload(null);
        return;
      }
      const next = p ? deepClone(p) : ({ materiais: [], inventarios: [] } as IsoSnapshotPayload);
      let invRaw: InventarioSnapshot | null = null;

      if (id) {
        const cloud = await readInventarioFromCloud(id);
        if (cloud.inventario) {
          invRaw = cloud.inventario as InventarioSnapshot;
        } else if (cloud.missing) {
          setLoadErr(
            'Leitura paginada de inventário indisponível. Active a estrutura de escala no PC (Configurações).',
          );
        } else if (cloud.error) {
          setLoadErr(cloud.error);
        }
      }

      if (invRaw) {
        next.inventarios = [invRaw];
      } else {
        next.inventarios = [];
      }

      setPayload(next);
      setNuvemAt(updatedAt);

      if (!invRaw || !id) {
        return;
      }
      const invNorm: InventarioSnapshot = {
        ...invRaw,
        itens: Array.isArray(invRaw.itens) ? invRaw.itens.map((it, i) => normalizeInventarioItem(it, i)) : [],
      };
      const primeiraVezEsteId = firstLoadParaIdRef.current !== id;
      if (primeiraVezEsteId) {
        firstLoadParaIdRef.current = id;
        let { qtdTextoPorItemId: qtdBase, localTextoPorItemId: locBase } = mergeLinhasContagemPreserveLocal(
          {},
          {},
          invNorm,
        );
        const draft = await lerRascunhoInventario(id);
        if (draft) {
          const validK = new Set((invNorm.itens ?? []).map((it, i) => String(it.id ?? `item-${i}`)));
          for (const [k, v] of Object.entries(draft.qtdTextoPorItemId ?? {})) {
            if (validK.has(k)) qtdBase[k] = v;
          }
          for (const [k, v] of Object.entries(draft.localTextoPorItemId ?? {})) {
            if (validK.has(k)) locBase[k] = v;
          }
        }
        setQtdTextoPorItemId(qtdBase);
        setLocalTextoPorItemId(locBase);
      } else {
        const merged = mergeLinhasContagemPreserveLocal(qtdRef.current, locRef.current, invNorm);
        setQtdTextoPorItemId(merged.qtdTextoPorItemId);
        setLocalTextoPorItemId(merged.localTextoPorItemId);
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
      localTextoPorItemId: { ...localTextoPorItemId },
      updatedAt: new Date().toISOString(),
    });
  }, [serverInv, validoParaContagem, id, qtdTextoPorItemId, localTextoPorItemId]);

  const guardarNaNuvem = useCallback(
    async (opts?: { silentSuccess?: boolean; inventarioOverride?: InventarioSnapshot }): Promise<boolean> => {
      const invBase = opts?.inventarioOverride ?? localInventario;
      if (!serverInv || !payload || !invBase || !validoParaContagem) {
        appAlert('Indisponível', 'Este inventário não está aberto para contagem no mobile ou não foi encontrado.');
        return false;
      }
      setSaving(true);
      try {
        let inventarioMerged: InventarioSnapshot | null = null;
        const result = await commitDefaultSnapshotWrite(
          createSnapshotPatchPrepareWithBaseline(null, SNAPSHOT_MOBILE_INVENTARIO_WRITE_READ_KEYS, (fresh) => {
            if (!fresh?.inventarios?.length) {
              throw new Error('Não foi possível localizar o inventário no pacote.');
            }
            const plan = buildInventarioContagemPatchPlan({
              freshInventarios: fresh.inventarios,
              inventarioId: String(id),
              localInventario: deepClone(invBase) as Record<string, unknown>,
            });
            inventarioMerged = plan.inventarioMerged as InventarioSnapshot;
            return {
              patch: plan.patch,
              mergeKeys: plan.mergeKeys,
              patchWithoutMerge: plan.patchWithoutMerge,
            };
          }),
        );
        if (result.error) {
          appAlert(result.conflict ? 'Conflito de dados' : 'Supabase', result.error);
          if (result.conflict) {
            void carregarNuvem();
          }
          return false;
        }
        const nextPayload = deepClone(payload);
        const idx = nextPayload.inventarios?.findIndex((inv) => String(inv.id) === String(id)) ?? -1;
        if (idx !== -1 && nextPayload.inventarios && inventarioMerged) {
          nextPayload.inventarios[idx] = deepClone(inventarioMerged);
          nextPayload.dataAtualizacao = new Date().toISOString();
          setPayload(nextPayload);
        }
        if (result.updatedAt) {
          setNuvemAt(result.updatedAt);
        }
        await limparRascunhoInventario(id);
        if (!opts?.silentSuccess) {
          appAlert(
            result.queued ? 'Guardado (pendente)' : 'Guardado',
            result.queued
              ? 'Contagem guardada neste aparelho e enfileirada para sincronizar com a nuvem.'
              : 'Contagem gravada na nuvem.',
          );
        }
        return true;
      } finally {
        setSaving(false);
      }
    },
    [carregarNuvem, serverInv, payload, localInventario, validoParaContagem, id],
  );

  const incluirMaterialNoInventario = useCallback(
    async (leitura: string, opts?: { silentSync?: boolean }): Promise<number | null> => {
      if (!payload || !serverInv || !validoParaContagem) return null;
      const material = resolverMaterialParaInventario(payload, leitura);
      if (!material?.codigo) {
        appAlert(
          'Material',
          `O ${descreverLeituraInventarioParaErro(leitura)} não está no cadastro I.S.O PRO. Cadastre o material no PC ou confira a etiqueta.`,
        );
        return null;
      }
      const codigoKey = codigoMaterialKey(String(material.codigo));
      const idxExistente = indiceItemInventarioPorCodigoMaterial(itens, String(material.codigo));
      if (idxExistente >= 0) {
        const kid = itemKey(itens[idxExistente]!, idxExistente);
        setFocoItemId(kid);
        setBusca('');
        return idxExistente;
      }
      const metricas = codigoKey ? metricasOperacionais.get(codigoKey) : undefined;
      const saldo = metricas?.estoque ?? 0;
      const novoItem = criarItemInventarioDoMaterial(material, saldo);
      const itensNovos = [...itens, novoItem];
      const invAtualizado: InventarioSnapshot = { ...serverInv, itens: itensNovos };
      const invComContagem = mergeContagemLocalEmInventario(invAtualizado, qtdTextoPorItemId, localTextoPorItemId);
      const nextPayload = deepClone(payload);
      const invIdx = nextPayload.inventarios?.findIndex((inv) => String(inv.id) === String(id)) ?? -1;
      if (invIdx === -1 || !nextPayload.inventarios) return null;
      nextPayload.inventarios[invIdx] = deepClone(invComContagem);
      setPayload(nextPayload);
      setQtdTextoPorItemId((prev) => ({ ...prev, [String(novoItem.id)]: prev[String(novoItem.id)] ?? '' }));
      setLocalTextoPorItemId((prev) => ({ ...prev, [String(novoItem.id)]: prev[String(novoItem.id)] ?? '' }));
      setFocoItemId(String(novoItem.id));
      setBusca('');
      const idxNovo = itensNovos.length - 1;
      if (!opts?.silentSync) {
        const ok = await guardarNaNuvem({ silentSuccess: true, inventarioOverride: invComContagem });
        if (ok) {
          appAlert(
            'Material incluído',
            `${String(material.codigo)} entrou na lista do inventário e foi sincronizado com a nuvem (aparece no PC ao atualizar).${saldo <= 1e-9 ? '\n\nSaldo no sistema: 0 — se encontrou fisicamente, registe a quantidade contada.' : ''}`,
          );
        }
      }
      return idxNovo;
    },
    [
      guardarNaNuvem,
      id,
      itens,
      localTextoPorItemId,
      metricasOperacionais,
      payload,
      qtdTextoPorItemId,
      serverInv,
      validoParaContagem,
    ],
  );

  useDebouncedEffect(
    () => {
      if (!serverInv || !validoParaContagem || !id) return;
      void salvarRascunhoInventario({
        inventarioId: id,
        qtdTextoPorItemId: { ...qtdTextoPorItemId },
        localTextoPorItemId: { ...localTextoPorItemId },
        updatedAt: new Date().toISOString(),
      });
    },
    [serverInv, validoParaContagem, id, qtdTextoPorItemId, localTextoPorItemId],
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

  const atualizarQtd = useCallback((itemId: string, texto: string) => {
    setQtdTextoPorItemId((prev) => ({ ...prev, [itemId]: texto }));
  }, []);

  const atualizarLocal = useCallback((itemId: string, texto: string) => {
    setLocalTextoPorItemId((prev) => ({ ...prev, [itemId]: texto }));
    const t = texto.trim();
    if (t) setUltimoLocal(t);
  }, []);

  const abrirScanner = useCallback(async () => {
    if (!camPermission?.granted) {
      const r = await requestCamPermission();
      if (!r.granted) {
        appAlert('Câmara', 'Permissão necessária para escanear códigos.');
        return;
      }
    }
    scanLockRef.current = false;
    setScannerOpen(true);
  }, [camPermission?.granted, requestCamPermission]);

  const onBarcodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (scanLockRef.current) return;
      scanLockRef.current = true;
      const idx = encontrarIndiceItemInventarioPorLeitura(itens, data);
      if (idx >= 0) {
        const kid = itemKey(itens[idx]!, idx);
        setFocoItemId(kid);
        setBusca('');
        setScannerOpen(false);
        setTimeout(() => {
          scanLockRef.current = false;
        }, 800);
        return;
      }
      void (async () => {
        const incluido = await incluirMaterialNoInventario(data);
        setScannerOpen(false);
        if (incluido == null) {
          scanLockRef.current = false;
        } else {
          setTimeout(() => {
            scanLockRef.current = false;
          }, 800);
        }
      })();
    },
    [incluirMaterialNoInventario, itens],
  );

  const renderLinhaContagem = useCallback(
    (item: InventarioItemSnapshot, index: number, destacar: boolean) => {
      const kid = itemKey(item, index);
      const saldo = item.saldoSistema;
      const saldoTxt =
        typeof saldo === 'number' && Number.isFinite(saldo) ? formatQuantidadeExibicao(saldo) : '—';
      const codigoKey = codigoMaterialKey(String(item.codigoMaterial ?? ''));
      const metricas = codigoKey ? metricasOperacionais.get(codigoKey) : undefined;
      const estoqueTxt =
        metricas != null ? formatQuantidadeExibicao(metricas.estoque) : '—';
      const recebidoTxt =
        metricas != null ? formatQuantidadeExibicao(metricas.recebido) : '—';
      const atendidoTxt =
        metricas != null ? formatQuantidadeExibicao(metricas.atendido) : '—';
      const qTxt = qtdTextoPorItemId[kid] ?? '';
      const qNum = parseQuantidadeContadaTexto(qTxt);
      const divergeInventario =
        qNum !== undefined &&
        typeof saldo === 'number' &&
        Number.isFinite(saldo) &&
        Math.abs(qNum - saldo) > 1e-9;
      const divergeOperacional =
        qNum !== undefined &&
        metricas != null &&
        Math.abs(qNum - metricas.estoque) > 1e-9;

      return (
        <View style={[styles.itemCard, destacar && styles.focoCard]}>
          {destacar ? <Text style={styles.focoTit}>Contagem rápida (scan / pesquisa)</Text> : null}
          <Text style={styles.itemCodigo}>{String(item.codigoMaterial ?? '—')}</Text>
          <Text style={styles.itemDesc}>{String(item.descricaoMaterial ?? '—')}</Text>
          <StatPillRow
            dense
            items={[
              {
                label: 'Recebido',
                value: recebidoTxt,
              },
              {
                label: 'Atendido',
                value: atendidoTxt,
              },
              {
                label: 'Estoque',
                value: estoqueTxt,
                tone: metricas != null ? 'emphasis' : 'muted',
              },
            ]}
          />
          <StatPillRow
            dense
            items={[
              {
                label: 'Saldo invent.',
                value: `${saldoTxt} ${item.unidade ?? ''}`.trim(),
              },
              {
                label: 'Contada',
                value: qTxt.trim() ? qTxt : '—',
                tone: qTxt.trim() ? 'emphasis' : 'muted',
              },
            ]}
          />
          <View style={styles.itemRow}>
            <Text style={styles.itemLabel}>Qtd contada</Text>
            <TextInput
              editable={validoParaContagem && !saving}
              keyboardType="decimal-pad"
              onChangeText={(t) => atualizarQtd(kid, t)}
              placeholder="—"
              placeholderTextColor={colors.textMuted}
              style={styles.qtdInput}
              value={qTxt}
            />
          </View>
          <View style={styles.itemRow}>
            <Text style={styles.itemLabel}>Local</Text>
            <TextInput
              editable={validoParaContagem && !saving}
              onChangeText={(t) => atualizarLocal(kid, t)}
              placeholder={ultimoLocal ? `Ex.: ${ultimoLocal}` : 'Ex.: A-12'}
              placeholderTextColor={colors.textMuted}
              style={styles.locInput}
              value={localTextoPorItemId[kid] ?? ''}
            />
          </View>
          {divergeOperacional ? (
            <Text style={styles.divergeBadge}>Diverge do estoque operacional</Text>
          ) : null}
          {divergeInventario ? (
            <Text style={styles.divergeBadge}>Diverge do saldo do inventário</Text>
          ) : null}
        </View>
      );
    },
    [
      atualizarLocal,
      atualizarQtd,
      colors.textMuted,
      localTextoPorItemId,
      metricasOperacionais,
      qtdTextoPorItemId,
      saving,
      styles,
      ultimoLocal,
      validoParaContagem,
    ],
  );

  const renderItem = useCallback(
    ({ item }: { item: InventarioItemSnapshot }) => {
      const fullIndex = itens.findIndex((x) => String(x.id ?? '') === String(item.id ?? ''));
      const idx = fullIndex >= 0 ? fullIndex : 0;
      const kid = itemKey(item, idx);
      return renderLinhaContagem(item, idx, focoItemId === kid);
    },
    [focoItemId, itens, renderLinhaContagem],
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

  const dirty = Boolean(payload && localInventario && inventarioLocalDifereDoSnapshot(localInventario, payload));
  const focoItem =
    focoItemId != null ? itens.find((it, i) => itemKey(it, i) === focoItemId) : undefined;
  const focoIndex = focoItem ? itens.indexOf(focoItem) : -1;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        contentContainerStyle={[styles.container, { paddingBottom: 32 }]}
        data={itensFiltrados}
        keyExtractor={(it, i) => String(it.id ?? i)}
        ListEmptyComponent={
          busca.trim() ? (
            <View>
              <Text style={styles.hint}>
                {buscaPorNfSemItens
                  ? 'NF/romaneio encontrado nos recebimentos, mas nenhum item deste inventário corresponde a essa nota.'
                  : materialCandidatoBusca
                    ? `Material «${String(materialCandidatoBusca.codigo)}» está no cadastro mas ainda não está neste inventário.`
                    : 'Nenhum item corresponde à pesquisa (código, descrição, local ou NF).'}
              </Text>
              {materialCandidatoBusca ? (
                <Pressable
                  style={[styles.btn, { marginTop: 12 }]}
                  onPress={() => void incluirMaterialNoInventario(busca)}
                >
                  <Text style={styles.btnText}>Incluir material e contar</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <SectionCard title="Inventário aberto">
              <Text style={styles.hint}>
                Escaneie ou pesquise um código: o material entra na lista automaticamente e sincroniza com a nuvem (aparece no PC).
                Também pode carregar todos os materiais com saldo no PC antes de sair ao armazém.
              </Text>
            </SectionCard>
          )
        }
        ListFooterComponent={
          <View style={{ marginTop: 8 }}>
            <PrimaryActionButton
              disabled={saving || !dirty}
              label={saving ? 'A guardar…' : 'Guardar na nuvem'}
              loading={saving}
              onPress={() => void guardarNaNuvem()}
            />
            <PrimaryActionButton
              disabled={loading}
              label={loading ? 'A atualizar…' : 'Atualizar do servidor'}
              loading={loading}
              onPress={() => void carregarNuvem()}
              variant="secondary"
            />
          </View>
        }
        ListHeaderComponent={
          <>
            <CloudSyncStrip configured={configured} error={loadErr} loading={loading} updatedAt={nuvemAt} />
            <StatPillRow
              dense
              items={[
                { label: 'Itens', value: stats.total },
                { label: 'Contados', value: stats.contados, tone: stats.contados > 0 ? 'emphasis' : 'muted' },
                { label: 'Pendentes', value: stats.pendentes },
                {
                  label: 'Diverg.',
                  value: stats.divergencias,
                  tone: stats.divergencias > 0 ? 'warn' : 'default',
                },
              ]}
            />
            <SectionCard title="Inventário">
              <MetaRow label="Código" value={String(serverInv.codigo ?? '—')} />
              <MetaRow label="Responsável" value={String(serverInv.responsavel ?? '—')} />
              <MetaRow label="Data" value={String(serverInv.dataInventario ?? '—')} isLast />
              <Text style={[styles.detailHint, { marginTop: 10, marginBottom: 0 }]}>
                {String(serverInv.descricao ?? '—')}
              </Text>
              <View style={{ marginTop: 10 }}>
                <StatusBadge label={dirty ? 'Alterações por guardar' : 'Em dia com a nuvem'} tone={dirty ? 'warn' : 'success'} />
              </View>
            </SectionCard>
            <View style={styles.searchRow}>
              <TextInput
                placeholder="Código, descrição, local ou NF…"
                placeholderTextColor={colors.placeholder}
                style={styles.searchInput}
                value={busca}
                onChangeText={setBusca}
              />
              <Pressable style={styles.scanBtn} onPress={() => void abrirScanner()}>
                <Text style={styles.scanBtnText}>Scan</Text>
              </Pressable>
            </View>
            {focoItem && focoIndex >= 0 && !itensFiltrados.includes(focoItem) ? (
              renderLinhaContagem(focoItem, focoIndex, true)
            ) : null}
            <Text style={[shell.sectionTitle, { marginBottom: 8 }]}>
              {busca.trim() ? `Resultados (${itensFiltrados.length})` : 'Itens para contagem'}
            </Text>
          </>
        }
        renderItem={renderItem}
      />

      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <View style={styles.scannerWrap}>
          {camPermission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'qr'],
              }}
              onBarcodeScanned={onBarcodeScanned}
            />
          ) : (
            <Text style={{ color: '#fff', textAlign: 'center', padding: 24 }}>Permissão da câmara necessária.</Text>
          )}
          <Pressable style={styles.scannerClose} onPress={() => setScannerOpen(false)}>
            <Text style={styles.scannerCloseTxt}>Fechar</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}
