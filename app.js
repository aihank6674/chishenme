let recipeData = [];
let isSyncMode = false;

// 初始化加载 CSV 数据
document.addEventListener('DOMContentLoaded', () => {
    Papa.parse('sample-data.csv', {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            recipeData = results.data;
            console.log("加载了食谱数据:", recipeData);
            
            document.getElementById('generateBtn').addEventListener('click', () => {
                isSyncMode = false;
                generatePlan();
            });
            
            document.getElementById('shareBtn').addEventListener('click', sharePlan);

            // 检查是否有分享 URL 参数
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.has('ids')) {
                isSyncMode = true;
                if (urlParams.get('d')) document.getElementById('daysCount').value = urlParams.get('d');
                if (urlParams.get('lp')) document.getElementById('lunchPax').value = urlParams.get('lp');
                if (urlParams.get('dp')) document.getElementById('dinnerPax').value = urlParams.get('dp');
                restorePlanFromUrl(urlParams.get('ids'));
            }
        }
    });

    // 绑定弹窗关闭
    let closeBtn = document.getElementById('closeModalBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('recipeModal').classList.add('hidden');
            document.body.style.overflow = 'auto';
        });
    }
    let modal = document.getElementById('recipeModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                modal.classList.add('hidden');
                document.body.style.overflow = 'auto';
            }
        });
    }
});

// 更聪明的抽取算法
function getRandomItems(array, desiredCount, recentIds = []) {
    let available = array.filter(item => !recentIds.includes(item.id));
    available.sort(() => 0.5 - Math.random());
    
    let result = [];
    let heavyCount = 0;
    
    for (let item of available) {
        if (result.length >= desiredCount) break;
        if (item.heaviness === '重口' && heavyCount >= 1) continue;
        result.push(item);
        if (item.heaviness === '重口') heavyCount++;
    }
    
    // Fallback 回退机制
    if (result.length < desiredCount) {
        let fallback = array.filter(item => !result.includes(item));
        fallback.sort(() => 0.5 - Math.random());
        for (let item of fallback) {
            if (result.length >= desiredCount) break;
            result.push(item);
        }
    }
    
    return result;
}

// 核心：生成排班与采买清单
function generatePlan() {
    const days = parseInt(document.getElementById('daysCount').value);
    const lunchPax = parseInt(document.getElementById('lunchPax').value);
    const dinnerPax = parseInt(document.getElementById('dinnerPax').value);

    const meats = recipeData.filter(d => d.category.includes('荤'));
    const vegs = recipeData.filter(d => d.category.includes('素'));
    const soups = recipeData.filter(d => d.category.includes('汤'));

    const dailyPlans = [];
    let shoppingListRaw = [];
    let history = []; 

    for (let i = 1; i <= days; i++) {
        let recentIds = history.slice(-2).flat();
        
        // 午餐 1荤 1素
        let lunchMeats = getRandomItems(meats, 1, recentIds);
        recentIds.push(...lunchMeats.map(m=>m.id));
        let lunchVegs = getRandomItems(vegs, 1, recentIds);
        recentIds.push(...lunchVegs.map(v=>v.id));

        let lunchItems = [...lunchMeats, ...lunchVegs];
        lunchItems.forEach(item => shoppingListRaw.push({ recipe: item, pax: lunchPax }));

        // 晚餐 2荤 1素 1汤
        let dinnerMeats = getRandomItems(meats, 2, recentIds);
        recentIds.push(...dinnerMeats.map(m=>m.id));
        let dinnerVegs = getRandomItems(vegs, 1, recentIds);
        recentIds.push(...dinnerVegs.map(v=>v.id));
        let dinnerSoups = getRandomItems(soups, 1, recentIds);
        recentIds.push(...dinnerSoups.map(s=>s.id));

        let dinnerItems = [...dinnerMeats, ...dinnerVegs, ...dinnerSoups];
        dinnerItems.forEach(item => shoppingListRaw.push({ recipe: item, pax: dinnerPax }));

        history.push([...lunchItems, ...dinnerItems].map(item => item.id));
        dailyPlans.push({ day: i, lunch: lunchItems, dinner: dinnerItems });
    }

    renderMenu(dailyPlans);
    processAndRenderShoppingList(shoppingListRaw);

    if (!isSyncMode) {
        updateUrlState(dailyPlans);
    }
}

// 通过 URL 解析指定的硬编码账单 (保证分享后一致性)
function restorePlanFromUrl(idsStr) {
    const dailyPlans = [];
    let shoppingListRaw = [];
    const lunchPax = parseInt(document.getElementById('lunchPax').value);
    const dinnerPax = parseInt(document.getElementById('dinnerPax').value);

    // split chunks
    let dayChunks = idsStr.split('_');
    for (let i = 0; i < dayChunks.length; i++) {
        let chunk = dayChunks[i];
        if (!chunk) continue;
        let mealChunks = chunk.split('-');
        let lIds = (mealChunks[0] || '').split(',').filter(x=>x);
        let dIds = (mealChunks[1] || '').split(',').filter(x=>x);

        let lunchItems = lIds.map(id => recipeData.find(d => d.id == id)).filter(x=>x);
        let dinnerItems = dIds.map(id => recipeData.find(d => d.id == id)).filter(x=>x);

        lunchItems.forEach(item => shoppingListRaw.push({ recipe: item, pax: lunchPax }));
        dinnerItems.forEach(item => shoppingListRaw.push({ recipe: item, pax: dinnerPax }));

        dailyPlans.push({ day: i+1, lunch: lunchItems, dinner: dinnerItems });
    }

    renderMenu(dailyPlans);
    processAndRenderShoppingList(shoppingListRaw);
    document.getElementById('shareBtn').classList.remove('hidden');
}

// 封装最新 URL
function updateUrlState(dailyPlans) {
    const days = parseInt(document.getElementById('daysCount').value);
    const lunchPax = parseInt(document.getElementById('lunchPax').value);
    const dinnerPax = parseInt(document.getElementById('dinnerPax').value);
    
    // format example: 1,2-3,4,5_4,5-1,2,7
    let idsStr = dailyPlans.map(plan => {
        let lStr = plan.lunch.map(i=>i.id).join(',');
        let dStr = plan.dinner.map(i=>i.id).join(',');
        return `${lStr}-${dStr}`;
    }).join('_');

    const newurl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?d=${days}&lp=${lunchPax}&dp=${dinnerPax}&ids=${idsStr}`;
    window.history.pushState({path:newurl},'',newurl);
    document.getElementById('shareBtn').classList.remove('hidden');
}

// 复制分享动作
function sharePlan() {
    navigator.clipboard.writeText(window.location.href).then(() => {
        let btn = document.getElementById('shareBtn');
        let oldHTML = btn.innerHTML;
        btn.innerHTML = '✅ 链接已复制!';
        setTimeout(() => { btn.innerHTML = oldHTML; }, 2000);
    });
}

// 渲染排菜单至UI
function renderMenu(dailyPlans) {
    const container = document.getElementById('menuContainer');
    container.innerHTML = '';
    document.getElementById('menuSection').classList.remove('hidden');

    dailyPlans.forEach(plan => {
        let dayCard = document.createElement('div');
        dayCard.className = 'bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-4';
        
        let lunchHTML = plan.lunch.map(item => `<div onclick="openRecipeModal('${item.id}')" class="flex flex-col text-sm bg-blue-50 p-2 rounded cursor-pointer hover:bg-blue-100 hover:shadow-md transition"><span class="font-semibold text-gray-700">${item.name_zh}</span><span class="text-xs text-gray-500 mt-1">${item.name_my||''}</span></div>`).join('');
        let dinnerHTML = plan.dinner.map(item => `<div onclick="openRecipeModal('${item.id}')" class="flex flex-col text-sm bg-orange-50 p-2 rounded cursor-pointer hover:bg-orange-100 hover:shadow-md transition"><span class="font-semibold text-gray-700">${item.name_zh}</span><span class="text-xs text-gray-500 mt-1">${item.name_my||''}</span></div>`).join('');

        dayCard.innerHTML = `
            <h3 class="font-bold text-lg text-teal-700 mb-3 border-b pb-1">第 ${plan.day} 天 (Day ${plan.day})</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <h4 class="text-sm font-bold text-gray-400 mb-2 uppercase flex items-center gap-2">☀️ 午餐</h4>
                    <div class="flex flex-wrap gap-2">${lunchHTML}</div>
                </div>
                <div>
                    <h4 class="text-sm font-bold text-gray-400 mb-2 uppercase flex items-center gap-2">🌙 晚餐</h4>
                    <div class="flex flex-wrap gap-2">${dinnerHTML}</div>
                </div>
            </div>
        `;
        container.appendChild(dayCard);
    });
}

// 核心：处理食材合并并渲染清单
function processAndRenderShoppingList(rawItems) {
    const mergedIngredients = {};

    rawItems.forEach(mealRecord => {
        const item = mealRecord.recipe;
        const actualPax = mealRecord.pax;
        if (!item.base_portions || parseInt(item.base_portions) <= 0) return;
        const ratio = actualPax / parseInt(item.base_portions);
        
        if(!item.ingredients_zh) return;
        let zhParts = item.ingredients_zh.split(';');
        let myParts = item.ingredients_my ? item.ingredients_my.split(';') : [];

        for (let i = 0; i < zhParts.length; i++) {
            let zhIng = zhParts[i].trim();
            if (!zhIng) continue;
            let myIng = (myParts[i] || "").trim();

            let zInfo = zhIng.split(':');
            let mInfo = myIng.split(':');

            if (zInfo.length >= 2) {
                let nameZh = zInfo[0].trim();
                let amount = parseFloat(zInfo[1]) || 0;
                let unit = zInfo[2] ? zInfo[2].trim() : "";
                let nameMy = (mInfo.length > 0 && mInfo[0]) ? mInfo[0].trim() : "";
                let finalAmount = amount * ratio;
                let key = nameZh + "_" + unit;

                if (!mergedIngredients[key]) {
                    mergedIngredients[key] = { nameZh, nameMy, unit, totalAmount: 0 };
                }
                mergedIngredients[key].totalAmount += finalAmount;
            }
        }
    });

    const container = document.getElementById('shoppingListContainer');
    container.innerHTML = '';
    document.getElementById('shoppingSection').classList.remove('hidden');

    Object.values(mergedIngredients).forEach(ing => {
        let amountStr = Number.isInteger(ing.totalAmount) ? ing.totalAmount : ing.totalAmount.toFixed(1);
        
        let row = document.createElement('label');
        row.className = 'flex items-center p-3 hover:bg-gray-50 rounded-lg cursor-pointer border border-transparent hover:border-gray-200 transition-colors bg-white shadow-sm';
        row.innerHTML = `
            <input type="checkbox" class="w-5 h-5 rounded border-gray-300 text-teal-600 focus:ring-teal-500 mr-4">
            <div class="flex flex-col flex-1">
                <div class="flex justify-between items-center">
                    <span class="font-medium text-gray-800 text-lg">${ing.nameZh}</span>
                    <span class="font-bold text-teal-700 bg-teal-50 px-2 py-1 rounded text-sm">${amountStr} ${ing.unit}</span>
                </div>
                <span class="text-sm text-gray-500">${ing.nameMy}</span>
            </div>
        `;
        let checkbox = row.querySelector('input');
        checkbox.addEventListener('change', function() {
            let textDiv = this.nextElementSibling;
            if (this.checked) textDiv.classList.add('line-through', 'opacity-50');
            else textDiv.classList.remove('line-through', 'opacity-50');
        });
        container.appendChild(row);
    });
}

// 弹窗相关逻辑
function openRecipeModal(id) {
    const item = recipeData.find(d => d.id == id);
    if (!item) return;

    document.getElementById('modalTitleZh').innerText = item.name_zh || '';
    document.getElementById('modalTitleMy').innerText = item.name_my || '';
    document.getElementById('modalDiff').innerText = '难度 ' + (item.difficulty || '');
    document.getElementById('modalHeavy').innerText = '口味 ' + (item.heaviness || '');
    document.getElementById('modalCategory').innerText = item.category || '';
    document.getElementById('modalBasePortions').innerText = item.base_portions || '5';

    // Image Handling
    const imgEl = document.getElementById('modalImg');
    if (item.image_url) {
        imgEl.src = item.image_url;
        imgEl.style.display = 'block';
    } else {
        // 如果没有准确图片，显示一个优雅的文字占位或者隐藏
        imgEl.src = 'https://placehold.co/800x600/f3f4f6/374151?text=No+Image'; // 或者您可以放一张本地的 default.png 
    }

    // Ingredients 配料
    const ingList = document.getElementById('modalIngList');
    ingList.innerHTML = '';
    let zhParts = (item.ingredients_zh || "").split(';');
    let myParts = (item.ingredients_my || "").split(';');
    for(let i=0; i<zhParts.length; i++) {
        let z = zhParts[i].trim();
        if(!z) continue;
        let m = (myParts[i] || "").trim();
        let zInfo = z.split(':');
        let mInfo = m.split(':');
        
        let li = document.createElement('li');
        li.className = 'bg-gray-50 p-2 rounded-lg border-l-4 border-teal-500 shadow-sm flex flex-col';
        li.innerHTML = `<div class="flex justify-between items-center"><span class="font-bold text-gray-700">${zInfo[0]||''}</span><span class="text-teal-700 font-semibold bg-white px-2 py-1 rounded text-sm shadow-sm">${zInfo[1]||''} ${zInfo[2]||''}</span></div><div class="text-xs text-gray-500 mt-1">${mInfo[0]||''}</div>`;
        ingList.appendChild(li);
    }

    // Steps 步骤
    const stepsList = document.getElementById('modalStepsList');
    stepsList.innerHTML = '';
    let zhSteps = (item.steps_zh || "1. 准备食材。;2. 下锅翻炒。").split(';');
    let mySteps = (item.steps_my || "1. ပါဝင်ပစ္စည်းများပြင်ပါ။;2. ကြော်ပါ။").split(';');
    
    for(let i=0; i<zhSteps.length; i++) {
        let z = zhSteps[i].trim();
        if(!z) continue;
        let m = (mySteps[i] || "").trim();
        
        let container = document.createElement('div');
        container.className = 'flex gap-3 bg-white border border-gray-100 shadow-sm p-4 rounded-xl';
        let zText = z.replace(/^第?\d+[\.|、]\s*/, '');
        let mText = m.replace(/^第?\d+[\.|、]\s*/, '');
        container.innerHTML = `
            <div class="flex-shrink-0 w-8 h-8 bg-teal-100 text-teal-700 rounded-full flex items-center justify-center font-bold shadow-sm text-sm">${i+1}</div>
            <div class="flex-1">
                <p class="text-gray-800 font-medium mb-1">${zText}</p>
                <p class="text-gray-500 text-sm">${mText}</p>
            </div>
        `;
        stepsList.appendChild(container);
    }

    document.body.style.overflow = 'hidden'; 
    document.getElementById('recipeModal').classList.remove('hidden');
}
