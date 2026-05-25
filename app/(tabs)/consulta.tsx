import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useDebouncedEffect } from '@/src/lib/useDebouncedEffect';
import { buildConsultaStyles } from '@/src/theme/buildConsultaStyles';
import { useMobileUiPreferences } from '@/src/theme/MobileUiPreferencesContext';
import { useTheme } from '@/src/theme/ThemeContext';
import {
  ActivityIndicator,
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
import { fetchDefaultSnapshot } from '@/src/lib/snapshot';
import { useSnapshotRefreshOnAppActive } from '@/src/lib/useSnapshotRefreshOnAppActive';
import { hasSupabaseConfig } from '@/src/lib/config';
import { formatarDataHoraLocal } from '@/src/lib/formatData';
import { formatQuantidadeExibicao } from '@/src/lib/formatQuantidade';
import { playScanBeep } from '@/src/lib/playScanBeep';
import {
  encontrarMaterialPorCodigoOuBarras,
  extrairCodigoMaterialDeTextoLeitura,
  listarDocumentosPorMaterialConsulta,
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
import type {
  DocumentoItemPlanejamento,
  DocumentoPlanejamento,
  IsoSnapshotPayload,
  Material,
  Recebimento,
  RecebimentoItem,
} from 'iso-pro-shared';

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

export default function ConsultaScreen() {
  const { sec: secParam } = useLocalSearchParams<{ sec?: string | string[] }>();
  const secFocus =
    typeof secParam === 'string' ? secParam : Array.isArray(secParam) ? secParam[0] : undefined;
  /** `recebimento` = só NF/recebimentos; resto (aba Documentos ou `?sec=documentos`) = desenhos + código/barras. */
  const somenteRecebimento = secFocus === 'recebimento';
  const somenteDocumentos = !somenteRecebimento;

  const { colors } = useTheme();
  const { mostrarTextosAjudaModulos } = useMobileUiPreferences();
  const styles = useMemo(() => buildConsultaStyles(colors), [colors]);
  const configured = useMemo(() => hasSupabaseConfig(), []);
  const scrollRef = useRef<ScrollView>(null);
  const ySectionDocumentos = useRef(0);
  const ySectionRecebimento = useRef(0);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [nuvemAt, setNuvemAt] = useState<string | null>(null);
  const [payload, setPayload] = useState<IsoSnapshotPayload | null>(null);

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
      setPayload(p ? deepClone(p) : null);
      setNuvemAt(updatedAt);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void carregarNuvem();
    }, [carregarNuvem]),
  );

  useSnapshotRefreshOnAppActive(carregarNuvem);

  useEffect(() => {
    if (secFocus !== 'documentos' && secFocus !== 'recebimento') return;
    if (loading) return;
    const scrollToSection = () => {
      const y =
        secFocus === 'documentos'
          ? ySectionDocumentos.current
          : secFocus === 'recebimento'
            ? ySectionRecebimento.current
            : 0;
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
    };
    const t1 = setTimeout(scrollToSection, 400);
    const t2 = setTimeout(scrollToSection, 900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [secFocus, loading]);

  const docFiltradosRapido = useMemo(() => {
    const list = payload?.documentos as DocumentoPlanejamento[] | undefined;
    if (!list?.length) return [];
    const t = buscaDoc.trim();
    if (t.length < 1) return [];
    return filtrarDocumentosPlanejamentoPorTexto(list, buscaDoc, 50);
  }, [payload?.documentos, buscaDoc]);

  const recFiltradosRapido = useMemo(() => {
    const list = payload?.recebimentos as Recebimento[] | undefined;
    if (!list?.length) return [];
    const t = buscaRecNf.trim();
    if (t.length < 1) return [];
    return filtrarRecebimentosPorTextoInteligente(list, buscaRecNf, 50);
  }, [payload?.recebimentos, buscaRecNf]);

  /** Com documento escolhido, a lista mostra só esse resultado (não todas as linhas filtradas). */
  const docFiltradosParaExibir = useMemo(() => {
    if (!docConsulta) return docFiltradosRapido;
    const hit = docFiltradosRapido.find((d) => mesmoDocumentoSelecionado(docConsulta, d));
    return hit ? [hit] : [docConsulta];
  }, [docFiltradosRapido, docConsulta]);

  const listaCompletaDocumentosParaExibir = useMemo(() => {
    const all = (payload?.documentos ?? []) as DocumentoPlanejamento[];
    if (!docConsulta) return all;
    const hit = all.find((d) => mesmoDocumentoSelecionado(docConsulta, d));
    return hit ? [hit] : [docConsulta];
  }, [payload?.documentos, docConsulta]);

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
    return `Resultados ao digitar (${listaBuscaUnificadaRecebimentos.length}${listaBuscaUnificadaRecebimentos.length >= 50 ? '+' : ''}) — toque para ver`;
  }, [candidatosRecConsulta, recConsulta, listaBuscaUnificadaRecebimentos.length]);

  const tentarAutoSelecionarConsulta = useCallback(() => {
    if (!payload?.documentos?.length) return;
    const raw = buscaDoc.trim();
    if (raw.length < 1) return;
    const res = resolverBuscaDocumentoPorNumero(payload.documentos as DocumentoPlanejamento[], buscaDoc);
    if (res.kind === 'one') {
      setDocConsulta(deepClone(res.doc));
      setMsgDoc(null);
      setCandidatosConsultaDoc(null);
      return;
    }
    if (res.kind === 'sameNumeroVarios') {
      setDocConsulta(deepClone(res.docs[0]));
      setMsgDoc(null);
      setCandidatosConsultaDoc(null);
    }
  }, [buscaDoc, payload]);

  const tentarAutoSelecionarRecConsulta = useCallback(() => {
    const list = payload?.recebimentos as Recebimento[] | undefined;
    if (!list?.length) return;
    const raw = buscaRecNf.trim();
    if (raw.length < 1) return;
    const res = resolverBuscaRecebimentoPorNota(list, buscaRecNf);
    if (res.kind === 'one') {
      setRecConsulta(deepClone(res.rec));
      setMsgRec(null);
      setCandidatosRecConsulta(null);
      return;
    }
    if (res.kind === 'sameNotaVarios') {
      setRecConsulta(deepClone(res.recs[0]));
      setMsgRec(null);
      setCandidatosRecConsulta(null);
    }
  }, [buscaRecNf, payload]);

  const buscarRecebimentoConsulta = useCallback(() => {
    setMsgRec(null);
    setRecConsulta(null);
    setCandidatosRecConsulta(null);
    const list = payload?.recebimentos as Recebimento[] | undefined;
    if (!list?.length) {
      setMsgRec('Carregue os dados da nuvem primeiro.');
      return;
    }
    const alvo = norm(buscaRecNf);
    if (!alvo) {
      setMsgRec('Informe NF, romaneio ou trecho do fornecedor.');
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
      setRecConsulta(deepClone(res.rec));
      setMsgRec(null);
      return;
    }
    if (res.kind === 'sameNotaVarios') {
      setMsgRec(`${res.recs.length} recebimentos com a mesma NF — a mostrar o primeiro.`);
      setRecConsulta(deepClone(res.recs[0]));
      return;
    }
    setCandidatosRecConsulta(res.recs);
    setMsgRec(`${res.recs.length} recebimentos correspondem — toque numa linha para ver.`);
  }, [buscaRecNf, payload]);

  const buscarDocumentoConsulta = useCallback(() => {
    setMsgDoc(null);
    setDocConsulta(null);
    setCandidatosConsultaDoc(null);
    if (!payload?.documentos?.length) {
      setMsgDoc('Carregue os dados da nuvem primeiro.');
      return;
    }
    const alvo = norm(buscaDoc);
    if (!alvo) {
      setMsgDoc('Informe o número do documento.');
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
      setDocConsulta(deepClone(res.doc));
      setMsgDoc(null);
      return;
    }
    if (res.kind === 'sameNumeroVarios') {
      setMsgDoc(`${res.docs.length} documentos com o mesmo número — a mostrar o primeiro.`);
      setDocConsulta(deepClone(res.docs[0]));
      return;
    }
    setCandidatosConsultaDoc(res.docs);
    setMsgDoc(`${res.docs.length} desenhos correspondem — toque numa linha para abrir.`);
  }, [buscaDoc, payload]);

  const executarConsultaCodigo = useCallback(
    (termo: string) => {
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
      const lista = listarDocumentosPorMaterialConsulta(payload, String(mat.codigo));
      setMaterialResolvido(mat);
      setCodigoConsulta(String(mat.codigo ?? t));
      if (lista.length === 0) {
        setMsgCod('Este material não aparece em nenhum documento do planejamento.');
        return;
      }
      const totalRest = lista.reduce((s, x) => s + x.restanteMaterial, 0);
      if (totalRest <= 0) {
        setMsgCod('Este item não possui saldo no sistema — toda a quantidade já foi atendida no planejamento.');
      } else {
        setMsgCod(null);
      }
      setLinhasPorMaterial(lista);
    },
    [payload]
  );

  const consultarPorCodigo = useCallback(() => {
    executarConsultaCodigo(codigoConsulta);
  }, [codigoConsulta, executarConsultaCodigo]);

  /** Pausa curta: abre sozinho se a busca inteligente tiver um único desenho claro. */
  useDebouncedEffect(
    () => {
      if (!payload?.documentos?.length) return;
      const raw = buscaDoc.trim();
      if (raw.length < 1) {
        setDocConsulta(null);
        setMsgDoc(null);
        setCandidatosConsultaDoc(null);
        return;
      }
      tentarAutoSelecionarConsulta();
    },
    [buscaDoc, payload, tentarAutoSelecionarConsulta],
    200,
  );

  useDebouncedEffect(
    () => {
      const list = payload?.recebimentos as Recebimento[] | undefined;
      if (!list?.length) return;
      const raw = buscaRecNf.trim();
      if (raw.length < 1) {
        setRecConsulta(null);
        setMsgRec(null);
        setCandidatosRecConsulta(null);
        return;
      }
      tentarAutoSelecionarRecConsulta();
    },
    [buscaRecNf, payload, tentarAutoSelecionarRecConsulta],
    200,
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
      executarConsultaCodigo(codigoConsulta);
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
        <Text style={styles.title}>{somenteRecebimento ? 'Recebimentos' : 'Documentos'}</Text>
        <Text style={styles.hint}>Configura o Supabase no `.env` como nas outras abas.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>{somenteRecebimento ? 'Recebimentos' : 'Documentos'}</Text>
      {mostrarTextosAjudaModulos ? (
        <Text style={styles.hint}>
          {somenteRecebimento
            ? 'Só leitura: pesquisa por nota fiscal, romaneio ou fornecedor. Não grava alterações.'
            : 'Só leitura: desenhos no planejamento e consulta por código de material (inclui scan). Não grava alterações.'}
        </Text>
      ) : null}

      <Pressable style={[styles.btn, loading && styles.btnOff]} onPress={carregarNuvem} disabled={loading}>
        {loading ? <ActivityIndicator color={colors.text} /> : <Text style={styles.btnText}>Carregar dados da nuvem</Text>}
      </Pressable>
      {nuvemAt ? <Text style={styles.meta}>Snapshot: {formatarDataHoraLocal(nuvemAt)}</Text> : null}
      {payload ? (
        <Text style={styles.meta}>
          {somenteRecebimento ? (
            <>
              {payload.recebimentos?.length ?? 0} recebimento(s) · {payload.materiais?.length ?? 0} material(is) ·{' '}
              {payload.colaboradores?.length ?? 0} colaborador(es)
            </>
          ) : (
            <>
              {payload.documentos?.length ?? 0} documento(s) · {payload.materiais?.length ?? 0} material(is) ·{' '}
              {payload.colaboradores?.length ?? 0} colaborador(es)
            </>
          )}
        </Text>
      ) : null}
      {somenteDocumentos &&
      payload &&
      (payload.documentos?.length ?? 0) === 0 &&
      (payload.materiais?.length ?? 0) > 0 ? (
        <View style={styles.warnDestaque}>
          <Text style={styles.warnDestaqueTit}>Desenhos ainda não estão na nuvem</Text>
          <Text style={styles.warnDestaqueTxt}>
            Há {payload.materiais!.length} material(is) no snapshot, mas 0 desenhos. No PC, em Documentos, use «Enviar planejamento deste PC
            para a nuvem (mobile)» e volte a carregar aqui.
          </Text>
        </View>
      ) : null}
      {somenteDocumentos &&
      payload &&
      (payload.documentos?.length ?? 0) === 0 &&
      (payload.materiais?.length ?? 0) === 0 ? (
        <Text style={styles.warn}>
          Lista de desenhos vazia. Envie o planejamento do PC para a nuvem (Documentos no I.S.O PRO) ou confira o `.env` e o projeto Supabase.
        </Text>
      ) : null}
      {somenteRecebimento && payload && (payload.recebimentos?.length ?? 0) === 0 ? (
        <Text style={styles.warn}>
          Nenhum recebimento no snapshot. Envie o planejamento a partir do I.S.O PRO no PC ou confira o snapshot na nuvem.
        </Text>
      ) : null}
      {loadErr ? <Text style={styles.err}>{loadErr}</Text> : null}

      {somenteDocumentos ? (
      <View
        onLayout={(e) => {
          ySectionDocumentos.current = e.nativeEvent.layout.y;
        }}
      >
      <Text style={styles.subTit}>Documentos cadastrados (desenho)</Text>
      {mostrarTextosAjudaModulos ? (
        <Text style={styles.hintSmall}>
          A lista filtra enquanto digita (número, descrição, etc.). Com o campo vazio, vê todos os desenhos. Pausa curta: pode abrir sozinho se
          houver só um resultado claro.
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
      {payload && (payload.documentos?.length ?? 0) > 0 && buscaDoc.trim().length > 0 ? (
        <View style={{ marginBottom: 12 }}>
          <Text style={[styles.hintSmall, { fontWeight: '700', marginBottom: 8 }]}>
            {docConsulta
              ? 'Documento em consulta — altere o texto acima para voltar a ver todos os resultados filtrados'
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
                      setDocConsulta(deepClone(d));
                      setMsgDoc(null);
                      setCandidatosConsultaDoc(null);
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
      {payload && (payload.documentos?.length ?? 0) > 0 && buscaDoc.trim().length === 0 ? (
        <View style={{ marginBottom: 12 }}>
          <Text style={[styles.hintSmall, { fontWeight: '700', marginBottom: 8 }]}>
            {docConsulta
              ? 'Documento em consulta — use a pesquisa para localizar outro desenho'
              : `Todos os desenhos (${payload.documentos!.length}) — toque para ver`}
          </Text>
          {mostrarTextosAjudaModulos && payload.documentos!.length > 400 && !docConsulta ? (
            <Text style={[styles.hintSmall, { marginBottom: 8 }]}>
              Lista grande: prefira filtrar pelo campo acima — a lista completa continua abaixo.
            </Text>
          ) : null}
          <FlatList
            style={{ maxHeight: 220 }}
            nestedScrollEnabled
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
                    setDocConsulta(deepClone(d));
                    setMsgDoc(null);
                    setCandidatosConsultaDoc(null);
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
      <Pressable style={[styles.btnSec, (!payload || loading) && styles.btnOff]} onPress={buscarDocumentoConsulta} disabled={!payload || loading}>
        <Text style={styles.btnTextSec}>Buscar documento</Text>
      </Pressable>
      {msgDoc ? <Text style={styles.warn}>{msgDoc}</Text> : null}
      {candidatosConsultaDoc && candidatosConsultaDoc.length > 0 ? (
        <View style={{ marginBottom: 12, maxHeight: 320 }}>
          <FlatList
            nestedScrollEnabled
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
                    setDocConsulta(deepClone(d));
                    setMsgDoc(null);
                    setCandidatosConsultaDoc(null);
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
          Pesquisa: trecho da NF, romaneio, fornecedor ou código de material nas linhas. A lista filtra enquanto digita; pausa curta pode abrir
          sozinho se houver um único resultado claro. Só leitura.
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
      {payload && (payload.recebimentos?.length ?? 0) > 0 && buscaRecNf.trim().length > 0 ? (
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
                      setRecConsulta(deepClone(r));
                      setMsgRec(null);
                      setCandidatosRecConsulta(null);
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
        style={[styles.btnSec, (!payload || loading) && styles.btnOff]}
        onPress={buscarRecebimentoConsulta}
        disabled={!payload || loading}
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

