import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// AES-256-GCM параметры
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // 96 бит — рекомендуемый размер IV для GCM
const TAG_LENGTH = 16;  // 128 бит — стандартный размер тега аутентификации

/**
 * Возвращает 32-байтный ключ из TOKEN_ENCRYPTION_KEY.
 * Ключ должен быть hex-строкой длиной 64 символа (32 байта).
 */
function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('TOKEN_ENCRYPTION_KEY не задан в переменных окружения');
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY должен быть hex-строкой из 64 символов (32 байта), получено: ${key.length} байт`
    );
  }
  return key;
}

/**
 * Шифрует строку с помощью AES-256-GCM.
 * Возвращает base64-строку формата: iv:tag:ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  // Формат: iv(hex):tag(hex):ciphertext(hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Дешифрует строку, зашифрованную функцией encrypt().
 * Принимает base64-строку формата: iv:tag:ciphertext
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(':');

  if (parts.length !== 3) {
    throw new Error('Неверный формат зашифрованной строки');
  }

  const [ivHex, tagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
