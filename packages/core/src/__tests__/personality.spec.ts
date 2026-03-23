import { describe, expect, it } from "vitest";
import type { EntityState } from "../world/brains/optimizer/entity.js";
import {
  DEFAULT_PERSONALITY,
  PersonalityObjective,
  randomPersonality,
} from "../world/brains/optimizer/PersonalityObjective.js";

describe("PersonalityObjective", () => {
  const makeState = (overrides: Partial<EntityState> = {}): EntityState => ({
    qiCurrent: 500,
    qiMax: 1000,
    mood: 0.5,
    avgRelation: 0,
    ...overrides,
  });

  it("severely penalizes death (qiCurrent <= 0)", () => {
    const obj = new PersonalityObjective(DEFAULT_PERSONALITY);
    const deadState = makeState({ qiCurrent: 0 });
    expect(obj.evaluate(deadState)).toBeLessThan(-1000);
  });

  it("high greed personality values survival (qi ratio) more", () => {
    const greedy = new PersonalityObjective({ ...DEFAULT_PERSONALITY, greed: 1.0 });
    const modest = new PersonalityObjective({ ...DEFAULT_PERSONALITY, greed: 0.0 });

    const highQi = makeState({ qiCurrent: 900, qiMax: 1000 });
    const lowQi = makeState({ qiCurrent: 100, qiMax: 1000 });

    // Greedy should have bigger gap between high and low qi
    const greedyGap = greedy.evaluate(highQi) - greedy.evaluate(lowQi);
    const modestGap = modest.evaluate(highQi) - modest.evaluate(lowQi);
    expect(greedyGap).toBeGreaterThan(modestGap);
  });

  it("high sociability personality values mood more", () => {
    const social = new PersonalityObjective({ ...DEFAULT_PERSONALITY, sociability: 1.0 });
    const loner = new PersonalityObjective({ ...DEFAULT_PERSONALITY, sociability: 0.0 });

    const happyState = makeState({ mood: 1.0 });
    const sadState = makeState({ mood: 0.0 });

    const socialGap = social.evaluate(happyState) - social.evaluate(sadState);
    const lonerGap = loner.evaluate(happyState) - loner.evaluate(sadState);
    expect(socialGap).toBeGreaterThan(lonerGap);
  });

  it("high ambition personality values qiMax growth more", () => {
    const ambitious = new PersonalityObjective({ ...DEFAULT_PERSONALITY, ambition: 1.0 });
    const passive = new PersonalityObjective({ ...DEFAULT_PERSONALITY, ambition: 0.0 });

    const bigCapacity = makeState({ qiCurrent: 500, qiMax: 10000 });
    const smallCapacity = makeState({ qiCurrent: 500, qiMax: 100 });

    const ambitiousGap = ambitious.evaluate(bigCapacity) - ambitious.evaluate(smallCapacity);
    const passiveGap = passive.evaluate(bigCapacity) - passive.evaluate(smallCapacity);
    expect(ambitiousGap).toBeGreaterThan(passiveGap);
  });

  it("default personality produces positive score for a normal state", () => {
    const obj = new PersonalityObjective(DEFAULT_PERSONALITY);
    const normalState = makeState();
    expect(obj.evaluate(normalState)).toBeGreaterThan(0);
  });
});

describe("randomPersonality", () => {
  it("generates values in [0,1] range", () => {
    for (let i = 0; i < 100; i++) {
      const p = randomPersonality("human");
      expect(p.aggression).toBeGreaterThanOrEqual(0);
      expect(p.aggression).toBeLessThanOrEqual(1);
      expect(p.ambition).toBeGreaterThanOrEqual(0);
      expect(p.ambition).toBeLessThanOrEqual(1);
      expect(p.sociability).toBeGreaterThanOrEqual(0);
      expect(p.sociability).toBeLessThanOrEqual(1);
      expect(p.greed).toBeGreaterThanOrEqual(0);
      expect(p.greed).toBeLessThanOrEqual(1);
    }
  });

  it("beast species tends toward higher aggression", () => {
    let totalAggression = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      totalAggression += randomPersonality("beast").aggression;
    }
    expect(totalAggression / N).toBeGreaterThan(0.5);
  });

  it("plant species tends toward lower aggression", () => {
    let totalAggression = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      totalAggression += randomPersonality("plant").aggression;
    }
    expect(totalAggression / N).toBeLessThan(0.3);
  });
});
