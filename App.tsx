import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { nfcService } from './nfcService';

type NfcAvailability = 'checking' | 'ready' | 'unavailable' | 'error';

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

  async function writeToNfcTag() {
    setSecurityWarningVisible(false);
    if (!qrContent || writingRef.current) {
      return;
    }

    writingRef.current = true;
    setIsWriting(true);
    setFeedback('');
    setWriteSucceeded(false);

    let requestAttempted = false;
    let operationError: unknown;
    try {
      await nfcService.start();
      if (!(await nfcService.isNdefSupported())) {
        throw new Error('Este telemóvel não suporta NFC.');
      }

      requestAttempted = true;
      const tag = await nfcService.requestNdefTag('Aproxima o telemóvel do autocolante NFC.');
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
      setFeedback(getErrorMessage(operationError));
      return;
    }

    setWriteSucceeded(true);
    setFeedback('Gravação concluída sem proteção por palavra-passe. Este autocolante pode ser alterado com outra app.');
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
            A gravação NFC normal funciona com muitas etiquetas, mas bloquear alterações com uma palavra-passe depende do chip. A EasyNFC ainda não confirmou essa proteção em nenhum modelo.
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
          Depois de tocar no botão, aproxima o telemóvel do autocolante.
        </Text>

        {!!feedback && (
          <View style={[styles.feedbackBox, writeSucceeded ? styles.feedbackSuccess : styles.feedbackError]}>
            <Text style={[styles.feedbackText, writeSucceeded && styles.feedbackSuccessText]}>
              {feedback}
            </Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            A gravação NDEF é compatível com muitas etiquetas. A proteção contra alterações por palavra-passe ainda não está ativa.
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
          <View style={styles.warningModal}>
            <View style={styles.warningIcon}>
              <Text style={styles.warningIconText}>!</Text>
            </View>
            <Text style={styles.warningTitle}>Proteção não confirmada</Text>
            <Text style={styles.warningBody}>
              A EasyNFC ainda não consegue confirmar nem ativar a proteção por palavra-passe neste autocolante. Se continuares, o conteúdo será gravado sem proteção e outra app poderá alterá-lo.
            </Text>
            <TouchableOpacity
              style={styles.continueButton}
              onPress={() => void writeToNfcTag()}
              accessibilityRole="button"
            >
              <Text style={styles.continueButtonText}>Continuar sem proteção</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setSecurityWarningVisible(false)}
              accessibilityRole="button"
            >
              <Text style={styles.cancelButtonText}>Cancelar gravação</Text>
            </TouchableOpacity>
          </View>
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
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
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
