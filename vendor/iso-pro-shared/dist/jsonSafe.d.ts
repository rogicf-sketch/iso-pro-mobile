/**
 * Remove chaves perigosas e limita profundidade (evita recursão infinita / objetos circulares problemáticos).
 * Não substitui validação de esquema — é defesa em profundidade antes do Zod.
 */
export declare function stripJsonPollution<T = unknown>(input: unknown): T;
//# sourceMappingURL=jsonSafe.d.ts.map