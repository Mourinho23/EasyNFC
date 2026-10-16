# EasyNFC

App móvel para ler o conteúdo de um QR code e gravá-lo num autocolante NFC.

## Como funciona

1. Permite o acesso à câmara e enquadra um QR code.
2. Confirma o conteúdo detetado.
3. Toca em **Gravar no autocolante NFC** e aproxima o telemóvel do autocolante.

URLs HTTP/HTTPS são gravados como registos NDEF URI para poderem abrir quando outro telemóvel lê o autocolante. Outros conteúdos são gravados como registos NDEF de texto em português. O conteúdo tem de caber na capacidade do autocolante, que tem de ser compatível com NDEF e estar gravável.

## Proteção por palavra-passe

Ao gravar, podes escolher entre gravar sem proteção ou ativar a proteção nativa contra escrita. Esta última só é ativada depois de a app identificar uma etiqueta NXP NTAG213, NTAG215 ou NTAG216 sem proteção/configuração personalizada. Se não for possível confirmar o modelo ou a configuração, a app avisa que o QR ainda não foi gravado e pede confirmação antes de oferecer a gravação sem proteção. Outros chips — por exemplo NTAG210/212, MIFARE e ISO15693 — não recebem a proteção da EasyNFC nesta versão, ainda que algum possa ter mecanismos próprios que a app não configura. Etiquetas NDEF compatíveis podem ser gravadas sem palavra-passe.

A palavra-passe tem de conter exatamente 8 dígitos hexadecimais (0–9, A–F), devido ao limite de 32 bits dos chips NTAG21x. A app pode gerar uma palavra-passe aleatória com o gerador criptográfico do dispositivo; ainda assim, o espaço máximo é apenas 32 bits e não é adequado a dados muito sensíveis. O chip limita tentativas falhadas e a EasyNFC verifica a autenticação e as definições depois de as aplicar. A proteção começa na página 3 para também impedir alterações ao Capability Container NDEF, sem bloquear a leitura pública do conteúdo. Guarda a palavra-passe num local seguro: a EasyNFC não a guarda nem consegue recuperá-la. Se ocorrer um erro depois de o QR ser gravado, o estado da etiqueta pode ser incerto; guarda a palavra-passe e verifica a etiqueta antes de a reutilizar.

## Requisitos

- Telemóvel com câmara e NFC.
- Autocolante NFC gravável, formatado em NDEF.
- Node.js e npm para desenvolvimento.
- Expo Development Build. **Expo Go não suporta o módulo NFC nativo.**

Depois de instalar/atualizar módulos nativos, volta a compilar e instalar o Development Build Android/iOS antes de testar.

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

## Criar um APK Android

A página de instalação Android está em [EasyNFC — instalação Android](https://mourinho23.github.io/EasyNFC/). Cada atualização da branch `main` compila um APK de teste e publica-o na [versão mais recente do GitHub](https://github.com/Mourinho23/EasyNFC/releases/latest/download/EasyNFC.apk). Também podes executar a compilação a partir de **Actions → Build Android APK → Run workflow**.

O APK é assinado para instalação de teste e distribuído fora da Play Store. No Android, transfere o ficheiro, permite a instalação desta origem se te for pedido e abre a app. Para compilar manualmente com Expo:

```sh
npx eas-cli@latest build --platform android --profile preview
```

Na primeira utilização, inicia sessão com `npx eas-cli@latest login` e configura o projeto com `npx eas-cli@latest build:configure`. Quando a compilação terminar, usa o link do Expo para transferir e instalar o APK. Para o disponibilizar no GitHub sem aumentar o tamanho de cada cópia do repositório, publica o ficheiro numa GitHub Release.
