/**
 * Battle System Types, Constants, and Factory Functions
 */

export const BattlePhase = Object.freeze({
  INITIALIZING: 'INITIALIZING',
  BATTLE_START: 'BATTLE_START',
  TICK_RUNNING: 'TICK_RUNNING',
  TURN_START: 'TURN_START',
  DRAW: 'DRAW',
  CARD_SELECTION: 'CARD_SELECTION',
  CARD_RESOLUTION: 'CARD_RESOLUTION',
  COUNTER_PHASE: 'COUNTER_PHASE',
  TURN_END: 'TURN_END',
  BATTLE_END: 'BATTLE_END'
});

export const CharacterClass = Object.freeze({
  STRIKER: 'STRIKER',
  SUPPORTER: 'SUPPORTER'
});

export const CharacterRole = Object.freeze({
  MELEE_DPS: 'MELEE_DPS',
  RANGED_DPS: 'RANGED_DPS',
  MAGIC_DPS: 'MAGIC_DPS',
  TANK: 'TANK',
  ASSASSIN: 'ASSASSIN',
  HEALER: 'HEALER',
  BUFFER: 'BUFFER',
  DEBUFFER: 'DEBUFFER'
});

export const DamageType = Object.freeze({
  PHYSICAL: 'PHYSICAL',
  MAGIC: 'MAGIC'
});

export const RangeType = Object.freeze({
  SINGLE: 'SINGLE',
  SPLASH_1: 'SPLASH_1',
  SPLASH_2: 'SPLASH_2',
  ALL: 'ALL'
});

export const CardType = Object.freeze({
  ULTIMATE: 'ULTIMATE',
  UNIQUE: 'UNIQUE',
  BASIC: 'BASIC',
  MEMORIAL: 'MEMORIAL',
  CURSE: 'CURSE'
});

export const StatScalingType = Object.freeze({
  ATK: 'ATK',
  IDOL_POWER: 'IDOL_POWER',
  TARGET_MAX_HP: 'TARGET_MAX_HP'
});

export const SkillConditionType = Object.freeze({
  KILL: 'KILL',
  BREAK: 'BREAK',
  KEYWORD: 'KEYWORD'
});

export const StatusCategory = Object.freeze({
  BUFF: 'BUFF',
  DEBUFF: 'DEBUFF'
});

export const RoleKoreanMap = Object.freeze({
  '근거리 딜러': CharacterRole.MELEE_DPS,
  '원거리 딜러': CharacterRole.RANGED_DPS,
  '마법 딜러': CharacterRole.MAGIC_DPS,
  '탱커': CharacterRole.TANK,
  '암살자': CharacterRole.ASSASSIN,
  '힐러': CharacterRole.HEALER,
  '버퍼': CharacterRole.BUFFER,
  '디버퍼': CharacterRole.DEBUFFER
});

export const ClassKoreanMap = Object.freeze({
  '스트라이커': CharacterClass.STRIKER,
  '1': CharacterClass.STRIKER,
  '서포터': CharacterClass.SUPPORTER,
  '2': CharacterClass.SUPPORTER
});

/**
 * Normalizes role text (handles multiple roles, e.g., "근거리 딜러 / 탱커" -> [MELEE_DPS, TANK])
 */
export function parseRoles(roleStr) {
  if (!roleStr) return [CharacterRole.MELEE_DPS];
  const parts = String(roleStr).split(/[\/,]/).map(s => s.trim()).filter(Boolean);
  const roles = parts.map(p => RoleKoreanMap[p] || CharacterRole[p.toUpperCase()] || CharacterRole.MELEE_DPS);
  return roles.length > 0 ? roles : [CharacterRole.MELEE_DPS];
}

export function parseClass(classStr) {
  if (!classStr) return CharacterClass.STRIKER;
  const s = String(classStr).trim();
  return ClassKoreanMap[s] || CharacterClass[s.toUpperCase()] || CharacterClass.STRIKER;
}

/**
 * Factory for Character Battle State
 */
export function createCharacterBattleState(raw = {}, teamId = 'TEAM_A', formationPosition = 1, options = {}) {
  const roles = parseRoles(raw.Character_Role || raw.role || raw.mainRole || options.mainRole || options.role);
  const mainRole = (raw.mainRole && Object.values(CharacterRole).includes(raw.mainRole)) ? raw.mainRole : (roles[0] || CharacterRole.MELEE_DPS);
  const subRole = roles.length > 1 ? roles[1] : null;

  const classType = parseClass(raw.Character_Class || raw.classType || (formationPosition > 5 ? '서포터' : '스트라이커'));

  const level = Number(options.level ?? raw.level ?? 90);
  const star = Math.max(1, Math.min(3, Number(options.star ?? raw.star ?? raw.Character_Star ?? 3)));
  const levelDiff = (options.ignoreLevelScale || level === 1) ? 0 : Math.floor(level / 10);

  const atkUp = parseInt(raw.Character_ATK_UP || raw.Character_ATK_Up || 1, 10);
  const idolUp = parseInt(raw.Character_Idol_UP || raw.Character_Idol_Up || 1, 10);
  const hpUp = parseInt(raw.Character_HP_UP || raw.Character_HP_Up || 1, 10);

  let maxHp;
  if (raw.Character_HP !== undefined) {
    maxHp = Math.max(1, Number(raw.Character_HP) + (levelDiff * hpUp));
  } else {
    maxHp = Math.max(1, Number(raw.maxHp ?? raw.hp ?? options.maxHp ?? options.hp ?? 1000));
  }

  let atk;
  if (raw.Character_ATK !== undefined) {
    atk = Math.max(0, Number(raw.Character_ATK) + (levelDiff * atkUp));
  } else {
    atk = Math.max(0, Number(raw.atk ?? options.atk ?? 100));
  }

  let idolPower;
  if (raw.Character_Idol !== undefined) {
    idolPower = Math.max(0, Number(raw.Character_Idol) + (levelDiff * idolUp));
  } else {
    idolPower = Math.max(0, Number(raw.idolPower ?? options.idolPower ?? 100));
  }
  let def = Math.max(0, Number(raw.Character_DEF ?? raw.Character_Physical_DEF ?? raw.def ?? options.def ?? 20));
  let mdef = Math.max(0, Number(raw.Character_MDEF ?? raw.Character_Magical_DEF ?? raw.mdef ?? options.mdef ?? 20));
  let speed = Math.max(1, Number(raw.Character_Spd ?? raw.speed ?? options.speed ?? 10));
  let critChance = Math.min(100, Math.max(0, Number(raw.Character_Crit ?? raw.critChance ?? options.critChance ?? 5)));
  let accuracy = Math.max(0, Number(raw.Character_HitRate ?? raw.accuracy ?? options.accuracy ?? 100));
  let evasion = Math.max(0, Number(raw.Character_Dodge ?? raw.evasion ?? options.evasion ?? 5));
  let reg = Math.max(0, Number(raw.Character_REG ?? raw.Character_Resist ?? raw.resistance ?? raw.reg ?? options.reg ?? options.resistance ?? 0));

  // Star 1 unlocks P1, Star 3 unlocks P2
  const activePassives = [];
  if (star >= 1 && raw.Character_P1) activePassives.push(raw.Character_P1);
  if (star >= 3 && raw.Character_P2) activePassives.push(raw.Character_P2);
  const isP2 = (p) => {
    if (!raw.Character_P2) return false;
    if (p === raw.Character_P2) return true;
    if (typeof p === 'object' && (p.P_Skill_ID === raw.Character_P2 || p.id === raw.Character_P2)) return true;
    return false;
  };
  if (Array.isArray(options.passives)) {
    for (const p of options.passives) {
      if (p && !activePassives.includes(p)) {
        if (star < 3 && isP2(p)) continue;
        activePassives.push(p);
      }
    }
  } else if (Array.isArray(raw.passives)) {
    for (const p of raw.passives) {
      if (p && !activePassives.includes(p)) {
        if (star < 3 && isP2(p)) continue;
        activePassives.push(p);
      }
    }
  }

  // Passive Stat Bonuses (P_S_046~050, 052~059, 031~033)
  const hasP = (id, name) => activePassives.some(p => {
    if (!p) return false;
    const str = typeof p === 'string' ? p : (p.P_Skill_ID || p.id || p.P_Skill_Name || p.name || '');
    return str.includes(id) || (name && str.includes(name));
  });

  if (hasP('P_S_046', '투쟁')) maxHp = Math.round(maxHp * 1.10);
  if (hasP('P_S_047', '수호의 성녀')) { idolPower = Math.round(idolPower * 1.15); def += 10; }
  if (hasP('P_S_048', '부당 거래')) atk = Math.round(atk * 1.15);
  if (hasP('P_S_049', '슈가 러쉬')) speed += 5;
  if (hasP('P_S_050', '사신의 종소리')) { accuracy += 4; critChance += 4; }
  if (hasP('P_S_052', '유니콘 조련')) { idolPower = Math.round(idolPower * 1.15); speed += 2; }
  if (hasP('P_S_053', '마법소녀')) idolPower = Math.round(idolPower * 1.25);
  if (hasP('P_S_054', '독설가')) critChance += 6;
  if (hasP('P_S_055', '트리거 해피')) critChance += 6;
  if (hasP('P_S_056', '열정의 물보라')) atk = Math.round(atk * 1.15);
  if (hasP('P_S_057', '관능의 물보라')) idolPower = Math.round(idolPower * 1.15);
  if (hasP('P_S_058', '큐레이팅')) idolPower = Math.round(idolPower * 1.25);
  if (hasP('P_S_059', '빠른 일처리')) speed += 5;
  if (hasP('P_S_031', '가벼움')) speed += 1;
  if (hasP('P_S_032', '가벼움')) speed += 2;
  if (hasP('P_S_033', '가벼움')) speed += 4;

  const curHp = raw.hp !== undefined && raw.maxHp !== undefined ? Math.min(maxHp, Math.max(0, Number(raw.hp))) : (raw.currentHp !== undefined ? Number(raw.currentHp) : (options.hp !== undefined && options.maxHp !== undefined ? Math.min(maxHp, Math.max(0, Number(options.hp))) : maxHp));
  const maxBreak = Math.max(1, Number(raw.Character_BP ?? raw.maxBreak ?? options.maxBreak ?? 5));
  const curBreak = raw.currentBreak !== undefined ? Number(raw.currentBreak) : (options.currentBreak !== undefined ? Number(options.currentBreak) : maxBreak);
  const baseAggro = Math.max(1, Number(raw.Character_Aggro ?? raw.aggro ?? options.aggro ?? 5));

  const baseCharId = raw.Character_ID || raw.id || `CHAR_${Math.random().toString(36).substr(2, 6)}`;
  const uniqueCharId = options.characterId || (teamId === 'TEAM_B' ? `B_${formationPosition}_${baseCharId}` : baseCharId);

  return {
    characterId: uniqueCharId,
    rawCharacterId: baseCharId,
    name: raw.Character_Name || raw.name || '미식별 캐릭터',
    teamId: teamId,
    classType: classType,
    mainRole: mainRole,
    subRole: subRole,
    characterType: (raw.Character_Type || raw.characterType || raw.type || raw['속성'] || options.characterType || '청초').trim(),
    formationPosition: Number(formationPosition) || 1, // Striker: 1~5, Supporter: 1~3
    level: level,
    star: star,

    // Combat Stats
    hp: curHp,
    maxHp: maxHp,
    atk: atk,
    idolPower: idolPower,
    def: def,
    mdef: mdef,
    speed: speed,
    critChance: critChance,
    critDmg: (() => {
      const v = Number(raw['Character_Crit+Dmg'] ?? raw.critDmg ?? options.critDmg ?? 150);
      if (isNaN(v) || v <= 0) return 1.5;
      return v > 10 ? v / 100 : v;
    })(),
    accuracy: accuracy,
    evasion: evasion,
    resistance: reg,
    reg: reg,
    aggro: baseAggro,
    baseAggro: baseAggro,

    // Break
    currentBreak: curBreak,
    maxBreak: maxBreak,

    // Combat dynamic status
    shield: 0,
    statusSlots: [], // Array of StatusSlot (max 5 regular + undispellable)
    redSuperchat: null, // Innate Red Superchat blessing (separated from regular status slots)
    isBreaking: false,
    breakingTurnsRemaining: 0,
    isDead: false,

    // Skills & Card refs
    ultimateSkillId: (star >= 2) ? (raw.Character_AS || raw.ultimateSkillId || '') : '',
    uniqueSkillId: raw.Character_SS || raw.uniqueSkillId || '',
    basicSkillIds: [raw.Character_S1, raw.Character_S2, raw.Character_S3].filter(Boolean),
    passives: activePassives,
    ultimateUseCount: 0,
    skillMastery: options.skillMastery || raw.skillMastery || { SS: 0, AS: 0 },

    raw: raw
  };
}

/**
 * Factory for Team State
 */
export function createTeamState(teamId, isPlayer = false, characters = []) {
  return {
    teamId: teamId,
    isPlayer: isPlayer,
    characters: characters, // Array of CharacterBattleState
    teamGauge: 0,
    turnRequirement: 200,
    nextTurnRequirement: 200,
    currentTurnOverheat: 0,
    deck: [],
    discard: [],
    exhaust: [],
    hand: [],
    redSuperchatDrawBonus: 0,
    redSuperchatExtraDrawTurns: 0
  };
}

/**
 * Factory for Battle State
 */
export function createBattleState(teamA, teamB, seed = Date.now()) {
  return {
    battlePhase: BattlePhase.INITIALIZING,
    currentTick: 0,
    currentTurnOwner: null,
    turnCount: 0,
    teamA: teamA,
    teamB: teamB,
    seed: seed,
    battleResult: null, // 'PLAYER_WIN' | 'PLAYER_LOSE' | 'DRAW' | null
    battleLog: []
  };
}
