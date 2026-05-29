/** Indica se o valor armazenado já é hash bcrypt (migração a partir de texto plano). */
export declare function isPasswordHash(stored: string): boolean;
/** Gera hash bcrypt (cost 10) para persistência em `usuarios_sistema`. */
export declare function hashPassword(plain: string): Promise<string>;
export declare function hashPasswordSync(plain: string): string;
/**
 * Compara senha em texto plano com valor armazenado (hash bcrypt ou legado em texto plano).
 * Suporta migração gradual: login com texto plano continua válido até rehash.
 */
export declare function verifyPassword(plain: string, stored: string): Promise<boolean>;
/** Prepara senha para gravação: hash se ainda for texto plano. */
export declare function preparePasswordForStorage(plain: string | undefined): Promise<string | undefined>;
//# sourceMappingURL=passwordHash.d.ts.map