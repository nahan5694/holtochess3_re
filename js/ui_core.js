import { GameData, PlayerData } from './state.js?v=004276';
import { createCore, calculateCoreValue, enhanceCoreOption, promoteCoreOption, rerollCoreOption, CORE_ELEMENT_MAP, getMaxVp, getSlotVp, getCoreSlotVp, getStatFromVp } from './core.js?v=004276';
import { showMessage, showConfirmModal, updateTopCurrencies } from './ui.js?v=004276';

let currentSelectedCoreUid = null;

function romanize(num) {
    const lookup = {1: 'I', 2: 'II', 3: 'III', 4: 'IV'};
    return lookup[num] || num;
}

export function openCoreScene() {
    currentSelectedCoreUid = null;
    document.getElementById("core-detail-panel").style.display = "none";
    renderCoreList();
}


function getCoreAssetUrl(element) {
    const assetIdMap = {
        '아티스트': 'asset_011',
        '쿨': 'asset_012',
        '큐트': 'asset_013',
        '게닌': 'asset_014',
        '청초': 'asset_015',
        '에로': 'asset_016',
        '광기': 'asset_017'
    };
    const assetId = assetIdMap[element];
    if (assetId) {
        const asset = GameData.assets.find(a => a.Asset_ID === assetId);
        if (asset) return asset.Asset_Link;
    }
    return '';
}

function getTierColor(tier) {
    // 1: Gray, 2: Yellow, 3: Pink, 4: Brilliant Sky Blue
    return tier == 4 ? "#00d2d3" : (tier == 3 ? "#ff9ff3" : (tier == 2 ? "#f1c40f" : "#95a5a6"));
}

function renderCoreList() {
    const fragEl = document.getElementById("core-fragment-count");
    if (fragEl) {
        const fragCount = Number(PlayerData.items['Item_010']) || 0;
        fragEl.innerText = fragCount.toLocaleString();
    }

    const listContainer = document.getElementById("core-list-container");
    if (!listContainer) return;
    listContainer.innerHTML = "";

    const filterType = document.getElementById("core-filter-type").value;
    const sortType = document.getElementById("core-sort-type").value;
    const lockedActive = document.getElementById("core-filter-locked").classList.contains("active");
    const favActive = document.getElementById("core-filter-favorite").classList.contains("active");

    let filteredCores = PlayerData.cores.filter(c => {
        if (filterType !== 'all' && c.element !== filterType) return false;
        if (lockedActive && !c.locked) return false;
        if (favActive && !c.favorite) return false;
        return true;
    });

    filteredCores.sort((a, b) => {
        const valA = calculateCoreValue(a);
        const valB = calculateCoreValue(b);
        return sortType === 'desc' ? valB - valA : valA - valB;
    });

    if (filteredCores.length === 0) {
        listContainer.innerHTML = `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #ccc; font-size: 1.2rem; text-align: center;">
            보유한 코어가 없습니다.<br>하단의 버튼을 눌러 코어를 제작해보세요!
        </div>`;
        return;
    }

    filteredCores.forEach(core => {
        const totalVal = calculateCoreValue(core);
        const el = document.createElement("div");
        el.className = `core-item ${currentSelectedCoreUid === core.uid ? 'selected' : ''}`;
        el.style.display = "flex";
        el.style.alignItems = "center";
        el.style.width = "100%";
        el.style.padding = "12px 15px";
        el.style.marginBottom = "8px";
        el.style.cursor = "pointer";
        el.style.boxSizing = "border-box";
                el.style.background = "white";
        el.style.border = "1px solid #dee2e6";
        el.style.color = "#333";
        el.style.borderRadius = "12px";
        el.style.boxShadow = "0 2px 4px rgba(0,0,0,0.02)";
        
        // Highlight selected
        if (currentSelectedCoreUid === core.uid) {
            el.style.border = "2px solid #0984e3";
            el.style.background = "#f1f8ff";
        }

        const slotsHtml = core.slots.map(s => {
            const opt = GameData.coreOptions.find(o => o.Core_E_ID === s.optionId);
            const tier = opt ? opt.Core_E_Tier : 1;
            const color = getTierColor(tier);
            const icon = opt ? opt.Core_E_Icon : '▪';
            return `<div style="display: flex; align-items: center; gap: 4px; background: #f8f9fa; border: 1px solid #e9ecef; padding: 2px 6px; border-radius: 8px;"><div style="font-size: 14px; color: ${color};">${icon}</div><span style="font-weight: bold; font-size: 0.9rem; color: ${color};">${romanize(tier)}</span></div>`;
        }).join('');

        const assetUrl = getCoreAssetUrl(core.element);
        
        el.innerHTML = `
            <div class="core-item-icon" style="width: 40px; height: 40px; margin-right: 15px; flex-shrink: 0; background-image: url('${assetUrl}'); background-size: contain; background-repeat: no-repeat; background-position: center; border: none;"></div>
            <div style="flex-grow: 1; display: flex; justify-content: flex-start; align-items: center; white-space: nowrap;">
                <span style="font-size: 1.2rem; font-weight: bold; width: 140px; flex-shrink: 0; text-align: left; color: #333;">${core.element}의 코어</span>
                <span style="width: 60px; flex-shrink: 0; display: flex; gap: 5px; font-size: 1.1rem; justify-content: flex-start;">
                    ${core.favorite ? '<span style="color:#f1c40f;">⭐</span>' : ''}
                    ${core.locked ? '🔒' : ''}
                </span>
                <span style="font-size: 1.1rem; font-weight: bold; width: 50px; flex-shrink: 0; text-align: center; color: #0984e3;">${totalVal}</span>
                <div style="display: flex; gap: 6px; margin-left: 20px; flex-grow: 1; overflow: hidden;">
                    ${slotsHtml}
                </div>
            </div>
        `;
        el.addEventListener("click", () => {
            currentSelectedCoreUid = core.uid;
            renderCoreList();
            renderCoreDetail();
        });
        listContainer.appendChild(el);
    });
}

export function renderCoreDetail() {
    const detailPanel = document.getElementById("core-detail-panel");

    if (!currentSelectedCoreUid) {
        if(detailPanel) {
            detailPanel.style.display = "flex";
            detailPanel.style.visibility = "hidden";
        }
        return;
    }

    const core = PlayerData.cores.find(c => c.uid === currentSelectedCoreUid);
    if (!core) {
        if(detailPanel) {
            detailPanel.style.display = "flex";
            detailPanel.style.visibility = "hidden";
        }
        return;
    }

    if(detailPanel) {
        detailPanel.style.display = "flex";
        detailPanel.style.visibility = "visible";
    }

    const titleEl = document.getElementById("core-detail-name");
    titleEl.innerText = `${core.element}의 코어`;

    const iconEl = document.getElementById("core-detail-icon");
    iconEl.style.backgroundImage = `url('${getCoreAssetUrl(core.element)}')`;
    
    const valueEl = document.getElementById("core-total-value");
    if (valueEl) {
        valueEl.innerText = `코어 밸류 : ${calculateCoreValue(core)}`;
    }
    
    // Add favorite/lock functionality
    const favBtn = document.getElementById("btn-core-favorite");
    const lockBtn = document.getElementById("btn-core-lock");
    
    if (core.favorite) {
        favBtn.innerHTML = "⭐";
        favBtn.style.color = "#f1c40f";
        favBtn.style.textShadow = "0 0 5px rgba(241,196,15,0.5)";
        favBtn.style.filter = "none";
    } else {
        favBtn.innerHTML = "⭐";
        favBtn.style.color = "#ccc";
        favBtn.style.textShadow = "none";
        favBtn.style.filter = "grayscale(100%) opacity(50%)";
    }
    
    if (core.locked) {
        lockBtn.innerHTML = "🔒";
        lockBtn.style.filter = "none";
    } else {
        lockBtn.innerHTML = "🔓";
        lockBtn.style.filter = "grayscale(100%) opacity(50%)";
    }
    
    favBtn.onclick = () => {
        core.favorite = !core.favorite;
        renderCoreList();
        renderCoreDetail();
    };
    lockBtn.onclick = () => {
        core.locked = !core.locked;
        renderCoreList();
        renderCoreDetail();
    };
    lockBtn.onclick = () => {
        core.locked = !core.locked;
        renderCoreList();
        renderCoreDetail();
    };
    lockBtn.onclick = () => {
        core.locked = !core.locked;
        renderCoreList();
        renderCoreDetail();
    };
    favBtn.classList.toggle("active", core.favorite);
    lockBtn.classList.toggle("active", core.locked);

    const slotsContainer = document.getElementById("core-slots-container");
    slotsContainer.innerHTML = "";

    core.slots.forEach((slot, index) => {
        const optDef = GameData.coreOptions.find(o => o.Core_E_ID === slot.optionId);
        if (!optDef) return;

        const currentVp = getCoreSlotVp(slot, optDef);
        const maxVp = getMaxVp(optDef.Core_E_Tier);
        const safeVal = parseInt(slot.value) || 0;
        
        const isMaxed = currentVp >= maxVp;
        const statText = `${optDef.Core_E_Desc} + ${safeVal} // Max ${optDef.Core_E_Max}`;
        const color = getTierColor(optDef.Core_E_Tier);
        const statColor = isMaxed ? '#d35400' : '#636e72';

        const row = document.createElement("div");
        row.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; border: 1px solid #dfe4ea; border-radius: 8px; margin-bottom: 10px; background: white;";

        row.innerHTML = `
            <div style="display: flex; align-items: center; width: 100%;">
                <div style="width: 200px; max-width: 200px; min-width: 200px; font-size: 1.2rem; font-weight: bold; color: #333; text-align: left; flex-shrink: 0; display: flex; align-items: center; gap: 8px;">
                    ${optDef.Core_E_Name} <span style="font-size: 1rem; color: ${color};">${romanize(optDef.Core_E_Tier)}</span>
                </div>
                <div style="flex-grow: 1; font-size: 1.1rem; color: ${statColor}; text-align: left; white-space: nowrap; font-weight: ${isMaxed ? 'bold' : 'normal'};">${statText}</div>
                <div style="display: flex; gap: 8px; flex-shrink: 0; margin-left: 10px;">
                      <button class="core-action-btn btn-enhance" data-slot="${index}" style="width: 40px; height: 40px; border: 2px solid #0984e3; border-radius: 8px; cursor: pointer; color: #0984e3; font-size: 16px; background: white; transition: all 0.2s;" title="강화">🔼</button>
                      <button class="core-action-btn btn-promote" data-slot="${index}" style="width: 40px; height: 40px; border: 2px solid #f39c12; border-radius: 8px; cursor: pointer; color: #f39c12; font-size: 16px; background: white; transition: all 0.2s;" title="승급">⏫</button>
                      <button class="core-action-btn btn-reroll" data-slot="${index}" style="width: 40px; height: 40px; border: 2px solid #636e72; border-radius: 8px; cursor: pointer; color: #636e72; font-size: 16px; background: white; transition: all 0.2s;" title="리롤">♻️</button>
                  </div>
            </div>
        `;

        const btnEnhance = row.querySelector(".btn-enhance");
        const btnPromote = row.querySelector(".btn-promote");
        const btnReroll = row.querySelector(".btn-reroll");

        if (isMaxed) {
            btnEnhance.disabled = true;
            btnEnhance.style.opacity = "0.3";
            btnEnhance.style.cursor = "not-allowed";
        }

        btnEnhance.addEventListener("click", () => {
            if (isMaxed) return;
            openEnhanceModal(core, index, optDef);
        });

        if (!isMaxed || optDef.Core_E_Tier >= 3) {
            btnPromote.disabled = true;
            btnPromote.style.opacity = "0.3";
            btnPromote.style.cursor = "not-allowed";
        }
        btnPromote.addEventListener("click", () => {
            if (!isMaxed || optDef.Core_E_Tier >= 3) return;
            openPromoteModal(core, index, optDef);
        });

        btnReroll.addEventListener("click", () => {
            const rCost = {1:3, 2:5, 3:7, 4:10}[optDef.Core_E_Tier] || 5;
            showConfirmModal(`코어 조각 ${rCost}개를 소모하여 해당 슬롯을 리롤하시겠습니까?`, () => {
                if (rerollCoreOption(core.uid, index)) {
                    renderCoreList();
                    renderCoreDetail();
                }
            });
        });

        slotsContainer.appendChild(row);
    });
}

// ======================= MODAL LOGIC =======================
let enhancingCoreUid = null;
let enhancingSlotIndex = null;
let enhancingTargetVp = 0;
let enhancingCurrentVp = 0;
let enhancingReqFrags = 0;

window.openEnhanceModal = function(core, slotIndex, optDef) {
    enhancingCoreUid = core.uid;
    enhancingSlotIndex = slotIndex;
    
    // Refresh core ref just in case
    const freshCore = PlayerData.cores.find(c => c.uid === core.uid);
    if(!freshCore) return;
    const freshVal = freshCore.slots[slotIndex].value;
    
    enhancingCurrentVp = getCoreSlotVp(freshCore.slots[slotIndex], optDef);
    const maxVp = getMaxVp(optDef.Core_E_Tier);
    enhancingTargetVp = maxVp;
    
    if (enhancingCurrentVp >= maxVp) {
        document.getElementById("core-enhance-modal").style.display = "none";
        return; // already maxed
    }
    
    document.getElementById("enhance-modal-title").innerText = `[${optDef.Core_E_Name} ${romanize(optDef.Core_E_Tier)}] 강화`;
    document.getElementById("enhance-target-vp").innerText = enhancingTargetVp;
    document.getElementById("enhance-current-vp").innerText = Number(enhancingCurrentVp.toFixed(1));
    
    let pct = (enhancingCurrentVp / enhancingTargetVp) * 100;
    document.getElementById("enhance-progress-bar").style.width = `${pct}%`;

    const notchesContainer = document.getElementById("enhance-progress-notches");
    if (notchesContainer) {
        notchesContainer.innerHTML = "";
        const minStat = optDef.Core_E_Min;
        const maxStat = optDef.Core_E_Max;
        let steps = maxStat - minStat;
        let stepUnit = 1;
        
        if (['CE_007', 'CE_008', 'CE_009', 'CE_039'].includes(optDef.Core_E_ID)) {
            stepUnit = 10;
        }
        
        if (steps > 0) {
            for (let i = stepUnit; i <= steps; i += stepUnit) {
                const notchPct = (i / steps) * 100;
                const notch = document.createElement("div");
                notch.style.position = "absolute";
                notch.style.left = `${notchPct}%`;
                notch.style.top = "0";
                notch.style.bottom = "0";
                notch.style.width = "1px";
                notch.style.background = "rgba(0,0,0,0.2)";
                notchesContainer.appendChild(notch);
            }
        }
    }

    const btnConfirm = document.getElementById("btn-confirm-enhance");
    btnConfirm.disabled = true;
    
    // Popuate Fragments
    const fragments = PlayerData.items['Item_010'] || 0;
    document.getElementById("enhance-my-fragments").innerText = fragments;
    
    enhancingReqFrags = 0;
    
    // Populate Materials
    const listEl = document.getElementById("enhance-material-list");
    listEl.innerHTML = "";
    
    let unusedCores = PlayerData.cores.filter(c => c.uid !== freshCore.uid && !c.favorite && !c.locked && !c.equippedTo);
    
    // Default sort: lowest VP
    unusedCores.sort((a, b) => calculateCoreValue(a) - calculateCoreValue(b));
    
    unusedCores.forEach(uc => {
        const vpVal = calculateCoreValue(uc);
        if(vpVal <= 0) return;
        
        let badgesHtml = uc.slots.map(s => {
            const o = GameData.coreOptions.find(opt => opt.Core_E_ID === s.optionId);
            if(!o) return '';
            const tier = o.Core_E_Tier;
            const color = getTierColor(tier);
            const icon = o.Core_E_Icon || '❓';
            return `<div style="display: flex; align-items: center; gap: 4px; background: #f8f9fa; border: 1px solid #e9ecef; padding: 2px 6px; border-radius: 8px;"><div style="font-size: 14px; color: ${color};">${icon}</div><span style="font-weight: bold; font-size: 0.9rem; color: ${color};">${romanize(tier)}</span></div>`;
        }).join('');
        
        const row = document.createElement("div");
        row.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 10px; border: 1px solid #eee; border-radius: 8px; background: white;";
        row.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
                <input type="checkbox" class="material-checkbox" data-uid="${uc.uid}" data-vp="${vpVal}" style="width: 20px; height: 20px; flex-shrink: 0;">
                <img src="${getCoreAssetUrl(uc.element)}" style="width:30px; height:30px; flex-shrink: 0;">
                <div style="display: flex; align-items: center; gap: 15px; flex-grow: 1;">
                    <span style="font-weight: bold; white-space: nowrap; flex-shrink: 0; color: #333;">${uc.element}의 코어</span>
                    <div style="display: flex; gap: 6px; flex-wrap: nowrap; overflow: hidden;">${badgesHtml}</div>
                </div>
            </div>
            <span style="color: #0984e3; font-weight: bold; font-size: 1.1rem; flex-shrink: 0;">+${vpVal} VP</span>
        `;
        listEl.appendChild(row);
    });
    
    // Reset sort select
    const sortSel = document.getElementById("enhance-material-sort");
    if(sortSel) sortSel.value = 'asc';
    
    // Attach listeners
    const checkboxes = listEl.querySelectorAll(".material-checkbox");
    checkboxes.forEach(cb => cb.addEventListener("change", updateEnhanceModalProgress));
    
    document.getElementById("core-enhance-modal").style.display = "flex";
    updateEnhanceModalProgress();
}

window.updateEnhanceModalProgress = function() {
    let addVpFromCores = 0;
    const checkboxes = document.querySelectorAll("#enhance-material-list .material-checkbox:checked");
    checkboxes.forEach(cb => {
        addVpFromCores += parseInt(cb.getAttribute("data-vp") || 0);
    });
    
    let neededVp = enhancingTargetVp - enhancingCurrentVp - addVpFromCores;
    if (neededVp < 0) neededVp = 0; // Overshot with cores
    
    const myFrags = PlayerData.items['Item_010'] || 0;
    
    // Validate enhancingReqFrags
    if (enhancingReqFrags > myFrags) enhancingReqFrags = myFrags;
    if (enhancingReqFrags < 0) enhancingReqFrags = 0;
    
    // Prevent over-spending if already maxed
    const maxNeededFrags = neededVp * 10;
    if (enhancingReqFrags > maxNeededFrags) {
        enhancingReqFrags = maxNeededFrags;
    }
    
    let addVpFromFrags = enhancingReqFrags / 10;
    
    document.getElementById("enhance-req-fragments").innerText = enhancingReqFrags;
    
    const totalAddVp = addVpFromCores + addVpFromFrags;
    document.getElementById("enhance-frag-vp-text").innerText = `+${Number(addVpFromFrags.toFixed(1))} VP`;
    
    const displayVp = Math.min(enhancingCurrentVp + totalAddVp, enhancingTargetVp);
    
    // Update progress bar dynamically without changing the current inner text yet
    let pct = (displayVp / enhancingTargetVp) * 100;
    document.getElementById("enhance-progress-bar").style.width = `${pct}%`;
    
    const notchesContainer = document.getElementById("enhance-progress-notches");
    if (notchesContainer) {
        notchesContainer.innerHTML = "";
        const optDef = GameData.coreOptions.find(o => o.Core_E_ID === PlayerData.cores.find(c => c.uid === enhancingCoreUid).slots[enhancingSlotIndex].optionId);
        const minStat = optDef.Core_E_Min;
        const maxStat = optDef.Core_E_Max;
        let steps = maxStat - minStat;
        let stepUnit = 1;
        
        if (['CE_007', 'CE_008', 'CE_009', 'CE_039'].includes(optDef.Core_E_ID)) {
            stepUnit = 10;
        }
        
        if (steps > 0) {
            for (let i = stepUnit; i <= steps; i += stepUnit) {
                const notchPct = (i / steps) * 100;
                const notch = document.createElement("div");
                notch.style.position = "absolute";
                notch.style.left = `${notchPct}%`;
                notch.style.top = "0";
                notch.style.bottom = "0";
                notch.style.width = "1px";
                notch.style.background = "rgba(0,0,0,0.2)";
                notchesContainer.appendChild(notch);
            }
        }
    }
    
    const btnConfirm = document.getElementById("btn-confirm-enhance");
    if (totalAddVp > 0) {
        btnConfirm.disabled = false;
        btnConfirm.innerText = `강화하기 (+${totalAddVp} VP)`;
    } else {
        btnConfirm.disabled = true;
        btnConfirm.innerText = `재료 부족`;
    }
}

// Promote Modal Logic
let promotingCoreUid = null;
let promotingSlotIndex = null;

window.openPromoteModal = function(core, slotIndex, optDef) {
    promotingCoreUid = core.uid;
    promotingSlotIndex = slotIndex;
    
    document.getElementById("promote-opt-name").innerText = optDef.Core_E_Name;
    document.getElementById("promote-tier-from").innerText = romanize(optDef.Core_E_Tier);
    document.getElementById("promote-tier-to").innerText = romanize(optDef.Core_E_Tier + 1);
    
    const reqFrags = optDef.Core_E_Tier * 100;
    document.getElementById("promote-req-fragments").innerText = reqFrags;
    
    const myFrags = PlayerData.items['Item_010'] || 0;
    document.getElementById("promote-my-fragments").innerText = myFrags;
    
    const btnConfirm = document.getElementById("btn-confirm-promote");
    if (myFrags >= reqFrags) {
        btnConfirm.disabled = false;
        btnConfirm.style.opacity = "1";
    } else {
        btnConfirm.disabled = true;
        btnConfirm.style.opacity = "0.5";
    }
    
    document.getElementById("core-promote-modal").style.display = "flex";
}


export function initCoreUI() {
    // Modal Outside Clicks
    const enhanceModal = document.getElementById("core-enhance-modal");
    if(enhanceModal) {
        enhanceModal.addEventListener("click", (e) => {
            if(e.target === enhanceModal) enhanceModal.style.display = "none";
        });
        document.getElementById("btn-cancel-enhance").addEventListener("click", () => {
            enhanceModal.style.display = "none";
        });
        
        document.getElementById("btn-confirm-enhance").addEventListener("click", () => {
            let addVpFromCores = 0;
            let coreUidsToRemove = [];
            const checkboxes = document.querySelectorAll("#enhance-material-list .material-checkbox:checked");
            checkboxes.forEach(cb => {
                addVpFromCores += parseInt(cb.getAttribute("data-vp") || 0);
                coreUidsToRemove.push(cb.getAttribute("data-uid"));
            });
            
            const reqFrags = parseInt(document.getElementById("enhance-req-fragments").innerText);
            const totalAddVp = addVpFromCores + (reqFrags / 10);
            
            if(reqFrags > 0) {
                PlayerData.items['Item_010'] -= reqFrags;
            }
            if(coreUidsToRemove.length > 0) {
                PlayerData.cores = PlayerData.cores.filter(c => !coreUidsToRemove.includes(c.uid));
            }
            
            if(enhanceCoreOption(enhancingCoreUid, enhancingSlotIndex, totalAddVp)) {
                // DON'T CLOSE MODAL! Re-render background and re-open modal with new data!
                renderCoreList();
                renderCoreDetail();
                
                const freshCore = PlayerData.cores.find(c => c.uid === enhancingCoreUid);
                const optDef = GameData.coreOptions.find(o => o.Core_E_ID === freshCore.slots[enhancingSlotIndex].optionId);
                openEnhanceModal(freshCore, enhancingSlotIndex, optDef);
            }
        });
    }

    const adjustFrags = (amount) => {
        const myFrags = PlayerData.items['Item_010'] || 0;
        let addVpFromCores = 0;
        document.querySelectorAll("#enhance-material-list .material-checkbox:checked").forEach(cb => {
            addVpFromCores += parseInt(cb.getAttribute("data-vp") || 0);
        });
        const neededVp = Math.max(0, enhancingTargetVp - enhancingCurrentVp - addVpFromCores);
        const maxNeededFrags = neededVp * 10;
        
        if (amount === 'MAX') {
            enhancingReqFrags = Math.min(myFrags, maxNeededFrags);
            
        } else if (amount === 'RESET') {
            enhancingReqFrags = 0;
        } else {
            enhancingReqFrags += amount;
        }
        updateEnhanceModalProgress();
    };

    document.getElementById("btn-frag-minus-10")?.addEventListener("click", () => adjustFrags(-10));
    document.getElementById("btn-frag-minus-1")?.addEventListener("click", () => adjustFrags(-1));
    document.getElementById("btn-frag-plus-1")?.addEventListener("click", () => adjustFrags(1));
    document.getElementById("btn-frag-plus-10")?.addEventListener("click", () => adjustFrags(10));
    document.getElementById("btn-frag-max")?.addEventListener("click", () => adjustFrags('MAX'));
    document.getElementById("btn-frag-reset")?.addEventListener("click", () => adjustFrags('RESET'));

    document.getElementById("enhance-material-sort")?.addEventListener("change", () => {
        // We need to re-render the materials! But we can just sort the children.
        const list = document.getElementById("enhance-material-list");
        const sortType = document.getElementById("enhance-material-sort").value;
        const rows = Array.from(list.children);
        rows.sort((a, b) => {
            const vpA = parseInt(a.querySelector(".material-checkbox").getAttribute("data-vp") || 0);
            const vpB = parseInt(b.querySelector(".material-checkbox").getAttribute("data-vp") || 0);
            return sortType === 'asc' ? vpA - vpB : vpB - vpA;
        });
        rows.forEach(r => list.appendChild(r));
    });

    const promoteModal = document.getElementById("core-promote-modal");
    if(promoteModal) {
        promoteModal.addEventListener("click", (e) => {
            if(e.target === promoteModal) promoteModal.style.display = "none";
        });
        document.getElementById("btn-cancel-promote").addEventListener("click", () => {
            promoteModal.style.display = "none";
        });
        
        document.getElementById("btn-confirm-promote").addEventListener("click", () => {
            if (promoteCoreOption(promotingCoreUid, promotingSlotIndex)) {
                promoteModal.style.display = "none";
                renderCoreList();
                renderCoreDetail();
            }
        });
    }

    const filterTypeEl = document.getElementById("core-filter-type");
    if (filterTypeEl) filterTypeEl.addEventListener("change", renderCoreList);
    
    const sortTypeEl = document.getElementById("core-sort-type");
    if (sortTypeEl) sortTypeEl.addEventListener("change", renderCoreList);
    
    const filterLockedEl = document.getElementById("core-filter-locked");
    if (filterLockedEl) filterLockedEl.addEventListener("click", function() {
        this.classList.toggle("active");
        renderCoreList();
    });
    
    const filterFavEl = document.getElementById("core-filter-favorite");
    if (filterFavEl) filterFavEl.addEventListener("click", function() {
        this.classList.toggle("active");
        renderCoreList();
    });

    
    const btnCraft = document.getElementById("btn-craft-core");
    if (btnCraft) {
        // Remove old listener and add new one
        const newBtnCraft = btnCraft.cloneNode(true);
        btnCraft.parentNode.replaceChild(newBtnCraft, btnCraft);
        
        newBtnCraft.addEventListener("click", () => {
            const elements = ['청초', '게닌', '쿨', '아티스트', '큐트', '광기', '에로'];
            const myCredit = Number(PlayerData.items['Item_002']) || 0;
            let modalHtml = `
                <div style="text-align: center; margin-bottom: 20px;">
                    <h2 style="color: #333; margin-bottom: 10px;">신규 코어 제작</h2>
                    <p style="color: #666;">크레딧 1000, 코어조각 5개, 속성파편 1개가 소모됩니다.</p>
                    <p style="color: #005ce6; font-weight: bold; margin-top: 10px;">보유 크레딧: ${myCredit.toLocaleString()}</p>
                </div>
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px;">
            `;
            elements.forEach(el => {
                const url = getCoreAssetUrl(el);
                const elItemId = CORE_ELEMENT_MAP[el];
                const myElCount = Number(PlayerData.items[elItemId]) || 0;
                modalHtml += `
                    <div class="craft-element-btn" data-elem="${el}" style="display: flex; flex-direction: column; align-items: center; padding: 10px; border: 2px solid #ccc; border-radius: 8px; cursor: pointer; transition: all 0.2s;">
                        <div style="width: 50px; height: 50px; background-image: url('${url}'); background-size: cover; border-radius: 50%; margin-bottom: 5px;"></div>
                        <span style="font-weight: bold; color: #333;">${el}</span>
                        <span style="font-size: 0.8rem; color: #0984e3; margin-top: 5px;">보유: ${myElCount}</span>
                    </div>
                `;
            });
            modalHtml += `</div>
                <div style="display: flex; justify-content: center; gap: 10px;">
                    <button id="craft-modal-cancel" class="glass-panel" style="padding: 10px 20px; font-weight: bold; cursor: pointer;">취소</button>
                    <button id="craft-modal-confirm" class="glass-panel" style="padding: 10px 20px; font-weight: bold; background: #00d2d3; color: white; cursor: pointer;" disabled>제작하기</button>
                </div>
            `;
            
            const overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100vw';
            overlay.style.height = '100vh';
            overlay.style.background = 'rgba(0,0,0,0.7)';
            overlay.style.display = 'flex';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.style.zIndex = '9999';
            
            const modal = document.createElement('div');
            modal.style.background = 'white';
            modal.style.padding = '30px';
            modal.style.borderRadius = '16px';
            modal.style.width = '400px';
            modal.innerHTML = modalHtml;
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            let selectedElement = null;
            
            const buttons = modal.querySelectorAll('.craft-element-btn');
            const confirmBtn = modal.querySelector('#craft-modal-confirm');
            
            buttons.forEach(btn => {
                btn.addEventListener('click', () => {
                    buttons.forEach(b => b.style.border = '2px solid #ccc');
                    btn.style.border = '2px solid #00d2d3';
                    selectedElement = btn.getAttribute('data-elem');
                    confirmBtn.disabled = false;
                });
            });
            
            modal.querySelector('#craft-modal-cancel').addEventListener('click', () => {
                document.body.removeChild(overlay);
            });
            
            confirmBtn.addEventListener('click', () => {
                  if(selectedElement) {
                      if(createCore(selectedElement)) {
                          renderCoreList();
                          document.body.removeChild(overlay);
                      }
                  } else {
                      showMessage("속성을 선택해주세요.");
                  }
              });
        });
    }

    
    const sceneCore = document.getElementById("scene-core");
    if(sceneCore) {
        const btnBack = sceneCore.querySelector(".btn-back");
        if(btnBack) {
            btnBack.addEventListener("click", () => {
                window.dispatchEvent(new CustomEvent("request-scene-change", {detail: "scene-3"})); 
            });
        }
        const btnHome = sceneCore.querySelector(".btn-home");
        if(btnHome) {
            btnHome.addEventListener("click", () => {
                window.dispatchEvent(new CustomEvent("request-scene-change", {detail: "scene-3"}));
            });
        }
    }
}