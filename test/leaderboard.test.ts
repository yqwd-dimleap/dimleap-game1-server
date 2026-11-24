import { describe, expect, it } from "vitest";
import { mergeLeaderboard } from "../src/services/leaderboard.js";

describe("mergeLeaderboard", () => {
  it("places real players before bots on a score tie", () => {
    const entries = mergeLeaderboard(
      [{ playerId: "1000001", nickname: "真人", avatarId: 2, netStars: 10 }],
      [
        { botId: "bot_1", nickname: "机器人甲", avatarId: 3, netStars: 10 },
        { botId: "bot_2", nickname: "机器人乙", avatarId: 4, netStars: 5 },
      ],
      "1000001",
      3,
    );
    expect(entries[0]?.playerId).toBe("1000001");
    expect(entries[0]?.rank).toBe(1);
    expect(entries[0]?.isSelf).toBe(true);
  });

  it("lets a real player replace a lower bot", () => {
    const entries = mergeLeaderboard(
      [{ playerId: "1000001", nickname: "真人", avatarId: 2, netStars: 7 }],
      [
        { botId: "bot_1", nickname: "机器人甲", avatarId: 3, netStars: 10 },
        { botId: "bot_2", nickname: "机器人乙", avatarId: 4, netStars: 5 },
      ],
      "1000001",
      2,
    );
    expect(entries.map((entry) => entry.playerId)).toEqual(["bot_1", "1000001"]);
    expect(entries.some((entry) => entry.playerId === "bot_2")).toBe(false);
  });

  it("allows duplicate nicknames and identifies self by public ID", () => {
    const entries = mergeLeaderboard(
      [
        { playerId: "1000001", nickname: "同名玩家", avatarId: 2, netStars: 8 },
        { playerId: "1000002", nickname: "同名玩家", avatarId: 3, netStars: 8 },
      ],
      [],
      "1000002",
      2,
    );
    expect(entries.map((entry) => entry.nickname)).toEqual(["同名玩家", "同名玩家"]);
    expect(entries.find((entry) => entry.isSelf)?.playerId).toBe("1000002");
  });
});
