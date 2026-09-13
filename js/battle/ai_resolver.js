/**
 * AI Resolver
 * Advanced AI decision-making based on immediate utility, status stacking, role synergies,
 * and high-priority keyword targeting.
 */

import { CharacterRole, RangeType } from './battle_types.js';
import { isCardPlayable } from './card_deck.js';
import { getEffectiveAggro } from './target_resolver.js';

const KEYWORD_NAME_MAP = Object.freeze({
  '출혈': 'Key_001',
  '파괴': 'Key_002',
  '매료': 'Key_003',
  '원소': 'Key_004',
  '중독': 'Key_005',
  '행동불가': 'Key_006',
  '압도': 'Key_007',
  '웃음': 'Key_008',
  '빙결': 'Key_009',
  '젖음': 'Key_010',
  '흑마법': 'Key_011',
  '증폭': 'Key_012',
  '열정': 'Key_013',
  '청초': 'Key_014',
  '견고': 'Key_015',
  '의지': 'Key_016',
  '집중': 'Key_017',
  '재생': 'Key_018',
  '가속': 'Key_019',
  '강타': 'Key_020',
  '은신': 'Key_021',
  '도발': 'Key_022',
  '반격': 'Key_023',
  '리듬': 'Key_024',
  '하모니': 'Key_025',
  '흥분': 'Key_026',
  '면역': 'Key_027',
  '부활': 'Key_028',
  '되감기': 'Key_029',
  '비정상 식사': 'Key_030',
  '폭탄': 'Key_041',
  '해적출항': 'Key_042'
});

const DPS_ROLES = new Set([
  CharacterRole.MELEE_DPS,
  CharacterRole.RANGED_DPS,
  CharacterRole.MAGIC_DPS,
  CharacterRole.ASSASSIN,
  'MELEE_DPS', 'RANGED_DPS', 'MAGIC_DPS', 'ASSASSIN',
  '근거리 딜러', '근거리딜러', '원거리 딜러', '원거리딜러', '마법 딜러', '마법딜러', '암살자'
]);

function hasRole(char, ...roles) {
  if (!char) return false;
  const roleValues = new Set(roles.flatMap(r => {
    if (r === 'TANK' || r === '탱커') return [CharacterRole.TANK, '탱커', 'TANK'];
    if (r === 'MELEE_DPS' || r === '근거리딜러' || r === '근거리 딜러') return [CharacterRole.MELEE_DPS, '근거리 딜러', '근거리딜러', 'MELEE_DPS'];
    if (r === 'RANGED_DPS' || r === '원거리딜러' || r === '원거리 딜러') return [CharacterRole.RANGED_DPS, '원거리 딜러', '원거리딜러', 'RANGED_DPS'];
    if (r === 'MAGIC_DPS' || r === '마법딜러' || r === '마법 딜러') return [CharacterRole.MAGIC_DPS, '마법 딜러', '마법딜러', 'MAGIC_DPS'];
    if (r === 'ASSASSIN' || r === '암살자') return [CharacterRole.ASSASSIN, '암살자', 'ASSASSIN'];
    if (r === 'HEALER' || r === '힐러') return [CharacterRole.HEALER, '힐러', 'HEALER'];
    if (r === 'BUFFER' || r === '버퍼') return [CharacterRole.BUFFER, '버퍼', 'BUFFER'];
    if (r === 'DEBUFFER' || r === '디버퍼') return [CharacterRole.DEBUFFER, '디버퍼', 'DEBUFFER'];
    return [r];
  }));
  return roleValues.has(char.mainRole) || roleValues.has(char.role) || roleValues.has(char.raw?.Character_Role);
}

export function getCardAppliedKeywords(card) {
  const result = new Set();
  const raw = card.rawSkill || {};
  
  for (let i = 1; i <= 3; i++) {
    const eid = raw[`Skill_Effect_${i}_ID`];
    if (eid) result.add(String(eid).trim().replace(/^T_/, ''));
    const a1id = raw[`Act1_Effect_${i}_ID`];
    if (a1id) result.add(String(a1id).trim().replace(/^T_/, ''));
    const a2id = raw[`Act2_Effect_${i}_ID`];
    if (a2id) result.add(String(a2id).trim().replace(/^T_/, ''));
  }

  const desc = String(raw.Skill_Desc || '');
  for (const [name, id] of Object.entries(KEYWORD_NAME_MAP)) {
    if (desc.includes(` ${name}`) || desc.includes(`[ ${name}`) || desc.includes(`[${name}`)) {
      result.add(id);
    }
  }

  return result;
}

/**
 * Evaluates available cards in hand and selects the best card and manual target for AI.
 * 
 * @param {Object} params
 * @param {TeamState} params.team - AI team
 * @param {TeamState} params.opponentTeam - Opponent team
 * @param {BattleRNG} params.rng
 * @returns {{ selectedCard: Card|null, manualTarget: CharacterBattleState|null }}
 */
export function selectAICardAndTarget({ team, opponentTeam, rng }) {
  const usableCards = team.hand.filter(card => isCardPlayable(card, team, opponentTeam));

  if (usableCards.length === 0) {
    return { selectedCard: null, manualTarget: null };
  }

  const enemyLiving = opponentTeam.characters.filter(c => !c.isDead && c.hp > 0);
  const allyLiving = team.characters.filter(c => !c.isDead && c.hp > 0);

  // Pre-calculate enemy threat scores to identify the strongest enemy
  let maxEnemyThreat = -1;
  let strongestEnemy = null;
  for (const enemy of enemyLiving) {
    const atkVal = Number(enemy.atk) || 100;
    const idolVal = Number(enemy.idolPower) || 0;
    const isDps = DPS_ROLES.has(enemy.mainRole) || hasRole(enemy, 'MELEE_DPS', 'RANGED_DPS', 'MAGIC_DPS', 'ASSASSIN');
    const isSSR = enemy.raw?.Character_Tier === 'SSR';
    const threat = (atkVal * 1.5) + idolVal + (isDps ? 400 : 0) + (isSSR ? 250 : 0);
    if (threat > maxEnemyThreat) {
      maxEnemyThreat = threat;
      strongestEnemy = enemy;
    }
  }

  // Pre-calculate total ally and enemy aggro
  const totalAllyAggro = allyLiving.reduce((sum, a) => sum + getEffectiveAggro(a), 0);
  const totalEnemyAggro = enemyLiving.reduce((sum, e) => sum + getEffectiveAggro(e), 0);

  function isCardManualTarget(c) {
    if (!c) return false;
    const desc = String(c.rawSkill?.Skill_Desc || c.skillData?.Skill_Desc || '');
    const hasManualClause = desc.includes('지정한 적') || desc.includes('지정한 아군') || desc.includes('대상에 따라');
    const rawMethod = c.rawSkill?.Skill_Target_Method || c.skillData?.Skill_Target_Method || c.rawSkill?.Act1_Target_Method;
    if (rawMethod === '수동' || hasManualClause || c.targetMethod === 'MANUAL' || c.targetMode === 'MANUAL') {
      return true;
    }
    return false;
  }

  let bestCard = usableCards[0];
  let bestTarget = null;
  let bestScore = -999999;

  for (const card of usableCards) {
    const owner = team.characters.find(c => c.characterId === card.ownerCharacterId);
    const isOffensive = card.isOffensive;
    const appliedKws = getCardAppliedKeywords(card);
    const desc = String(card.rawSkill?.Skill_Desc || '');
    const range = String(card.range || 'SINGLE').toUpperCase();
    const isManual = isCardManualTarget(card);

    if (isOffensive && enemyLiving.length > 0) {
      let cardBestEnemy = null;
      let cardBestEnemyScore = -999999;
      let cardExpectedScore = 0;

      for (const enemy of enemyLiving) {
        let score = 100;
        const hpRatio = Math.max(0, Math.min(1, enemy.hp / (enemy.maxHp || 1)));

        // 1. Definite Kill: estimated damage >= enemy.hp
        const estimatedDmg = (owner ? (owner.atk || 100) : 100) * (Number(card.rawSkill?.Skill_Multiplier || 100) / 100);
        if (enemy.hp <= estimatedDmg) {
          score += 2000;
        }

        // 2. Kill Window & HP Weighting:
        // Above 50%: subtle weighting (avoids boring focus-fire on 95% vs 90%)
        // Below 50%: steep, rapid score amplification
        if (hpRatio > 0.5) {
          score += Math.round((1 - hpRatio) * 100);
        } else {
          const lowHpDepth = (0.5 - hpRatio) / 0.5; // 0 to 1
          score += 450 + Math.round(Math.pow(lowHpDepth, 1.5) * 850);
        }

        // 3. Debuff Stacking & Synergy (Key_001, Key_002, Key_004, etc.)
        const enemyStatuses = Array.isArray(enemy.statusSlots) ? enemy.statusSlots : (Array.isArray(enemy.activeStatuses) ? enemy.activeStatuses : []);
        let debuffStackCount = 0;
        for (const slot of enemyStatuses) {
          const sId = slot.keywordId;
          // Accumulate more stacks of the same debuff if the card applies it
          if (appliedKws.has(sId)) {
            score += 250 + (Number(slot.stack) || 1) * 100;
          }
          // Key_001 (출혈), Key_002 (파괴), Key_004 (원소) stacking synergy
          if (sId === 'Key_001' || sId === 'Key_002' || sId === 'Key_004' ||
              slot.name === '출혈' || slot.name === '파괴' || slot.name === '원소') {
            debuffStackCount += (Number(slot.stack) || 1);
          }
          if (slot.category === 'DEBUFF' || slot.isDebuff || (slot.rawKeyword && slot.rawKeyword.Keyword_Type === '디버프')) {
            score += 40;
          }
        }
        if (debuffStackCount > 0) {
          score += debuffStackCount * 120;
        }

        // 4. Key_005: 중독 -> Target Tanker if possible
        if (appliedKws.has('Key_005') || desc.includes('중독')) {
          if (hasRole(enemy, 'TANK', '탱커')) {
            score += 750;
          }
        }

        // 5. Key_006: 행동불가 -> Target strongest enemy
        if (appliedKws.has('Key_006') || desc.includes('행동불가')) {
          if (enemy === strongestEnemy) {
            score += 900;
          }
          // Avoid redundant CC if already stunned for multiple turns
          const activeStun = enemyStatuses.find(s => s.keywordId === 'Key_006' || s.name === '행동불가');
          if (activeStun && activeStun.duration >= 2) {
            score -= 600;
          }
        }

        // 6. Key_041: 폭탄 -> Target enemy with left/right neighbors
        if (appliedKws.has('Key_041') || desc.includes('폭탄')) {
          const pos = Number(enemy.formationPosition) || 1;
          const hasLeft = enemyLiving.some(e => (Number(e.formationPosition) || 1) === pos - 1);
          const hasRight = enemyLiving.some(e => (Number(e.formationPosition) || 1) === pos + 1);
          if (hasLeft && hasRight) {
            score += 700;
          } else if (hasLeft || hasRight) {
            score += 350;
          } else {
            score -= 200;
          }
        }

        // 7. Threatening DPS priority
        if (DPS_ROLES.has(enemy.mainRole) || hasRole(enemy, 'MELEE_DPS', 'RANGED_DPS', 'MAGIC_DPS', 'ASSASSIN')) {
          score += 250;
        }

        // 8. Breaking bonus
        if (enemy.isBreaking) {
          score += 300;
        }

        // 9. Immunity check: Key_027
        const hasImmunity = enemyStatuses.some(s => s.keywordId === 'Key_027' || s.name === '면역');
        if (hasImmunity && appliedKws.size > 0 && !desc.includes('피해')) {
          score -= 700;
        }

        // 10. AoE / Splash efficiency
        const isSplash = (range === 'SPLASH_1' || range === 'SPLASH_2' || range === 'SPLASH_3' || range === 'SPLASH_5' || range === 'SPLASH_7' || range === 'SPLASH');
        if (isSplash) {
          let splashRadius = 1;
          if (range === 'SPLASH_2' || range === 'SPLASH_5') splashRadius = 2;
          else if (range === 'SPLASH_7') splashRadius = 3;
          const centerPos = Number(enemy.formationPosition) || 1;
          const hitCount = enemyLiving.filter(e => {
            const p = Number(e.formationPosition) || 1;
            return Math.abs(p - centerPos) <= splashRadius;
          }).length;
          score += hitCount * 350;
        } else if (range === 'ALL') {
          score += enemyLiving.length * 250;
        }

        // 11. Quick card bonus
        if (card.isQuick) {
          score += 250;
        }

        if (score > cardBestEnemyScore) {
          cardBestEnemyScore = score;
          cardBestEnemy = enemy;
        }

        const enemyAggro = getEffectiveAggro(enemy);
        const aggroShare = totalEnemyAggro > 0 ? (enemyAggro / totalEnemyAggro) : (1 / enemyLiving.length);
        cardExpectedScore += score * aggroShare;
      }

      const cardScore = isManual ? cardBestEnemyScore : Math.round(cardExpectedScore);
      if (cardScore > bestScore) {
        bestScore = cardScore;
        bestCard = card;
        bestTarget = isManual ? cardBestEnemy : null;
      }
    } else if (!isOffensive && allyLiving.length > 0) {
      // Evaluate Buffs, Heals, Shields on Allies
      let cardBestAlly = null;
      let cardBestAllyScore = -999999;
      let cardExpectedScore = 0;

      for (const ally of allyLiving) {
        let score = 100;
        const hpRatio = Math.max(0, Math.min(1, ally.hp / (ally.maxHp || 1)));
        const missingHpRatio = 1 - hpRatio;
        const allyAggro = getEffectiveAggro(ally);
        const aggroShare = totalAllyAggro > 0 ? (allyAggro / totalAllyAggro) : (1 / allyLiving.length);

        const isHeal = desc.includes('회복') || desc.includes('치유') || (card.tags && card.tags.includes('회복'));
        const isShield = desc.includes('보호막') || (card.tags && card.tags.includes('보호막'));
        const allyStatuses = (ally.statusSlots || ally.activeStatuses || []);

        // 1. Healing & Shielding
        if (isHeal) {
          if (missingHpRatio > 0) {
            score += 350 + Math.round(missingHpRatio * 750) + Math.round(aggroShare * 400);
          } else {
            score -= 800; // Do not waste pure heal on 100% HP ally
          }
        }
        if (isShield) {
          score += 250 + Math.round(missingHpRatio * 450) + Math.round(aggroShare * 650);
        }

        // 2. Key_013: 열정 -> Ranged DPS, Assassin, Melee DPS
        if (appliedKws.has('Key_013') || desc.includes('열정')) {
          if (hasRole(ally, 'RANGED_DPS', 'ASSASSIN', 'MELEE_DPS', '원거리딜러', '암살자', '근거리딜러')) {
            score += 650;
          }
          const slot = allyStatuses.find(s => s.keywordId === 'Key_013' || s.name === '열정');
          if (slot) {
            if (slot.duration <= 1) score += 500; // Renewal needed!
            else score -= 300;
          } else {
            score += 300;
          }
        }

        // 3. Key_014: 청초 -> Magic DPS (primary), Debuffer/Healer/Buffer (secondary)
        if (appliedKws.has('Key_014') || desc.includes('청초')) {
          if (hasRole(ally, 'MAGIC_DPS', '마법딜러')) {
            score += 750;
          } else if (hasRole(ally, 'DEBUFFER', 'HEALER', 'BUFFER', '디버퍼', '힐러', '버퍼')) {
            score += 400;
          }
          const slot = allyStatuses.find(s => s.keywordId === 'Key_014' || s.name === '청초');
          if (slot) {
            if (slot.duration <= 1) score += 500;
            else score -= 300;
          } else {
            score += 300;
          }
        }

        // 4. Key_015 (견고) & Key_016 (의지) -> Tanker, Melee DPS
        if (appliedKws.has('Key_015') || appliedKws.has('Key_016') || desc.includes('견고') || desc.includes('의지')) {
          if (hasRole(ally, 'TANK', '탱커')) {
            score += 700;
          } else if (hasRole(ally, 'MELEE_DPS', '근거리딜러')) {
            score += 450;
          }
          const slot = allyStatuses.find(s => s.keywordId === 'Key_015' || s.keywordId === 'Key_016' || s.name === '견고' || s.name === '의지');
          if (slot) {
            if (slot.duration <= 1) score += 500;
            else score -= 300;
          } else {
            score += 300;
          }
        }

        // 5. Key_017 (집중) & Key_020 (강타) -> Ranged DPS, Magic DPS
        if (appliedKws.has('Key_017') || appliedKws.has('Key_020') || desc.includes('집중') || desc.includes('강타')) {
          if (hasRole(ally, 'RANGED_DPS', 'MAGIC_DPS', '원거리딜러', '마법딜러')) {
            score += 700;
          } else if (hasRole(ally, 'ASSASSIN', 'MELEE_DPS', '암살자', '근거리딜러')) {
            score += 350;
          }
          const slot = allyStatuses.find(s => s.keywordId === 'Key_017' || s.keywordId === 'Key_020' || s.name === '집중' || s.name === '강타');
          if (slot) {
            if (slot.duration <= 1) score += 500;
            else score -= 300;
          } else {
            score += 300;
          }
        }

        // 6. Key_018: 재생 -> Low HP ratio, but avoid <= 5%
        if (appliedKws.has('Key_018') || desc.includes('재생')) {
          if (hpRatio <= 0.05) {
            score -= 1000; // Next turn survival unlikely
          } else {
            score += Math.round(missingHpRatio * 750);
          }
        }

        // 7. Key_023: 반격 -> Melee DPS, Tanker
        if (appliedKws.has('Key_023') || desc.includes('반격')) {
          if (hasRole(ally, 'MELEE_DPS', '근거리딜러')) {
            score += 700;
          } else if (hasRole(ally, 'TANK', '탱커')) {
            score += 550;
          }
        }

        // 8. Key_024: 리듬 -> Melee DPS, Ranged DPS, Magic DPS, Assassin
        if (appliedKws.has('Key_024') || desc.includes('리듬')) {
          if (hasRole(ally, 'MELEE_DPS', 'RANGED_DPS', 'MAGIC_DPS', 'ASSASSIN', '근거리딜러', '원거리딜러', '마법딜러', '암살자')) {
            score += 650;
          }
          const slot = allyStatuses.find(s => s.keywordId === 'Key_024' || s.name === '리듬');
          if (slot) {
            if (slot.duration <= 1) score += 500;
            else score -= 300;
          } else {
            score += 300;
          }
        }

        // 9. Key_029: 되감기 -> High aggro & High HP (>= 70%)
        if (appliedKws.has('Key_029') || desc.includes('되감기')) {
          if (hpRatio >= 0.70) {
            score += 850 + Math.min(500, Math.round(aggroShare * 800));
            if (hasRole(ally, 'TANK', '탱커')) {
              score += 300;
            }
          } else if (hpRatio < 0.50) {
            score -= 1000;
          }
        }

        // 10. Quick card bonus
        if (card.isQuick) {
          score += 250;
        }

        if (score > cardBestAllyScore) {
          cardBestAllyScore = score;
          cardBestAlly = ally;
        }

        cardExpectedScore += score * aggroShare;
      }

      const cardScore = isManual ? cardBestAllyScore : Math.round(cardExpectedScore);
      if (cardScore > bestScore) {
        bestScore = cardScore;
        bestCard = card;
        bestTarget = isManual ? cardBestAlly : null;
      }
    }
  }

  const isFinalManual = isCardManualTarget(bestCard);
  return {
    selectedCard: bestCard,
    manualTarget: (isFinalManual && bestTarget) ? (bestTarget.characterId || bestTarget.id || bestTarget) : null
  };
}
