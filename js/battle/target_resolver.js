/**
 * Target Resolver
 * Handles Manual/Auto targets, Aggro Roulette, Distinct vs Random picks, and Splash/All ranges.
 */

import { RangeType } from './battle_types.js';

/**
 * Calculates effective aggro for roulette.
 * Living characters guarantee at least 1 aggro. Dead characters have 0.
 */
export function getEffectiveAggro(character) {
  if (!character || character.isDead || character.hp <= 0) return 0;
  let baseAggro = Math.max(1, Number(character.aggro) || 1);

  if (Array.isArray(character.statusSlots)) {
    for (const slot of character.statusSlots) {
      const raw = slot.rawKeyword || {};
      const mult = slot.isPower ? slot.stack : 1;
      let handledMultiplier = false;
      let handledAggroStat = false;

      for (let i = 1; i <= 5; i++) {
        const t = raw[`Keyword_Stat_Target_${i}`];
        const v = raw[`Keyword_Stat_Value_${i}`];
        if (!t || v === undefined || v === '') continue;
        const num = Number(v);
        if (isNaN(num)) continue;

        if (t === '어그로') {
          baseAggro = Math.max(1, baseAggro + num * mult);
          handledAggroStat = true;
        } else if (t === '어그로배율%') {
          baseAggro = Math.max(1, Math.round(baseAggro * (1 + (num * mult) / 100)));
          handledMultiplier = true;
        }
      }

      // Rule: 은신은 스택당 어그로 -10 (Key_021)
      if (!handledAggroStat && (slot.keywordId === 'Key_021' || slot.name === '은신' || raw.Keyword_Name === '은신')) {
        baseAggro = Math.max(1, baseAggro - 10 * (slot.stack || 1));
      }

      // Rule: 도발은 어그로를 2배로 적용 (Key_022)
      if (!handledMultiplier && (slot.keywordId === 'Key_022' || slot.name === '도발' || raw.Keyword_Name === '도발')) {
        baseAggro *= 2;
      }
    }
  }

  return Math.max(1, baseAggro);
}

/**
 * Executes an Aggro Roulette draw from a pool of candidates.
 */
export function selectByAggroRoulette(candidates, rng) {
  const valid = candidates.filter(c => !c.isDead && c.hp > 0);
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];

  const totalAggro = valid.reduce((sum, c) => sum + getEffectiveAggro(c), 0);
  if (totalAggro <= 0) return valid[0];

  let pickVal = rng ? rng.next() * totalAggro : Math.random() * totalAggro;

  for (const c of valid) {
    pickVal -= getEffectiveAggro(c);
    if (pickVal <= 0) {
      return c;
    }
  }
  return valid[valid.length - 1];
}

/**
 * Resolves targets based on Target Method, Count, Range, and Selection options.
 * 
 * @param {Object} options
 * @param {Array} options.candidatePool - Array of CharacterBattleState (e.g. enemy or ally living characters)
 * @param {string} options.targetMethod - 'MANUAL' | 'AUTO'
 * @param {CharacterBattleState} [options.manualTarget] - Chosen manual target if applicable
 * @param {number} [options.targetCount=1] - Number of targets (or attacks)
 * @param {boolean} [options.isRandomRepeat=false] - true for Random N times (duplicates allowed), false for Distinct N
 * @param {string} [options.range=RangeType.SINGLE] - SINGLE, SPLASH_1, SPLASH_2, ALL
 * @param {BattleRNG} options.rng - RNG instance
 * @returns {Array<CharacterBattleState>} Array of selected target characters
 */
export function resolveTargets({
  candidatePool = [],
  targetMethod = 'AUTO',
  manualTarget = null,
  targetCount = 1,
  isRandomRepeat = false,
  range = RangeType.SINGLE,
  rng = null
}) {
  const aliveCandidates = candidatePool.filter(c => !c.isDead && c.hp > 0);
  if (aliveCandidates.length === 0) return [];

  // Range ALL returns all living candidates directly
  if (range === RangeType.ALL || range === 'ALL' || range === 'SPLASH_7') {
    return aliveCandidates;
  }

  // 1. Determine primary target(s)
  let primaryTarget = null;
  const resolvedManual = (typeof manualTarget === 'string')
    ? aliveCandidates.find(c => c.characterId === manualTarget)
    : manualTarget;

  if (targetMethod === 'MANUAL' && resolvedManual && !resolvedManual.isDead && resolvedManual.hp > 0) {
    primaryTarget = resolvedManual;
  } else {
    primaryTarget = selectByAggroRoulette(aliveCandidates, rng);
  }

  if (!primaryTarget) return [];

  // 2. Handle Splash Range around primary target
  const isSplash = (range === RangeType.SPLASH_1 || range === RangeType.SPLASH_2 || range === 'SPLASH_3' || range === 'SPLASH_5' || range === 'SPLASH' || range === 'SPLASH_7');
  if (isSplash) {
    let splashRadius = 1;
    if (range === RangeType.SPLASH_2 || range === 'SPLASH_5') {
      splashRadius = 2;
    } else if (range === 'SPLASH_7') {
      splashRadius = 3;
    }
    const centerPos = Number(primaryTarget.formationPosition) || 1;

    // Linear distance: strictly 1 <-> 2 <-> 3 <-> 4 <-> 5 <-> 6 <-> 7 <-> 8
    // Pos 1 never wraps to 8, pos 8 never wraps to 1
    const minPos = Math.max(1, centerPos - splashRadius);
    const maxPos = Math.min(8, centerPos + splashRadius);

    const splashTargets = aliveCandidates.filter(c => {
      const pos = Number(c.formationPosition) || 1;
      return pos >= minPos && pos <= maxPos;
    });

    // Sort: center target first, then closest neighbors
    splashTargets.sort((a, b) => {
      const diffA = Math.abs((Number(a.formationPosition) || 1) - centerPos);
      const diffB = Math.abs((Number(b.formationPosition) || 1) - centerPos);
      return diffA - diffB;
    });
    return splashTargets;
  }

  // 3. Target counts & Random N repetitions
  let effectiveCount = Math.max(1, Number(targetCount) || 1);
  let effectiveRandomRepeat = isRandomRepeat;

  if (typeof range === 'string' && range.startsWith('RANDOM_')) {
    const parsedNum = parseInt(range.replace('RANDOM_', ''), 10);
    if (!isNaN(parsedNum) && parsedNum > 0) {
      effectiveCount = parsedNum;
      effectiveRandomRepeat = isRandomRepeat; // Distinct N targets by default
    }
  } else if (range === '무작위') {
    effectiveRandomRepeat = isRandomRepeat;
  }

  if (effectiveCount === 1 && !effectiveRandomRepeat) {
    return [primaryTarget];
  }

  if (effectiveRandomRepeat) {
    // Random N repetitions: each draw is independent, duplicates permitted
    const result = [primaryTarget];
    for (let i = 1; i < effectiveCount; i++) {
      const pick = selectByAggroRoulette(aliveCandidates, rng);
      if (pick) result.push(pick);
    }
    return result;
  }

  // Distinct N: cannot select same character twice
  const result = [primaryTarget];
  const remaining = aliveCandidates.filter(c => c !== primaryTarget);

  while (result.length < effectiveCount && remaining.length > 0) {
    const nextPick = selectByAggroRoulette(remaining, rng);
    if (!nextPick) break;
    result.push(nextPick);
    const idx = remaining.indexOf(nextPick);
    if (idx !== -1) remaining.splice(idx, 1);
  }

  return result;
}
