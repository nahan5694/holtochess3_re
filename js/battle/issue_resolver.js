/**
 * Issue Resolver for Battle System
 * Parses active issues and applies dynamic stat adjustments, card curses, and start-of-battle buffs.
 */

import { CardType } from './battle_types.js?v=004276';
import { createTiredCard } from './card_deck.js?v=004276';

/**
 * Creates a Fatigue (지쳐감) card to inject into player's deck
 */
export function createFatigueCard() {
  return createTiredCard('SYSTEM');
}

/**
 * Applies all active issues to the teams
 * @param {Object} params
 * @param {Object} params.teamA - Player team
 * @param {Object} params.teamB - Enemy team
 * @param {Array<string>} params.issueIds - List of active issue IDs
 * @param {Object} [params.GameData] - GameData reference
 */
export function applyIssuesToBattle({ teamA, teamB, issueIds = [], GameData = {} }) {
  if (!issueIds || issueIds.length === 0) return;

  const counts = {};
  issueIds.forEach(id => {
    if (id) counts[id] = (counts[id] || 0) + 1;
  });

  let enemyLevelDelta = 0;
  let enemyBpDelta = 0;
  let enemySpeedDelta = 0;
  let enemyBloomDelta = 0;
  let enemyAtkPct = 0;
  let enemyIdolPct = 0;
  let enemyHpPct = 0;
  let enemyDefDelta = 0;
  let enemyMdefDelta = 0;
  let enemyEvasionDelta = 0;
  let enemyDmgDealtPct = 0;
  let enemyDmgTakenPct = 0;
  let fatigueCardsCount = 0;

  const startBuffs = [];
  let idolShieldMultiplier = 0;

  for (const [id, count] of Object.entries(counts)) {
    switch (id) {
      // 레벨
      case 'Issue_001': enemyLevelDelta += 5 * count; break;
      case 'Issue_002': enemyLevelDelta += 10 * count; break;
      case 'Issue_003': enemyLevelDelta += 15 * count; break;
      case 'Issue_004': enemyLevelDelta += 20 * count; break;
      case 'Issue_005': enemyLevelDelta += 25 * count; break;
      case 'Issue_006': enemyLevelDelta += 30 * count; break;

      // 브레이크 / 속도 / 개화
      case 'Issue_007': enemyBpDelta += 1 * count; break;
      case 'Issue_008': enemySpeedDelta += 2 * count; break;
      case 'Issue_009': enemySpeedDelta += 4 * count; break;
      case 'Issue_010': enemySpeedDelta += 6 * count; break;
      case 'Issue_043': enemySpeedDelta += 3 * count; break;
      case 'Issue_011': enemyBloomDelta = Math.max(enemyBloomDelta, 2); break;
      case 'Issue_012': enemyBloomDelta = Math.max(enemyBloomDelta, 5); break;
      case 'Issue_044': enemyBloomDelta += 2 * count; break;

      // 저주 카드 (강행군)
      case 'Issue_013': fatigueCardsCount += 2 * count; break;
      case 'Issue_014': fatigueCardsCount += 4 * count; break;
      case 'Issue_015': fatigueCardsCount += 6 * count; break;

      // 주는 피해 / 받는 피해
      case 'Issue_016': enemyDmgDealtPct += 10 * count; break;
      case 'Issue_017': enemyDmgDealtPct += 20 * count; break;
      case 'Issue_018': enemyDmgDealtPct += 30 * count; break;
      case 'Issue_045': enemyDmgDealtPct += 15 * count; break;
      case 'Issue_019': enemyDmgTakenPct -= 10 * count; break;
      case 'Issue_020': enemyDmgTakenPct -= 20 * count; break;
      case 'Issue_021': enemyDmgTakenPct -= 30 * count; break;
      case 'Issue_046': enemyDmgTakenPct -= 15 * count; break;

      // 방어력 (튼튼함 / 또렷함) - CSV 기준 정상 매핑
      case 'Issue_022': enemyDefDelta += 5 * count; enemyMdefDelta += 5 * count; break;
      case 'Issue_023': enemyDefDelta += 10 * count; enemyMdefDelta += 10 * count; break;
      case 'Issue_024': enemyDefDelta += 15 * count; enemyMdefDelta += 15 * count; break;
      case 'Issue_047': enemyDefDelta += 15 * count; break;  // 라이브 물리방어 +15
      case 'Issue_048': enemyMdefDelta += 15 * count; break; // 라이브 마법방어 +15

      // 체력 % (건강함) - CSV 기준 정상 매핑
      case 'Issue_025': enemyHpPct += 10 * count; break;
      case 'Issue_026': enemyHpPct += 20 * count; break;
      case 'Issue_027': enemyHpPct += 30 * count; break;
      case 'Issue_028': enemyHpPct += 40 * count; break;
      case 'Issue_029': enemyHpPct += 50 * count; break;
      case 'Issue_049': enemyHpPct += 25 * count; break; // 라이브 체력 +25%

      // 회피 (댄스레슨) - CSV 기준 7% 정상 매핑
      case 'Issue_030': enemyEvasionDelta += 7 * count; break;

      // 공격력 / 아이돌력 %
      case 'Issue_031': enemyAtkPct += 10 * count; break;
      case 'Issue_032': enemyAtkPct += 20 * count; break;
      case 'Issue_033': enemyAtkPct += 30 * count; break;
      case 'Issue_050': enemyAtkPct += 15 * count; break;
      case 'Issue_034': enemyIdolPct += 10 * count; break;
      case 'Issue_035': enemyIdolPct += 20 * count; break;
      case 'Issue_036': enemyIdolPct += 30 * count; break;
      case 'Issue_051': enemyIdolPct += 15 * count; break;

      // 시작 버프 및 보호막
      case 'Issue_037': startBuffs.push({ keywordId: 'Key_013', name: '열정', icon: '⚔️', rawKeyword: { Keyword_ID: 'Key_013', Keyword_Name: '열정', Keyword_Icon: '⚔️', Keyword_Type: '버프' }, stack: 1, duration: 5 }); break;
      case 'Issue_038': startBuffs.push({ keywordId: 'Key_014', name: '청초', icon: '⚜️', rawKeyword: { Keyword_ID: 'Key_014', Keyword_Name: '청초', Keyword_Icon: '⚜️', Keyword_Type: '버프' }, stack: 1, duration: 5 }); break;
      case 'Issue_039': startBuffs.push({ keywordId: 'Key_015', name: '견고', icon: '🛡️', rawKeyword: { Keyword_ID: 'Key_015', Keyword_Name: '견고', Keyword_Icon: '🛡️', Keyword_Type: '버프' }, stack: 1, duration: 5 }); break;
      case 'Issue_040': startBuffs.push({ keywordId: 'Key_016', name: '의지', icon: '⛓️', rawKeyword: { Keyword_ID: 'Key_016', Keyword_Name: '의지', Keyword_Icon: '⛓️', Keyword_Type: '버프' }, stack: 1, duration: 5 }); break;
      case 'Issue_041': idolShieldMultiplier += 1.0 * count; break;
      case 'Issue_042': break; // 맹목 (미리보기 처리)
      case 'Issue_052': break; // 족쇄 (UI 덱 편성 처리)
    }
  }

  // 1. Apply to Enemy Team characters (Team B)
  if (teamB && Array.isArray(teamB.characters)) {
    teamB.characters.forEach(char => {
      // Level scaling
      if (enemyLevelDelta > 0) {
        char.level = (char.level || 1) + enemyLevelDelta;
        const hpUp = parseInt(char.raw?.Character_HP_UP || 1, 10);
        const atkUp = parseInt(char.raw?.Character_ATK_UP || 1, 10);
        const idolUp = parseInt(char.raw?.Character_Idol_UP || 1, 10);
        const addSteps = Math.floor(enemyLevelDelta / 10);
        char.maxHp += addSteps * hpUp;
        char.hp += addSteps * hpUp;
        char.atk += addSteps * atkUp;
        char.idolPower += addSteps * idolUp;
      }

      // BP
      if (enemyBpDelta > 0) {
        char.maxBreak += enemyBpDelta;
        char.currentBreak += enemyBpDelta;
      }

      // Speed
      if (enemySpeedDelta > 0) {
        char.speed += enemySpeedDelta;
      }

      // Flat DEF / MDEF
      if (enemyDefDelta > 0) char.def += enemyDefDelta;
      if (enemyMdefDelta > 0) char.mdef += enemyMdefDelta;

      // Evasion
      if (enemyEvasionDelta > 0) char.evasion += enemyEvasionDelta;

      // Percentage ATK / IDOL / HP
      if (enemyAtkPct > 0) char.atk = Math.round(char.atk * (1 + enemyAtkPct / 100));
      if (enemyIdolPct > 0) char.idolPower = Math.round(char.idolPower * (1 + enemyIdolPct / 100));
      if (enemyHpPct > 0) {
        const bonusHp = Math.round(char.maxHp * (enemyHpPct / 100));
        char.maxHp += bonusHp;
        char.hp += bonusHp;
      }

      // Damage dealt / taken multipliers (stored in issueMods)
      char.issueMods = char.issueMods || {};
      if (enemyDmgDealtPct !== 0) char.issueMods.damageDealtPercent = (char.issueMods.damageDealtPercent || 0) + enemyDmgDealtPct;
      if (enemyDmgTakenPct !== 0) char.issueMods.damageTakenPercent = (char.issueMods.damageTakenPercent || 0) + enemyDmgTakenPct;

      // Shield
      if (idolShieldMultiplier > 0 && char.idolPower > 0) {
        char.shield = (char.shield || 0) + Math.round(char.idolPower * idolShieldMultiplier);
      }

      // Start Buffs
      if (startBuffs.length > 0 && Array.isArray(char.statusSlots)) {
        startBuffs.forEach(b => {
          char.statusSlots.push({
            keywordId: b.keywordId,
            name: b.name,
            icon: b.icon,
            rawKeyword: b.rawKeyword,
            stack: b.stack,
            duration: b.duration,
            isBuff: true,
            isImmortal: false
          });
        });
      }
    });
  }

  // 2. Apply to Player Team (Team A)
  // 덱 조작은 initBattle 이후 ui_battle.js에서 일괄 처리하므로 카운트만 전달
  if (teamA) {
    teamA.fatigueCardsCount = fatigueCardsCount;
  }
}
