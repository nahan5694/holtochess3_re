import { GameData, PlayerData } from './state.js?v=004276';
import { updateTopCurrencies } from './ui.js?v=004276';

let currentLiveMode = null; // 'memorial', 'field', 'holofes'

export function initLiveSystem() {
    // Bind main live entry from menu
    document.querySelector('.menu-btn[data-target="scene-3"]')?.addEventListener('click', () => {
        openLiveScene();
    });
}

window.startLiveMode = function(mode) {
    currentLiveMode = mode;
    
    // Switch container views
    document.getElementById('live-entry-container').style.display = 'none';
    document.getElementById('live-ongoing-container').style.display = 'flex';
        const btnGiveup = document.querySelector('.btn-giveup-live'); if(btnGiveup) btnGiveup.style.display = 'inline-block';
    
    let modeName = "기념 라이브";
    if (mode === 'field') modeName = "현장 라이브";
    if (mode === 'holofes') modeName = "홀로페스";
    
    
    
    // Generate 3 random stages
    generateLiveStages(mode);
}

window.giveUpLive = function() {
    if (confirm("라이브를 종료하시겠습니까? 현재까지 누적된 보상이 정산됩니다.")) {
        
        if (PlayerData.liveState) {
            let totalPoints = 0;
            if (PlayerData.liveState.cumulativeIssues) {
                const allIss = GameData.issue || [];
                PlayerData.liveState.cumulativeIssues.forEach(id => {
                    const iss = allIss.find(i => i.Issue_ID === id);
                    if (iss) totalPoints += parseInt(iss.Issue_Point) || 0;
                });
            }
            
            const bonusMult = 1.0 + (totalPoints * 0.05);
            const baseDia = PlayerData.liveState.accumulatedDia || 0;
            const baseTicket = PlayerData.liveState.accumulatedTicket || 0;
            
            const finalDia = Math.ceil(baseDia * bonusMult);
            const finalTicket = Math.ceil(baseTicket * bonusMult);
            
            if (finalDia > 0 || finalTicket > 0) {
                if (!PlayerData.items) PlayerData.items = {};
                PlayerData.items["Item_001"] = (PlayerData.items["Item_001"] || 0) + finalDia;
                PlayerData.items["Item_003"] = (PlayerData.items["Item_003"] || 0) + finalTicket;
                
                
                const resultModal = document.getElementById('live-result-modal');
                const resultContent = document.getElementById('live-result-content');
                if (resultModal && resultContent) {
                    resultContent.innerHTML = `
                        <div style="font-size: 1.2rem; font-weight: bold; color: #2980b9; margin-bottom: 10px;">획득 보상</div>
                        <div style="display: flex; justify-content: center; gap: 20px; margin-bottom: 20px;">
                            <div style="display: flex; align-items: center; gap: 8px; background: #f1f2f6; padding: 10px 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                                <img src="https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/Item/%ED%99%80%EB%A1%9C%EB%8B%A4%EC%9D%B4%EC%95%84.png" style="width: 30px; height: 30px;">
                                <span style="font-size: 1.4rem; font-weight: bold; color: #333;">x${finalDia}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px; background: #f1f2f6; padding: 10px 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                                <img src="https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/Item/%EC%86%8C%ED%83%95%EA%B6%8C.png" style="width: 30px; height: 30px;">
                                <span style="font-size: 1.4rem; font-weight: bold; color: #333;">x${finalTicket}</span>
                            </div>
                        </div>
                        <div style="font-size: 0.9rem; color: #e74c3c; font-weight: bold;">
                            (누적 이슈 포인트 ${totalPoints}P에 의한 추가 배율 적용됨)
                        </div>
                    `;
                    resultModal.classList.add('show');
                } else {
                    alert(`라이브 결산 완료!\n획득 보상: 홀로다이아 x${finalDia}, 라이브 티켓 x${finalTicket}\n(이슈 포인트 ${totalPoints}P에 의한 추가 배율 적용됨)`);
                }

                if(window.updateTopCurrencies) window.updateTopCurrencies();
            }
            
            PlayerData.liveState = null;
            if(window.savePlayerData) window.savePlayerData();
        }

        currentLiveMode = null;
        document.getElementById('live-entry-container').style.display = 'flex';
        const btnGiveup = document.querySelector('.btn-giveup-live'); if(btnGiveup) btnGiveup.style.display = 'none';
        document.getElementById('live-ongoing-container').style.display = 'none';
    }
}

function openLiveScene() {
    // If there is an ongoing live, show the ongoing container, else show entry
    if (currentLiveMode) {
        document.getElementById('live-entry-container').style.display = 'none';
        document.getElementById('live-ongoing-container').style.display = 'flex';
    } else {
        document.getElementById('live-entry-container').style.display = 'flex';
        document.getElementById('live-ongoing-container').style.display = 'none';
    }
}

function generateLiveStages(mode) {
    const listContainer = document.getElementById('live-stage-list');
    listContainer.innerHTML = '';
    
    let baseLevel = 30;
    if (mode === 'field') baseLevel = 60;
    if (mode === 'holofes') baseLevel = 90;
    
    const state = PlayerData.liveState;
    if (state) {
        const allIss = GameData.issue || [];
        let totalPoints = 0;
        if (state.cumulativeIssues) {
            state.cumulativeIssues.forEach(id => {
                const iss = allIss.find(i => i.Issue_ID === id);
                if (iss) totalPoints += parseInt(iss.Issue_Point) || 0;
            });
        }
        
        let headerDiv = document.getElementById('live-stage-header-stats');
        if (!headerDiv) {
            headerDiv = document.createElement('div');
            headerDiv.id = 'live-stage-header-stats';
            headerDiv.style.padding = '15px 30px';
            headerDiv.style.background = 'linear-gradient(90deg, rgba(20,20,30,0.95) 0%, rgba(40,30,60,0.95) 100%)';
            headerDiv.style.border = '1px solid rgba(142, 68, 173, 0.5)';
            headerDiv.style.color = '#fff';
            headerDiv.style.borderRadius = '12px';
            headerDiv.style.marginBottom = '25px';
            headerDiv.style.display = 'flex';
            headerDiv.style.justifyContent = 'space-between';
            headerDiv.style.alignItems = 'center';
            headerDiv.style.fontSize = '1.1rem';
            headerDiv.style.fontWeight = 'bold';
            headerDiv.style.boxShadow = '0 6px 15px rgba(0,0,0,0.4)';
            listContainer.parentNode.insertBefore(headerDiv, listContainer);
        }
        
        
        totalPoints = 0;
        let cumIssueHTML = '';
        if (state.cumulativeIssues && state.cumulativeIssues.length > 0) {
            const counts = {};
            state.cumulativeIssues.forEach(id => {
                counts[id] = (counts[id] || 0) + 1;
            });
            
            let tooltipContent = '';
            for (const id in counts) {
                const count = counts[id];
                const iss = allIss.find(i => i.Issue_ID === id);
                if (iss) {
                    const pt = (parseInt(iss.Issue_Point) || 0) * count;
                    totalPoints += pt;
                    
                    const name = count > 1 ? `${iss.Issue_Name} x ${count}` : iss.Issue_Name;
                    
                    // Multiply numeric values in description
                    let desc = iss.Issue_Desc;
                    if (count > 1) {
                        desc = desc.replace(/(\+|-)?\d+(\.\d+)?(%|P)?/g, (match, sign, dec, unit) => {
                            let num = parseFloat(match.replace(/[^\d.]/g, ''));
                            num *= count;
                            return (sign || '') + num + (unit || '');
                        });
                    }
                    
                    tooltipContent += `<div style="display:flex; flex-direction:column; padding:5px; border-bottom:1px solid rgba(255,255,255,0.1); width:280px; box-sizing:border-box;">
                        <span style="color:#e74c3c; font-weight:bold; font-size:0.9rem;">[${name}]</span>
                        <span style="font-size:0.8rem; line-height:1.2;">${desc}</span>
                    </div>`;
                }
            }
            
            const numUnique = Object.keys(counts).length;
            const columns = numUnique > 10 ? Math.ceil(numUnique / 10) : 1;
            const tooltipWidth = columns * 290 + 20;
            
            cumIssueHTML += `
            <div style="position:relative; margin-left:15px; cursor:help;" onmouseenter="this.querySelector('.live-issue-tooltip').style.display='flex';" onmouseleave="this.querySelector('.live-issue-tooltip').style.display='none';">
                <span style="background:#e74c3c; color:#fff; padding:4px 12px; border-radius:15px; font-size:0.9rem; font-weight:bold; box-shadow:0 2px 5px rgba(0,0,0,0.5);">누적된 이슈 (${state.cumulativeIssues.length}개)</span>
                <div class="live-issue-tooltip" style="position:absolute; top:35px; left:50%; transform:translateX(-50%); width:${tooltipWidth}px; background:rgba(20, 25, 30, 0.95); border:2px solid #e74c3c; border-radius:8px; padding:10px; box-shadow:0 8px 25px rgba(0,0,0,0.8); display:none; flex-direction:column; flex-wrap:wrap; max-height: 480px; gap:8px; z-index:999; color:#fff;">
                    ${tooltipContent}
                </div>
            </div>`;
        }
        
        const bonusMult = 1.0 + (totalPoints * 0.05);
        const baseDia = state.accumulatedDia || 0;
        const baseTicket = state.accumulatedTicket || 0;
        
        const totalDia = Math.ceil(baseDia * bonusMult);
        const totalTicket = Math.ceil(baseTicket * bonusMult);

        headerDiv.innerHTML = `
            <div style="display:flex; gap: 25px; align-items:center;">
                <div style="display:flex; flex-direction:column; gap:2px;">
                    <span style="font-size:0.8rem; color:#aaa; font-weight:normal;">진행도</span>
                    <span style="font-size:1.2rem; color:#f1c40f;">${state.cumulativeBattles || 0}회 완료</span>
                </div>
                <div style="width:1px; height:30px; background:rgba(255,255,255,0.2);"></div>
                <div style="display:flex; flex-direction:column; gap:2px;">
                    <span style="font-size:0.8rem; color:#aaa; font-weight:normal;">이슈 포인트</span>
                    <span style="font-size:1.2rem; color:#e74c3c;">${totalPoints} P</span>
                </div>
                ${cumIssueHTML ? `<div style="width:1px; height:30px; background:rgba(255,255,255,0.2); margin-left:10px;"></div>` : ''}
                ${cumIssueHTML}
            </div>
            <div style="display:flex; gap: 20px; align-items:center; background:rgba(0,0,0,0.3); padding:8px 20px; border-radius:30px;">
                <span style="color:#aaa; font-size:0.9rem;">누적 보상</span>
                <span style="color:#3498db; display:flex; align-items:center; gap:6px; font-size:1.2rem;"><img src="https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/Item/%ED%99%80%EB%A1%9C%EB%8B%A4%EC%9D%B4%EC%95%84.png" style="width:24px;height:24px;object-fit:contain; filter:drop-shadow(0 2px 2px rgba(0,0,0,0.5));" onerror="this.src='https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Item_002.png'"> ${totalDia}</span>
                <span style="color:#2ecc71; display:flex; align-items:center; gap:6px; font-size:1.2rem;"><img src="https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/Item/%EC%86%8C%ED%83%95%EA%B6%8C.png" style="width:24px;height:24px;object-fit:contain; filter:drop-shadow(0 2px 2px rgba(0,0,0,0.5));"> ${totalTicket}</span>
            </div>
        `;
    }
    
    if (!PlayerData.liveState || !PlayerData.liveState.stages || PlayerData.liveState.mode !== mode) {
        const allIssues = GameData.issue || [];
        const validIssues = allIssues.filter(iss => {
            if (iss.Issue_Con !== '공통' && iss.Issue_Con !== '라이브') return false;
            if (!iss.Issue_Point) return false;
            const dupLimit = parseInt(iss.Issue_Dup);
            if (!isNaN(dupLimit) && dupLimit > 0 && PlayerData.liveState && PlayerData.liveState.cumulativeIssues) {
                const count = PlayerData.liveState.cumulativeIssues.filter(id => id === iss.Issue_ID).length;
                if (count >= dupLimit) return false;
            }
            return true;
        });
        const battles = (PlayerData.liveState && PlayerData.liveState.cumulativeBattles) || 0;
        const totalIssuesCount = Math.min(3, 1 + Math.floor(battles / 5));
        
        const newStages = [];
        for (let s = 1; s <= 3; s++) {
            const enemies = generateWeightedLiveTeam(mode);
            const enemyIds = enemies.map(e => e ? e.Character_ID : null);
            
            let stageIssues = [];
            if (validIssues.length > 0) {
                const shuffled = [...validIssues].sort(() => 0.5 - Math.random());
                stageIssues = shuffled.slice(0, totalIssuesCount).map(iss => iss.Issue_ID);
            }
            
            let baseDia = 75;
            let baseTicket = 1;
            if (mode === 'field') { baseDia = 100; baseTicket = 2; }
            if (mode === 'holofes') { baseDia = 125; baseTicket = 3; }
            
            const diaReward = baseDia + Math.floor(battles / 5) * 25;
            const ticketReward = baseTicket + Math.floor(battles / 5) * 1;
            
            const liveName = enemies.liveName || '';
            newStages.push({ stageNumber: s, baseLevel: baseLevel, enemyIds: enemyIds, stageIssues: stageIssues, diaReward: diaReward, ticketReward: ticketReward, liveName: liveName });
        }
        
        const oldState = PlayerData.liveState || {};
        PlayerData.liveState = {
            mode: mode,
            cumulativeBattles: oldState.cumulativeBattles || 0,
            cumulativeIssues: oldState.cumulativeIssues || [],
            accumulatedDia: oldState.accumulatedDia || 0,
            accumulatedTicket: oldState.accumulatedTicket || 0,
            stages: newStages
        };
    }
    
    PlayerData.liveState.stages.forEach(stage => {
        const enemies = stage.enemyIds.map(id => {
            if (!id) return null;
            return (GameData.characters || []).find(c => c.Character_ID === id) || null;
        });
        listContainer.innerHTML += buildLiveStageCard(stage, enemies);
    });
}

function generateWeightedLiveTeam(mode) {
    // 01~05: Striker (Class 1), 06~08: Supporter (Class 2)
    const team = new Array(8).fill(null);
    const fixedMembers = [];
    
    const allChars = GameData.characters || [];
    const liveData = GameData.live || GameData.lives || [];
    let liveName = '';
    
    // Pick a random row from Live sheet if it exists
    if (liveData.length > 0) {
        const randRow = liveData[Math.floor(Math.random() * liveData.length)];
        liveName = randRow ? (randRow.Live_Name || randRow['라이브명'] || '') : '';
        
        for (let i = 1; i <= 8; i++) {
            const colName = `Live_Characters_${i.toString().padStart(2, '0')}`;
            const charId = randRow[colName];
            if (charId) {
                // Find character by Character_ID (adapted or raw)
                const c = allChars.find(x => x.Character_ID === charId || x['캐릭터ID'] === charId);
                if (c) {
                    team[i - 1] = c;
                    fixedMembers.push(c);
                }
            }
        }
    }
    
    // Track unique names to prevent duplicates
    const selectedNames = new Set();
    
    // Helper to normalize names for the Fubuki rule
    const normalizeName = (name) => {
        if (!name) return "";
        if (name.includes("후부키")) return "후부키"; // Treat Shirakami/Kurokami as the same
        return name;
    };
    
    fixedMembers.forEach(c => {
        if(c) selectedNames.add(normalizeName(c.Character_Name));
    });
    
    // Collect fixed keywords for synergy
    const fixedKeywords = new Set();
    fixedMembers.forEach(c => {
        if(!c) return;
        ['Character_Keyword_1', 'Character_Keyword_2', 'Character_Keyword_3', 'Character_Keyword_4'].forEach(kw => {
            if (c[kw]) fixedKeywords.add(c[kw]);
        });
    });
    
    for (let i = 0; i < 8; i++) {
        if (team[i] !== null) continue;
        
        // Determine required class
        const reqClass = (i < 5) ? "스트라이커" : "서포터";
        const reqClassAlt = (i < 5) ? "1" : "2";
        
        // Track current roles in the team for this iteration
        const currentRoles = new Set();
        team.forEach(c => {
            if (c && c.Character_Role) currentRoles.add(c.Character_Role);
        });
        
        // Filter candidates
        const candidates = allChars.filter(c => {
            const cls = String(c.Character_Class);
            if (cls !== reqClass && cls !== reqClassAlt) return false;
            if (selectedNames.has(normalizeName(c.Character_Name))) return false; 
            if (String(c.Character_Gacha) === "0" || c.Character_Gacha === 0) return false; // 미출시 캐릭터 제외
            return true;
        });
        
        if (candidates.length === 0) continue; // No valid candidates
        
        // Calculate weights
        let totalWeight = 0;
        const weightedCandidates = candidates.map(c => {
            let weight = 100; // Base weight
            const slot = i + 1; // 1 to 8
            const role = c.Character_Role;
            const rarity = Number(c.Character_Rarity || c['희귀도']) || 1;
            
            // 1. Role Balancing & Position Bonus
            if (role) {
                // 특정 자리 가중치 (탱커, 근거리, 암살자, 원거리/마법, 힐러/버퍼/디버퍼)
                if ((slot === 1 || slot === 2) && role === '탱커') weight += 300;
                if ((slot === 2 || slot === 3) && role === '근거리 딜러') weight += 300;
                if ((slot === 3 || slot === 4) && role === '암살자') weight += 300;
                if ((slot === 4 || slot === 5) && (role === '원거리 딜러' || role === '마법 딜러')) weight += 300;
                if ((slot >= 6 && slot <= 8) && (role === '힐러' || role === '버퍼' || role === '디버퍼')) weight += 300;
                
                // 기존 덱에 없는 역할군 보너스
                if (!currentRoles.has(role)) weight += 150;
            }
            
            // 2. Rarity Bonus based on Mode
            if (mode === 'memorial') {
                if (rarity === 1) weight += 200; // R UP
                if (rarity === 3) weight = Math.max(10, weight - 80); // SSR DOWN
            } else if (mode === 'field') {
                if (rarity === 2) weight += 100; // SR UP
            } else if (mode === 'holofes') {
                if (rarity === 3) weight += 200; // SSR UP
                if (rarity === 1) weight = Math.max(10, weight - 80); // R DOWN
            }

            // 3. Keyword Synergy Bonus
            ['Character_Keyword_1', 'Character_Keyword_2', 'Character_Keyword_3', 'Character_Keyword_4'].forEach(kw => {
                if (c[kw] && fixedKeywords.has(c[kw])) {
                    weight += 50; 
                }
            });
            
            totalWeight += weight;
            return { char: c, weight: weight };
        });
        
        // Roulette wheel selection
        let randomVal = Math.random() * totalWeight;
        let selectedChar = weightedCandidates[weightedCandidates.length - 1].char;
        
        for (let j = 0; j < weightedCandidates.length; j++) {
            randomVal -= weightedCandidates[j].weight;
            if (randomVal <= 0) {
                selectedChar = weightedCandidates[j].char;
                break;
            }
        }
        
        team[i] = selectedChar;
        selectedNames.add(normalizeName(selectedChar.Character_Name));
    }
    
    // Ensure there is at least one Tank in the striker slots (Slot 1 by default), unless it was fixed
    const hasTank = team.some(c => c && c.Character_Role === '탱커');
    if (!hasTank) {
        let targetSlot = -1;
        for (let s = 0; s < 5; s++) { 
            if (team[s] && !fixedMembers.includes(team[s])) {
                targetSlot = s;
                break;
            }
        }
        
        if (targetSlot !== -1) {
            const tanks = allChars.filter(c => 
                (String(c.Character_Class) === '1' || String(c.Character_Class) === '스트라이커') && 
                c.Character_Role === '탱커' && 
                String(c.Character_Gacha) !== "0" && c.Character_Gacha !== 0 && // 미출시 캐릭터 제외
                (!selectedNames.has(normalizeName(c.Character_Name)) || normalizeName(team[targetSlot].Character_Name) === normalizeName(c.Character_Name))
            );
            
            if (tanks.length > 0) {
                let totalTankW = 0;
                const weightedTanks = tanks.map(t => {
                    let w = 100;
                    const r = Number(t.Character_Rarity || t['희귀도']) || 1;
                    if (mode === 'memorial' && r === 1) w += 200;
                    if (mode === 'holofes' && r === 3) w += 200;
                    totalTankW += w;
                    return { char: t, weight: w };
                });
                
                let randomVal = Math.random() * totalTankW;
                let selectedTank = weightedTanks[weightedTanks.length - 1].char;
                for (let tc of weightedTanks) {
                    randomVal -= tc.weight;
                    if (randomVal <= 0) {
                        selectedTank = tc.char;
                        break;
                    }
                }
                team[targetSlot] = selectedTank;
                // update selected names (simplified since we just replaced one)
            }
        }
    }

    team.liveName = liveName;
    return team;
}

window.toggleLiveStageDetail = function(element) {
    // Accordion exclusive toggle (like ui_stage)
    const parentContainer = element.closest('div[id$="-list"]');
    if (parentContainer) {
        parentContainer.querySelectorAll('.stage-detail-pane').forEach(pane => {
            if (pane !== element.nextElementSibling) {
                pane.classList.add('hidden');
                pane.style.display = 'none';
                const header = pane.previousElementSibling;
                if (header && header.querySelector('.toggle-icon')) {
                    header.querySelector('.toggle-icon').textContent = '▽';
                }
            }
        });
    }

    const detailDiv = element.nextElementSibling;
    if (detailDiv.classList.contains('hidden')) {
        detailDiv.classList.remove('hidden');
        detailDiv.style.display = 'flex';
        element.querySelector('.toggle-icon').textContent = '△';
    } else {
        detailDiv.classList.add('hidden');
        detailDiv.style.display = 'none';
        element.querySelector('.toggle-icon').textContent = '▽';
    }
}

window.startLiveBattle = function(stageIndex) {
    if (!PlayerData.liveState || !PlayerData.liveState.stages) return;
    const stage = PlayerData.liveState.stages[stageIndex - 1];
    if (!stage) return;

    const baseLevel = stage.baseLevel || 30;
    const starCount = baseLevel >= 90 ? 3 : (baseLevel >= 60 ? 2 : 1);
    const stageCore = currentLiveMode === 'memorial' ? 0 : (currentLiveMode === 'field' ? 2 : 3);

    const activeIssues = [
        ...(PlayerData.liveState.cumulativeIssues || []),
        ...(stage.stageIssues || [])
    ];

    window.pendingBattleContext = {
        type: 'live',
        mode: currentLiveMode,
        stageIndex: stageIndex,
        stage: stage,
        enemyIds: stage.enemyIds,
        baseLevel: baseLevel,
        starCount: starCount,
        stageCore: stageCore,
        activeIssues: activeIssues,
        returnScene: 'scene-3'
    };

    const currentScene = document.querySelector('.scene.active') || document.getElementById('scene-3');
    const deckScene = document.getElementById('scene-deck');
    if (currentScene && deckScene) {
        if (typeof window.changeSceneWipe === 'function') {
            window.changeSceneWipe(currentScene, deckScene);
        } else {
            document.querySelectorAll('.scene.active').forEach(s => s.classList.remove('active'));
            deckScene.classList.add('active');
        }
    }
    if (window.initDeckUI) window.initDeckUI();
    if (window.updateDeckStartButtonVisibility) window.updateDeckStartButtonVisibility();
};

window.simulateLiveBattle = window.startLiveBattle;

window.settleLiveDefeat = function() {
    if (PlayerData.liveState) {
        let totalPoints = 0;
        if (PlayerData.liveState.cumulativeIssues) {
            const allIss = GameData.issue || [];
            PlayerData.liveState.cumulativeIssues.forEach(id => {
                const iss = allIss.find(i => i.Issue_ID === id);
                if (iss) totalPoints += parseInt(iss.Issue_Point) || 0;
            });
        }
        
        const bonusMult = 1.0 + (totalPoints * 0.05);
        const baseDia = PlayerData.liveState.accumulatedDia || 0;
        const baseTicket = PlayerData.liveState.accumulatedTicket || 0;
        
        const finalDia = Math.ceil(baseDia * bonusMult);
        const finalTicket = Math.ceil(baseTicket * bonusMult);
        
        if (finalDia > 0 || finalTicket > 0) {
            if (!PlayerData.items) PlayerData.items = {};
            PlayerData.items["Item_001"] = (PlayerData.items["Item_001"] || 0) + finalDia;
            PlayerData.items["Item_003"] = (PlayerData.items["Item_003"] || 0) + finalTicket;
            
            const resultModal = document.getElementById('live-result-modal');
            const resultContent = document.getElementById('live-result-content');
            if (resultModal && resultContent) {
                resultContent.innerHTML = `
                    <div style="font-size: 1.2rem; font-weight: bold; color: #e74c3c; margin-bottom: 10px;">💀 라이브 공략 실패 (최종 결산)</div>
                    <div style="display: flex; justify-content: center; gap: 20px; margin-bottom: 20px;">
                        <div style="display: flex; align-items: center; gap: 8px; background: #f1f2f6; padding: 10px 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                            <img src="https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/Item/%ED%99%80%EB%A1%9C%EB%8B%A4%EC%9D%B4%EC%95%84.png" style="width: 30px; height: 30px;">
                            <span style="font-size: 1.4rem; font-weight: bold; color: #333;">x${finalDia}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; background: #f1f2f6; padding: 10px 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                            <img src="https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/Item/%EC%86%8C%ED%83%95%EA%B6%8C.png" style="width: 30px; height: 30px;">
                            <span style="font-size: 1.4rem; font-weight: bold; color: #333;">x${finalTicket}</span>
                        </div>
                    </div>
                    <div style="font-size: 0.9rem; color: #e74c3c; font-weight: bold;">
                        (누적 이슈 포인트 ${totalPoints}P에 의한 추가 배율 적용됨)
                    </div>
                `;
                resultModal.classList.add('show');
            } else {
                alert(`라이브 공략 실패!\n획득 보상: 홀로다이아 x${finalDia}, 라이브 티켓 x${finalTicket}\n(이슈 포인트 ${totalPoints}P에 의한 추가 배율 적용됨)`);
            }

            if(window.updateTopCurrencies) window.updateTopCurrencies();
        }
        
        PlayerData.liveState = null;
        if(window.savePlayerData) window.savePlayerData();
    }

    currentLiveMode = null;
    document.getElementById('live-entry-container').style.display = 'flex';
    const btnGiveup = document.querySelector('.btn-giveup-live'); if(btnGiveup) btnGiveup.style.display = 'none';
    document.getElementById('live-ongoing-container').style.display = 'none';
};

window.generateLiveStages = generateLiveStages;

window.expandLiveCard = function(element) {
    element.style.flex = "2.5";
    element.style.background = "rgba(255,255,255,0.95)";
    element.style.boxShadow = "0 8px 16px rgba(0,0,0,0.3)";
    const detail = element.querySelector('.live-card-detail');
    if (detail) {
        detail.style.opacity = "1";
        detail.style.transform = "scale(1)";
        detail.style.pointerEvents = "auto";
    }
    const summary = element.querySelector('.live-card-summary');
    if (summary) {
        summary.style.opacity = "0";
    }
}
window.shrinkLiveCard = function(element) {
    element.style.flex = "1";
    element.style.background = "rgba(255,255,255,0.7)";
    element.style.boxShadow = "none";
    const detail = element.querySelector('.live-card-detail');
    if (detail) {
        detail.style.opacity = "0";
        detail.style.transform = "scale(0.9)";
        detail.style.pointerEvents = "none";
    }
    const summary = element.querySelector('.live-card-summary');
    if (summary) {
        summary.style.opacity = "1";
    }
}

function buildLiveStageCard(stage, enemies) {
    const baseLevel = stage.baseLevel;

    const activeIssues = [
        ...(PlayerData.liveState?.cumulativeIssues || []),
        ...(stage.stageIssues || [])
    ];
    const hasBlind = activeIssues.includes('Issue_042');
    if (hasBlind) {
        if (!stage.blindSlots || !Array.isArray(stage.blindSlots)) {
            // 적 스트라이커 존 3개 (0~4 중 3개), 서포터 존 2개 (5~7 중 2개)
            const strikerSlots = [0, 1, 2, 3, 4].sort(() => 0.5 - Math.random()).slice(0, 3);
            const supporterSlots = [5, 6, 7].sort(() => 0.5 - Math.random()).slice(0, 2);
            stage.blindSlots = [...strikerSlots, ...supporterSlots];
        }
    } else {
        stage.blindSlots = null;
    }

    let starCount = 1;
    if (baseLevel === 60) starCount = 2; // field
    else if (baseLevel === 90) starCount = 3; // holofes
    let starsHTML = '';
    for(let i=0; i<starCount; i++) {
        starsHTML += `<img src="https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Star_icon.png" style="width:25px; height:25px; vertical-align:middle; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));">`;
    }

    const index = stage.stageNumber;
    
    const attrIcons = {
        "청초": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Seiso_icon.png",
        "쿨": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Cool_icon.png",
        "게닌": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Genin_icon.png",
        "아티스트": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Artist_icon.png",
        "큐트": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Cute_icon.png",
        "광기": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Crazy_icon.png",
        "에로": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Ero_icon.png"
    };

    let charsHTML = '';
    for (let i = 0; i < 8; i++) {
        if (i < enemies.length && enemies[i]) {
            const char = enemies[i];
            const isSlotBlinded = hasBlind && Array.isArray(stage.blindSlots) && stage.blindSlots.includes(i);
            
            if (isSlotBlinded) {
                charsHTML += `<div style="position:relative; width:60px; height:150px; border-radius:5px; border:2px solid #8e44ad; background:#0f172a; display:flex; flex-direction:column; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,0.4); cursor:not-allowed;" title="[맹목] 숨겨진 적군">
                    <div style="position:absolute; top:-12px; left:50%; transform:translateX(-50%); width:24px; height:24px; border-radius:50%; background:#8e44ad; color:white; font-size:12px; font-weight:bold; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(0,0,0,0.5);">❓</div>
                    <div style="font-size:2rem; color:#a855f7; font-weight:900; filter:drop-shadow(0 0 6px rgba(168,85,247,0.6));">❓</div>
                    <div style="font-size:10px; color:#94a3b8; font-weight:bold; margin-top:6px;">미확인</div>
                </div>`;
            } else {
                const portrait = char.Character_Image_Long || char.Character_Portrait || '';
                const typeIcon = attrIcons[char.Character_Type] || '';
                const typeHTML = typeIcon ? `<img src="${typeIcon}" style="position:absolute; top:-12px; left:50%; transform:translateX(-50%); width:28px; height:28px; z-index:2; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.5));">` : '';
                charsHTML += `<div class="enemy-portrait-hover" onclick="window.openEnemyInfoModal('${char.Character_ID}', ${baseLevel}, ${starCount}); event.stopPropagation();" style="position:relative; width:60px; height:150px;">
                    ${typeHTML}
                    <img src="${portrait}" style="width:100%; height:100%; border-radius:5px; object-fit:cover; border:1px solid #333;" alt="${char.Character_Name}">
                </div>`;
            }

        } else {
            charsHTML += `<div style="width: 60px; height: 150px; border-radius: 5px; border: 1px dashed #ccc; background: rgba(0,0,0,0.05); display: flex; align-items: center; justify-content: center; font-size: 0.75rem; color: #999;">빈칸</div>`;
        }
        if (i === 4) charsHTML += '<div style="width:15px;"></div>';
    }
    
    const diaUrl = 'https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/Item/%ED%99%80%EB%A1%9C%EB%8B%A4%EC%9D%B4%EC%95%84.png';
    const ticketUrl = 'https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/Item/%EC%86%8C%ED%83%95%EA%B6%8C.png';
    
    const rewardHTML = `
        <div style="display:flex; align-items:center; gap:8px; background: rgba(255,255,255,0.9); padding:8px 15px; border-radius:10px; font-size:1.2rem; border:2px solid #3498db; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <img src="${diaUrl}" style="width:40px; height:40px; object-fit:contain;">
            <span style="font-weight:bold; color:#111; font-size:1.3rem;">x${stage.diaReward || 1000}</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px; background: rgba(255,255,255,0.9); padding:8px 15px; border-radius:10px; font-size:1.2rem; border:2px solid #2ecc71; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <img src="${ticketUrl}" style="width:40px; height:40px; object-fit:contain;">
            <span style="font-weight:bold; color:#111; font-size:1.3rem;">x${stage.ticketReward || 50}</span>
        </div>
    `;
    
    const allIssues = GameData.issue || [];
    let issueHTML = '';
    

    
    if (stage.stageIssues && stage.stageIssues.length > 0) {
        issueHTML += `<div style="font-size:0.9rem; font-weight:bold; color:#8e44ad; margin-bottom:5px; margin-top:10px;">신규 추가 이슈</div><div style="display:flex; gap:5px; flex-wrap:wrap;">`;
        stage.stageIssues.forEach(id => {
            const iss = allIssues.find(i => i.Issue_ID === id);
            if (iss) {
                issueHTML += `<div style="display:flex; flex-direction:column; align-items:center; text-align:center; width:100%;">
                    <span style="background:#8e44ad; color:white; padding:3px 10px; border-radius:12px; font-size:0.85rem; font-weight:bold; margin-bottom:3px;">${iss.Issue_Name} (+${iss.Issue_Point}P)</span>
                    <span style="font-size:0.8rem; color:#555; word-break:keep-all; line-height:1.2;">${iss.Issue_Desc}</span>
                </div>`;
            }
        });
        issueHTML += `</div>`;
    }

    
    let summaryHTML = '';
    if (stage.stageIssues && stage.stageIssues.length > 0) {
        const iss = (GameData.issue || []).find(i => i.Issue_ID === stage.stageIssues[0]);
        if (iss) {
            summaryHTML += `<div style="text-align:center; margin-bottom:15px;"><span style="background:#8e44ad; color:#fff; padding:6px 15px; border-radius:12px; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.3);">[신규] ${iss.Issue_Name}</span></div>`;
        }
    }
    
    let summaryEnemies = `<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:5px; width:90%; margin:0 auto;">`;
    for (let i = 0; i < 8; i++) {
        const ek = stage.enemyIds[i];
        if (!ek) continue;
        const charObj = (GameData.characters || []).find(ch => ch.Character_ID === ek) || (GameData.character || []).find(ch => ch.Character_ID === ek);
        if (charObj) {
            const isSlotBlinded = hasBlind && Array.isArray(stage.blindSlots) && stage.blindSlots.includes(i);
            if (isSlotBlinded) {
                summaryEnemies += `<div style="width:100%; aspect-ratio:1/1.5; border-radius:4px; overflow:hidden; border:2px solid #8e44ad; background:#0f172a; display:flex; align-items:center; justify-content:center; color:#a855f7; font-size:1.4rem; font-weight:bold; box-shadow:inset 0 0 8px rgba(0,0,0,0.8); cursor:not-allowed;" title="[맹목] 숨겨진 적군">❓</div>`;
            } else {
                const imgUrl = charObj.Character_Image_Long || charObj.Character_Portrait || charObj.Character_Image || '';
                summaryEnemies += `<div class="enemy-portrait-hover" onclick="window.openEnemyInfoModal('${ek}', ${baseLevel}, ${starCount}); event.stopPropagation();" style="width:100%; aspect-ratio:1/1.5; border-radius:4px; overflow:hidden; border:2px solid #555; background:#111;"><img src="${imgUrl}" style="width:100%; height:100%; object-fit:cover; object-position:top;"></div>`;
            }
        }
    }
    summaryEnemies += `</div>`;
    
    const idleSummary = `<div class="live-card-summary" style="position:absolute; top:80px; left:0; width:100%; transition:opacity 0.3s ease; opacity:1; pointer-events:none;">${summaryHTML}${summaryEnemies}</div>`;
    
    return `
    <div class="live-stage-card" onmouseenter="expandLiveCard(this)" onmouseleave="shrinkLiveCard(this)" style="
        flex: 1; 
        background: rgba(255,255,255,0.7); 
        border: 4px solid #8e44ad; 
        border-radius: 16px; 
        padding: 20px 15px; 
        display: flex; 
        flex-direction: column; 
        align-items: center; 
        transition: flex 0.4s cubic-bezier(0.25, 1, 0.5, 1), background 0.4s ease, box-shadow 0.4s ease;
        overflow: hidden;
        position: relative;
    ">
        <div style="display:flex; align-items:center; justify-content:center; margin-top: 15px; margin-bottom: 20px; z-index:2; position:relative;">
            <span style="background:#8e44ad; color:#fff; padding:6px 15px; border-radius:8px; font-size:1.1rem; font-weight:bold; white-space: nowrap; display:inline-flex; align-items:center; gap:5px; box-shadow:0 2px 4px rgba(0,0,0,0.3);">Lv.${baseLevel} ${starsHTML}</span>
        </div>
        
        ${idleSummary}
        
        <div class="live-card-detail" style="opacity: 0; transform: scale(0.9); transition: opacity 0.3s ease, transform 0.3s ease; display: flex; flex-direction: column; align-items: center; width: 100%; min-width: 600px; pointer-events: none; z-index:3; position:relative;">
            
            ${issueHTML !== '' ? `<div style="background:#f8f9fa; padding:10px; border-radius:8px; border:1px solid #ddd; width: 100%; max-width: 550px; margin-bottom:15px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">${issueHTML}</div>` : ''}
            
            <div style="font-size: 1.1rem; font-weight: bold; color: #333; margin-bottom: 15px; white-space: nowrap;">${stage.liveName || '등장 적군 (최대 8인)'}</div>
            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom: 30px; justify-content: center;">
                ${charsHTML}
            </div>
            
            <div style="display:flex; gap:15px; margin-bottom: 50px;">
                ${rewardHTML}
            </div>
            
            <button class="execute-btn" style="background: #e67e22; font-size: 1.5rem; padding: 15px 40px; pointer-events: auto; box-shadow: 0 4px 10px rgba(0,0,0,0.3);" onclick="window.simulateLiveBattle(${index}); event.stopPropagation();">전투 시작 (AP 소모 없음)</button>
        </div>
    </div>
    `;
}

