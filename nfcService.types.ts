export type NfcTagInfo = {
  id?: string;
  isWritable?: boolean;
};

export type NdefStatusInfo = {
  status: 'read-write' | 'read-only' | 'unsupported';
  capacity: number;
};

export type PasswordProtectionTag = 'NTAG213' | 'NTAG215' | 'NTAG216';

export type PasswordProtectionSupport =
  | { supported: true; model: PasswordProtectionTag; tagId: string }
  | { supported: false; reason: string };

export interface NfcService {
  start(): Promise<void>;
  isNdefSupported(): Promise<boolean>;
  requestNdefTag(alertMessage: string): Promise<NfcTagInfo | null>;
  getNdefStatus(): Promise<NdefStatusInfo>;
  checkPasswordProtectionSupport(): Promise<PasswordProtectionSupport>;
  enablePasswordProtection(password: string, expectedTagId: string): Promise<void>;
  writeNdefMessage(message: number[]): Promise<void>;
  cancelTechnologyRequest(): Promise<void>;
  createNdefMessage(content: string): number[];
}
