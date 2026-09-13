/**
 * Damage Resolver
 * Computes Physical and Magic damage, accuracy/evasion, criticals, DEF/MDEF mitigation,
 * shields, breaking, and death checks according to rules 31~48.
 */

import { DamageType, CharacterRole } from './battle_types.js';
import { applyHealing, handleStatusRemoved } from './status_resolver.js';

/**
 * 속성 상성 관계표 (Rule: 청초 > 게닌 > 쿨 > 아티스트 > 큐트 > 청초, 광기 ↔ 에로)
 */
export const TYPE_ADVANTAGE_MAP = Object.freeze({
  '청초': ['게닌'],
  '게닌': ['쿨'],
  '쿨': ['아티스트'],
  '아티스트': ['큐트'],
  '큐트': ['청초'],
  '광기': ['에로'],
  '에로': ['광기']
});

/**
 * Checks type advantage (상성 우위).
 * Returns true if attacker's characterType has advantage over target's characterType.
 */
export function hasTypeAdvantage(attacker, target) {
  if (!attacker || !target) return false;
  if (attacker.hasAdvantage) return true;

  const aType = attacker.characterType || (attacker.raw && (attacker.raw.Character_Type || attacker.raw.속성)) || attacker.type;
  const tType = target.characterType || (target.raw && (target.raw.Character_Type || target.raw.속성)) || target.type;

  if (!aType || !tType) return false;
  const targetWeaknesses = TYPE_ADVANTAGE_MAP[aType];
  return Boolean(targetWeaknesses && targetWeaknesses.includes(tType));
}

/**
 * Extracts combat stat modifiers from a character's redSuperchat blessing and status slots.
 * Supports multi-effect columns (Keyword_Stat_Target_1 ~ 5).
 */
export function extractCharacterCombatModifiers(character, options = {}) {
  const mods = {
    atkPercent: 0,
    idolPercent: 0,
    defDelta: 0,
    mdefDelta: 0,
    critBonus: 0,
    critDmgBonus: 0,
    accuracyBonus: 0,
    evasionBonus: 0,
    damageDealtPercent: 0,
    damageTakenPercent: 0,
    magicDamageTakenPercent: 0,
    critTakenBonus: 0,
    ultDamageDealtPercent: 0,
    ultDamageTakenPercent: 0,
    magicBreakBonus: 0,
    resistanceBonus: 0
  };

  if (!character) return mods;

  // 1. Red Superchat innate blessing
  if (character.redSuperchat) {
    const red = character.redSuperchat;
    mods.atkPercent += (red.atkPct || 0);
    mods.idolPercent += (red.idolPct || 0);
    mods.defDelta += (red.def || 0);
    mods.mdefDelta += (red.mdef || 0);
    mods.accuracyBonus += (red.accuracyPct || 0);
    mods.critBonus += (red.critChance || 0);
  }

  // 2. Status slots (multi-target columns 1~5 on this character)
  if (Array.isArray(character.statusSlots)) {
    for (const slot of character.statusSlots) {
      const raw = slot.rawKeyword || {};
      const mult = slot.isPower ? slot.stack : 1;

      // Find required stack if conditional (e.g. 조건_요구스택 = 10)
      let reqStack = 10;
      for (let i = 1; i <= 5; i++) {
        const t = raw[`Keyword_Stat_Target_${i}`];
        const v = raw[`Keyword_Stat_Value_${i}`];
        if (t === '조건_요구스택' && v !== undefined && v !== '') {
          reqStack = Number(v) || 10;
        }
      }

      // Keyword_Treat_As: 파괴 10스택 판정에 출혈 스택 합산, 원소 10스택 판정에 빙결/젖음/흑마법 스택 합산, 기타 Keyword_Treat_As 합산
      let effectiveStack = slot.stack;
      if (slot.keywordId === 'Key_002' || slot.name === '파괴') {
        for (const s of character.statusSlots) {
          if (s !== slot && (s.keywordId === 'Key_001' || s.name === '출혈' || s.rawKeyword?.Keyword_Treat_As === 'Key_002')) {
            effectiveStack += s.stack;
          }
        }
      } else if (slot.keywordId === 'Key_004' || slot.name === '원소') {
        const extraKeywords = ['Key_009', 'Key_010', 'Key_011'];
        for (const s of character.statusSlots) {
          if (s !== slot && (extraKeywords.includes(s.keywordId) || ['빙결', '젖음', '흑마법'].includes(s.name) || s.rawKeyword?.Keyword_Treat_As === 'Key_004')) {
            effectiveStack += s.stack;
          }
        }
      } else if (slot.keywordId === 'Key_003' || slot.name === '매료') {
        for (const s of character.statusSlots) {
          if (s !== slot && s.rawKeyword?.Keyword_Treat_As === 'Key_003') {
            effectiveStack += s.stack;
          }
        }
      }

      const meetsCondition = (effectiveStack >= reqStack);

      let slotDamageTaken = null;
      let slotDamageDealt = null;
      let slotMagicDamageTaken = null;

      for (let i = 1; i <= 5; i++) {
        const targetType = raw[`Keyword_Stat_Target_${i}`];
        const rawVal = raw[`Keyword_Stat_Value_${i}`];
        if (!targetType || rawVal === undefined || rawVal === '') continue;

        const val = Number(rawVal);
        if (isNaN(val)) continue;

        switch (targetType) {
          case '공격력%':
            mods.atkPercent += val * mult;
            break;
          case '아이돌력%':
            mods.idolPercent += val * mult;
            break;
          case '방어력':
            mods.defDelta += val * mult;
            break;
          case '마법방어':
          case '마법방어력':
            mods.mdefDelta += val * mult;
            break;
          case '치명타%':
          case '치명타':
            mods.critBonus += val * mult;
            break;
          case '치명타피해량%':
            mods.critDmgBonus += (val / 100) * mult;
            break;
          case '명중률%':
          case '명중률':
            mods.accuracyBonus += val * mult;
            break;
          case '회피%':
          case '회피':
            mods.evasionBonus += val * mult;
            break;
          case '피격치명타율%':
            mods.critTakenBonus += val * mult;
            break;
          case '기본_받는피해%':
          case '받는피해%':
            if (slotDamageTaken === null) slotDamageTaken = val * mult;
            break;
          case '조건_받는피해%':
            if (meetsCondition) slotDamageTaken = val * mult;
            break;
          case '기본_받는마법피해%':
            if (slotMagicDamageTaken === null) slotMagicDamageTaken = val * mult;
            break;
          case '조건_받는마법피해%':
            if (meetsCondition) slotMagicDamageTaken = val * mult;
            break;
          case '기본_가하는피해%':
          case '가하는피해%':
          case '주는피해%':
            if (slotDamageDealt === null) slotDamageDealt = val * mult;
            break;
          case '조건_가하는피해%':
            if (meetsCondition) slotDamageDealt = val * mult;
            break;
          case '가하는궁극기피해%':
            mods.ultDamageDealtPercent += val * mult;
            break;
          case '받는궁극기피해%':
            mods.ultDamageTakenPercent += val * mult;
            break;
          case '마법_브레이킹피해':
            mods.magicBreakBonus += val * mult;
            break;
          case '저항력%':
          case '저항력':
            mods.resistanceBonus += val * mult;
            break;
        }
      }

      if (slotDamageTaken !== null) mods.damageTakenPercent += slotDamageTaken;
      if (slotMagicDamageTaken !== null) mods.magicDamageTakenPercent += slotMagicDamageTaken;
      if (slotDamageDealt !== null) mods.damageDealtPercent += slotDamageDealt;
    }
  }

  // 3. Team & Aura Synergies (Key_025 하모니, Key_058 벽아일체, Key_034 일등성, Key_047 다이스, 타로 효과)
  const teamChars = character.team?.characters || [];

  // Key_025: 하모니 (🎼) - 하모니 보유자 수 * 8% 아이돌력 증가
  const hasHarmony = Array.isArray(character.statusSlots) && character.statusSlots.some(s => s.keywordId === 'Key_025' || s.name === '하모니');
  if (hasHarmony) {
    const harmonyCount = teamChars.filter(c => !c.isDead && c.statusSlots?.some(s => s.keywordId === 'Key_025' || s.name === '하모니')).length;
    mods.idolPercent += (harmonyCount > 0 ? harmonyCount : 1) * 8;
  }

  // Key_058: 벽아일체 (🧱) - 본인이 은신 상태인 아군이 있으면 모든 아군 마방 +7
  const hasStealthedWall = teamChars.some(c => !c.isDead &&
    c.statusSlots?.some(s => s.keywordId === 'Key_058' || s.name === '벽아일체') &&
    c.statusSlots?.some(s => s.keywordId === 'Key_021' || s.name === '은신')
  );
  if (hasStealthedWall) {
    mods.mdefDelta += 7;
  }

  // Key_042: 해적출항 (⚓) - 스택당 치명타 2% 증가, 치명타 피해량 4% 증가
  const pirateSlot = Array.isArray(character.statusSlots) && character.statusSlots.find(s => s.keywordId === 'Key_042' || s.name === '해적출항');
  if (pirateSlot && pirateSlot.stack > 0) {
    const hasExplicitTargets = pirateSlot.rawKeyword && (pirateSlot.rawKeyword.Keyword_Stat_Target_1 || pirateSlot.rawKeyword.Keyword_Stat_Target_2);
    if (!hasExplicitTargets || !pirateSlot.isPower) {
      const pStack = pirateSlot.stack;
      mods.critBonus += pStack * 2;
      mods.critDmgBonus += pStack * 0.04;
    }
  }

  // Key_034: 일등성 (🌟) - 적 처치 시 33% 공격력 영구 증가 누적
  if (character.starKillCount && character.starKillCount > 0) {
    mods.atkPercent += (character.starKillCount * 33);
  }

  // Key_047: 다이스 (🎲) - 턴 시작 시 굴린 결과값 적용
  if (character.diceRoll) {
    if (character.diceRoll.isSnakeEyes) {
      mods.atkPercent += 25;
      mods.idolPercent += 25;
      mods.critBonus += 25;
      mods.evasionBonus += 25;
    } else {
      const dVal = Number(character.diceRoll.value) || 0;
      mods.atkPercent += dVal;
      mods.idolPercent += dVal;
    }
  }

  // Key_039: 점괘 타로 카드 오라 적용 (역할군별 적용)
  const activeTarot = character.team?.activeTarot || options?.activeTarot;
  if (activeTarot && activeTarot.target === 'ROLE' && activeTarot.effect) {
    const matchesRole = Boolean(
      character.mainRole === activeTarot.targetRole ||
      character.subRole === activeTarot.targetRole ||
      (Array.isArray(character.roles) && character.roles.includes(activeTarot.targetRole)) ||
      (activeTarot.roleName && String(character.raw?.Character_Role || character.role || character.mainRole || '').includes(activeTarot.roleName))
    );

    if (matchesRole) {
      if (activeTarot.effect.atkPercent) mods.atkPercent += activeTarot.effect.atkPercent;
      if (activeTarot.effect.idolPercent) mods.idolPercent += activeTarot.effect.idolPercent;
      if (activeTarot.effect.defDelta) mods.defDelta += activeTarot.effect.defDelta;
      if (activeTarot.effect.mdefDelta) mods.mdefDelta += activeTarot.effect.mdefDelta;
    }
  }

  // 4. Issue Modifiers (Dynamic stage & live challenges)
  if (character.issueMods) {
    if (typeof character.issueMods.damageDealtPercent === 'number') {
      mods.damageDealtPercent += character.issueMods.damageDealtPercent;
    }
    if (typeof character.issueMods.damageTakenPercent === 'number') {
      mods.damageTakenPercent += character.issueMods.damageTakenPercent;
    }
  }

  return mods;
}

/**
 * Resolves damage calculation and state alteration for a single hit.
 * 
 * @param {Object} params
 * @param {CharacterBattleState} params.attacker
 * @param {CharacterBattleState} params.target
 * @param {string} [params.damageType=DamageType.PHYSICAL]
 * @param {number} [params.multiplier=100] - Skill coefficient in percent
 * @param {number} [params.skillBreakBonus=0] - Additional break damage from skill
 * @param {boolean} [params.hasDealtBreakThisSkill=false] - Max 1 break damage instance per skill per target
 * @param {boolean} [params.forceAdvantage=false] - Force type advantage for test/scenario
 * @param {BattleRNG} params.rng
 * @returns {Object} DamageResult
 */
export function calculateAndApplyDamage({
  attacker,
  target,
  damageType = DamageType.PHYSICAL,
  scalingStat = 'ATK',
  multiplier = 100,
  skillBreakBonus = 0,
  hasDealtBreakThisSkill = false,
  forceAdvantage = false,
  damageModifiers = [],
  isUltimate = false,
  rng = null,
  team = null
}) {
  const result = {
    isHit: true,
    isCritical: false,
    isCrit: false,
    rawDamage: 0,
    shieldDamage: 0,
    hpDamage: 0,
    finalDamage: 0,
    isBreakOccurred: false,
    isBreakingOccurred: false,
    isKill: false
  };

  if (!attacker || !target || target.isDead || target.hp <= 0) {
    result.isHit = false;
    return result;
  }

  // 1. Accuracy vs Evasion (Rule 37)
  const attMods = extractCharacterCombatModifiers(attacker);
  const tgtMods = extractCharacterCombatModifiers(target);

  let critBonusFromAccuracy = 0;
  const effectiveAcc = Math.max(0, (attacker.accuracy || 100) + attMods.accuracyBonus);

  if (damageType === DamageType.PHYSICAL) {
    const effectiveEvasion = target.isBreaking ? 0 : Math.max(0, (target.evasion || 0) + tgtMods.evasionBonus);
    const finalAccuracy = effectiveAcc - effectiveEvasion;

    if (finalAccuracy < 100) {
      const hitCheck = rng ? rng.chance(finalAccuracy, true) : (Math.random() * 100 < finalAccuracy);
      if (!hitCheck) {
        result.isHit = false;
        result.isDodge = true;

        // 전투 도중 회피 발동 시 보유 중인 Key_032(댄싱) 턴수 -1
        if (Array.isArray(target.statusSlots)) {
          const danceSlotIndex = target.statusSlots.findIndex(s => s.keywordId === 'Key_032' || s.name === '댄싱');
          if (danceSlotIndex !== -1) {
            const danceSlot = target.statusSlots[danceSlotIndex];
            danceSlot.duration -= 1;
            result.dancingTurnReduced = true;
            result.dancingRemainingDuration = danceSlot.duration;
            if (danceSlot.duration <= 0) {
              target.statusSlots.splice(danceSlotIndex, 1);
              handleStatusRemoved(target, danceSlot, 'EXPIRED', { team, rng });
            }
          }
        }

        return result; // Miss: 0 damage, no break, debuffs chained to attack fail
      }
    } else if (finalAccuracy > 100) {
      // 50% of surplus converted to Critical Chance
      critBonusFromAccuracy = (finalAccuracy - 100) * 0.5;
    }
  } else {
    // Magic Damage is not subject to evasion (Rule 37)
    if (effectiveAcc > 100) {
      critBonusFromAccuracy = (effectiveAcc - 100) * 0.5;
    }
  }

  // 2. Base Raw Damage (Section 40, 41, 42)
  let baseStat = 0;
  if (scalingStat === 'TARGET_MAX_HP' || scalingStat === '최대체력') {
    baseStat = target.maxHp || 0;
  } else if (damageType === DamageType.MAGIC || scalingStat === 'IDOL_POWER' || scalingStat === '아이돌력') {
    baseStat = Math.max(0, (attacker.idolPower || 0) * (1 + attMods.idolPercent / 100));
  } else {
    baseStat = Math.max(0, (attacker.atk || 0) * (1 + attMods.atkPercent / 100));
  }
  let rawDamage = (baseStat * multiplier) / 100;

  // 3. Critical Calculation (Rule 36 - Applied before DEF/MDEF)
  const finalCritChance = Math.min(100, Math.max(0, (attacker.critChance || 0) + attMods.critBonus + tgtMods.critTakenBonus + critBonusFromAccuracy));
  const isCrit = rng ? rng.chance(finalCritChance, true) : (Math.random() * 100 < finalCritChance);

  if (isCrit) {
    result.isCritical = true;
    result.isCrit = true;
    const critMultiplier = (attacker.critDmg || 1.5) + attMods.critDmgBonus;
    rawDamage *= critMultiplier;
  }
  result.rawDamage = Math.round(rawDamage);

  // 4. Shield Absorption (Rule 39)
  // Shield is not affected by DEF/MDEF.
  let remainingDamage = result.rawDamage;
  let shieldDmg = 0;

  if (target.shield > 0) {
    if (target.shield >= remainingDamage) {
      shieldDmg = remainingDamage;
      target.shield -= remainingDamage;
      remainingDamage = 0;
    } else {
      shieldDmg = target.shield;
      remainingDamage -= target.shield;
      target.shield = 0;
    }
  }
  result.shieldDamage = Math.round(shieldDmg);

  // 5. DEF / MDEF Mitigation on Remaining Damage (Rule 33, 34)
  let damageAfterDefense = remainingDamage;

  if (remainingDamage > 0) {
    if (target.isBreaking) {
      // Breaking: DEF/MDEF effects nullified (Rule 45)
      damageAfterDefense = remainingDamage;
    } else {
      const baseDef = damageType === DamageType.PHYSICAL
        ? (target.def || 0) + tgtMods.defDelta
        : (target.mdef || 0) + tgtMods.mdefDelta;
      const defStat = Math.max(0, baseDef);
      damageAfterDefense = (remainingDamage * 100) / (100 + defStat);
    }
  }

  // 6. Damage Modifiers (Section 46, 56)
  // Categories are multiplied sequentially; modifiers within the same category are added.
  const categories = {};
  if (target.isBreaking) {
    categories['BREAKING'] = 0.5; // +50% damage received during Breaking
  }
  const isAdvantaged = forceAdvantage || hasTypeAdvantage(attacker, target);
  if (isAdvantaged) {
    categories['TYPE_ADVANTAGE'] = 0.5; // +50% damage dealt on type advantage (1.5x)
  }
  let totalDamageTaken = tgtMods.damageTakenPercent;
  if (damageType === DamageType.MAGIC) {
    totalDamageTaken += tgtMods.magicDamageTakenPercent;
  }
  if (totalDamageTaken !== 0) {
    categories['VULNERABILITY'] = totalDamageTaken / 100;
  }
  if (attMods.damageDealtPercent !== 0) {
    categories['DAMAGE_DEALT'] = attMods.damageDealtPercent / 100;
  }
  // Key_048: 아카이빙 (마지막으로 피해를 준 대상에게 주는 피해 50% 증가)
  if (attacker && Array.isArray(attacker.statusSlots) && attacker.statusSlots.some(s => s.keywordId === 'Key_048' || s.name === '아카이빙')) {
    if (attacker.lastDamagedTargetId && attacker.lastDamagedTargetId === target.characterId) {
      categories['ARCHIVING'] = 0.50;
    }
  }

  // Attacker Conditional Passives (P_S_034 ~ P_S_036, P_S_046, P_S_048, P_S_050, P_S_054~057, P_S_028~030)
  if (attacker && Array.isArray(attacker.passives) && attacker.passives.length > 0) {
    const hasP = (id, name) => attacker.passives.some(p => {
      if (!p) return false;
      const str = typeof p === 'string' ? p : (p.P_Skill_ID || p.id || p.P_Skill_Name || p.name || '');
      return str.includes(id) || (name && str.includes(name));
    });

    const isTargetTank = Boolean(target.mainRole === '탱커' || target.mainRole === CharacterRole.TANK || target.subRole === '탱커' || target.raw?.Character_Role?.includes('탱커'));
    const getTargetKeywordStack = (kId, kName) => {
      if (!Array.isArray(target.statusSlots)) return 0;
      const slot = target.statusSlots.find(s => s.keywordId === kId || (kName && s.name?.includes(kName)));
      return slot ? (slot.stack || 1) : 0;
    };
    const hasTargetKeyword = (kId, kName) => {
      if (!Array.isArray(target.statusSlots)) return false;
      return target.statusSlots.some(s => s.keywordId === kId || (kName && s.name?.includes(kName)));
    };

    let passiveBonus = 0;
    // P_S_034: [파괴] 스택 5 이상 +66%
    if (hasP('P_S_034', '전투광') && getTargetKeywordStack('Key_002', '파괴') >= 5) passiveBonus += 0.66;
    // P_S_035: [원소] 스택 5 이상 +66%
    if (hasP('P_S_035', '파괴자') && getTargetKeywordStack('Key_004', '원소') >= 5) passiveBonus += 0.66;
    // P_S_036: [행동불가] 혹은 [브레이킹] +50%
    if (hasP('P_S_036', '집행자') && (target.isBreaking || hasTargetKeyword('Key_026', '행동불가') || hasTargetKeyword('Key_009', '빙결'))) passiveBonus += 0.50;
    // P_S_046: [출혈] 스택 5 이상 +66%
    if (hasP('P_S_046', '투쟁') && getTargetKeywordStack('Key_001', '출혈') >= 5) passiveBonus += 0.66;
    // P_S_048: [압도] 상태 +50%
    if (hasP('P_S_048', '부당 거래') && hasTargetKeyword('Key_007', '압도')) passiveBonus += 0.50;
    // P_S_050: 탱커 대상 +44%
    if (hasP('P_S_050', '사신의 종소리') && isTargetTank) passiveBonus += 0.44;
    // P_S_054: [출혈] 스택 5 이상 +66%
    if (hasP('P_S_054', '독설가') && getTargetKeywordStack('Key_001', '출혈') >= 5) passiveBonus += 0.66;
    // P_S_055: [파괴] 스택 5 이상 +66%
    if (hasP('P_S_055', '트리거 해피') && getTargetKeywordStack('Key_002', '파괴') >= 5) passiveBonus += 0.66;
    // P_S_056: [젖음] 상태 +33%
    if (hasP('P_S_056', '열정의 물보라') && hasTargetKeyword('Key_010', '젖음')) passiveBonus += 0.33;
    // P_S_057: [젖음] 상태 +33%
    if (hasP('P_S_057', '관능의 물보라') && hasTargetKeyword('Key_010', '젖음')) passiveBonus += 0.33;
    // P_S_028, 029, 030: 탱커 대상 +33%, +50%, +66%
    if (hasP('P_S_028', '분쇄자') && isTargetTank) passiveBonus += 0.33;
    if (hasP('P_S_029', '분쇄자') && isTargetTank) passiveBonus += 0.50;
    if (hasP('P_S_030', '분쇄자') && isTargetTank) passiveBonus += 0.66;

    if (passiveBonus > 0) {
      categories['PASSIVE_CONDITIONAL'] = (categories['PASSIVE_CONDITIONAL'] || 0) + passiveBonus;
    }
  }
  if (isUltimate) {
    if (attMods.ultDamageDealtPercent !== 0) {
      categories['ULT_DEALT'] = attMods.ultDamageDealtPercent / 100;
    }
    if (tgtMods.ultDamageTakenPercent !== 0) {
      categories['ULT_TAKEN'] = tgtMods.ultDamageTakenPercent / 100;
    }
  }
  if (Array.isArray(damageModifiers)) {
    for (const mod of damageModifiers) {
      if (!mod) continue;
      const cat = mod.category || 'GENERAL';
      categories[cat] = (categories[cat] || 0) + (Number(mod.value) || 0);
    }
  }
  let modifierMult = 1.0;
  for (const cat of Object.keys(categories)) {
    modifierMult *= Math.max(0, 1 + categories[cat]);
  }

  const finalHpDamage = Math.max(0, Math.round(damageAfterDefense * modifierMult));
  result.hpDamage = finalHpDamage;
  result.finalDamage = result.shieldDamage + result.hpDamage;

  // Key_048 아카이빙 기록 및 Key_037 위엄 적중 회복 트리거
  if (result.finalDamage > 0 && attacker) {
    attacker.lastDamagedTargetId = target.characterId;

    if (Array.isArray(attacker.statusSlots) && attacker.statusSlots.some(s => s.keywordId === 'Key_037' || s.name === '위엄')) {
      const hCaster = applyHealing({ target: attacker, percent: 10 });
      const teamChars = (team?.characters || attacker.team?.characters || []);
      const aliveAllies = teamChars.filter(c => !c.isDead && c.hp > 0);
      let lowestAlly = null;
      let hAlly = 0;
      if (aliveAllies.length > 0) {
        lowestAlly = aliveAllies[0];
        let minRatio = lowestAlly.hp / lowestAlly.maxHp;
        for (let i = 1; i < aliveAllies.length; i++) {
          const ratio = aliveAllies[i].hp / aliveAllies[i].maxHp;
          if (ratio < minRatio) {
            minRatio = ratio;
            lowestAlly = aliveAllies[i];
          }
        }
        hAlly = applyHealing({ target: lowestAlly, percent: 10 });
      }
      result.majestyTriggered = {
        caster: attacker,
        casterHeal: hCaster,
        lowestAlly: lowestAlly,
        allyHeal: hAlly
      };
    }
  }

  // Apply HP reduction
  target.hp = Math.max(0, target.hp - finalHpDamage);
  if (target.hp <= 0) {
    result.isKill = true;
  }

  // 7. Break Calculation (Rule 42, 43, 44, 45)
  // If Shield fully absorbed damage so HP damage is 0, no break occurs.
  if (finalHpDamage > 0 && !hasDealtBreakThisSkill && target.currentBreak > 0) {
    const isAdvantaged = forceAdvantage || hasTypeAdvantage(attacker, target);
    let breakAmount = 0;

    if (isAdvantaged) {
      breakAmount += 1; // Base break damage on advantage
    }
    if (skillBreakBonus > 0) {
      breakAmount += skillBreakBonus;
    }
    // Key_012: 증폭 (마법_브레이킹피해)
    if (damageType === DamageType.MAGIC && attMods.magicBreakBonus > 0) {
      breakAmount += attMods.magicBreakBonus;
    }

    if (breakAmount > 0) {
      result.isBreakOccurred = true;
      target.currentBreak = Math.max(0, target.currentBreak - breakAmount);

      if (target.currentBreak === 0 && !target.isBreaking) {
        // Enter Breaking state
        target.isBreaking = true;
        target.breakingTurnsRemaining = 2; // Inaction next opponent turn, recovers turn after
        result.isBreakingOccurred = true;
      }
    }
  }

  return result;
}
