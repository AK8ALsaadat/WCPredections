const base = process.env.BASE_URL ?? "http://localhost:3000";

async function req(path, opts = {}) {
  const res = await fetch(base + path, opts);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, headers: res.headers };
}

function getCookie(headers) {
  const set = headers.getSetCookie?.() || [];
  return set.map((c) => c.split(";")[0]).join("; ");
}

const results = [];

function pass(name) {
  results.push({ name, ok: true });
  console.log(`✓ ${name}`);
}

function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.log(`✗ ${name}: ${detail}`);
}

(async () => {
  const health = await req("/api/health");
  if (health.data.success) pass("health");
  else fail("health", JSON.stringify(health.data));

  const user = `qa_${Date.now()}`;
  const reg = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user, password: "testpass123" }),
  });
  const regData = await reg.json();
  const cookie = getCookie(reg.headers);
  if (regData.success && regData.data?.showBoldFiveNotice === true) {
    pass("register + first bold-five notice");
  }
  else fail("register", regData.error);

  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user, password: "testpass123" }),
  });
  const loginData = await login.json();
  if (loginData.success && loginData.data?.showBoldFiveNotice === false) {
    pass("bold-five notice only once");
  } else {
    fail("bold-five notice only once", JSON.stringify(loginData));
  }

  const me = await fetch(`${base}/api/auth/me`, {
    headers: { Cookie: cookie },
  });
  if ((await me.json()).success) pass("auth/me");
  else fail("auth/me", "not authenticated");

  const matchesRes = await fetch(
    `${base}/api/matches?schedule=true&paginated=true&page=1`,
    { headers: { Cookie: cookie } }
  );
  const matchesData = await matchesRes.json();
  const openMatch = matchesData.data?.matches?.[0];
  if (matchesData.success && openMatch) {
    pass(`matches page 1 (${matchesData.data.pageKind}, ${matchesData.data.matches.length} items)`);
  } else {
    fail("matches", matchesData.error ?? "no open matches");
  }

  if (openMatch) {
    const pred = await fetch(`${base}/api/predictions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        matchId: openMatch.id,
        predHome: 0,
        predAway: 0,
        isDouble: false,
        predictedFinishType: null,
        predictedPenaltyWinnerTeamId: null,
        picks: [],
        boldPlayerId: null,
      }),
    });
    const predData = await pred.json();
    if (predData.success) pass("save prediction");
    else fail("save prediction", predData.error);

    const verify = await fetch(
      `${base}/api/matches/${openMatch.id}?predict=true`,
      { headers: { Cookie: cookie } }
    );
    const verifyData = await verify.json();
    const saved = verifyData.data?.userPrediction;
    if (saved?.predHome === 0 && saved?.predAway === 0) pass("verify prediction");
    else fail("verify prediction", JSON.stringify(saved));
  }

  const lb = await fetch(`${base}/api/leaderboard/overall`, {
    headers: { Cookie: cookie },
  });
  if ((await lb.json()).success) pass("leaderboard");
  else fail("leaderboard", "failed");

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length > 0 ? 1 : 0);
})();
