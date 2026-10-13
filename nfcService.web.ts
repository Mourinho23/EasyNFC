import type { NfcService } from './nfcService.types';

export const nfcService: NfcService = {
  start: async () => undefined,
  isNdefSupported: async () => false,
  requestNdefTag: async () => {
    throw new Error('A gravação NFC só está disponível na app instalada num telemóvel compatível.');
  },
  getNdefStatus: async () => ({ status: 'unsupported', capacity: 0 }),
  writeNdefMessage: async () => {
    throw new Error('A gravação NFC só está disponível na app instalada num telemóvel compatível.');
  },
  cancelTechnologyRequest: async () => undefined,
  createNdefMessage: () => [],
};
