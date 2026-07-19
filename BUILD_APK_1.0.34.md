# APK Campo 1.0.34 (build 35) — correcção dados + rede

Checklist: **[BUILD_APK.md](./BUILD_APK.md)**

## Corrigido

1. **Ecrã «totalmente diferente» do PC** — ao mudar de aba, a app recarregava a nuvem e **apagava** desenhos e baixas locais; agora preserva estado.
2. **Erro «Network request failed»** — falha de rede **não desfaz** mais a baixa; entra na **fila offline** (faixa «Nuvem»).
3. **Popup após finalizar** — aviso de fila só no diálogo de confirmação; flush automático deixou de incomodar com alertas desnecessários.

## Gerar APK

```powershell
cd "c:\Sistema I.S.O PRO GESTÃO DE MATERIAIS\iso_pro_mobile"
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-android-off-path.ps1
```

## Verificar

- **1.0.34 (Android 35)** no Início
- Registar várias baixas → mudar para Documentos e voltar → **mesmos valores** Projeto/Atendido/Pend.
- Com 5G instável: baixa mantém-se; faixa mostra «X atendimento(s) na fila offline»
