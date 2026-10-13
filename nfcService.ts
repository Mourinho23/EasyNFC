import NfcManager, { Ndef, NdefStatus, NfcTech } from 'react-native-nfc-manager';
import type { NfcService } from './nfcService.types';

export const nfcService: NfcService = {
  start: () => NfcManager.start(),
  isNdefSupported: () => NfcManager.isSupported(NfcTech.Ndef),
  requestNdefTag: async (alertMessage) => {
    await NfcManager.requestTechnology(NfcTech.Ndef, { alertMessage });
    return NfcManager.getTag();
  },
  getNdefStatus: async () => {
    const { status, capacity } = await NfcManager.ndefHandler.getNdefStatus();
    if (status === NdefStatus.ReadOnly) {
      return { status: 'read-only', capacity };
    }
    if (status === NdefStatus.NotSupported) {
      return { status: 'unsupported', capacity };
    }
    return { status: 'read-write', capacity };
  },
  writeNdefMessage: (message) => NfcManager.writeNdefMessage(message),
  cancelTechnologyRequest: () => NfcManager.cancelTechnologyRequest(),
  createNdefMessage: (content) => {
    const isWebUrl = /^https?:\/\/\S+$/i.test(content);
    const record = isWebUrl ? Ndef.uriRecord(content) : Ndef.textRecord(content, 'pt');
    return Ndef.encodeMessage([record]);
  },
};
