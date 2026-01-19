#!/bin/bash
# =========================================
# Deploy Portal to Google Cloud Run
# =========================================
set -e

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-dsgt-website}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="portal"
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"

echo "============================================"
echo "Deploying Portal to Cloud Run"
echo "============================================"
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Service: $SERVICE_NAME"
echo "Image: $IMAGE_NAME"
echo "============================================"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "ERROR: gcloud CLI is not installed"
    echo "Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed"
    echo "Install from: https://docs.docker.com/get-docker/"
    exit 1
fi

# Authenticate Docker with GCR
echo ""
echo "Configuring Docker for GCR..."
gcloud auth configure-docker --quiet

# Build the Docker image
echo ""
echo "Building Docker image..."
docker build -t $IMAGE_NAME -f sites/portal/Dockerfile .

# Push to Container Registry
echo ""
echo "Pushing image to Container Registry..."
docker push $IMAGE_NAME

# Deploy to Cloud Run
echo ""
echo "Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
    --image $IMAGE_NAME \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --memory 1Gi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 10 \
    --port 8080 \
    --timeout 60s \
    --set-env-vars "NODE_ENV=production"

# Get the service URL
echo ""
echo "============================================"
echo "Deployment complete!"
echo "============================================"
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)')
echo "Service URL: $SERVICE_URL"
echo ""
echo "Next steps:"
echo "1. Set environment variables in Cloud Run console or via Secret Manager"
echo "2. Run: firebase deploy --only hosting:dsgt-portal"
echo "   to update hosting rewrites to Cloud Run"
