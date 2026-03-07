# sync-secrets.ps1
# Pulls production secrets from GCP Secret Manager and populates local .env files via PowerShell.

$ProjectID = "672446353769"
$TargetFile = "sites/mainweb/.env.local"

Write-Host "Using GCP Project: $ProjectID" -ForegroundColor Cyan
Write-Host "Target: $TargetFile" -ForegroundColor Cyan

# Secret Name in GCP -> Env Var Name
$Secrets = @{
    "DATABASE_URL" = "DATABASE_URL"
    "AUTH_SECRET" = "NEXTAUTH_SECRET"
    "STRIPE_SECRET_KEY" = "STRIPE_SECRET_KEY"
    "STRIPE_WEBHOOK_SECRET" = "STRIPE_WEBHOOK_SECRET"
    "EMAIL_SERVER_PASSWORD" = "EMAIL_SERVER_PASSWORD"
    "AUTH_GOOGLE_ID" = "GOOGLE_CLIENT_ID"
    "AUTH_GOOGLE_SECRET" = "GOOGLE_CLIENT_SECRET"
}

if (!(Test-Path $TargetFile)) {
    New-Item -Path $TargetFile -ItemType File
}

foreach ($Key in $Secrets.Keys) {
    $EnvVar = $Secrets[$Key]
    Write-Host "Fetching $Key..."

    $Value = gcloud secrets versions access latest --secret="$Key" --project="$ProjectID" 2>$null

    if ($LASTEXITCODE -eq 0) {
        $Content = Get-Content $TargetFile
        $LineFound = $Content | Where-Object { $_ -match "^$EnvVar=" }

        if ($LineFound) {
            $Content = $Content | ForEach-Object {
                if ($_ -match "^$EnvVar=") { "$EnvVar=$Value" } else { $_ }
            }
            $Content | Set-Content $TargetFile
        } else {
            Add-Content -Path $TargetFile -Value "$EnvVar=$Value"
        }
        Write-Host "Successfully synced $EnvVar" -ForegroundColor Green
    } else {
        Write-Warning "Could not fetch $Key. Ensure you have 'Secret Manager Secret Accessor' role."
    }
}

Write-Host "Secret synchronization complete." -ForegroundColor Cyan
