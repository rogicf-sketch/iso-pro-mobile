import { z } from 'zod';
import type { IsoSnapshotPayload } from './iso.js';
/** Esquema permissivo (compatível com dados legados) mas com tipos e limites nas coleções principais. */
export declare const isoSnapshotPayloadSchema: z.ZodObject<{
    materiais: z.ZodPipe<z.ZodTransform<any[] | undefined, unknown>, z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        codigo: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        descricao: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        unidade: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
    }, z.core.$loose>>>>;
    fornecedores: z.ZodPipe<z.ZodTransform<any[] | undefined, unknown>, z.ZodOptional<z.ZodArray<z.ZodUnknown>>>;
    colaboradores: z.ZodPipe<z.ZodTransform<any[] | undefined, unknown>, z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>;
        nome: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        matricula: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        funcao: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        telefone: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
    }, z.core.$loose>>>>;
    recebimentos: z.ZodPipe<z.ZodTransform<any[] | undefined, unknown>, z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>;
        data: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        fornecedorId: z.ZodOptional<z.ZodNumber>;
        fornecedorNome: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        nota: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        romaneio: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        conferenteId: z.ZodOptional<z.ZodNumber>;
        conferenteNome: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        observacoes: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        itens: z.ZodPipe<z.ZodTransform<any[] | undefined, unknown>, z.ZodOptional<z.ZodArray<z.ZodObject<{
            codigo: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
            descricao: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
            quantidade: z.ZodOptional<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>;
            quantidadeConferida: z.ZodOptional<z.ZodUnion<readonly [z.ZodNumber, z.ZodString, z.ZodNull]>>;
            observacaoItem: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
            localizacao: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
            unidade: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
            disciplina: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        }, z.core.$loose>>>>;
        dataCriacao: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        modoRecebimento: z.ZodOptional<z.ZodEnum<{
            direto: "direto";
            aguardando_conferencia: "aguardando_conferencia";
        }>>;
        statusConferencia: z.ZodOptional<z.ZodUnion<readonly [z.ZodEnum<{
            pendente: "pendente";
            conferido: "conferido";
        }>, z.ZodNull]>>;
        dataConferencia: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNull]>>;
    }, z.core.$loose>>>>;
    rirRegistros: z.ZodPipe<z.ZodTransform<any[] | undefined, unknown>, z.ZodOptional<z.ZodArray<z.ZodUnknown>>>;
    rncRegistros: z.ZodPipe<z.ZodTransform<any[] | undefined, unknown>, z.ZodOptional<z.ZodArray<z.ZodUnknown>>>;
    documentos: z.ZodPipe<z.ZodTransform<any[] | undefined, unknown>, z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>;
        numero: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        revisao: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        data: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        descricao: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        responsavel: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        itens: z.ZodPipe<z.ZodTransform<any[] | undefined, unknown>, z.ZodOptional<z.ZodArray<z.ZodObject<{
            codigo: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
            descricao: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
            quantidade: z.ZodOptional<z.ZodNumber>;
            unidade: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
            quantidadeAtendida: z.ZodOptional<z.ZodNumber>;
        }, z.core.$loose>>>>;
    }, z.core.$loose>>>>;
    atendimentoHistorico: z.ZodPipe<z.ZodTransform<any[] | undefined, unknown>, z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        loteId: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
        loteNumero: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        data: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        documento: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        documentoId: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodNull]>>;
        documentoItemId: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodNull]>>;
        codigo: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        descricao: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        quantidade: z.ZodOptional<z.ZodNumber>;
        unidade: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        atendente: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        matricula: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        atendenteFuncao: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        recebedor: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        recebedorMatricula: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        recebedorFuncao: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        origem: z.ZodOptional<z.ZodEnum<{
            mobile: "mobile";
            windows: "windows";
        }>>;
    }, z.core.$loose>>>>;
    atendimentoLotes: z.ZodPipe<z.ZodTransform<any[] | undefined, unknown>, z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>;
        numero: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        data: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        tipo: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        documento: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        atendente: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        matricula: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        recebedor: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
    }, z.core.$loose>>>>;
    inventarios: z.ZodPipe<z.ZodTransform<any[] | undefined, unknown>, z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        codigo: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        descricao: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        responsavel: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        dataInventario: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        status: z.ZodOptional<z.ZodEnum<{
            aberto: "aberto";
            fechado: "fechado";
            cancelado: "cancelado";
        }>>;
        contagemMobileHabilitada: z.ZodOptional<z.ZodBoolean>;
        observacoes: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        itens: z.ZodPipe<z.ZodTransform<any[] | undefined, unknown>, z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
            codigoMaterial: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
            descricaoMaterial: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
            unidade: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
            saldoSistema: z.ZodOptional<z.ZodNumber>;
            quantidadeContada: z.ZodOptional<z.ZodNumber>;
            localizacaoContada: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
        }, z.core.$loose>>>>;
    }, z.core.$loose>>>>;
    etiquetas: z.ZodPipe<z.ZodTransform<any[] | undefined, unknown>, z.ZodOptional<z.ZodArray<z.ZodUnknown>>>;
    estoqueAjustes: z.ZodPipe<z.ZodTransform<any[] | undefined, unknown>, z.ZodOptional<z.ZodArray<z.ZodUnknown>>>;
    configuracoesSistema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    usuariosSistema: z.ZodOptional<z.ZodUnknown>;
    disciplinas: z.ZodPipe<z.ZodTransform<any[] | undefined, unknown>, z.ZodOptional<z.ZodArray<z.ZodString>>>;
    unidades: z.ZodPipe<z.ZodTransform<any[] | undefined, unknown>, z.ZodOptional<z.ZodArray<z.ZodString>>>;
    versao: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
    dataAtualizacao: z.ZodPipe<z.ZodTransform<{} | undefined, unknown>, z.ZodOptional<z.ZodString>>;
}, z.core.$loose>;
export type ParseIsoSnapshotPayloadResult = {
    ok: true;
    data: IsoSnapshotPayload;
} | {
    ok: false;
    error: string;
};
/**
 * Valida e normaliza o payload do `iso_pro_snapshot`.
 * 1) Remove poluição de protótipo comum
 * 2) Aplica Zod (campos desconhecidos no topo mantêm-se com `.passthrough()`)
 */
export declare function parseIsoSnapshotPayloadFromUnknown(raw: unknown): ParseIsoSnapshotPayloadResult;
//# sourceMappingURL=snapshotPayload.zod.d.ts.map