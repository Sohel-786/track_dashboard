import dns from "dns";

let patched = false;

/**
 * Local DNS stubs (common on Windows: 127.0.0.1 / router IPv6 link-local)
 * often break `mongodb+srv` SRV lookups in Node (`querySrv ECONNREFUSED`).
 */
export function ensureMongoDns() {
  if (patched) return;
  patched = true;

  try {
    dns.setDefaultResultOrder("ipv4first");
  } catch {
    /* older Node */
  }

  const current = dns.getServers();
  const stubby = current.some(
    (s) =>
      s === "127.0.0.1" ||
      s === "::1" ||
      s.toLowerCase().startsWith("fe80:")
  );
  if (!stubby) return;

  const publicResolvers = ["8.8.8.8", "1.1.1.1"];
  const rest = current.filter((s) => !publicResolvers.includes(s));
  dns.setServers([...publicResolvers, ...rest]);
}

type SrvTarget = { name: string; port: number; priority: number; weight: number };

async function resolveSrvOverHttps(serviceHost: string): Promise<SrvTarget[]> {
  const name = `_mongodb._tcp.${serviceHost}`;
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=SRV`;
  const res = await fetch(url, {
    headers: { Accept: "application/dns-json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`DNS-over-HTTPS SRV lookup failed (${res.status})`);
  }
  const data = (await res.json()) as {
    Answer?: Array<{ data: string }>;
  };
  const answers = data.Answer ?? [];
  if (answers.length === 0) {
    throw new Error(`No SRV records for ${name}`);
  }

  return answers.map((a) => {
    const parts = a.data.trim().split(/\s+/);
    // priority weight port target
    const priority = Number(parts[0] ?? 0);
    const weight = Number(parts[1] ?? 0);
    const port = Number(parts[2] ?? 27017);
    const target = (parts[3] ?? "").replace(/\.$/, "");
    return { name: target, port, priority, weight };
  });
}

async function resolveTxtOverHttps(host: string): Promise<string> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=TXT`;
  const res = await fetch(url, {
    headers: { Accept: "application/dns-json" },
    cache: "no-store",
  });
  if (!res.ok) return "authSource=admin";
  const data = (await res.json()) as { Answer?: Array<{ data: string }> };
  const raw = data.Answer?.[0]?.data ?? "";
  return raw.replace(/^"|"$/g, "") || "authSource=admin";
}

/**
 * Convert mongodb+srv:// URI to a standard mongodb:// URI using DNS-over-HTTPS.
 * Used when the OS/local resolver refuses SRV queries (querySrv ECONNREFUSED).
 */
export async function toStandardMongoUri(srvUri: string): Promise<string> {
  if (!srvUri.startsWith("mongodb+srv://")) return srvUri;

  const parsed = new URL(srvUri.replace("mongodb+srv://", "https://"));
  const host = parsed.hostname;
  const dbName = parsed.pathname.replace(/^\//, "") || "";
  const userInfo = parsed.username
    ? `${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}@`
    : "";

  const [srvRecords, txt] = await Promise.all([
    resolveSrvOverHttps(host),
    resolveTxtOverHttps(host),
  ]);

  const hosts = srvRecords
    .sort((a, b) => a.priority - b.priority || b.weight - a.weight)
    .map((r) => `${r.name}:${r.port}`)
    .join(",");

  const params = new URLSearchParams(txt.replace(/&/g, "&"));
  // Preserve useful query params from the original URI.
  parsed.searchParams.forEach((value, key) => {
    if (!params.has(key)) params.set(key, value);
  });
  params.set("ssl", "true");

  const path = dbName ? `/${dbName}` : "/";
  return `mongodb://${userInfo}${hosts}${path}?${params.toString()}`;
}

export function isSrvDnsError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const err = error as NodeJS.ErrnoException;
  return /querySrv/i.test(error.message) || err.syscall === "querySrv";
}
