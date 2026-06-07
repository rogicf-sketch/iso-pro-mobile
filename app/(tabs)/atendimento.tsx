import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  BackHandler,
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
import { getAtendenteRegisto } from '@/src/lib/atendenteSessao';
import { useDebouncedEffect } from '@/src/lib/useDebouncedEffect';
import { fetchDefaultSnapshot } from '@/src/lib/snapshot';
import { commitDefaultSnapshotWriteResilient as commitDefaultSnapshotWrite } from '@/src/lib/offlineSnapshotQueue';
import { rotuloBotaoConfirmarGravacaoSnapshot } from '@/src/lib/snapshotWriteFeedback';
import { useSnapshotRefreshOnAppActive } from '@/src/lib/useSnapshotRefreshOnAppActive';
import { hasSupabaseConfig } from '@/src/lib/config';
import {
  aplicarAtendimentoLote,
  aplicarAtendimentoPorCodigoBarras,
  encontrarMaterialPorCodigoOuBarras,
  extrairCodigoMaterialDeTextoLeitura,
  resolverMaterialParaBaixaPorCodigo,
  codigoNaLinhaPlanejamento,
  descricaoNaLinhaPlanejamento,
  quantidadeAtendidaLinha,
  listarDocumentosComDemandaPendenteMaterial,
  montarHtmlReciboSessaoUnificada,
  montarTextoReciboSessaoUnificada,
  type LinhaSessaoAtendimento,
} from '@/src/lib/registrarAtendimento';
import {
  exemplosNumerosDocumentos,
  filtrarDocumentosPlanejamentoPorTexto,
  resolverBuscaDocumentoPorNumero,
} from '@/src/lib/documentoBusca';
import { formatarDataHoraLocal } from '@/src/lib/formatData';
import { formatQuantidadeExibicao } from '@/src/lib/formatQuantidade';
import {
  abrirWhatsAppComTexto,
  compartilharTexto,
  imprimirComprovanteHtml,
} from '@/src/lib/comprovanteAcao';
import { resolverRecebedorColaborador } from '@/src/lib/recebedorColaborador';
import { buildSaldoOperacionalParaAtendimento, codigoMaterialKey } from '@/src/lib/saldoMaterial';
import { playScanBeep } from '@/src/lib/playScanBeep';
import { registerAtendimentoSessaoGate } from '@/src/lib/atendimentoSessaoGate';
import { buildAtendimentoStyles } from '@/src/theme/buildAtendimentoStyles';
import { useMobileUiPreferences } from '@/src/theme/MobileUiPreferencesContext';
import { useTheme } from '@/src/theme/ThemeContext';
import type {
  Colaborador,
  DocumentoItemPlanejamento,
  DocumentoPlanejamento,
  IsoSnapshotPayload,
  Material,
} from 'iso-pro-shared';

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function mesmoDocumentoReferencia(a: DocumentoPlanejamento | null, b: DocumentoPlanejamento): boolean {
  if (!a) return false;
  return String(a.id) === String(b.id);
}

export default function AtendimentoScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { mostrarTextosAjudaModulos } = useMobileUiPreferences();
  const styles = useMemo(() => buildAtendimentoStyles(colors), [colors]);
  const configured = useMemo(() => hasSupabaseConfig(), []);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [nuvemAt, setNuvemAt] = useState<string | null>(null);
  const [payload, setPayload] = useState<IsoSnapshotPayload | null>(null);

  const [buscaDoc, setBuscaDoc] = useState('');
  const [msgBusca, setMsgBusca] = useState<string | null>(null);
  const [candidatosBuscaDoc, setCandidatosBuscaDoc] = useState<DocumentoPlanejamento[] | null>(null);
  const [doc, setDoc] = useState<DocumentoPlanejamento | null>(null);
  const [qtdLinha, setQtdLinha] = useState<Record<number, string>>({});
  const [recebedor, setRecebedor] = useState('');
  const [mostrarSugestoesRecebedor, setMostrarSugestoesRecebedor] = useState(false);
  const blurSugestoesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mostrarListaDocsMaterial, setMostrarListaDocsMaterial] = useState(false);
  const blurDocsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [codigoBarras, setCodigoBarras] = useState('');
  const [qtdBarras, setQtdBarras] = useState('1');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const scanCooldownRef = useRef(0);
  /** Último código de material usado no fluxo por scan — para limpar o desenho ao mudar de item. */
  const prevCodigoAlvoPlanejamentoRef = useRef<string | null>(null);
  const sessaoAtendimentoRef = useRef<LinhaSessaoAtendimento[]>([]);
  /** Sessão atual: próximo registo (código ou desenho) reutiliza o mesmo ATD na nuvem até finalizar ou mudar recebedor. */
  const sessaoCodigoBarrasLoteRef = useRef<{ loteNumero: string; loteId: number } | null>(null);
  const [sessaoAtendimentoItens, setSessaoAtendimentoItens] = useState<LinhaSessaoAtendimento[]>([]);
  const [comprovanteModal, setComprovanteModal] = useState<{
    texto: string;
    htmlImpressao: string;
    onFechar?: () => void;
  } | null>(null);

  useEffect(() => {
    if (scannerOpen) scanCooldownRef.current = 0;
  }, [scannerOpen]);

  useEffect(() => {
    sessaoAtendimentoRef.current = [];
    sessaoCodigoBarrasLoteRef.current = null;
    setSessaoAtendimentoItens([]);
  }, [recebedor]);

  const limparSessaoAtendimentoLocal = useCallback(() => {
    sessaoAtendimentoRef.current = [];
    sessaoCodigoBarrasLoteRef.current = null;
    setSessaoAtendimentoItens([]);
  }, []);

  useEffect(() => {
    registerAtendimentoSessaoGate({
      hasSessaoAberta: () => sessaoAtendimentoRef.current.length > 0,
      limparSessaoLocal: limparSessaoAtendimentoLocal,
    });
    return () => registerAtendimentoSessaoGate(null);
  }, [limparSessaoAtendimentoLocal]);

  useFocusEffect(
    useCallback(() => {
      const tabNav = navigation.getParent();
      const onBack = () => {
        if (sessaoAtendimentoRef.current.length === 0) return false;
        appAlert(
          'Atendimento em curso',
          'Ainda há uma sessão aberta: existem baixas neste atendimento que não foram encerradas com «Finalizar sessão — comprovante único». Os registos já estão na nuvem; pode voltar aqui depois para emitir o comprovante.\n\nDeseja mesmo sair?',
          [
            { text: 'Continuar o atendimento', style: 'cancel' },
            {
              text: 'Sair',
              style: 'destructive',
              onPress: () => {
                limparSessaoAtendimentoLocal();
                tabNav?.navigate('index' as never);
              },
            },
          ],
        );
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation, limparSessaoAtendimentoLocal]),
  );

  useEffect(() => {
    return () => {
      if (blurSugestoesTimer.current) clearTimeout(blurSugestoesTimer.current);
      if (blurDocsTimer.current) clearTimeout(blurDocsTimer.current);
    };
  }, []);

  const materialDoScan = useMemo(() => {
    if (!payload) return null;
    const t = codigoBarras.trim();
    if (!t) return null;
    return resolverMaterialParaBaixaPorCodigo(payload, t);
  }, [payload, codigoBarras]);

  /**
   * Código canónico para cruzar com linhas do planejamento: cadastro, linha do desenho (resolver) ou texto lido.
   * Importante: leitura 1D só traz o hash numérico — tem de convergir para o mesmo código da linha que `resolverMaterialParaBaixaPorCodigo`.
   */
  const codigoAlvoPlanejamento = useMemo(() => {
    const t = codigoBarras.trim();
    if (!t || !payload) return null;
    const matCad = encontrarMaterialPorCodigoOuBarras(payload.materiais as Material[], t);
    if (matCad?.codigo) return String(matCad.codigo);
    const resolv = resolverMaterialParaBaixaPorCodigo(payload, t);
    if (resolv?.codigo) return String(resolv.codigo);
    return extrairCodigoMaterialDeTextoLeitura(t);
  }, [codigoBarras, payload]);

  /** Recebimentos − já atendido (+ ajustes) — igual ao I.S.O PRO desktop; necessário para permitir atendimento. */
  const saldoPorCodigo = useMemo(() => {
    if (!payload) return null;
    return buildSaldoOperacionalParaAtendimento(payload);
  }, [payload]);

  const docsComPendenteMaterial = useMemo(() => {
    if (!payload || !codigoAlvoPlanejamento) return [];
    return listarDocumentosComDemandaPendenteMaterial(payload, codigoAlvoPlanejamento);
  }, [payload, codigoAlvoPlanejamento]);

  /** Vários desenhos com pendência para o código → lista de escolha (só desenhos onde dá baixa). */
  useEffect(() => {
    if (codigoAlvoPlanejamento && docsComPendenteMaterial.length > 1) {
      setMostrarListaDocsMaterial(true);
    }
  }, [codigoAlvoPlanejamento, docsComPendenteMaterial.length]);

  const sugestoesRecebedor = useMemo(() => {
    const list = (payload?.colaboradores ?? []) as Colaborador[];
    const q = recebedor.trim().toLowerCase();
    if (!q) return [];
    return list
      .filter((c) => {
        const n = (c.nome || '').toLowerCase();
        const m = String(c.matricula ?? '').toLowerCase();
        const f = (c.funcao || '').toLowerCase();
        return n.includes(q) || m.includes(q) || f.includes(q);
      })
      .slice(0, 20);
  }, [payload?.colaboradores, recebedor]);

  /** Nome/mat. exatos do cadastro — obrigatório para registar atendimento. */
  const recebedorResolvido = useMemo(() => {
    if (!payload?.colaboradores?.length) return null;
    return resolverRecebedorColaborador(recebedor, payload.colaboradores as Colaborador[]);
  }, [recebedor, payload?.colaboradores]);

  const snapshotCarregado = Boolean(payload);
  const docReferenciaOk = Boolean(doc);
  /** Nuvem carregada + recebedor válido (ex.: finalizar comprovante da sessão). */
  const baseNuvemRecebedor =
    snapshotCarregado && Boolean(nuvemAt) && recebedorResolvido?.ok === true;
  /** Regra do sistema: toda baixa (linhas ou código) exige documento de referência aberto. */
  const podeRegistarAtendimentoBase = baseNuvemRecebedor && docReferenciaOk;

  const saldoEstoqueMaterialBarras = useMemo(() => {
    if (!saldoPorCodigo) return null;
    const t = codigoBarras.trim();
    if (!t) return null;
    const chave =
      (codigoAlvoPlanejamento && codigoAlvoPlanejamento.trim()) ||
      (materialDoScan?.codigo ? String(materialDoScan.codigo) : '') ||
      extrairCodigoMaterialDeTextoLeitura(t);
    return saldoPorCodigo.get(codigoMaterialKey(chave)) ?? 0;
  }, [codigoAlvoPlanejamento, materialDoScan?.codigo, saldoPorCodigo, codigoBarras]);

  const temPendenciaPlanejadaBarras = docsComPendenteMaterial.length > 0;

  const qtdBarrasNum = Number(String(qtdBarras).replace(',', '.').trim());

  /** Pendência só no desenho de referência (não somar outros desenhos) — alinhado ao PC. */
  const pendenteMaterialNoDocReferencia = useMemo(() => {
    if (!doc || !codigoAlvoPlanejamento || !payload) return null;
    const hit = listarDocumentosComDemandaPendenteMaterial(payload, codigoAlvoPlanejamento).find(
      (x) => String(x.documento.id) === String(doc.id),
    );
    return hit ? hit.restanteMaterial : 0;
  }, [doc, codigoAlvoPlanejamento, payload]);

  /**
   * Validação das quantidades digitadas por índice de linha do desenho (fluxo «Registar atendimento…»).
   * Alinha com aplicarAtendimentoLote: não ultrapassar o restante no planejamento nem o saldo.
   */
  const validacaoQuantidadesLinhasDoc = useMemo(() => {
    if (!doc || !saldoPorCodigo) {
      return { ok: true as boolean, motivo: null as string | null, temQtdPositiva: false };
    }
    let temQtdPositiva = false;
    for (const [k, v] of Object.entries(qtdLinha)) {
      const idx = Number(k);
      const raw = String(v ?? '').replace(',', '.').trim();
      if (!raw) continue;
      const qtd = Number(raw);
      if (!Number.isFinite(qtd)) {
        return {
          ok: false,
          motivo: 'Indique números válidos nas quantidades.',
          temQtdPositiva: true,
        };
      }
      if (qtd < 0) {
        return { ok: false, motivo: 'As quantidades não podem ser negativas.', temQtdPositiva: true };
      }
      if (qtd <= 0) continue;
      temQtdPositiva = true;
      const it = doc.itens?.[idx];
      if (!it) {
        return { ok: false, motivo: 'Linha do documento inválida.', temQtdPositiva: true };
      }
      const dip = it as DocumentoItemPlanejamento;
      const qProj = Number(it.quantidade) || 0;
      const qAt = quantidadeAtendidaLinha(dip);
      const rest = Math.max(0, qProj - qAt);
      const codLinha = codigoNaLinhaPlanejamento(dip);
      const saldo = saldoPorCodigo.get(codigoMaterialKey(codLinha)) ?? 0;
      if (qtd > rest + 1e-9) {
        return {
          ok: false,
          motivo: `«${codLinha}»: máximo ${formatQuantidadeExibicao(rest)} — é o que ainda falta atender neste desenho (planejamento), não confundir com recebimento.`,
          temQtdPositiva: true,
        };
      }
      if (qtd > saldo + 1e-9) {
        return {
          ok: false,
          motivo: `«${codLinha}»: saldo em estoque insuficiente (máx. ${formatQuantidadeExibicao(saldo)}).`,
          temQtdPositiva: true,
        };
      }
    }
    return { ok: true, motivo: null, temQtdPositiva };
  }, [doc, qtdLinha, saldoPorCodigo]);

  const podeRegistarPorLinhasDocumento =
    podeRegistarAtendimentoBase &&
    validacaoQuantidadesLinhasDoc.ok &&
    validacaoQuantidadesLinhasDoc.temQtdPositiva;

  /** Código de barras: mesma regra que por linhas — documento de referência obrigatório; quantidade ≤ restante no desenho. */
  const podeDarBaixaBarras =
    podeRegistarAtendimentoBase &&
    Boolean(materialDoScan) &&
    temPendenciaPlanejadaBarras &&
    saldoEstoqueMaterialBarras != null &&
    saldoEstoqueMaterialBarras > 0 &&
    Number.isFinite(qtdBarrasNum) &&
    qtdBarrasNum > 0 &&
    qtdBarrasNum <= saldoEstoqueMaterialBarras + 1e-9 &&
    (pendenteMaterialNoDocReferencia === null || qtdBarrasNum <= pendenteMaterialNoDocReferencia + 1e-9);

  /** Atualiza snapshot sem limpar recebedor/documento em edição (uso ao abrir o ecrã e no botão). */
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

  /**
   * Com código identificado: só desenhos com **pendência** para dar baixa (igual critério da lista «Onde há pendência»).
   * Sem código: resultados normais da pesquisa.
   */
  const docFiltradosRapido = useMemo(() => {
    const list = payload?.documentos as DocumentoPlanejamento[] | undefined;
    if (!list?.length) return [];
    const t = buscaDoc.trim();
    if (t.length < 1) return [];
    let rows = filtrarDocumentosPlanejamentoPorTexto(list, buscaDoc, 50);
    if (codigoAlvoPlanejamento) {
      if (docsComPendenteMaterial.length > 0) {
        const permitidos = new Set(docsComPendenteMaterial.map((x) => String(x.documento.id)));
        rows = rows.filter((d) => permitidos.has(String(d.id)));
      } else {
        rows = [];
      }
    }
    return rows;
  }, [payload?.documentos, buscaDoc, codigoAlvoPlanejamento, docsComPendenteMaterial]);

  const docFiltradosParaExibir = useMemo(() => {
    if (!doc) return docFiltradosRapido;
    const hit = docFiltradosRapido.find((d) => mesmoDocumentoReferencia(doc, d));
    return hit ? [hit] : [doc];
  }, [docFiltradosRapido, doc]);

  const listaTodosDesenhosParaExibir = useMemo(() => {
    const all = (payload?.documentos ?? []) as DocumentoPlanejamento[];
    if (!doc) return all;
    const hit = all.find((d) => mesmoDocumentoReferencia(doc, d));
    return hit ? [hit] : [doc];
  }, [payload?.documentos, doc]);

  const docsPendenteParaExibir = useMemo(() => {
    if (!doc) return docsComPendenteMaterial;
    return docsComPendenteMaterial.filter(({ documento: d }) => mesmoDocumentoReferencia(doc, d));
  }, [docsComPendenteMaterial, doc]);

  const candidatosBuscaDocParaExibir = useMemo(() => {
    if (!candidatosBuscaDoc?.length) return candidatosBuscaDoc;
    if (!doc) return candidatosBuscaDoc;
    const hit = candidatosBuscaDoc.find((d) => mesmoDocumentoReferencia(doc, d));
    return hit ? [hit] : candidatosBuscaDoc;
  }, [candidatosBuscaDoc, doc]);

  /** Abre o desenho só quando a busca «inteligente» encontra uma correspondência única (evita mensagens a cada tecla). */
  const tentarAutoSelecionarDocumento = useCallback(() => {
    if (!payload?.documentos?.length) return;
    const raw = buscaDoc.trim();
    if (raw.length < 1) return;
    const res = resolverBuscaDocumentoPorNumero(payload.documentos as DocumentoPlanejamento[], buscaDoc);
    if (res.kind === 'one') {
      setDoc(deepClone(res.doc));
      setMsgBusca(null);
      setCandidatosBuscaDoc(null);
      setQtdLinha({});
      return;
    }
    if (res.kind === 'sameNumeroVarios') {
      setDoc(deepClone(res.docs[0]));
      setMsgBusca(null);
      setCandidatosBuscaDoc(null);
      setQtdLinha({});
    }
  }, [buscaDoc, payload]);

  const buscarDocumento = useCallback(() => {
    setMsgBusca(null);
    setDoc(null);
    setQtdLinha({});
    setCandidatosBuscaDoc(null);
    if (!payload?.documentos?.length) {
      setMsgBusca('Carregue os dados da nuvem primeiro.');
      return;
    }
    const alvo = norm(buscaDoc);
    if (!alvo) {
      setMsgBusca('Informe o número do documento (ex.: AQ-3-BT-232-CS10-IQ).');
      return;
    }
    const res = resolverBuscaDocumentoPorNumero(payload.documentos as DocumentoPlanejamento[], buscaDoc);
    if (res.kind === 'none') {
      const ex = exemplosNumerosDocumentos(payload.documentos as DocumentoPlanejamento[], 6);
      setMsgBusca(
        ex.length
          ? `Nenhum desenho combina com «${buscaDoc.trim()}». Exemplos no telemóvel: ${ex.join(' · ')}. Confira o formato (com ou sem traço) ou continue a digitar.`
          : 'Nenhum documento encontrado.',
      );
      return;
    }
    if (res.kind === 'one') {
      setDoc(deepClone(res.doc));
      setMsgBusca(null);
      return;
    }
    if (res.kind === 'sameNumeroVarios') {
      setMsgBusca(`${res.docs.length} documentos com o mesmo número — abrindo o primeiro.`);
      setDoc(deepClone(res.docs[0]));
      return;
    }
    setCandidatosBuscaDoc(res.docs);
    setMsgBusca(`${res.docs.length} desenhos correspondem a «${buscaDoc.trim()}» — toque numa linha para abrir.`);
  }, [buscaDoc, payload]);

  /** Após uma pausa curta, tenta abrir o único desenho que coincide com a busca inteligente. */
  useDebouncedEffect(
    () => {
      if (!payload?.documentos?.length) return;
      const raw = buscaDoc.trim();
      if (raw.length < 1) {
        /** Não limpar `doc` aqui: o documento pode ter sido aberto pelo código de material (único desenho). */
        setMsgBusca(null);
        setCandidatosBuscaDoc(null);
        return;
      }
      tentarAutoSelecionarDocumento();
    },
    [buscaDoc, payload, tentarAutoSelecionarDocumento],
    200,
  );

  const atualizarQtd = useCallback((idx: number, t: string) => {
    setQtdLinha((prev) => ({ ...prev, [idx]: t }));
  }, []);

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

  const onBarcodeScanned = useCallback(({ data }: { data: string }) => {
    const now = Date.now();
    if (now - scanCooldownRef.current < 1200) return;
    scanCooldownRef.current = now;
    const t = (data || '').trim();
    if (!t) return;
    const limpo = extrairCodigoMaterialDeTextoLeitura(t) || t;
    void playScanBeep();
    setCodigoBarras(limpo);
    setScannerOpen(false);
  }, []);

  const finalizarSessaoAtendimentoEPartilhar = useCallback(
    (opts?: { skipConfirm?: boolean }) => {
      if (!payload) {
        appAlert('Atendimento', 'Carregue os dados da nuvem primeiro.');
        return;
      }
      if (!nuvemAt) {
        appAlert(
          'Atendimento',
          'É preciso ter o snapshot da nuvem carregado (data do snapshot em cima). Toque em «Carregar dados da nuvem».',
        );
        return;
      }
      const recebRes = resolverRecebedorColaborador(recebedor, payload.colaboradores as Colaborador[]);
      if (!recebRes.ok) {
        appAlert('Recebedor', recebRes.motivo);
        return;
      }
      const recebCol = recebRes.colaborador;
      const receb = recebRes.nomeOficial;
      const cols = (payload.colaboradores ?? []) as Colaborador[];
      const { nome: nomeAt, matricula: matAt, funcao: funAt } = getAtendenteRegisto(cols);
      const linhas = sessaoAtendimentoRef.current;
      if (linhas.length === 0) return;

      const abrirRecibo = () => {
        const ctx = {
          documentoReferencia: doc,
          configuracoesSistema: payload?.configuracoesSistema,
          identificacaoAssinaturas: {
            atendenteFuncao: funAt,
            recebedorMatricula: String(recebCol.matricula ?? '').trim() || undefined,
            recebedorFuncao: String(recebCol.funcao ?? '').trim() || undefined,
          },
        };
        const txt = montarTextoReciboSessaoUnificada(linhas, nomeAt, receb, matAt, ctx);
        const htmlImpressao = montarHtmlReciboSessaoUnificada(linhas, nomeAt, receb, matAt, ctx);
        setComprovanteModal({
          texto: txt,
          htmlImpressao,
          onFechar: () => {
            sessaoAtendimentoRef.current = [];
            sessaoCodigoBarrasLoteRef.current = null;
            setSessaoAtendimentoItens([]);
          },
        });
      };

      if (opts?.skipConfirm) {
        abrirRecibo();
        return;
      }

      appAlert(
        'Confirmar',
        `Finalizar sessão e gerar um comprovante único?\n\nDestinatário: ${receb}\nOperações nesta sessão: ${linhas.length}\n\nSe algo estiver errado, toque em Cancelar.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Sim', onPress: abrirRecibo },
        ],
      );
    },
    [recebedor, nuvemAt, payload, doc],
  );

  const fecharComprovanteModal = useCallback(() => {
    setComprovanteModal((prev) => {
      prev?.onFechar?.();
      return null;
    });
  }, []);

  const registarPorCodigo = useCallback(async () => {
    if (!payload) {
      appAlert('Atendimento', 'Carregue os dados da nuvem primeiro.');
      return;
    }
    if (!nuvemAt) {
      appAlert('Atendimento', 'Carregue o snapshot da nuvem antes de dar baixa (botão em cima).');
      return;
    }
    if (!doc) {
      appAlert(
        'Documento de referência',
        'Busque pelo número e abra o documento (desenho) de referência antes de dar baixa — regra do sistema.',
      );
      return;
    }
    const recebRes = resolverRecebedorColaborador(recebedor, payload.colaboradores as Colaborador[]);
    if (!recebRes.ok) {
      appAlert('Recebedor', recebRes.motivo);
      return;
    }
    const receb = recebRes.nomeOficial;
    const q = Number(String(qtdBarras).replace(',', '.').trim());
    if (!Number.isFinite(q) || q <= 0) {
      appAlert('Atendimento', 'Indique uma quantidade válida.');
      return;
    }
    const cod = codigoBarras.trim();
    if (!cod) {
      appAlert('Atendimento', 'Digite ou escaneie o código do material ou código de barras.');
      return;
    }
    const { nome: nomeAt, matricula: matAt, funcao: funAt } = getAtendenteRegisto((payload.colaboradores ?? []) as Colaborador[]);
    const continuacao = sessaoCodigoBarrasLoteRef.current;
    const identHist = {
      atendenteFuncao: funAt && funAt !== '—' ? funAt.trim() : undefined,
      recebedorMatricula: String(recebRes.colaborador.matricula ?? '').trim() || undefined,
      recebedorFuncao: String(recebRes.colaborador.funcao ?? '').trim() || undefined,
    };
    const res = aplicarAtendimentoPorCodigoBarras(payload, cod, q, nomeAt, receb, matAt, continuacao, {
      apenasDocumentoId: doc?.id ?? null,
      identificacaoComplementar: identHist,
    });
    if (!res.ok) {
      appAlert('Atendimento', res.erro);
      return;
    }
    const matCod = String(res.material.codigo ?? cod);
    const docRef = String(doc?.numero ?? '—');

    /**
     * Um único passo de confirmação + gravação (igual ao «Registrar atendimento e gravar na nuvem» por documento).
     * O fluxo antigo com 3 botões fazia a gravação só em «Registar mais» / «Finalizar» — quem tocava em Cancelar ou não percebia
     * ficava com recibo/local sem gravar na nuvem.
     */
    const qConf = formatQuantidadeExibicao(q);
    appAlert(
      'Confirmar baixa por código',
      `Guardar esta baixa?\n\nMaterial: ${matCod}\nQuantidade: ${qConf}\nPara: ${receb}\nDocumento ref.: ${docRef}\n\nProtocolo: ${res.loteNumero}\n\n(Com ligacao, sincroniza na nuvem; offline fica pendente.)`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: rotuloBotaoConfirmarGravacaoSnapshot(),
          onPress: () => {
            void (async () => {
              setSaving(true);
              try {
                const result = await commitDefaultSnapshotWrite(async () => {
                  const { payload: fresh, updatedAt, error } = await fetchDefaultSnapshot();
                  if (error) {
                    throw new Error(error);
                  }
                  if (!fresh) {
                    throw new Error('Snapshot indisponível. Carregue a nuvem e tente novamente.');
                  }
                  const aplicado = aplicarAtendimentoPorCodigoBarras(
                    fresh,
                    cod,
                    q,
                    nomeAt,
                    receb,
                    matAt,
                    continuacao,
                    {
                      apenasDocumentoId: doc?.id ?? null,
                      identificacaoComplementar: identHist,
                    },
                  );
                  if (!aplicado.ok) {
                    throw new Error(aplicado.erro);
                  }
                  return { nextPayload: aplicado.payload, baselineUpdatedAt: updatedAt };
                });
                if (result.error) {
                  appAlert(result.conflict ? 'Conflito de dados' : 'Supabase', result.error);
                  if (result.conflict) {
                    void carregarNuvem();
                  }
                  return;
                }
                const aplicadoLocal = aplicarAtendimentoPorCodigoBarras(
                  payload!,
                  cod,
                  q,
                  nomeAt,
                  receb,
                  matAt,
                  continuacao,
                  {
                    apenasDocumentoId: doc?.id ?? null,
                    identificacaoComplementar: identHist,
                  },
                );
                if (aplicadoLocal.ok) {
                  setPayload(aplicadoLocal.payload);
                }
                if (result.updatedAt) {
                  setNuvemAt(result.updatedAt);
                }
                if (!continuacao) {
                  sessaoCodigoBarrasLoteRef.current = { loteNumero: res.loteNumero, loteId: res.loteId };
                }
                const linha: LinhaSessaoAtendimento = {
                  tipo: 'codigo_barras',
                  loteNumero: res.loteNumero,
                  material: res.material,
                  atendidoTotal: res.atendidoTotal,
                  documentoPlanejamento: doc
                    ? {
                        numero: String(doc.numero ?? ''),
                        revisao: String(doc.revisao ?? ''),
                        descricao: String(doc.descricao ?? ''),
                        responsavel: String(doc.responsavel ?? '').trim() || undefined,
                      }
                    : null,
                };
                const nextSessao = [...sessaoAtendimentoRef.current, linha];
                sessaoAtendimentoRef.current = nextSessao;
                setSessaoAtendimentoItens(nextSessao);
                setCodigoBarras('');
                setQtdBarras('1');
                prevCodigoAlvoPlanejamentoRef.current = null;
                setDoc(null);
                setBuscaDoc('');
                setMsgBusca(null);
                setCandidatosBuscaDoc(null);
                setMostrarListaDocsMaterial(false);
                const produtoLinha =
                  String(res.material.descricao ?? '').trim() || matCod;
                const unMat = String(res.material.unidade ?? '').trim();
                const qLinha = formatQuantidadeExibicao(res.atendidoTotal);
                const syncHintCodigo = result.queued
                  ? '\n\nGuardado neste aparelho (pendente de sincronizacao com a nuvem).'
                  : '\n\nGravado na nuvem.';
                appAlert(
                  'Código registrado',
                  `Deseja continuar a registar mais materiais neste atendimento ou finalizar?\n\nProduto: ${produtoLinha}\nQuantidade: ${qLinha}${unMat ? ` ${unMat}` : ''}\nProtocolo: ${res.loteNumero}${syncHintCodigo}${continuacao ? '\n\n(mesmo protocolo — comprovante único ao finalizar)' : ''}`,
                  [
                    { text: 'Continuar', style: 'cancel' },
                    {
                      text: 'Finalizar atendimento',
                      onPress: () => finalizarSessaoAtendimentoEPartilhar({ skipConfirm: true }),
                    },
                  ],
                );
              } finally {
                setSaving(false);
              }
            })();
          },
        },
      ],
    );
  }, [carregarNuvem, codigoBarras, doc, finalizarSessaoAtendimentoEPartilhar, nuvemAt, payload, qtdBarras, recebedor]);

  const registar = useCallback(async () => {
    if (!doc || !payload) return;
    if (!nuvemAt) {
      appAlert('Atendimento', 'Carregue o snapshot da nuvem antes de registar.');
      return;
    }
    const recebRes = resolverRecebedorColaborador(recebedor, payload.colaboradores as Colaborador[]);
    if (!recebRes.ok) {
      appAlert('Recebedor', recebRes.motivo);
      return;
    }
    const receb = recebRes.nomeOficial;
    const qtds: Record<number, number> = {};
    for (const [k, v] of Object.entries(qtdLinha)) {
      const n = Number(String(v).replace(',', '.').trim());
      if (Number.isFinite(n) && n > 0) qtds[Number(k)] = n;
    }
    const { nome: nomeAt, matricula: matAt, funcao: funAt } = getAtendenteRegisto((payload.colaboradores ?? []) as Colaborador[]);
    const continuacao = sessaoCodigoBarrasLoteRef.current;
    const identHist = {
      atendenteFuncao: funAt && funAt !== '—' ? funAt.trim() : undefined,
      recebedorMatricula: String(recebRes.colaborador.matricula ?? '').trim() || undefined,
      recebedorFuncao: String(recebRes.colaborador.funcao ?? '').trim() || undefined,
    };
    const res = aplicarAtendimentoLote(payload, doc.id, qtds, nomeAt, receb, matAt, continuacao, identHist);
    if (!res.ok) {
      appAlert('Atendimento', res.erro);
      return;
    }
    const docNum = String(doc.numero ?? '—');
    appAlert(
      'Confirmar',
      `Registar este atendimento?\n\nDocumento: ${docNum}\nPara: ${receb}\n\nGrava as quantidades no planejamento (nuvem ou fila offline). Se algo estiver errado, toque em Cancelar.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: rotuloBotaoConfirmarGravacaoSnapshot(),
          onPress: () => {
            void (async () => {
              setSaving(true);
              try {
                const docParaRecibo = deepClone(doc);
                const qtdsCapturadas = { ...qtds };
                const result = await commitDefaultSnapshotWrite(async () => {
                  const { payload: fresh, updatedAt, error } = await fetchDefaultSnapshot();
                  if (error) {
                    throw new Error(error);
                  }
                  if (!fresh) {
                    throw new Error('Snapshot indisponível. Carregue a nuvem e tente novamente.');
                  }
                  const aplicado = aplicarAtendimentoLote(
                    fresh,
                    doc.id,
                    qtdsCapturadas,
                    nomeAt,
                    receb,
                    matAt,
                    continuacao,
                    identHist,
                  );
                  if (!aplicado.ok) {
                    throw new Error(aplicado.erro);
                  }
                  return { nextPayload: aplicado.payload, baselineUpdatedAt: updatedAt };
                });
                if (result.error) {
                  appAlert(result.conflict ? 'Conflito de dados' : 'Supabase', result.error);
                  if (result.conflict) {
                    void carregarNuvem();
                  }
                  return;
                }
                const aplicadoLocal = aplicarAtendimentoLote(
                  payload!,
                  doc.id,
                  qtdsCapturadas,
                  nomeAt,
                  receb,
                  matAt,
                  continuacao,
                  identHist,
                );
                if (!aplicadoLocal.ok) {
                  appAlert('Atendimento', aplicadoLocal.erro);
                  return;
                }
                setPayload(aplicadoLocal.payload);
                if (result.updatedAt) {
                  setNuvemAt(result.updatedAt);
                }
                const docs = aplicadoLocal.payload.documentos as DocumentoPlanejamento[] | undefined;
                const num = String(docParaRecibo.numero ?? '').trim();
                const rev = String(docParaRecibo.revisao ?? '').trim();
                const atualizado =
                  docs?.find((d) => String(d.id) === String(doc.id)) ??
                  (num ? docs?.find((d) => String(d.numero ?? '').trim() === num && String(d.revisao ?? '').trim() === rev) : undefined);
                if (atualizado) {
                  setDoc(deepClone(atualizado));
                }
                const itensLinha: { codigo: string; qtd: number; unidade: string; descricao: string }[] = [];
                for (const [idxStr, q] of Object.entries(qtdsCapturadas)) {
                  if (!Number(q) || Number(q) <= 0) continue;
                  const idx = Number(idxStr);
                  const it = docParaRecibo.itens?.[idx];
                  if (!it) continue;
                  itensLinha.push({
                    codigo: String(it.codigo ?? ''),
                    qtd: Number(q),
                    unidade: String(it.unidade ?? ''),
                    descricao: String(it.descricao ?? ''),
                  });
                }
                const linhaSessao: LinhaSessaoAtendimento = {
                  tipo: 'documento',
                  loteNumero: res.loteNumero,
                  docNumero: String(docParaRecibo.numero ?? ''),
                  docRevisao: String(docParaRecibo.revisao ?? ''),
                  docDesc: String(docParaRecibo.descricao ?? ''),
                  docResponsavel: String(docParaRecibo.responsavel ?? '').trim(),
                  itens: itensLinha,
                };
                const nextSessao = [...sessaoAtendimentoRef.current, linhaSessao];
                sessaoAtendimentoRef.current = nextSessao;
                setSessaoAtendimentoItens(nextSessao);
                setQtdLinha({});
                sessaoCodigoBarrasLoteRef.current = { loteNumero: res.loteNumero, loteId: res.loteId };
                const syncHint = result.queued
                  ? 'Alteracao pendente de sincronizacao com a nuvem.'
                  : 'Gravado na nuvem.';
                appAlert(
                  'Atendimento registado',
                  `Documento ${docNum}: ${syncHint}\nProtocolo: ${res.loteNumero}${continuacao ? '\n(mesmo protocolo — vários itens no mesmo comprovante)' : ''}\n\nSessão para «${receb}»: ${nextSessao.length} operação(ões).\n\nDeseja continuar a registar ou finalizar o atendimento?`,
                  [
                    { text: 'Continuar', style: 'cancel' },
                    {
                      text: 'Finalizar atendimento',
                      onPress: () => finalizarSessaoAtendimentoEPartilhar(),
                    },
                  ],
                );
              } finally {
                setSaving(false);
              }
            })();
          },
        },
      ]
    );
  }, [carregarNuvem, doc, finalizarSessaoAtendimentoEPartilhar, nuvemAt, payload, qtdLinha, recebedor]);

  const escolherRecebedorColaborador = useCallback((c: Colaborador) => {
    if (blurSugestoesTimer.current) clearTimeout(blurSugestoesTimer.current);
    setRecebedor((c.nome || '').trim());
    setMostrarSugestoesRecebedor(false);
  }, []);

  const selecionarDocumentoPlanejamento = useCallback((d: DocumentoPlanejamento) => {
    if (blurDocsTimer.current) clearTimeout(blurDocsTimer.current);
    setBuscaDoc(String(d.numero ?? ''));
    setDoc(deepClone(d));
    setQtdLinha({});
    setMsgBusca(null);
    setCandidatosBuscaDoc(null);
    setMostrarListaDocsMaterial(false);
  }, []);

  /**
   * Código só existe num desenho no planejamento → abre esse documento de referência.
   * Vários desenhos com o mesmo código → o utilizador escolhe (lista com pendência ou «todos»).
   * Ao mudar o material no campo (novo scan ou outro código), limpa o desenho anterior para não ficar o filtro do item anterior.
   */
  useDebouncedEffect(
    () => {
      if (!payload?.documentos?.length) return;
      const cur = codigoAlvoPlanejamento;
      if (!cur) {
        prevCodigoAlvoPlanejamentoRef.current = null;
        setMostrarListaDocsMaterial(false);
        return;
      }
      const prev = prevCodigoAlvoPlanejamentoRef.current;
      if (prev !== cur) {
        setDoc(null);
        setBuscaDoc('');
        setMsgBusca(null);
        setCandidatosBuscaDoc(null);
        prevCodigoAlvoPlanejamentoRef.current = cur;
      }
      const lista = listarDocumentosComDemandaPendenteMaterial(payload, cur);
      if (lista.length === 1) {
        setMostrarListaDocsMaterial(false);
        const d = lista[0].documento;
        setDoc(deepClone(d));
        setBuscaDoc(String(d.numero ?? ''));
        setMsgBusca(null);
        setCandidatosBuscaDoc(null);
        setQtdLinha({});
      } else if (lista.length > 1) {
        /** Vários desenhos: manter lista visível (novo scan ou continuar atendimento após baixa anterior). */
        setMostrarListaDocsMaterial(true);
      } else {
        setMostrarListaDocsMaterial(false);
      }
    },
    [payload, codigoAlvoPlanejamento],
    320,
  );

  if (!configured) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Atendimento</Text>
        <Text style={styles.hint}>
          Configura EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY no ficheiro `.env` na raiz do projeto (iguais ao I.S.O PRO) e
          reinicia o Expo.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Atendimento</Text>
      {mostrarTextosAjudaModulos ? (
        <Text style={styles.hint}>
          Carregue a nuvem, indique quem recebe, escaneie ou abra o desenho e registe as baixas. Por código: «Dar baixa» confirma e grava na nuvem de
          imediato (como o registo por documento). Por desenho: confirme em «Registrar atendimento e gravar na nuvem». O mesmo protocolo (ATD) segue até
          mudar o recebedor ou finalizar a sessão — «Finalizar sessão» gera o comprovante único.
        </Text>
      ) : null}

      <Pressable style={[styles.btn, loading && styles.btnOff]} onPress={carregarNuvem} disabled={loading || saving}>
        {loading ? <ActivityIndicator color={colors.text} /> : <Text style={styles.btnText}>Carregar dados da nuvem</Text>}
      </Pressable>
      {nuvemAt ? (
        <Text style={styles.meta}>Snapshot: {formatarDataHoraLocal(nuvemAt)} (hora do telemóvel)</Text>
      ) : null}
      {payload ? (
        <Text style={styles.meta}>
          {payload.documentos?.length ?? 0} documento(s) · {payload.materiais?.length ?? 0} material(is) ·{' '}
          {payload.colaboradores?.length ?? 0} colaborador(es)
        </Text>
      ) : null}
      {payload && (payload.documentos?.length ?? 0) === 0 && (payload.materiais?.length ?? 0) > 0 ? (
        <View style={styles.warnDestaque}>
          <Text style={styles.warnDestaqueTit}>Desenhos ainda não estão na nuvem</Text>
          <Text style={styles.warnDestaqueTxt}>
            Este telemóvel vê {payload.materiais!.length} material(is) no snapshot, mas 0 desenhos. No I.S.O PRO no PC, abra Documentos e use
            «Enviar planejamento deste PC para a nuvem (mobile)». Depois toque em «Carregar dados da nuvem» aqui. Confirme o mesmo Supabase no
            `.env` do app.
          </Text>
        </View>
      ) : null}
      {payload && (payload.documentos?.length ?? 0) === 0 && (payload.materiais?.length ?? 0) === 0 ? (
        <Text style={styles.warn}>
          0 desenhos no snapshot: o planejamento pode não ter sido enviado do PC ou o `.env` aponta para outro projeto Supabase. No PC (Documentos),
          envie o planejamento para a nuvem; na aba Início use «Verificar leitura do snapshot».
        </Text>
      ) : null}
      {loadErr ? <Text style={styles.err}>{loadErr}</Text> : null}

      <Text style={styles.label}>Quem recebeu / retirou o material *</Text>
      {mostrarTextosAjudaModulos ? (
        <Text style={styles.hintSmall}>
          Tem de ser um nome ou matrícula igual ao cadastro de colaboradores no I.S.O PRO — toque numa sugestão ou escreva exatamente como está no cadastro.
        </Text>
      ) : null}
      <View style={styles.recebedorWrap}>
        <TextInput
          style={[styles.input, styles.inputRecebedor]}
          placeholder="Nome, matrícula…"
          placeholderTextColor={colors.placeholder}
          value={recebedor}
          onChangeText={(t) => {
            setRecebedor(t);
            setMostrarSugestoesRecebedor(true);
          }}
          onFocus={() => {
            if (blurSugestoesTimer.current) clearTimeout(blurSugestoesTimer.current);
            setMostrarSugestoesRecebedor(true);
          }}
          onBlur={() => {
            blurSugestoesTimer.current = setTimeout(() => setMostrarSugestoesRecebedor(false), 220);
          }}
          autoCorrect={false}
        />
        {mostrarSugestoesRecebedor && sugestoesRecebedor.length > 0 ? (
          <View style={styles.sugestoesBox}>
            <ScrollView style={styles.sugestoesScroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {sugestoesRecebedor.map((c) => (
                <Pressable
                  key={String(c.id)}
                  style={styles.sugestaoRow}
                  onPress={() => escolherRecebedorColaborador(c)}
                >
                  <Text style={styles.sugestaoNome}>{c.nome ?? '—'}</Text>
                  <Text style={styles.sugestaoMeta}>
                    Mat. {c.matricula ?? '—'} · {c.funcao ?? '—'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </View>
      {payload && (payload.colaboradores?.length ?? 0) === 0 ? (
        <Text style={styles.err}>
          Não há colaboradores neste snapshot — cadastre no I.S.O PRO, grave na nuvem e carregue de novo. Enquanto isso não é possível registar atendimento.
        </Text>
      ) : null}
      {recebedor.trim() && recebedorResolvido && !recebedorResolvido.ok ? (
        <Text style={styles.err}>{recebedorResolvido.motivo}</Text>
      ) : null}
      {!nuvemAt && payload ? (
        <Text style={styles.warn}>Toque em «Carregar dados da nuvem» e aguarde a data do snapshot em cima antes de registar.</Text>
      ) : null}
      {snapshotCarregado && Boolean(nuvemAt) && !docReferenciaOk ? (
        <Text style={styles.warn}>
          Regra do sistema: é obrigatório abrir o documento (desenho) de referência em baixo antes de registar baixa — por linhas ou por código de
          barras.
        </Text>
      ) : null}

      <Text style={styles.subTit}>Código do material</Text>
      {mostrarTextosAjudaModulos ? (
        <Text style={styles.hintSmall}>
          Scan ou digitação. Exige documento de referência aberto, saldo e linha ainda por atender no planejamento — como no PC.
        </Text>
      ) : null}
      <TextInput
        style={styles.input}
        placeholder="Código do material ou leitura do código de barras"
        placeholderTextColor={colors.placeholder}
        value={codigoBarras}
        onChangeText={setCodigoBarras}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {codigoBarras.trim() && saldoEstoqueMaterialBarras != null ? (
        <Text style={[styles.hintSmall, { marginTop: 4 }]}>
          Saldo: {formatQuantidadeExibicao(saldoEstoqueMaterialBarras)} ·{' '}
          {String(materialDoScan?.codigo ?? codigoAlvoPlanejamento ?? '—')}
          {doc && pendenteMaterialNoDocReferencia != null
            ? ` · Disp. p/ atend. (este desenho): ${formatQuantidadeExibicao(pendenteMaterialNoDocReferencia)}`
            : ''}
        </Text>
      ) : null}
      {doc &&
      codigoAlvoPlanejamento &&
      pendenteMaterialNoDocReferencia != null &&
      Number.isFinite(qtdBarrasNum) &&
      qtdBarrasNum > pendenteMaterialNoDocReferencia + 1e-9 ? (
        <Text style={styles.err}>
          Quantidade acima do que ainda falta atender neste desenho (máx. {formatQuantidadeExibicao(pendenteMaterialNoDocReferencia)}). Isto é
          planejamento / retirada, não recebimento. Reduza a quantidade ou abra outro desenho com necessidade para este material.
        </Text>
      ) : null}
      {codigoBarras.trim() && saldoEstoqueMaterialBarras !== null && saldoEstoqueMaterialBarras <= 0 ? (
        <Text style={styles.err}>Sem saldo — não pode dar baixa por código.</Text>
      ) : null}
      {codigoAlvoPlanejamento && temPendenciaPlanejadaBarras === false ? (
        <Text style={styles.warn}>Nenhuma quantidade por atender no planejamento para este código (ou já foi toda retirada).</Text>
      ) : null}
      {codigoBarras.trim() && !materialDoScan ? (
        <Text style={[styles.warn, { fontSize: 12 }]}>
          Código não encontrado nem no cadastro de materiais do snapshot nem nas linhas dos desenhos — confira o código, envie o planejamento do PC
          para a nuvem e toque em «Carregar dados da nuvem».
        </Text>
      ) : null}
      <View style={styles.rowBarras}>
        <TextInput
          style={[
            styles.input,
            styles.inQtdBarras,
            codigoAlvoPlanejamento &&
              saldoEstoqueMaterialBarras !== null &&
              saldoEstoqueMaterialBarras <= 0 &&
              styles.inQSemSaldo,
          ]}
          placeholder="Qtd"
          placeholderTextColor={colors.placeholder}
          keyboardType="decimal-pad"
          value={qtdBarras}
          onChangeText={setQtdBarras}
          editable={
            !codigoAlvoPlanejamento ||
            saldoEstoqueMaterialBarras === null ||
            saldoEstoqueMaterialBarras > 0
          }
        />
        <Pressable
          style={[styles.btnSec, styles.btnBarras, (!payload || loading) && styles.btnOff]}
          onPress={abrirScanner}
          disabled={!payload || loading || saving}
        >
          <Text style={styles.btnTextSec}>Escanear</Text>
        </Pressable>
        <Pressable
          style={[styles.btnOk, styles.btnBarrasGo, (saving || !podeDarBaixaBarras) && styles.btnOff]}
          onPress={registarPorCodigo}
          disabled={saving || !podeDarBaixaBarras}
        >
          <Text style={styles.btnText}>Dar baixa</Text>
        </Pressable>
      </View>
      {sessaoAtendimentoItens.length > 0 ? (
        <View style={styles.sessaoBarrasBox}>
          {mostrarTextosAjudaModulos ? (
            <Text style={styles.sessaoBarrasTxt}>
              Sessão: {sessaoAtendimentoItens.length} linha(s) no recibo — vários registos seguem o mesmo protocolo (um atendimento no sistema).
              «Finalizar» gera o comprovante único (partilhar ou imprimir).
            </Text>
          ) : (
            <Text style={styles.sessaoBarrasTxt}>Sessão: {sessaoAtendimentoItens.length} operação(ões) · finalizar gera o comprovante.</Text>
          )}
          <Pressable
            style={[styles.btnSessaoFim, !baseNuvemRecebedor && styles.btnOff]}
            onPress={() => finalizarSessaoAtendimentoEPartilhar()}
            disabled={!baseNuvemRecebedor}
          >
            <Text style={styles.btnTextSec}>Finalizar sessão — comprovante único</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.label}>Desenho de referência *</Text>
      {mostrarTextosAjudaModulos ? (
        <Text style={styles.hintSmall}>
          Com código em cima: só aparecem desenhos que têm esse material. Um desenho → abre sozinho. Vários → escolha na lista. Sem código: digite
          o nº ou veja todos em baixo.
        </Text>
      ) : null}
      {mostrarTextosAjudaModulos && codigoAlvoPlanejamento && docsComPendenteMaterial.length === 1 && doc ? (
        <Text style={[styles.hintSmall, { marginBottom: 6 }]}>
          Desenho «{doc.numero ?? '—'}» (único com falta a atender para este código no planejamento).
        </Text>
      ) : null}
      <View style={styles.docListaWrap}>
        <TextInput
          style={[styles.input, styles.inputDocLista]}
          placeholder="Comece a digitar — resultados na hora"
          placeholderTextColor={colors.placeholder}
          value={buscaDoc}
          onChangeText={(t) => {
            setBuscaDoc(t);
            setDoc(null);
            setCandidatosBuscaDoc(null);
            setMsgBusca(null);
            setQtdLinha({});
          }}
          autoCapitalize="characters"
          onFocus={() => {
            if (blurDocsTimer.current) clearTimeout(blurDocsTimer.current);
            setMostrarListaDocsMaterial(true);
          }}
          onBlur={() => {
            blurDocsTimer.current = setTimeout(() => setMostrarListaDocsMaterial(false), 240);
          }}
        />
        {payload && (payload.documentos?.length ?? 0) > 0 && buscaDoc.trim().length > 0 ? (
          <View style={[styles.docsMaterialBox, { marginTop: 8 }]}>
            <Text style={styles.docsMaterialTit}>
              {doc
                ? 'Desenho em referência — altere o texto acima para ver outros resultados'
                : `Desenhos (${docFiltradosParaExibir.length}${docFiltradosParaExibir.length >= 50 ? '+' : ''}${
                    codigoAlvoPlanejamento ? ' · com retirada a fazer p/ o código' : ''
                  }) — toque`}
            </Text>
            {docFiltradosParaExibir.length === 0 ? (
              <Text style={styles.docsMaterialEmpty}>
                Nenhum desenho combina com «{buscaDoc.trim()}»
                {codigoAlvoPlanejamento ? ' (entre os que ainda têm atendimento a fazer para este código)' : ''}. Tente outro trecho do número ou da descrição.
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
                  const sel = doc ? mesmoDocumentoReferencia(doc, d) : false;
                  return (
                    <Pressable
                      style={[styles.docsMaterialRow, sel && styles.docsMaterialRowSelected]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: sel }}
                      onPress={() => selecionarDocumentoPlanejamento(d)}
                    >
                      <Text style={[styles.docsMaterialRowTit, sel && styles.docsMaterialRowTitSelected]}>
                        {d.numero ?? '—'} — rev. {d.revisao ?? '—'}
                      </Text>
                      <Text style={styles.docsMaterialRowSub} numberOfLines={2}>
                        {d.descricao ?? ''}
                      </Text>
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        ) : null}
        {mostrarListaDocsMaterial ? (
          <View style={styles.docsMaterialBox}>
            {!codigoBarras.trim() ? (
              <Text style={styles.docsMaterialEmpty}>
                Identifique o material em «Código do material» (scan ou digitação) para listar os desenhos com retirada ainda por fazer no planejamento.
              </Text>
            ) : docsComPendenteMaterial.length === 0 ? (
              <Text style={styles.docsMaterialEmpty}>
                Nenhum desenho com necessidade de atendimento (planejamento) para {codigoAlvoPlanejamento ?? 'este material'}.
              </Text>
            ) : (
              <FlatList
                style={styles.docsMaterialScroll}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                data={docsPendenteParaExibir}
                keyExtractor={({ documento: d }) => `pend-${String(d.id)}-${String(d.numero)}`}
                ListHeaderComponent={
                  <Text style={styles.docsMaterialTit}>
                    {doc
                      ? `Desenho escolhido para baixa (${codigoAlvoPlanejamento})`
                      : `Desenhos com falta a atender (${codigoAlvoPlanejamento}) — toque`}
                  </Text>
                }
                initialNumToRender={12}
                maxToRenderPerBatch={14}
                windowSize={5}
                removeClippedSubviews
                renderItem={({ item: { documento: d, restanteMaterial } }) => {
                  const saldoCod =
                    saldoPorCodigo?.get(codigoMaterialKey(String(codigoAlvoPlanejamento ?? ''))) ?? 0;
                  const sel = doc ? mesmoDocumentoReferencia(doc, d) : false;
                  return (
                    <Pressable
                      style={[styles.docsMaterialRow, sel && styles.docsMaterialRowSelected]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: sel }}
                      onPress={() => selecionarDocumentoPlanejamento(d)}
                    >
                      <Text style={[styles.docsMaterialRowTit, sel && styles.docsMaterialRowTitSelected]}>
                        {d.numero ?? '—'} — rev. {d.revisao ?? '—'}
                      </Text>
                      <Text style={styles.docsMaterialRowSub} numberOfLines={2}>
                        {d.descricao ?? ''}
                      </Text>
                      <Text style={styles.docsMaterialRowMeta}>
                        Disponível p/ atend.: {formatQuantidadeExibicao(restanteMaterial)} · Estoque:{' '}
                        {formatQuantidadeExibicao(saldoCod)}
                      </Text>
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        ) : null}
      </View>
      {payload &&
      (payload.documentos?.length ?? 0) > 0 &&
      buscaDoc.trim().length === 0 &&
      !codigoBarras.trim() ? (
        <View style={[styles.docsMaterialBox, { marginBottom: 12 }]}>
          <Text style={styles.docsMaterialTit}>
            {doc
              ? 'Desenho em referência — use a pesquisa para localizar outro'
              : `Todos os desenhos neste telemóvel (${payload.documentos!.length}) — toque para abrir`}
          </Text>
          {mostrarTextosAjudaModulos && payload.documentos!.length > 400 && !doc ? (
            <Text style={[styles.hintSmall, { marginBottom: 8 }]}>
              Lista grande: use o campo de pesquisa em cima para ir direto ao desenho — a rolagem continua disponível.
            </Text>
          ) : null}
          <FlatList
            style={{ maxHeight: 220 }}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            data={listaTodosDesenhosParaExibir}
            keyExtractor={(d) => `lista-doc-${String(d.id)}-${String(d.numero)}-${String(d.revisao)}`}
            initialNumToRender={12}
            maxToRenderPerBatch={14}
            windowSize={5}
            removeClippedSubviews
            renderItem={({ item: d }) => {
              const sel = doc ? mesmoDocumentoReferencia(doc, d) : false;
              return (
                <Pressable
                  style={[styles.docsMaterialRow, sel && styles.docsMaterialRowSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sel }}
                  onPress={() => selecionarDocumentoPlanejamento(d)}
                >
                  <Text style={[styles.docsMaterialRowTit, sel && styles.docsMaterialRowTitSelected]}>
                    {d.numero ?? '—'} — rev. {d.revisao ?? '—'}
                  </Text>
                  <Text style={styles.docsMaterialRowSub} numberOfLines={2}>
                    {d.descricao ?? ''}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>
      ) : null}
      <Pressable style={[styles.btnSec, (!payload || loading) && styles.btnOff]} onPress={buscarDocumento} disabled={!payload || loading}>
        <Text style={styles.btnTextSec}>Buscar documento</Text>
      </Pressable>
      {msgBusca ? <Text style={styles.warn}>{msgBusca}</Text> : null}
      {candidatosBuscaDocParaExibir && candidatosBuscaDocParaExibir.length > 0 ? (
        <View style={styles.docsMaterialBox}>
          <FlatList
            style={styles.docsMaterialScroll}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            data={candidatosBuscaDocParaExibir}
            keyExtractor={(d) => `cand-${String(d.id)}-${String(d.numero)}`}
            initialNumToRender={12}
            maxToRenderPerBatch={14}
            windowSize={5}
            removeClippedSubviews
            renderItem={({ item: d }) => {
              const sel = doc ? mesmoDocumentoReferencia(doc, d) : false;
              return (
                <Pressable
                  style={[styles.docsMaterialRow, sel && styles.docsMaterialRowSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sel }}
                  onPress={() => selecionarDocumentoPlanejamento(d)}
                >
                  <Text style={[styles.docsMaterialRowTit, sel && styles.docsMaterialRowTitSelected]}>
                    {d.numero ?? '—'} — rev. {d.revisao ?? '—'}
                  </Text>
                  <Text style={styles.docsMaterialRowSub} numberOfLines={2}>
                    {d.descricao ?? ''}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>
      ) : null}

      {doc ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{doc.numero ?? '—'} — rev. {doc.revisao ?? '—'}</Text>
          <Text style={styles.cardSub}>{doc.descricao ?? ''}</Text>
          <Text style={styles.subTit}>
            {codigoAlvoPlanejamento ? `Linha com «${codigoAlvoPlanejamento}»` : 'Itens — qtd a retirar'}
          </Text>
          {mostrarTextosAjudaModulos && !codigoAlvoPlanejamento ? (
            <Text style={styles.hintSmall}>
              «Disponível p/ atend.» = quantidade do planejamento que ainda pode ser retirada neste desenho (não é recebimento). Estoque = disponível no sistema.
            </Text>
          ) : null}
          {(() => {
            const linhas =
              codigoAlvoPlanejamento
                ? (doc.itens || [])
                    .map((it, i) => ({ it, i }))
                    .filter(({ it }) =>
                      codigoMaterialKey(codigoNaLinhaPlanejamento(it as DocumentoItemPlanejamento)) ===
                      codigoMaterialKey(codigoAlvoPlanejamento),
                    )
                : (doc.itens || []).map((it, i) => ({ it, i }));
            if (codigoAlvoPlanejamento && linhas.length === 0) {
              return (
                <Text style={styles.warn}>
                  Este desenho não tem o código «{codigoAlvoPlanejamento}» nas linhas. Escolha outro desenho ou confira o scan.
                </Text>
              );
            }
            return linhas.map(({ it, i }) => {
            const qProj = Number(it.quantidade) || 0;
            const qAt = quantidadeAtendidaLinha(it as DocumentoItemPlanejamento);
            const rest = Math.max(0, qProj - qAt);
            const semSaldo = rest <= 0;
            const saldoEstoque =
              saldoPorCodigo?.get(codigoMaterialKey(codigoNaLinhaPlanejamento(it as DocumentoItemPlanejamento))) ?? 0;
            const semRecebimento = saldoEstoque <= 0 && rest > 0;
            const compacto = Boolean(codigoAlvoPlanejamento);
            return (
              <View key={i} style={[styles.row, semSaldo && styles.rowSemSaldo]}>
                <View style={styles.rowTxt}>
                  <Text style={[styles.cod, semSaldo && styles.codSemSaldo]}>
                    {codigoNaLinhaPlanejamento(it as DocumentoItemPlanejamento)}
                  </Text>
                  <Text style={[styles.desc, semSaldo && styles.descSemSaldo]} numberOfLines={2}>
                    {descricaoNaLinhaPlanejamento(it as DocumentoItemPlanejamento)}
                  </Text>
                  {compacto ? (
                    <Text style={[styles.meta2, semSaldo && styles.metaSemSaldo, semRecebimento && { color: colors.warn }]}>
                      Disponível p/ atend.: {formatQuantidadeExibicao(rest)} · Estoque:{' '}
                      {formatQuantidadeExibicao(saldoEstoque)}
                    </Text>
                  ) : (
                    <>
                      <Text style={[styles.meta2, semSaldo && styles.metaSemSaldo]}>
                        Projeto: {formatQuantidadeExibicao(qProj)} {it.unidade ?? ''} · Já atendido:{' '}
                        {formatQuantidadeExibicao(qAt)} · Disponível p/ atend.: {formatQuantidadeExibicao(rest)}
                      </Text>
                      <Text
                        style={[
                          styles.meta2,
                          semRecebimento && { color: colors.warn },
                          semSaldo && styles.metaSemSaldo,
                        ]}
                      >
                        Saldo no estoque: {formatQuantidadeExibicao(saldoEstoque)}
                      </Text>
                    </>
                  )}
                  {semRecebimento ? (
                    <Text style={styles.badgeSemSaldo}>Sem recebimento suficiente — não atender</Text>
                  ) : null}
                  {semSaldo ? (
                    <Text style={styles.badgeSemSaldo}>Nada a retirar nesta linha (planejamento já atendido)</Text>
                  ) : null}
                </View>
                <TextInput
                  style={[styles.inQ, (semSaldo || semRecebimento) && styles.inQSemSaldo]}
                  placeholder="Qtd"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="decimal-pad"
                  editable={!semSaldo && !semRecebimento}
                  value={qtdLinha[i] ?? ''}
                  onChangeText={(t) => atualizarQtd(i, t)}
                />
              </View>
            );
          });
          })()}
          {doc && validacaoQuantidadesLinhasDoc.motivo ? (
            <Text style={[styles.err, { marginTop: 10 }]}>{validacaoQuantidadesLinhasDoc.motivo}</Text>
          ) : null}
          <Pressable
            style={[styles.btnOk, (saving || !podeRegistarPorLinhasDocumento) && styles.btnOff]}
            onPress={registar}
            disabled={saving || !podeRegistarPorLinhasDocumento}
          >
            <Text style={styles.btnText}>Registar atendimento e gravar na nuvem</Text>
          </Pressable>
        </View>
      ) : null}

      {saving ? <ActivityIndicator style={{ marginTop: 16 }} color={colors.accent} /> : null}

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

      <Modal visible={!!comprovanteModal} transparent animationType="fade" onRequestClose={fecharComprovanteModal}>
        <View style={styles.compModalOverlay}>
          <View style={styles.compModalCard}>
            <Text style={styles.compModalTit}>Recibo de retirada</Text>
            <Text style={styles.compModalSub}>Pré-visualização — código e descrição completos (partilhar / imprimir)</Text>
            <ScrollView style={styles.compModalScroll} nestedScrollEnabled>
              <Text
                style={[styles.compModalTxt, styles.compModalTxtMono]}
                selectable
              >
                {comprovanteModal?.texto ?? ''}
              </Text>
            </ScrollView>
            <Pressable
              style={styles.compModalBtnWa}
              onPress={() => {
                const t = comprovanteModal?.texto;
                if (!t) return;
                void abrirWhatsAppComTexto(t).finally(() => fecharComprovanteModal());
              }}
            >
              <Text style={styles.compModalBtnWaTxt}>WhatsApp</Text>
            </Pressable>
            <Pressable
              style={styles.compModalBtnPrint}
              onPress={() => {
                const h = comprovanteModal?.htmlImpressao?.trim();
                if (!h) return;
                void imprimirComprovanteHtml(h)
                  .then(() => fecharComprovanteModal())
                  .catch((e: Error) => {
                    appAlert('Impressão', e?.message ?? String(e));
                  });
              }}
            >
              <Text style={styles.compModalBtnPrintTxt}>Imprimir</Text>
            </Pressable>
            <Pressable
              style={styles.compModalBtnShare}
              onPress={() => {
                if (comprovanteModal?.texto) compartilharTexto(comprovanteModal.texto);
                fecharComprovanteModal();
              }}
            >
              <Text style={styles.compModalBtnShareTxt}>Compartilhar (outros apps)</Text>
            </Pressable>
            <Pressable style={styles.compModalBtnClose} onPress={fecharComprovanteModal}>
              <Text style={styles.compModalBtnCloseTxt}>Fechar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
