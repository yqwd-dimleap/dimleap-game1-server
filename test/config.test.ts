import { describe, expect, it } from "vitest";
import { GameConfig } from "../src/config/game.js";

describe("GameConfig", () => {
  const config = new GameConfig();

  it("maps rank boundaries to the expected AI difficulty", () => {
    expect(config.rankForStars(0).id).toBe(1);
    expect(config.rankForStars(2).id).toBe(1);
    expect(config.rankForStars(3).id).toBe(2);
    expect(config.rankForStars(9).id).toBe(4);
    expect(config.difficultyForStars(0).enemyHeroLevel).toBe(1);
    expect(config.difficultyForStars(159).difficultyId).toBe(25);
  });

  it("has valid references for every rank and enemy level", () => {
    for (const rank of config.ranks) {
      expect(config.difficulties[rank.ai_difficulty_id]).toBeDefined();
    }
    for (const difficulty of Object.values(config.difficulties)) {
      expect(config.levels[difficulty.enemy_hero_level]).toBeDefined();
    }
  });

  it("opens exactly the four configured starter heroes", () => {
    const unlocked = Object.values(config.heroes)
      .filter((hero) => hero.initially_unlocked === 1)
      .map((hero) => hero.key);
    expect(unlocked).toEqual(["swordsman", "archer", "cavalry", "shield"]);
  });

  it("uses the confirmed battle rewards", () => {
    expect(config.rules.battle.win).toEqual({ coins: 200, stars: 1, merit: 10 });
    expect(config.rules.battle.loss).toEqual({ coins: 100, stars: -1, merit: 0 });
  });
});
