# Maestro — I.S.O PRO Campo

Fluxos em [Maestro](https://maestro.mobile.dev/) para regressão rápida no **Android** (app id `com.isopro.campo`).

## Pré-requisitos

1. Instalar o CLI: [instalação Maestro](https://maestro.mobile.dev/getting-started/installing-maestro)
2. Emulador ou telemóvel com USB debugging, com a app **debug** instalada (`expo run:android` ou APK de desenvolvimento).

## Correr

Na raiz `iso_pro_mobile`:

```bash
maestro test .maestro/login-validacao.yaml
```

Fluxo com login real (variáveis no ambiente):

```bash
set MAESTRO_LOGIN=utilizador
set MAESTRO_PASSWORD=segredo
maestro test .maestro/login-com-credenciais.yaml
```

(PowerShell: `$env:MAESTRO_LOGIN="..."; $env:MAESTRO_PASSWORD="..."; maestro test ...`)

O ficheiro `login-com-credenciais.yaml` espera aparecer o separador **Início** após login bem-sucedido (ecrã `(tabs)`). Ajuste se o rótulo mudar.
