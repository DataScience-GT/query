/**
 * Firebase Cloud Functions for Next.js SSR
 */

const { onRequest } = require('firebase-functions/v2/https');
const path = require('path');
const next = require('next');
const fs = require('fs');

// Helper to load the bundled Next.js server
function createNextHandler(siteName) {
    let app;
    let handle;

    return async (req, res) => {
        try {
            if (!app) {
                // The standalone build is nested: ./dist/[siteName]/sites/[siteName]
                const siteDir = path.join(__dirname, 'dist', siteName, 'sites', siteName);

                // Load config from required-server-files.json
                const configFile = path.join(siteDir, '.next', 'required-server-files.json');
                let conf = {};
                if (fs.existsSync(configFile)) {
                    const serverFiles = JSON.parse(fs.readFileSync(configFile, 'utf8'));
                    conf = serverFiles.config || {};
                }

                // IMPORTANT: Load environment variables from .env file
                try {
                    const { loadEnvConfig } = require('@next/env');
                    // We want the directory containing the .env file.
                    // In deploy.bat we copy .env to firebase-functions/dist/portal/.env
                    // siteDir is firebase-functions/dist/portal/sites/portal
                    // So .env is at siteDir/../..
                    const envPath = path.resolve(siteDir, '..', '..');
                    console.log('Loading .env from:', envPath);
                    loadEnvConfig(envPath);
                } catch (e) {
                    console.warn('Failed to load @next/env:', e);
                }

                console.log(`Initializing Next.js for ${siteName} in ${siteDir}`);

                app = next({
                    dev: false,
                    dir: siteDir,
                    conf: conf,
                    // Ensure we use the local 'next' dependency
                    hostname: '0.0.0.0',
                    port: 3000
                });

                handle = app.getRequestHandler();
                await app.prepare();
            }

            return handle(req, res);
        } catch (error) {
            console.error(`Error handling request for ${siteName}:`, error);
            res.status(500).send(`Internal Server Error: ${error.message}`);
        }
    };
}

// Export only the portal handler
exports.portal = onRequest({
    region: 'us-central1',
    memory: '1GiB',
    maxInstances: 10,
}, createNextHandler('portal'));
