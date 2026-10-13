export type NfcTagInfo = {
  isWritable?: boolean;
};

export type NdefStatusInfo = {
  status: 'read-write' | 'read-only' | 'unsupported';
  capacity: number;
};

export interface NfcService {
  start(): Promise<void>;
  isNdefSupported(): Promise<boolean>;
  requestNdefTag(alertMessage: string): Promise<NfcTagInfo | null>;
  getNdefStatus(): Promise<NdefStatusInfo>;
  writeNdefMessage(message: number[]): Promise<void>;
  cancelTechnologyRequest(): Promise<void>;
  createNdefMessage(content: string): number[];
}
