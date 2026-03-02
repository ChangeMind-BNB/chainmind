import crypto from 'crypto';

export function generateApiToken(): string {
  return crypto.randomBytes(32).toString('hex'); // 64 hex chars
}

export function generateDepositCode(): string {
  return crypto.randomBytes(8).toString('hex').toUpperCase(); // 16 hex chars
}
