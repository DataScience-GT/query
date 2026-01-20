# Next Steps: Google Cloud Run Deployment

## Current Status
- Dockerfile exists at `sites/portal/Dockerfile` (multi-stage build, ready to go)
- GitHub Actions workflow exists at `.github/workflows/cloudrun-deploy.yml`
- Deploy scripts exist: `deploy-cloudrun.sh` and `deploy-cloudrun.bat`
- Firebase hosting configured to rewrite portal requests to Cloud Run

---

## Prerequisites

### 1. Install Required Tools
- [ ] **Google Cloud SDK (gcloud)**: https://cloud.google.com/sdk/docs/install
- [ ] **Docker Desktop**: https://docs.docker.com/get-docker/
- [ ] **Firebase CLI**: `npm install -g firebase-tools`

### 2. Google Cloud Project Setup
- [ ] Create or select GCP project (current config expects: `dsgt-website`)
- [ ] Enable these APIs in Google Cloud Console:
  - Cloud Run API
  - Container Registry API
  - Secret Manager API (for secrets)
  - Cloud SQL Admin API (if using Cloud SQL)

```bash
gcloud services enable run.googleapis.com containerregistry.googleapis.com secretmanager.googleapis.com
```

### 3. Authenticate
```bash
gcloud auth login
gcloud config set project dsgt-website
gcloud auth configure-docker
```

---

## Database Setup (PostgreSQL)

### Option A: Cloud SQL (Recommended for Production)
- [ ] Create Cloud SQL PostgreSQL instance in GCP Console
- [ ] Create database named `portal_db` (or whatever)
- [ ] Create user with password
- [ ] Enable Cloud SQL Auth Proxy or configure public IP with SSL
- [ ] Get connection string format:
  ```
  postgresql://USER:PASSWORD@/DATABASE?host=/cloudsql/PROJECT:REGION:INSTANCE
  ```

### Option B: External PostgreSQL (Supabase, Neon, Railway, etc.)
- [ ] Create PostgreSQL database on your provider
- [ ] Get connection string with SSL enabled
- [ ] Whitelist Cloud Run IPs (or allow all if no IP restrictions)

---

## Secrets Setup in Google Secret Manager

Create these secrets in GCP Secret Manager:

```bash
# Database URL
echo -n "postgresql://user:pass@host:5432/dbname" | \
  gcloud secrets create DATABASE_URL --data-file=-

# NextAuth Secret (generate a random string)
echo -n "your-super-secret-auth-key-min-32-chars" | \
  gcloud secrets create AUTH_SECRET --data-file=-

# Google OAuth (from Google Cloud Console > APIs & Services > Credentials)
echo -n "your-google-client-id.apps.googleusercontent.com" | \
  gcloud secrets create AUTH_GOOGLE_ID --data-file=-

echo -n "your-google-client-secret" | \
  gcloud secrets create AUTH_GOOGLE_SECRET --data-file=-
```

---

## First Manual Deployment

### Step 1: Build and Push Docker Image
```bash
# From the repo root
docker build -t gcr.io/dsgt-website/portal -f sites/portal/Dockerfile .
docker push gcr.io/dsgt-website/portal
```

### Step 2: Deploy to Cloud Run
```bash
gcloud run deploy portal \
  --image gcr.io/dsgt-website/portal:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --port 8080 \
  --timeout 60s \
  --set-env-vars "NODE_ENV=production" \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,AUTH_SECRET=AUTH_SECRET:latest,AUTH_GOOGLE_ID=AUTH_GOOGLE_ID:latest,AUTH_GOOGLE_SECRET=AUTH_GOOGLE_SECRET:latest"
```

### Step 3: Get the Service URL
```bash
gcloud run services describe portal --region us-central1 --format 'value(status.url)'
```

This will output something like: `https://portal-xxxxx-uc.a.run.app`

### Step 4: Update Auth URLs
Go to Cloud Run console and set these env vars:
- `AUTH_URL` = `https://dsgt-portal.web.app` (your Firebase hosting URL)
- `NEXT_PUBLIC_APP_URL` = `https://dsgt-portal.web.app`

### Step 5: Update Google OAuth Redirect URIs
In Google Cloud Console > APIs & Services > Credentials > Your OAuth Client:
- Add authorized redirect URI: `https://dsgt-portal.web.app/api/auth/callback/google`
- Add authorized redirect URI: `https://portal-xxxxx-uc.a.run.app/api/auth/callback/google`

---

## Firebase Hosting Setup (Routes traffic to Cloud Run)

### Step 1: Login and set project
```bash
firebase login
firebase use dsgt-website
```

### Step 2: Deploy hosting configuration
```bash
firebase deploy --only hosting:portal
```

This deploys the rewrite rules in `firebase.json` that route all `dsgt-portal.web.app/*` traffic to your Cloud Run service.

---

## GitHub Actions Setup (CI/CD)

### Required GitHub Secrets
Add these in GitHub repo > Settings > Secrets and variables > Actions:

| Secret Name | Value |
|-------------|-------|
| `GCP_PROJECT_ID` | `dsgt-website` |
| `GCP_SA_KEY` | Service account JSON key (see below) |

### Create Service Account for CI/CD
```bash
# Create service account
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions"

# Grant roles
gcloud projects add-iam-policy-binding dsgt-website \
  --member="serviceAccount:github-actions@dsgt-website.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding dsgt-website \
  --member="serviceAccount:github-actions@dsgt-website.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

gcloud projects add-iam-policy-binding dsgt-website \
  --member="serviceAccount:github-actions@dsgt-website.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Create and download key
gcloud iam service-accounts keys create github-sa-key.json \
  --iam-account=github-actions@dsgt-website.iam.gserviceaccount.com

# Copy the contents of github-sa-key.json to GCP_SA_KEY secret
cat github-sa-key.json
```

---

## Database Migration

After Cloud Run is deployed, run migrations:

```bash
# Set DATABASE_URL locally to your production database
export DATABASE_URL="postgresql://..."

# Push schema to database
cd packages/db
pnpm migrate:push
```

Or connect to Cloud Run and run migrations there (advanced).

---

## Quick Deploy Script

Once everything is set up, you can use the existing script:

```bash
# Unix/Mac/WSL
./deploy-cloudrun.sh

# Windows (PowerShell with Docker)
# Use the manual steps above or WSL
```

---

## Checklist Summary

### One-Time Setup
- [ ] GCP project created and APIs enabled
- [ ] gcloud CLI installed and authenticated
- [ ] Docker installed
- [ ] PostgreSQL database created (Cloud SQL or external)
- [ ] Secrets created in Secret Manager
- [ ] Google OAuth credentials configured with correct redirect URIs
- [ ] Service account created for GitHub Actions
- [ ] GitHub secrets configured

### Each Deployment
- [ ] Build passes locally: `pnpm build`
- [ ] Push to main branch (triggers GitHub Actions)
- [ ] OR run `./deploy-cloudrun.sh` manually
- [ ] Verify at Cloud Run URL
- [ ] Verify at Firebase hosting URL (dsgt-portal.web.app)

---

## Useful Commands

```bash
# Check Cloud Run logs
gcloud run services logs read portal --region us-central1

# Stream logs in real-time
gcloud run services logs tail portal --region us-central1

# List Cloud Run services
gcloud run services list

# Delete a service (if needed)
gcloud run services delete portal --region us-central1

# Check secret versions
gcloud secrets versions list DATABASE_URL
```

---

## Troubleshooting

### "Container failed to start"
- Check Cloud Run logs for actual error
- Verify DATABASE_URL is correct and accessible
- Make sure secrets are properly mounted

### "NEXT_AUTH_URL mismatch"
- Set AUTH_URL env var to match your domain
- Update OAuth redirect URIs in Google Console

### Build fails in Docker
- Test locally first: `docker build -t test -f sites/portal/Dockerfile .`
- Check pnpm-lock.yaml is up to date

### Database connection refused
- Whitelist Cloud Run egress IPs (or use Cloud SQL connector)
- Check if SSL is required by your DB provider
