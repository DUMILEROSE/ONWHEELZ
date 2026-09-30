import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEY_ENV = "PAYPAL_RECIPIENT_ENCRYPTION_KEY";

function getEncryptionKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const encoded = env[KEY_ENV];
  if (!encoded) throw new Error("PayPal recipient encryption is not configured");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error(`${KEY_ENV} must be a base64-encoded 32-byte key`);
  }
  return key;
}

/** Persist recipient details as versioned AES-256-GCM ciphertext; never store plaintext. */
export function encryptPayPalRecipientEmail(
  email: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized || normalized.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Enter a valid PayPal email address");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(env), iv);
  const ciphertext = Buffer.concat([
    cipher.update(normalized, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptPayPalRecipientEmail(
  value: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const [version, ivPart, tagPart, ciphertextPart, extra] = value.split(".");
  if (version !== "v1" || !ivPart || !tagPart || !ciphertextPart || extra) {
    throw new Error("Stored PayPal recipient data has an unsupported format");
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getEncryptionKey(env),
      Buffer.from(ivPart, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Stored PayPal recipient data could not be decrypted");
  }
}
