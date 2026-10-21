import { S3Client } from "@aws-sdk/client-s3";
import { requiredEnv } from "./api";

let cachedClient: S3Client | null = null;

export function s3Client(): S3Client {
  if (cachedClient) return cachedClient;
  const region = requiredEnv("AWS_REGION");
  const accessKeyId = requiredEnv("AWS_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("AWS_SECRET_ACCESS_KEY");
  const endpoint = process.env.S3_ENDPOINT?.trim();

  cachedClient = new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
      ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {}),
    },
    ...(endpoint ? { endpoint, forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true" } : {}),
  });
  return cachedClient;
}

export function bucket(): string { return requiredEnv("S3_BUCKET"); }

export function prefix(): string {
  const raw = process.env.S3_PREFIX || "integration-lab/";
  // Protect against an overly permissive prefix configuration.
  const clean = raw.replace(/^\/+/, "").replace(/\\/g, "/");
  return clean.endsWith("/") ? clean : `${clean}/`;
}

export function friendlyFilename(filename: string): string {
  return filename.replace(/^.*[\\/]/, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 100) || "upload";
}
