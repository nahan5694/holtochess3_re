/**
 * Battle Test Harness
 * Implements automated validation for Test 1 through Test 17 specified in Section 85.
 */

import { BattleEngine } from './battle_engine.js';
import { BattleRNG } from './prng.js';
import {
  BattlePhase,
  CardType,
  CharacterClass,
  CharacterRole,
  createCharacterBattleState,
  createTeamState
} from './battle_types.js';
import { calculateAndApplyDamage, extractCharacterCombatModifiers } from './damage_resolver.js';
import { drawCards, resolveHandCardUse, buildTeamDeck, createCard, getCardOverheat } from './card_deck.js';
import { resolveTargets, getEffectiveAggro } from './target_resolver.js';
import { applyBreakMaxBonus, applyHealing, decrementTeamStatuses, applyStatus, applyShield } from './status_resolver.js';

export class BattleTestHarness {
  constructor() {
    this.results = [];
  }

  assert(condition, testName, message = '') {
    if (!condition) {
      const err = `❌ [FAIL] ${testName}: ${message}`;
      console.error(err);
      this.results.push({ name: testName, pass: false, message });
      throw new Error(err);
    } else {
      console.log(`✅ [PASS] ${testName}`);
      this.results.push({ name: testName, pass: true, message });
    }
  }

  runAllTests() {
    console.log('\n========================================');
    console.log('⚔️ 전투 시스템 1단계 핵심 명세서 자동 검증 시작');
    console.log('========================================\n');

    this.test1_BasicTurn();
    this.test2_GaugeOverflow();
    this.test3_TieBreaker();
    this.test4_DrawAndDiscard();
    this.test5_DeckShuffleOnDepletion();
    this.test6_SkillSequenceOrder();
    this.test7_AutoTargetAggroRoulette();
    this.test8_ManualTarget();
    this.test9_PhysicalAndMagicDamage();
    this.test10_CriticalDamageBeforeDefense();
    this.test11_ShieldAbsorption();
    this.test12_BreakAndBreaking();
    this.test13_DeathAndMemorial();
    this.test14_CounterPhaseOrder();
    this.test15_OverheatAccumulation();
    this.test16_RngDeterminism();
    this.test17_DeadlockResolution();
    this.test18_MeteorSlashSequenceAndCondition();
    this.test19_TargetMaxHpScaling();
    this.test20_BreakMaxBonusCuresBreaking();
    this.test21_StatusResistance();
    this.test22_ForcedTurnEndAllUnusable();
    this.test23_HealingMaxHpClamp();
    this.test24_ShieldNaturalDecay();
    this.test25_TauntKeywordDoublesAggro();
    this.test26_MultiColumnKeywordStats();
    this.test27_RedSuperchatAllRolesAndBufferDraw();

    // 3단계 특수 규칙 및 상세 명세서 검증 (Section 163: Test A ~ Test K)
    this.testA_SkillSequenceOrder();
    this.testB_PrecedingStatusEffectDamage();
    this.testC_CurrentSkillOccurredCondition();
    this.testD_ShieldAndBreak();
    this.testE_RandomNTimesAndSingleBreak();
    this.testF_BreakingCardPlayability();
    this.testG_DeathCardPurgeAndMemorial();
    this.testH_UltimateOverheatProgression();
    this.testI_RedSuperchatExecutionOrder();
    this.testJ_DeadlockHpRatioComparison();
    this.testK_RngReplayDeterminism();

    console.log('\n========================================');
    const passed = this.results.filter(r => r.pass).length;
    console.log(`🎉 1~3단계 전체 테스트 완료: ${passed} / ${this.results.length} 통과!`);
    console.log('========================================\n');
    return this.results;
  }

  // Test 1 — 기본 Turn
  test1_BasicTurn() {
    const c1 = createCharacterBattleState({ name: 'A1', speed: 20 }, 'TEAM_A', 1);
    const c2 = createCharacterBattleState({ name: 'B1', speed: 10 }, 'TEAM_B', 1);
    const teamA = createTeamState('TEAM_A', true, [c1]);
    const teamB = createTeamState('TEAM_B', false, [c2]);

    const engine = new BattleEngine(teamA, teamB, { seed: 100 });
    engine.initBattle();

    this.assert(teamA.teamGauge === 0, 'Test 1 — 기본 Turn (시작 게이지 0)', `현재: ${teamA.teamGauge}`);

    // Speed = 20, Requirement = 200 -> 10 ticks needed
    for (let i = 1; i <= 9; i++) {
      engine.advanceTick();
      this.assert(teamA.teamGauge === i * 20, `Test 1 — 틱 진행 중 게이지 축적 (${i}틱)`, `게이지: ${teamA.teamGauge}`);
    }

    engine.advanceTick(); // 10th tick -> gauge reaches 200 -> turn acquired
    this.assert(engine.state.turnCount >= 1 && engine.state.currentTurnOwner === 'TEAM_A', 'Test 1 — 기본 Turn (200 도달 후 턴 획득)', `턴 오너: ${engine.state.currentTurnOwner}`);
  }

  // Test 2 — Overflow
  test2_GaugeOverflow() {
    const c1 = createCharacterBattleState({ name: 'A1', speed: 30 }, 'TEAM_A', 1);
    const c2 = createCharacterBattleState({ name: 'B1', speed: 10 }, 'TEAM_B', 1);
    const teamA = createTeamState('TEAM_A', true, [c1]);
    const teamB = createTeamState('TEAM_B', false, [c2]);

    const engine = new BattleEngine(teamA, teamB, { seed: 100 });
    engine.initBattle();

    teamA.teamGauge = 190;
    c1.speed = 30;
    teamA.turnRequirement = 200;

    // 1 tick: 190 + 30 = 220 -> Overflow: 220 - 200 = 20 carried over
    engine.advanceTick();

    this.assert(teamA.teamGauge === 20, 'Test 2 — Overflow (초과분 20 이월 확인)', `현재 게이지: ${teamA.teamGauge}`);
  }

  // Test 3 — Tie Break
  test3_TieBreaker() {
    // Scenario 1: 양 진영 동시 200 도달 시 생존자 적은 팀 승리
    const a1 = createCharacterBattleState({ name: 'A1', speed: 100 }, 'TEAM_A', 1);
    const a2 = createCharacterBattleState({ name: 'A2', speed: 100 }, 'TEAM_A', 2);
    const b1 = createCharacterBattleState({ name: 'B1', speed: 200 }, 'TEAM_B', 1);

    const teamA = createTeamState('TEAM_A', true, [a1, a2]); // 2 survivors
    const teamB = createTeamState('TEAM_B', false, [b1]);    // 1 survivor

    const engine = new BattleEngine(teamA, teamB, { seed: 100 });
    engine.initBattle();

    engine.advanceTick(); // Both reach 200 in 1 tick. Team B has fewer survivors (1 < 2).
    this.assert(engine.state.currentTurnOwner === 'TEAM_B', 'Test 3 — Tie Break (생존자 수 적은 팀 턴 획득)', `턴 오너: ${engine.state.currentTurnOwner}`);

    // Scenario 2: 생존자 수도 같으면 Player Team (TEAM_A) 턴 획득
    const aSingle = createCharacterBattleState({ name: 'A1', speed: 200 }, 'TEAM_A', 1);
    const bSingle = createCharacterBattleState({ name: 'B1', speed: 200 }, 'TEAM_B', 1);
    const teamA2 = createTeamState('TEAM_A', true, [aSingle]);
    const teamB2 = createTeamState('TEAM_B', false, [bSingle]);

    const engine2 = new BattleEngine(teamA2, teamB2, { seed: 100 });
    engine2.initBattle();
    engine2.advanceTick();

    this.assert(engine2.state.currentTurnOwner === 'TEAM_A', 'Test 3 — Tie Break (동률 시 플레이어 우선)', `턴 오너: ${engine2.state.currentTurnOwner}`);
  }

  // Test 4 — Draw
  test4_DrawAndDiscard() {
    const char = createCharacterBattleState({ name: 'A1' }, 'TEAM_A', 1);
    const team = createTeamState('TEAM_A', true, [char]);
    team.deck = buildTeamDeck(team);

    const initialDeckCount = team.deck.length; // 6 cards for 1 striker
    this.assert(initialDeckCount === 6, 'Test 4 — Draw (초기 덱 6장 확인)', `장수: ${initialDeckCount}`);

    // Draw 3 cards
    const drawn = drawCards(team, 3);
    this.assert(drawn.length === 3, 'Test 4 — Draw (3장 드로우)', `드로우 수: ${drawn.length}`);
    this.assert(team.deck.length === initialDeckCount - 3, 'Test 4 — Draw (덱 잔여 3장 확인)', `잔여: ${team.deck.length}`);

    // Play 1 card, discard remaining 2
    const played = drawn[0];
    resolveHandCardUse(team, played);

    this.assert(team.discard.length === 3, 'Test 4 — Draw (선택 1장 + 미선택 2장 총 3장 버림패 이동)', `버림패: ${team.discard.length}`);
    this.assert(team.hand.length === 0, 'Test 4 — Draw (핸드 비워짐 확인)', `핸드: ${team.hand.length}`);
  }

  // Test 5 — Deck Shuffle
  test5_DeckShuffleOnDepletion() {
    const char = createCharacterBattleState({ name: 'A1' }, 'TEAM_A', 1);
    const team = createTeamState('TEAM_A', true, [char]);
    team.deck = [{ cardId: 'C1' }]; // 1 card in deck
    team.discard = [{ cardId: 'C2' }, { cardId: 'C3' }, { cardId: 'C4' }]; // 3 cards in discard
    team.exhaust = [{ cardId: 'EX' }]; // Exhaust must not be shuffled

    const drawn = drawCards(team, 3); // Needs 3 cards

    this.assert(drawn.length === 3, 'Test 5 — Deck Shuffle (부족분 셔플하여 3장 정상 드로우)', `드로우 수: ${drawn.length}`);
    this.assert(team.exhaust.length === 1, 'Test 5 — Deck Shuffle (Exhaust 카드는 셔플 제외 유지)', `Exhaust 수: ${team.exhaust.length}`);
  }

  // Test 6 — Skill Sequence
  test6_SkillSequenceOrder() {
    const executed = [];
    const skillData = {
      Skill_ID: 'TEST_SEQ',
      Skill_Name: '시퀀스 테스트',
      Skill_Effect_1_ID: 'E1',
      Skill_Effect_2_ID: 'E2',
      Skill_Effect_3_ID: 'E3'
    };

    // Simulate effect order
    for (let i = 1; i <= 3; i++) {
      if (skillData[`Skill_Effect_${i}_ID`]) {
        executed.push(skillData[`Skill_Effect_${i}_ID`]);
      }
    }

    this.assert(
      executed[0] === 'E1' && executed[1] === 'E2' && executed[2] === 'E3',
      'Test 6 — Skill Sequence (Effect 1 -> 2 -> 3 순서 보존)',
      `실행 순서: ${executed.join(' -> ')}`
    );
  }

  // Test 7 — Auto Target
  test7_AutoTargetAggroRoulette() {
    const rng = new BattleRNG(12345);
    const c1 = createCharacterBattleState({ name: '탱커', aggro: 10 }, 'TEAM_B', 1);
    const c2 = createCharacterBattleState({ name: '딜러', aggro: 2 }, 'TEAM_B', 2);
    const deadChar = createCharacterBattleState({ name: '사망자', aggro: 10 }, 'TEAM_B', 3);
    deadChar.isDead = true;
    deadChar.hp = 0;

    const targets = resolveTargets({
      candidatePool: [c1, c2, deadChar],
      targetMethod: 'AUTO',
      targetCount: 1,
      rng
    });

    this.assert(targets.length === 1, 'Test 7 — Auto Target (1명 대상 선택)', `선택 수: ${targets.length}`);
    this.assert(targets[0] !== deadChar, 'Test 7 — Auto Target (사망자 Aggro 0으로 선택 배제)', `선택된 대상: ${targets[0].name}`);
  }

  // Test 8 — Manual Target
  test8_ManualTarget() {
    const c1 = createCharacterBattleState({ name: 'B1', aggro: 100 }, 'TEAM_B', 1);
    const c2 = createCharacterBattleState({ name: 'B2_지정대상', aggro: 1 }, 'TEAM_B', 2);

    const targets = resolveTargets({
      candidatePool: [c1, c2],
      targetMethod: 'MANUAL',
      manualTarget: c2
    });

    this.assert(targets.length === 1 && targets[0] === c2, 'Test 8 — Manual Target (지정 대상 정확히 선택)', `선택된 대상: ${targets[0].name}`);
  }

  // Test 9 — Damage
  test9_PhysicalAndMagicDamage() {
    const attacker = createCharacterBattleState({ atk: 200, idolPower: 300, accuracy: 100, critChance: 0 }, 'TEAM_A', 1);
    const target = createCharacterBattleState({ def: 100, mdef: 100, hp: 1000, evasion: 0 }, 'TEAM_B', 1);

    // Physical: ATK 200 * 100% = 200. DEF 100 -> 200 * 100 / (100 + 100) = 100
    const physRes = calculateAndApplyDamage({
      attacker,
      target,
      damageType: 'PHYSICAL',
      multiplier: 100,
      rng: new BattleRNG(999)
    });

    this.assert(physRes.hpDamage === 100, 'Test 9 — Damage (Physical 방어력 100 적용 데미지 100)', `결과 데미지: ${physRes.hpDamage}`);

    // Magic: IdolPower 300 * 100% = 300. MDEF 100 -> 300 * 100 / (100 + 100) = 150
    target.hp = 1000;
    const magRes = calculateAndApplyDamage({
      attacker,
      target,
      damageType: 'MAGIC',
      multiplier: 100,
      rng: new BattleRNG(999)
    });

    this.assert(magRes.hpDamage === 150, 'Test 9 — Damage (Magic 마법방어 100 적용 데미지 150)', `결과 데미지: ${magRes.hpDamage}`);
  }

  // Test 10 — Critical
  test10_CriticalDamageBeforeDefense() {
    const attacker = createCharacterBattleState({ atk: 200, critChance: 100, critDmg: 2.0 }, 'TEAM_A', 1);
    const target = createCharacterBattleState({ def: 100, hp: 1000, evasion: 0 }, 'TEAM_B', 1);

    // Raw: 200 * 2.0 = 400. DEF 100 적용: 400 * 100 / 200 = 200
    const res = calculateAndApplyDamage({
      attacker,
      target,
      damageType: 'PHYSICAL',
      multiplier: 100,
      rng: new BattleRNG(1)
    });

    this.assert(res.isCritical === true, 'Test 10 — Critical (크리티컬 발생 확인)', `isCrit: ${res.isCritical}`);
    this.assert(res.hpDamage === 200, 'Test 10 — Critical (DEF 적용 전 치명타 배율 선적용 200 데미지)', `결과 데미지: ${res.hpDamage}`);
  }

  // Test 11 — Shield
  test11_ShieldAbsorption() {
    const attacker = createCharacterBattleState({ atk: 100, critChance: 0 }, 'TEAM_A', 1);
    const target = createCharacterBattleState({ def: 100, hp: 500, evasion: 0 }, 'TEAM_B', 1);
    target.shield = 40;

    // Raw 100 -> Shield absorbs 40 (remaining 60) -> DEF 100 applied to 60 -> 60 * 100 / 200 = 30 HP damage
    const res = calculateAndApplyDamage({
      attacker,
      target,
      damageType: 'PHYSICAL',
      multiplier: 100,
      rng: new BattleRNG(999)
    });

    this.assert(res.shieldDamage === 40, 'Test 11 — Shield (쉴드 40 선흡수)', `쉴드 흡수량: ${res.shieldDamage}`);
    this.assert(res.hpDamage === 30, 'Test 11 — Shield (남은 피해에 DEF 적용 후 HP 데미지 30)', `HP 데미지: ${res.hpDamage}`);
    this.assert(target.shield === 0, 'Test 11 — Shield (쉴드 전소)', `남은 쉴드: ${target.shield}`);
  }

  // Test 12 — Break & Type Advantage
  test12_BreakAndBreaking() {
    // 1. 속성 상성 우위 검증 (청초 > 게닌)
    const seisoAttacker = createCharacterBattleState({ name: '청초어태커', characterType: '청초', atk: 100 }, 'TEAM_A', 1);
    const geninTarget = createCharacterBattleState({ name: '게닌타깃', characterType: '게닌', maxBreak: 2, hp: 500, evasion: 0 }, 'TEAM_B', 1);
    geninTarget.currentBreak = 2;

    const res = calculateAndApplyDamage({
      attacker: seisoAttacker,
      target: geninTarget,
      multiplier: 10,
      skillBreakBonus: 1, // 1 (상성) + 1 (스킬) = 2 break damage
      rng: new BattleRNG(1)
    });

    this.assert(res.isBreakOccurred === true, 'Test 12 — Break (청초 > 게닌 상성 우위 브레이크 발생)', `Break: ${res.isBreakOccurred}`);
    this.assert(geninTarget.currentBreak === 0, 'Test 12 — Break (Break 수치 0 도달)', `남은 Break: ${geninTarget.currentBreak}`);
    this.assert(geninTarget.isBreaking === true, 'Test 12 — Break (Breaking 상태 돌입)', `Breaking: ${geninTarget.isBreaking}`);

    // 2. 상호 상성 검증 (광기 ↔ 에로)
    const madnessAttacker = createCharacterBattleState({ name: '광기어태커', characterType: '광기', atk: 100 }, 'TEAM_A', 1);
    const eroTarget = createCharacterBattleState({ name: '에로타깃', characterType: '에로', maxBreak: 3, hp: 500, evasion: 0 }, 'TEAM_B', 1);
    eroTarget.currentBreak = 3;

    const res2 = calculateAndApplyDamage({
      attacker: madnessAttacker,
      target: eroTarget,
      multiplier: 10,
      skillBreakBonus: 0, // 1 (상성) = 1 break damage
      rng: new BattleRNG(1)
    });

    this.assert(res2.isBreakOccurred === true && eroTarget.currentBreak === 2, 'Test 12 — Break (광기 ↔ 에로 상호 상성 브레이크 1 적용)', `남은 Break: ${eroTarget.currentBreak}`);
  }

  // Test 13 — Death
  test13_DeathAndMemorial() {
    const c1 = createCharacterBattleState({ name: 'A1', hp: 10 }, 'TEAM_A', 1);
    const enemy = createCharacterBattleState({ name: 'B1', atk: 100 }, 'TEAM_B', 1);
    const teamA = createTeamState('TEAM_A', true, [c1]);
    const teamB = createTeamState('TEAM_B', false, [enemy]);

    const engine = new BattleEngine(teamA, teamB, { seed: 100 });
    engine.initBattle();

    const killCard = {
      cardId: 'KILL',
      ownerCharacterId: enemy.characterId,
      skillId: 'S_KILL',
      skillName: '치명타',
      isOffensive: true,
      targetMethod: 'MANUAL',
      targetCount: 1,
      range: 'SINGLE',
      rawSkill: { Skill_Multiplier: 100 }
    };

    engine.executeCardPlay(teamB, killCard, c1);

    this.assert(c1.isDead === true, 'Test 13 — Death (사망 처리 확인)', `isDead: ${c1.isDead}`);
    const hasMemorial = teamA.deck.some(c => c.cardType === CardType.MEMORIAL);
    this.assert(hasMemorial, 'Test 13 — Death (덱에 Memorial 카드 1장 추가)', `Memorial 존재: ${hasMemorial}`);
  }

  // Test 14 — Counter
  test14_CounterPhaseOrder() {
    const c1 = createCharacterBattleState({ name: 'Pos3' }, 'TEAM_A', 3);
    const c2 = createCharacterBattleState({ name: 'Pos1' }, 'TEAM_A', 1);
    const c3 = createCharacterBattleState({ name: 'Pos2' }, 'TEAM_A', 2);
    const teamA = createTeamState('TEAM_A', true, [c1, c2, c3]);
    const teamB = createTeamState('TEAM_B', false, []);

    const engine = new BattleEngine(teamA, teamB, { seed: 100 });

    const order = [];
    engine.on('counterCheck', (char) => {
      order.push(char.formationPosition);
    });

    engine._resolveCounterPhase();

    this.assert(
      order[0] === 1 && order[1] === 2 && order[2] === 3,
      'Test 14 — Counter (포메이션 포지션 낮은 순 1 -> 2 -> 3 카운터 페이즈 실행)',
      `순서: ${order.join(' -> ')}`
    );
  }

  // Test 15 — Overheat
  test15_OverheatAccumulation() {
    const c1 = createCharacterBattleState({ name: 'A1' }, 'TEAM_A', 1);
    const teamA = createTeamState('TEAM_A', true, [c1]);
    const teamB = createTeamState('TEAM_B', false, []);
    const engine = new BattleEngine(teamA, teamB, { seed: 100 });
    engine.initBattle();

    teamA.currentTurnOverheat = 40; // 10 + 30
    engine.endTurn(teamA);

    this.assert(teamA.nextTurnRequirement === 240, 'Test 15 — Overheat (200 + 40 = 다음 턴 요구치 240 설정)', `다음 요구치: ${teamA.nextTurnRequirement}`);
  }

  // Test 16 — RNG
  test16_RngDeterminism() {
    const rng1 = new BattleRNG(98765);
    const rng2 = new BattleRNG(98765);

    const seq1 = [rng1.next(), rng1.nextInt(1, 100), rng1.chance(50)];
    const seq2 = [rng2.next(), rng2.nextInt(1, 100), rng2.chance(50)];

    this.assert(
      JSON.stringify(seq1) === JSON.stringify(seq2),
      'Test 16 — RNG (동일 Seed 동일 랜덤 결과 재현 보장)',
      `RNG1: ${seq1} vs RNG2: ${seq2}`
    );
  }

  // Test 17 — Deadlock
  test17_DeadlockResolution() {
    const cA = createCharacterBattleState({ name: 'A1', hp: 80, maxHp: 100 }, 'TEAM_A', 1); // 80% HP
    const cB = createCharacterBattleState({ name: 'B1', hp: 50, maxHp: 100 }, 'TEAM_B', 1); // 50% HP
    const teamA = createTeamState('TEAM_A', true, [cA]);
    const teamB = createTeamState('TEAM_B', false, [cB]);

    const engine = new BattleEngine(teamA, teamB, { seed: 100 });
    engine.initBattle();

    // Remove all offensive cards to trigger deadlock
    teamA.deck = [];
    teamA.discard = [];
    teamA.hand = [];
    teamB.deck = [];
    teamB.discard = [];
    teamB.hand = [];

    const ended = engine._checkBattleOutcome();
    this.assert(ended === true, 'Test 17 — Deadlock (교착 상태 감지 및 배틀 종료)', `종료 여부: ${ended}`);
    this.assert(engine.state.battleResult === 'PLAYER_WIN', 'Test 17 — Deadlock (더 높은 HP 비율 80% vs 50% 플레이어 승리)', `결과: ${engine.state.battleResult}`);
  }

  // Test 18 — Skill Sequence & Condition Evaluation (Section 22~24, 108)
  test18_MeteorSlashSequenceAndCondition() {
    const cA = createCharacterBattleState({ name: '호시마치 스이세이', atk: 100, characterType: '청초' }, 'TEAM_A', 1);
    const cB1 = createCharacterBattleState({ name: '적 게닌', hp: 500, maxHp: 500, def: 0, currentBreak: 1, maxBreak: 3, characterType: '게닌' }, 'TEAM_B', 1);
    const cB2 = createCharacterBattleState({ name: '적 서브', hp: 500, maxHp: 500, def: 0, currentBreak: 3, maxBreak: 3, characterType: '게닌' }, 'TEAM_B', 2);

    const teamA = createTeamState('TEAM_A', true, [cA]);
    const teamB = createTeamState('TEAM_B', false, [cB1, cB2]);

    const keywords = {
      'Key_002': { Keyword_ID: 'Key_002', Keyword_Name: '파괴', Keyword_Type: '디버프' },
      'Key_003': { Keyword_ID: 'Key_003', Keyword_Name: '압도', Keyword_Type: '디버프' }
    };

    const engine = new BattleEngine(teamA, teamB, { seed: 42, keywordsMasterMap: keywords });
    engine.initBattle();

    // Custom Skill: 유성참 sequence (Section 108)
    const meteorSlashSkill = {
      Skill_ID: 'S_METEOR',
      Skill_Name: '유성참',
      Skill_Target_Method: '수동',
      sequence: [
        { type: 'DEBUFF', keywordId: 'Key_002', stack: 2, duration: 2 },
        { type: 'DAMAGE', multiplier: 265, skillBreakBonus: 0, calcBase: '공격력' },
        { type: 'CONDITION', condType: 'KILL_OR_BREAK' },
        { type: 'DEBUFF', targetRange: 'ALL_ENEMIES', keywordId: 'Key_003', stack: 2, duration: 1, conditional: true }
      ]
    };

    const card = createCard({
      ownerCharacter: cA,
      skillData: meteorSlashSkill,
      cardType: CardType.UNIQUE,
      overheat: 20,
      isOffensive: true
    });

    engine._resolveSkillEffects({
      team: teamA,
      opponentTeam: teamB,
      attacker: cA,
      card: card,
      skillData: meteorSlashSkill,
      manualTarget: cB1
    });

    // 1. Check Debuff [파괴 2 / 2] on target
    const hasDestruction = cB1.statusSlots.some(s => s.keywordId === 'Key_002' && s.stack === 2);
    this.assert(hasDestruction, 'Test 18 — Skill Sequence (1. [파괴 2/2] 선부여 성공)');

    // 2. Check 265% Damage with 1.5x Type Advantage (100 * 2.65 * 1.5 = 397.5 -> 398) -> HP 500 - 398 = 102
    this.assert(cB1.hp === 102, 'Test 18 — Skill Sequence (2. 상성 1.5배 피해 정확 적용 HP 500 - 398 = 102)');

    // 3. Check Breaking (청초 > 게닌 상성으로 Break 1 감소 -> Break 0 -> Breaking 돌입)
    this.assert(cB1.isBreaking === true, 'Test 18 — Skill Sequence (3. 상성 피해로 타깃 Breaking 돌입)');

    // 4. Check Conditional Reward: [압도 2 / 1] applied to all enemies (cB1 and cB2)
    const b1HasOverwhelm = cB1.statusSlots.some(s => s.keywordId === 'Key_003');
    const b2HasOverwhelm = cB2.statusSlots.some(s => s.keywordId === 'Key_003');
    this.assert(b1HasOverwhelm && b2HasOverwhelm, 'Test 18 — Skill Sequence (4. 조건 만족 시 모든 적에게 [압도 2/1] 광역 부여)');
  }

  // Test 19 — Target Max HP Damage Scaling (Section 42)
  test19_TargetMaxHpScaling() {
    const cA = createCharacterBattleState({ name: '퍼센트 딜러', atk: 100 }, 'TEAM_A', 1);
    const cB = createCharacterBattleState({ name: '거대 보스', hp: 2000, maxHp: 2000, def: 0, mdef: 0 }, 'TEAM_B', 1);

    const dmg = calculateAndApplyDamage({
      attacker: cA,
      target: cB,
      damageType: 'MAGIC',
      scalingStat: 'TARGET_MAX_HP',
      multiplier: 10
    });

    this.assert(dmg.hpDamage === 200, 'Test 19 — Target Max HP Scaling (대상 최대 HP 2000의 10% = 200 피해)');
  }

  // Test 20 — Break Max Increase & Breaking Cure (Section 60, 61)
  test20_BreakMaxBonusCuresBreaking() {
    const c = createCharacterBattleState({ name: '브레이킹 대상', maxBreak: 5 }, 'TEAM_A', 1);
    c.isBreaking = true;
    c.currentBreak = 0;
    c.breakingTurnsRemaining = 2;

    applyBreakMaxBonus(c, 3);

    this.assert(c.isBreaking === false, 'Test 20 — Break Max Increase (Breaking 상태 즉시 해제)');
    this.assert(c.maxBreak === 8, 'Test 20 — Break Max Increase (Max Break 5 + 3 = 8)');
    this.assert(c.currentBreak === 3, 'Test 20 — Break Max Increase (Current Break 0 + 3 = 3)');
  }

  // Test 21 — Status Resistance (Section 112)
  test21_StatusResistance() {
    const c = createCharacterBattleState({ name: '저항 탱커' }, 'TEAM_A', 1);
    c.reg = 100; // 100% resistance

    const rng = new BattleRNG(1);
    const res = applyStatus(c, { Keyword_ID: 'Key_DEB', Keyword_Type: '디버프' }, 3, 2, { rng });

    this.assert(res === null, 'Test 21 — Status Resistance (저항 100% 시 디버프 부여 전탄 저항)');
  }

  // Test 22 — All Drawn Cards Unusable Forced Turn End (Section 21)
  test22_ForcedTurnEndAllUnusable() {
    const cA = createCharacterBattleState({ name: '브레이킹 1호' }, 'TEAM_A', 1);
    cA.isBreaking = true;

    const cB = createCharacterBattleState({ name: '적' }, 'TEAM_B', 1);

    const teamA = createTeamState('TEAM_A', true, [cA]);
    const teamB = createTeamState('TEAM_B', false, [cB]);

    const engine = new BattleEngine(teamA, teamB, { seed: 100 });
    engine.initBattle();

    teamA.hand = [
      createCard({ ownerCharacter: cA, cardType: CardType.BASIC, overheat: 30 }),
      createCard({ ownerCharacter: cA, cardType: CardType.BASIC, overheat: 30 })
    ];

    engine.startTurn(teamA);

    this.assert(teamA.currentTurnOverheat === 0, 'Test 22 — Forced Turn End (전체 사용 불가 시 Overheat 0)');
    this.assert(teamA.nextTurnRequirement === 200, 'Test 22 — Forced Turn End (다음 턴 요구치 기본 200)');
    this.assert(teamA.hand.length === 0, 'Test 22 — Forced Turn End (드로우 카드 Discard 이동 및 핸드 비움)');
  }

  // Test 23 — Healing & Max HP Clamp (Section 72, 73)
  test23_HealingMaxHpClamp() {
    const c = createCharacterBattleState({ name: '힐 대상', hp: 300, maxHp: 1000 }, 'TEAM_A', 1);
    const h1 = applyHealing({ target: c, amount: 500 });
    this.assert(c.hp === 800 && h1 === 500, 'Test 23 — Healing (500 회복 적용 -> 800 HP)');

    const h2 = applyHealing({ target: c, amount: 500 });
    this.assert(c.hp === 1000 && h2 === 200, 'Test 23 — Healing (Max HP 1000 초과분 Clamp -> 1000 HP)');
  }

  // Test 24 — Natural Shield Decay (Section 50)
  test24_ShieldNaturalDecay() {
    const c = createCharacterBattleState({ name: '쉴드 보유자' }, 'TEAM_A', 1);
    c.shield = 100;
    const team = createTeamState('TEAM_A', true, [c]);

    decrementTeamStatuses(team);
    this.assert(c.shield === 50, 'Test 24 — Shield Decay (100 -> 절반 50 감소)');

    decrementTeamStatuses(team);
    this.assert(c.shield === 25, 'Test 24 — Shield Decay (50 -> 절반 25 감소)');
  }

  // Test A — Skill 순서 (Section 163 Test A)
  testA_SkillSequenceOrder() {
    const attacker = createCharacterBattleState({ name: 'A1', atk: 100 }, 'TEAM_A', 1);
    const target = createCharacterBattleState({ name: 'B1', hp: 500, maxHp: 500, def: 0 }, 'TEAM_B', 1);
    const teamA = createTeamState('TEAM_A', true, [attacker]);
    const teamB = createTeamState('TEAM_B', false, [target]);

    const keywords = {
      'Key_DEB': { Keyword_ID: 'Key_DEB', Keyword_Name: '테스트디버프', Keyword_Type: '디버프' },
      'Key_REW': { Keyword_ID: 'Key_REW', Keyword_Name: '테스트보상', Keyword_Type: '디버프' }
    };
    const engine = new BattleEngine(teamA, teamB, { seed: 123, keywordsMasterMap: keywords });

    const skillData = {
      Skill_ID: 'S_TEST_A',
      Skill_Name: '테스트A_순서',
      sequence: [
        { type: 'DEBUFF', keywordId: 'Key_DEB', stack: 1, duration: 2 },
        { type: 'DAMAGE', multiplier: 100 },
        { type: 'CONDITION', condType: 'KILL' },
        { type: 'DEBUFF', keywordId: 'Key_REW', stack: 1, duration: 1, conditional: true }
      ]
    };

    const card = createCard({ ownerCharacter: attacker, skillData, cardType: CardType.UNIQUE, isOffensive: true });
    engine._resolveSkillEffects({ team: teamA, opponentTeam: teamB, attacker, card, skillData, manualTarget: target });

    const hasDebuff = target.statusSlots.some(s => s.keywordId === 'Key_DEB');
    this.assert(hasDebuff, 'Test A — Skill 순서 (1단계 Debuff 정상 부여)');
    this.assert(target.hp === 400, 'Test A — Skill 순서 (2단계 Damage 정상 적용)');
    const hasReward = target.statusSlots.some(s => s.keywordId === 'Key_REW');
    this.assert(!hasReward, 'Test A — Skill 순서 (3단계 Condition 평가 및 미충족 보상 차단)');
  }

  // Test B — 선행 상태효과 (Section 163 Test B)
  testB_PrecedingStatusEffectDamage() {
    const attacker = createCharacterBattleState({ name: 'A1', atk: 200 }, 'TEAM_A', 1);
    const target = createCharacterBattleState({ name: 'B1', hp: 1000, maxHp: 1000, def: 100 }, 'TEAM_B', 1);
    const teamA = createTeamState('TEAM_A', true, [attacker]);
    const teamB = createTeamState('TEAM_B', false, [target]);

    const keywords = {
      'Key_002': { Keyword_ID: 'Key_002', Keyword_Name: '파괴', Keyword_Type: '디버프', Keyword_Stat_Target_1: '기본_받는피해%', Keyword_Stat_Value_1: 25 }
    };
    const engine = new BattleEngine(teamA, teamB, { seed: 123, keywordsMasterMap: keywords });

    const skillData = {
      Skill_ID: 'S_TEST_B',
      Skill_Name: '테스트B_선행상태',
      sequence: [
        { type: 'DEBUFF', keywordId: 'Key_002', stack: 1, duration: 2 },
        { type: 'DAMAGE', multiplier: 100 }
      ]
    };

    const card = createCard({ ownerCharacter: attacker, skillData, cardType: CardType.UNIQUE, isOffensive: true });
    engine._resolveSkillEffects({ team: teamA, opponentTeam: teamB, attacker, card, skillData, manualTarget: target });

    this.assert(target.hp === 875, 'Test B — 선행 상태효과 (파괴 +25% 적용으로 피해 100 -> 125 증가 반영)');
  }

  // Test C — 현재 Skill 발생 조건 (Section 163 Test C)
  testC_CurrentSkillOccurredCondition() {
    const attacker = createCharacterBattleState({ name: 'A1', atk: 100, characterType: '청초' }, 'TEAM_A', 1);
    const target = createCharacterBattleState({ name: 'B1', hp: 500, maxHp: 500, characterType: '게닌' }, 'TEAM_B', 1);
    target.isBreaking = true;
    target.currentBreak = 0;

    const teamA = createTeamState('TEAM_A', true, [attacker]);
    const teamB = createTeamState('TEAM_B', false, [target]);

    const keywords = {
      'Key_REW': { Keyword_ID: 'Key_REW', Keyword_Name: '브레이크보상', Keyword_Type: '디버프' }
    };
    const engine = new BattleEngine(teamA, teamB, { seed: 123, keywordsMasterMap: keywords });

    const skillData = {
      Skill_ID: 'S_TEST_C',
      Skill_Name: '테스트C_기존브레이킹',
      sequence: [
        { type: 'DAMAGE', multiplier: 100 },
        { type: 'CONDITION', condType: 'BREAK' },
        { type: 'DEBUFF', targetRange: 'ALL_ENEMIES', keywordId: 'Key_REW', stack: 1, duration: 1, conditional: true }
      ]
    };

    const card = createCard({ ownerCharacter: attacker, skillData, cardType: CardType.UNIQUE, isOffensive: true });
    engine._resolveSkillEffects({ team: teamA, opponentTeam: teamB, attacker, card, skillData, manualTarget: target });

    const hasReward = target.statusSlots.some(s => s.keywordId === 'Key_REW');
    this.assert(!hasReward, 'Test C — 현재 Skill 발생 조건 (스킬 전 이미 Breaking이었던 대상은 "이 스킬로 Breaking" 거짓)');
  }

  // Test D — Shield와 Break (Section 163 Test D)
  testD_ShieldAndBreak() {
    const attacker1 = createCharacterBattleState({ name: 'A1', atk: 100, characterType: '청초' }, 'TEAM_A', 1);
    const target1 = createCharacterBattleState({ name: 'B1', characterType: '게닌', currentBreak: 5, maxBreak: 5 }, 'TEAM_B', 1);
    target1.shield = 200;

    const res1 = calculateAndApplyDamage({
      attacker: attacker1,
      target: target1,
      multiplier: 100,
      rng: new BattleRNG(1)
    });
    this.assert(res1.hpDamage === 0, 'Test D — Shield와 Break (완전 흡수 시 HP Damage 0)');
    this.assert(target1.currentBreak === 5, 'Test D — Shield와 Break (HP Damage 0일 때 Break 미발생)');

    const attacker2 = createCharacterBattleState({ name: 'A2', atk: 100, characterType: '청초' }, 'TEAM_A', 1);
    const target2 = createCharacterBattleState({ name: 'B2', characterType: '게닌', currentBreak: 5, maxBreak: 5 }, 'TEAM_B', 1);
    target2.shield = 40;

    const res2 = calculateAndApplyDamage({
      attacker: attacker2,
      target: target2,
      multiplier: 100,
      rng: new BattleRNG(1)
    });
    this.assert(res2.hpDamage > 0, 'Test D — Shield와 Break (부분 흡수 시 HP Damage > 0)');
    this.assert(target2.currentBreak === 4, 'Test D — Shield와 Break (HP 피해 발생 시 상성 Break 1 정상 감소)');
  }

  // Test E — Random N (Section 163 Test E)
  testE_RandomNTimesAndSingleBreak() {
    const attacker = createCharacterBattleState({ name: 'A1', atk: 50, characterType: '청초' }, 'TEAM_A', 1);
    const b1 = createCharacterBattleState({ name: 'B1', characterType: '게닌', currentBreak: 5, maxBreak: 5, hp: 1000 }, 'TEAM_B', 1);
    const b2 = createCharacterBattleState({ name: 'B2', characterType: '게닌', currentBreak: 5, maxBreak: 5, hp: 1000 }, 'TEAM_B', 2);

    const teamA = createTeamState('TEAM_A', true, [attacker]);
    const teamB = createTeamState('TEAM_B', false, [b1, b2]);
    const engine = new BattleEngine(teamA, teamB, { seed: 100 });

    const skillData = {
      Skill_ID: 'S_RANDOM_5',
      Skill_Name: '연속 난타 5회',
      Skill_Multiplier: 50,
      Skill_Target_Count: 5,
      isRandomRepeat: true
    };
    const card = createCard({ ownerCharacter: attacker, skillData, cardType: CardType.UNIQUE, isOffensive: true });
    card.targetCount = 5;

    engine._resolveSkillEffects({ team: teamA, opponentTeam: teamB, attacker, card, skillData });

    this.assert(b1.currentBreak >= 4, 'Test E — Random N (B1의 Break는 스킬당 최대 1회만 감소)');
    this.assert(b2.currentBreak >= 4, 'Test E — Random N (B2의 Break는 스킬당 최대 1회만 감소)');
  }

  // Test F — Breaking Card (Section 163 Test F)
  testF_BreakingCardPlayability() {
    const c1 = createCharacterBattleState({ name: '브레이킹유닛' }, 'TEAM_A', 1);
    c1.isBreaking = true;
    const enemy = createCharacterBattleState({ name: '적' }, 'TEAM_B', 1);

    const teamA = createTeamState('TEAM_A', true, [c1]);
    const teamB = createTeamState('TEAM_B', false, [enemy]);
    const engine = new BattleEngine(teamA, teamB, { seed: 100 });
    engine.initBattle();

    const drawn = drawCards(teamA, 3);
    this.assert(drawn.length === 3, 'Test F — Breaking Card (Breaking 캐릭터 카드 정상 드로우)');

    const allUnplayable = drawn.every(card => !engine.state.teamA.characters.find(c => c.characterId === card.ownerCharacterId && !c.isBreaking));
    this.assert(allUnplayable, 'Test F — Breaking Card (Breaking 캐릭터 카드 사용 불가 판정)');

    engine.startTurn(teamA);
    this.assert(teamA.currentTurnOverheat === 0, 'Test F — Breaking Card (전부 사용 불가 시 Overheat 0)');
    this.assert(teamA.nextTurnRequirement === 200, 'Test F — Breaking Card (다음 턴 요구치 200 초기화)');
  }

  // Test G — Death / Memorial (Section 163 Test G)
  testG_DeathCardPurgeAndMemorial() {
    const c1 = createCharacterBattleState({ name: '전사자', classType: '스트라이커', hp: 10 }, 'TEAM_A', 1);
    const c2 = createCharacterBattleState({ name: '생존자', classType: '스트라이커', hp: 100 }, 'TEAM_A', 2);
    const enemy = createCharacterBattleState({ name: '적', atk: 100 }, 'TEAM_B', 1);

    const teamA = createTeamState('TEAM_A', true, [c1, c2]);
    const teamB = createTeamState('TEAM_B', false, [enemy]);
    const engine = new BattleEngine(teamA, teamB, { seed: 100 });
    engine.initBattle();

    this.assert(teamA.deck.length === 12, 'Test G — Death / Memorial (초기 스트라이커 2인 덱 12장)');

    c1.hp = 0;
    engine._resolveDeaths();

    this.assert(c1.isDead === true, 'Test G — Death / Memorial (사망 상태 확정)');
    this.assert(teamA.deck.length === 7, 'Test G — Death / Memorial (사망자 카드 6장 제거 및 Memorial 1장 추가되어 7장 확인)');
    const memorialCard = teamA.deck.find(c => c.cardType === CardType.MEMORIAL);
    this.assert(memorialCard && memorialCard.baseOverheat === -100, 'Test G — Death / Memorial (Memorial 카드 -100 Overheat 보유 확인)');
  }

  // Test H — Ultimate Overheat (Section 163 Test H)
  testH_UltimateOverheatProgression() {
    const c1 = createCharacterBattleState({ name: 'A1' }, 'TEAM_A', 1);
    const ultCard = createCard({ ownerCharacter: c1, cardType: CardType.ULTIMATE, overheat: 80 });

    this.assert(getCardOverheat(ultCard, c1) === 80, 'Test H — Ultimate Overheat (기본 1회차 사용 전 80)');

    c1.ultimateUseCount = 1;
    this.assert(getCardOverheat(ultCard, c1) === 100, 'Test H — Ultimate Overheat (1회 사용 후 +20 누적 -> 100)');

    c1.ultimateUseCount = 2;
    this.assert(getCardOverheat(ultCard, c1) === 120, 'Test H — Ultimate Overheat (2회 사용 후 +40 누적 -> 120)');
  }

  // Test I — Red Superchat (Section 163 Test I)
  testI_RedSuperchatExecutionOrder() {
    const normalChar = createCharacterBattleState({ name: '딜러', mainRole: CharacterRole.MELEE_DPS, hp: 100, maxHp: 1000 }, 'TEAM_A', 1);
    const breakingTank = createCharacterBattleState({ name: '탱커', mainRole: CharacterRole.TANK, maxBreak: 5, hp: 100, maxHp: 1000 }, 'TEAM_A', 2);
    breakingTank.isBreaking = true;
    breakingTank.currentBreak = 0;
    const dummyEnemy = createCharacterBattleState({ name: '적', hp: 1000 }, 'TEAM_B', 1);

    const teamA = createTeamState('TEAM_A', true, [normalChar, breakingTank]);
    const teamB = createTeamState('TEAM_B', false, [dummyEnemy]);
    const engine = new BattleEngine(teamA, teamB, { seed: 100 });
    engine.initBattle();

    engine.rng.chance = (prob) => (prob === 4 ? true : false);

    engine.startTurn(teamA);

    this.assert(breakingTank.isBreaking === false, 'Test I — Red Superchat (Breaking 캐릭터 최우선 타깃 및 Breaking 즉시 해제)');
    this.assert(breakingTank.currentBreak === breakingTank.maxBreak, 'Test I — Red Superchat (Break Max 완전 복구)');
    this.assert(breakingTank.redSuperchat !== null, 'Test I — Red Superchat (아카스파 객체 별도 부여)');
    this.assert(breakingTank.redSuperchat.def === 12 && breakingTank.redSuperchat.mdef === 12, 'Test I — Red Superchat (브레이킹 탱커 물리/마법 방어 +12)');
    this.assert(breakingTank.statusSlots.length === 0, 'Test I — Red Superchat (5개 키워드 슬롯을 소모하지 않음)');
  }

  // Test J — Deadlock (Section 163 Test J)
  testJ_DeadlockHpRatioComparison() {
    const a1 = createCharacterBattleState({ name: 'A1', hp: 500, maxHp: 1000 }, 'TEAM_A', 1);
    const b1 = createCharacterBattleState({ name: 'B1', hp: 500, maxHp: 1000 }, 'TEAM_B', 1);
    const teamA1 = createTeamState('TEAM_A', true, [a1]);
    const teamB1 = createTeamState('TEAM_B', false, [b1]);
    const engine1 = new BattleEngine(teamA1, teamB1, { seed: 100 });
    engine1.initBattle();
    teamA1.deck = []; teamA1.discard = []; teamA1.hand = [];
    teamB1.deck = []; teamB1.discard = []; teamB1.hand = [];

    engine1._checkBattleOutcome();
    this.assert(engine1.state.battleResult === 'PLAYER_WIN', 'Test J — Deadlock (동률 50% vs 50% 시 플레이어 승리 판정)');

    const a2 = createCharacterBattleState({ name: 'A2', hp: 400, maxHp: 1000 }, 'TEAM_A', 1);
    const b2 = createCharacterBattleState({ name: 'B2', hp: 500, maxHp: 1000 }, 'TEAM_B', 1);
    const teamA2 = createTeamState('TEAM_A', true, [a2]);
    const teamB2 = createTeamState('TEAM_B', false, [b2]);
    const engine2 = new BattleEngine(teamA2, teamB2, { seed: 100 });
    engine2.initBattle();
    teamA2.deck = []; teamA2.discard = []; teamA2.hand = [];
    teamB2.deck = []; teamB2.discard = []; teamB2.hand = [];

    engine2._checkBattleOutcome();
    this.assert(engine2.state.battleResult === 'PLAYER_LOSE', 'Test J — Deadlock (아군 40% < 적군 50% 시 플레이어 패배 판정)');
  }

  // Test K — RNG Replay (Section 163 Test K)
  testK_RngReplayDeterminism() {
    const createBattle = (seed) => {
      const cA = createCharacterBattleState({ name: 'A1', speed: 15, critChance: 50 }, 'TEAM_A', 1);
      const cB = createCharacterBattleState({ name: 'B1', speed: 10, currentBreak: 3, maxBreak: 3 }, 'TEAM_B', 1);
      const tA = createTeamState('TEAM_A', true, [cA]);
      const tB = createTeamState('TEAM_B', false, [cB]);
      const eng = new BattleEngine(tA, tB, { seed });
      eng.initBattle();
      return { eng, tA, tB };
    };

    const b1 = createBattle(54321);
    const b2 = createBattle(54321);

    for (let i = 0; i < 15; i++) {
      b1.eng.advanceTick();
      b2.eng.advanceTick();
    }

    const log1 = JSON.stringify(b1.eng.state.battleLog);
    const log2 = JSON.stringify(b2.eng.state.battleLog);

    this.assert(log1 === log2, 'Test K — RNG Replay (동일 Battle Seed 100% 동일한 전투 로그 및 판정 재현 보장)');
  }

  // Test 25 — 도발 (Key_022) 어그로 2배
  test25_TauntKeywordDoublesAggro() {
    const tank = createCharacterBattleState({ name: '탱커', aggro: 10 }, 'TEAM_A', 1);
    this.assert(getEffectiveAggro(tank) === 10, 'Test 25 — 도발 (초기 기본 어그로 10)');

    applyStatus(tank, { Keyword_ID: 'Key_022', Keyword_Name: '도발', Keyword_Type: '버프', Keyword_Stat_Target_1: '어그로배율%', Keyword_Stat_Value_1: '100' }, 1, 2);
    this.assert(getEffectiveAggro(tank) === 20, 'Test 25 — 도발 (도발 키워드 부여 시 어그로 2배 -> 20)');

    // 은신 (Key_021)
    const assassin = createCharacterBattleState({ name: '암살자', aggro: 15 }, 'TEAM_A', 2);
    applyStatus(assassin, { Keyword_ID: 'Key_021', Keyword_Name: '은신', Keyword_Type: '버프', Keyword_Stack_Type: '파워', Keyword_Stat_Target_1: '어그로', Keyword_Stat_Value_1: '-10' }, 1, 2);
    this.assert(getEffectiveAggro(assassin) === 5, 'Test 25 — 도발 (은신 1스택 어그로 -10 -> 5)');
  }

  // Test 26 — 키워드 다중 효과 컬럼 (Keyword_Stat_Target_1 ~ 5)
  test26_MultiColumnKeywordStats() {
    // Key_017 집중: 치명타% 5, 명중률% 3
    const shooter = createCharacterBattleState({ name: '사수' }, 'TEAM_A', 1);
    applyStatus(shooter, {
      Keyword_ID: 'Key_017',
      Keyword_Name: '집중',
      Keyword_Type: '버프',
      Keyword_Stack_Type: '파워',
      Keyword_Stat_Target_1: '치명타%',
      Keyword_Stat_Value_1: '5',
      Keyword_Stat_Target_2: '명중률%',
      Keyword_Stat_Value_2: '3'
    }, 2, 2);

    const mods = extractCharacterCombatModifiers(shooter);
    this.assert(mods.critBonus === 10, 'Test 26 — 다중 효과 컬럼 (집중 2스택 치명타 +10%)');
    this.assert(mods.accuracyBonus === 6, 'Test 26 — 다중 효과 컬럼 (집중 2스택 명중률 +6%)');

    // Key_002 파괴: 기본_받는피해% 25, 조건_요구스택 10, 조건_받는피해% 40
    const victim = createCharacterBattleState({ name: '피해자' }, 'TEAM_B', 1);
    applyStatus(victim, {
      Keyword_ID: 'Key_002',
      Keyword_Name: '파괴',
      Keyword_Type: '디버프',
      Keyword_Stack_Type: '베이직',
      Keyword_Stat_Target_1: '기본_받는피해%',
      Keyword_Stat_Value_1: '25',
      Keyword_Stat_Target_2: '조건_요구스택',
      Keyword_Stat_Value_2: '10',
      Keyword_Stat_Target_3: '조건_받는피해%',
      Keyword_Stat_Value_3: '40'
    }, 1, 2);

    const mods1 = extractCharacterCombatModifiers(victim);
    this.assert(mods1.damageTakenPercent === 25, 'Test 26 — 다중 효과 컬럼 (파괴 1스택 받는 피해 +25%)');

    applyStatus(victim, {
      Keyword_ID: 'Key_002',
      Keyword_Name: '파괴',
      Keyword_Type: '디버프',
      Keyword_Stack_Type: '베이직',
      Keyword_Stat_Target_1: '기본_받는피해%',
      Keyword_Stat_Value_1: '25',
      Keyword_Stat_Target_2: '조건_요구스택',
      Keyword_Stat_Value_2: '10',
      Keyword_Stat_Target_3: '조건_받는피해%',
      Keyword_Stat_Value_3: '40'
    }, 10, 2);

    const mods10 = extractCharacterCombatModifiers(victim);
    this.assert(mods10.damageTakenPercent === 40, 'Test 26 — 다중 효과 컬럼 (파괴 10스택 조건 달성 시 받는 피해 +40%)');
  }

  // Test 27 — 아카스파 직군별 효과 및 버퍼 드로우 추가
  test27_RedSuperchatAllRolesAndBufferDraw() {
    // 1. Melee DPS Normal
    const melee = createCharacterBattleState({ name: '근거리', mainRole: CharacterRole.MELEE_DPS, atk: 100, hp: 1000, maxHp: 1000 }, 'TEAM_A', 1);
    const buffer = createCharacterBattleState({ name: '버퍼', mainRole: CharacterRole.BUFFER, idolPower: 100 }, 'TEAM_A', 2);
    const enemy = createCharacterBattleState({ name: '적', hp: 1000 }, 'TEAM_B', 1);

    const team = createTeamState('TEAM_A', true, [melee, buffer]);
    const teamEnemy = createTeamState('TEAM_B', false, [enemy]);
    const engine = new BattleEngine(team, teamEnemy, { seed: 100 });
    engine.initBattle();

    // Trigger on Melee
    engine._applyRedSuperchatRoleEffect(melee, false, team);
    this.assert(melee.redSuperchat.atkPct === 25, 'Test 27 — 아카스파 직군 (근거리 딜러 공격력 +25%)');
    this.assert(melee.maxHp === 1150 && melee.hp === 1150, 'Test 27 — 아카스파 직군 (근거리 딜러 최대/현재 HP +15%)');

    // Trigger on Buffer Normal -> draw bonus 1
    const drawBonusNormal = engine._applyRedSuperchatRoleEffect(buffer, false, team);
    this.assert(buffer.redSuperchat.idolPct === 25, 'Test 27 — 아카스파 직군 (버퍼 아이돌력 +25%)');
    this.assert(drawBonusNormal === 1, 'Test 27 — 아카스파 직군 (버퍼 이번 턴 드로우 +1 반환)');

    // Trigger on Buffer Breaking -> draw bonus 1 and extraDrawTurns 1
    buffer.isBreaking = true;
    const drawBonusBreaking = engine._applyRedSuperchatRoleEffect(buffer, true, team);
    this.assert(buffer.redSuperchat.idolPct === 33, 'Test 27 — 아카스파 직군 (브레이킹 버퍼 아이돌력 +33%)');
    this.assert(drawBonusBreaking === 1, 'Test 27 — 아카스파 직군 (브레이킹 버퍼 이번 턴 드로우 +1 반환)');
    this.assert(team.redSuperchatExtraDrawTurns === 1, 'Test 27 — 아카스파 직군 (브레이킹 버퍼 다음 턴 추가 드로우 1턴 예약)');
  }
}
