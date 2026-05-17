import { z } from 'zod';
/** Canal de registro no snapshot (`AtendimentoHistoricoLinha.origem`). */
export declare const origemRegistroIsoSchema: z.ZodEnum<{
    mobile: "mobile";
    windows: "windows";
}>;
export type OrigemRegistroIso = z.infer<typeof origemRegistroIsoSchema>;
//# sourceMappingURL=validators.d.ts.map