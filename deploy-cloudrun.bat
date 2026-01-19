@echo off
REM =========================================
REM Deploy Portal to Google Cloud Run
REM =========================================
setlocal enabledelayedexpansion

REM Configuration
if "%GCP_PROJECT_ID%"=="" (
    set PROJECT_ID=dsgt-website
) else (
    set PROJECT_ID=%GCP_PROJECT_ID%
)

if "%GCP_REGION%"=="" (
    set REGION=us-central1
) else (
    set REGION=%GCP_REGION%
)

set SERVICE_NAME=portal
set IMAGE_NAME=gcr.io/%PROJECT_ID%/%SERVICE_NAME%

echo ============================================
echo Deploying Portal to Cloud Run
echo ============================================
echo Project: %PROJECT_ID%
echo Region: %REGION%
echo Service: %SERVICE_NAME%
echo Image: %IMAGE_NAME%
echo ============================================

REM Check if gcloud is installed
where gcloud >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: gcloud CLI is not installed
    echo Install from: https://cloud.google.com/sdk/docs/install
    exit /b 1
)

REM Check if Docker is installed
where docker >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Docker is not installed
    echo Install from: https://docs.docker.com/get-docker/
    exit /b 1
)

REM Authenticate Docker with GCR
echo.
echo Configuring Docker for GCR...
call gcloud auth configure-docker --quiet

REM Build the Docker image
echo.
echo Building Docker image...
docker build -t %IMAGE_NAME% -f sites\portal\Dockerfile .
if %ERRORLEVEL% neq 0 (
    echo ERROR: Docker build failed
    exit /b 1
)

REM Push to Container Registry
echo.
echo Pushing image to Container Registry...
docker push %IMAGE_NAME%
if %ERRORLEVEL% neq 0 (
    echo ERROR: Docker push failed
    exit /b 1
)

REM Deploy to Cloud Run
echo.
echo Deploying to Cloud Run...
call gcloud run deploy %SERVICE_NAME% ^
    --image %IMAGE_NAME% ^
    --platform managed ^
    --region %REGION% ^
    --allow-unauthenticated ^
    --memory 1Gi ^
    --cpu 1 ^
    --min-instances 0 ^
    --max-instances 10 ^
    --port 8080 ^
    --timeout 60s ^
    --set-env-vars "NODE_ENV=production"

if %ERRORLEVEL% neq 0 (
    echo ERROR: Cloud Run deployment failed
    exit /b 1
)

REM Get the service URL
echo.
echo ============================================
echo Deployment complete!
echo ============================================
for /f "tokens=*" %%i in ('gcloud run services describe %SERVICE_NAME% --region %REGION% --format "value(status.url)"') do set SERVICE_URL=%%i
echo Service URL: %SERVICE_URL%
echo.
echo Next steps:
echo 1. Set environment variables in Cloud Run console or via Secret Manager
echo 2. Run: firebase deploy --only hosting:dsgt-portal
echo    to update hosting rewrites to Cloud Run

endlocal
