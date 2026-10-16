import NfcManager, { Ndef, NdefStatus, NfcTech } from 'react-native-nfc-manager';
import { getRandomBytesAsync } from 'expo-crypto';
import type {
  NfcService,
  PasswordProtectionSupport,
  PasswordProtectionTag,
} from './nfcService.types';

const TAG_CONFIG_PAGES: Record<PasswordProtectionTag, number> = {
  NTAG213: 0x29,
  NTAG215: 0x83,
  NTAG216: 0xe3,
};

const TAG_VERSION_STORAGE: Record<number, PasswordProtectionTag> = {
  0x0f: 'NTAG213',
  0x11: 'NTAG215',
  0x13: 'NTAG216',
};

function parsePassword(password: string): number[] {
  if (!/^[\da-fA-F]{8}$/.test(password)) {
    throw new Error('A palavra-passe tem de ter exatamente 8 dígitos hexadecimais.');
  }

  return [0, 2, 4, 6].map((index) => Number.parseInt(password.slice(index, index + 2), 16));
}

function normalizeTagId(id: string): string {
  return id.replace(/[^0-9a-f]/gi, '').toLowerCase();
}

async function withNfcA<T>(alertMessage: string, operation: () => Promise<T>): Promise<T> {
  let requestAttempted = false;
  let operationError: unknown;
  let result: { value: T } | undefined;

  try {
    requestAttempted = true;
    await NfcManager.requestTechnology(NfcTech.NfcA, { alertMessage });
    result = { value: await operation() };
  } catch (error) {
    operationError = error;
  } finally {
    if (requestAttempted) {
      try {
        await NfcManager.cancelTechnologyRequest();
      } catch (error) {
        if (operationError === undefined) {
          operationError = error;
        }
      }
    }
  }

  if (operationError !== undefined) {
    throw operationError;
  }
  if (result === undefined) {
    throw new Error('Não foi possível concluir a operação NFC.');
  }

  return result.value;
}

async function getPasswordProtectedTagInfo(): Promise<{
  model: PasswordProtectionTag;
  configPage: number;
  config: number[];
}> {
  const version = await NfcManager.nfcAHandler.transceive([0x60]);
  const model =
    version.length === 8 &&
    version[0] === 0x00 &&
    version[1] === 0x04 &&
    version[2] === 0x04 &&
    version[3] === 0x02 &&
    version[4] === 0x01 &&
    version[5] === 0x00 &&
    version[7] === 0x03
      ? TAG_VERSION_STORAGE[version[6]]
      : undefined;

  if (!model) {
    throw new Error('A proteção por palavra-passe só é suportada em etiquetas NXP NTAG213, NTAG215 ou NTAG216.');
  }

  const configPage = TAG_CONFIG_PAGES[model];
  const config = await NfcManager.nfcAHandler.transceive([0x30, configPage]);
  if (config.length < 8) {
    throw new Error('Não foi possível ler a configuração de segurança desta etiqueta.');
  }
  if (config[3] !== 0xff || (config[4] & 0x4f) !== 0) {
    throw new Error('Esta etiqueta já tem proteção ativa ou uma configuração de segurança personalizada. Não será alterada.');
  }

  return { model, configPage, config };
}

async function checkPasswordProtectionSupport(): Promise<PasswordProtectionSupport> {
  try {
    return await withNfcA('Aproxima a etiqueta para verificar o modelo e a proteção.', async () => {
      const tag = await NfcManager.getTag();
      const tagId = tag?.id ? normalizeTagId(tag.id) : '';
      if (!tagId) {
        throw new Error('Não foi possível identificar a etiqueta NFC com segurança.');
      }

      const { model } = await getPasswordProtectedTagInfo();
      return { supported: true, model, tagId };
    });
  } catch (error) {
    return {
      supported: false,
      reason: error instanceof Error ? error.message : 'Não foi possível verificar o tipo de etiqueta.',
    };
  }
}

async function enablePasswordProtection(password: string, expectedTagId: string): Promise<void> {
  const pwd = parsePassword(password);
  const pack = Array.from(await getRandomBytesAsync(2));

  await withNfcA('Aproxima a mesma etiqueta para ativar a proteção.', async () => {
    const tag = await NfcManager.getTag();
    if (!tag?.id || normalizeTagId(tag.id) !== expectedTagId) {
      throw new Error('A etiqueta mudou durante a operação. A proteção não foi aplicada a outra etiqueta.');
    }

    const { configPage, config } = await getPasswordProtectedTagInfo();
    const ack = async (page: number, data: number[]) => {
      const response = await NfcManager.nfcAHandler.transceive([0xa2, page, ...data]);
      if (response[0] !== 0x0a) {
        throw new Error('A etiqueta recusou a configuração da proteção por palavra-passe.');
      }
    };

    await ack(configPage + 2, pwd);
    await ack(configPage + 3, [...pack, 0x00, 0x00]);
    await ack(configPage + 1, [(config[4] & 0xf0) | 0x03, config[5], config[6], config[7]]);
    await ack(configPage, [config[0], config[1], config[2], 0x03]);

    const authentication = await NfcManager.nfcAHandler.transceive([0x1b, ...pwd]);
    if (authentication.length < 2 || authentication[0] !== pack[0] || authentication[1] !== pack[1]) {
      throw new Error('A etiqueta não confirmou a palavra-passe depois de ativar a proteção.');
    }

    const verifiedConfig = await NfcManager.nfcAHandler.transceive([0x30, configPage]);
    if (
      verifiedConfig.length < 8 ||
      verifiedConfig[3] !== 0x03 ||
      (verifiedConfig[4] & 0x0f) !== 0x03
    ) {
      throw new Error('A etiqueta não confirmou as definições de proteção contra escrita.');
    }
  });
}

export const nfcService: NfcService = {
  start: () => NfcManager.start(),
  isNdefSupported: () => NfcManager.isSupported(NfcTech.Ndef),
  requestNdefTag: async (alertMessage) => {
    await NfcManager.requestTechnology(NfcTech.Ndef, { alertMessage });
    const tag = await NfcManager.getTag();
    return tag
      ? {
          id: tag.id ? normalizeTagId(tag.id) : undefined,
          isWritable: tag.isWritable,
        }
      : null;
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
  checkPasswordProtectionSupport,
  enablePasswordProtection,
  writeNdefMessage: (message) => NfcManager.writeNdefMessage(message),
  cancelTechnologyRequest: () => NfcManager.cancelTechnologyRequest(),
  createNdefMessage: (content) => {
    const isWebUrl = /^https?:\/\/\S+$/i.test(content);
    const record = isWebUrl ? Ndef.uriRecord(content) : Ndef.textRecord(content, 'pt');
    return Ndef.encodeMessage([record]);
  },
};
