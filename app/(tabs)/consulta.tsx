import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useDebouncedEffect } from '@/src/lib/useDebouncedEffect';
import { CloudSyncStrip } from '@/src/components/mobile/CloudSyncStrip';
import { ModuleScreenHeader } from '@/src/components/mobile/ModuleScreenHeader';
import { PrimaryActionButton } from '@/src/components/mobile/PrimaryActionButton';
import { StatPillRow } from '@/src/components/mobile/StatPillRow';
import { buildConsultaStyles } from '@/src/theme/buildConsultaStyles';
import { buildMobileShellStyles } from '@/src/theme/buildMobileShellStyles';
import { useMobileUiPreferences } from '@/src/theme/MobileUiPreferencesContext';
import { useTheme } from '@/src/theme/ThemeContext';
import {
  FlatList,
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
  exemplosNumerosDocumentos,
  filtrarDocumentosPlanejamentoPorTexto,
  resolverBuscaDocumentoPorNumero,
} from '@/src/lib/documentoBusca';
import { fetchSnapshotSlices } from '@/src/lib/snapshot';
import { SNAPSHOT_MOBILE_CONSULTA_READ_KEYS } from '@/src/lib/snapshotSliceKeys';
import { useSnapshotRefreshOnAppActive } from '@/src/lib/useSnapshotRefreshOnAppActive';
import { hasSupabaseConfig } from '@/src/lib/config';
import { formatQuantidadeExibicao } from '@/src/lib/formatQuantidade';
import { playScanBeep } from '@/src/lib/playScanBeep';
import {
  encontrarMaterialPorCodigoOuBarras,
  extrairCodigoMaterialDeTextoLeitura,
  quantidadeAtendidaLinha,
} from '@/src/lib/registrarAtendimento';
import {
  exemplosNotasRecebimentos,
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

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
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
  /** `recebimento` = NF/romaneio; resto (aba Consulta ou `?sec=documentos`) = desenhos + código/barras. */
  const somenteRecebimento = secFocus === 'recebimento';
  const somenteDocumentos = !somenteRecebimento;

  const escolherModoConsulta = useCallback(
    (modo: 'documentos' | 'recebimento') => {
      router.setParams({ sec: modo });
    },
    [router],
  );

  const { colors } = useTheme();
  const { mostrarTextosAjudaModulos } = useMobileUiPreferences();
  const styles = useMemo(() => buildConsultaStyles(colors), [colors]);
  const shell = useMemo(() => buildMobileShellStyles(colors), [colors]);
  const configured = useMemo(() => hasSupabaseConfig(), []);
  const scrollRef = useRef<ScrollView>(null);
  const ySectionDocumentos = useRef(0);
  const ySectionRecebimento = useRef(0);
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
  const [candidatosConsultaDoc, setCandidatosConsultaDoc] = useState<DocumentoPlanejamento[] | null>(null);
  const [docConsulta, setDocConsulta] = useState<DocumentoPlanejamento | null>(null);

  const [codigoConsulta, setCodigoConsulta] = useState('');
  const [msgCod, setMsgCod] = useState<string | null>(null);
  const [materialResolvido, setMaterialResolvido] = useState<Material | null>(null);
  const [linhasPorMaterial, setLinhasPorMaterial] = useState<
    { documento: DocumentoPlanejamento; restanteMaterial: number }[] | null
  >(null);

  const [buscaRecNf, setBuscaRecNf] = useState('');
  const [msgRec, setMsgRec] = useState<string | null>(null);
  const [candidatosRecConsulta, setCandidatosRecConsulta] = useState<Recebimento[] | null>(null);
  const [recConsulta, setRecConsulta] = useState<Recebimento | null>(null);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const scanCooldownRef = useRef(0);

  const hidratarDocumento = useCallback(async (d: DocumentoPlanejamento) => {
    setDocConsulta(deepClone(d));
    setMsgDoc(null);
    setCandidatosConsultaDoc(null);
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
    setCandidatosRecConsulta(null);
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

  /** Scroll automático só uma vez por sec=… — não repetir a cada loading (causa “tela a mexer sozinha”). */
  const scrolledForSecRef = useRef<string | null>(null);
  useEffect(() => {
    if (secFocus !== 'documentos' && secFocus !== 'recebimento') {
      scrolledForSecRef.current = null;
      return;
    }
    if (loading) return;
    if (scrolledForSecRef.current === secFocus) return;
    scrolledForSecRef.current = secFocus;
    const scrollToSection = () => {
      const y =
        secFocus === 'documentos'
          ? ySectionDocumentos.current
          : secFocus === 'recebimento'
            ? ySectionRecebimento.current
            : 0;
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
    };
    const t1 = setTimeout(scrollToSection, 350);
    return () => clearTimeout(t1);
  }, [secFocus, loading]);

  const docFiltradosRapido = useMemo(() => {
    if (docsEscalaOk) {
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

  const listaCompletaDocumentosParaExibir = useMemo(() => {
    if (docsEscalaOk) {
      if (!docConsulta) return docsCloud;
      const hit = docsCloud.find((d) => mesmoDocumentoSelecionado(docConsulta, d));
      return hit ? [hit] : [docConsulta];
    }
    const all = (payload?.documentos ?? []) as DocumentoPlanejamento[];
    if (!docConsulta) return all;
    const hit = all.find((d) => mesmoDocumentoSelecionado(docConsulta, d));
    return hit ? [hit] : [docConsulta];
  }, [docsEscalaOk, docsCloud, payload?.documentos, docConsulta]);

  const recFiltradosParaExibir = useMemo(() => {
    if (!recConsulta) return recFiltradosRapido;
    const hit = recFiltradosRapido.find((r) => mesmoRecebimentoSelecionado(recConsulta, r));
    return hit ? [hit] : [recConsulta];
  }, [recFiltradosRapido, recConsulta]);

  const listaBuscaUnificadaRecebimentos = useMemo(() => {
    if (recConsulta) return recFiltradosParaExibir;
    if (candidatosRecConsulta && candidatosRecConsulta.length > 0) return candidatosRecConsulta;
    return recFiltradosParaExibir;
  }, [recConsulta, candidatosRecConsulta, recFiltradosParaExibir]);

  const tituloListaRecebimentos = useMemo(() => {
    if (candidatosRecConsulta && candidatosRecConsulta.length > 0) {
      return `Escolha o recebimento (${candidatosRecConsulta.length}${candidatosRecConsulta.length >= 50 ? '+' : ''}) — toque para ver`;
    }
    if (recConsulta) {
      return 'Nota em consulta — altere o texto acima para voltar a ver todos os resultados filtrados';
    }
    if (recsEscalaOk) {
      return `Resultados (${recsCloud.length} de ${recsTotal}) — digite para filtrar · toque para ver`;
    }
    return `Resultados ao digitar (${listaBuscaUnificadaRecebimentos.length}${listaBuscaUnificadaRecebimentos.length >= 50 ? '+' : ''}) — toque para ver`;
  }, [
    candidatosRecConsulta,
    recConsulta,
    recsEscalaOk,
    recsCloud.length,
    recsTotal,
    listaBuscaUnificadaRecebimentos.length,
  ]);

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

  const buscarRecebimentoConsulta = useCallback(async () => {
    setMsgRec(null);
    setRecConsulta(null);
    setCandidatosRecConsulta(null);
    const alvo = norm(buscaRecNf);
    if (!alvo) {
      setMsgRec('Informe NF, romaneio ou trecho do fornecedor.');
      return;
    }
    const ok = await carregarPaginaRecebimentos(buscaRecNf);
    if (ok) {
      const list = (
        await listRecebimentosPageFromCloud({
          busca: buscaRecNf,
          offset: 0,
          limit: PAGE_SIZE_CONSULTA,
        })
      ).recebimentos.map(wireRecebimentoParaConsulta);
      const res = resolverBuscaRecebimentoPorNota(list, buscaRecNf);
      if (res.kind === 'none') {
        setMsgRec(`Nenhum recebimento combina com «${buscaRecNf.trim()}».`);
        return;
      }
      if (res.kind === 'one') {
        await hidratarRecebimento(res.rec);
        return;
      }
      if (res.kind === 'sameNotaVarios') {
        setMsgRec(`${res.recs.length} recebimentos com a mesma NF — a mostrar o primeiro.`);
        await hidratarRecebimento(res.recs[0]);
        return;
      }
      setCandidatosRecConsulta(res.recs);
      setMsgRec(`${res.recs.length} recebimentos correspondem — toque numa linha para ver.`);
      return;
    }
    const list = payload?.recebimentos as Recebimento[] | undefined;
    if (!list?.length) {
      setMsgRec('Carregue os dados da nuvem primeiro.');
      return;
    }
    const res = resolverBuscaRecebimentoPorNota(list, buscaRecNf);
    if (res.kind === 'none') {
      const ex = exemplosNotasRecebimentos(list, 6);
      setMsgRec(
        ex.length
          ? `Nenhum recebimento combina com «${buscaRecNf.trim()}». Exemplos de NF: ${ex.join(' · ')}.`
          : 'Nenhum recebimento encontrado.',
      );
      return;
    }
    if (res.kind === 'one') {
      await hidratarRecebimento(res.rec);
      return;
    }
    if (res.kind === 'sameNotaVarios') {
      setMsgRec(`${res.recs.length} recebimentos com a mesma NF — a mostrar o primeiro.`);
      await hidratarRecebimento(res.recs[0]);
      return;
    }
    setCandidatosRecConsulta(res.recs);
    setMsgRec(`${res.recs.length} recebimentos correspondem — toque numa linha para ver.`);
  }, [buscaRecNf, carregarPaginaRecebimentos, hidratarRecebimento, payload]);

  const buscarDocumentoConsulta = useCallback(async () => {
    setMsgDoc(null);
    setDocConsulta(null);
    setCandidatosConsultaDoc(null);
    const alvo = norm(buscaDoc);
    if (!alvo) {
      setMsgDoc('Informe o número do documento.');
      return;
    }
    const ok = await carregarPaginaDocumentos(buscaDoc);
    if (ok) {
      const list = (
        await listDocumentosPlanejamentoPageFromCloud({
          busca: buscaDoc,
          offset: 0,
          limit: PAGE_SIZE_CONSULTA,
        })
      ).documentos.map(wireDocumentoParaConsulta);
      const res = resolverBuscaDocumentoPorNumero(list, buscaDoc);
      if (res.kind === 'none') {
        setMsgDoc(`Nenhum desenho combina com «${buscaDoc.trim()}».`);
        return;
      }
      if (res.kind === 'one') {
        await hidratarDocumento(res.doc);
        return;
      }
      if (res.kind === 'sameNumeroVarios') {
        setMsgDoc(`${res.docs.length} documentos com o mesmo número — a mostrar o primeiro.`);
        await hidratarDocumento(res.docs[0]);
        return;
      }
      setCandidatosConsultaDoc(res.docs);
      setMsgDoc(`${res.docs.length} desenhos correspondem — toque numa linha para abrir.`);
      return;
    }
    if (!payload?.documentos?.length) {
      setMsgDoc('Carregue os dados da nuvem primeiro.');
      return;
    }
    const res = resolverBuscaDocumentoPorNumero(payload.documentos as DocumentoPlanejamento[], buscaDoc);
    if (res.kind === 'none') {
      const ex = exemplosNumerosDocumentos(payload.documentos as DocumentoPlanejamento[], 6);
      setMsgDoc(
        ex.length
          ? `Nenhum desenho combina com «${buscaDoc.trim()}». Exemplos: ${ex.join(' · ')}.`
          : 'Nenhum documento encontrado.',
      );
      return;
    }
    if (res.kind === 'one') {
      await hidratarDocumento(res.doc);
      return;
    }
    if (res.kind === 'sameNumeroVarios') {
      setMsgDoc(`${res.docs.length} documentos com o mesmo número — a mostrar o primeiro.`);
      await hidratarDocumento(res.docs[0]);
      return;
    }
    setCandidatosConsultaDoc(res.docs);
    setMsgDoc(`${res.docs.length} desenhos correspondem — toque numa linha para abrir.`);
  }, [buscaDoc, carregarPaginaDocumentos, hidratarDocumento, payload]);

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
        setCandidatosConsultaDoc(null);
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
        setCandidatosRecConsulta(null);
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

  /** Consulta por código: a partir de 3 caracteres, após pausa. */
  useDebouncedEffect(
    () => {
      if (!payload) return;
      const t = codigoConsulta.trim();
      if (t.length < 3) {
        setLinhasPorMaterial(null);
        setMaterialResolvido(null);
        setMsgCod(null);
        return;
      }
      void executarConsultaCodigo(codigoConsulta);
    },
    [codigoConsulta, payload, executarConsultaCodigo],
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

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={[styles.container, shell.screenPad]}
      keyboardShouldPersistTaps="handled"
    >
      <ModuleScreenHeader
        kicker="Só leitura · nuvem"
        title="Consulta"
        helpText={
          somenteRecebimento
            ? 'Pesquisa por nota fiscal, romaneio ou fornecedor. Não grava alterações.'
            : 'Desenhos no planejamento e consulta por código de material (inclui scan). Não grava alterações.'
        }
        showHelp={mostrarTextosAjudaModulos}
      />

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
      </View>

      <CloudSyncStrip configured={configured} error={loadErr} loading={loading && !payload} updatedAt={nuvemAt} />

      {payload ? (
        <StatPillRow
          items={
            somenteRecebimento
              ? [
                  { label: 'Recebimentos', value: recsEscalaOk ? recsTotal : (payload.recebimentos?.length ?? 0) },
                  { label: 'Materiais', value: payload.materiais?.length ?? 0 },
                  { label: 'Nesta página', value: recsCloud.length },
                ]
              : [
                  {
                    label: 'Total desenhos',
                    value: docsEscalaOk ? docsTotal : (payload.documentos?.length ?? 0),
                    tone: 'emphasis' as const,
                  },
                  { label: 'Materiais', value: payload.materiais?.length ?? 0 },
                  { label: 'Nesta página', value: docsCloud.length },
                ]
          }
        />
      ) : null}

      <PrimaryActionButton disabled={loading} label="Carregar dados da nuvem" loading={loading} onPress={carregarNuvem} />
      {somenteDocumentos && payload && docsEscalaOk && docsTotal === 0 && !msgDoc ? (
        <Text style={styles.warn}>
          Ainda não há desenhos nas tabelas de escala (por isso o total está 0). Isto não deixa o telemóvel lento — a
          pesquisa continua paginada. Toque em «Carregar dados da nuvem» outra vez ou, no PC, em Configurações, active a
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
      <View
        onLayout={(e) => {
          ySectionDocumentos.current = e.nativeEvent.layout.y;
        }}
      >
      <Text style={styles.subTit}>Desenhos cadastrados</Text>
      {mostrarTextosAjudaModulos ? (
        <Text style={styles.hintSmall}>
          Pesquisa na nuvem (paginada). O total no contador vem da nuvem sem baixar todos os desenhos — mesmo com 20 mil
          cadastrados o telemóvel não fica lento. Digite número ou descrição; toque para abrir o detalhe.
          {buscandoDocs ? ' A actualizar…' : ''}
        </Text>
      ) : null}
      <TextInput
        style={styles.input}
        placeholder="Comece a digitar — resultados na hora"
        placeholderTextColor={colors.placeholder}
        value={buscaDoc}
        onChangeText={(t) => {
          setBuscaDoc(t);
          setDocConsulta(null);
          setCandidatosConsultaDoc(null);
          setMsgDoc(null);
        }}
        autoCapitalize="characters"
      />
      {payload && (docsEscalaOk ? docsCloud.length > 0 || buscaDoc.trim().length > 0 : (payload.documentos?.length ?? 0) > 0) &&
      buscaDoc.trim().length > 0 ? (
        <View style={{ marginBottom: 12 }}>
          <Text style={[styles.hintSmall, { fontWeight: '700', marginBottom: 8 }]}>
            {docConsulta
              ? 'Documento em consulta — altere o texto acima para voltar a ver todos os resultados filtrados'
              : docsEscalaOk
                ? `Resultados (${docFiltradosParaExibir.length} de ${docsTotal} cadastrados) — toque para ver`
                : `Resultados ao digitar (${docFiltradosParaExibir.length}${docFiltradosParaExibir.length >= 50 ? '+' : ''}) — toque para ver`}
          </Text>
          {docFiltradosParaExibir.length === 0 ? (
            <Text style={styles.warn}>
              Nenhum desenho combina com «{buscaDoc.trim()}». Tente outro trecho do número ou da descrição.
            </Text>
          ) : (
            <FlatList
              style={{ maxHeight: 280 }}
              nestedScrollEnabled
              scrollEnabled={false}
              keyboardShouldPersistTaps="handled"
              data={docFiltradosParaExibir}
              keyExtractor={(d) => `rapido-${String(d.id)}-${String(d.numero)}-${String(d.revisao)}`}
              initialNumToRender={14}
              maxToRenderPerBatch={16}
              windowSize={5}
              removeClippedSubviews
              renderItem={({ item: d }) => {
                const sel = mesmoDocumentoSelecionado(docConsulta, d);
                return (
                  <Pressable
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
              }}
            />
          )}
        </View>
      ) : null}
      {payload && docsEscalaOk && buscaDoc.trim().length === 0 ? (
        <View style={{ marginBottom: 12 }}>
          <Text style={[styles.hintSmall, { fontWeight: '700', marginBottom: 8 }]}>
            {docConsulta
              ? 'Documento em consulta — use a pesquisa para localizar outro desenho'
              : `Total ${docsTotal} desenhos · a mostrar ${docsCloud.length} — digite para filtrar · toque para ver`}
          </Text>
          <FlatList
            style={{ maxHeight: 220 }}
            nestedScrollEnabled
            scrollEnabled={false}
            keyboardShouldPersistTaps="handled"
            data={listaCompletaDocumentosParaExibir}
            keyExtractor={(d) => `lista-doc-${String(d.id)}-${String(d.numero)}-${String(d.revisao)}`}
            initialNumToRender={12}
            maxToRenderPerBatch={14}
            windowSize={5}
            removeClippedSubviews
            renderItem={({ item: d }) => {
              const sel = mesmoDocumentoSelecionado(docConsulta, d);
              return (
                <Pressable
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
            }}
          />
        </View>
      ) : null}
      <Pressable
        style={[styles.btnSec, (!payload || loading || buscandoDocs) && styles.btnOff]}
        onPress={() => void buscarDocumentoConsulta()}
        disabled={!payload || loading || buscandoDocs}
      >
        <Text style={styles.btnTextSec}>Buscar documento</Text>
      </Pressable>
      {msgDoc ? <Text style={styles.warn}>{msgDoc}</Text> : null}
      {candidatosConsultaDoc && candidatosConsultaDoc.length > 0 ? (
        <View style={{ marginBottom: 12, maxHeight: 320 }}>
          <FlatList
            nestedScrollEnabled
            scrollEnabled={false}
            keyboardShouldPersistTaps="handled"
            data={candidatosConsultaDoc}
            keyExtractor={(d) => `cand-${String(d.id)}-${String(d.numero)}`}
            initialNumToRender={12}
            maxToRenderPerBatch={14}
            windowSize={5}
            removeClippedSubviews
            renderItem={({ item: d }) => {
              const sel = mesmoDocumentoSelecionado(docConsulta, d);
              return (
                <Pressable
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
              }}
            />
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
            return (
              <View key={i} style={[styles.row, semSaldo && styles.rowSemSaldo]}>
                <View style={styles.rowTxt}>
                  <Text style={[styles.cod, semSaldo && styles.codSemSaldo]}>{it.codigo}</Text>
                  <Text style={[styles.desc, semSaldo && styles.descSemSaldo]} numberOfLines={3}>
                    {it.descricao}
                  </Text>
                  <Text style={[styles.meta2, semSaldo && styles.metaSemSaldo]}>
                    Projeto: {formatQuantidadeExibicao(qProj)} {it.unidade ?? ''} · Já atendido:{' '}
                    {formatQuantidadeExibicao(qAt)} · Restante: {formatQuantidadeExibicao(rest)}
                  </Text>
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
      <View
        onLayout={(e) => {
          ySectionRecebimento.current = e.nativeEvent.layout.y;
        }}
      >
      <Text style={styles.subTit}>Recebimento — materiais recebidos (NF / romaneio)</Text>
      {mostrarTextosAjudaModulos ? (
        <Text style={styles.hintSmall}>
          Pesquisa paginada na nuvem (NF, romaneio, fornecedor). Não baixa a lista completa — adequado a grandes volumes.
          {buscandoRecs ? ' A actualizar…' : ''}
        </Text>
      ) : null}
      <TextInput
        style={styles.input}
        placeholder="Ex.: NF, romaneio, fornecedor ou código do item"
        placeholderTextColor={colors.placeholder}
        value={buscaRecNf}
        onChangeText={(t) => {
          setBuscaRecNf(t);
          setRecConsulta(null);
          setCandidatosRecConsulta(null);
          setMsgRec(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {payload && (recsEscalaOk ? recsCloud.length > 0 || buscaRecNf.trim().length > 0 : (payload.recebimentos?.length ?? 0) > 0) &&
      (buscaRecNf.trim().length > 0 || recsEscalaOk) ? (
        <View style={{ marginBottom: 12 }}>
          <Text style={[styles.hintSmall, { fontWeight: '700', marginBottom: 8 }]}>{tituloListaRecebimentos}</Text>
          {listaBuscaUnificadaRecebimentos.length === 0 ? (
            <Text style={styles.warn}>
              Nenhum recebimento combina com «{buscaRecNf.trim()}». Tente outro trecho da NF, fornecedor ou código.
            </Text>
          ) : (
            <FlatList
              style={{ maxHeight: 280 }}
              nestedScrollEnabled
              scrollEnabled={false}
              keyboardShouldPersistTaps="handled"
              data={listaBuscaUnificadaRecebimentos}
              keyExtractor={(r) => `rec-busca-${String(r.id)}`}
              initialNumToRender={14}
              maxToRenderPerBatch={16}
              windowSize={5}
              removeClippedSubviews
              renderItem={({ item: r }) => {
                const sel = mesmoRecebimentoSelecionado(recConsulta, r);
                return (
                  <Pressable
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
              }}
            />
          )}
        </View>
      ) : null}
      <Pressable
        style={[styles.btnSec, (!payload || loading || buscandoRecs) && styles.btnOff]}
        onPress={() => void buscarRecebimentoConsulta()}
        disabled={!payload || loading || buscandoRecs}
      >
        <Text style={styles.btnTextSec}>Buscar recebimento</Text>
      </Pressable>
      {msgRec ? <Text style={styles.warn}>{msgRec}</Text> : null}

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
                <Text style={styles.meta2}>
                  Qtd NF: {String(it.quantidade ?? '—')} {it.unidade ? ` ${it.unidade}` : ''}
                  {it.quantidadeConferida !== undefined && it.quantidadeConferida !== null && String(it.quantidadeConferida).trim() !== ''
                    ? ` · Qtd conf.: ${String(it.quantidadeConferida)}`
                    : ''}
                </Text>
                {String((it as RecebimentoItem).localizacao ?? '').trim() ? (
                  <Text style={[styles.meta2, { marginTop: 4 }]} numberOfLines={2}>
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

      {somenteDocumentos ? (
      <>
      <Text style={styles.subTit}>Por código ou código de barras</Text>
      {mostrarTextosAjudaModulos ? (
        <Text style={styles.hintSmall}>
          A partir de 3 caracteres, a consulta atualiza sozinha após uma pausa. Filtra os desenhos onde o material entra; em vermelho o que já foi
          totalmente atendido neste desenho.
        </Text>
      ) : null}
      <TextInput
        style={styles.input}
        placeholder="Código do material ou leitura do código de barras"
        placeholderTextColor={colors.placeholder}
        value={codigoConsulta}
        onChangeText={setCodigoConsulta}
        autoCapitalize="none"
        autoCorrect={false}
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
                  Restante neste desenho (soma das linhas do código):{' '}
                  {formatQuantidadeExibicao(restanteMaterial)}
                </Text>
                {semSaldo ? <Text style={styles.badgeSemSaldo}>Sem saldo neste desenho</Text> : null}
              </View>
            );
          })}
        </View>
      ) : null}
      </>
      ) : null}

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
    </ScrollView>
  );
}

