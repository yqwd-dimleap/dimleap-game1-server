const baseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:3000/api/v1";
const devId = `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let token = "";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json();
  return { status: response.status, body };
}

console.log("1. dev login");
const login = await request("/auth/login", {
  method: "POST",
  body: JSON.stringify({ provider: "dev", devId }),
});
assert(login.status === 200 && login.body.data?.token, `login failed: ${JSON.stringify(login.body)}`);
token = login.body.data.token;
const playerId = login.body.data.playerId;
assert(/^[1-9]\d{5,7}$/.test(playerId), `playerId must be 6-8 digits: ${playerId}`);

const secondLogin = await request("/auth/login", {
  method: "POST",
  body: JSON.stringify({ provider: "dev", devId }),
});
assert(secondLogin.body.data.playerId === playerId && secondLogin.body.data.created === false, "dev login is not stable");

console.log("2. bootstrap and profile");
let bootstrap = await request("/player/bootstrap");
assert(bootstrap.status === 200, "bootstrap failed");
assert(bootstrap.body.data.player.coins === 2000 && bootstrap.body.data.player.netStars === 0, "unexpected defaults");
assert(Object.values(bootstrap.body.data.heroes).filter((hero) => hero.unlocked).length === 4, "starter unlock count");
const patch = await request("/player/profile", {
  method: "PATCH",
  body: JSON.stringify({ nickname: "联调玩家", avatarId: 4 }),
});
assert(
  patch.status === 200 &&
  patch.body.data.player.nickname === "联调玩家",
  "profile update failed",
);
const duplicateName = await request("/player/profile", {
  method: "PATCH",
  body: JSON.stringify({ nickname: "联调玩家" }),
});
assert(duplicateName.status === 200 && duplicateName.body.data.player.nickname === "联调玩家", "duplicate nicknames should be allowed");

console.log("3. server-selected battle difficulty");
const wrongVersion = await request("/battles/start", {
  method: "POST",
  body: JSON.stringify({ configVersion: "stale" }),
});
assert(wrongVersion.status === 409, "stale config version should be rejected");
const start = await request("/battles/start", {
  method: "POST",
  body: JSON.stringify({ configVersion: bootstrap.body.data.configVersion }),
});
assert(start.status === 200, `battle start failed: ${JSON.stringify(start.body)}`);
assert(start.body.data.difficulty.enemyHeroLevel === 1, "difficulty did not resolve from 0 stars");
assert(/^map_[1-5]_[1-5]$/.test(start.body.data.map.mapId), "invalid server map");

console.log("4. settle once and verify idempotency");
await new Promise((resolve) => setTimeout(resolve, 10_250));
const finishBody = JSON.stringify({ ticket: start.body.data.ticket, result: "win" });
const finish = await request("/battles/finish", { method: "POST", body: finishBody });
assert(finish.status === 200, `finish failed: ${JSON.stringify(finish.body)}`);
assert(finish.body.data.player.coins === 2200, "win coin reward");
assert(finish.body.data.player.netStars === 1, "win star reward");
assert(finish.body.data.player.merit === 10, "win merit reward");
const duplicate = await request("/battles/finish", { method: "POST", body: finishBody });
assert(duplicate.body.data.duplicate === true && duplicate.body.data.player.coins === 2200, "duplicate reward");

console.log("5. merit claim and upgrade");
const claim = await request("/season/rewards/claim", {
  method: "POST",
  body: JSON.stringify({ rewardId: 1 }),
});
assert(claim.status === 200, `claim failed: ${JSON.stringify(claim.body)}`);
const duplicateClaim = await request("/season/rewards/claim", {
  method: "POST",
  body: JSON.stringify({ rewardId: 1 }),
});
assert(duplicateClaim.status === 409, "duplicate claim should fail");
const upgrade = await request("/heroes/upgrade", {
  method: "POST",
  body: JSON.stringify({ heroKey: "swordsman" }),
});
assert(upgrade.status === 200, `upgrade failed: ${JSON.stringify(upgrade.body)}`);
assert(upgrade.body.data.coins === 2200, "upgrade coin cost");
assert(upgrade.body.data.hero.level === 2 && upgrade.body.data.hero.shards === 3, "upgrade result");

console.log("6. lineup validation and leaderboard");
const invalidLineup = await request("/player/lineup", {
  method: "PUT",
  body: JSON.stringify({ lineup: ["guanyu", null, null, null, null] }),
});
assert(invalidLineup.status === 400, "locked hero lineup should fail");
const leaderboard = await request("/leaderboard");
assert(leaderboard.status === 200 && leaderboard.body.data.entries.length === 100, "leaderboard size");
assert(leaderboard.body.data.self?.isSelf === true, "self rank missing");
bootstrap = await request("/player/bootstrap");
assert(bootstrap.body.data.player.coins === 2200, "bootstrap did not persist currency");

console.log(JSON.stringify({
  ok: true,
  playerId,
  netStars: bootstrap.body.data.player.netStars,
  merit: bootstrap.body.data.player.merit,
  coins: bootstrap.body.data.player.coins,
  ownRank: leaderboard.body.data.ownRank,
}, null, 2));
