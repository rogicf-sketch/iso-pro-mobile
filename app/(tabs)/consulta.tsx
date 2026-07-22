import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useDebouncedEffect } from '@/src/lib/useDebouncedEffect';
import { CloudSyncStrip } from '@/src/components/mobile/CloudSyncStrip';
import { StatPillRow } from '@/src/components/mobile/StatPillRow';
import { buildConsultaStyles } from '@/src/theme/buildConsultaStyles';
import { useMobileUiPreferences } from '@/src/theme/MobileUiPreferencesContext';
import { useTheme } from '@/src/theme/ThemeContext';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { appAlert } from '@/src/lib/appDialog';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  filtrarDocumentosPlanejamentoPorTexto,
  resolverBuscaDocumentoPorNumero,
} from '@/src/lib/documentoBusca';
import { fetchSnapshotSlices } from '@/src/lib/snapshot';
import { SNAPSHOT_MOBILE_CONSULTA_READ_KEYS } from '@/src/lib/snapshotSliceKeys';
import { useSnapshotRefreshOnAppActive } from '@/src/lib/useSnapshotRefreshOnAppActive';
import { hasSupabaseConfig } from '@/src/lib/config';
import { formatQuantidadeComUnidade, formatQuantidadeExibicao } from '@/src/lib/formatQuantidade';
import { playScanBeep } from '@/src/lib/playScanBeep';
import {
  encontrarMaterialPorCodigoOuBarras,
  extrairCodigoMaterialDeTextoLeitura,
  quantidadeAtendidaLinha,
} from '@/src/lib/registrarAtendimento';
import {
  filtrarRecebimentosPorTextoInteligente,
  resolverBuscaRecebimentoPorNota,
  rotuloNotaRomaneioRecebimento,
} from '@/src/lib/recebimentoBusca';
import { linhaComDivergenciaVisual } from '@/src/lib/conferenciaQuantidades';
import { linhaEstadoConferenciaMobile, recebimentoEmConferenciaAberta } from '@/src/lib/recebimentoConferenciaMobile';
import {
  listDocumentosPlanejamentoPageFromCloud,
  listRecebimentosPageFromCloud,
  readRecebimentoFromCloud,
  syncDocumentosPlanejamentoFromSnapshotCloud,
  type DocumentoListaEscala,
  type RecebimentoListaEscala,
} from '@/src/lib/escalaCloud';
import { wireRecebimentoDetalheEscala } from '@/src/lib/recebimentoEscalaWire';
import {
  listDocumentosPendenciaMaterialFromCloud,
  readDocumentoPlanejamentoFromCloud,
  searchDocumentosPlanejamentoFromCloud,
} from '@/src/lib/isoProSnapshot';
import type {
  DocumentoItemPlanejamento,
  DocumentoPlanejamento,
  IsoSnapshotPayload,
  Material,
  Recebimento,
  RecebimentoItem,
} from 'iso-pro-shared';

const PAGE_SIZE_CONSULTA = 50;

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function mesmoDocumentoSelecionado(
  selecionado: DocumentoPlanejamento | null,
  linha: DocumentoPlanejamento,
): boolean {
  if (!selecionado) return false;
  return String(selecionado.id) === String(linha.id);
}

function mesmoRecebimentoSelecionado(selecionado: Recebimento | null, linha: Recebimento): boolean {
  if (!selecionado) return false;
  return String(selecionado.id) === String(linha.id);
}

function wireDocumentoParaConsulta(d: DocumentoListaEscala): DocumentoPlanejamento {
  return {
    id: d.id,
    numero: d.numero,
    revisao: d.revisao,
    descricao: d.descricao,
    responsavel: d.responsavel,
    data: d.data ?? undefined,
    status: d.status,
    itens: (d.itens as DocumentoItemPlanejamento[] | undefined) ?? [],
  } as DocumentoPlanejamento;
}

function wireRecebimentoParaConsulta(r: RecebimentoListaEscala): Recebimento {
  return {
    id: r.id,
    nota: r.notaFiscal,
    romaneio: r.romaneio,
    fornecedorNome: r.fornecedor,
    data: r.dataRecebimento,
    status: r.status,
    modoRecebimento: r.modoRecebimento,
    conferenteNome: r.conferente,
    dataConferencia: r.dataConferencia ?? undefined,
    itens: [],
  } as Recebimento;
}

export default function ConsultaScreen() {
  const router = useRouter();
  const { sec: secParam } = useLocalSearchParams<{ sec?: string | string[] }>();
  const secFocus =
    typeof secParam === 'string' ? secParam : Array.isArray(secParam) ? secParam[0] : undefined;
  /** `recebimento` | `material` | resto/`documentos` = desenhos. */
  type ModoConsulta = 'documentos' | 'recebimento' | 'material';
  const modoConsulta: ModoConsulta =
    secFocus === 'recebimento' ? 'recebimento' : secFocus === 'material' ? 'material' : 'documentos';
  const somenteRecebimento = modoConsulta === 'recebimento';
  const somenteDocumentos = modoConsulta === 'documentos';
  const somenteMaterial = modoConsulta === 'material';

  const escolherModoConsulta = useCallback(
    (modo: ModoConsulta) => {
      router.setParams({ sec: modo });
    },
    [router],
  );

  const { colors } = useTheme();
  const { mostrarTextosAjudaModulos } = useMobileUiPreferences();
  const styles = useMemo(() => buildConsultaStyles(colors), [colors]);
  const configured = useMemo(() => hasSupabaseConfig(), []);
  const scrollRef = useRef<ScrollView>(null);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [nuvemAt, setNuvemAt] = useState<string | null>(null);
  const [payload, setPayload] = useState<IsoSnapshotPayload | null>(null);
  const [docsCloud, setDocsCloud] = useState<DocumentoPlanejamento[]>([]);
  const [docsTotal, setDocsTotal] = useState(0);
  const [docsEscalaOk, setDocsEscalaOk] = useState(false);
  const [recsCloud, setRecsCloud] = useState<Recebimento[]>([]);
  const [recsTotal, setRecsTotal] = useState(0);
  const [recsEscalaOk, setRecsEscalaOk] = useState(false);
  const [buscandoDocs, setBuscandoDocs] = useState(false);
  const [buscandoRecs, setBuscandoRecs] = useState(false);

  const [buscaDoc, setBuscaDoc] = useState('');
  const [msgDoc, setMsgDoc] = useState<string | null>(null);
  const [docConsulta, setDocConsulta] = useState<DocumentoPlanejamento | null>(null);

  const [codigoConsulta, setCodigoConsulta] = useState('');
  const [msgCod, setMsgCod] = useState<string | null>(null);
  const [materialResolvido, setMaterialResolvido] = useState<Material | null>(null);
  const [linhasPorMaterial, setLinhasPorMaterial] = useState<
    { documento: DocumentoPlanejamento; restanteMaterial: number }[] | null
  >(null);

  const [buscaRecNf, setBuscaRecNf] = useState('');
  const [msgRec, setMsgRec] = useState<string | null>(null);
  const [recConsulta, setRecConsulta] = useState<Recebimento | null>(null);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const scanCooldownRef = useRef(0);

  const hidratarDocumento = useCallback(async (d: DocumentoPlanejamento) => {
    setDocConsulta(deepClone(d));
    setMsgDoc(null);
    try {
      const cloud = await readDocumentoPlanejamentoFromCloud({
        documentoId: d.id,
        numero: d.numero,
        revisao: d.revisao,
      });
      if (cloud.documento) {
        setDocConsulta(deepClone(cloud.documento as unknown as DocumentoPlanejamento));
      }
    } catch {
      /* mantém resumo da lista */
    }
  }, []);

  const hidratarRecebimento = useCallback(async (r: Recebimento) => {
    setRecConsulta(deepClone(r));
    setMsgRec(null);
    try {
      const cloud = await readRecebimentoFromCloud(String(r.id));
      if (cloud.recebimento) {
        // Normaliza as chaves da RPC (codigoMaterial/quantidadeRecebida…) para o modelo mobile,
        // senão os itens aparecem sem código, descrição e quantidade.
        setRecConsulta(wireRecebimentoDetalheEscala(cloud.recebimento, String(r.id)));
      }
    } catch {
      /* mantém resumo */
    }
  }, []);

  const syncDocsTentadoRef = useRef(false);

  const carregarPaginaDocumentos = useCallback(async (busca: string) => {
    const q = busca.trim();
    if (q.length > 0) setBuscandoDocs(true);
    try {
      let page = await listDocumentosPlanejamentoPageFromCloud({
        busca: q || undefined,
        offset: 0,
        limit: PAGE_SIZE_CONSULTA,
      });

      // Tabelas de escala vazias: tenta sync snapshot→tabelas uma vez, depois pesquisa legado.
      // Nao sync se a RPC falhou (ex.: JWT desalinhado) — evita sync pesado e falso "0 desenhos".
      if (!page.missing && !page.error && page.total === 0 && !syncDocsTentadoRef.current) {
        syncDocsTentadoRef.current = true;
        const sync = await syncDocumentosPlanejamentoFromSnapshotCloud();
        if (sync.ok) {
          page = await listDocumentosPlanejamentoPageFromCloud({
            busca: q || undefined,
            offset: 0,
            limit: PAGE_SIZE_CONSULTA,
          });
        }
      }

      if (!page.missing && page.total === 0 && q) {
        const search = await searchDocumentosPlanejamentoFromCloud(q, PAGE_SIZE_CONSULTA);
        if (!search.missing && search.documentos.length > 0) {
          const next = search.documentos.map((d) =>
            wireDocumentoParaConsulta({
              id: String((d as { id?: string | number }).id ?? ''),
              numero: (d as { numero?: string }).numero,
              revisao: (d as { revisao?: string }).revisao,
              descricao: (d as { descricao?: string }).descricao,
              responsavel: (d as { responsavel?: string }).responsavel,
              data: (d as { data?: string | null }).data ?? undefined,
              status: (d as { status?: string }).status,
              itens: (d as { itens?: unknown[] }).itens,
            }),
          );
          setDocsEscalaOk(true);
          setDocsCloud(next);
          setDocsTotal(next.length);
          return true;
        }
      }

      if (page.missing) {
        setDocsEscalaOk(false);
        return false;
      }
      setDocsEscalaOk(true);
      const next = page.documentos.map(wireDocumentoParaConsulta);
      setDocsCloud((prev) => {
        if (
          prev.length === next.length &&
          prev.every((d, i) => String(d.id) === String(next[i]?.id))
        ) {
          return prev;
        }
        return next;
      });
      setDocsTotal(page.total);
      if (page.error) setMsgDoc(page.error);
      return true;
    } catch (e) {
      setDocsEscalaOk(false);
      setMsgDoc(e instanceof Error ? e.message : 'Falha ao listar documentos.');
      return false;
    } finally {
      setBuscandoDocs(false);
    }
  }, []);

  const carregarPaginaRecebimentos = useCallback(async (busca: string) => {
    const q = busca.trim();
    if (q.length > 0) setBuscandoRecs(true);
    try {
      const page = await listRecebimentosPageFromCloud({
        busca: q || undefined,
        offset: 0,
        limit: PAGE_SIZE_CONSULTA,
      });
      if (page.missing) {
        setRecsEscalaOk(false);
        return false;
      }
      setRecsEscalaOk(true);
      const next = page.recebimentos.map(wireRecebimentoParaConsulta);
      setRecsCloud((prev) => {
        if (
          prev.length === next.length &&
          prev.every((r, i) => String(r.id) === String(next[i]?.id))
        ) {
          return prev;
        }
        return next;
      });
      setRecsTotal(page.total);
      if (page.error) setMsgRec(page.error);
      return true;
    } catch (e) {
      setRecsEscalaOk(false);
      setMsgRec(e instanceof Error ? e.message : 'Falha ao listar recebimentos.');
      return false;
    } finally {
      setBuscandoRecs(false);
    }
  }, []);

  const carregarNuvem = useCallback(async () => {
    setLoadErr(null);
    setLoading(true);
    syncDocsTentadoRef.current = false;
    try {
      const { payload: p, updatedAt, error } = await fetchSnapshotSlices(SNAPSHOT_MOBILE_CONSULTA_READ_KEYS);
      if (error) {
        setLoadErr(error);
        setPayload(null);
        return;
      }
      setPayload(p ? deepClone(p) : null);
      setNuvemAt(updatedAt);
      if (somenteDocumentos) {
        await carregarPaginaDocumentos('');
      }
      if (somenteRecebimento) {
        await carregarPaginaRecebimentos('');
      }
    } finally {
      setLoading(false);
    }
  }, [carregarPaginaDocumentos, carregarPaginaRecebimentos, somenteDocumentos, somenteRecebimento]);

  useFocusEffect(
    useCallback(() => {
      void carregarNuvem();
    }, [carregarNuvem]),
  );

  useSnapshotRefreshOnAppActive(carregarNuvem);

  /** Ao mudar de aba (Desenhos / Recebimentos / Material), volta ao topo da lista. */
  const scrolledForSecRef = useRef<string | null>(null);
  useEffect(() => {
    if (secFocus !== 'documentos' && secFocus !== 'recebimento' && secFocus !== 'material') {
      scrolledForSecRef.current = null;
      return;
    }
    if (scrolledForSecRef.current === secFocus) return;
    scrolledForSecRef.current = secFocus;
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [secFocus]);

  const docFiltradosRapido = useMemo(() => {
    if (docsEscalaOk) {
      if (!docConsulta && buscaDoc.trim().length < 1) return [];
      if (!docConsulta) return docsCloud;
      const hit = docsCloud.find((d) => mesmoDocumentoSelecionado(docConsulta, d));
      return hit ? [hit] : [docConsulta];
    }
    const list = payload?.documentos as DocumentoPlanejamento[] | undefined;
    if (!list?.length) return [];
    const t = buscaDoc.trim();
    if (t.length < 1) return [];
    return filtrarDocumentosPlanejamentoPorTexto(list, buscaDoc, 50);
  }, [docsEscalaOk, docsCloud, docConsulta, payload?.documentos, buscaDoc]);

  const recFiltradosRapido = useMemo(() => {
    if (recsEscalaOk) {
      if (!recConsulta && buscaRecNf.trim().length < 1) return [];
      if (!recConsulta) return recsCloud;
      const hit = recsCloud.find((r) => mesmoRecebimentoSelecionado(recConsulta, r));
      return hit ? [hit] : [recConsulta];
    }
    const list = payload?.recebimentos as Recebimento[] | undefined;
    if (!list?.length) return [];
    const t = buscaRecNf.trim();
    if (t.length < 1) return [];
    return filtrarRecebimentosPorTextoInteligente(list, buscaRecNf, 50);
  }, [recsEscalaOk, recsCloud, recConsulta, payload?.recebimentos, buscaRecNf]);

  /** Com documento escolhido, a lista mostra só esse resultado (não todas as linhas filtradas). */
  const docFiltradosParaExibir = useMemo(() => {
    if (!docConsulta) return docFiltradosRapido;
    const hit = docFiltradosRapido.find((d) => mesmoDocumentoSelecionado(docConsulta, d));
    return hit ? [hit] : [docConsulta];
  }, [docFiltradosRapido, docConsulta]);

  const recFiltradosParaExibir = useMemo(() => {
    if (!recConsulta) return recFiltradosRapido;
    const hit = recFiltradosRapido.find((r) => mesmoRecebimentoSelecionado(recConsulta, r));
    return hit ? [hit] : [recConsulta];
  }, [recFiltradosRapido, recConsulta]);

  const tituloListaDocumentos = useMemo(() => {
    if (docConsulta) {
      return 'Desenho seleccionado — altere a pesquisa para ver outros resultados';
    }
    if (docsEscalaOk) {
      return `Resultados (${docFiltradosParaExibir.length} de ${docsTotal}) — toque para abrir`;
    }
    return `Resultados (${docFiltradosParaExibir.length}${docFiltradosParaExibir.length >= 50 ? '+' : ''}) — toque para abrir`;
  }, [docConsulta, docsEscalaOk, docFiltradosParaExibir.length, docsTotal]);

  const tituloListaRecebimentos = useMemo(() => {
    if (recConsulta) {
      return 'Recebimento seleccionado — altere a pesquisa para ver outros resultados';
    }
    if (recsEscalaOk) {
      return `Resultados (${recFiltradosParaExibir.length} de ${recsTotal}) — toque para abrir`;
    }
    return `Resultados (${recFiltradosParaExibir.length}${recFiltradosParaExibir.length >= 50 ? '+' : ''}) — toque para abrir`;
  }, [recConsulta, recsEscalaOk, recFiltradosParaExibir.length, recsTotal]);

  const tentarAutoSelecionarConsulta = useCallback(() => {
    const list = docsEscalaOk ? docsCloud : ((payload?.documentos as DocumentoPlanejamento[] | undefined) ?? []);
    if (!list.length) return;
    const raw = buscaDoc.trim();
    if (raw.length < 1) return;
    const res = resolverBuscaDocumentoPorNumero(list, buscaDoc);
    if (res.kind === 'one') {
      void hidratarDocumento(res.doc);
      return;
    }
    if (res.kind === 'sameNumeroVarios') {
      void hidratarDocumento(res.docs[0]);
    }
  }, [buscaDoc, docsEscalaOk, docsCloud, payload, hidratarDocumento]);

  const tentarAutoSelecionarRecConsulta = useCallback(() => {
    const list = recsEscalaOk ? recsCloud : ((payload?.recebimentos as Recebimento[] | undefined) ?? []);
    if (!list.length) return;
    const raw = buscaRecNf.trim();
    if (raw.length < 1) return;
    const res = resolverBuscaRecebimentoPorNota(list, buscaRecNf);
    if (res.kind === 'one') {
      void hidratarRecebimento(res.rec);
      return;
    }
    if (res.kind === 'sameNotaVarios') {
      void hidratarRecebimento(res.recs[0]);
    }
  }, [buscaRecNf, recsEscalaOk, recsCloud, payload, hidratarRecebimento]);

  const executarConsultaCodigo = useCallback(
    async (termo: string) => {
      setMsgCod(null);
      setLinhasPorMaterial(null);
      setMaterialResolvido(null);
      if (!payload) {
        setMsgCod('Carregue os dados da nuvem primeiro.');
        return;
      }
      const t = termo.trim();
      if (!t) {
        setMsgCod('Digite ou escaneie o código do material ou código de barras.');
        return;
      }
      const mat = encontrarMaterialPorCodigoOuBarras((payload.materiais || []) as Material[], t);
      if (!mat?.codigo) {
        setMsgCod('Material não encontrado para este código ou código de barras.');
        return;
      }
      setMaterialResolvido(mat);
      setCodigoConsulta(String(mat.codigo ?? t));

      try {
        const cloud = await listDocumentosPendenciaMaterialFromCloud(String(mat.codigo));
        if (!cloud.missing && cloud.documentos.length > 0) {
          const lista = (cloud.documentos as unknown as DocumentoPlanejamento[]).map((d) => {
            let rest = 0;
            for (const it of d.itens || []) {
              const qProj = Number(it.quantidade) || 0;
              const qAt = quantidadeAtendidaLinha(it as DocumentoItemPlanejamento);
              rest += Math.max(0, qProj - qAt);
            }
            return { documento: d, restanteMaterial: rest };
          });
          lista.sort((a, b) => b.restanteMaterial - a.restanteMaterial);
          const totalRest = lista.reduce((s, x) => s + x.restanteMaterial, 0);
          if (totalRest <= 0) {
            setMsgCod('Este item não possui saldo no sistema — toda a quantidade já foi atendida no planejamento.');
          }
          setLinhasPorMaterial(lista);
          return;
        }
      } catch {
        /* fallback local se existir */
      }

      setMsgCod('Não foi possível consultar pendências deste material na nuvem.');
    },
    [payload],
  );

  const consultarPorCodigo = useCallback(() => {
    void executarConsultaCodigo(codigoConsulta);
  }, [codigoConsulta, executarConsultaCodigo]);

  const carregarPaginaDocumentosRef = useRef(carregarPaginaDocumentos);
  carregarPaginaDocumentosRef.current = carregarPaginaDocumentos;
  const carregarPaginaRecebimentosRef = useRef(carregarPaginaRecebimentos);
  carregarPaginaRecebimentosRef.current = carregarPaginaRecebimentos;
  const tentarAutoSelecionarConsultaRef = useRef(tentarAutoSelecionarConsulta);
  tentarAutoSelecionarConsultaRef.current = tentarAutoSelecionarConsulta;
  const tentarAutoSelecionarRecConsultaRef = useRef(tentarAutoSelecionarRecConsulta);
  tentarAutoSelecionarRecConsultaRef.current = tentarAutoSelecionarRecConsulta;
  const prevBuscaDocRef = useRef('');
  const prevBuscaRecRef = useRef('');

  /** Pausa: pesquisa paginada na nuvem — deps estáveis para não entrar em loop de refresh. */
  useDebouncedEffect(
    () => {
      if (!payload || !somenteDocumentos) return;
      const raw = buscaDoc.trim();
      const prev = prevBuscaDocRef.current;
      prevBuscaDocRef.current = raw;
      if (raw.length < 1) {
        setDocConsulta(null);
        setMsgDoc(null);
        // Só recarrega a 1.ª página se o utilizador limpou a pesquisa (não em loop).
        if (prev.length > 0) {
          void carregarPaginaDocumentosRef.current('');
        }
        return;
      }
      void carregarPaginaDocumentosRef.current(raw).then((ok) => {
        if (ok) tentarAutoSelecionarConsultaRef.current();
      });
    },
    [buscaDoc, payload, somenteDocumentos],
    320,
  );

  useDebouncedEffect(
    () => {
      if (!payload || !somenteRecebimento) return;
      const raw = buscaRecNf.trim();
      const prev = prevBuscaRecRef.current;
      prevBuscaRecRef.current = raw;
      if (raw.length < 1) {
        setRecConsulta(null);
        setMsgRec(null);
        if (prev.length > 0) {
          void carregarPaginaRecebimentosRef.current('');
        }
        return;
      }
      void carregarPaginaRecebimentosRef.current(raw).then((ok) => {
        if (ok) tentarAutoSelecionarRecConsultaRef.current();
      });
    },
    [buscaRecNf, payload, somenteRecebimento],
    320,
  );

  /** Consulta por código: a partir de 3 caracteres, após pausa (só na aba Material). */
  useDebouncedEffect(
    () => {
      if (!payload || !somenteMaterial) return;
      const t = codigoConsulta.trim();
      if (t.length < 3) {
        setLinhasPorMaterial(null);
        setMaterialResolvido(null);
        setMsgCod(null);
        return;
      }
      void executarConsultaCodigo(codigoConsulta);
    },
    [codigoConsulta, payload, somenteMaterial, executarConsultaCodigo],
    480,
  );

  const abrirScanner = useCallback(async () => {
    if (!camPermission?.granted) {
      const r = await requestCamPermission();
      if (!r.granted) {
        appAlert('Câmara', 'Permissão necessária para ler o código de barras.');
        return;
      }
    }
    setScannerOpen(true);
  }, [camPermission?.granted, requestCamPermission]);

  const onBarcodeScanned = useCallback(
    ({ data }: { data: string }) => {
      const now = Date.now();
      if (now - scanCooldownRef.current < 1200) return;
      scanCooldownRef.current = now;
      const t = (data || '').trim();
      if (!t) return;
      const limpo = extrairCodigoMaterialDeTextoLeitura(t) || t;
      void playScanBeep();
      setCodigoConsulta(limpo);
      setScannerOpen(false);
      executarConsultaCodigo(limpo);
    },
    [executarConsultaCodigo]
  );

  if (!configured) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Consulta</Text>
        <Text style={styles.hint}>Configura o Supabase no `.env` como nas outras abas.</Text>
      </View>
    );
  }


  const helpConsulta = somenteRecebimento
    ? 'Pesquisa por nota fiscal, romaneio ou fornecedor. Não grava alterações.'
    : somenteMaterial
      ? 'Consulta por código de material ou código de barras (inclui scan). Não grava alterações.'
      : 'Pesquise desenhos do planejamento. Digite e toque no resultado. Não grava alterações.';

  return (
    <View style={styles.screen}>
      <View style={styles.stickyHeader}>
        {mostrarTextosAjudaModulos ? <Text style={styles.hintSmall}>{helpConsulta}</Text> : null}

        <View style={styles.modoRow} accessibilityRole="tablist">
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: somenteDocumentos }}
            onPress={() => escolherModoConsulta('documentos')}
            style={[styles.modoBtn, somenteDocumentos ? styles.modoBtnOn : null]}
          >
            <Text style={[styles.modoBtnTxt, somenteDocumentos ? styles.modoBtnTxtOn : null]}>Desenhos</Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: somenteRecebimento }}
            onPress={() => escolherModoConsulta('recebimento')}
            style={[styles.modoBtn, somenteRecebimento ? styles.modoBtnOn : null]}
          >
            <Text style={[styles.modoBtnTxt, somenteRecebimento ? styles.modoBtnTxtOn : null]}>Recebimentos</Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: somenteMaterial }}
            onPress={() => escolherModoConsulta('material')}
            style={[styles.modoBtn, somenteMaterial ? styles.modoBtnOn : null]}
          >
            <Text style={[styles.modoBtnTxt, somenteMaterial ? styles.modoBtnTxtOn : null]}>Material</Text>
          </Pressable>
        </View>

        <View style={styles.syncRow}>
          <View style={{ flex: 1 }}>
            <CloudSyncStrip configured={configured} error={loadErr} loading={loading && !payload} updatedAt={nuvemAt} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Actualizar dados da nuvem"
            disabled={loading}
            onPress={() => void carregarNuvem()}
            style={[styles.syncAtualizar, loading ? styles.btnOff : null]}
          >
            <Text style={styles.syncAtualizarTxt}>{loading ? '…' : 'Actualizar'}</Text>
          </Pressable>
        </View>

        {somenteDocumentos ? (
          <View>
            <Text style={styles.stickySubTit}>Pesquisar desenho</Text>
            <TextInput
              style={styles.input}
              placeholder="Número ou descrição do desenho"
              placeholderTextColor={colors.placeholder}
              value={buscaDoc}
              onChangeText={(t) => {
                setBuscaDoc(t);
                setDocConsulta(null);
                setMsgDoc(null);
              }}
              onSubmitEditing={() => tentarAutoSelecionarConsulta()}
              returnKeyType="search"
              autoCapitalize="characters"
            />
          </View>
        ) : null}

        {somenteRecebimento ? (
          <View>
            <Text style={styles.stickySubTit}>Pesquisar recebimento</Text>
            <TextInput
              style={styles.input}
              placeholder="NF, romaneio, fornecedor ou código do item"
              placeholderTextColor={colors.placeholder}
              value={buscaRecNf}
              onChangeText={(t) => {
                setBuscaRecNf(t);
                setRecConsulta(null);
                setMsgRec(null);
              }}
              onSubmitEditing={() => tentarAutoSelecionarRecConsulta()}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        ) : null}

        {somenteMaterial ? (
          <View>
            <Text style={styles.stickySubTit}>Código ou código de barras</Text>
            <TextInput
              style={styles.input}
              placeholder="Código do material ou leitura do código de barras"
              placeholderTextColor={colors.placeholder}
              value={codigoConsulta}
              onChangeText={setCodigoConsulta}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={consultarPorCodigo}
            />
            <View style={styles.rowBarras}>
              <Pressable
                style={[styles.btnSec, styles.btnBarras, (!payload || loading) && styles.btnOff]}
                onPress={abrirScanner}
                disabled={!payload || loading}
              >
                <Text style={styles.btnTextSec}>Escanear</Text>
              </Pressable>
              <Pressable
                style={[styles.btnOk, styles.btnBarrasGo, (!payload || loading) && styles.btnOff]}
                onPress={consultarPorCodigo}
                disabled={!payload || loading}
              >
                <Text style={styles.btnText}>Consultar</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
      {somenteDocumentos && payload && docsEscalaOk && docsTotal === 0 && !msgDoc ? (
        <Text style={styles.warn}>
          Ainda não há desenhos nas tabelas de escala (por isso o total está 0). Isto não deixa o telemóvel lento — a
          pesquisa continua paginada. Toque em «Actualizar» outra vez ou, no PC, em Configurações, active a
          estrutura de escala de desenhos.
        </Text>
      ) : null}
      {somenteDocumentos && payload && docsEscalaOk && docsTotal === 0 && msgDoc ? (
        <Text style={styles.warn}>
          Nao foi possivel listar desenhos na nuvem: {msgDoc}. Saia e entre de novo; se continuar, use a versao 1.0.62+.
        </Text>
      ) : null}
      {somenteDocumentos && payload && !docsEscalaOk && (payload.materiais?.length ?? 0) > 0 ? (
        <View style={styles.warnDestaque}>
          <Text style={styles.warnDestaqueTit}>Lista paginada indisponível</Text>
          <Text style={styles.warnDestaqueTxt}>
            A RPC de documentos ainda não está activa neste projecto. No PC, em Configurações, active a estrutura de escala de desenhos.
          </Text>
        </View>
      ) : null}
      {somenteRecebimento && payload && recsEscalaOk && recsTotal === 0 ? (
        <Text style={styles.warn}>
          Nenhum recebimento nas tabelas de escala. Sincronize recebimentos no PC (Configurações).
        </Text>
      ) : null}

      {somenteDocumentos ? (
      <View>
      {msgDoc ? <Text style={styles.warn}>{msgDoc}</Text> : null}
      {buscaDoc.trim().length === 0 && !docConsulta ? (
        <Text style={styles.emptyHint}>Digite número ou descrição para pesquisar.</Text>
      ) : null}
      {buscaDoc.trim().length > 0 || docConsulta ? (
        <View style={styles.listaBox}>
          <Text style={styles.listaTitulo}>{tituloListaDocumentos}</Text>
          {docFiltradosParaExibir.length === 0 ? (
            <Text style={styles.warn}>
              Nenhum desenho combina com «{buscaDoc.trim()}». Tente outro trecho do número ou da descrição.
            </Text>
          ) : (
            docFiltradosParaExibir.map((d) => {
              const sel = mesmoDocumentoSelecionado(docConsulta, d);
              return (
                <Pressable
                  key={`rapido-${String(d.id)}-${String(d.numero)}-${String(d.revisao)}`}
                  style={[styles.docLinha, sel && styles.docLinhaSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sel }}
                  onPress={() => {
                    setBuscaDoc(String(d.numero ?? ''));
                    void hidratarDocumento(d);
                  }}
                >
                  <Text style={[styles.docLinhaTit, sel && styles.docLinhaTitSelected]}>
                    {d.numero ?? '—'} — rev. {d.revisao ?? '—'}
                  </Text>
                  <Text style={[styles.docLinhaSub, sel && styles.docLinhaSubSelected]} numberOfLines={2}>
                    {d.descricao ?? ''}
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>
      ) : null}

      {docConsulta ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {docConsulta.numero ?? '—'} — rev. {docConsulta.revisao ?? '—'}
          </Text>
          <Text style={styles.cardSub}>{docConsulta.descricao ?? ''}</Text>
          <Text style={styles.subTit2}>Itens no planejamento</Text>
          {(docConsulta.itens || []).map((it, i) => {
            const qProj = Number(it.quantidade) || 0;
            const qAt = quantidadeAtendidaLinha(it as DocumentoItemPlanejamento);
            const rest = Math.max(0, qProj - qAt);
            const semSaldo = rest <= 0;
            const unidade = String(it.unidade ?? '').trim();
            return (
              <View key={i} style={[styles.row, semSaldo && styles.rowSemSaldo]}>
                <View style={styles.rowTxt}>
                  <Text style={[styles.cod, semSaldo && styles.codSemSaldo]}>{it.codigo}</Text>
                  <Text style={[styles.desc, semSaldo && styles.descSemSaldo]} numberOfLines={3}>
                    {it.descricao}
                  </Text>
                  <StatPillRow
                    dense
                    columns={2}
                    style={styles.itemPills}
                    items={[
                      { label: 'Projeto', value: formatQuantidadeComUnidade(qProj, unidade) },
                      {
                        label: 'Atendido',
                        value: formatQuantidadeComUnidade(qAt, unidade),
                        tone: semSaldo ? 'muted' : 'default',
                      },
                      {
                        label: 'Pend. de atend.',
                        value: formatQuantidadeComUnidade(rest, unidade),
                        tone: semSaldo ? 'muted' : 'success',
                      },
                    ]}
                  />
                  {semSaldo ? <Text style={styles.badgeSemSaldo}>Sem saldo — não atender mais</Text> : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
      </View>
      ) : null}

      {somenteRecebimento ? (
      <View>
      {msgRec ? <Text style={styles.warn}>{msgRec}</Text> : null}
      {buscaRecNf.trim().length === 0 && !recConsulta ? (
        <Text style={styles.emptyHint}>Digite NF, romaneio ou fornecedor para pesquisar.</Text>
      ) : null}
      {buscaRecNf.trim().length > 0 || recConsulta ? (
        <View style={styles.listaBox}>
          <Text style={styles.listaTitulo}>{tituloListaRecebimentos}</Text>
          {recFiltradosParaExibir.length === 0 ? (
            <Text style={styles.warn}>
              Nenhum recebimento combina com «{buscaRecNf.trim()}». Tente outro trecho da NF, fornecedor ou código.
            </Text>
          ) : (
            recFiltradosParaExibir.map((r) => {
              const sel = mesmoRecebimentoSelecionado(recConsulta, r);
              return (
                <Pressable
                  key={`rec-busca-${String(r.id)}`}
                  style={[styles.docLinha, sel && styles.docLinhaSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sel }}
                  onPress={() => {
                    setBuscaRecNf(String(r.nota ?? r.romaneio ?? ''));
                    void hidratarRecebimento(r);
                  }}
                >
                  <Text style={[styles.docLinhaTit, sel && styles.docLinhaTitSelected]}>
                    {rotuloNotaRomaneioRecebimento(r)}
                  </Text>
                  <Text style={[styles.docLinhaSub, sel && styles.docLinhaSubSelected]} numberOfLines={2}>
                    {r.fornecedorNome ?? ''}
                  </Text>
                  <Text style={[styles.meta, { marginTop: 4 }, sel && { color: colors.accent, fontWeight: '700' }]}>
                    {linhaEstadoConferenciaMobile(r)}
                    {String(r.data ?? '').trim() ? ` · ${String(r.data ?? '').slice(0, 10)}` : ''}
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>
      ) : null}

      {recConsulta ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {rotuloNotaRomaneioRecebimento(recConsulta)}
          </Text>
          <Text style={styles.cardSub}>
            {recConsulta.fornecedorNome ? `Fornecedor: ${recConsulta.fornecedorNome}` : ''}
            {recConsulta.data ? ` · Data: ${String(recConsulta.data).slice(0, 10)}` : ''}
          </Text>
          <Text style={styles.meta}>{linhaEstadoConferenciaMobile(recConsulta)}</Text>
          <Text style={styles.subTit2}>Itens</Text>
          {mostrarTextosAjudaModulos ? (
            <Text style={styles.hintSmall}>
              Em recebimentos «aguardando conferência» ainda em aberto, código a vermelho indica quantidade conferida abaixo da NF (não recebido ou
              parcial). Em recebimento direto ou já concluído, as linhas não usam esse destaque.
            </Text>
          ) : null}
          {(recConsulta.itens || []).map((it, i) => {
            const div =
              recebimentoEmConferenciaAberta(recConsulta) && linhaComDivergenciaVisual(it as RecebimentoItem);
            return (
            <View key={i} style={[styles.row, div && styles.rowConferenciaDiv]}>
              <View style={styles.rowTxt}>
                <Text style={[styles.cod, div && styles.codConferenciaDiv]}>{it.codigo ?? '—'}</Text>
                <Text style={styles.desc} numberOfLines={3}>
                  {String(it.descricao ?? '')}
                </Text>
                <Text style={styles.itemQtd}>
                  Qtd NF: {String(it.quantidade ?? '—')}
                  {it.unidade ? ` ${it.unidade}` : ''}
                  {it.quantidadeConferida !== undefined &&
                  it.quantidadeConferida !== null &&
                  String(it.quantidadeConferida).trim() !== ''
                    ? `  ·  Qtd conf.: ${String(it.quantidadeConferida)}`
                    : ''}
                </Text>
                {String((it as RecebimentoItem).localizacao ?? '').trim() ? (
                  <Text style={styles.itemLocal} numberOfLines={2}>
                    Local: {String((it as RecebimentoItem).localizacao).trim()}
                  </Text>
                ) : null}
                {String((it as RecebimentoItem).observacaoItem ?? '').trim() ? (
                  <Text style={[styles.meta2, { marginTop: 6, fontStyle: 'italic' }]} numberOfLines={4}>
                    Obs.: {String((it as RecebimentoItem).observacaoItem).trim()}
                  </Text>
                ) : null}
              </View>
            </View>
            );
          })}
        </View>
      ) : null}
      </View>
      ) : null}

      {somenteMaterial ? (
      <View>
      {materialResolvido ? (
        <Text style={styles.meta}>
          Material: {String(materialResolvido.codigo ?? '—')}
          {materialResolvido.descricao ? ` — ${materialResolvido.descricao}` : ''}
        </Text>
      ) : null}
      {msgCod ? <Text style={linhasPorMaterial?.length ? styles.warn : styles.err}>{msgCod}</Text> : null}

      {linhasPorMaterial && linhasPorMaterial.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.subTit2}>Desenhos com este material</Text>
          {linhasPorMaterial.map(({ documento: d, restanteMaterial }) => {
            const semSaldo = restanteMaterial <= 0;
            return (
              <View
                key={`${String(d.id)}-${d.numero}`}
                style={[styles.docLinha, semSaldo && styles.rowSemSaldo]}
              >
                <Text style={[styles.docLinhaTit, semSaldo && styles.codSemSaldo]}>
                  {d.numero ?? '—'} — rev. {d.revisao ?? '—'}
                </Text>
                <Text style={[styles.docLinhaSub, semSaldo && styles.descSemSaldo]} numberOfLines={2}>
                  {d.descricao ?? ''}
                </Text>
                <Text style={[styles.docLinhaMeta, semSaldo && styles.metaSemSaldo]}>
                  Restante neste desenho: {formatQuantidadeExibicao(restanteMaterial)}
                </Text>
                {semSaldo ? <Text style={styles.badgeSemSaldo}>Sem saldo neste desenho</Text> : null}
              </View>
            );
          })}
        </View>
      ) : null}
      </View>
      ) : null}
      </ScrollView>

      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <View style={styles.scannerWrap}>
          {camPermission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: [
                  'qr',
                  'aztec',
                  'ean13',
                  'ean8',
                  'upc_e',
                  'code128',
                  'code39',
                  'codabar',
                  'upc_a',
                  'pdf417',
                  'datamatrix',
                ],
              }}
              onBarcodeScanned={onBarcodeScanned}
            />
          ) : (
            <View style={styles.scannerDenied}>
              <Text style={styles.scannerDeniedTxt}>Permissão da câmara necessária para escanear.</Text>
            </View>
          )}
          <Pressable style={styles.scannerClose} onPress={() => setScannerOpen(false)}>
            <Text style={styles.scannerCloseTxt}>Fechar</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}