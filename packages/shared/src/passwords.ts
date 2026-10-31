export const MIN_PASSWORD_LENGTH = 12;
// Long enough for any passphrase; PBKDF2 hashes a long password once, so
// length costs nothing per iteration.
export const MAX_PASSWORD_LENGTH = 4096;
