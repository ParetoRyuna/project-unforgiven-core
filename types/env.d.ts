declare namespace NodeJS {
  interface ProcessEnv {
    /** JSON array of 64 bytes (Ed25519 secret key). Required for Oracle API. */
    ADMIN_SECRET_KEY?: string;
    /** Optional Base58 admin public key (for reference). */
    ADMIN_PUBLIC_KEY?: string;
  }
}
