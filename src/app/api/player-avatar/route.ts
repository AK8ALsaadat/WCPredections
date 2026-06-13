function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1
    ? `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`
    : parts[0]?.slice(0, 2) ?? "?").toUpperCase();
}

export async function GET(request: Request) {
  const name =
    new URL(request.url).searchParams.get("name")?.slice(0, 80) ?? "Player";
  const label = escapeXml(initials(name));
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#34d399"/>
          <stop offset="1" stop-color="#047857"/>
        </linearGradient>
      </defs>
      <rect width="96" height="96" rx="48" fill="url(#bg)"/>
      <circle cx="48" cy="35" r="18" fill="#d1fae5" fill-opacity=".92"/>
      <path d="M16 89c3-22 15-34 32-34s29 12 32 34" fill="#d1fae5" fill-opacity=".92"/>
      <circle cx="48" cy="48" r="45" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>
      <text x="48" y="90" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="#064e3b">${label}</text>
    </svg>
  `;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
