import { GameData, PlayerData } from './state.js?v=004276';
import { addAccountExp } from './ui.js?v=004276';



window.selectedRehearsalIssues = new Set();
window.activeRehearsalIssues = {};
window.currentIssueStageId = null;
window.lastRehearsalSubCategory = '';

export function initStageSystem() {
    console.log("initStageSystem called");
    
    document.querySelector('.menu-btn[data-target="scene-1"]')?.addEventListener('click', () => {
        renderMainStoryScene();
    });
    
    document.querySelector('.menu-btn[data-target="scene-2"]')?.addEventListener('click', () => {
        renderRehearsalEntry();
    });
    
    document.getElementById('btn-rehearsal-back')?.addEventListener('click', () => {
        window.activeRehearsalIssues = {};
        document.getElementById('rehearsal-selection').classList.add('hidden');
        document.getElementById('rehearsal-categories').classList.remove('hidden');
        document.getElementById('rehearsal-badges').classList.add('hidden');
    });
}

export function renderMainStoryScene() {
    const container = document.getElementById('main-story-list');
    if (!container) return;
    
    const stages = (GameData.stage || []).filter(s => s.Stage_Type === '메인');
    if (stages.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:50px; font-size:1.2rem; color:#666;">해당 카테고리에 오픈된 스테이지가 없습니다. (혹은 데이터를 불러오는 중입니다.)</div>`;
    } else {
        const cleared = (window.PlayerData && window.PlayerData.clearedStages) || [];
        container.innerHTML = stages.map((s, idx) => {
            const isLocked = (idx > 0) && !cleared.includes(stages[idx - 1].Stage_ID);
            return buildStageCardHTML(s, isLocked);
        }).join('');
    }
}
window.renderMainStoryScene = renderMainStoryScene;

export function renderRehearsalEntry() {
    window.activeRehearsalIssues = {};
        document.getElementById('rehearsal-selection').classList.add('hidden');
    document.getElementById('rehearsal-badges').classList.add('hidden');
    document.getElementById('rehearsal-categories').classList.remove('hidden');
    
    renderBadgeButtons();
}

function renderBadgeButtons() {
    const grid = document.getElementById('badges-grid');
    if (!grid) return;
    
    const badgeMap = [
        { name: '청초', assetId: 'asset_015' },
        { name: '게닌', assetId: 'asset_014' },
        { name: '쿨', assetId: 'asset_012' },
        { name: '아티스트', assetId: 'asset_011' },
        { name: '큐트', assetId: 'asset_013' },
        { name: '광기', assetId: 'asset_017' },
        { name: '에로', assetId: 'asset_016' }
    ];
    
    let html = '';
    badgeMap.forEach(b => {
        const asset = (GameData.assets || []).find(a => a.Asset_ID === b.assetId);
        const iconUrl = asset ? asset.Asset_Link : '';
        html += `
        <button class="execute-btn" onclick="openRehearsalSub('${b.name}')" style="background: rgba(255,255,255,0.9); border: 2px solid #ccc; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; color: #333; transition: all 0.2s;" onmouseover="this.style.transform='scale(1.05)'; this.style.borderColor='#3498db';" onmouseout="this.style.transform='scale(1)'; this.style.borderColor='#ccc';">
            ${iconUrl ? `<img src="${iconUrl}" style="width: 40px; height: 40px; object-fit: contain;">` : ''}
            <span style="font-weight: bold; font-size: 1rem;">${b.name}</span>
        </button>
        `;
    });
    grid.innerHTML = html;
}

window.openRehearsalSub = function(subType) {
    try {
        window.lastRehearsalSubCategory = subType;
        if (subType === '뱃지') {
            document.getElementById('rehearsal-categories').classList.add('hidden');
            document.getElementById('rehearsal-badges').classList.remove('hidden');
            renderBadgeButtons();
            return;
        }
        
        document.getElementById('rehearsal-categories').classList.add('hidden');
        document.getElementById('rehearsal-badges').classList.add('hidden');
        
        const container = document.getElementById('rehearsal-stage-list');
        const stages = (GameData.stage || []).filter(s => {
            if (s.Stage_Type !== '리허설') return false;
            if (s.Stage_Type_Sub === subType) return true;
            if (s.Stage_Type_Sub === '뱃지' && (s.Stage_Name || "").includes(subType)) return true;
            return false;
        });
        
        if (stages.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding:50px; font-size:1.2rem; color:#666;">해당 카테고리에 오픈된 스테이지가 없습니다. (혹은 데이터를 불러오는 중입니다.)</div>`;
        } else {
            container.innerHTML = stages.map(s => buildStageCardHTML(s)).join('');
        }
        
        document.getElementById('rehearsal-selection').classList.remove('hidden');
        document.getElementById('rehearsal-selection-title').textContent = subType + ' 스테이지';
    } catch(e) {
        alert('openRehearsalSub Error: ' + e.message);
        console.error(e);
    }
}

function buildStageCardHTML(stage, isLocked = false) {

    const levelNum = parseInt(stage.Stage_Level) || 1;
    let starCount = 1;
    if (levelNum >= 60) starCount = 3;
    else if (levelNum >= 30) starCount = 2;
    let starsHTML = '';
    for(let i=0; i<starCount; i++) {
        starsHTML += `<img src="https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Star_icon.png" style="width:20px; height:20px; vertical-align:middle; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));">`;
    }

    const parseReward = (rewardStr) => {
        if (!rewardStr) return '';
        const parts = rewardStr.split(',');
        let html = '';
        for (let i=0; i<parts.length; i+=2) {
            const itemId = parts[i];
            const amount = Number(parts[i+1]) || 1;
            const item = (GameData.items || []).find(it => it.Item_ID === itemId);
            if (item) {
                html += `<div style="display:flex; align-items:center; gap:5px; background: rgba(255,255,255,0.7); padding:8px 15px; border-radius:10px; font-size:1.1rem; border:2px solid #3498db; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    <img src="${item.Item_Icon}" style="width:40px; height:40px; object-fit:contain;" alt="${item.Item_Name}">
                    <span style="font-weight:bold; color:#111; font-size:1.15rem;">x${amount}</span>
                </div>`;
            }
        }
        return html;
    };
    
    // Issue Calculation PER STAGE
    let stageActiveIssues = new Set();
    if (window.activeRehearsalIssues && window.activeRehearsalIssues[stage.Stage_ID]) {
        stageActiveIssues = window.activeRehearsalIssues[stage.Stage_ID];
    } else if (PlayerData.savedRehearsalIssues && PlayerData.savedRehearsalIssues[stage.Stage_ID]) {
        stageActiveIssues = new Set(PlayerData.savedRehearsalIssues[stage.Stage_ID]);
    }
    
    let totalPoints = 0;
    const allIssues = GameData.issue || [];
    stageActiveIssues.forEach(id => {
        const iss = allIssues.find(i => i.Issue_ID === id);
        if (iss) totalPoints += Number(iss.Issue_Point || 0);
    });
    
    const parseBonusReward = (rewardStr) => {
        if (!rewardStr || totalPoints === 0) return '';
        const parts = rewardStr.split(',');
        let html = '';
        for (let i=0; i<parts.length; i+=2) {
            const itemId = parts[i];
            const baseAmount = Number(parts[i+1]) || 1;
            const item = (GameData.items || []).find(it => it.Item_ID === itemId);
            if (!item) continue;
            
            let displayStr = '';
            if (baseAmount > 1) {
                const bonus = Math.floor(baseAmount * (totalPoints * 0.03));
                if (bonus > 0) displayStr = `+${bonus}`;
            } else {
                const prob = totalPoints * 0.04;
                const guaranteed = Math.floor(prob);
                const chance = Math.round((prob % 1) * 100);
                if (guaranteed > 0 && chance > 0) displayStr = `+${guaranteed} (추가 ${chance}% 확률로 +1)`;
                else if (guaranteed > 0) displayStr = `+${guaranteed}`;
                else if (chance > 0) displayStr = `${chance}% 확률로 +1`;
            }
            
            if (displayStr !== '') {
                html += `<div style="display:flex; align-items:center; gap:5px; background: rgba(255,234,234,0.7); padding:8px 15px; border-radius:10px; font-size:1.1rem; border:2px solid #e74c3c; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    <img src="${item.Item_Icon}" style="width:40px; height:40px; object-fit:contain;" alt="${item.Item_Name}">
                    <span style="font-weight:bold; color:#e74c3c; font-size:1.0rem;">${displayStr}</span>
                </div>`;
            }
        }
        return html;
    };

    const firstRewardHTML = parseReward(stage.Stage_First_Reward);
    const rewardHTML = parseReward(stage.Stage_Reward);
    const bonusRewardHTML = parseBonusReward(stage.Stage_Reward);
    
    let charsHTML = '';
    const charIds = stage.Stage_Characters ? stage.Stage_Characters.split(',') : [];
    for (let i = 0; i < 8; i++) {
        if (i < charIds.length && charIds[i]) {
            const char = (GameData.characters || []).find(c => c.Character_ID === charIds[i]);
            if (char) {
                const portrait = char.Character_Image_Long || char.Character_Portrait || '';
                
            const attrIcons = {
                "청초": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Seiso_icon.png",
                "쿨": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Cool_icon.png",
                "게닌": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Genin_icon.png",
                "아티스트": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Artist_icon.png",
                "큐트": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Cute_icon.png",
                "광기": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Crazy_icon.png",
                "에로": "https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Ero_icon.png"
            };
            const typeIcon = attrIcons[char.Character_Type] || '';
            const typeHTML = typeIcon ? `<img src="${typeIcon}" style="position:absolute; top:-12px; left:50%; transform:translateX(-50%); width:28px; height:28px; z-index:2; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.5));">` : '';
            charsHTML += `<div class="enemy-portrait-hover" onclick="window.openEnemyInfoModal('${char.Character_ID}', ${levelNum}, ${starCount}); event.stopPropagation();" style="position:relative; width:60px; height:150px;">
                ${typeHTML}
                <img src="${portrait}" style="width:100%; height:100%; border-radius:5px; object-fit:cover; border:1px solid #333;" alt="${char.Character_Name}">
            </div>`;

            } else {
                charsHTML += `<div style="width: 60px; height: 150px; border-radius: 5px; border: 1px dashed #ccc; background: rgba(0,0,0,0.05);"></div>`;
            }
        } else {
            charsHTML += `<div style="width: 60px; height: 150px; border-radius: 5px; border: 1px dashed #ccc; background: rgba(0,0,0,0.05);"></div>`;
        }
    }
    
    const autoWarning = (stage.Stage_Auto == 0) ? `<div style="color: #e74c3c; font-weight: bold; font-size: 0.85rem; margin-top: 5px;">※ 이 스테이지는 자동전투를 지원하지 않습니다. (수동 조작 필요)</div>` : '';
    
    let activeIssuesHTML = '';
    if (stageActiveIssues.size > 0) {
        activeIssuesHTML += `<div style="margin-top: 10px; padding: 10px; background: rgba(255, 234, 234, 0.7); border: 1px solid #e74c3c; border-radius: 8px;">`;
        activeIssuesHTML += `<div style="font-weight: bold; color: #c0392b; font-size: 0.95rem; margin-bottom: 5px;">적용된 패널티 (총 ${totalPoints} P)</div>`;
        activeIssuesHTML += `<div style="display: flex; flex-direction: column; gap: 6px;">`;
        stageActiveIssues.forEach(id => {
            const iss = allIssues.find(i => i.Issue_ID === id);
            if (iss) {
                activeIssuesHTML += `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="background: #e74c3c; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.85rem; font-weight: bold; white-space: nowrap;">${iss.Issue_Name}</span>
                    <span style="font-size: 0.85rem; color: #333;">${iss.Issue_Desc}</span>
                </div>`;
            }
        });
        activeIssuesHTML += `</div></div>`;
    }
    const isCleared = !!(window.PlayerData && window.PlayerData.clearedStages && window.PlayerData.clearedStages.includes(stage.Stage_ID));
    
    return `
    <div class="glass-panel" style="margin-bottom: 15px; padding: 0; display: flex; flex-direction: column; border-left: 5px solid ${isLocked ? '#7f8c8d' : (isCleared ? '#27ae60' : '#3498db')}; overflow: hidden; ${isLocked ? 'opacity: 0.85;' : ''}">
        
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 15px; background: rgba(255,255,255,0.5); cursor: pointer; transition: background 0.2s;" 
             onclick="window.toggleStageDetail(this)" onmouseover="this.style.background='rgba(255,255,255,0.8)'" onmouseout="this.style.background='rgba(255,255,255,0.5)'">
            <div class="stage-title" style="font-size: 1.2rem; font-weight: bold; color: #2c3e50; transition: all 0.3s;">
                <span class="stage-level" style="background:#34495e; color:#fff; padding:4px 8px; border-radius:6px; font-size:0.95rem; margin-right:10px; display:inline-flex; align-items:center; justify-content:center; gap:5px; min-width:115px; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.3); transition: all 0.3s;">${starsHTML} Lv.${stage.Stage_Level || 1}</span>
                ${isLocked ? '<span style="background:#e74c3c; color:#fff; padding:3px 8px; border-radius:6px; font-size:0.82rem; margin-right:8px; font-weight:bold;">🔒 [잠김]</span>' : (isCleared ? '<span style="background:#27ae60; color:#fff; padding:3px 8px; border-radius:6px; font-size:0.82rem; margin-right:8px; font-weight:bold;">✓ [클리어]</span>' : '')}${stage.Stage_Name}
            </div>
            <div class="stage-ap" style="font-size: 1.1rem; font-weight: bold; color: #e67e22; display: flex; align-items: center; gap: 8px; transition: all 0.3s;">
                <span>${stage.Stage_AP} AP</span>
                <span class="toggle-icon" style="color:#888; font-size:0.9rem;">▼</span>
            </div>
        </div>
        
        <div class="hidden stage-detail-pane" style="display: none; padding: 20px; border-top: 1px solid rgba(0,0,0,0.1); flex-direction: column; gap: 15px; background: rgba(255,255,255,0.8);">
            <div style="font-size: 1rem; color: #555;">
                ${stage.Stage_Desc || '설명이 없습니다.'}
            </div>
            
            <div style="display:flex; flex-direction: column; gap:8px;">
                <div style="font-size: 0.9rem; font-weight: bold; color: #333;">등장 캐릭터 (최대 8인)</div>
                <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                    ${charsHTML}
                </div>
            </div>
            
            <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                ${firstRewardHTML ? `<div><div style="font-size:0.9rem; font-weight:bold; color:#8e44ad; margin-bottom:5px;">최초 클리어 보상</div><div style="display:flex; gap:8px; flex-wrap:wrap;">${firstRewardHTML}</div></div>` : ''}
                ${rewardHTML ? `<div><div style="font-size:0.9rem; font-weight:bold; color:#2980b9; margin-bottom:5px;">기본 클리어 보상</div><div style="display:flex; gap:8px; flex-wrap:wrap;">${rewardHTML}</div></div>` : ''}
                ${bonusRewardHTML ? `<div><div style="font-size:0.9rem; font-weight:bold; color:#e74c3c; margin-bottom:5px;">이슈 추가 보상</div><div style="display:flex; gap:8px; flex-wrap:wrap;">${bonusRewardHTML}</div></div>` : ''}
            </div>
            
            ${activeIssuesHTML}
            ${autoWarning}
            
            <div style="display: flex; justify-content: space-between; margin-top: 10px;">
                <div style="display:flex; gap:10px;">
                    <button class="cancel-btn" style="padding: 10px 20px; font-size: 1.15rem; background: #95a5a6; color: white;" onclick="window.openIssueModal('${stage.Stage_ID}'); event.stopPropagation();">이슈 설정 (현재 포인트: ${totalPoints} P)</button>
                    <button class="cancel-btn" style="padding: 10px 20px; font-size: 1.15rem; background: #e74c3c; color: white;" onclick="window.resetRehearsalIssue('${stage.Stage_ID}'); event.stopPropagation();">이슈 초기화</button>
                </div>
                ${isLocked ? `
                    <button class="cancel-btn" style="padding: 10px 30px; font-size: 1.1rem; background: #7f8c8d; color: white; cursor: not-allowed;" onclick="alert('이전 단계를 먼저 클리어해야 합니다.'); event.stopPropagation();">🔒 이전 단계 클리어 필요</button>
                ` : `
                    ${(stage.Stage_Auto == 1 || stage.Stage_Auto == "1") ? 
                    (!(window.PlayerData && window.PlayerData.clearedStages && window.PlayerData.clearedStages.includes(stage.Stage_ID)) ?
                        `<button class="cancel-btn" style="padding: 10px 20px; font-size: 1.0rem; background: #7f8c8d; color: white; cursor: not-allowed;" onclick="event.stopPropagation();">최소 1회 클리어 필요</button>`
                    : (totalPoints > 0 ? 
                        `<button class="cancel-btn" style="padding: 10px 20px; font-size: 1.0rem; background: #95a5a6; color: white; cursor: not-allowed;" onclick="event.stopPropagation();">이슈 적용 : 스킵불가</button>`
                        : `<button class="execute-btn" style="padding: 10px 20px; font-size: 1.15rem; background: #27ae60;" onclick="window.skipRehearsalBattle('${stage.Stage_ID}'); event.stopPropagation();">스킵</button>`
                    )) : ''}
                    <button class="execute-btn" style="padding: 10px 40px; font-size: 1.15rem;" onclick="window.startRehearsalBattle('${stage.Stage_ID}'); event.stopPropagation();">입장</button>
                `}
            </div>
        </div>
    </div>
    `;
}

window.openIssueModal = function(stageId) {
    window.currentIssueStageId = stageId;
    
    // Determine active issues for this specific stage
    let currentStageIssues = new Set();
    if (window.activeRehearsalIssues && window.activeRehearsalIssues[stageId]) {
        currentStageIssues = window.activeRehearsalIssues[stageId];
    } else if (PlayerData.savedRehearsalIssues && PlayerData.savedRehearsalIssues[stageId]) {
        currentStageIssues = new Set(PlayerData.savedRehearsalIssues[stageId]);
    }
    
    window.selectedRehearsalIssues = new Set(currentStageIssues);
    
    const modal = document.getElementById('issue-modal');
    const container = document.getElementById('issue-list-container');
    
    const validIssues = (GameData.issue || []).filter(i => i.Issue_Con === '공통' || i.Issue_Con === '리허설');
    
    let html = '';
    let lastBaseName = '';
    
    validIssues.forEach(iss => {
        const baseName = (iss.Issue_Name || "").replace(/\s+(I|II|III|IV|V|VI|VII|VIII|IX|X)$/g, '');
        if (lastBaseName !== '' && lastBaseName !== baseName) {
            html += `<div style="height: 15px; border-bottom: 2px dashed #ddd; margin-bottom: 15px;"></div>`;
        }
        lastBaseName = baseName;
        
        const isActive = window.selectedRehearsalIssues.has(iss.Issue_ID);
        html += `
        <div class="issue-row ${isActive ? 'active' : ''}" onclick="window.toggleRehearsalIssue('${iss.Issue_ID}')" id="issue-row-${iss.Issue_ID}" style="margin-bottom: 5px;">
            <div style="display:flex; flex-direction:column; gap:5px;">
                <div style="font-size:1.1rem; font-weight:bold; color:#333;">${iss.Issue_Name}</div>
                <div style="font-size:0.9rem; color:#666;">${iss.Issue_Desc}</div>
            </div>
            <div style="font-size:1.2rem; font-weight:bold; color:#e74c3c;">+${iss.Issue_Point} P</div>
        </div>
        `;
    });
    container.innerHTML = html;
    window.updateIssueTotalPoints();
    modal.classList.add('show');
};

window.toggleRehearsalIssue = function(issueId) {
    const iss = (GameData.issue || []).find(i => i.Issue_ID === issueId);
    if (!iss) return;
    
    const baseName = (iss.Issue_Name || "").replace(/\s+(I|II|III|IV|V|VI|VII|VIII|IX|X)$/g, '');
    
    if (window.selectedRehearsalIssues.has(issueId)) {
        window.selectedRehearsalIssues.delete(issueId);
    } else {
        const allIssues = GameData.issue || [];
        for (let id of window.selectedRehearsalIssues) {
            const existing = allIssues.find(i => i.Issue_ID === id);
            if (existing) {
                const exBase = (existing.Issue_Name || "").replace(/\s+(I|II|III|IV|V|VI|VII|VIII|IX|X)$/g, '');
                if (exBase === baseName) {
                    window.selectedRehearsalIssues.delete(id);
                    const el = document.getElementById('issue-row-' + id);
                    if (el) el.classList.remove('active');
                }
            }
        }
        window.selectedRehearsalIssues.add(issueId);
    }
    
    const el = document.getElementById('issue-row-' + issueId);
    if (el) {
        if (window.selectedRehearsalIssues.has(issueId)) el.classList.add('active');
        else el.classList.remove('active');
    }
    
    window.updateIssueTotalPoints();
};

window.updateIssueTotalPoints = function() {
    let totalPoints = 0;
    const allIssues = GameData.issue || [];
    window.selectedRehearsalIssues.forEach(id => {
        const iss = allIssues.find(i => i.Issue_ID === id);
        if (iss) totalPoints += Number(iss.Issue_Point || 0);
    });
    const totalEl = document.getElementById('issue-total-point');
    if (totalEl) totalEl.textContent = `총 ${totalPoints} P`;
};

window.applyRehearsalIssues = function() {
    if (!window.activeRehearsalIssues) window.activeRehearsalIssues = {};
    window.activeRehearsalIssues[window.currentIssueStageId] = new Set(window.selectedRehearsalIssues);
    document.getElementById('issue-modal').classList.remove('show');
    
    if (window.lastRehearsalSubCategory !== undefined) {
        const expandedId = window.currentIssueStageId;
        window.openRehearsalSub(window.lastRehearsalSubCategory);
        setTimeout(() => {
            if (expandedId) {
                const list = document.getElementById('rehearsal-stage-list');
                if (list) {
                    const cards = list.querySelectorAll('.glass-panel');
                    for (let c of cards) {
                        if (c.innerHTML.includes(`openIssueModal('${expandedId}')`)) {
                            const clickable = c.querySelector('div[onclick*="window.toggleStageDetail"]');
                            if (clickable) window.toggleStageDetail(clickable);
                            break;
                        }
                    }
                }
            }
        }, 10);
    }
};

window.saveRehearsalIssues = function() {
    if (!window.PlayerData.savedRehearsalIssues) window.PlayerData.savedRehearsalIssues = {};
    if (window.currentIssueStageId) {
        window.PlayerData.savedRehearsalIssues[window.currentIssueStageId] = Array.from(window.selectedRehearsalIssues);
        if (typeof window.savePlayerData === 'function') window.savePlayerData();
    }
    alert("현재 이슈 조합이 이 스테이지의 기본값으로 저장되었습니다.");
    window.applyRehearsalIssues();
};;


window.toggleStageDetail = function(element) {
    // 1. Close all currently opened panes in the same list
    const parentContainer = element.closest('div[id$="-list"]');
    if (parentContainer) {
        parentContainer.querySelectorAll('.stage-detail-pane').forEach(pane => {
            if (pane !== element.nextElementSibling) {
                pane.classList.add('hidden');
                pane.style.display = 'none';
                const header = pane.previousElementSibling;
                if(header && header.querySelector('.toggle-icon')) {
                    header.querySelector('.toggle-icon').textContent = '▽';
                    header.classList.remove('active-stage-header');
                }
            }
        });
    }

    // 2. Toggle the clicked one
    const detailDiv = element.nextElementSibling;
    if (detailDiv.classList.contains('hidden')) {
        detailDiv.classList.remove('hidden');
        detailDiv.style.display = 'flex';
        element.querySelector('.toggle-icon').textContent = '△';
        element.classList.add('active-stage-header');
    } else {
        detailDiv.classList.add('hidden');
        detailDiv.style.display = 'none';
        element.querySelector('.toggle-icon').textContent = '▽';
        element.classList.remove('active-stage-header');
    }
}

window.startRehearsalBattle = function(stageId) {
    const allStages = GameData.stage || [];
    const stage = allStages.find(s => s.Stage_ID === stageId);
    if (!stage) return;

    if (stage.Stage_Type === '메인') {
        const mainStages = allStages.filter(s => s.Stage_Type === '메인');
        const sIdx = mainStages.findIndex(s => s.Stage_ID === stageId);
        if (sIdx > 0) {
            const prevStage = mainStages[sIdx - 1];
            const cleared = (window.PlayerData && window.PlayerData.clearedStages) || [];
            if (!cleared.includes(prevStage.Stage_ID)) {
                alert(`이전 단계(${prevStage.Stage_Name || '이전 스테이지'})를 먼저 클리어해야 합니다.`);
                return;
            }
        }
    }

    const apCost = parseInt(stage.Stage_AP) || 0;
    if ((PlayerData.ap || 0) < apCost) {
        alert(`AP가 부족합니다. (필요: ${apCost} AP, 보유: ${PlayerData.ap || 0} AP)`);
        return;
    }

    let stageActiveIssues = [];
    if (window.activeRehearsalIssues && window.activeRehearsalIssues[stageId]) {
        stageActiveIssues = Array.from(window.activeRehearsalIssues[stageId]);
    } else if (PlayerData.savedRehearsalIssues && PlayerData.savedRehearsalIssues[stageId]) {
        stageActiveIssues = Array.from(PlayerData.savedRehearsalIssues[stageId]);
    }

    const activeScene = document.querySelector('.scene.active');
    const returnSceneId = (activeScene && activeScene.id) ? activeScene.id : (stage.Stage_Type === '메인' ? 'scene-1' : 'scene-2');

    window.pendingBattleContext = {
        type: 'rehearsal',
        stageId: stage.Stage_ID,
        stage: stage,
        apCost: apCost,
        activeIssues: stageActiveIssues,
        returnScene: returnSceneId
    };

    const currentScene = activeScene || document.getElementById(returnSceneId);
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

window.resetRehearsalIssue = function(stageId) {
    if (window.activeRehearsalIssues) {
        delete window.activeRehearsalIssues[stageId];
    }
    if (PlayerData.savedRehearsalIssues) {
        delete PlayerData.savedRehearsalIssues[stageId];
    }
    if (window.savePlayerData) window.savePlayerData();
    
    if (window.lastRehearsalSubCategory !== undefined) {
        const expandedId = stageId;
        window.openRehearsalSub(window.lastRehearsalSubCategory);
        setTimeout(() => {
            if (expandedId) {
                const list = document.getElementById('rehearsal-stage-list');
                if (list) {
                    const cards = list.querySelectorAll('.glass-panel');
                    for (let c of cards) {
                        if (c.innerHTML.includes(`openIssueModal('${expandedId}')`)) {
                            const clickable = c.querySelector('div[onclick*="window.toggleStageDetail"]');
                            if (clickable) window.toggleStageDetail(clickable);
                            break;
                        }
                    }
                }
            }
        }, 10);
    }
};

window.skipRehearsalBattle = function(stageId) {
    window.openRehearsalSkipModal(stageId);
};

window.openRehearsalSkipModal = function(stageId) {
    const allStages = GameData.stage || [];
    const stage = allStages.find(s => s.Stage_ID === stageId);
    if (!stage) return;

    const apCost = parseInt(stage.Stage_AP) || 0;
    const availableTickets = (PlayerData.items && PlayerData.items['Item_003']) || 0;
    const availableAP = PlayerData.ap || 0;

    if (availableTickets < 1) {
        alert("스킵권(Item_003)이 부족합니다.");
        return;
    }
    if (availableAP < apCost) {
        alert(`AP가 부족합니다. (필요: ${apCost} AP, 보유: ${availableAP} AP)`);
        return;
    }

    const modal = document.getElementById('rehearsal-skip-modal');
    if (!modal) return;

    const maxByAp = apCost > 0 ? Math.floor(availableAP / apCost) : 999;
    const maxClears = Math.max(1, Math.min(availableTickets, maxByAp, 20));

    let currentSkipCount = 1;

    const infoEl = document.getElementById('skip-stage-info');
    if (infoEl) infoEl.textContent = `${stage.Stage_Name} (1회당 ${apCost} AP)`;

    const apDisplay = document.getElementById('skip-player-ap');
    if (apDisplay) apDisplay.textContent = `${availableAP}`;

    const ticketDisplay = document.getElementById('skip-player-ticket');
    if (ticketDisplay) ticketDisplay.textContent = `${availableTickets}`;

    const countDisplay = document.getElementById('skip-count-display');
    const slider = document.getElementById('skip-count-slider');
    const costApEl = document.getElementById('skip-cost-ap');
    const costTicketEl = document.getElementById('skip-cost-ticket');
    const expEl = document.getElementById('skip-expected-exp');
    const rewardsCont = document.getElementById('skip-expected-rewards');

    if (slider) {
        slider.min = 1;
        slider.max = maxClears;
        slider.value = 1;
    }

    const updatePreview = (count) => {
        currentSkipCount = count;
        if (countDisplay) countDisplay.textContent = count;
        if (slider) slider.value = count;
        if (costApEl) costApEl.textContent = count * apCost;
        if (costTicketEl) costTicketEl.textContent = count;
        if (expEl) expEl.textContent = (count * apCost * 100).toLocaleString();

        if (rewardsCont) {
            let html = '';
            if (stage.Stage_Reward) {
                const parts = stage.Stage_Reward.split(',');
                for (let i = 0; i < parts.length; i += 2) {
                    const itemId = parts[i].trim();
                    const baseAmt = parseInt(parts[i + 1]) || 1;
                    const totalAmt = baseAmt * count;
                    const item = (GameData.items || []).find(it => it.Item_ID === itemId) || (GameData.item || []).find(it => it.Item_ID === itemId);
                    if (item) {
                        html += `
                        <div style="display:flex; align-items:center; gap:5px; background:#fff; padding:4px 8px; border-radius:8px; border:1px solid #3498db; font-size:0.9rem; box-shadow: 0 2px 4px rgba(0,0,0,0.08);">
                            <img src="${item.Item_Icon}" style="width:28px; height:28px; object-fit:contain;" alt="${item.Item_Name}">
                            <span style="font-weight:bold; color:#111;">x${totalAmt}</span>
                        </div>`;
                    }
                }
            }
            rewardsCont.innerHTML = html || '<span style="color:#888;">보상 없음</span>';
        }
    };

    updatePreview(1);

    if (slider) {
        slider.oninput = (e) => {
            updatePreview(parseInt(e.target.value) || 1);
        };
    }

    const btnMinus = document.getElementById('btn-skip-count-minus');
    if (btnMinus) {
        btnMinus.onclick = () => {
            if (currentSkipCount > 1) updatePreview(currentSkipCount - 1);
        };
    }

    const btnPlus = document.getElementById('btn-skip-count-plus');
    if (btnPlus) {
        btnPlus.onclick = () => {
            if (currentSkipCount < maxClears) updatePreview(currentSkipCount + 1);
        };
    }

    const btnMax = document.getElementById('btn-skip-count-max');
    if (btnMax) {
        btnMax.onclick = () => {
            updatePreview(maxClears);
        };
    }

    const btnCancel = document.getElementById('btn-cancel-rehearsal-skip');
    if (btnCancel) {
        btnCancel.onclick = () => {
            modal.classList.remove('show');
        };
    }

    const btnConfirm = document.getElementById('btn-confirm-rehearsal-skip');
    if (btnConfirm) {
        btnConfirm.onclick = () => {
            const count = currentSkipCount;
            const totalAp = count * apCost;
            if ((PlayerData.ap || 0) < totalAp) {
                alert(`AP가 부족합니다. (필요: ${totalAp} AP, 보유: ${PlayerData.ap || 0} AP)`);
                return;
            }
            if (((PlayerData.items && PlayerData.items['Item_003']) || 0) < count) {
                alert("스킵권이 부족합니다.");
                return;
            }

            // Deduct currencies
            PlayerData.ap -= totalAp;
            PlayerData.items['Item_003'] -= count;

            // Account EXP
            const totalExp = totalAp * 100;
            if (totalExp > 0 && typeof addAccountExp === 'function') {
                addAccountExp(totalExp);
            }

            // Grant rewards
            const rewardList = [];
            if (stage.Stage_Reward) {
                const parts = stage.Stage_Reward.split(',');
                for (let i = 0; i < parts.length; i += 2) {
                    const itemId = parts[i].trim();
                    const baseAmt = parseInt(parts[i + 1]) || 1;
                    const totalAmt = baseAmt * count;
                    if (itemId) {
                        PlayerData.items[itemId] = (PlayerData.items[itemId] || 0) + totalAmt;
                        rewardList.push({ id: itemId, count: totalAmt });
                    }
                }
            }

            if (!PlayerData.clearedStages) PlayerData.clearedStages = [];
            if (!PlayerData.clearedStages.includes(stageId)) PlayerData.clearedStages.push(stageId);

            if (window.updateTopCurrencies) window.updateTopCurrencies();
            if (window.updateAPUI) window.updateAPUI();
            if (window.savePlayerData) window.savePlayerData();
            if (typeof window.renderMainStoryScene === 'function') window.renderMainStoryScene();
            if (typeof window.updateMainMenuFeatureLocks === 'function') window.updateMainMenuFeatureLocks();

            modal.classList.remove('show');

            // Show reward popup
            window.openStageRewardModal({
                subtitle: `[${stage.Stage_Name}] ${count}회 스킵 완료`,
                exp: totalExp,
                items: rewardList
            });
        };
    }

    modal.classList.add('show');
};

window.openStageRewardModal = function({ subtitle, exp, items }) {
    const modal = document.getElementById('stage-reward-modal');
    if (!modal) return;
    const subEl = document.getElementById('stage-reward-subtitle');
    if (subEl && subtitle) subEl.textContent = subtitle;
    const expEl = document.getElementById('stage-reward-exp-val');
    if (expEl) expEl.textContent = `+${exp}`;
    const itemsCont = document.getElementById('stage-reward-items-container');
    if (itemsCont) {
        let html = '';
        (items || []).forEach(it => {
            const itemDef = (GameData.items || []).find(x => x.Item_ID === it.id) || (GameData.item || []).find(x => x.Item_ID === it.id);
            const iconUrl = itemDef ? itemDef.Item_Icon : '';
            const name = itemDef ? itemDef.Item_Name : it.id;
            html += `
            <div class="stage-reward-item-card" style="display:flex; flex-direction:column; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px; min-width:85px; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                ${iconUrl ? `<img src="${iconUrl}" style="width:44px; height:44px; object-fit:contain; margin-bottom:5px;">` : ''}
                <div style="font-size:0.8rem; color:#475569; font-weight:bold; max-width:90px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${name}">${name}</div>
                <div style="font-size:1.1rem; color:#e67e22; font-weight:bold;">x${it.count}</div>
            </div>`;
        });
        itemsCont.innerHTML = html || '<div style="color:#888;">획득한 아이템이 없습니다.</div>';
    }

    const btnClose = document.getElementById('btn-close-stage-reward');
    if (btnClose) {
        btnClose.onclick = () => {
            modal.classList.remove('show');
            if (typeof window.renderMainStoryScene === 'function') {
                window.renderMainStoryScene();
            }
            if (typeof window.updateMainMenuFeatureLocks === 'function') {
                window.updateMainMenuFeatureLocks();
            }
            if (window.lastRehearsalSubCategory && typeof window.openRehearsalSub === 'function') {
                const rehearsalScene = document.getElementById('scene-2');
                if (rehearsalScene && rehearsalScene.classList.contains('active')) {
                    window.openRehearsalSub(window.lastRehearsalSubCategory);
                }
            }
        };
    }

    modal.classList.add('show');
};

window.openStageDefeatModal = function() {
    const modal = document.getElementById('stage-defeat-modal');
    if (!modal) return;

    const btnClose = document.getElementById('btn-close-stage-defeat');
    if (btnClose) {
        btnClose.onclick = () => {
            modal.classList.remove('show');
        };
    }

    modal.classList.add('show');
};
