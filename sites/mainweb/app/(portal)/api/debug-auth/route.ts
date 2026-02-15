import { NextResponse } from "next/server";
import { createHash } from "crypto";

// Temporary debug endpoint to check auth configuration
// DELETE THIS AFTER DEBUGGING
export async function GET() {
    const authSecret = process.env.AUTH_SECRET;
    const nextAuthSecret = process.env.NEXTAUTH_SECRET;
    const nextAuthUrl = process.env.NEXTAUTH_URL;
    const authUrl = process.env.AUTH_URL;
    const dbUrl = process.env.DATABASE_URL;
    const emailHost = process.env.EMAIL_SERVER_HOST;
    const emailUser = process.env.EMAIL_SERVER_USER;
    const emailPass = process.env.EMAIL_SERVER_PASSWORD;

    // Test hash with each secret
    const testToken = "test123";
    const hashWithAuth = authSecret
        ? createHash("sha256").update(`${testToken}${authSecret}`).digest("hex").substring(0, 16)
        : "N/A";
    const hashWithNextAuth = nextAuthSecret
        ? createHash("sha256").update(`${testToken}${nextAuthSecret}`).digest("hex").substring(0, 16)
        : "N/A";

    return NextResponse.json({
        env: {
            AUTH_SECRET_set: !!authSecret,
            AUTH_SECRET_first5: authSecret ? authSecret.substring(0, 5) : null,
            NEXTAUTH_SECRET_set: !!nextAuthSecret,
            NEXTAUTH_SECRET_first5: nextAuthSecret ? nextAuthSecret.substring(0, 5) : null,
            NEXTAUTH_URL: nextAuthUrl,
            AUTH_URL: authUrl,
            DATABASE_URL_set: !!dbUrl,
            EMAIL_HOST: emailHost,
            EMAIL_USER: emailUser,
            EMAIL_PASS_set: !!emailPass,
            secrets_match: authSecret === nextAuthSecret,
        },
        hash_test: {
            with_AUTH_SECRET: hashWithAuth,
            with_NEXTAUTH_SECRET: hashWithNextAuth,
            hashes_match: hashWithAuth === hashWithNextAuth,
        },
        node_env: process.env.NODE_ENV,
    });
}
