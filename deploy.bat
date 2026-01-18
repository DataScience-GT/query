@echo off
setlocal enabledelayedexpansion

REM Setup
if not exist "firebase-functions\dist" mkdir "firebase-functions\dist"

if "%1"=="mainweb" goto deploy_mainweb
if "%1"=="portal" goto deploy_portal
if "%1"=="--all" goto deploy_all
if "%1"=="" goto deploy_all

goto end

:deploy_mainweb
echo Building static mainweb...
call pnpm --filter web run build
echo Deploying mainweb...
call firebase deploy --only hosting:dsgt-website
goto end

:deploy_portal
echo Building SSR portal...
call pnpm --filter portal run build

echo Bundling portal for Cloud Functions...
if exist "firebase-functions\dist\portal" rd /s /q "firebase-functions\dist\portal"
mkdir "firebase-functions\dist\portal"

REM Copy standalone build
xcopy /E /I /Y "sites\portal\.next\standalone\*" "firebase-functions\dist\portal\"

REM Copy production .env file for production secrets
copy ".env.production" "firebase-functions\dist\portal\.env"

REM Copy static and public files to the correct nested location
if not exist "firebase-functions\dist\portal\sites\portal\.next\static" mkdir "firebase-functions\dist\portal\sites\portal\.next\static"
xcopy /E /I /Y "sites\portal\.next\static" "firebase-functions\dist\portal\sites\portal\.next\static\"

if exist "sites\portal\public" (
  if not exist "firebase-functions\dist\portal\sites\portal\public" mkdir "firebase-functions\dist\portal\sites\portal\public"
  xcopy /E /I /Y "sites\portal\public" "firebase-functions\dist\portal\sites\portal\public\"
)

echo Deploying portal...
call firebase deploy --only hosting:dsgt-portal,functions:portal
goto end

:deploy_all
call :deploy_mainweb
call :deploy_portal
goto end

:end
echo Done.
