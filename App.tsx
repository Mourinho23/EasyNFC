import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { getRandomBytesAsync } from 'expo-crypto';
import { StatusBar } from 'expo-status-bar';
import { nfcService } from './nfcService';

type NfcAvailability = 'checking' | 'ready' | 'unavailable' | 'error';
type WriteProtection = 'none' | 'password';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Ocorreu um erro inesperado. Tenta novamente.';
}

export default function App() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [nfcAvailability, setNfcAvailability] = useState<NfcAvailability>('checking');
  const [qrContent, setQrContent] = useState('');
  const [isWriting, setIsWriting] = useState(false);
  const [securityWarningVisible, setSecurityWarningVisible] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [passwordProtectionUnavailable, setPasswordProtectionUnavailable] = useState('');
  const [feedback, setFeedback] = useState('');
  const [writeSucceeded, setWriteSucceeded] = useState(false);
  const scannedRef = useRef(false);
  const writingRef = useRef(false);

  useEffect(() => {
    let active = true;

    async function checkNfcAvailability() {
      try {
        await nfcService.start();
        const supported = await nfcService.isNdefSupported();
        if (active) {
          setNfcAvailability(supported ? 'ready' : 'unavailable');
        }
      } catch (error) {
        if (active) {
          setNfcAvailability('error');
          setFeedback(getErrorMessage(error));
        }
      }
    }

    void checkNfcAvailability();
    return () => {
      active = false;
    };
  }, []);

  function handleBarcodeScanned({ data }: { data: string }) {
    if (scannedRef.current || !data.trim()) {
      return;
    }

    scannedRef.current = true;
    setQrContent(data);
    setFeedback('');
    setWriteSucceeded(false);
  }

  function resetScan() {
    scannedRef.current = false;
    setQrContent('');
    setFeedback('');
    setWriteSucceeded(false);
    setPasswordProtectionUnavailable('');
  }

  async function enableCamera() {
    try {
      if (cameraPermission?.canAskAgain) {
        await requestCameraPermission();
      } else {
        await Linking.openSettings();
      }
    } catch (error) {
      setFeedback(getErrorMessage(error));
    }
  }

  async function generatePassword() {
    try {
      const bytes = await getRandomBytesAsync(4);
      const generated = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
      setPassword(generated);
      setPasswordConfirmation(generated);
      setPasswordVisible(true);
      setFeedback('');
    } catch (error) {
      setFeedback(getErrorMessage(error));
    }
  }

  async function writeToNfcTag(protection: WriteProtection) {
    setSecurityWarningVisible(false);
    setPasswordProtectionUnavailable('');
    if (!qrContent || writingRef.current) {
      return;
    }
    if (protection === 'password') {
      if (!/^[\da-fA-F]{8}$/.test(password)) {
        setFeedback('A palavra-passe tem de ter exatamente 8 dígitos hexadecimais.');
        return;
      }
      if (password !== passwordConfirmation) {
        setFeedback('As palavras-passe não coincidem.');
        return;
      }
    }

    writingRef.current = true;
    setIsWriting(true);
    setFeedback('');
    setWriteSucceeded(false);

    let requestAttempted = false;
    let ndefWritten = false;
    let protectedTagId: string | undefined;
    let operationError: unknown;
    try {
      await nfcService.start();
      if (!(await nfcService.isNdefSupported())) {
        throw new Error('Este telemóvel não suporta NFC.');
      }

      if (protection === 'password') {
        const supportedTag = await nfcService.checkPasswordProtectionSupport();
        if (!supportedTag.supported) {
          setPasswordProtectionUnavailable(supportedTag.reason);
          return;
        }
        protectedTagId = supportedTag.tagId;
      }
      requestAttempted = true;
      const tag = await nfcService.requestNdefTag('Aproxima o telemóvel do autocolante NFC.');
      if (protection === 'password' && (!tag?.id || tag.id !== protectedTagId)) {
        throw new Error('A etiqueta mudou durante a operação. A gravação protegida foi cancelada.');
      }
      if (tag?.isWritable === false) {
        throw new Error('Este autocolante NFC está protegido contra escrita.');
      }

      const message = nfcService.createNdefMessage(qrContent);
      const { status, capacity } = await nfcService.getNdefStatus();
      if (status === 'read-only') {
        throw new Error('Este autocolante NFC está protegido contra escrita.');
      }
      if (status === 'unsupported') {
        throw new Error('O autocolante não suporta o formato NDEF.');
      }
      if (message.length > capacity) {
        throw new Error(
          `O conteúdo não cabe neste autocolante (${message.length} bytes necessários; ${capacity} disponíveis).`,
        );
      }

      await nfcService.writeNdefMessage(message);
      ndefWritten = true;
      if (protection === 'password') {
        await nfcService.cancelTechnologyRequest();
        requestAttempted = false;
        if (!protectedTagId) {
          throw new Error('Não foi possível confirmar a identidade da etiqueta para ativar a proteção.');
        }
        await nfcService.enablePasswordProtection(password, protectedTagId);
      }
    } catch (error) {
      operationError = error;
    } finally {
      if (requestAttempted) {
        try {
          await nfcService.cancelTechnologyRequest();
        } catch (error) {
          if (operationError === undefined) {
            operationError = error;
          }
        }
      }

      writingRef.current = false;
      setIsWriting(false);
    }

    if (operationError !== undefined) {
      setFeedback(
        ndefWritten
          ? `O QR foi gravado, mas a proteção não foi confirmada. O estado da etiqueta é incerto; guarda a palavra-passe e verifica-a antes de reutilizar a etiqueta. ${getErrorMessage(operationError)}`
          : getErrorMessage(operationError),
      );
      return;
    }

    setWriteSucceeded(true);
    setFeedback(
      protection === 'password'
        ? 'QR gravado e proteção por palavra-passe ativada. Guarda a palavra-passe: sem ela não poderás voltar a alterar a etiqueta.'
        : 'Gravação concluída sem proteção por palavra-passe. Este autocolante pode ser alterado com outra app.',
    );
  }

  const nfcMessage = {
    checking: 'A verificar NFC…',
    ready: 'NFC disponível neste telemóvel',
    unavailable: 'Este telemóvel não tem NFC compatível',
    error: 'Não foi possível verificar o NFC',
  }[nfcAvailability];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>N</Text>
          </View>
          <View>
            <Text style={styles.brandName}>EasyNFC</Text>
            <Text style={styles.brandCaption}>QR code para NFC, sem complicações</Text>
          </View>
        </View>

        <View style={styles.intro}>
          <Text style={styles.eyebrow}>GRAVAÇÃO NFC</Text>
          <Text style={styles.title}>Do QR code{'\n'}para o autocolante.</Text>
          <Text style={styles.subtitle}>
            Lê o código com a câmara e aproxima o telemóvel de um autocolante NFC gravável.
          </Text>
        </View>

        <View style={styles.statusCard}>
          <View
            style={[
              styles.statusDot,
              nfcAvailability === 'ready' && styles.statusDotReady,
              nfcAvailability === 'unavailable' && styles.statusDotUnavailable,
            ]}
          />
          <Text style={styles.statusText}>{nfcMessage}</Text>
          {nfcAvailability === 'checking' && <ActivityIndicator size="small" color="#57776A" />}
        </View>

        <View style={styles.securityNotice}>
          <Text style={styles.securityNoticeTitle}>Proteção por palavra-passe</Text>
          <Text style={styles.securityNoticeText}>
            A proteção contra escrita está disponível apenas para etiquetas NXP NTAG213, NTAG215 e NTAG216. A leitura continua pública e a palavra-passe nativa do chip tem apenas 32 bits.
          </Text>
        </View>

        <View style={styles.stepHeading}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>1</Text>
          </View>
          <Text style={styles.stepTitle}>Lê um QR code</Text>
        </View>

        {qrContent ? (
          <View style={styles.resultCard}>
            <View style={styles.resultTop}>
              <Text style={styles.resultLabel}>CONTEÚDO DETETADO</Text>
              <View style={styles.detectedBadge}>
                <Text style={styles.detectedBadgeText}>LIDO</Text>
              </View>
            </View>
            <Text selectable style={styles.qrContent}>{qrContent}</Text>
            <TouchableOpacity onPress={resetScan} accessibilityRole="button">
              <Text style={styles.rescanText}>Ler outro QR code</Text>
            </TouchableOpacity>
          </View>
        ) : cameraPermission?.granted ? (
          <View style={styles.cameraFrame}>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleBarcodeScanned}
            />
            <View pointerEvents="none" style={styles.scanOverlay}>
              <View style={styles.scanCorners}>
                <View style={[styles.corner, styles.cornerTopLeft]} />
                <View style={[styles.corner, styles.cornerTopRight]} />
                <View style={[styles.corner, styles.cornerBottomLeft]} />
                <View style={[styles.corner, styles.cornerBottomRight]} />
              </View>
              <Text style={styles.scanHint}>Enquadra o QR code dentro da moldura</Text>
            </View>
          </View>
        ) : (
          <View style={styles.permissionCard}>
            <Text style={styles.permissionTitle}>A câmara é necessária para ler o código</Text>
            <Text style={styles.permissionText}>
              A EasyNFC só usa a câmara para detetar o QR code que queres gravar.
            </Text>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => void enableCamera()}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryButtonText}>
                {cameraPermission?.canAskAgain ? 'Permitir acesso à câmara' : 'Abrir definições'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.stepHeading, styles.secondStep]}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>2</Text>
          </View>
          <Text style={styles.stepTitle}>Grava no autocolante</Text>
        </View>

        <TouchableOpacity
          style={[
            styles.writeButton,
            (!qrContent || isWriting || nfcAvailability !== 'ready') && styles.writeButtonDisabled,
          ]}
          onPress={() => setSecurityWarningVisible(true)}
          disabled={!qrContent || isWriting || nfcAvailability !== 'ready'}
          accessibilityRole="button"
        >
          {isWriting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.writeButtonText}>Gravar no autocolante NFC</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.writeHint}>
          Escolhe se queres proteger o conteúdo com palavra-passe.
        </Text>

        {!!feedback && (
          <View style={[styles.feedbackBox, writeSucceeded ? styles.feedbackSuccess : styles.feedbackError]}>
            <Text style={[styles.feedbackText, writeSucceeded && styles.feedbackSuccessText]}>
              {feedback}
            </Text>
          </View>
        )}

        {!!passwordProtectionUnavailable && (
          <View style={styles.protectionWarning}>
            <Text style={styles.protectionWarningTitle}>Proteção por palavra-passe não disponível</Text>
            <Text style={styles.protectionWarningText}>
              O QR ainda não foi gravado. A app não conseguiu confirmar uma etiqueta NTAG213, NTAG215 ou NTAG216 desbloqueada; etiquetas de outros modelos não aceitam esta proteção.
              {` ${passwordProtectionUnavailable}`}
            </Text>
            <TouchableOpacity
              style={styles.continueButton}
              onPress={() => void writeToNfcTag('none')}
              accessibilityRole="button"
            >
              <Text style={styles.continueButtonText}>Gravar mesmo assim, sem proteção</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Etiquetas sem suporte podem ser gravadas sem proteção. Uma palavra-passe esquecida não pode ser recuperada pela EasyNFC.
          </Text>
        </View>
      </ScrollView>
      <Modal
        visible={securityWarningVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSecurityWarningVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <ScrollView
            style={styles.warningModal}
            contentContainerStyle={styles.warningModalContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.warningIcon}>
              <Text style={styles.warningIconText}>!</Text>
            </View>
            <Text style={styles.warningTitle}>Como queres gravar?</Text>
            <Text style={styles.warningBody}>
              Sem palavra-passe, outras apps poderão alterar o conteúdo. A proteção da EasyNFC só funciona em NTAG213/215/216 com configuração compatível. Outros chips, incluindo NTAG210/212, MIFARE e ISO15693, não recebem esta proteção nesta versão, mesmo que tenham mecanismos próprios. O chip permite no máximo 32 bits: usa a geração aleatória para evitar palavras-passe previsíveis. A leitura do QR continua pública. Guarda a palavra-passe; não é possível recuperá-la.
            </Text>
            <TouchableOpacity
              style={styles.continueButton}
              onPress={() => {
                setSecurityWarningVisible(false);
                void writeToNfcTag('none');
              }}
              accessibilityRole="button"
            >
              <Text style={styles.continueButtonText}>Gravar sem palavra-passe</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.generatePasswordButton}
              onPress={() => void generatePassword()}
              accessibilityRole="button"
            >
              <Text style={styles.generatePasswordText}>Gerar palavra-passe aleatória</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={(value) => setPassword(value.replace(/[^0-9a-fA-F]/g, '').slice(0, 8))}
              placeholder="8 dígitos hexadecimais"
              placeholderTextColor="#89938C"
              secureTextEntry={!passwordVisible}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              accessibilityLabel="Palavra-passe de 8 dígitos hexadecimais"
            />
            <TextInput
              style={styles.passwordInput}
              value={passwordConfirmation}
              onChangeText={(value) => setPasswordConfirmation(value.replace(/[^0-9a-fA-F]/g, '').slice(0, 8))}
              placeholder="Confirma a palavra-passe"
              placeholderTextColor="#89938C"
              secureTextEntry={!passwordVisible}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              accessibilityLabel="Confirma a palavra-passe"
            />
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setPasswordVisible((visible) => !visible)}
              accessibilityRole="button"
            >
              <Text style={styles.cancelButtonText}>{passwordVisible ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}</Text>
            </TouchableOpacity>
            <Text style={styles.passwordHint}>
              A palavra-passe aleatória é criada neste dispositivo e não é guardada pela EasyNFC. Copia-a e guarda-a antes de continuar.
            </Text>
            {passwordConfirmation.length > 0 && password !== passwordConfirmation && (
              <Text style={styles.passwordMismatch}>As palavras-passe não coincidem.</Text>
            )}
            <TouchableOpacity
              style={[
                styles.passwordButton,
                (!/^[\da-fA-F]{8}$/.test(password) || password !== passwordConfirmation) &&
                  styles.buttonDisabled,
              ]}
              onPress={() => void writeToNfcTag('password')}
              disabled={!/^[\da-fA-F]{8}$/.test(password) || password !== passwordConfirmation}
              accessibilityRole="button"
            >
              <Text style={styles.continueButtonText}>Gravar e proteger com palavra-passe</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setSecurityWarningVisible(false)}
              accessibilityRole="button"
            >
              <Text style={styles.cancelButtonText}>Cancelar gravação</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F7F3',
  },
  page: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 42,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginBottom: 34,
  },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D9E9DE',
  },
  brandMarkText: {
    color: '#205A43',
    fontSize: 22,
    fontWeight: '800',
  },
  brandName: {
    color: '#1D2D25',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  brandCaption: {
    color: '#748078',
    fontSize: 11,
    marginTop: 2,
  },
  intro: {
    marginBottom: 21,
  },
  eyebrow: {
    color: '#54836B',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 10,
  },
  title: {
    color: '#1E3027',
    fontSize: 34,
    lineHeight: 39,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  subtitle: {
    color: '#6D7871',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },
  statusCard: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    marginBottom: 26,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E0B65B',
  },
  statusDotReady: {
    backgroundColor: '#4D9A70',
  },
  statusDotUnavailable: {
    backgroundColor: '#D16D5A',
  },
  statusText: {
    flex: 1,
    color: '#526158',
    fontSize: 12,
    fontWeight: '600',
  },
  securityNotice: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F0D9A8',
    backgroundColor: '#FFF9EA',
    padding: 14,
    marginTop: -13,
    marginBottom: 24,
  },
  securityNoticeTitle: {
    color: '#755A25',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 5,
  },
  securityNoticeText: {
    color: '#7C6B48',
    fontSize: 11,
    lineHeight: 16,
  },
  stepHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 13,
  },
  stepNumber: {
    width: 25,
    height: 25,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DDEBE1',
  },
  stepNumberText: {
    color: '#347052',
    fontSize: 12,
    fontWeight: '800',
  },
  stepTitle: {
    color: '#26372E',
    fontSize: 15,
    fontWeight: '700',
  },
  cameraFrame: {
    height: 248,
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: '#17251D',
  },
  camera: {
    ...StyleSheet.absoluteFill,
  },
  scanOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12, 24, 17, 0.13)',
  },
  scanCorners: {
    width: 174,
    height: 174,
  },
  corner: {
    position: 'absolute',
    width: 29,
    height: 29,
    borderColor: '#E3F3E8',
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 9,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 9,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 9,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 9,
  },
  scanHint: {
    position: 'absolute',
    bottom: 19,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  permissionCard: {
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    padding: 18,
  },
  permissionTitle: {
    color: '#293A30',
    fontSize: 15,
    fontWeight: '700',
  },
  permissionText: {
    color: '#748078',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    marginBottom: 15,
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 11,
    backgroundColor: '#E4EFE7',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  secondaryButtonText: {
    color: '#32694D',
    fontSize: 13,
    fontWeight: '700',
  },
  resultCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DFE8E1',
    backgroundColor: '#FFFFFF',
    padding: 17,
  },
  resultTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 11,
  },
  resultLabel: {
    color: '#859087',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  detectedBadge: {
    borderRadius: 8,
    backgroundColor: '#E3F1E7',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  detectedBadgeText: {
    color: '#3B7A55',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  qrContent: {
    color: '#26372E',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 13,
  },
  rescanText: {
    color: '#478060',
    fontSize: 12,
    fontWeight: '700',
  },
  secondStep: {
    marginTop: 25,
  },
  writeButton: {
    minHeight: 53,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#286244',
  },
  writeButtonDisabled: {
    backgroundColor: '#A8B9AE',
  },
  writeButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  writeHint: {
    color: '#7C877F',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 9,
  },
  feedbackBox: {
    borderRadius: 12,
    padding: 13,
    marginTop: 15,
  },
  feedbackSuccess: {
    backgroundColor: '#E2F0E6',
  },
  feedbackError: {
    backgroundColor: '#F8E8E3',
  },
  feedbackText: {
    color: '#8A473B',
    fontSize: 12,
    lineHeight: 18,
  },
  feedbackSuccessText: {
    color: '#326C49',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#E6EAE5',
    marginTop: 28,
    paddingTop: 16,
  },
  footerText: {
    color: '#929B94',
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18, 31, 23, 0.58)',
    paddingHorizontal: 24,
  },
  warningModal: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '85%',
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
  },
  warningModalContent: {
    padding: 22,
  },
  warningIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF0D0',
    marginBottom: 15,
  },
  warningIconText: {
    color: '#A16C16',
    fontSize: 22,
    fontWeight: '800',
  },
  warningTitle: {
    color: '#26372E',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 9,
  },
  warningBody: {
    color: '#6E7971',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 20,
  },
  continueButton: {
    minHeight: 49,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#286244',
    marginBottom: 9,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  passwordInput: {
    minHeight: 49,
    borderWidth: 1,
    borderColor: '#D8DED9',
    borderRadius: 13,
    paddingHorizontal: 14,
    color: '#26372E',
    fontSize: 15,
    letterSpacing: 2,
    marginBottom: 9,
  },
  passwordButton: {
    minHeight: 49,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#205A43',
    marginBottom: 9,
    paddingHorizontal: 8,
  },
  passwordMismatch: {
    color: '#A3473B',
    fontSize: 12,
    marginBottom: 9,
    textAlign: 'center',
  },
  passwordHint: {
    color: '#6E7971',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginBottom: 12,
  },
  generatePasswordButton: {
    minHeight: 43,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#E7F0E9',
    marginBottom: 9,
  },
  generatePasswordText: {
    color: '#205A43',
    fontSize: 13,
    fontWeight: '800',
  },
  protectionWarning: {
    backgroundColor: '#FFF0D0',
    borderRadius: 12,
    padding: 14,
    marginTop: 15,
  },
  protectionWarningTitle: {
    color: '#744B0D',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 6,
  },
  protectionWarningText: {
    color: '#6E5B3D',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  cancelButton: {
    minHeight: 45,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#F1F3F0',
  },
  cancelButtonText: {
    color: '#46544B',
    fontSize: 13,
    fontWeight: '700',
  },
});
