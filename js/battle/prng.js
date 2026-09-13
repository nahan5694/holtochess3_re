/**
 * Seed-based Pseudo Random Number Generator (Mulberry32)
 * Ensures deterministic battle replayability given the same seed and inputs.
 */
export class BattleRNG {
  constructor(seed = Date.now()) {
    this.initialSeed = seed;
    this.state = this._hashSeed(seed);
  }

  _hashSeed(seed) {
    if (typeof seed === 'number') {
      return (seed >>> 0) || 1;
    }
    const str = String(seed);
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return (h >>> 0) || 1;
  }

  /**
   * Returns a float in [0, 1)
   */
  next() {
    let z = (this.state += 0x6D2B79F5);
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns an integer in [min, max]
   */
  nextInt(min, max) {
    if (min >= max) return min;
    const r = this.next();
    return Math.floor(r * (max - min + 1)) + min;
  }

  /**
   * Probability check: 0.0 ~ 1.0 (or percentage 0~100)
   */
  chance(prob, isPercentage = false) {
    const threshold = isPercentage ? prob / 100 : prob;
    return this.next() < threshold;
  }

  getState() {
    return this.state;
  }

  setState(state) {
    this.state = state >>> 0;
  }

  clone() {
    const copy = new BattleRNG(this.initialSeed);
    copy.setState(this.state);
    return copy;
  }
}
