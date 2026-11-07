import { addBlankGreetings, getAlternates, showEmptyOpening } from './greetings.js';

const PAGE_SIZE = 24;
const getContext = () => SillyTavern.getContext();

function messageElement(id) {
    return document.querySelector(`#chat > .mes[mesid="${id}"]`);
}

function init() {
    if (document.getElementById('chaj-cloud')) return;

    const cloud = document.createElement('button');
    cloud.id = 'chaj-cloud';
    cloud.type = 'button';
    cloud.setAttribute('aria-label', '打开云朵助手');
    cloud.setAttribute('aria-haspopup', 'dialog');
    cloud.innerHTML = `
        <svg viewBox="0 0 66 52" width="66" height="52" aria-hidden="true">
            <path d="M17 43a13 13 0 0 1-1-26 17 17 0 0 1 32-1 13.5 13.5 0 0 1 1 27H17Z"
                fill="#e8eaff" stroke="#746ac4" stroke-width="2.5" />
            <path d="M25 29h.1m15 0h.1M30 33q3 3 6 0" fill="none" stroke="#514b8d"
                stroke-width="2.8" stroke-linecap="round" />
            <path d="M21 33h3m18 0h3" fill="none" stroke="#e8a8c8" stroke-width="2.4" stroke-linecap="round" />
        </svg>`;

    const dialog = document.createElement('dialog');
    dialog.id = 'chaj-panel';
    dialog.setAttribute('aria-labelledby', 'chaj-title');
    dialog.innerHTML = `
        <header class="chaj-header">
            <div><span class="chaj-kicker">CHAJ · 酒馆扩展</span><h2 id="chaj-title">云朵助手</h2></div>
            <button type="button" class="chaj-close" aria-label="关闭云朵助手" autofocus>×</button>
        </header>
        <nav class="chaj-tabs" aria-label="功能">
            <button type="button" data-tab="history" aria-controls="chaj-history" aria-pressed="true">历史楼层</button>
            <button type="button" data-tab="greetings" aria-controls="chaj-greetings" aria-pressed="false">空白开场白</button>
        </nav>
        <section id="chaj-history" class="chaj-section">
            <div class="chaj-results">
                <input type="search" aria-label="搜索历史楼层" placeholder="输入关键词或楼层号，如 #120" autocomplete="off">
                <p class="chaj-summary" aria-live="polite"></p>
                <div class="chaj-list" aria-label="可查看楼层"></div>
                <div class="chaj-pages">
                    <button type="button" data-page="-1">上一页</button>
                    <span class="chaj-page-label"></span>
                    <button type="button" data-page="1">下一页</button>
                </div>
            </div>
            <div class="chaj-preview" hidden>
                <div class="chaj-preview-bar">
                    <button type="button" class="chaj-back">返回列表</button>
                    <button type="button" class="chaj-jump">跳到聊天</button>
                </div>
                <h3 class="chaj-preview-title"></h3>
                <p class="chaj-preview-note"></p>
                <div class="chaj-preview-text" tabindex="0"></div>
                <div class="chaj-pages">
                    <button type="button" data-floor="-1">上一楼</button>
                    <button type="button" data-floor="1">下一楼</button>
                </div>
            </div>
        </section>
        <section id="chaj-greetings" class="chaj-section chaj-greetings" hidden>
            <h3 class="chaj-character"></h3>
            <p class="chaj-count"></p>
            <p class="chaj-hint">新增的备选开场白可以留空，也可以稍后在角色卡里填写。</p>
            <div class="chaj-actions">
                <button type="button" data-add="1">＋ 添加 1 条空白</button>
                <button type="button" data-add="2">＋ 添加 2 条空白</button>
            </div>
            <p class="chaj-save-status" role="status"></p>
        </section>`;
    document.body.append(cloud, dialog);

    const find = selector => dialog.querySelector(selector);
    const search = find('input');
    const list = find('.chaj-list');
    const results = find('.chaj-results');
    const preview = find('.chaj-preview');
    const jump = find('.chaj-jump');
    const saveStatus = find('.chaj-save-status');
    const addButtons = [...dialog.querySelectorAll('[data-add]')];
    let tab = 'history';
    let page = 0;
    let focusedId = null;
    let focusedMessage = null;
    let timer;
    let saving = false;
    let notice;

    function refreshResults() {
        const { chat } = getContext();
        const query = search.value.trim().normalize('NFKC').toLowerCase();
        const floor = /^(?:#\s*)?(\d+)\s*楼?$/.exec(query);
        const matches = [];
        for (let id = chat.length - 1; id >= 0; id--) {
            const message = chat[id];
            if (!message) continue;
            if (floor ? id === Number(floor[1]) : !query ||
                `${message.name ?? ''}\n${message.mes ?? ''}`.normalize('NFKC').toLowerCase().includes(query)) {
                matches.push(id);
            }
        }
        const totalPages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
        page = Math.min(page, totalPages - 1);
        const total = chat.length ? `可查 #0–#${chat.length - 1} · ${chat.length} 楼` : '当前聊天没有楼层';
        find('.chaj-summary').textContent = query && chat.length ? `${total} · 匹配 ${matches.length} 楼` : total;
        find('.chaj-page-label').textContent = `${page + 1} / ${totalPages}`;
        find('[data-page="-1"]').disabled = page === 0;
        find('[data-page="1"]').disabled = page + 1 === totalPages;

        const fragment = document.createDocumentFragment();
        for (const id of matches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
            const message = chat[id];
            const row = document.createElement('button');
            row.type = 'button';
            row.dataset.id = id;
            const title = document.createElement('strong');
            title.textContent = `#${id} · ${message.name || '消息'}`;
            const snippet = document.createElement('span');
            const body = String(message.mes ?? '').replace(/\s+/g, ' ').trim();
            const hit = query && !floor ? body.toLowerCase().indexOf(query) : 0;
            const from = Math.max(0, hit - 18);
            snippet.textContent = body ? `${from ? '…' : ''}${body.slice(from, from + 120)}` : '（无文字）';
            row.append(title, snippet);
            fragment.append(row);
        }
        list.replaceChildren(fragment);
        list.scrollTop = 0;
    }

    function showList() {
        focusedId = focusedMessage = null;
        results.hidden = false;
        preview.hidden = true;
        refreshResults();
    }

    function showMessage(id) {
        const { chat } = getContext();
        const message = chat[id];
        if (!message) return showList();
        focusedId = id;
        focusedMessage = message;
        results.hidden = true;
        preview.hidden = false;
        find('.chaj-preview-title').textContent = `#${id} · ${message.name || '消息'}`;
        const rendered = !!messageElement(id);
        find('.chaj-preview-note').textContent = rendered ? '' : '此楼层未在聊天页加载，当前为文字预览。';
        jump.hidden = !rendered;
        const body = find('.chaj-preview-text');
        body.textContent = message.mes || '（无文字）';
        body.scrollTop = 0;
        find('[data-floor="-1"]').disabled = !chat[id - 1];
        find('[data-floor="1"]').disabled = !chat[id + 1];
    }

    function refreshGreetings() {
        const context = getContext();
        const character = !context.groupId && context.characters[context.characterId];
        const greetings = getAlternates(character);
        find('.chaj-character').textContent = character?.name || '请打开一个单人角色聊天';
        find('.chaj-count').textContent = character
            ? `备选开场白 ${greetings.length} 条 · 空白 ${greetings.filter(text => text === '').length} 条` : '';
        for (const button of addButtons) button.disabled = saving || !character?.avatar;
        saveStatus.textContent = character?.avatar && notice?.avatar === character.avatar ? notice.text : '';
    }

    function selectTab(next) {
        tab = next;
        for (const button of dialog.querySelectorAll('[data-tab]')) {
            const active = button.dataset.tab === tab;
            button.setAttribute('aria-pressed', String(active));
            document.getElementById(button.getAttribute('aria-controls')).hidden = !active;
        }
        if (tab === 'history') showList();
        else refreshGreetings();
    }

    cloud.addEventListener('click', () => {
        selectTab(tab);
        dialog.showModal();
    });
    find('.chaj-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const box = dialog.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
    for (const button of dialog.querySelectorAll('[data-tab]')) {
        button.addEventListener('click', () => selectTab(button.dataset.tab));
    }
    search.addEventListener('input', () => {
        page = 0;
        clearTimeout(timer);
        timer = setTimeout(refreshResults, 150);
    });
    list.addEventListener('click', event => {
        const row = event.target.closest('[data-id]');
        if (row) {
            showMessage(Number(row.dataset.id));
            find('.chaj-back').focus();
        }
    });
    for (const button of dialog.querySelectorAll('[data-page]')) {
        button.addEventListener('click', () => {
            page += Number(button.dataset.page);
            refreshResults();
        });
    }
    for (const button of dialog.querySelectorAll('[data-floor]')) {
        button.addEventListener('click', () => showMessage(focusedId + Number(button.dataset.floor)));
    }
    find('.chaj-back').addEventListener('click', () => {
        const id = focusedId;
        showList();
        (list.querySelector(`[data-id="${id}"]`) ?? search).focus();
    });
    jump.addEventListener('click', () => {
        const target = messageElement(focusedId);
        if (!target) return showMessage(focusedId);
        dialog.close();
        const chat = document.getElementById('chat');
        chat.scrollTo({ top: chat.scrollTop + target.getBoundingClientRect().top - chat.getBoundingClientRect().top });
        target.classList.add('chaj-highlight');
        setTimeout(() => target.classList.remove('chaj-highlight'), 1600);
    });

    for (const button of addButtons) {
        button.addEventListener('click', async () => {
            if (saving) return;
            const { characters, characterId } = getContext();
            const avatar = characters[characterId]?.avatar;
            saving = true;
            notice = { avatar, text: '正在保存空白开场白…' };
            refreshGreetings();
            try {
                const result = await addBlankGreetings(getContext, Number(button.dataset.add));
                const slots = result.first === result.last ? `第 ${result.first} 条` : `第 ${result.first}–${result.last} 条`;
                notice = { avatar, text: `已保存${slots}空白开场白。${result.synced ? '首条消息的切换项已更新。' : '新聊天可切换到这些开场白。'}` };
            } catch (error) {
                notice = { avatar, text: `保存失败。${error.message}` };
            } finally {
                saving = false;
                refreshGreetings();
            }
        });
    }

    const { eventSource, eventTypes } = getContext();
    eventSource.on(eventTypes.CHAT_CHANGED, () => {
        try { showEmptyOpening(getContext()); } catch (error) { console.error('[CHAJ] 开场显示失败', error); }
        search.value = '';
        page = 0;
        if (dialog.open) selectTab(tab);
    });
    for (const event of ['MESSAGE_SENT', 'MESSAGE_RECEIVED', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MORE_MESSAGES_LOADED']) {
        eventSource.on(eventTypes[event], () => {
            if (!dialog.open || tab !== 'history') return;
            if (focusedId !== null && getContext().chat[focusedId] === focusedMessage) showMessage(focusedId);
            else showList();
        });
    }
    eventSource.on(eventTypes.CHARACTER_EDITED, refreshGreetings);
    showEmptyOpening(getContext());
}

const { eventSource, eventTypes } = getContext();
eventSource.on(eventTypes.APP_INITIALIZED, init);
