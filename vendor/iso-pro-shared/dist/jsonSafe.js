/** Chaves frequentemente usadas em ataques de poluição de protótipo via JSON.parse / objetos híbridos. */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_DEPTH = 48;
/**
 * Remove chaves perigosas e limita profundidade (evita recursão infinita / objetos circulares problemáticos).
 * Não substitui validação de esquema — é defesa em profundidade antes do Zod.
 */
export function stripJsonPollution(input) {
    const seen = new WeakSet();
    function walk(value, depth) {
        if (depth > MAX_DEPTH)
            return null;
        if (value === null || typeof value !== 'object')
            return value;
        if (seen.has(value))
            return null;
        seen.add(value);
        if (Array.isArray(value)) {
            return value.map((item) => walk(item, depth + 1));
        }
        const obj = value;
        const out = {};
        for (const key of Object.keys(obj)) {
            if (DANGEROUS_KEYS.has(key))
                continue;
            out[key] = walk(obj[key], depth + 1);
        }
        return out;
    }
    return walk(input, 0);
}
