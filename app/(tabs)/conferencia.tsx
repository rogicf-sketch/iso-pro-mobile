import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { CloudSyncStrip } from '@/src/components/mobile/CloudSyncStrip';
import { EmptyStatePanel } from '@/src/components/mobile/EmptyStatePanel';
import { ModuleScreenHeader } from '@/src/components/mobile/ModuleScreenHeader';
import { PrimaryActionButton } from '@/src/components/mobile/PrimaryActionButton';
import { StatPillRow } from '@/src/components/mobile/StatPillRow';
import { buildMobileShellStyles } from '@/src/theme/buildMobileShellStyles';
import { buildConferenciaStyles } from '@/src/theme/buildConferenciaStyles';
import { useMobileUiPreferences } from '@/src/theme/MobileUiPreferencesContext';
import { useTheme } from '@/src/theme/ThemeContext';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { appAlert } from '@/src/lib/appDialog';
import {
  exemplosNotasRecebimentos,
  filtrarRecebimentosPorTextoInteligente,
  resolverBuscaRecebimentoPorNota,
  rotuloNotaRomaneioRecebimento,
} from '@/src/lib/recebimentoBusca';
import {
  linhaEstadoConferenciaMobile,
  listarRecebimentosPendentesConferencia,
  recebimentoPermiteEditarConferencia,
} from '@/src/lib/recebimentoConferenciaMobile';
import {
  listRecebimentosPageFromCloud,
  readRecebimentoFromCloud,
  syncRecebimentosFromSnapshotCloud,
} from '@/src/lib/escalaCloud';
import {
  wireRecebimentoDetalheEscala,
  wireRecebimentoListaEscala,
} from '@/src/lib/recebimentoEscalaWire';
import { buildSnapshotPatchFromNext, fetchSnapshotSlices } from '@/src/lib/snapshot';
import { commitDefaultSnapshotPatchWriteResilient as commitDefaultSnapshotWrite } from '@/src/lib/offlineSnapshotQueue';
import { createSnapshotPatchPrepareWithBaseline } from '@/src/lib/snapshotWritePrepare';
import {
  SNAPSHOT_MOBILE_CONFERENCIA_MERGE_KEYS,
  SNAPSHOT_MOBILE_CONFERENCIA_PATCH_KEYS,
  SNAPSHOT_MOBILE_CONFERENCIA_READ_KEYS,
  SNAPSHOT_MOBILE_CONFERENCIA_WRITE_READ_KEYS,
} from '@/src/lib/snapshotSliceKeys';
import { hasSupabaseConfig } from '@/src/lib/config';
import {
  analisarDivergenciasAposFinalizar,
  linhaComDivergenciaVisual,
  mensagemResumoDivergencias,
} from '@/src/lib/conferenciaQuantidades';
import { conferenciaLocalDifereDoSnapshot } from '@/src/lib/conferenciaEstado';
import {
  MAX_LOCALIZACAO_ITEM,
  locLinhaNormalizada,
  aplicarLocalizacaoEmEdicaoNoItem,
  limitarTextoLocalizacaoEmEdicao,
  normalizarLocalizacaoItensRecebimento,
  normalizarTextoLocalizacaoItem,
} from '@/src/lib/conferenciaLocalizacao';
import {
  lerRascunhoConferencia,
  limparRascunhoConferencia,
  salvarRascunhoConferencia,
} from '@/src/lib/conferenciaRascunhoStorage';
import { mergeRecebimentoConferido } from '@/src/lib/conferenciaMerge';
import { registerConferenciaSessaoGate } from '@/src/lib/conferenciaSessaoGate';
import { useSnapshotRefreshOnAppActive } from '@/src/lib/useSnapshotRefreshOnAppActive';
import { useDebouncedEffect } from '@/src/lib/useDebouncedEffect';
import type { IsoSnapshotPayload, Recebimento, RecebimentoItem } from 'iso-pro-shared';

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function parseQty(text: string): number | undefined {
  const t = text.trim().replace(',', '.');
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** Alinhado ao `sShort` do snapshot (iso-pro-shared). */
const MAX_OBSERVACAO_ITEM = 2048;

function mesmoRecebimentoConferencia(selecionado: Recebimento | null, linha: Recebimento): boolean {
  if (!selecionado) return false;
  return String(selecionado.id) === String(linha.id);
}

/**
 * Alinha o rascunho local com linhas atualizadas do servidor (snapshot ou detalhe RPC).
 * Casa por código (não por posição) para não colar a quantidade conferida no item errado
 * quando o servidor reordena/insere/remove linhas. Implementação testada em `conferenciaMerge.ts`.
 */
function mergeRecComPayload(draftRec: Recebimento, p: IsoSnapshotPayload): Recebimento {
  return mergeRecebimentoConferido(draftRec, p);
}

function upsertRecebimentoNoPayload(p: IsoSnapshotPayload, full: Recebimento): IsoSnapshotPayload {
  const list = [...(p.recebimentos ?? [])];
  const idx = list.findIndex((r) => String(r.id) === String(full.id));
  if (idx >= 0) list[idx] = full;
  else list.push(full);
  return { ...p, recebimentos: list };
}

const PAGE_SIZE_CONFERENCIA = 50;

function textoBuscaRecebimento(r: Recebimento): string {
  return String(r.nota ?? r.romaneio ?? r.fornecedorNome ?? '').trim();
}

export default function ConferenciaScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { mostrarTextosAjudaModulos } = useMobileUiPreferences();
  const styles = useMemo(() => buildConferenciaStyles(colors), [colors]);
  const shell = useMemo(() => buildMobileShellStyles(colors), [colors]);
  const configured = useMemo(() => hasSupabaseConfig(), []);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [nuvemAt, setNuvemAt] = useState<string | null>(null);

  const [payload, setPayload] = useState<IsoSnapshotPayload | null>(null);
  const [recsCloud, setRecsCloud] = useState<Recebimento[]>([]);
  const [recsTotal, setRecsTotal] = useState(0);
  const [recsEscalaOk, setRecsEscalaOk] = useState(false);
  const syncRecsTentadoRef = useRef(false);
  const [nfBusca, setNfBusca] = useState('');
  const [rec, setRec] = useState<Recebimento | null>(null);
  const [buscaMsg, setBuscaMsg] = useState<string | null>(null);
  const [candidatosRec, setCandidatosRec] = useState<Recebimento[] | null>(null);

  /** Texto do campo «Qtd conf.» por linha — evita mostrar 0 inicial (digitar 1 virava 10). */
  const [qtdConfTextoPorLinha, setQtdConfTextoPorLinha] = useState<Record<string, string>>({});
  /** Texto do campo «Local» por linha (sincronizado com `localizacao` no item). */
  const [localTextoPorLinha, setLocalTextoPorLinha] = useState<Record<string, string>>({});

  const [obsModalIndex, setObsModalIndex] = useState<number | null>(null);
  const [obsModalDraft, setObsModalDraft] = useState('');

  const listaRecebimentosAtiva = useMemo(() => {
    if (recsEscalaOk) return recsCloud;
    return (payload?.recebimentos as Recebimento[] | undefined) ?? [];
  }, [recsEscalaOk, recsCloud, payload?.recebimentos]);

  const recFiltradosRapido = useMemo(() => {
    if (!listaRecebimentosAtiva.length) return [];
    const t = nfBusca.trim();
    if (t.length < 1) return [];
    return filtrarRecebimentosPorTextoInteligente(listaRecebimentosAtiva, nfBusca, 50);
  }, [listaRecebimentosAtiva, nfBusca]);

  /** Com recebimento escolhido, a lista mostra só essa linha (igual Documentos / Consulta). */
  const recFiltradosParaExibir = useMemo(() => {
    if (!rec) return recFiltradosRapido;
    const hit = recFiltradosRapido.find((r) => mesmoRecebimentoConferencia(rec, r));
    return hit ? [hit] : [rec];
  }, [recFiltradosRapido, rec]);

  /**
   * Uma só lista: com recebimento já escolhido, só esse cartão (como Documentos).
   * Com vários candidatos da resolução, lista de escolha; senão filtro ao digitar.
   */
  const listaBuscaUnificada = useMemo(() => {
    if (rec) return recFiltradosParaExibir;
    if (candidatosRec && candidatosRec.length > 0) return candidatosRec;
    return recFiltradosParaExibir;
  }, [rec, candidatosRec, recFiltradosParaExibir]);

  const tituloListaBusca = useMemo(() => {
    if (candidatosRec && candidatosRec.length > 0) {
      return `Escolha o recebimento (${candidatosRec.length}${candidatosRec.length >= 50 ? '+' : ''}) — toque para abrir`;
    }
    if (rec) {
      return 'Recebimento em conferência — altere o texto acima para voltar a ver todos os resultados filtrados';
    }
    if (recsEscalaOk && nfBusca.trim()) {
      return `Resultados (${listaBuscaUnificada.length} de ${recsTotal}) — toque para abrir`;
    }
    return `Resultados ao digitar (${listaBuscaUnificada.length}${listaBuscaUnificada.length >= 50 ? '+' : ''}) — toque para abrir`;
  }, [candidatosRec, rec, listaBuscaUnificada.length, recsEscalaOk, nfBusca, recsTotal]);

  const recPendentesConferencia = useMemo(() => {
    const base = listarRecebimentosPendentesConferencia(listaRecebimentosAtiva);
    // Snapshot pode já estar conferido enquanto as tabelas de escala ainda não sincronizaram.
    const conferidosNoSnapshot = new Set(
      (payload?.recebimentos ?? [])
        .filter((r) => String(r.statusConferencia || '').toLowerCase() === 'conferido')
        .map((r) => String(r.id)),
    );
    if (conferidosNoSnapshot.size === 0) return base;
    return base.filter((r) => !conferidosNoSnapshot.has(String(r.id)));
  }, [listaRecebimentosAtiva, payload?.recebimentos]);

  const mostrarListaPendentes = Boolean(payload && !rec && nfBusca.trim().length === 0);

  const carregarPaginaRecebimentos = useCallback(async (busca: string) => {
    const q = busca.trim();
    try {
      let page = await listRecebimentosPageFromCloud({
        busca: q || undefined,
        offset: 0,
        limit: PAGE_SIZE_CONFERENCIA,
        modo: 'aguardando_conferencia',
      });

      if (!page.missing && page.total === 0 && !q && !syncRecsTentadoRef.current) {
        syncRecsTentadoRef.current = true;
        const sync = await syncRecebimentosFromSnapshotCloud();
        if (sync.ok) {
          page = await listRecebimentosPageFromCloud({
            busca: q || undefined,
            offset: 0,
            limit: PAGE_SIZE_CONFERENCIA,
            modo: 'aguardando_conferencia',
          });
        }
      }

      if (page.missing) {
        setRecsEscalaOk(false);
        return false;
      }
      setRecsEscalaOk(true);
      const next = page.recebimentos.map(wireRecebimentoListaEscala);
      // Preserva a identidade do array quando nada mudou — sem isto, cada recarga
      // dispara os efeitos que dependem da lista e a tela entra em loop de refresh.
      setRecsCloud((prev) => {
        if (
          prev.length === next.length &&
          prev.every((r, i) => {
            const n = next[i];
            return (
              !!n &&
              String(r.id) === String(n.id) &&
              String(r.statusConferencia ?? '') === String(n.statusConferencia ?? '') &&
              String(r.dataConferencia ?? '') === String(n.dataConferencia ?? '')
            );
          })
        ) {
          return prev;
        }
        return next;
      });
      setRecsTotal(page.total);
      if (page.error) setBuscaMsg(page.error);
      return true;
    } catch (e) {
      setRecsEscalaOk(false);
      setBuscaMsg(e instanceof Error ? e.message : 'Falha ao listar recebimentos.');
      return false;
    }
  }, []);

  const hidratarRecebimentoConferencia = useCallback(async (escolhido: Recebimento) => {
    try {
      const cloud = await readRecebimentoFromCloud(String(escolhido.id));
      if (cloud.recebimento) {
        const full = wireRecebimentoDetalheEscala(cloud.recebimento, String(escolhido.id));
        setPayload((prev) => (prev ? upsertRecebimentoNoPayload(prev, full) : { recebimentos: [full] }));
        return full;
      }
    } catch {
      /* mantém resumo */
    }
    return escolhido;
  }, []);

  /** `rec` via ref: mantém `carregarNuvem` estável — com `rec` nas deps, o `useFocusEffect`
   * re-executava a cada tecla digitada na conferência (recarga infinita, tela «a tremer»). */
  const recAtualRef = useRef<Recebimento | null>(null);
  recAtualRef.current = rec;

  const carregarNuvem = useCallback(async (opts?: { preservarSelecao?: boolean }) => {
    const recAtual = recAtualRef.current;
    const recIdPreservar = opts?.preservarSelecao && recAtual ? String(recAtual.id) : null;
    const recLocalPreservar = opts?.preservarSelecao && recAtual ? deepClone(recAtual) : null;

    if (!opts?.preservarSelecao) {
      setBuscaMsg(null);
      setRec(null);
      setCandidatosRec(null);
    }
    setLoadErr(null);
    setLoading(true);
    syncRecsTentadoRef.current = false;
    try {
      const { payload: p, updatedAt, error } = await fetchSnapshotSlices(SNAPSHOT_MOBILE_CONFERENCIA_READ_KEYS);
      if (error) {
        setLoadErr(error);
        setPayload(null);
        setRecsCloud([]);
        setRecsTotal(0);
        setRecsEscalaOk(false);
        return;
      }
      const cloned = p ? deepClone(p) : null;
      setPayload(cloned);
      setNuvemAt(updatedAt);

      const escalaOk = await carregarPaginaRecebimentos('');
      if (!escalaOk) {
        // Fallback legado: fatia completa de recebimentos
        const full = await fetchSnapshotSlices(['recebimentos', ...SNAPSHOT_MOBILE_CONFERENCIA_READ_KEYS]);
        if (!full.error && full.payload) {
          setPayload(deepClone(full.payload));
          setNuvemAt(full.updatedAt);
        }
      }

      if (recIdPreservar && recLocalPreservar) {
        const full = await hidratarRecebimentoConferencia(recLocalPreservar);
        setRec(mergeRecComPayload(recLocalPreservar, {
          recebimentos: [full],
        }));
      }
    } finally {
      setLoading(false);
    }
  }, [carregarPaginaRecebimentos, hidratarRecebimentoConferencia]);

  /** Sempre fixa o recebimento na lista (um cartão), como Documentos; avisos só no detalhe. */
  const abrirRecebimentoSeConferivel = useCallback((escolhido: Recebimento) => {
    setRec(deepClone(escolhido));
    setCandidatosRec(null);
    if (String(escolhido.statusConferencia || 'pendente') === 'conferido') {
      setBuscaMsg(
        'Esta NF já teve conferência finalizada. Para corrigir quantidades, use o I.S.O PRO no PC (destravar, se a política permitir).',
      );
      return;
    }
    if ((escolhido.modoRecebimento || 'direto') !== 'aguardando_conferencia') {
      setBuscaMsg('Este recebimento é modo “direto” (já no estoque). Conferência de contagem só em “aguardando conferência”.');
      return;
    }
    setBuscaMsg(null);
  }, []);

  const abrirRecebimentoDaLista = useCallback(
    (escolhido: Recebimento) => {
      const busca = textoBuscaRecebimento(escolhido);
      if (busca) setNfBusca(busca);
      void (async () => {
        const full = await hidratarRecebimentoConferencia(escolhido);
        abrirRecebimentoSeConferivel(full);
      })();
    },
    [abrirRecebimentoSeConferivel, hidratarRecebimentoConferencia],
  );

  const buscarRecebimento = useCallback(() => {
    setBuscaMsg(null);
    setCandidatosRec(null);
    const raw = nfBusca.trim();
    if (!raw) {
      setBuscaMsg('Informe NF, romaneio, fornecedor, código do material ou trecho para pesquisa.');
      return;
    }
    void (async () => {
      if (recsEscalaOk) {
        const page = await listRecebimentosPageFromCloud({
          busca: raw,
          offset: 0,
          limit: PAGE_SIZE_CONFERENCIA,
          modo: 'aguardando_conferencia',
        });
        const lista = page.missing
          ? listaRecebimentosAtiva
          : page.recebimentos.map(wireRecebimentoListaEscala);
        if (!page.missing) {
          setRecsCloud(lista);
          setRecsTotal(page.total);
          setRecsEscalaOk(true);
        }
        const res = resolverBuscaRecebimentoPorNota(lista, nfBusca);
        if (res.kind === 'none') {
          setRec(null);
          setBuscaMsg(`Nenhum recebimento combina com «${raw}».`);
          return;
        }
        if (res.kind === 'one') {
          const full = await hidratarRecebimentoConferencia(res.rec);
          abrirRecebimentoSeConferivel(full);
          return;
        }
        if (res.kind === 'sameNotaVarios') {
          setBuscaMsg(`${res.recs.length} recebimentos com a mesma NF — abrindo o primeiro.`);
          const full = await hidratarRecebimentoConferencia(res.recs[0]!);
          abrirRecebimentoSeConferivel(full);
          return;
        }
        setRec(null);
        setCandidatosRec(res.recs);
        setBuscaMsg(`${res.recs.length} recebimentos correspondem — toque numa linha para conferir.`);
        return;
      }

      if (!listaRecebimentosAtiva.length) {
        setBuscaMsg('Carregue os dados da nuvem primeiro.');
        return;
      }
      const lista = listaRecebimentosAtiva;
      const res = resolverBuscaRecebimentoPorNota(lista, nfBusca);
      if (res.kind === 'none') {
        setRec(null);
        const ex = exemplosNotasRecebimentos(lista, 6);
        setBuscaMsg(
          ex.length
            ? `Nenhum recebimento combina com «${raw}». Exemplos de NF: ${ex.join(' · ')}.`
            : 'Nenhum recebimento encontrado.',
        );
        return;
      }
      if (res.kind === 'one') {
        abrirRecebimentoSeConferivel(res.rec);
        return;
      }
      if (res.kind === 'sameNotaVarios') {
        setBuscaMsg(`${res.recs.length} recebimentos com a mesma NF — abrindo o primeiro.`);
        abrirRecebimentoSeConferivel(res.recs[0]!);
        return;
      }
      setRec(null);
      setCandidatosRec(res.recs);
      setBuscaMsg(`${res.recs.length} recebimentos correspondem — toque numa linha para conferir.`);
    })();
  }, [
    abrirRecebimentoSeConferivel,
    hidratarRecebimentoConferencia,
    listaRecebimentosAtiva,
    nfBusca,
    recsEscalaOk,
  ]);

  const tentarAutoBuscaConferencia = useCallback(() => {
    if (!listaRecebimentosAtiva.length) return;
    const lista = listaRecebimentosAtiva;
    const raw = nfBusca.trim();
    if (raw.length < 2) return;
    /** Não repetir a resolução automática por cima de uma seleção já feita (o debounce limpava `rec` em «escolher»). */
    if (rec) return;
    const res = resolverBuscaRecebimentoPorNota(lista, nfBusca);
    if (res.kind === 'one') {
      void hidratarRecebimentoConferencia(res.rec).then(abrirRecebimentoSeConferivel);
      return;
    }
    if (res.kind === 'sameNotaVarios') {
      void hidratarRecebimentoConferencia(res.recs[0]!).then(abrirRecebimentoSeConferivel);
      return;
    }
    if (res.kind === 'escolher') {
      setRec(null);
      setCandidatosRec(res.recs);
      setBuscaMsg(`${res.recs.length} correspondem — toque numa linha ou refine a pesquisa.`);
      return;
    }
    setRec(null);
    setCandidatosRec(null);
    setBuscaMsg(null);
  }, [abrirRecebimentoSeConferivel, hidratarRecebimentoConferencia, listaRecebimentosAtiva, nfBusca, rec]);

  /** Refs para o debounce abaixo: deps estáveis (só `nfBusca`/`recsEscalaOk`) para não
   * re-disparar a cada recarga da lista — era isso que deixava a tela «a tremer» sozinha. */
  const carregarPaginaRecebimentosRef = useRef(carregarPaginaRecebimentos);
  carregarPaginaRecebimentosRef.current = carregarPaginaRecebimentos;
  const tentarAutoBuscaConferenciaRef = useRef(tentarAutoBuscaConferencia);
  tentarAutoBuscaConferenciaRef.current = tentarAutoBuscaConferencia;
  const prevNfBuscaRef = useRef('');

  /** Pesquisa ao digitar: após pausa, com ≥2 caracteres. */
  useDebouncedEffect(
    () => {
      const raw = nfBusca.trim();
      const prev = prevNfBuscaRef.current;
      prevNfBuscaRef.current = raw;
      if (raw.length < 2) {
        // Só limpa/recarrega quando o utilizador apagou a pesquisa (não no arranque nem em loop).
        if (prev.length >= 2) {
          setCandidatosRec(null);
          setBuscaMsg(null);
          if (recsEscalaOk) void carregarPaginaRecebimentosRef.current('');
        }
        return;
      }
      if (recsEscalaOk) {
        void (async () => {
          await carregarPaginaRecebimentosRef.current(raw);
          tentarAutoBuscaConferenciaRef.current();
        })();
        return;
      }
      tentarAutoBuscaConferenciaRef.current();
    },
    [nfBusca, recsEscalaOk],
    420,
  );

  useFocusEffect(
    useCallback(() => {
      void carregarNuvem({ preservarSelecao: true });
    }, [carregarNuvem]),
  );

  const refreshAoVoltarAtivo = useCallback(
    () => carregarNuvem({ preservarSelecao: true }),
    [carregarNuvem],
  );
  useSnapshotRefreshOnAppActive(refreshAoVoltarAtivo);

  useEffect(() => {
    if (!rec?.itens) {
      setQtdConfTextoPorLinha({});
      setLocalTextoPorLinha({});
      return;
    }
    const rid = String(rec.id);
    const nextQtd: Record<string, string> = {};
    const nextLoc: Record<string, string> = {};
    rec.itens.forEach((it, i) => {
      const k = `${rid}-${i}`;
      const qc = it?.quantidadeConferida;
      if (qc === undefined || qc === null) {
        nextQtd[k] = '';
      } else if (typeof qc === 'string' && qc.trim() === '') {
        nextQtd[k] = '';
      } else {
        const n = typeof qc === 'number' ? qc : Number(String(qc).replace(',', '.'));
        if (Number.isFinite(n) && n === 0) {
          nextQtd[k] = '';
        } else {
          nextQtd[k] = String(qc);
        }
      }
      nextLoc[k] = locLinhaNormalizada(it as RecebimentoItem);
    });
    setQtdConfTextoPorLinha(nextQtd);
    setLocalTextoPorLinha(nextLoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao trocar o recebimento; `rec.itens` omitido para não sobrescrever edição ao atualizar snapshot
  }, [rec?.id]);

  const atualizarItem = useCallback((index: number, texto: string) => {
    setRec((prev) => {
      if (!prev?.itens) return prev;
      const itens = [...prev.itens];
      const row = { ...(itens[index] as RecebimentoItem) };
      const q = parseQty(texto);
      if (q === undefined) {
        delete row.quantidadeConferida;
      } else {
        row.quantidadeConferida = q;
      }
      itens[index] = row;
      return { ...prev, itens };
    });
  }, []);

  const atualizarLocalizacaoItem = useCallback((index: number, texto: string) => {
    const fatiado = limitarTextoLocalizacaoEmEdicao(texto);
    setRec((prev) => {
      if (!prev?.itens) return prev;
      const itens = [...prev.itens];
      const row = { ...(itens[index] as RecebimentoItem) };
      aplicarLocalizacaoEmEdicaoNoItem(row, fatiado);
      itens[index] = row;
      return { ...prev, itens };
    });
  }, []);

  const aplicarObservacaoItem = useCallback((index: number, texto: string) => {
    const fatiado = texto.slice(0, MAX_OBSERVACAO_ITEM);
    const t = fatiado.trim();
    setRec((prev) => {
      if (!prev?.itens) return prev;
      const itens = [...prev.itens];
      const row = { ...(itens[index] as RecebimentoItem) };
      if (t === '') {
        delete row.observacaoItem;
      } else {
        row.observacaoItem = t;
      }
      itens[index] = row;
      return { ...prev, itens };
    });
  }, []);

  const mergeRecNoPayload = useCallback(
    (atualizado: Recebimento): IsoSnapshotPayload | null => {
      if (!payload) return null;
      const next = deepClone(payload);
      const list = [...(next.recebimentos ?? [])];
      const idx = list.findIndex((r) => String(r.id) === String(atualizado.id));
      if (idx === -1) list.push(atualizado);
      else list[idx] = atualizado;
      next.recebimentos = list;
      next.dataAtualizacao = new Date().toISOString();
      return next;
    },
    [payload],
  );

  const persistirRascunhoDispositivo = useCallback(async () => {
    if (!rec || !recebimentoPermiteEditarConferencia(rec)) return;
    await salvarRascunhoConferencia({
      recebimentoId: String(rec.id),
      nfBusca,
      rec: deepClone(rec),
      qtdConfTextoPorLinha: { ...qtdConfTextoPorLinha },
      updatedAt: new Date().toISOString(),
    });
  }, [rec, nfBusca, qtdConfTextoPorLinha]);

  const guardarQuantidades = useCallback(
    async (opts?: { silentSuccess?: boolean }): Promise<boolean> => {
      if (!rec) return false;
      if (!recebimentoPermiteEditarConferencia(rec)) {
        appAlert('Indisponível', 'Só é possível guardar quantidades em recebimentos «aguardando conferência» ainda não finalizados.');
        return false;
      }
      if (!payload || !nuvemAt) {
        appAlert('Supabase', 'Carregue os dados da nuvem antes de guardar.');
        return false;
      }
      setSaving(true);
      try {
        // baseline null: força leitura fresca com WRITE_READ_KEYS (inclui recebimentos[]).
        // O ecrã só carrega materiais/colaboradores — usar esse payload como baseline
        // fazia o patch substituir a lista inteira por [1 NF] (incidente 2026-07-18).
        const result = await commitDefaultSnapshotWrite(
          createSnapshotPatchPrepareWithBaseline(
            null,
            SNAPSHOT_MOBILE_CONFERENCIA_WRITE_READ_KEYS,
            (fresh) => {
              const recGravar = deepClone(rec);
              normalizarLocalizacaoItensRecebimento(recGravar.itens);
              const next = deepClone(fresh);
              const list = [...(next.recebimentos ?? [])];
              const idx = list.findIndex((r) => String(r.id) === String(rec.id));
              if (idx === -1) list.push(recGravar);
              else list[idx] = recGravar;
              next.recebimentos = list;
              next.dataAtualizacao = new Date().toISOString();
              return {
                patch: {
                  recebimentos: [recGravar],
                  dataAtualizacao: next.dataAtualizacao,
                },
                mergeKeys: SNAPSHOT_MOBILE_CONFERENCIA_MERGE_KEYS,
                patchWithoutMerge: buildSnapshotPatchFromNext(
                  next,
                  SNAPSHOT_MOBILE_CONFERENCIA_PATCH_KEYS,
                ),
              };
            },
          ),
          { offlineTag: 'conferencia-guardar' },
        );
        if (result.error) {
          appAlert(result.conflict ? 'Conflito de dados' : 'Supabase', result.error);
          if (result.conflict) {
            void carregarNuvem();
          }
          return false;
        }
        setRec((prev) => {
          if (!prev) return prev;
          const synced = deepClone(prev);
          normalizarLocalizacaoItensRecebimento(synced.itens);
          return synced;
        });
        const nextPayload = mergeRecNoPayload(rec);
        if (nextPayload) {
          setPayload(nextPayload);
        }
        if (result.updatedAt) {
          setNuvemAt(result.updatedAt);
        }
        await limparRascunhoConferencia();
        if (!opts?.silentSuccess) {
          appAlert(
            result.queued ? 'Guardado (pendente)' : 'Guardado',
            result.queued
              ? 'Quantidades conferidas guardadas neste aparelho e enfileiradas para sincronizar com a nuvem.'
              : 'Quantidades conferidas gravadas na nuvem.',
          );
        }
        return true;
      } finally {
        setSaving(false);
      }
    },
    [carregarNuvem, mergeRecNoPayload, nuvemAt, payload, rec],
  );

  const finalizarConferencia = useCallback(() => {
    if (!rec) return;
    if (!recebimentoPermiteEditarConferencia(rec)) {
      appAlert(
        'Indisponível',
        'Só é possível finalizar conferência em recebimentos «aguardando conferência» ainda não conferidos.',
      );
      return;
    }

    const div = analisarDivergenciasAposFinalizar(rec);

    const executarGravacaoFinal = async () => {
      if (!payload || !nuvemAt) {
        appAlert('Supabase', 'Carregue os dados da nuvem antes de finalizar.');
        return;
      }
      const r = deepClone(rec);
      normalizarLocalizacaoItensRecebimento(r.itens);
      r.statusConferencia = 'conferido';
      // Campo `status` nas tabelas de escala (SoT da lista). Sem isto o sync
      // iso_pro_sync_recebimentos_from_snapshot mantém «aguardando_conferencia»
      // e a NF continua na lista de pendentes após «Atualizar dados da nuvem».
      (r as Recebimento & { status?: string }).status = 'conferido';
      /** Mantém o modo de negócio «aguardando conferência»; o estado final fica em `status`/`statusConferencia`. */
      r.modoRecebimento = 'aguardando_conferencia';
      r.dataConferencia = new Date().toISOString();
      (r.itens || []).forEach((it) => {
        if (!it) return;
        const q = it.quantidade;
        const qc = it.quantidadeConferida;
        const vazio =
          qc === undefined || qc === null || (typeof qc === 'string' && qc.trim() === '');
        if (vazio) {
          const n = typeof q === 'number' ? q : Number(String(q).replace(',', '.'));
          if (Number.isFinite(n)) it.quantidadeConferida = n;
        }
      });
      setSaving(true);
      try {
        const result = await commitDefaultSnapshotWrite(
          createSnapshotPatchPrepareWithBaseline(
            null,
            SNAPSHOT_MOBILE_CONFERENCIA_WRITE_READ_KEYS,
            (fresh) => {
              const recGravar = deepClone(r);
              const next = deepClone(fresh);
              const list = [...(next.recebimentos ?? [])];
              const idx = list.findIndex((x) => String(x.id) === String(r.id));
              if (idx === -1) list.push(recGravar);
              else list[idx] = recGravar;
              next.recebimentos = list;
              next.dataAtualizacao = new Date().toISOString();
              return {
                patch: {
                  recebimentos: [recGravar],
                  dataAtualizacao: next.dataAtualizacao,
                },
                mergeKeys: SNAPSHOT_MOBILE_CONFERENCIA_MERGE_KEYS,
                patchWithoutMerge: buildSnapshotPatchFromNext(
                  next,
                  SNAPSHOT_MOBILE_CONFERENCIA_PATCH_KEYS,
                ),
              };
            },
          ),
          { offlineTag: 'conferencia-finalizar' },
        );
        if (result.error) {
          appAlert(result.conflict ? 'Conflito de dados' : 'Supabase', result.error);
          if (result.conflict) {
            void carregarNuvem();
          }
          return;
        }
        const nextPayload = mergeRecNoPayload(r);
        if (nextPayload) {
          setPayload(nextPayload);
        }
        setRec(r);
        // Lista pendente vem das tabelas de escala — atualiza UI já e sincroniza snapshot→tabelas.
        setRecsCloud((prev) => prev.filter((x) => String(x.id) !== String(r.id)));
        setRecsTotal((t) => Math.max(0, t - 1));
        if (!result.queued) {
          void syncRecebimentosFromSnapshotCloud().then((sync) => {
            if (sync.ok) {
              void carregarPaginaRecebimentos(nfBusca);
            }
          });
        }
        if (result.updatedAt) {
          setNuvemAt(result.updatedAt);
        }
        void limparRascunhoConferencia();
        if (result.queued) {
          appAlert(
            'Finalizado (pendente)',
            'Conferência guardada neste aparelho e enfileirada para sincronizar com a nuvem.',
          );
        } else if (div.tem) {
          appAlert(
            'Conferência finalizada — lembrete',
            'Houve divergências (itens não recebidos ou parciais). No I.S.O PRO desktop, abra o recebimento: as linhas com diferença aparecem em destaque vermelho. Registe o motivo nas observações, se for política da obra.',
          );
        } else {
          appAlert('Concluído', 'Conferência finalizada. O estoque no sistema passa a considerar este recebimento.');
        }
      } finally {
        setSaving(false);
      }
    };

    const abrirConfirmacaoStock = () => {
      appAlert(
        'Finalizar conferência',
        'As quantidades conferidas passam a valer para o estoque (campo vazio na qtd. conferida = igual à qtd da NF). Continuar?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Finalizar', onPress: () => void executarGravacaoFinal() },
        ],
      );
    };

    if (div.tem) {
      appAlert(
        'Divergências na conferência',
        `${mensagemResumoDivergencias(div)}\n\nDeseja continuar? Pode rever os itens em vermelho antes de finalizar.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Continuar', onPress: abrirConfirmacaoStock },
        ],
      );
    } else {
      abrirConfirmacaoStock();
    }
  }, [carregarNuvem, carregarPaginaRecebimentos, mergeRecNoPayload, nfBusca, nuvemAt, payload, rec]);

  const podeEditarConferenciaRec = useMemo(() => recebimentoPermiteEditarConferencia(rec), [rec]);

  /** Local definido no PC / último guardado na nuvem (referência «Previsto» na conferência). */
  const localPrevistoPorLinha = useMemo(() => {
    if (!rec?.id || !payload?.recebimentos?.length) return {};
    const server = payload.recebimentos.find((r) => String(r.id) === String(rec.id));
    const prev: Record<string, string> = {};
    const rid = String(rec.id);
    (server?.itens || []).forEach((it, i) => {
      const loc = locLinhaNormalizada(it as RecebimentoItem);
      if (loc) prev[`${rid}-${i}`] = loc;
    });
    return prev;
  }, [rec?.id, payload]);

  /** Rascunho local no telemóvel (continuar depois) — não substitui «Guardar na nuvem». */
  useDebouncedEffect(
    () => {
      if (!rec || !recebimentoPermiteEditarConferencia(rec)) return;
      void salvarRascunhoConferencia({
        recebimentoId: String(rec.id),
        nfBusca,
        rec: deepClone(rec),
        qtdConfTextoPorLinha: { ...qtdConfTextoPorLinha },
        updatedAt: new Date().toISOString(),
      });
    },
    [rec, nfBusca, qtdConfTextoPorLinha, localTextoPorLinha],
    750,
  );

  const rascunhoVerificadoParaSnapshotRef = useRef<string | null>(null);
  useEffect(() => {
    if (!payload || !nuvemAt) return;
    if (rascunhoVerificadoParaSnapshotRef.current === nuvemAt) return;
    rascunhoVerificadoParaSnapshotRef.current = nuvemAt;
    void (async () => {
      const draft = await lerRascunhoConferencia();
      if (!draft) return;
      const inLista = listaRecebimentosAtiva.some((r) => String(r.id) === draft.recebimentoId);
      const inSparse = payload.recebimentos?.some((r) => String(r.id) === draft.recebimentoId);
      if (!inLista && !inSparse) {
        const cloud = await readRecebimentoFromCloud(draft.recebimentoId);
        if (!cloud.recebimento) {
          await limparRascunhoConferencia();
          return;
        }
      }
      appAlert(
        'Rascunho de conferência',
        `Encontrámos quantidades guardadas neste telemóvel para um recebimento em conferência (${draft.rec.nota ?? draft.rec.romaneio ?? '—'}). Deseja continuar de onde parou?`,
        [
          {
            text: 'Ignorar rascunho',
            style: 'destructive',
            onPress: () => void limparRascunhoConferencia(),
          },
          {
            text: 'Restaurar',
            onPress: () => {
              void (async () => {
                const full = await hidratarRecebimentoConferencia(draft.rec);
                const merged = mergeRecComPayload(draft.rec, { recebimentos: [full] });
                setNfBusca(draft.nfBusca);
                setRec(merged);
                setQtdConfTextoPorLinha(draft.qtdConfTextoPorLinha);
                setBuscaMsg(null);
                setCandidatosRec(null);
              })();
            },
          },
        ],
      );
    })();
  }, [payload, nuvemAt, listaRecebimentosAtiva, hidratarRecebimentoConferencia]);

  useEffect(() => {
    registerConferenciaSessaoGate({
      temAlteracoesNaoGuardadasNaNuvem: () => conferenciaLocalDifereDoSnapshot(rec, payload),
      guardarNaNuvem: () => guardarQuantidades({ silentSuccess: true }),
      persistirRascunhoDispositivo,
    });
    return () => registerConferenciaSessaoGate(null);
  }, [rec, payload, guardarQuantidades, persistirRascunhoDispositivo]);

  useFocusEffect(
    useCallback(() => {
      const tabNav = navigation.getParent();
      const onBack = () => {
        if (!conferenciaLocalDifereDoSnapshot(rec, payload)) return false;
        appAlert(
          'Conferência incompleta',
          'Há alterações nas quantidades que ainda não foram guardadas na nuvem com «Guardar quantidades conferidas». Um rascunho é guardado neste telemóvel automaticamente; pode continuar depois.\n\nO que deseja fazer?',
          [
            { text: 'Continuar a conferir', style: 'cancel' },
            {
              text: 'Guardar na nuvem e sair',
              onPress: () => {
                void (async () => {
                  const ok = await guardarQuantidades({ silentSuccess: true });
                  if (ok) tabNav?.navigate('index' as never);
                })();
              },
            },
            {
              text: 'Sair sem gravar na nuvem',
              style: 'destructive',
              onPress: () => {
                void (async () => {
                  await persistirRascunhoDispositivo();
                  tabNav?.navigate('index' as never);
                })();
              },
            },
          ],
        );
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation, rec, payload, guardarQuantidades, persistirRascunhoDispositivo]),
  );

  if (!configured) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Conferência</Text>
        <Text style={styles.hint}>
          Cria um ficheiro `.env` na raiz do projeto com EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY (iguais ao I.S.O PRO no
          navegador). Reinicia o Expo (`npx expo start`) depois de alterar o `.env`.
        </Text>
      </View>
    );
  }

  const obsModalCodigo =
    rec?.itens && obsModalIndex !== null ? String(rec.itens[obsModalIndex]?.codigo ?? '—') : '—';

  return (
    <>
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.container, shell.screenPad]} keyboardShouldPersistTaps="handled">
      <ModuleScreenHeader
        kicker="Recebimento"
        title="Conferência de materiais"
        helpText="Ao abrir, carrega a nuvem e mostra as NFs pendentes de conferência. Toque numa linha para começar, ou filtre pelo campo abaixo. Guarde na nuvem antes de finalizar."
        showHelp={mostrarTextosAjudaModulos}
      />

      <CloudSyncStrip configured={configured} error={loadErr} loading={loading && !payload} updatedAt={nuvemAt} />

      {payload ? (
        <StatPillRow
          items={[
            { label: 'Pendentes', value: recPendentesConferencia.length },
            {
              label: 'Recebimentos',
              value: recsEscalaOk ? recsTotal : (payload.recebimentos?.length ?? 0),
            },
            { label: 'Materiais', value: payload.materiais?.length ?? 0 },
          ]}
        />
      ) : null}

      <PrimaryActionButton
        disabled={loading || saving}
        label="Atualizar dados da nuvem"
        loading={loading}
        onPress={() => void carregarNuvem()}
      />

      {payload && !recsEscalaOk && (payload.recebimentos?.length ?? 0) === 0 ? (
        <Text style={styles.warn}>
          Este snapshot não traz recebimentos. No desktop, confirme que os recebimentos estão gravados na nuvem e o mesmo Supabase no `.env`.
        </Text>
      ) : null}
      {payload && recsEscalaOk && recsTotal === 0 ? (
        <Text style={styles.warn}>
          Não há recebimentos «aguardando conferência» nas tabelas de escala. No PC, sincronize recebimentos (Configurações → Obra) se a lista estiver vazia.
        </Text>
      ) : null}

      {mostrarListaPendentes ? (
        <View style={{ marginBottom: 16 }}>
          <Text style={[styles.label, { marginTop: 0 }]}>
            Aguardando conferência ({recPendentesConferencia.length})
          </Text>
          {mostrarTextosAjudaModulos ? (
            <Text style={[styles.hint, { marginBottom: 10 }]}>
              Toque numa NF para abrir a contagem. «Em correção» = já começou no telemóvel ou PC e ainda não foi finalizada.
            </Text>
          ) : null}
          {recPendentesConferencia.length === 0 ? (
            <EmptyStatePanel
              icon="check-decagram-outline"
              message="Não há recebimentos «aguardando conferência» por conferir."
              title="Nenhuma NF pendente"
            />
          ) : (
            <FlatList
              data={recPendentesConferencia}
              initialNumToRender={12}
              keyExtractor={(r) => `rec-pendente-${String(r.id)}`}
              keyboardShouldPersistTaps="handled"
              maxToRenderPerBatch={16}
              nestedScrollEnabled
              removeClippedSubviews
              renderItem={({ item: r }) => (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => abrirRecebimentoDaLista(r)}
                  style={styles.docLinha}
                >
                  <Text style={styles.docLinhaTit}>{rotuloNotaRomaneioRecebimento(r)}</Text>
                  <Text numberOfLines={2} style={styles.docLinhaSub}>
                    {r.fornecedorNome ?? '—'}
                  </Text>
                  <Text style={styles.docLinhaMeta}>
                    {linhaEstadoConferenciaMobile(r)}
                    {String(r.data ?? '').trim() ? ` · ${String(r.data ?? '').slice(0, 10)}` : ''}
                    {r.itens?.length ? ` · ${r.itens.length} item(ns)` : ''}
                  </Text>
                </Pressable>
              )}
              style={{ maxHeight: 360 }}
              windowSize={5}
            />
          )}
        </View>
      ) : null}

      <Text style={styles.label}>Filtrar NF, romaneio, fornecedor ou código</Text>
      {mostrarTextosAjudaModulos ? (
        <Text style={[styles.hint, { marginBottom: 8 }]}>
          Opcional: filtre a lista enquanto digita. Com ≥2 caracteres, após uma pausa tenta abrir sozinho se houver um único resultado claro.
        </Text>
      ) : null}
      <TextInput
        style={styles.input}
        placeholder="Ex.: NF, romaneio, fornecedor ou código do item"
        placeholderTextColor={colors.placeholder}
        value={nfBusca}
        onChangeText={(t) => {
          setNfBusca(t);
          setRec(null);
          setCandidatosRec(null);
          setBuscaMsg(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {payload &&
      (recsEscalaOk ? recsCloud.length > 0 || nfBusca.trim().length > 0 : (payload.recebimentos?.length ?? 0) > 0) &&
      nfBusca.trim().length > 0 ? (
        <View style={{ marginBottom: 12 }}>
          <Text style={[styles.hint, { fontWeight: '700', marginBottom: 8, fontSize: 13 }]}>{tituloListaBusca}</Text>
          {listaBuscaUnificada.length === 0 ? (
            <Text style={styles.warn}>
              Nenhum recebimento combina com «{nfBusca.trim()}». Tente outro trecho.
            </Text>
          ) : (
            <FlatList
              style={{ maxHeight: 280 }}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              data={listaBuscaUnificada}
              keyExtractor={(r) => `rec-busca-${String(r.id)}`}
              initialNumToRender={14}
              maxToRenderPerBatch={16}
              windowSize={5}
              removeClippedSubviews
              renderItem={({ item: r }) => {
                const sel = rec && mesmoRecebimentoConferencia(rec, r);
                return (
                  <Pressable
                    style={[styles.docLinha, sel && styles.docLinhaSelected]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: !!sel }}
                    onPress={() => abrirRecebimentoDaLista(r)}
                  >
                    <Text style={[styles.docLinhaTit, sel && styles.docLinhaTitSelected]}>
                      {rotuloNotaRomaneioRecebimento(r)}
                    </Text>
                    <Text style={[styles.docLinhaSub, sel && styles.docLinhaSubSelected]} numberOfLines={2}>
                      {r.fornecedorNome ?? ''}
                    </Text>
                    <Text style={[styles.docLinhaMeta, sel && styles.docLinhaMetaSelected]}>
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

      <Pressable style={[styles.btnSecondary, (!payload || loading) && styles.btnDisabled]} onPress={buscarRecebimento} disabled={!payload || loading}>
        <Text style={styles.btnTextSecondary}>Buscar recebimento</Text>
      </Pressable>
      {buscaMsg ? <Text style={styles.warn}>{buscaMsg}</Text> : null}

      {rec ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Fornecedor: {rec.fornecedorNome ?? '—'}</Text>
          <Text style={styles.cardLine}>{rotuloNotaRomaneioRecebimento(rec)}</Text>
          <Text style={styles.cardLine}>{linhaEstadoConferenciaMobile(rec)}</Text>

          <Text style={styles.subTitle}>Itens</Text>
          {mostrarTextosAjudaModulos ? (
            <Text style={[styles.hint, { marginTop: -6, marginBottom: 8, fontSize: 12 }]}>
              {podeEditarConferenciaRec ? (
                <>
                  Código a vermelho = quantidade conferida abaixo da NF (parcial ou zero). Campo vazio em «Qtd conf.» será tratado como igual à NF ao
                  finalizar. Confirme ou corrija o local abaixo da quantidade (veio do PC ou «Previsto»). Toque em «⋯» para observação por item.
                </>
              ) : (
                <>
                  Visualização: este recebimento não permite conferir no telemóvel (direto ou já conferido). Toque em «⋯» para ler observações por
                  linha. Altere o texto da pesquisa acima para escolher outra NF.
                </>
              )}
            </Text>
          ) : null}
          {(rec.itens || []).map((it, i) => {
            const divLinha = podeEditarConferenciaRec && linhaComDivergenciaVisual(it as RecebimentoItem);
            const linhaKey = `${String(rec.id)}-${i}`;
            const obsLinha = String((it as RecebimentoItem).observacaoItem ?? '').trim();
            const localPrevisto = localPrevistoPorLinha[linhaKey] ?? '';
            const localAtual = localTextoPorLinha[linhaKey] ?? '';
            const localAlterado = Boolean(localPrevisto && normalizarTextoLocalizacaoItem(localAtual) !== localPrevisto);
            return (
            <View key={i} style={[styles.itemRow, divLinha && styles.itemRowDivergencia]}>
              <View style={{ flex: 1 }}>
                <View style={styles.itemHeaderRow}>
                  <View style={styles.itemMeta}>
                    <Text style={[styles.codigo, divLinha && styles.codigoDivergencia]}>{it.codigo ?? '—'}</Text>
                  </View>
                  <Pressable
                    accessibilityLabel="Observação deste item"
                    hitSlop={10}
                    style={styles.btnObsItem}
                    onPress={() => {
                      setObsModalIndex(i);
                      setObsModalDraft(String((it as RecebimentoItem).observacaoItem ?? '').slice(0, MAX_OBSERVACAO_ITEM));
                    }}
                  >
                    <Text style={styles.btnObsItemDots}>⋯</Text>
                  </Pressable>
                </View>
                <Text style={styles.desc} numberOfLines={2}>
                  {String(it.descricao ?? '')}
                </Text>
                <Text style={styles.qtdNf}>
                  Qtd NF: {String(it.quantidade ?? '—')} {it.unidade ? ` ${it.unidade}` : ''}
                </Text>
                {obsLinha ? (
                  <Text style={styles.obsItemPreview} numberOfLines={2}>
                    Obs.: {obsLinha}
                  </Text>
                ) : null}
              </View>
              <View style={styles.itemColDireita}>
                <Text style={styles.labelCampoLinha}>Qtd conf.</Text>
                <TextInput
                  style={[styles.inputQtd, !podeEditarConferenciaRec && { opacity: 0.65 }]}
                  placeholder="—"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="decimal-pad"
                  editable={podeEditarConferenciaRec}
                  value={qtdConfTextoPorLinha[linhaKey] ?? ''}
                  onChangeText={(t) => {
                    if (!podeEditarConferenciaRec) return;
                    setQtdConfTextoPorLinha((prev) => ({ ...prev, [linhaKey]: t }));
                    atualizarItem(i, t);
                  }}
                />
                <Text style={styles.labelCampoLinha}>Local</Text>
                {localPrevisto ? (
                  <Text style={styles.localPrevisto} numberOfLines={1}>
                    Prev.: {localPrevisto}
                  </Text>
                ) : null}
                <TextInput
                  style={[
                    styles.inputLocal,
                    localAlterado && styles.inputLocalAlterada,
                    !podeEditarConferenciaRec && { opacity: 0.65 },
                  ]}
                  placeholder={localPrevisto ? 'Confirmar local' : 'Ex.: A-12'}
                  placeholderTextColor={colors.placeholder}
                  editable={podeEditarConferenciaRec}
                  maxLength={MAX_LOCALIZACAO_ITEM}
                  value={localAtual}
                  onChangeText={(t) => {
                    if (!podeEditarConferenciaRec) return;
                    const next = limitarTextoLocalizacaoEmEdicao(t);
                    setLocalTextoPorLinha((prev) => ({ ...prev, [linhaKey]: next }));
                    atualizarLocalizacaoItem(i, next);
                  }}
                />
                {podeEditarConferenciaRec && localPrevisto && localAtual.trim() !== localPrevisto ? (
                  <Pressable
                    accessibilityLabel="Usar local previsto do recebimento"
                    style={styles.btnUsarLocalPrev}
                    onPress={() => {
                      setLocalTextoPorLinha((prev) => ({ ...prev, [linhaKey]: localPrevisto }));
                      atualizarLocalizacaoItem(i, localPrevisto);
                    }}
                  >
                    <Text style={styles.btnUsarLocalPrevText}>Usar previsto</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
            );
          })}

          <Pressable
            style={[styles.btn, (saving || !podeEditarConferenciaRec) && styles.btnDisabled]}
            onPress={() => void guardarQuantidades()}
            disabled={saving || !podeEditarConferenciaRec}
          >
            <Text style={styles.btnTextPrimary}>Guardar quantidades conferidas</Text>
          </Pressable>

          <Pressable
            style={[styles.btnSuccess, (saving || !podeEditarConferenciaRec) && styles.btnDisabled]}
            onPress={finalizarConferencia}
            disabled={saving || !podeEditarConferenciaRec}
          >
            <Text style={styles.btnTextPrimary}>Finalizar conferência (entra no estoque)</Text>
          </Pressable>
        </View>
      ) : null}

      {saving ? <ActivityIndicator style={{ marginTop: 16 }} color={colors.accent} /> : null}
    </ScrollView>

    <Modal
      visible={obsModalIndex !== null}
      transparent
      animationType="fade"
      onRequestClose={() => {
        setObsModalIndex(null);
        setObsModalDraft('');
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            setObsModalIndex(null);
            setObsModalDraft('');
          }}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Observação do item</Text>
            <Text style={styles.modalSubtitle} numberOfLines={2}>
              {obsModalCodigo}
            </Text>
            <TextInput
              style={styles.modalInputObs}
              placeholder="Ex.: faltam unidades face à NF, embalagem danificada, lote diferente…"
              placeholderTextColor={colors.placeholder}
              multiline
              editable={podeEditarConferenciaRec}
              value={obsModalDraft}
              maxLength={MAX_OBSERVACAO_ITEM}
              onChangeText={(t) => setObsModalDraft(t.slice(0, MAX_OBSERVACAO_ITEM))}
            />
            <Text style={[styles.meta, { marginTop: 8 }]}>
              {obsModalDraft.length}/{MAX_OBSERVACAO_ITEM}
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalBtnGhost}
                onPress={() => {
                  setObsModalIndex(null);
                  setObsModalDraft('');
                }}
              >
                <Text style={styles.modalBtnGhostText}>{podeEditarConferenciaRec ? 'Cancelar' : 'Fechar'}</Text>
              </Pressable>
              {podeEditarConferenciaRec && obsModalIndex !== null ? (
                <Pressable
                  style={styles.modalBtnPrimary}
                  onPress={() => {
                    aplicarObservacaoItem(obsModalIndex, obsModalDraft);
                    setObsModalIndex(null);
                    setObsModalDraft('');
                  }}
                >
                  <Text style={styles.modalBtnPrimaryText}>Guardar</Text>
                </Pressable>
              ) : null}
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
    </>
  );
}

