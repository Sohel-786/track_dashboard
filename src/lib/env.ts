/**
 * Centralized environment access for TrackDash.
 * Keep secrets server-only — never prefix with NEXT_PUBLIC_.
 */

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvError";
  }
}

const AUTH_SECRET_MIN_LENGTH = 16;

function missingEnvHint(name: string): string {
  return (
    `${name} is not configured. ` +
    `For local: set it in .env.local (see .env.example). ` +
    `For Vercel: Project Settings → Environment Variables → add ${name} for Production, Preview, and Development, then Redeploy.`
  );
}

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < AUTH_SECRET_MIN_LENGTH) {
    throw new EnvError(
      secret
        ? `AUTH_SECRET must be at least ${AUTH_SECRET_MIN_LENGTH} characters. ${missingEnvHint("AUTH_SECRET")}`
        : missingEnvHint("AUTH_SECRET")
    );
  }
  return secret;
}

export function getMongoUri(): string {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new EnvError(missingEnvHint("MONGODB_URI"));
  }
  return uri;
}

/** Returns a list of missing/invalid required env vars (empty if OK). */
export function getEnvValidationErrors(): string[] {
  const errors: string[] = [];
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    errors.push("AUTH_SECRET is missing");
  } else if (secret.length < AUTH_SECRET_MIN_LENGTH) {
    errors.push(`AUTH_SECRET must be at least ${AUTH_SECRET_MIN_LENGTH} characters`);
  }
  if (!process.env.MONGODB_URI?.trim()) {
    errors.push("MONGODB_URI is missing");
  }
  return errors;
}

/**
 * Fail fast on Vercel builds when required secrets are absent.
 * Set SKIP_ENV_VALIDATION=1 to bypass (not recommended).
 */
export function assertRequiredEnvForBuild(): void {
  if (process.env.SKIP_ENV_VALIDATION === "1") return;

  const errors = getEnvValidationErrors();
  if (errors.length === 0) return;

  const message =
    `[TrackDash] Missing required environment variables:\n` +
    errors.map((e) => `  - ${e}`).join("\n") +
    `\n\nAdd them in Vercel → Settings → Environment Variables ` +
    `(Production + Preview), then redeploy.\n` +
    `Locally, copy .env.example to .env.local and fill in the values.`;

  // Hard-fail only on Vercel so a broken login is never shipped.
  if (process.env.VERCEL === "1") {
    throw new Error(message);
  }

  if (process.env.NODE_ENV === "production") {
    console.warn(message);
  }
}
