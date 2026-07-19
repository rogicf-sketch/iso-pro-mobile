import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { CloudSyncStrip } from '@/src/components/mobile/CloudSyncStrip';
import { AtendimentoOperacaoOverlay } from '@/src/components/mobile/AtendimentoOperacaoOverlay';
import { ModuleScreenHeader } from '@/src/components/mobile/ModuleScreenHeader';
import { PrimaryActionButton } from '@/src/components/mobile/PrimaryActionButton';
import { SectionCard } from '@/src/components/mobile/SectionCard';
import { StatPillRow } from '@/src/components/mobile/StatPillRow';
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
import {
  fetchSnapshotSlices,
  listDocumentosPendenciaMaterialFromCloud,
  readDocumentoPlanejamentoFromCloud,
  reservarNumeroAtendimentoFromCloud,
} from '@/src/lib/snapshot';
import {
  buildAtendimentoIdempotencyKey,
  getAtendimentoComandoQueueSize,
  persistirAtendimentoOptimistic,
  setAtendimentoCloudBaselineCursor,
  ATENDIMENTO_CONFLICT_FINAL_MESSAGE,
} from '@/src/lib/atendimentoComando';
import { SNAPSHOT_CONFLICT_MESSAGE } from '@/src/lib/isoProSnapshot';
import { SNAPSHOT_MOBILE_ATENDIMENTO_BOOT_KEYS } from '@/src/lib/snapshotSliceKeys';
import { mergeAtendimentoPayloadPreservandoLocal } from '@/src/lib/mergeAtendimentoPayloadLocal';
import { rotuloBotaoConfirmarGravacaoSnapshot } from '@/src/lib/snapshotWriteFeedback';
import { useSnapshotRefreshOnAppActive } from '@/src/lib/useSnapshotRefreshOnAppActive';
import { hasSupabaseConfig } from '@/src/lib/config';
import {
  aplicarAtendimentoLote,
  aplicarAtendimentoPorCodigoBarras,
  resolverIdDocumentoPlanejamento,
  encontrarMaterialPorCodigoOuBarras,
  extrairCodigoMaterialDeTextoLeitura,
  resolverMaterialParaBaixaPorCodigo,
  avaliarLeituraScanAtendimento,
  codigoNaLinhaPlanejamento,
  descricaoNaLinhaPlanejamento,
  quantidadeAtendidaLinha,
  listarDocumentosComDemandaPendenteMaterial,
  materialTemDemandaPendenteNoDocumento,
  mensagemBloqueioBaixaPorCodigo,
  montarHtmlReciboSessaoUnificada,
  montarTextoReciboSessaoUnificada,
  type LinhaSessaoAtendimento,
} from '@/src/lib/registrarAtendimento';
import { registerAtendimentoSessaoGate } from '@/src/lib/atendimentoSessaoGate';
import {
  exemplosNumerosDocumentos,
  filtrarDocumentosPlanejamentoPorTexto,
  resolverBuscaDocumentoPorNumero,
} from '@/src/lib/documentoBusca';
import { carregarDocumentosParaBuscaTexto } from '@/src/lib/documentoBuscaCloud';
import { listDocumentosPendentesAtendimentoFromCloud } from '@/src/lib/escalaCloud';
import { formatOperadorNetworkError } from '@/src/lib/formatOperadorNetworkError';
import { mergeDocumentosPlanejamentoNoPayload } from '@/src/lib/prefetchDocumentosAtendimento';
import { formatQuantidadeComUnidade, formatQuantidadeExibicao } from '@/src/lib/formatQuantidade';
import {
  abrirWhatsAppComTexto,
  compartilharTexto,
  imprimirComprovanteHtml,
} from '@/src/lib/comprovanteAcao';
import { resolverRecebedorColaborador } from '@/src/lib/recebedorColaborador';
import { buildSaldoOperacionalParaAtendimento, codigoMaterialKey } from '@/src/lib/saldoMaterial';
import { playScanBeep } from '@/src/lib/playScanBeep';
import {
  garantirAtendimentoSincronizadoNaNuvem,
  resumoConfirmacaoSessaoNuvem,
  validarReciboSessaoContraHistorico,
} from '@/src/lib/atendimentoSincroniaConfiavel';
import { buildAtendimentoStyles } from '@/src/theme/buildAtendimentoStyles';
import { buildMobileShellStyles } from '@/src/theme/buildMobileShellStyles';
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

const MAX_DESENHOS_EM_MEMORIA = 48;

/** Evita manter 1000+ resumos de prefetch antigo — só desenhos em uso na sessão. */
function podarDocumentosEmMemoria(
  payload: IsoSnapshotPayload,
  manterIds: ReadonlySet<string>,
): IsoSnapshotPayload {
  const docs = (payload.documentos ?? []) as DocumentoPlanejamento[];
  if (docs.length <= MAX_DESENHOS_EM_MEMORIA) return payload;
  const podados = docs.filter((d) => manterIds.has(String(d.id ?? '')));
  return { ...payload, documentos: podados };
}

type PendenciaMaterialCache = {
  codigo: string;
  docs: { documento: DocumentoPlanejamento; restanteMaterial: number }[];
};

export default function AtendimentoScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { mostrarTextosAjudaModulos } = useMobileUiPreferences();
  const styles = useMemo(() => buildAtendimentoStyles(colors), [colors]);
  const shell = useMemo(() => buildMobileShellStyles(colors), [colors]);
  const configured = useMemo(() => hasSupabaseConfig(), []);
  const [loading, setLoading] = useState(false);
  const [carregandoDesenhos, setCarregandoDesenhos] = useState(false);
  const [pendenciaMaterialCache, setPendenciaMaterialCache] = useState<PendenciaMaterialCache | null>(null);
  const pendenciaMaterialReqRef = useRef(0);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [nuvemAt, setNuvemAt] = useState<string | null>(null);
  const [payload, setPayload] = useState<IsoSnapshotPayload | null>(null);

  const [buscaDoc, setBuscaDoc] = useState('');
  const [msgBusca, setMsgBusca] = useState<string | null>(null);
  /** Busca de desenho na nuvem em curso — spinner no botão «Buscar documento». */
  const [buscandoDoc, setBuscandoDoc] = useState(false);
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
  /** Evita repetir o alerta «não pode dar baixa» para o mesmo código nesta sessão de ecrã. */
  const alertaBloqueioCodigoRef = useRef<string | null>(null);
  const [syncingComandos, setSyncingComandos] = useState(false);
  const [finalizandoSessao, setFinalizandoSessao] = useState(false);
  const [comandosPendentes, setComandosPendentes] = useState(0);
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const scanCooldownRef = useRef(0);
  /** Último código de material usado no fluxo por scan — para limpar o desenho ao mudar de item. */
  const prevCodigoAlvoPlanejamentoRef = useRef<string | null>(null);
  const sessaoAtendimentoRef = useRef<LinhaSessaoAtendimento[]>([]);
  /** Sessão atual: próximo registo (código ou desenho) reutiliza o mesmo ATD na nuvem até finalizar ou mudar recebedor. */
  const sessaoCodigoBarrasLoteRef = useRef<{ loteNumero: string; loteId: number } | null>(null);
  const payloadRef = useRef<IsoSnapshotPayload | null>(null);
  const docAbertoRef = useRef<DocumentoPlanejamento | null>(null);
  const nuvemAtRef = useRef<string | null>(null);
  const documentosPrefetchPendentesRef = useRef<DocumentoPlanejamento[]>([]);
  const syncEmFilaRef = useRef(Promise.resolve());
  const carregarNuvemEmCursoRef = useRef(false);
  const [sessaoAtendimentoItens, setSessaoAtendimentoItens] = useState<LinhaSessaoAtendimento[]>([]);
  const [comprovanteModal, setComprovanteModal] = useState<{
    texto: string;
    htmlImpressao: string;
    onFechar?: () => void;
  } | null>(null);

  const operacaoOverlay = useMemo(() => {
    if (finalizandoSessao) {
      return {
        visible: true,
        titulo: 'A finalizar atendimento',
        mensagem:
          'A confirmar todas as baixas na nuvem antes do comprovante. Mantenha a ligação e aguarde…',
      };
    }
    return { visible: false, titulo: '', mensagem: '' };
  }, [finalizandoSessao]);


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

  /** Unidade do material em foco (scan / código alvo) — exibida em todos os quadros da linha. */
  const unidadeMaterialAlvo = useMemo(() => {
    const uScan = String(materialDoScan?.unidade ?? '').trim();
    if (uScan) return uScan;
    if (!payload || !codigoAlvoPlanejamento) return '';
    const mat = encontrarMaterialPorCodigoOuBarras(payload.materiais as Material[], codigoAlvoPlanejamento);
    if (mat?.unidade) return String(mat.unidade).trim();
    if (doc?.itens) {
      for (const it of doc.itens) {
        if (
          codigoMaterialKey(codigoNaLinhaPlanejamento(it as DocumentoItemPlanejamento)) !==
          codigoMaterialKey(codigoAlvoPlanejamento)
        ) {
          continue;
        }
        const u = String(it.unidade ?? '').trim();
        if (u) return u;
      }
    }
    return '';
  }, [materialDoScan?.unidade, payload, codigoAlvoPlanejamento, doc?.itens]);

  /** Recebimentos − já atendido (+ ajustes) — igual ao I.S.O PRO desktop; necessário para permitir atendimento. */
  const saldoPorCodigo = useMemo(() => {
    if (!payload) return null;
    return buildSaldoOperacionalParaAtendimento(payload);
  }, [payload]);

  const docsComPendenteMaterial = useMemo(() => {
    if (!payload || !codigoAlvoPlanejamento) return [];
    const cod = codigoAlvoPlanejamento.trim();
    if (pendenciaMaterialCache?.codigo === cod) {
      return pendenciaMaterialCache.docs;
    }
    const docsNaMemoria = payload.documentos?.length ?? 0;
    if (docsNaMemoria > MAX_DESENHOS_EM_MEMORIA) return [];
    return listarDocumentosComDemandaPendenteMaterial(payload, cod);
  }, [payload, codigoAlvoPlanejamento, pendenciaMaterialCache]);

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
  const podeRegistarAtendimentoBase =
    baseNuvemRecebedor && docReferenciaOk && !finalizandoSessao;

  const resumoSyncSessao = useMemo(() => {
    if (sessaoAtendimentoItens.length === 0 || !payload) return null;
    const loteRef =
      sessaoCodigoBarrasLoteRef.current ??
      (sessaoAtendimentoItens[0]?.loteNumero
        ? {
            loteNumero: sessaoAtendimentoItens[0].loteNumero,
            loteId: 0,
          }
        : null);
    return resumoConfirmacaoSessaoNuvem(payload, sessaoAtendimentoItens, loteRef);
  }, [payload, sessaoAtendimentoItens]);

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

  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  useEffect(() => {
    docAbertoRef.current = doc;
  }, [doc]);

  useEffect(() => {
    nuvemAtRef.current = nuvemAt;
  }, [nuvemAt]);

  /** Atualiza snapshot; com `preservarEstado` mantém desenhos lazy-loaded e baixas locais pendentes. */
  const aplicarDocumentosPrefetchPendentes = useCallback((base: IsoSnapshotPayload | null): IsoSnapshotPayload | null => {
    if (!base) return base;
    const pending = documentosPrefetchPendentesRef.current;
    if (!pending.length) return base;
    documentosPrefetchPendentesRef.current = [];
    return {
      ...base,
      documentos: mergeDocumentosPlanejamentoNoPayload([], pending),
    };
  }, []);

  const mergeDocumentosNoPayload = useCallback((docs: DocumentoPlanejamento[]) => {
    setPayload((prev) => {
      if (!prev) {
        documentosPrefetchPendentesRef.current = mergeDocumentosPlanejamentoNoPayload(
          documentosPrefetchPendentesRef.current,
          docs,
        );
        return prev;
      }
      const atuais = (prev.documentos ?? []) as DocumentoPlanejamento[];
      const merged = mergeDocumentosPlanejamentoNoPayload(atuais, docs);
      // Nada mudou → mantém a mesma referência do payload (evita loop no efeito
      // de pendência por material, que depende do payload).
      if (merged === atuais) return prev;
      return { ...prev, documentos: merged };
    });
  }, []);

  const carregarNuvem = useCallback(async (opts?: { preservarEstado?: boolean }) => {
    if (carregarNuvemEmCursoRef.current) return;
    const tinhaPayload = Boolean(payloadRef.current);
    const preservar = opts?.preservarEstado ?? tinhaPayload;
    carregarNuvemEmCursoRef.current = true;
    setLoadErr(null);
    setLoading(true);
    try {
      const { payload: p, updatedAt, error } = await fetchSnapshotSlices(SNAPSHOT_MOBILE_ATENDIMENTO_BOOT_KEYS);
      if (error) {
        setLoadErr(
          formatOperadorNetworkError(error, { contexto: 'carregar', tinhaDadosLocais: tinhaPayload }),
        );
        if (!preservar) {
          setPayload(null);
          payloadRef.current = null;
        }
        return;
      }
      setPayload((prev) => {
        const nuvem = p ? deepClone(p) : null;
        let next: IsoSnapshotPayload | null;
        if (!preservar || !prev || !nuvem) {
          next = nuvem;
        } else {
          next = mergeAtendimentoPayloadPreservandoLocal(nuvem, prev);
        }
        let resolved = aplicarDocumentosPrefetchPendentes(next);
        if (resolved) {
          const manter = new Set<string>();
          const docAberto = docAbertoRef.current;
          if (docAberto?.id) manter.add(String(docAberto.id));
          for (const d of (resolved.documentos ?? []) as DocumentoPlanejamento[]) {
            if ((d.itens?.length ?? 0) > 0) manter.add(String(d.id ?? ''));
          }
          resolved = podarDocumentosEmMemoria(resolved, manter);
        }
        payloadRef.current = resolved;
        return resolved;
      });
      setNuvemAt(updatedAt);
      nuvemAtRef.current = updatedAt;
      setAtendimentoCloudBaselineCursor(updatedAt);
      const pending = await getAtendimentoComandoQueueSize();
      setComandosPendentes(pending);
      try {
        const pendDocs = await listDocumentosPendentesAtendimentoFromCloud({ limit: 200 });
        if (!pendDocs.missing && pendDocs.documentos.length > 0) {
          mergeDocumentosNoPayload(pendDocs.documentos as unknown as DocumentoPlanejamento[]);
        }
      } catch {
        /* boot continua; busca por texto usa RPCs */
      }
    } finally {
      carregarNuvemEmCursoRef.current = false;
      setLoading(false);
    }
  }, [aplicarDocumentosPrefetchPendentes, mergeDocumentosNoPayload]);

  const executarSyncAtendimento = useCallback(
    async (
      payloadAntes: IsoSnapshotPayload,
      payloadDepois: IsoSnapshotPayload,
      idempotencyKey: string,
    ) => {
      setSyncingComandos(true);
      try {
        const baseline = nuvemAtRef.current;
        if (!baseline) return;
        const result = await persistirAtendimentoOptimistic({
          payloadAtual: payloadAntes,
          payloadNext: payloadDepois,
          baselineUpdatedAt: baseline,
          idempotencyKey,
        });
        if (result.error) {
          if (result.conflict) {
            const msg =
              result.error === SNAPSHOT_CONFLICT_MESSAGE || result.error === ATENDIMENTO_CONFLICT_FINAL_MESSAGE
                ? result.error
                : `${SNAPSHOT_CONFLICT_MESSAGE}\n\n${result.error}`;
            appAlert(
              'Conflito — recarregue a lista',
              `${msg}\n\nOs registos permanecem nesta sessão neste telemóvel. Toque em «Carregar dados da nuvem», aguarde a faixa estabilizar e tente finalizar de novo.`,
            );
            void carregarNuvem({ preservarEstado: true });
          } else {
            appAlert(
              'Sincronização',
              formatOperadorNetworkError(result.error, { contexto: 'sincronizar' }),
            );
          }
          return;
        }
        setPayload(payloadDepois);
        payloadRef.current = payloadDepois;
        if (result.updatedAt) {
          setNuvemAt(result.updatedAt);
          nuvemAtRef.current = result.updatedAt;
          setAtendimentoCloudBaselineCursor(result.updatedAt);
        }
        const pending = await getAtendimentoComandoQueueSize();
        setComandosPendentes(pending);
        setPendenciaMaterialCache(null);
      } finally {
        setSyncingComandos(false);
      }
    },
    [carregarNuvem],
  );

  const sincronizarAtendimentoEmBackground = useCallback(
    (payloadAntes: IsoSnapshotPayload, payloadDepois: IsoSnapshotPayload, idempotencyKey: string) => {
      syncEmFilaRef.current = syncEmFilaRef.current
        .then(() => executarSyncAtendimento(payloadAntes, payloadDepois, idempotencyKey))
        .catch(() => undefined);
      void syncEmFilaRef.current;
    },
    [executarSyncAtendimento],
  );

  const refreshNuvemEmSegundoPlano = useCallback(() => {
    if (carregarNuvemEmCursoRef.current || finalizandoSessao) return;
    void carregarNuvem({ preservarEstado: true });
  }, [carregarNuvem, finalizandoSessao]);

  useFocusEffect(
    useCallback(() => {
      if (payloadRef.current) {
        setPayload((prev) => {
          if (!prev) return prev;
          const manter = new Set<string>();
          const docAberto = docAbertoRef.current;
          if (docAberto?.id) manter.add(String(docAberto.id));
          for (const d of (prev.documentos ?? []) as DocumentoPlanejamento[]) {
            if ((d.itens?.length ?? 0) > 0) manter.add(String(d.id ?? ''));
          }
          const podado = podarDocumentosEmMemoria(prev, manter);
          if (podado.documentos?.length === prev.documentos?.length) return prev;
          payloadRef.current = podado;
          return podado;
        });
        return;
      }
      void carregarNuvem();
    }, [carregarNuvem]),
  );

  useSnapshotRefreshOnAppActive(refreshNuvemEmSegundoPlano, 2500);

  /** Mantém o desenho aberto alinhado ao payload após merge/reload. */
  useEffect(() => {
    if (!doc?.id || !payload?.documentos?.length) return;
    const id = String(doc.id);
    const atualizado = (payload.documentos as DocumentoPlanejamento[]).find((d) => String(d.id ?? '') === id);
    if (!atualizado) return;
    setDoc((prev) => {
      if (!prev || String(prev.id ?? '') !== id) return prev;
      const prevJson = JSON.stringify(prev.itens ?? []);
      const nextJson = JSON.stringify(atualizado.itens ?? []);
      if (prevJson === nextJson) return prev;
      return deepClone(atualizado);
    });
  }, [payload?.documentos, doc?.id]);

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
    if (codigoAlvoPlanejamento) return docFiltradosRapido;
    const hit = docFiltradosRapido.find((d) => mesmoDocumentoReferencia(doc, d));
    return hit ? [hit] : [doc];
  }, [docFiltradosRapido, doc, codigoAlvoPlanejamento]);

  const listaTodosDesenhosParaExibir = useMemo(() => {
    const all = (payload?.documentos ?? []) as DocumentoPlanejamento[];
    if (!doc) return all;
    const hit = all.find((d) => mesmoDocumentoReferencia(doc, d));
    return hit ? [hit] : [doc];
  }, [payload?.documentos, doc]);

  const docsPendenteParaExibir = useMemo(() => {
    if (!doc) return docsComPendenteMaterial;
    const docAindaPendente = docsComPendenteMaterial.some(({ documento: d }) =>
      mesmoDocumentoReferencia(doc, d),
    );
    if (!docAindaPendente) return docsComPendenteMaterial;
    return docsComPendenteMaterial.filter(({ documento: d }) => mesmoDocumentoReferencia(doc, d));
  }, [docsComPendenteMaterial, doc]);

  /** Com código scaneado: não manter desenho aberto se já não há pendência para esse material. */
  useEffect(() => {
    if (!codigoAlvoPlanejamento || !doc || !payload) return;
    const aindaPendente = docsComPendenteMaterial.some(({ documento: d }) =>
      mesmoDocumentoReferencia(doc, d),
    );
    if (!aindaPendente) {
      setDoc(null);
      setBuscaDoc('');
      setQtdLinha({});
      if (docsComPendenteMaterial.length > 0) {
        setMostrarListaDocsMaterial(true);
      }
    }
  }, [codigoAlvoPlanejamento, doc, payload, docsComPendenteMaterial]);

  const candidatosBuscaDocParaExibir = useMemo(() => {
    if (!candidatosBuscaDoc?.length) return candidatosBuscaDoc;
    if (!doc) return candidatosBuscaDoc;
    const hit = candidatosBuscaDoc.find((d) => mesmoDocumentoReferencia(doc, d));
    return hit ? [hit] : candidatosBuscaDoc;
  }, [candidatosBuscaDoc, doc]);

  const documentoPermitidoParaCodigoScaneado = useCallback(
    (d: DocumentoPlanejamento) => {
      if (!codigoAlvoPlanejamento) return true;
      return docsComPendenteMaterial.some(({ documento: x }) => mesmoDocumentoReferencia(x, d));
    },
    [codigoAlvoPlanejamento, docsComPendenteMaterial],
  );

  /** Abre documento e, se veio sem itens (list_page/resumo), hidrata da nuvem. */
  const abrirDocumentoAtendimento = useCallback(
    (d: DocumentoPlanejamento, opts?: { mensagem?: string | null }) => {
      setDoc(deepClone(d));
      setQtdLinha({});
      setCandidatosBuscaDoc(null);
      if (opts && 'mensagem' in opts) setMsgBusca(opts.mensagem ?? null);
      else setMsgBusca(null);
      void (async () => {
        if ((d.itens?.length ?? 0) > 0) return;
        try {
          const cloud = await readDocumentoPlanejamentoFromCloud({
            documentoId: d.id,
            numero: d.numero,
            revisao: d.revisao,
          });
          if (!cloud.documento) return;
          const docFull = cloud.documento as unknown as DocumentoPlanejamento;
          mergeDocumentosNoPayload([docFull]);
          setDoc(deepClone(docFull));
        } catch {
          /* mantém versão parcial */
        }
      })();
    },
    [mergeDocumentosNoPayload],
  );

  /** Abre o desenho só quando a busca «inteligente» encontra uma correspondência única (evita mensagens a cada tecla). */
  const tentarAutoSelecionarDocumento = useCallback(() => {
    if (!payload?.documentos?.length) return;
    const raw = buscaDoc.trim();
    if (raw.length < 1) return;
    const res = resolverBuscaDocumentoPorNumero(payload.documentos as DocumentoPlanejamento[], buscaDoc);
    if (res.kind === 'one') {
      if (!documentoPermitidoParaCodigoScaneado(res.doc)) return;
      abrirDocumentoAtendimento(res.doc);
      return;
    }
    if (res.kind === 'sameNumeroVarios') {
      const escolhido = res.docs.find((d) => documentoPermitidoParaCodigoScaneado(d));
      if (!escolhido) return;
      abrirDocumentoAtendimento(escolhido);
    }
  }, [buscaDoc, payload, documentoPermitidoParaCodigoScaneado, abrirDocumentoAtendimento]);

  const buscarDocumento = useCallback(() => {
    setMsgBusca(null);
    setDoc(null);
    setQtdLinha({});
    setCandidatosBuscaDoc(null);
    if (!payload) {
      setMsgBusca('Carregue os dados da nuvem primeiro.');
      return;
    }
    const alvo = norm(buscaDoc);
    if (!alvo) {
      setMsgBusca('Informe o número do documento (ex.: AQ-3-BT-232-CS10-IQ).');
      return;
    }
    setBuscandoDoc(true);
    void (async () => {
      let documentos: DocumentoPlanejamento[];
      try {
        documentos = await carregarDocumentosParaBuscaTexto({
          payload,
          buscaTexto: buscaDoc,
          mergeDocumentos: mergeDocumentosNoPayload,
        });
      } catch {
        setMsgBusca('Não foi possível ler o desenho na nuvem. Verifique a ligação.');
        return;
      }
      if (!documentos.length) {
        setMsgBusca('Desenho não encontrado na nuvem. Confira o número ou envie o planejamento do PC.');
        return;
      }
      const res = resolverBuscaDocumentoPorNumero(documentos, buscaDoc);
      if (res.kind === 'none') {
        const ex = exemplosNumerosDocumentos(documentos, 6);
        setMsgBusca(
          ex.length
            ? `Nenhum desenho combina com «${buscaDoc.trim()}». Exemplos carregados: ${ex.join(' · ')}.`
            : 'Nenhum documento encontrado.',
        );
        return;
      }
      if (res.kind === 'one') {
        if (!documentoPermitidoParaCodigoScaneado(res.doc)) {
          setMsgBusca(
            codigoAlvoPlanejamento
              ? `O desenho «${String(res.doc.numero ?? '—')}» já não tem retirada pendente para ${codigoAlvoPlanejamento}.`
              : 'Documento encontrado.',
          );
          return;
        }
        abrirDocumentoAtendimento(res.doc);
        return;
      }
      if (res.kind === 'sameNumeroVarios') {
        const escolhido = res.docs.find((d) => documentoPermitidoParaCodigoScaneado(d));
        if (!escolhido) {
          setMsgBusca(
            codigoAlvoPlanejamento
              ? `Nenhuma revisão deste desenho tem retirada pendente para ${codigoAlvoPlanejamento}.`
              : `${res.docs.length} documentos com o mesmo número.`,
          );
          return;
        }
        abrirDocumentoAtendimento(escolhido, {
          mensagem: `${res.docs.length} documentos com o mesmo número — abrindo o que tem pendência.`,
        });
        return;
      }
      setCandidatosBuscaDoc(res.docs);
      setMsgBusca(`${res.docs.length} desenhos correspondem a «${buscaDoc.trim()}» — toque numa linha para abrir.`);
    })().finally(() => setBuscandoDoc(false));
  }, [
    buscaDoc,
    payload,
    codigoAlvoPlanejamento,
    documentoPermitidoParaCodigoScaneado,
    mergeDocumentosNoPayload,
    abrirDocumentoAtendimento,
  ]);

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
    const avaliacao = avaliarLeituraScanAtendimento(payloadRef.current ?? payload, t);
    if (avaliacao.vazio) return;
    void playScanBeep();
    // Aceita sempre a leitura. O cadastro local pode estar incompleto (fatia leve);
    // a lista de desenhos pendentes resolve depois via RPC. Sem popup aqui —
    // «código fora do cadastro local» confundia com «sem saldo».
    setCodigoBarras(avaliacao.codigo);
    setScannerOpen(false);
    alertaBloqueioCodigoRef.current = null;
  }, [payload]);

  const finalizarSessaoAtendimentoEPartilhar = useCallback(
    (opts?: { skipConfirm?: boolean }) => {
      const executar = async () => {
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
        const linhasSessao = sessaoAtendimentoRef.current;
        if (linhasSessao.length === 0) return;
        const loteRef = sessaoCodigoBarrasLoteRef.current;

        setFinalizandoSessao(true);
        try {
          const sync = await garantirAtendimentoSincronizadoNaNuvem({
            payloadLocal: payloadRef.current ?? payload,
            loteRef,
            linhasSessao,
          });
          if (!sync.ok) {
            appAlert(
              'Nuvem incompleta',
              `${sync.error}\n\nO recibo só pode ser emitido quando **todas** as baixas estiverem confirmadas na nuvem (igual ao PC).`,
            );
            return;
          }
          if (sync.payloadHistorico) {
            setPayload((prev) => {
              const merged = mergeAtendimentoPayloadPreservandoLocal(sync.payloadHistorico!, prev ?? sync.payloadHistorico!);
              payloadRef.current = merged;
              return merged;
            });
          }
          if (sync.updatedAt) {
            setNuvemAt(sync.updatedAt);
            nuvemAtRef.current = sync.updatedAt;
          }
          const pending = await getAtendimentoComandoQueueSize();
          setComandosPendentes(pending);

          const payloadValidacao = payloadRef.current ?? sync.payloadHistorico ?? payload;
          const validacao = validarReciboSessaoContraHistorico(payloadValidacao, linhasSessao, loteRef);
          if (!validacao.ok) {
            appAlert(
              'Dados não conferem',
              `${validacao.motivo}\n\nSessão neste telemóvel: ${validacao.itensSessao} item(ns).\nNa nuvem: ${validacao.itensNuvem} item(ns).\n\nToque em «Carregar dados da nuvem» e aguarde a sincronização antes de finalizar.`,
            );
            return;
          }

          const linhas = validacao.linhasRecibo;
          const ctx = {
            documentoReferencia: doc,
            configuracoesSistema: payloadValidacao?.configuracoesSistema,
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
        } finally {
          setFinalizandoSessao(false);
        }
      };

      if (opts?.skipConfirm) {
        void executar();
        return;
      }

      const linhasSessao = sessaoAtendimentoRef.current;
      const qtdOps = linhasSessao.length;
      appAlert(
        'Confirmar',
        `Finalizar sessão e gerar comprovante?\n\nDestinatário: ${recebedorResolvido?.ok ? recebedorResolvido.nomeOficial : recebedor.trim()}\nOperações: ${qtdOps}\n\nO sistema vai **confirmar na nuvem** antes de abrir o recibo — mobile e PC ficam iguais.\n\nMantenha ligação até concluir.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Confirmar e sincronizar', onPress: () => void executar() },
        ],
      );
    },
    [recebedor, recebedorResolvido, nuvemAt, payload, doc],
  );

  const fecharComprovanteModal = useCallback(() => {
    setComprovanteModal((prev) => {
      prev?.onFechar?.();
      return null;
    });
  }, []);

  const obterReservaProtocoloNovaSessao = useCallback(async (): Promise<{
    loteNumero: string;
    loteId: number;
  } | null> => {
    if (sessaoCodigoBarrasLoteRef.current || !nuvemAt) return null;
    try {
      const cloud = await reservarNumeroAtendimentoFromCloud(nuvemAt);
      if (cloud.ok) {
        setNuvemAt(cloud.updatedAt);
        setPayload((p) =>
          p
            ? {
                ...p,
                configuracoesSistema: {
                  ...(p.configuracoesSistema ?? {}),
                  sequenciaAtendimento: cloud.sequencia,
                },
              }
            : p,
        );
        return { loteNumero: cloud.numero, loteId: Date.now() + Math.floor(Math.random() * 1000) };
      }
    } catch {
      /* reserva local em aplicarAtendimento* */
    }
    return null;
  }, [nuvemAt]);

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
    const docId = resolverIdDocumentoPlanejamento(payload, doc);
    if (!docId) {
      appAlert(
        'Documento de referência',
        'Abra um desenho válido no planejamento antes de dar baixa (busque pelo número e confirme).',
      );
      return;
    }
    const reservaInicial = continuacao ? null : await obterReservaProtocoloNovaSessao();
    const basePayload = payloadRef.current ?? payload;
    const res = aplicarAtendimentoPorCodigoBarras(basePayload, cod, q, nomeAt, receb, matAt, continuacao, {
      apenasDocumentoId: docId,
      exigirDocumentoReferencia: true,
      identificacaoComplementar: identHist,
      reservaInicial,
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
              if (!payload || !nuvemAt) {
                appAlert('Atendimento', 'Carregue o snapshot da nuvem antes de registar.');
                return;
              }
              const idempotencyKey = buildAtendimentoIdempotencyKey({
                loteId: res.loteId,
                loteNumero: res.loteNumero,
                documentoId: docId,
                codigoMaterial: matCod,
                quantidade: q,
              });
              const payloadAntesSync = basePayload;
              setPayload(res.payload);
              payloadRef.current = res.payload;
              if (!continuacao) {
                sessaoCodigoBarrasLoteRef.current = { loteNumero: res.loteNumero, loteId: res.loteId };
              }
              const linha: LinhaSessaoAtendimento = {
                tipo: 'codigo_barras',
                loteNumero: res.loteNumero,
                material: res.material,
                atendidoTotal: res.atendidoTotal,
                documentosGravados: res.documentosGravados,
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
              sincronizarAtendimentoEmBackground(payloadAntesSync, res.payload, idempotencyKey);
              const produtoLinha = String(res.material.descricao ?? '').trim() || matCod;
              const unMat = String(res.material.unidade ?? '').trim();
              const qLinha = formatQuantidadeExibicao(res.atendidoTotal);
              appAlert(
                'Código registrado',
                `Deseja continuar a registar mais materiais neste atendimento ou finalizar?\n\nProduto: ${produtoLinha}\nQuantidade: ${qLinha}${unMat ? ` ${unMat}` : ''}\nProtocolo: ${res.loteNumero}${continuacao ? '\n(mesmo protocolo — comprovante único ao finalizar)' : ''}\n\nSessão gravada neste aparelho.\n\nAo finalizar, o app **confirma na nuvem** antes de abrir o recibo.`,
                [
                  { text: 'Continuar', style: 'cancel' },
                  {
                    text: 'Finalizar (confirmar nuvem)',
                    onPress: () => finalizarSessaoAtendimentoEPartilhar({ skipConfirm: true }),
                  },
                ],
              );
            })();
          },
        },
      ],
    );
  }, [codigoBarras, doc, finalizarSessaoAtendimentoEPartilhar, nuvemAt, obterReservaProtocoloNovaSessao, payload, qtdBarras, recebedor, sincronizarAtendimentoEmBackground]);

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
    const reservaInicial = continuacao ? null : await obterReservaProtocoloNovaSessao();
    const basePayload = payloadRef.current ?? payload;
    const res = aplicarAtendimentoLote(basePayload, doc.id, qtds, nomeAt, receb, matAt, continuacao, identHist, reservaInicial);
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
              if (!payload || !nuvemAt) {
                appAlert('Atendimento', 'Carregue o snapshot da nuvem antes de registar.');
                return;
              }
              const payloadAntes = payloadRef.current ?? payload;
              const docParaRecibo = deepClone(doc);
              const qtdsCapturadas = { ...qtds };
              const idsHistoricoAntes = new Set(
                ((payloadAntes.atendimentoHistorico ?? []) as { id?: number }[]).map((h) => h.id),
              );
              const qSum = Object.values(qtdsCapturadas).reduce((a, b) => a + b, 0);
              const qKey = Object.entries(qtdsCapturadas)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([k, v]) => `${k}:${v}`)
                .join('|');
              const idempotencyKey = buildAtendimentoIdempotencyKey({
                loteId: res.loteId,
                loteNumero: res.loteNumero,
                documentoId: doc.id,
                codigoMaterial: qKey || 'linhas',
                quantidade: qSum,
              });
              setPayload(res.payload);
              payloadRef.current = res.payload;
              const docs = res.payload.documentos as DocumentoPlanejamento[] | undefined;
              const num = String(docParaRecibo.numero ?? '').trim();
              const rev = String(docParaRecibo.revisao ?? '').trim();
              const atualizado =
                docs?.find((d) => String(d.id) === String(doc.id)) ??
                (num ? docs?.find((d) => String(d.numero ?? '').trim() === num && String(d.revisao ?? '').trim() === rev) : undefined);
              if (atualizado) {
                const cod = codigoAlvoPlanejamento;
                if (cod && !materialTemDemandaPendenteNoDocumento(res.payload, String(atualizado.id), cod)) {
                  setDoc(null);
                  setBuscaDoc('');
                  setQtdLinha({});
                  const restantes = listarDocumentosComDemandaPendenteMaterial(res.payload, cod);
                  setMostrarListaDocsMaterial(restantes.length > 1);
                } else {
                  setDoc(deepClone(atualizado));
                }
              }
              const itensLinha: { codigo: string; qtd: number; unidade: string; descricao: string }[] = [];
              const novasHistorico = ((res.payload.atendimentoHistorico ?? []) as Record<string, unknown>[]).filter(
                (h) => !idsHistoricoAntes.has(h.id as number),
              );
              if (novasHistorico.length > 0) {
                for (const h of novasHistorico) {
                  itensLinha.push({
                    codigo: String(h.codigo ?? ''),
                    qtd: Number(h.quantidade) || 0,
                    unidade: String(h.unidade ?? 'UN'),
                    descricao: String(h.descricao ?? ''),
                  });
                }
              } else {
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
              sincronizarAtendimentoEmBackground(payloadAntes, res.payload, idempotencyKey);
              appAlert(
                'Atendimento registado',
                `Documento ${docNum}: registado neste aparelho.\nProtocolo: ${res.loteNumero}${continuacao ? '\n(mesmo protocolo — vários itens no mesmo comprovante)' : ''}\n\nSessão para «${receb}»: ${nextSessao.length} operação(ões).\n\nDeseja continuar a registar ou finalizar o atendimento?`,
                [
                  { text: 'Continuar', style: 'cancel' },
                  {
                    text: 'Finalizar atendimento',
                    onPress: () => finalizarSessaoAtendimentoEPartilhar(),
                  },
                ],
              );
            })();
          },
        },
      ]
    );
  }, [
    codigoAlvoPlanejamento,
    doc,
    finalizarSessaoAtendimentoEPartilhar,
    nuvemAt,
    obterReservaProtocoloNovaSessao,
    payload,
    qtdLinha,
    recebedor,
    sincronizarAtendimentoEmBackground,
  ]);

  const escolherRecebedorColaborador = useCallback((c: Colaborador) => {
    if (blurSugestoesTimer.current) clearTimeout(blurSugestoesTimer.current);
    setRecebedor((c.nome || '').trim());
    setMostrarSugestoesRecebedor(false);
  }, []);

  const selecionarDocumentoPlanejamento = useCallback(
    (d: DocumentoPlanejamento) => {
      if (codigoAlvoPlanejamento && !documentoPermitidoParaCodigoScaneado(d)) return;
      if (blurDocsTimer.current) clearTimeout(blurDocsTimer.current);
      setBuscaDoc(String(d.numero ?? ''));
      setMostrarListaDocsMaterial(false);
      abrirDocumentoAtendimento(d);
    },
    [codigoAlvoPlanejamento, documentoPermitidoParaCodigoScaneado, abrirDocumentoAtendimento],
  );

  useEffect(() => {
    const cur = codigoAlvoPlanejamento;
    if (!cur) {
      prevCodigoAlvoPlanejamentoRef.current = null;
      setMostrarListaDocsMaterial(false);
      alertaBloqueioCodigoRef.current = null;
      return;
    }
    const prev = prevCodigoAlvoPlanejamentoRef.current;
    if (prev !== cur) {
      setDoc(null);
      setBuscaDoc('');
      setMsgBusca(null);
      setCandidatosBuscaDoc(null);
      prevCodigoAlvoPlanejamentoRef.current = cur;
      alertaBloqueioCodigoRef.current = null;
    }
  }, [codigoAlvoPlanejamento]);

  /** Depois da nuvem resolver a pendência: alerta claro se não der para atender (saldo/pendência). */
  useEffect(() => {
    const cur = codigoAlvoPlanejamento?.trim() ?? '';
    if (!cur || carregandoDesenhos) return;
    if (pendenciaMaterialCache?.codigo !== cur) return;
    if (alertaBloqueioCodigoRef.current === cur) return;
    const msg = mensagemBloqueioBaixaPorCodigo({
      codigo: cur,
      saldoEstoque: saldoEstoqueMaterialBarras,
      temPendenciaPlanejamento: docsComPendenteMaterial.length > 0,
    });
    if (!msg) return;
    alertaBloqueioCodigoRef.current = cur;
    appAlert(msg.titulo, msg.corpo);
  }, [
    codigoAlvoPlanejamento,
    carregandoDesenhos,
    pendenciaMaterialCache,
    saldoEstoqueMaterialBarras,
    docsComPendenteMaterial.length,
  ]);

  useDebouncedEffect(
    () => {
      if (!payload || !codigoAlvoPlanejamento) {
        setPendenciaMaterialCache(null);
        setCarregandoDesenhos(false);
        return;
      }
      const cur = codigoAlvoPlanejamento.trim();
      if (!cur) return;
      const reqId = ++pendenciaMaterialReqRef.current;
      setCarregandoDesenhos(true);
      void (async () => {
        try {
          const rpc = await listDocumentosPendenciaMaterialFromCloud(cur);
          if (pendenciaMaterialReqRef.current !== reqId) return;
          if (!rpc.missing && rpc.documentos.length > 0) {
            const docs = rpc.documentos as unknown as DocumentoPlanejamento[];
            mergeDocumentosNoPayload(docs);
            const base = payloadRef.current;
            const miniPayload = base
              ? { ...base, documentos: mergeDocumentosPlanejamentoNoPayload([], docs) }
              : null;
            const lista = miniPayload
              ? listarDocumentosComDemandaPendenteMaterial(miniPayload, cur)
              : [];
            setPendenciaMaterialCache({ codigo: cur, docs: lista });
            return;
          }
          const base = payloadRef.current;
          const lista = base ? listarDocumentosComDemandaPendenteMaterial(base, cur) : [];
          setPendenciaMaterialCache({ codigo: cur, docs: lista });
        } catch {
          if (pendenciaMaterialReqRef.current !== reqId) return;
          const base = payloadRef.current;
          const lista = base ? listarDocumentosComDemandaPendenteMaterial(base, cur) : [];
          setPendenciaMaterialCache({ codigo: cur, docs: lista });
        } finally {
          if (pendenciaMaterialReqRef.current === reqId) {
            setCarregandoDesenhos(false);
          }
        }
      })();
    },
    [payload, codigoAlvoPlanejamento, mergeDocumentosNoPayload],
    280,
  );

  useEffect(() => {
    if (!codigoAlvoPlanejamento || !payload) return;
    const lista = docsComPendenteMaterial;
    if (lista.length === 1) {
      setMostrarListaDocsMaterial(false);
      const d = lista[0].documento;
      setDoc(deepClone(d));
      setBuscaDoc(String(d.numero ?? ''));
      setMsgBusca(null);
      setCandidatosBuscaDoc(null);
      setQtdLinha({});
    } else if (lista.length > 1) {
      setMostrarListaDocsMaterial(true);
    } else if ((payload.documentos?.length ?? 0) > 0) {
      setMostrarListaDocsMaterial(false);
      setDoc(null);
      setBuscaDoc('');
      setQtdLinha({});
    }
  }, [codigoAlvoPlanejamento, payload, docsComPendenteMaterial]);

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
      contentContainerStyle={[styles.container, shell.screenPad]}
      keyboardShouldPersistTaps="handled"
    >
      <ModuleScreenHeader
        kicker="Operação de campo"
        title="Atendimento"
        helpText="Carregue a nuvem, indique quem recebe, escaneie ou abra o desenho e registe as baixas. A gravação é imediata neste aparelho; a sincronização com a nuvem corre em segundo plano (faixa «Nuvem» em cima). O mesmo protocolo (ATD) segue até mudar o recebedor ou finalizar a sessão."
        showHelp={mostrarTextosAjudaModulos}
      />

      <CloudSyncStrip
        configured={configured}
        error={loadErr}
        errorLabel="Erro ao carregar"
        loading={(loading && !payload) || syncingComandos || finalizandoSessao}
        pendingLabel={
          finalizandoSessao
            ? 'A confirmar todas as baixas na nuvem…'
            : syncingComandos
              ? 'A sincronizar atendimento…'
              : resumoSyncSessao && !resumoSyncSessao.emDia
                ? `${resumoSyncSessao.itensSessao} na sessão · ${resumoSyncSessao.itensNuvem} confirmados na nuvem`
                : resumoSyncSessao?.emDia
                  ? `${resumoSyncSessao.itensNuvem} item(ns) confirmados na nuvem`
                  : comandosPendentes > 0
                    ? `${comandosPendentes} atendimento(s) na fila offline`
                    : loading && !payload
                      ? 'A carregar dados…'
                      : undefined
        }
        updatedAt={nuvemAt}
      />

      {payload ? (
        <StatPillRow
          items={[
            {
              label: 'Desenhos',
              value: carregandoDesenhos
                ? 'a carregar…'
                : (payload.documentos?.length ?? 0) > 0
                  ? (payload.documentos!.length > MAX_DESENHOS_EM_MEMORIA
                      ? 'sob demanda'
                      : `${payload.documentos!.length} carreg.`)
                  : 'sob demanda',
            },
            {
              label: 'Recebimentos',
              value: payload.recebimentos?.length ?? 0,
            },
            { label: 'Colaboradores', value: payload.colaboradores?.length ?? 0 },
          ]}
        />
      ) : null}

      <PrimaryActionButton
        disabled={loading}
        label="Carregar dados da nuvem"
        loading={loading}
        loadingLabel="A carregar da nuvem…"
        onPress={() => void carregarNuvem()}
      />
      {payload && (payload.recebimentos?.length ?? 0) === 0 ? (
        <Text style={styles.warn}>
          Sem recebimentos no snapshot — confira se o PC enviou dados para a nuvem (mesmo Supabase no `.env`).
        </Text>
      ) : null}
      {payload && (payload.documentos?.length ?? 0) === 0 ? (
        <Text style={styles.hintSmall}>
          Desenhos carregam ao escanear código ou abrir documento — não é preciso baixar todos de uma vez.
        </Text>
      ) : null}
      <Text style={styles.label}>Quem recebeu / retirou o material *</Text>
      {mostrarTextosAjudaModulos ? (
        <Text style={styles.hintSmall}>
          Tem de ser um nome ou matrícula igual ao cadastro de colaboradores no I.S.O PRO — toque numa sugestão ou escreva exatamente como está no cadastro.
          {sessaoAtendimentoItens.length > 0
            ? ' Com baixas em curso, o recebedor fica bloqueado — finalize a sessão para mudar.'
            : ''}
        </Text>
      ) : null}
      <View style={styles.recebedorWrap}>
        <TextInput
          style={[styles.input, styles.inputRecebedor, sessaoAtendimentoItens.length > 0 && styles.btnOff]}
          placeholder="Nome, matrícula…"
          placeholderTextColor={colors.placeholder}
          value={recebedor}
          editable={sessaoAtendimentoItens.length === 0}
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
        <Text style={styles.err}>Sem saldo em estoque — não pode efetuar atendimento neste código.</Text>
      ) : null}
      {codigoAlvoPlanejamento &&
      !carregandoDesenhos &&
      pendenciaMaterialCache?.codigo === codigoAlvoPlanejamento.trim() &&
      temPendenciaPlanejadaBarras === false ? (
        <Text style={styles.err}>
          Sem quantidade pendente no planejamento — já foi toda retirada ou não há desenho com falta. Não pode efetuar
          atendimento neste item.
        </Text>
      ) : null}
      {codigoBarras.trim() &&
      !materialDoScan &&
      !carregandoDesenhos &&
      !temPendenciaPlanejadaBarras &&
      !doc &&
      pendenciaMaterialCache?.codigo === (codigoAlvoPlanejamento?.trim() ?? '') ? (
        <Text style={[styles.warn, { fontSize: 12 }]}>
          Código ainda não reconhecido no cadastro local. Se a nuvem também não trouxe desenhos, envie o planejamento do
          PC e toque em «Carregar dados da nuvem».
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
          style={({ pressed }) => [
            styles.btnSec,
            styles.btnBarras,
            (!payload || loading) && styles.btnOff,
            pressed && !(!payload || loading) && styles.btnPressed,
          ]}
          android_ripple={{ color: 'rgba(255,255,255,0.18)' }}
          onPress={abrirScanner}
          disabled={!payload || loading}
        >
          <Text style={styles.btnTextSec}>Escanear</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.btnOk,
            styles.btnBarrasGo,
            !podeDarBaixaBarras && styles.btnOff,
            pressed && podeDarBaixaBarras && styles.btnPressed,
          ]}
          android_ripple={{ color: 'rgba(255,255,255,0.18)' }}
          onPress={registarPorCodigo}
          disabled={!podeDarBaixaBarras}
        >
          <Text style={styles.btnText}>Dar baixa</Text>
        </Pressable>
      </View>
      {sessaoAtendimentoItens.length > 0 ? (
        <SectionCard title={`Sessão · ${sessaoAtendimentoItens.length} operação(ões)`}>
          {resumoSyncSessao ? (
            <Text
              style={[
                styles.sessaoBarrasTxt,
                !resumoSyncSessao.emDia && { color: colors.warn ?? '#fbbf24' },
              ]}
            >
              {syncingComandos || comandosPendentes > 0
                ? `A enviar ${resumoSyncSessao.itensSessao} item(ns) para a nuvem… aguarde antes de finalizar.`
                : resumoSyncSessao.emDia
                  ? `Sessão pronta (${resumoSyncSessao.itensSessao} item(ns)). Toque em Finalizar para fazer a confirmação autoritativa na nuvem.`
                : `Sincronização: ${resumoSyncSessao.itensSessao} nesta sessão · ${resumoSyncSessao.itensNuvem} na nuvem (${resumoSyncSessao.faltam} pendente(s)). Aguarde ou toque em «Carregar dados da nuvem».`}
            </Text>
          ) : null}
          {mostrarTextosAjudaModulos ? (
            <Text style={styles.sessaoBarrasTxt}>
              Vários registos seguem o mesmo protocolo (um atendimento no sistema). «Finalizar» gera o comprovante único (partilhar ou imprimir).
            </Text>
          ) : (
            <Text style={styles.sessaoBarrasTxt}>Finalizar gera o comprovante único desta sessão.</Text>
          )}
          <Pressable
            style={[
              styles.btnSessaoFim,
              (!baseNuvemRecebedor || finalizandoSessao) && styles.btnOff,
            ]}
            onPress={() => finalizarSessaoAtendimentoEPartilhar()}
            disabled={!baseNuvemRecebedor || finalizandoSessao}
          >
            {finalizandoSessao ? (
              <View style={styles.finalizarRow}>
                <ActivityIndicator color={colors.text} size="small" />
                <Text style={styles.btnTextSec}>A confirmar na nuvem…</Text>
              </View>
            ) : (
              <Text style={styles.btnTextSec}>Finalizar sessão — comprovante único</Text>
            )}
          </Pressable>
        </SectionCard>
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
            ) : carregandoDesenhos ? (
              <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                <ActivityIndicator color={colors.accent} />
                <Text style={[styles.docsMaterialEmpty, { marginTop: 10 }]}>
                  A buscar desenhos com pendência para {codigoAlvoPlanejamento ?? 'este material'}…
                </Text>
              </View>
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
                      <StatPillRow
                        dense
                        columns={2}
                        items={[
                          {
                            label: 'Pend. de atend.',
                            value: formatQuantidadeComUnidade(restanteMaterial, unidadeMaterialAlvo),
                            tone: restanteMaterial > 0 ? 'success' : 'muted',
                          },
                          {
                            label: 'Estoque',
                            value: formatQuantidadeComUnidade(saldoCod, unidadeMaterialAlvo),
                            tone: saldoCod <= 0 ? 'warn' : 'default',
                          },
                        ]}
                      />
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        ) : null}
      </View>
      {payload &&
      buscaDoc.trim().length === 0 &&
      !codigoBarras.trim() &&
      ((payload.documentos?.length ?? 0) > 0 || carregandoDesenhos) ? (
        <View style={[styles.docsMaterialBox, { marginBottom: 12 }]}>
          <Text style={styles.docsMaterialTit}>
            {doc
              ? 'Desenho em referência — use a pesquisa para localizar outro'
              : carregandoDesenhos && (payload.documentos?.length ?? 0) === 0
                ? 'A carregar desenhos deste telemóvel…'
                : `Pendentes de atendimento neste telemóvel (${payload.documentos!.length}) — toque para abrir`}
          </Text>
          {carregandoDesenhos && (payload.documentos?.length ?? 0) === 0 ? (
            <Text style={[styles.hintSmall, { marginBottom: 8 }]}>Aguarde — a lista completa aparece em seguida.</Text>
          ) : null}
          {mostrarTextosAjudaModulos && payload.documentos!.length > 400 && !doc ? (
            <Text style={[styles.hintSmall, { marginBottom: 8 }]}>
              Lista grande: use o campo de pesquisa em cima para ir direto ao desenho — a rolagem continua disponível.
            </Text>
          ) : null}
          {(payload.documentos?.length ?? 0) > 0 ? (
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
          ) : null}
        </View>
      ) : null}
      <Pressable
        style={({ pressed }) => [
          styles.btnSec,
          (!payload || loading || buscandoDoc) && styles.btnOff,
          pressed && !(!payload || loading || buscandoDoc) && styles.btnPressed,
        ]}
        android_ripple={{ color: 'rgba(255,255,255,0.18)' }}
        onPress={buscarDocumento}
        disabled={!payload || loading || buscandoDoc}
      >
        {buscandoDoc ? (
          <View style={styles.finalizarRow}>
            <ActivityIndicator color={colors.text} size="small" />
            <Text style={styles.btnTextSec}>A buscar na nuvem…</Text>
          </View>
        ) : (
          <Text style={styles.btnTextSec}>Buscar documento</Text>
        )}
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
              «Pend. de atend.» = pendente de atendimento no desenho (projeto − já atendido). «Estoque» = saldo no sistema.
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
            const unidadeLinha = String(it.unidade ?? unidadeMaterialAlvo ?? '').trim();
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
                    <StatPillRow
                      dense
                      columns={2}
                      items={[
                        {
                          label: 'Pend. de atend.',
                          value: formatQuantidadeComUnidade(rest, unidadeLinha),
                          tone: semSaldo ? 'muted' : 'success',
                        },
                        {
                          label: 'Estoque',
                          value: formatQuantidadeComUnidade(saldoEstoque, unidadeLinha),
                          tone: semRecebimento ? 'warn' : 'default',
                        },
                      ]}
                    />
                  ) : (
                    <StatPillRow
                      dense
                      columns={2}
                      items={[
                        {
                          label: 'Projeto',
                          value: formatQuantidadeComUnidade(qProj, unidadeLinha),
                        },
                        {
                          label: 'Atendido',
                          value: formatQuantidadeComUnidade(qAt, unidadeLinha),
                          tone: semSaldo ? 'muted' : 'default',
                        },
                        {
                          label: 'Pend. de atend.',
                          value: formatQuantidadeComUnidade(rest, unidadeLinha),
                          tone: semSaldo ? 'muted' : 'success',
                        },
                        {
                          label: 'Estoque',
                          value: formatQuantidadeComUnidade(saldoEstoque, unidadeLinha),
                          tone: semRecebimento ? 'warn' : 'default',
                        },
                      ]}
                    />
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
            style={[styles.btnOk, !podeRegistarPorLinhasDocumento && styles.btnOff]}
            onPress={registar}
            disabled={!podeRegistarPorLinhasDocumento}
          >
            <Text style={styles.btnText}>Registar atendimento e gravar na nuvem</Text>
          </Pressable>
        </View>
      ) : null}

      {syncingComandos || comandosPendentes > 0 ? (
        <ActivityIndicator style={{ marginTop: 16 }} color={colors.accent} />
      ) : null}

      <AtendimentoOperacaoOverlay
        visible={operacaoOverlay.visible}
        titulo={operacaoOverlay.titulo}
        mensagem={operacaoOverlay.mensagem}
        colors={colors}
      />

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
