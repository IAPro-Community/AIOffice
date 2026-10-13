export interface CredentialRecord {
  readonly provider: string;
  readonly maskedValue: string;
  readonly updatedAt: string;
}

export interface ICredentialStore {
  set(provider: string, secret: string): Promise<void>;
  get(provider: string): Promise<string | null>;
  delete(provider: string): Promise<boolean>;
  list(): Promise<readonly CredentialRecord[]>;
}
