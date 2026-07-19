import type { IsoSnapshotPayload } from './iso.js';
export declare function dataStampAtendimento(date?: Date): string;
/** Formato unico mobile + PC: ATD-YYYYMMDD-00001 (5 digitos). */
export declare function formatNumeroAtendimento(sequencia: number, date?: Date): string;
export declare function parseNumeroAtendimento(numero: string): {
    dateStamp: string;
    sequencia: number;
} | null;
/** Maior sequencia ja usada hoje (cfg + historico + lotes + atendimentos). */
export declare function maxSequenciaAtendimentoNoPayload(payload: IsoSnapshotPayload | null | undefined): number;
export declare function loteNumeroExisteNoPayload(payload: IsoSnapshotPayload, numero: string): boolean;
/**
 * Reserva protocolo inedito no payload (actualiza configuracoesSistema.sequenciaAtendimento).
 * Evita colisao quando cfg local ficou atras face ao historico na nuvem.
 */
export declare function reservarProximoNumeroAtendimento(payload: IsoSnapshotPayload): {
    numero: string;
    sequencia: number;
};
/** Chave de agrupamento historico: mesmo ATD + loteId distinto = sessoes separadas. */
export declare function chaveAgrupamentoHistoricoAtendimento(input: {
    loteNumero?: string | null;
    loteId?: string | number | null;
}): string;
//# sourceMappingURL=atendimentoNumero.d.ts.map