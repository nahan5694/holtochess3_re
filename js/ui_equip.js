import { GameData, PlayerData } from './state.js?v=004276';
import { updateCharInfoStats } from './ui.js?v=004276';
import { calculateCoreValue } from './core.js?v=004276';

function getTierColor(tier) {
    if (tier == 1) return '#95a5a6'; // gray
    if (tier == 2) return '#f1c40f'; // yellow
    if (tier == 3) return '#e84393'; // pink
    if (tier == 4) return '#00d2d3'; // bright blue
    return '#95a5a6';
}

function romanize(num) {
    if (num == 1) return 'I';
    if (num == 2) return 'II';
    if (num == 3) return 'III';
    if (num == 4) return 'IV';
    return 'I';
}

function getCoreAssetUrl(element) {
    const map = {
        '청초': 'Seiso_icon.png',
        '쿨': 'Cool_icon.png',
        '게닌': 'Genin_icon.png',
        '아티스트': 'Artist_icon.png',
        '큐트': 'Cute_icon.png',
        '광기': 'Crazy_icon.png',
        '에로': 'Ero_icon.png'
    };
    const icon = map[element] || 'Seiso_icon.png';
    return 'https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/' + icon;
}

export function openCoreEquipModal(char) {
    const modal = document.getElementById('char-core-equip-modal');
    const listContainer = document.getElementById('char-core-equip-list');
    
    // UI 업데이트용 char 객체 임시 저장
    window.__currentEquipChar = char;
    
    // Event listener for sort dropdown
    const sortSelect = document.getElementById('core-equip-sort');
    if (sortSelect && !sortSelect.dataset.listenerBound) {
        sortSelect.addEventListener('change', () => {
            renderCoreEquipList();
        });
        sortSelect.dataset.listenerBound = "true";
    }
    
    renderCoreEquipList();
    
    modal.classList.add('show');
    
    document.getElementById('btn-char-core-equip-close').onclick = () => {
        modal.classList.remove('show');
    };
    
    modal.onclick = (e) => {
        if (e.target === modal) modal.classList.remove('show');
    };
}

function renderCoreEquipList() {
    const char = window.__currentEquipChar;
    if (!char) return;
    
    const listContainer = document.getElementById('char-core-equip-list');
    const charType = char.Character_Type;
    let availableCores = (PlayerData.cores || []).filter(c => c.element === charType);
    
    const sortType = document.getElementById('core-equip-sort') ? document.getElementById('core-equip-sort').value : 'default';
    
    availableCores.sort((a, b) => {
        const valA = calculateCoreValue(a);
        const valB = calculateCoreValue(b);
        
        if (sortType === 'default') {
            const aEquippedByMe = a.equippedTo === char.Character_ID ? 1 : 0;
            const bEquippedByMe = b.equippedTo === char.Character_ID ? 1 : 0;
            const aEquippedByOther = a.equippedTo && a.equippedTo !== char.Character_ID ? 1 : 0;
            const bEquippedByOther = b.equippedTo && b.equippedTo !== char.Character_ID ? 1 : 0;

            // 1. Equipped by Me (최상단)
            if (aEquippedByMe !== bEquippedByMe) return bEquippedByMe - aEquippedByMe;
            
            // 2. 미장착 vs 장착(Other) (미장착이 위로)
            if (aEquippedByOther !== bEquippedByOther) return aEquippedByOther - bEquippedByOther;
            
            return valB - valA;
        } else if (sortType === 'vp-desc') {
            return valB - valA;
        } else if (sortType === 'vp-asc') {
            return valA - valB;
        }
        return valB - valA;
    });
    
    listContainer.innerHTML = '';
    
    if (availableCores.length === 0) {
        listContainer.innerHTML = '<div style="text-align: center; color: #888; padding: 20px;">장착 가능한 코어가 없습니다. (해당 속성의 코어 필요)</div>';
    } else {

        availableCores.sort((a, b) => {
            const aMe = a.equippedTo === char.Character_ID ? 1 : 0;
            const bMe = b.equippedTo === char.Character_ID ? 1 : 0;
            const aOther = (a.equippedTo && a.equippedTo !== char.Character_ID) ? 1 : 0;
            const bOther = (b.equippedTo && b.equippedTo !== char.Character_ID) ? 1 : 0;
            if (aMe !== bMe) return bMe - aMe; // My equipped core at the very top
            if (aOther !== bOther) return aOther - bOther; // Other's equipped cores at the bottom
            return b.level - a.level; // Then sort by level or something
        });
        
        availableCores.forEach(core => {

            const isEquippedByMe = core.equippedTo === char.Character_ID;
            const isEquippedByOther = core.equippedTo && !isEquippedByMe;
            
            const coreItem = document.createElement('div');
            coreItem.className = 'core-list-item';
            coreItem.style.cssText = `
                display: flex; justify-content: space-between; align-items: center; 
                padding: 15px; border: 1px solid #444; border-radius: 8px; 
                background: rgba(0, 0, 0, 0.5); cursor: pointer; position: relative; overflow: hidden;
            `;
            if (isEquippedByMe) {
                coreItem.style.borderColor = '#00d2d3';
                coreItem.style.background = 'rgba(0, 0, 0, 0.8)'; coreItem.style.boxShadow = '0 0 10px rgba(0, 210, 211, 0.3)';
            }
            
            // Hover effect
            coreItem.onmouseenter = () => { if(!isEquippedByMe) coreItem.style.background = 'rgba(255,255,255,0.1)'; };
            coreItem.onmouseleave = () => { if(!isEquippedByMe) coreItem.style.background = 'rgba(0,0,0,0.5)'; };
            
            const slotsHtml = core.slots.map((slot, index) => {
                const optDef = GameData.coreOptions.find(o => o.Core_E_ID === slot.optionId);
                const optName = optDef ? optDef.Core_E_Name : '알 수 없음';
                const statName = optDef ? optDef.Core_E_Desc : '';
                
                const tier = optDef ? parseInt(optDef.Core_E_Tier, 10) : 1;
                const color = getTierColor(tier);
                const roman = romanize(tier);
                const icon = optDef && optDef.Core_E_Icon ? optDef.Core_E_Icon : '🔸';
                
                return `
                    <div style="display: inline-flex; align-items: center; gap: 4px; background: rgba(0,0,0,0.6); border: 1px solid ${color}; padding: 4px 8px; border-radius: 6px;">
                        <span style="font-size: 14px; color: ${color};">${icon}</span>
                        <span style="font-weight: bold; font-size: 0.9rem; color: ${color};">${optName} ${roman}</span>
                        <span style="font-weight: bold; font-size: 0.95rem; color: #fff; margin-left: 4px;">| ${statName} +${slot.value}</span>
                    </div>
                `;
            }).join('');
            
            let equippedBadge = '';
            if (isEquippedByMe) {
                equippedBadge = '<span style="color: #00d2d3; font-size: 0.8rem; border: 1px solid #00d2d3; padding: 2px 6px; border-radius: 4px; margin-left: 10px; font-weight: bold;">장착중</span>';
            } else if (isEquippedByOther) {
                const otherChar = GameData.characters.find(c => c.Character_ID === core.equippedTo);
                const otherName = otherChar ? otherChar.Character_Name : '다른 캐릭터';
                equippedBadge = `<span style="color: #e74c3c; font-size: 0.8rem; border: 1px solid #e74c3c; padding: 2px 6px; border-radius: 4px; margin-left: 10px; font-weight: bold;">${otherName} 장착중</span>`;
            }

            coreItem.innerHTML = `
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; font-weight: bold; color: #fff; margin-bottom: 8px;">
                        <img src="${getCoreAssetUrl(core.element)}" style="width: 24px; height: 24px; margin-right: 8px; object-fit: contain;">
                        <span style="font-size: 1.1rem;">${core.element} 코어</span>
                        <span style="color: #00d2d3; font-size: 0.9rem; margin-left: 8px;">(VP: ${calculateCoreValue(core).toFixed(1)})</span>
                        ${equippedBadge}
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                        ${slotsHtml}
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px; align-items: flex-end; justify-content: center;">
                    <button class="action-btn" style="background: #f39c12; color: #fff; border: none; font-weight: bold; text-shadow: 1px 1px 2px rgba(0,0,0,0.5); border-radius: 4px; padding: 6px 12px; font-size: 0.9rem; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 4px;" 
                            onmouseover="this.style.background='#d68910'" onmouseout="this.style.background='#f39c12'"
                            onclick="event.stopPropagation(); window.gotoCoreEnhance('${core.uid}')">
                        <span style="font-size: 1.1rem;">⬆️</span> 강화
                    </button>
                </div>
            `;
            
            coreItem.onclick = () => {
                if (isEquippedByMe) {
                    window.unequipCore(char.Character_ID);
                } else {
                    window.equipCore(char.Character_ID, core.uid);
                }
            };
            
            listContainer.appendChild(coreItem);
        });
    }
}

window.gotoCoreEnhance = function(coreUid) {
    const equipModal = document.getElementById('char-core-equip-modal');
    if (equipModal) equipModal.classList.remove('show');
    const infoModal = document.getElementById('char-info-modal');
    if (infoModal) infoModal.classList.remove('show');
    
    import('./ui.js?v=004276').then(m => {
        const targetScene = document.getElementById('scene-core');
        let currentActive = Array.from(document.querySelectorAll('.scene')).find(s => s.classList.contains('active') && s.id !== 'scene-core');
        if (!currentActive) currentActive = document.getElementById('main-scene');
        
        import('./ui_core.js?v=004276').then(mcore => {
            if (mcore.openCoreScene) mcore.openCoreScene();
        });
        m.changeSceneWipe(currentActive, targetScene);
        
        setTimeout(() => {
            import('./ui_core.js?v=004276').then(module => {
                if(module.openCoreDetailModal) {
                    module.openCoreDetailModal(coreUid);
                }
            });
        }, 300);
    });
};

window.equipCore = function(charId, coreUid) {
    const stats = PlayerData.characterStats[charId];
    if (!stats) return;
    
    const core = PlayerData.cores.find(c => c.uid === coreUid);
    if (!core) return;
    
    if (core.equippedTo && core.equippedTo !== charId) {
        const otherStats = PlayerData.characterStats[core.equippedTo];
        if (otherStats) {
            otherStats.equippedCoreUid = null;
        }
    }
    
    if (stats.equippedCoreUid) {
        const oldCore = PlayerData.cores.find(c => c.uid === stats.equippedCoreUid);
        if (oldCore) oldCore.equippedTo = null;
    }
    
    stats.equippedCoreUid = coreUid;
    core.equippedTo = charId;
    
    renderCoreEquipList();
    
    const char = window.__currentEquipChar;
    if (char) {
        const level = stats.level || 1;
        const star = stats.star || 1;
        updateCharInfoStats(char, level, star, true);
    }
};

window.unequipCore = function(charId) {
    const stats = PlayerData.characterStats[charId];
    if (!stats) return;
    
    if (stats.equippedCoreUid) {
        const oldCore = PlayerData.cores.find(c => c.uid === stats.equippedCoreUid);
        if (oldCore) oldCore.equippedTo = null;
        stats.equippedCoreUid = null;
    }
    
    renderCoreEquipList();
    
    const char = window.__currentEquipChar;
    if (char) {
        const level = stats.level || 1;
        const star = stats.star || 1;
        updateCharInfoStats(char, level, star, true);
    }
};
