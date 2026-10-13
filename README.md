# EasyNFC

App móvel para ler o conteúdo de um QR code e gravá-lo num autocolante NFC.

## Como funciona

1. Permite o acesso à câmara e enquadra um QR code.
2. Confirma o conteúdo detetado.
3. Toca em **Gravar no autocolante NFC** e aproxima o telemóvel do autocolante.

URLs HTTP/HTTPS são gravados como registos NDEF URI para poderem abrir quando outro telemóvel lê o autocolante. Outros conteúdos são gravados como registos NDEF de texto em português. O conteúdo tem de caber na capacidade do autocolante, que tem de ser compatível com NDEF e estar gravável.

## Proteção por palavra-passe

A versão atual grava conteúdo NDEF, mas ainda não configura nem confirma proteção contra escrita por palavra-passe em nenhum modelo de etiqueta. Antes de gravar, a app apresenta um aviso e permite continuar sem proteção ou cancelar. Se continuares, outras apps poderão alterar a etiqueta. A compatibilidade de gravação NDEF não significa compatibilidade com proteção por palavra-passe.

## Requisitos

- Telemóvel com câmara e NFC.
- Autocolante NFC gravável, formatado em NDEF.
- Node.js e npm para desenvolvimento.
- Expo Development Build. **Expo Go não suporta o módulo NFC nativo.**

## Executar em desenvolvimento

Instala as dependências e gera os projetos nativos:

```sh
npm install
npx expo prebuild
```

Depois compila e instala no dispositivo:

```sh
npm run android
npm start
```

Para iPhone, compila num Mac com Xcode:

```sh
npm run ios
npm start
```

Usa um dispositivo físico para testar a câmara e o NFC. No iOS, a compilação tem de ser assinada com um App ID e um perfil de aprovisionamento que permitam a capacidade NFC.
