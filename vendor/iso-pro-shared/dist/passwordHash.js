import bcrypt from 'bcryptjs';
const BCRYPT_PREFIXES = ['$2a$', '$2b$', '$2y$'];
/** Indica se o valor armazenado já é hash bcrypt (migração a partir de texto plano). */
export function isPasswordHash(stored) {
    const s = String(stored ?? '').trim();
    return BCRYPT_PREFIXES.some((p) => s.startsWith(p));
}
/** Gera hash bcrypt (cost 10) para persistência em `usuarios_sistema`. */
export async function hashPassword(plain) {
    const trimmed = plain.trim();
    if (!trimmed) {
        throw new Error('Senha vazia.');
    }
    if (isPasswordHash(trimmed)) {
        return trimmed;
    }
    return bcrypt.hash(trimmed, 10);
}
export function hashPasswordSync(plain) {
    const trimmed = plain.trim();
    if (!trimmed) {
        throw new Error('Senha vazia.');
    }
    if (isPasswordHash(trimmed)) {
        return trimmed;
    }
    return bcrypt.hashSync(trimmed, 10);
}
/**
 * Compara senha em texto plano com valor armazenado (hash bcrypt ou legado em texto plano).
 * Suporta migração gradual: login com texto plano continua válido até rehash.
 */
export async function verifyPassword(plain, stored) {
    const p = plain.trim();
    const s = String(stored ?? '');
    if (!p || !s)
        return false;
    if (isPasswordHash(s)) {
        return bcrypt.compare(p, s);
    }
    return p === s;
}
/** Prepara senha para gravação: hash se ainda for texto plano. */
export async function preparePasswordForStorage(plain) {
    const trimmed = String(plain ?? '').trim();
    if (!trimmed)
        return undefined;
    return hashPassword(trimmed);
}
