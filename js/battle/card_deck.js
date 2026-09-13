/**
 * Card & Deck Management Module
 * Manages 36-card standard decks, draws, discards, exhausts, deck shuffles,
 * memorial cards, and character death purges according to rules 2, 17~22, 59, 61, 65.
 */

import { CardType, CharacterClass } from './battle_types.js';

/**
 * Creates a single Card object.
 */
export function createCard({
  ownerCharacter,
  skillData = {},
  cardType = CardType.BASIC,
  overheat = 0,
  isOffensive = true
}) {
  const charId = ownerCharacter ? ownerCharacter.characterId : 'NONE';
  const skillId = skillData.Skill_ID || skillData.id || `SKILL_${cardType}`;
  const skillName = skillData.Skill_Name || skillData.name || `${ownerCharacter ? ownerCharacter.name : ''} 스킬`;

  const targetType = String(skillData.Skill_Target || skillData.target || skillData.Act1_Target || (skillData.act1 && skillData.act1.target) || '').trim();
  const isAllyOrSelf = targetType === '자신' || targetType === '아군' || targetType === '아군_전체' || targetType === '자신_중심_아군' || targetType === '최저체력_아군' || targetType === '무작위_아군' || targetType === 'ALLY' || targetType === 'SELF';
  const rawOffensive = skillData.Skill_Offensive || skillData.offensive;
  const desc = String(skillData.Skill_Desc || '');
  const act1Type = String(skillData.Act1_Type || (skillData.act1 && skillData.act1.type) || '');
  const act2Type = String(skillData.Act2_Type || (skillData.act2 && skillData.act2.type) || '');

  let offensiveFlag = true;
  const isExplicitOffensive = (
    String(rawOffensive).toUpperCase() === 'Y' ||
    String(rawOffensive).toLowerCase() === 'offensive' ||
    rawOffensive === true ||
    String(rawOffensive).toLowerCase() === 'true'
  );
  const isExplicitNonOffensive = (
    String(rawOffensive).toUpperCase() === 'N' ||
    rawOffensive === false ||
    String(rawOffensive).toLowerCase() === 'false'
  );

  const hasDamage = (
    act1Type.includes('DAMAGE') ||
    act2Type.includes('DAMAGE') ||
    desc.includes('물리 피해') ||
    desc.includes('물리피해') ||
    desc.includes('마법 피해') ||
    desc.includes('마법피해') ||
    desc.includes('피해를') ||
    (Number(skillData.Skill_Multiplier || (skillData.act1 && skillData.act1.multiplier)) > 0 && !isAllyOrSelf)
  );

  if (isExplicitOffensive || hasDamage) {
    offensiveFlag = true;
  } else if (isExplicitNonOffensive || isAllyOrSelf) {
    offensiveFlag = false;
  } else {
    offensiveFlag = Boolean(isOffensive);
  }

  const hasManualClause = desc.includes('지정한 적') || desc.includes('지정한 아군') || desc.includes('대상에 따라');
  const targetMethod = (skillData.Skill_Target_Method === '수동' || skillData.Act1_Target_Method === '수동' || skillData.act1?.method === '수동' || skillData.targetMethod === 'MANUAL' || hasManualClause) ? 'MANUAL' : 'AUTO';
  let range = skillData.Skill_Target_Range || skillData.range || (skillData.act1 && skillData.act1.range) || skillData.Act1_Range || 'SINGLE';
  if ((desc.startsWith('적 1명에게') || desc.startsWith('지정한 적 1명에게')) && range === 'ALL') {
    range = 'SINGLE';
  }
  if (range === 'SINGLE' && (desc.includes('중심으로') || desc.includes('중심') || desc.includes('주변') || desc.includes('좌우'))) {
    if (desc.includes('7명') || desc.includes('7칸') || desc.includes('주변 3칸') || desc.includes('좌우 3칸')) range = 'SPLASH_7';
    else if (desc.includes('5명') || desc.includes('5칸') || desc.includes('주변 2칸') || desc.includes('좌우 2칸')) range = 'SPLASH_5';
    else if (desc.includes('3명') || desc.includes('3칸') || desc.includes('주변 1칸') || desc.includes('좌우 1칸') || desc.includes('주변') || desc.includes('좌우') || desc.includes('자신을 중심으로') || desc.includes('자신 중심')) range = 'SPLASH_3';
  }
  const rawTags = skillData.Skill_Tags || skillData.tags || '';
  const tags = Array.isArray(rawTags)
    ? rawTags
    : String(rawTags).split(',').map(s => s.trim()).filter(Boolean);
  const isQuick = tags.includes('속공') || Boolean(skillData.isQuick);

  return {
    cardId: `CARD_${Math.random().toString(36).substr(2, 8)}`,
    ownerCharacterId: charId,
    skillId: skillId,
    skillName: skillName,
    cardType: cardType,
    baseOverheat: Number(skillData.Skill_Overheat || overheat) || 0,
    isOffensive: offensiveFlag,
    target: targetType,
    targetType: targetType,
    targetMethod: targetMethod,
    targetMode: targetMethod,
    targetCount: Number(skillData.Skill_Target_Count || (skillData.act1 && skillData.act1.count) || skillData.Act1_Target_Count || 1),
    range: range,
    targetRange: range,
    targetScope: range,
    tags: tags,
    isQuick: isQuick,
    rawSkill: skillData,
    skillData: skillData
  };
}

/**
 * Creates a Memorial curse card (Rule 61)
 */
export function createMemorialCard() {
  const memorialSkillData = {
    Skill_ID: 'B_S_001',
    Skill_Name: '추모',
    Skill_Desc: '아군 사망시 이 카드 1장을 덱에 추가합니다. 지정한 아군 1명 에게 [ 💧 슬픔 3 / 2 ] 을 부여하고 이 카드는 소멸합니다.',
    Skill_Overheat: '-100',
    Skill_Target: '아군',
    Skill_Target_Method: '수동',
    Skill_Target_Range: 'SINGLE',
    Skill_Effect_1_ID: 'Key_050', // 슬픔
    Skill_Effect_1_Val1: '3',     // 스택 3
    Skill_Effect_1_Val2: '2'      // 턴수 2
  };

  return {
    cardId: `MEMORIAL_${Math.random().toString(36).substr(2, 8)}`,
    ownerCharacterId: 'NONE',
    skillId: 'B_S_001',
    skillName: '추모 (Memorial)',
    cardType: CardType.MEMORIAL,
    baseOverheat: -100, // Rule 61: Overheat -100
    isOffensive: false,
    targetMethod: 'MANUAL',
    targetMode: 'MANUAL',
    targetCount: 1,
    range: 'SINGLE',
    rawSkill: memorialSkillData,
    skillData: memorialSkillData
  };
}

/**
 * Creates a "지쳐감" (Fatigue / Tired) curse card (B_S_014)
 */
export function createTiredCard(ownerCharId = 'NONE') {
  const tiredSkillData = {
    Skill_ID: 'B_S_014',
    Skill_Name: '지쳐감',
    Skill_Tier: '저주',
    Skill_Desc: '오버히트를 대가로 소멸시킬 수 있습니다. 효과 없음.',
    Skill_Overheat: '50',
    Skill_Tags: '저주,속공',
    Skill_Target: '아군',
    Skill_Target_Method: '자동',
    Skill_Target_Range: 'SELF'
  };

  return {
    cardId: `TIRED_${Math.random().toString(36).substr(2, 8)}`,
    ownerCharacterId: ownerCharId || 'NONE',
    skillId: 'B_S_014',
    skillName: '지쳐감',
    cardType: CardType.CURSE,
    baseOverheat: 50,
    isOffensive: false,
    isQuick: true,
    isSwift: true,
    targetMethod: 'AUTO',
    targetMode: 'AUTO',
    targetCount: 0,
    range: 'SELF',
    rawSkill: tiredSkillData,
    skillData: tiredSkillData
  };
}

/**
 * Computes the current effective Overheat of a card, factoring in Ultimate uses (+20 per use).
 */
export function getCardOverheat(card, character) {
  if (!card) return 0;
  let oh = Number(card.baseOverheat) || 0;

  // Dynamic bonus overheat on card (e.g. slot machine -20)
  if (card.bonusOverheat !== undefined) {
    oh += Number(card.bonusOverheat) || 0;
  }

  if (card.cardType === CardType.ULTIMATE && character) {
    oh += (character.ultimateUseCount || 0) * 20;
  }

  if (character && Array.isArray(character.statusSlots)) {
    // Key_036: GUESSER!! (📌) - 스킬 오버히트 +10
    const guesserSlot = character.statusSlots.find(s => s.keywordId === 'Key_036' || s.name === 'GUESSER!!' || s.name === 'GUESSER');
    if (guesserSlot) {
      oh += 10;
    }

    // Key_050: 슬픔 (💧) - 해당 캐릭터의 모든 스킬에 오버히트 +10 * 스택
    const griefSlot = character.statusSlots.find(s => s.keywordId === 'Key_050' || s.name === '슬픔');
    if (griefSlot) {
      oh += 10 * (griefSlot.stack || 1);
    }
  }

  // 0 이하 음수 오버히트 허용
  return oh;
}

/**
 * Skill Mastery Bonus Table (A, B, C types, Lv 0~7)
 */
export const SKILL_MASTERY_BONUS = {
  A: {
    0: { mult: 0, oh: 0 },
    1: { mult: 3, oh: 0 },
    2: { mult: 6, oh: 0 },
    3: { mult: 6, oh: -5 },
    4: { mult: 9, oh: -5 },
    5: { mult: 12, oh: -5 },
    6: { mult: 12, oh: -10 },
    7: { mult: 20, oh: -10 }
  },
  B: {
    0: { mult: 0, oh: 0 },
    1: { mult: 1, oh: 0 },
    2: { mult: 2, oh: 0 },
    3: { mult: 2, oh: -5 },
    4: { mult: 3, oh: -5 },
    5: { mult: 4, oh: -5 },
    6: { mult: 4, oh: -10 },
    7: { mult: 10, oh: -10 }
  },
  C: {
    0: { mult: 0, oh: 0 },
    1: { mult: 0, oh: -2 },
    2: { mult: 0, oh: -4 },
    3: { mult: 0, oh: -9 },
    4: { mult: 0, oh: -11 },
    5: { mult: 0, oh: -13 },
    6: { mult: 0, oh: -18 },
    7: { mult: 0, oh: -25 }
  }
};

/**
 * Applies skill mastery bonuses (Multiplier & Overheat) to a skill definition.
 */
export function applyMasteryToSkill(origSkill, masteryLevel = 0) {
  if (!origSkill || !masteryLevel || masteryLevel <= 0) return origSkill;
  const rawType = (origSkill.Skill_Master || 'A').trim().toUpperCase();
  const mType = ['A', 'B', 'C'].includes(rawType) ? rawType : 'A';
  const table = SKILL_MASTERY_BONUS[mType] || SKILL_MASTERY_BONUS.A;
  const bonus = table[Math.min(7, Math.max(0, masteryLevel))] || { mult: 0, oh: 0 };
  if (!bonus.mult && !bonus.oh) return origSkill;

  const clone = { ...origSkill };
  if (bonus.mult) {
    clone.Skill_Multiplier = (Number(origSkill.Skill_Multiplier) || 0) + bonus.mult;
  }
  if (bonus.oh) {
    clone.Skill_Overheat = (Number(origSkill.Skill_Overheat) || 0) + bonus.oh;
  }
  clone._masteryBonus = { level: masteryLevel, type: mType, mult: bonus.mult, oh: bonus.oh };
  return clone;
}

/**
 * Builds the initial 36-card deck for a team.
 * Striker (max 5): 6 cards (1 Ult, 2 Unique, 3 Basic)
 * Supporter (max 3): 2 cards (1 Ult, 1 Unique)
 */
export function buildTeamDeck(team, skillsMasterMap = {}, rng = null) {
  const cards = [];

  for (const char of team.characters) {
    const isStriker = (char.classType === CharacterClass.STRIKER);
    const hasUltimate = (Number(char.star) >= 2) && Boolean(char.ultimateSkillId);

    const rawUlt = skillsMasterMap[char.ultimateSkillId] || { Skill_ID: char.ultimateSkillId || 'ULT_DEFAULT', Skill_Name: `${char.name} 궁극기`, Skill_Overheat: 80, Skill_Offensive: 'Offensive' };
    const rawUniq = skillsMasterMap[char.uniqueSkillId] || { Skill_ID: char.uniqueSkillId || 'UNIQ_DEFAULT', Skill_Name: `${char.name} 고유기`, Skill_Overheat: 20, Skill_Offensive: 'Offensive' };

    const ssLevel = (char.skillMastery && typeof char.skillMastery === 'object') ? (char.skillMastery.SS || 0) : (typeof char.skillMastery === 'number' ? char.skillMastery : 0);
    const asLevel = (char.skillMastery && typeof char.skillMastery === 'object') ? (char.skillMastery.AS || 0) : 0;

    const ultSkill = applyMasteryToSkill(rawUlt, asLevel);
    const uniqSkill = applyMasteryToSkill(rawUniq, ssLevel);

    if (isStriker) {
      // 1 Ultimate (only if star >= 2)
      if (hasUltimate) {
        cards.push(createCard({ ownerCharacter: char, skillData: ultSkill, cardType: CardType.ULTIMATE, overheat: ultSkill.Skill_Overheat || 80 }));
      }
      // 2 Unique
      cards.push(createCard({ ownerCharacter: char, skillData: uniqSkill, cardType: CardType.UNIQUE, overheat: uniqSkill.Skill_Overheat || 20 }));
      cards.push(createCard({ ownerCharacter: char, skillData: uniqSkill, cardType: CardType.UNIQUE, overheat: uniqSkill.Skill_Overheat || 20 }));
      // 3 Basic
      const basicIds = char.basicSkillIds.length > 0 ? char.basicSkillIds : ['B_S_002', 'B_S_002', 'B_S_002'];
      for (let i = 0; i < 3; i++) {
        const bId = basicIds[i % basicIds.length] || 'B_S_002';
        const bSkill = skillsMasterMap[bId] || { Skill_ID: bId, Skill_Name: `${char.name} 기본기`, Skill_Overheat: 0, Skill_Offensive: 'Offensive' };
        cards.push(createCard({ ownerCharacter: char, skillData: bSkill, cardType: CardType.BASIC, overheat: bSkill.Skill_Overheat || 0 }));
      }
    } else {
      // Supporter: 1 Ultimate (only if star >= 2), 1 Unique
      if (hasUltimate) {
        cards.push(createCard({ ownerCharacter: char, skillData: ultSkill, cardType: CardType.ULTIMATE, overheat: ultSkill.Skill_Overheat || 60 }));
      }
      cards.push(createCard({ ownerCharacter: char, skillData: uniqSkill, cardType: CardType.UNIQUE, overheat: uniqSkill.Skill_Overheat || 10 }));
    }
  }

  // Shuffle the initial 36-card deck so cards are distributed randomly across all characters
  return shuffleCards(cards, rng);
}

/**
 * Fisher-Yates shuffle using BattleRNG.
 */
export function shuffleCards(array, rng) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = rng ? rng.nextInt(0, i) : Math.floor(Math.random() * (i + 1));
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
  return array;
}

/**
 * Draws N cards from Team Deck. If deck has fewer than N, shuffles discard into deck.
 */
export function drawCards(team, count = 3, rng = null, onShuffle = null) {
  const drawn = [];
  const needed = Math.max(0, count);

  while (drawn.length < needed) {
    if (team.deck.length === 0) {
      if (team.discard.length === 0) {
        break; // No cards left anywhere
      }
      // Shuffle discard into deck (Exhaust is excluded)
      team.deck = shuffleCards([...team.discard], rng);
      team.discard = [];
      if (typeof onShuffle === 'function') {
        try { onShuffle(team); } catch (e) { console.warn('[drawCards] onShuffle callback error:', e); }
      } else if (typeof team.onShuffle === 'function') {
        try { team.onShuffle(team); } catch (e) { console.warn('[drawCards] team.onShuffle error:', e); }
      }
    }

    const card = team.deck.pop();
    if (card) drawn.push(card);
  }

  team.hand = drawn;
  return drawn;
}

/**
 * Discards unselected cards and routes played card to discard or exhaust.
 */
export function resolveHandCardUse(team, playedCard) {
  const resetCardSlotMachine = (c) => {
    if (c && c._slotMachineBuff) {
      c.isQuick = c._originalIsQuick || false;
      c.bonusOverheat = (c.bonusOverheat || 0) + 20;
      delete c._slotMachineBuff;
      delete c._originalIsQuick;
    }
    return c;
  };

  if (playedCard && playedCard.isQuick) {
    const idx = team.hand.findIndex(c => c.cardId === playedCard.cardId);
    if (idx !== -1) {
      const [used] = team.hand.splice(idx, 1);
      resetCardSlotMachine(used);
      if (used.cardType === CardType.MEMORIAL || used.cardType === CardType.CURSE || used.skillId === 'B_S_014') {
        team.exhaust.push(used);
      } else {
        team.discard.push(used);
      }
    }
    return;
  }
  for (const c of team.hand) {
    resetCardSlotMachine(c);
    if (c.cardId === playedCard.cardId) {
      if (c.cardType === CardType.MEMORIAL || c.cardType === CardType.CURSE || c.skillId === 'B_S_014') {
        // Memorial / Curse card exhausts on use (Rule 61, B_S_014)
        team.exhaust.push(c);
      } else {
        team.discard.push(c);
      }
    } else {
      // Unselected cards discard (Rule 18)
      team.discard.push(c);
    }
  }
  team.hand = [];
}

/**
 * Checks whether a card is currently playable (Section 20).
 * Cards belonging to Breaking characters or lacking valid targets cannot be played.
 */
export function isCardPlayable(card, team, opponentTeam = null) {
  if (!card) return false;

  // Memorial / Curse card is playable if any living ally exists
  if (card.cardType === CardType.MEMORIAL || card.cardType === CardType.CURSE || card.skillId === 'B_S_014') {
    const aliveAllies = team.characters.filter(c => !c.isDead && c.hp > 0);
    return aliveAllies.length > 0;
  }

  const owner = team.characters.find(c => c.characterId === card.ownerCharacterId);
  if (!owner || owner.isDead || owner.isBreaking) {
    return false;
  }

  // Key_006: Inaction (행동불가) - 해당 캐릭터의 카드 사용불가
  if (Array.isArray(owner.statusSlots) && owner.statusSlots.some(s => {
    const cleanId = String(s.keywordId || '').replace(/^[tsaeTSAE]_/, '').trim();
    return cleanId === 'Key_006' || s.name === '행동불가';
  })) {
    return false;
  }

  if (card.isOffensive) {
    const aliveEnemies = opponentTeam ? opponentTeam.characters.filter(c => !c.isDead && c.hp > 0) : [];
    if (opponentTeam && aliveEnemies.length === 0) return false;
  } else {
    const aliveAllies = team.characters.filter(c => !c.isDead && c.hp > 0);
    if (aliveAllies.length === 0) return false;
  }

  return true;
}

/**
 * Purges all cards of a dead character from Deck, Discard, and Exhaust, and adds 1 Memorial card (Section 76).
 */
export function handleCharacterDeathCards(team, deadCharId) {
  team.deck = team.deck.filter(c => c.ownerCharacterId !== deadCharId);
  team.discard = team.discard.filter(c => c.ownerCharacterId !== deadCharId);
  team.hand = team.hand.filter(c => c.ownerCharacterId !== deadCharId);
  team.exhaust = team.exhaust.filter(c => c.ownerCharacterId !== deadCharId);

  // Section 78: Add 1 Memorial card to deck
  team.deck.push(createMemorialCard());
}

/**
 * Transforms all Unique cards of the specified character into Ultimate cards (Key_055 만월).
 * 
 * @param {TeamState} team
 * @param {string} ownerCharId
 * @param {Object} [skillsMasterMap={}]
 */
export function transformUniqueToUltimate(team, ownerCharId, skillsMasterMap = {}) {
  if (!team || !ownerCharId) return;
  const owner = (team.characters || []).find(c => c.characterId === ownerCharId);
  if (!owner || Number(owner.star) < 2 || !owner.ultimateSkillId) return;

  const asLevel = (owner.skillMastery && typeof owner.skillMastery === 'object') ? (owner.skillMastery.AS || 0) : 0;
  const rawUlt = skillsMasterMap[owner.ultimateSkillId] || {
    Skill_ID: owner.ultimateSkillId || 'ULT_DEFAULT',
    Skill_Name: `${owner.name} 궁극기`,
    Skill_Overheat: 80,
    Skill_Offensive: 'Offensive'
  };
  const ultSkill = applyMasteryToSkill(rawUlt, asLevel);

  const transformCardList = (list) => {
    for (const card of list) {
      if (card.ownerCharacterId === ownerCharId && card.cardType === CardType.UNIQUE) {
        const newCard = createCard({
          ownerCharacter: owner,
          skillData: ultSkill,
          cardType: CardType.ULTIMATE,
          overheat: ultSkill.Skill_Overheat || 80
        });
        Object.assign(card, newCard);
      }
    }
  };

  transformCardList(team.deck || []);
  transformCardList(team.discard || []);
  transformCardList(team.hand || []);
}
