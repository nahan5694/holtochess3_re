import { GameData, PlayerData } from './state.js?v=004276';

let tagPool = [];
let ssrCombos = {}; // e.g. "TagA|TagB": true
let currentAuditionSlot = null;
let generatedTags = [];
let selectedTags = [];
let timeVal = 1;

function getMainTag(tagString) {
    if (!tagString) return "";
    return tagString.split('/')[0].trim();
}

export function initAuditionSystem() {
    if (!GameData.characters || GameData.characters.length === 0) return;

    const classes = new Set();
    const roles = new Set();
    const types = new Set();

    GameData.characters.forEach(c => {
        const mClass = getMainTag(c.Character_Class);
        const mRole = getMainTag(c.Character_Role);
        const mType = getMainTag(c.Character_Type);
        
        if (mClass) classes.add(mClass);
        if (mRole) roles.add(mRole);
        if (mType) types.add(mType);
    });

    tagPool = [...classes, ...roles, ...types];

    // Compute SSR Combinations
    ssrCombos = {};
    for (let i = 0; i < tagPool.length; i++) {
        for (let j = i + 1; j < tagPool.length; j++) {
            const t1 = tagPool[i];
            const t2 = tagPool[j];
            const matchingChars = GameData.characters.filter(c => 
                (getMainTag(c.Character_Class) === t1 || getMainTag(c.Character_Role) === t1 || getMainTag(c.Character_Type) === t1) &&
                (getMainTag(c.Character_Class) === t2 || getMainTag(c.Character_Role) === t2 || getMainTag(c.Character_Type) === t2)
            );
            
            if (matchingChars.length > 0) {
                const allSsr = matchingChars.every(c => c.Character_Tier === "SSR");
                if (allSsr) {
                    const key = [t1, t2].sort().join("|");
                    ssrCombos[key] = true;
                }
            }
        }
    }

    // Expose for UI updates
    window.updateAuditionUI = renderAuditionSlots;

    // Register UI Events
    const slider = document.getElementById("audition-time-slider");
    if (slider) slider.addEventListener("input", handleAuditionSliderChange);

    const btnStart = document.getElementById("btn-audition-start");
    if (btnStart) btnStart.addEventListener("click", startAudition);

    const btnCancel = document.getElementById("btn-audition-cancel");
    if (btnCancel) {
        btnCancel.addEventListener("click", () => {
            const modal = document.getElementById("audition-setup-modal");
            if (modal) modal.classList.remove("show");
            currentAuditionSlot = null;
        });
    }
}

export function openAuditionModal(slotIdx) {
    currentAuditionSlot = slotIdx;
    selectedTags = [];
    timeVal = 1;

    // Reset UI
    const slider = document.getElementById("audition-time-slider");
    if(slider) slider.value = 1;
    updateTimeAndCostDisplay(1);

    if (PlayerData.auditions[slotIdx] && PlayerData.auditions[slotIdx].state === "pending") {
        generatedTags = PlayerData.auditions[slotIdx].tags || [];
    } else {
        generateRandomTags();
        PlayerData.auditions[slotIdx] = {
            state: "pending",
            tags: [...generatedTags]
        };
    }
    
    renderTags();

    const modal = document.getElementById("audition-setup-modal");
    if(modal) modal.classList.add("show");
}

export function updateTimeAndCostDisplay(val) {
    const timeDisplay = document.getElementById("audition-time-display");
    const costDisplay = document.getElementById("audition-cost-display");
    
    if(timeDisplay) {
        const hours = Math.floor(val * 5 / 60).toString().padStart(2, '0');
        const mins = (val * 5 % 60).toString().padStart(2, '0');
        timeDisplay.textContent = `${hours} 시간 (${hours}:${mins})`;
    }
    
    if(costDisplay) {
        costDisplay.textContent = (val * 1000).toLocaleString();
    }
}

export function handleAuditionSliderChange(e) {
    timeVal = parseInt(e.target.value);
    updateTimeAndCostDisplay(timeVal);
}

function generateRandomTags() {
    generatedTags = [];
    const pool = [...tagPool];
    
    // Add special tags
    pool.push("SSR");
    pool.push("SR");

    while (generatedTags.length < 4) {
        const isSsr = Math.random() < 0.005; // 0.5%
        const isSr = Math.random() < 0.025; // 2.5%

        let pickedTag = "";
        if (isSsr && !generatedTags.includes("SSR")) pickedTag = "SSR";
        else if (isSr && !generatedTags.includes("SR")) pickedTag = "SR";
        else {
            const normalPool = tagPool.filter(t => !generatedTags.includes(t));
            pickedTag = normalPool[Math.floor(Math.random() * normalPool.length)];
        }

        // SSR Combo Nerf
        let isNerfed = false;
        for (const existing of generatedTags) {
            const key = [pickedTag, existing].sort().join("|");
            if (ssrCombos[key]) {
                if (Math.random() > 0.01) { // 99% chance to nerf
                    isNerfed = true;
                    break;
                }
            }
        }

        if (isNerfed) continue; // Reroll this tag
        
        if (!generatedTags.includes(pickedTag)) {
            generatedTags.push(pickedTag);
        }
    }
}

function renderTags() {
    const container = document.getElementById("audition-tags-container");
    if(!container) return;
    container.innerHTML = "";

    generatedTags.forEach(tag => {
        const btn = document.createElement("button");
        btn.className = "audition-tag-btn";
        btn.textContent = tag;
        
        if (tag === "SSR") btn.classList.add("tag-ssr");
        if (tag === "SR") btn.classList.add("tag-sr");

        btn.addEventListener("click", () => {
            if (selectedTags.includes(tag)) {
                selectedTags = selectedTags.filter(t => t !== tag);
            } else {
                if (selectedTags.length >= 2) {
                    selectedTags.shift(); // FIFO
                }
                selectedTags.push(tag);
            }
            renderTags();
        });

        if (selectedTags.includes(tag)) {
            btn.classList.add("selected");
        }

        container.appendChild(btn);
    });
}

export function startAudition() {
    if (currentAuditionSlot === null) return;
    
    const requiredCredit = timeVal * 1000;
    const currentCredit = PlayerData.items["Item_002"] || 0;
    
    // Check item_004 (Audition Ticket)
    const ticketCount = PlayerData.items["Item_004"] || 0;

    if (ticketCount < 1) {
        alert("오디션 티켓(Item_004)이 부족합니다.");
        return;
    }

    if (currentCredit < requiredCredit) {
        alert("크레딧이 부족합니다.");
        return;
    }

    // Deduct resources
    PlayerData.items["Item_004"] -= 1;
    PlayerData.items["Item_002"] -= requiredCredit;

    // Determine result
    let survivalChance = 0.8;
    if (timeVal >= 4 && timeVal <= 6) survivalChance = 0.87;
    else if (timeVal >= 7 && timeVal <= 9) survivalChance = 0.95;
    else if (timeVal === 10) survivalChance = 1.0;

    let survivedTags = selectedTags.filter(t => Math.random() < survivalChance);
    
    let candidates = filterCharacters(survivedTags);
    while (candidates.length === 0 && survivedTags.length > 0) {
        // Drop one random tag
        const dropIdx = Math.floor(Math.random() * survivedTags.length);
        survivedTags.splice(dropIdx, 1);
        candidates = filterCharacters(survivedTags);
    }

    if (candidates.length === 0) {
        candidates = [...GameData.characters]; // Fallback to all characters
    }

    // Rarity logic
    let targetRarity = "R";
    if (survivedTags.includes("SSR") || Math.random() < 0.0002) {
        targetRarity = "SSR";
    } else if (survivedTags.includes("SR") || Math.random() < (0.03 + (selectedTags.length * 0.01))) {
        targetRarity = "SR";
    }

    let finalCandidates = candidates.filter(c => c.Character_Tier === targetRarity);
    if (finalCandidates.length === 0) {
        // If no character matches target rarity within survived tags, fallback to just rarity
        finalCandidates = GameData.characters.filter(c => c.Character_Tier === targetRarity);
    }
    
    // Rare edge case fallback
    if (finalCandidates.length === 0) finalCandidates = candidates; 

    const finalResult = finalCandidates[Math.floor(Math.random() * finalCandidates.length)];

    // Save to slot
    PlayerData.auditions[currentAuditionSlot] = {
        state: "recruiting",
        resultCharId: finalResult.Character_ID,
        startTime: Date.now(),
        endTime: Date.now() + (timeVal * 5 * 60000),
        selectedTags: [...selectedTags],
        survivedTags: [...survivedTags]
    };

    // Close modal
    const modal = document.getElementById("audition-setup-modal");
    if(modal) modal.classList.remove("show");
    
    currentAuditionSlot = null;
    
    // Force UI update
    if(window.updateTopCurrencies) window.updateTopCurrencies();
    if(window.updateAuditionUI) window.updateAuditionUI();
}

function filterCharacters(tags) {
    if (tags.length === 0) return [...GameData.characters];
    return GameData.characters.filter(c => {
        return tags.every(t => 
            t === "SSR" || t === "SR" || 
            getMainTag(c.Character_Class) === t || getMainTag(c.Character_Role) === t || getMainTag(c.Character_Type) === t
        );
    });
}

export function claimAuditionResult(slotIdx) {
    const slot = PlayerData.auditions[slotIdx];
    if (!slot || slot.state !== "finished") return;

    let bloomState = "new";
    let rubyReward = 0;

    const charId = slot.resultCharId;
    if (!PlayerData.characters.includes(charId)) {
        PlayerData.characters.push(charId);
        if (!PlayerData.characterStats) PlayerData.characterStats = {};
        if (!PlayerData.characterStats[charId]) PlayerData.characterStats[charId] = { level: 1, star: 1, exp: 0, bloom: 0, condition: 100 };
    } else {
        if (!PlayerData.characterStats) PlayerData.characterStats = {};
        if (!PlayerData.characterStats[charId]) PlayerData.characterStats[charId] = { level: 1, star: 1, exp: 0, bloom: 0, condition: 100 };
        
        if (PlayerData.characterStats[charId].bloom === undefined) PlayerData.characterStats[charId].bloom = 0;
        
        const pickedChar = GameData.characters.find(c => c.Character_ID === charId);
        
        if (PlayerData.characterStats[charId].bloom < 5) {
            PlayerData.characterStats[charId].bloom++;
            PlayerData.characterStats = { ...PlayerData.characterStats }; // Proxy trigger
            bloomState = "up";
            console.log(`[Bloom] ${pickedChar ? pickedChar.Character_Name : charId} 중복 획득! 개화 레벨 상승: ${PlayerData.characterStats[charId].bloom}`);
        } else {
            rubyReward = 1;
            if (pickedChar && pickedChar.Character_Tier === "SSR") rubyReward = 50;
            else if (pickedChar && pickedChar.Character_Tier === "SR") rubyReward = 10;
            
            PlayerData.items["Item_039"] = (PlayerData.items["Item_039"] || 0) + rubyReward;
            bloomState = "max";
            console.log(`[Bloom] ${pickedChar ? pickedChar.Character_Name : charId} 개화 MAX! 루비 ${rubyReward}개 지급`);
        }
    }

    // Reset slot
    PlayerData.auditions[slotIdx] = null;
    
    // Show Gacha Screen
    if (window.playSingleGachaResult) {
        window.playSingleGachaResult(charId, true, bloomState, rubyReward);
    }
    
    renderAuditionSlots();
}

export function updateAuditionTimers() {
    if (!PlayerData.auditions) return;
    let needsRender = false;
    
    PlayerData.auditions.forEach((slot, idx) => {
        if (slot && slot.state === "recruiting") {
            if (Date.now() >= slot.endTime) {
                slot.state = "finished";
                needsRender = true;
            } else {
                // Update text display dynamically
                const slotEl = document.getElementById(`audition-slot-${idx}`);
                if (slotEl) {
                    const diff = Math.ceil((slot.endTime - Date.now()) / 1000);
                    const h = Math.floor(diff / 3600).toString().padStart(2, '0');
                    const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
                    const s = (diff % 60).toString().padStart(2, '0');
                    const txt = slotEl.querySelector('.audition-timer-text');
                    if (txt) txt.textContent = `${h}:${m}:${s}`;
                }
            }
        }
    });
    
    if (needsRender) renderAuditionSlots();
}

export function renderAuditionSlots() {
    if (!PlayerData.auditions) return;
    
    // Update Ticket UI
    const ticketSpan = document.getElementById("audition-ticket-count");
    const ticketCount = PlayerData.items["Item_004"] || 0;
    if (ticketSpan) ticketSpan.textContent = ticketCount.toLocaleString();
    
    for (let i = 0; i < 6; i++) {
        const slotEl = document.getElementById(`audition-slot-${i}`);
        if (!slotEl) continue;
        
        const slot = PlayerData.auditions[i];
        
        // Clear listeners by cloning
        const newSlot = slotEl.cloneNode(false);
        slotEl.parentNode.replaceChild(newSlot, slotEl);
        
        if (!slot || slot.state === "pending") {
            newSlot.className = "audition-slot empty";
            newSlot.innerHTML = `<div class="slot-add-icon">+</div>`;
            newSlot.addEventListener("click", () => openAuditionModal(i));
        } else if (slot.state === "recruiting") {
            newSlot.className = "audition-slot recruiting";
            const diff = Math.max(0, Math.ceil((slot.endTime - Date.now()) / 1000));
            const h = Math.floor(diff / 3600).toString().padStart(2, '0');
            const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
            const s = (diff % 60).toString().padStart(2, '0');

            let tagHtml = `<div style="display: flex; gap: 5px; justify-content: center; margin-bottom: 15px; flex-wrap: wrap;">`;
            if (slot.selectedTags && slot.survivedTags) {
                slot.selectedTags.forEach(t => {
                    const isSurvived = slot.survivedTags.includes(t);
                    let classNames = "audition-slot-tag";
                    if (t === "SSR") classNames += " tag-ssr-disp";
                    if (t === "SR") classNames += " tag-sr-disp";
                    if (!isSurvived) classNames += " failed";
                    
                    tagHtml += `<span class="${classNames}">${t}</span>`;
                });
            }
            tagHtml += `</div>`;

            newSlot.innerHTML = `
                <div style="font-size: 1.2rem; font-weight: bold; color: #ff9f43; margin-bottom: 10px;">모집 중...</div>
                ${tagHtml}
                <div class="audition-timer-text" style="font-size: 1.8rem; font-family: 'Courier New', Courier, monospace; font-weight: bold; color: #2c3e50; background: #f8f9fa; padding: 5px 15px; border-radius: 8px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.05); border: 1px solid #e9ecef; margin-bottom: 10px;">${h}:${m}:${s}</div>
                <button class="btn-audition-cancel" style="padding: 4px 12px; font-size: 0.8rem; background: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer; opacity: 0.8; transition: opacity 0.2s;">모집 취소</button>
            `;
            
            newSlot.querySelector('.btn-audition-cancel').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm("정말로 모집을 취소하시겠습니까? 소모된 재화는 반환되지 않습니다.")) {
                    PlayerData.auditions[i] = null;
                    renderAuditionSlots();
                }
            });
        } else if (slot.state === "finished") {
            newSlot.className = "audition-slot finished";
            newSlot.innerHTML = `
                <div style="font-size: 1.5rem; font-weight: bold; color: #10ac84;">모집 완료!</div>
                <div style="font-size: 0.9rem; color: #555; margin-top: 5px;">클릭하여 확인</div>
            `;
            newSlot.addEventListener("click", () => claimAuditionResult(i));
        }
    }
}
