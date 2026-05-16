@echo off
chcp 65001 >nul
title I.S.O PRO Campo - Expo (telefone)
cd /d "%~dp0"

echo.
echo Pasta: %CD%
echo A iniciar Expo em modo TUNEL para o telemovel...
echo No telemovel: abre "Expo Go" e le o QR que aparece abaixo.
echo Firewall: se o Windows perguntar, permite na rede privada.
echo.
echo ----------------------------------------

call npm run start:tunnel

echo.
echo ----------------------------------------
echo Servidor parou. Carrega numa tecla para fechar.
pause >nul
