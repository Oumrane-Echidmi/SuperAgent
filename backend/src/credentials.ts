import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';

const base64 = z.string().regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
const contextSchema = z.strictObject({ tenantId: z.string().min(1).max(200), connectionId: z.string().min(1).max(200), provider: z.literal('google') });
const envelopeSchema = z.strictObject({ version: z.literal(1), keyId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  nonce: base64, tag: base64, ciphertext: base64.max(24000) });
type Context = z.infer<typeof contextSchema>;

/** Server-only encryption primitive. Authorization must precede vault access. */
export class CredentialVault {
  private readonly activeKeyId: string;
  private readonly keys = new Map<string, Buffer>();
  constructor(activeKeyId: string, keys: Record<string, string>) {
    for (const [id, value] of Object.entries(keys)) {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id) || !base64.safeParse(value).success || Buffer.from(value, 'base64').length !== 32) {
        throw new Error('Configure 32-byte base64 credential keys.');
      }
      this.keys.set(id, Buffer.from(value, 'base64'));
    }
    if (!this.keys.has(activeKeyId)) throw new Error('Configure an active credential key.');
    this.activeKeyId = activeKeyId;
  }
  private aad(context: Context, keyId: string) {
    const parsed = contextSchema.parse(context);
    return Buffer.from(JSON.stringify(['superagent-credential', 1, keyId, parsed.provider, parsed.tenantId, parsed.connectionId]));
  }
  seal(secret: string, context: Context) {
    if (typeof secret !== 'string' || Buffer.byteLength(secret) < 1 || Buffer.byteLength(secret) > 16000) throw new Error('Invalid credential.');
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.keys.get(this.activeKeyId)!, nonce);
    cipher.setAAD(this.aad(context, this.activeKeyId));
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return { version: 1 as const, keyId: this.activeKeyId, nonce: nonce.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
  }
  open(envelope: unknown, context: Context): string {
    try {
      const parsed = envelopeSchema.parse(envelope);
      const key = this.keys.get(parsed.keyId);
      const nonce = Buffer.from(parsed.nonce, 'base64'); const tag = Buffer.from(parsed.tag, 'base64');
      if (!key || nonce.length !== 12 || tag.length !== 16) throw new Error();
      const decipher = createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAAD(this.aad(context, parsed.keyId)); decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(Buffer.from(parsed.ciphertext, 'base64')), decipher.final()]).toString('utf8');
    } catch { throw new Error('Credential unavailable.'); }
  }
}
