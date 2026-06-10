# GCP Backend Setup Guide

This guide explains how to set up your local environment to work with the GCP-hosted backend (Firebase App Hosting + Secret Manager).

## 1. Prerequisites

Install the following CLI tools:

- **Google Cloud CLI**: [Install gcloud](https://cloud.google.com/sdk/docs/install)
- **Firebase CLI**: `npm install -g firebase-tools`

## 2. Authentication

Authenticate with your Google account that has access to the `dsgt-website` project:

```bash
# Login to gcloud
gcloud auth login
gcloud auth application-default login

# Login to Firebase
firebase login
```

Set the default project:

```bash
gcloud config set project dsgt-website
firebase use dsgt-website
```

## 3. Syncing Secrets

We manage secrets in **GCP Secret Manager**. To avoid manually copying them into `.env.local`, use the sync script:

```bash
# From the root directory
./scripts/sync-secrets.sh
```

This will pull the following from GCP:

- `DATABASE_URL`
- `AUTH_SECRET`
- `STRIPE_SECRET_KEY`
- `RESEND_API_KEY`
- etc.

## 4. Running the App

To run the entire stack (Main Web + Discord Bot) in development mode:

```bash
pnpm dev:full
```

## 5. Troubleshooting

### Permission Denied

If you get a permission error when running `sync-secrets.sh`, make it executable:

```bash
chmod +x scripts/sync-secrets.sh
```

### Missing Secrets

Ensure your account has the `Secret Manager Secret Accessor` role in the GCP Console for the `dsgt-website` project.
