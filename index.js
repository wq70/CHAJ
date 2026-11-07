import { syncOpening } from './greetings.js';
import { copy } from './locale.js';
import { createStudio } from './studio.js';
import { watchUpdates } from './updates.js';

const PAGE_SIZE = 24;
const getContext = () => SillyTavern.getContext();
const cloudIcon = `<svg viewBox="0 0 66 52" width="66" height="52" aria-hidden="true">
    <path d="M17 43a13 13 0 0 1-1-26 17 17 0 0 1 32-1 13.5 13.5 0 0 1 1 27H17Z" fill="#fff" stroke="#111" stroke-width="1.5" />
    <path d="M27 28h.1m12 0h.1M31 32q2 2 4 0" fill="none" stroke="#111" stroke-width="2.2" stroke-linecap="round" />
</svg>`;

function messageElement(id) {
    return document.querySelector(`#chat > .mes[mesid="${id}"]`);
}

function init() {
    if (document.getElementById('chaj-cloud')) return;

    const cloud = document.createElement('button');
    cloud.id = 'chaj-cloud';
    cloud.type = 'button';
    cloud.setAttribute('aria-haspopup', 'dialog');
    cloud.innerHTML = cloudIcon;

    const dialog = document.createElement('dialog');
    dialog.id = 'chaj-panel';
    dialog.className = 'chaj-dialog';
    dialog.setAttribute('aria-labelledby', 'chaj-title');
    dialog.innerHTML = `
        <header class="chaj-masthead">
            <div class="chaj-brand"><span class="chaj-brand-icon">${cloudIcon}</span><h2 id="chaj-title" data-copy="title"></h2></div>
            <div class="chaj-top-actions">
                <div class="chaj-language" role="group" data-aria="language">
                    <button type="button" lang="zh-CN" data-language="zh">中</button>
                    <button type="button" lang="en" data-language="en">EN</button>
                </div>
                <button type="button" class="chaj-close" data-aria="close" autofocus>×</button>
            </div>
        </header>
        <nav class="chaj-tabs" data-aria="functions">
            <button type="button" data-tab="history" aria-controls="chaj-history" aria-pressed="true" data-copy="history"></button>
            <button type="button" data-tab="greetings" aria-controls="chaj-greetings" aria-pressed="false" data-copy="greetings"></button>
        </nav>
        <section id="chaj-history" class="chaj-section">
            <div class="chaj-results">
                <div class="chaj-search"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/></svg><input type="search" data-aria="search" autocomplete="off"></div>
                <p class="chaj-summary" aria-live="polite"></p>
                <div class="chaj-list" data-aria="list"></div>
                <div class="chaj-pages">
                    <button type="button" data-page="-1" data-copy="newerPage"></button>
                    <span class="chaj-page-label"></span>
                    <button type="button" data-page="1" data-copy="olderPage"></button>
                </div>
            </div>
            <div class="chaj-preview" hidden>
                <div class="chaj-preview-bar">
                    <button type="button" class="chaj-back" data-copy="back"></button>
                    <button type="button" class="chaj-jump" data-copy="jump"></button>
                </div>
                <h3 class="chaj-preview-title"></h3>
                <p class="chaj-preview-note"></p>
                <div class="chaj-preview-text" tabindex="0"></div>
                <div class="chaj-pages">
                    <button type="button" data-floor="-1" data-copy="olderFloor"></button>
                    <button type="button" data-floor="1" data-copy="newerFloor"></button>
                </div>
            </div>
        </section>
        <section id="chaj-greetings" class="chaj-section chaj-greetings" hidden>
            <div class="chaj-studio-heading">
                <h3 class="chaj-character"></h3>
                <div class="chaj-ledger">
                    <div><strong class="chaj-total"></strong><span data-copy="alternateLabel"></span></div>
                    <div><strong class="chaj-blanks"></strong><span data-copy="blankLabel"></span></div>
                </div>
            </div>
            <div class="chaj-studio-controls">
                <p class="chaj-live" aria-live="polite"></p>
                <div class="chaj-actions">
                    <button type="button" data-add="1" data-copy="addOne"></button>
                    <button type="button" data-add="2" data-copy="addTwo"></button>
                </div>
                <div class="chaj-studio-tools">
                    <select class="chaj-groups" data-aria="groups"></select>
                    <button type="button" class="chaj-undo" data-copy="undo"></button>
                </div>
                <div class="chaj-shelf"></div>
            </div>
            <form class="chaj-editor" hidden>
                <h3 class="chaj-edit-title"></h3>
                <label><span data-copy="greetingText"></span><textarea rows="5" spellcheck="false"></textarea></label>
                <label><span data-copy="groupName"></span><input list="chaj-group-names" maxlength="48" autocomplete="off"></label>
                <datalist id="chaj-group-names"></datalist>
                <div class="chaj-actions">
                    <button type="button" class="chaj-edit-cancel" data-copy="cancel"></button>
                    <button type="submit" data-copy="save"></button>
                </div>
            </form>
            <p class="chaj-save-status" role="status"></p>
        </section>`;
    const update = document.createElement('dialog');
    update.id = 'chaj-update';
    update.className = 'chaj-dialog';
    update.setAttribute('aria-labelledby', 'chaj-update-title');
    update.innerHTML = `<h2 id="chaj-update-title" data-copy="updateTitle"></h2><p data-copy="updateBody"></p>
        <div class="chaj-actions"><button type="button" class="chaj-later" data-copy="later"></button>
        <button type="button" class="chaj-update-now" data-copy="updateNow"></button></div>
        <p class="chaj-update-status" role="status"></p>`;
    document.body.append(cloud, dialog, update);

    const find = selector => dialog.querySelector(selector);
    const search = find('input[type="search"]');
    const list = find('.chaj-list');
    const results = find('.chaj-results');
    const preview = find('.chaj-preview');
    const jump = find('.chaj-jump');
    let tab = 'history';
    let page = 0;
    let focusedId = null;
    let focusedMessage = null;
    let timer;
    let language = 'zh';
    try { if (localStorage.getItem('chaj.language') === 'en') language = 'en'; } catch { /* Use the default language. */ }
    const getCopy = () => copy[language];
    const studio = createStudio(find('#chaj-greetings'), getContext, getCopy, () => dialog.close());

    function renderLanguage() {
        const c = getCopy();
        dialog.lang = language === 'zh' ? 'zh-CN' : 'en';
        cloud.setAttribute('aria-label', c.open);
        for (const element of dialog.querySelectorAll('[data-copy]')) element.textContent = c[element.dataset.copy];
        for (const element of dialog.querySelectorAll('[data-aria]')) element.setAttribute('aria-label', c[element.dataset.aria]);
        for (const button of dialog.querySelectorAll('[data-language]')) button.setAttribute('aria-pressed', String(button.dataset.language === language));
        search.placeholder = c.placeholder;
        find('.chaj-editor input').placeholder = c.groupHint;
    }

    function refreshResults() {
        const { chat } = getContext();
        const c = getCopy();
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
        const total = chat.length ? c.range(chat.length) : c.noChat;
        find('.chaj-summary').textContent = query && chat.length ? `${total} · ${c.matches(matches.length)}` : total;
        find('.chaj-page-label').textContent = `${page + 1} / ${totalPages}`;
        find('[data-page="-1"]').disabled = page === 0;
        find('[data-page="1"]').disabled = page + 1 === totalPages;

        const fragment = document.createDocumentFragment();
        if (query && chat.length && !matches.length) {
            const empty = document.createElement('p');
            empty.className = 'chaj-empty';
            empty.textContent = c.noMatches;
            fragment.append(empty);
        }
        for (const id of matches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
            const message = chat[id];
            const row = document.createElement('button');
            row.type = 'button';
            row.dataset.id = id;
            const number = document.createElement('span');
            number.className = 'chaj-message-number';
            number.textContent = `#${id}`;
            const content = document.createElement('span');
            content.className = 'chaj-message-content';
            const title = document.createElement('strong');
            title.textContent = message.name || c.message;
            const snippet = document.createElement('span');
            const body = String(message.mes ?? '').replace(/\s+/g, ' ').trim();
            const hit = query && !floor ? body.toLowerCase().indexOf(query) : 0;
            const from = Math.max(0, hit - 18);
            snippet.textContent = body ? `${from ? '…' : ''}${body.slice(from, from + 120)}` : c.noText;
            content.append(title, snippet);
            row.append(number, content);
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
        const c = getCopy();
        const message = chat[id];
        if (!message) return showList();
        focusedId = id;
        focusedMessage = message;
        results.hidden = true;
        preview.hidden = false;
        find('.chaj-preview-title').textContent = `#${id} · ${message.name || c.message}`;
        const rendered = !!messageElement(id);
        find('.chaj-preview-note').textContent = rendered ? '' : c.unloaded;
        jump.hidden = !rendered;
        const body = find('.chaj-preview-text');
        body.textContent = message.mes || c.noText;
        body.scrollTop = 0;
        find('[data-floor="-1"]').disabled = !chat[id - 1];
        find('[data-floor="1"]').disabled = !chat[id + 1];
    }

    function repairOpening() {
        try { syncOpening(getContext()); } catch (error) { console.error('[CHAJ] Opening sync failed', error); }
    }

    function selectTab(next) {
        tab = next;
        for (const button of dialog.querySelectorAll('[data-tab]')) {
            const active = button.dataset.tab === tab;
            button.setAttribute('aria-pressed', String(active));
            document.getElementById(button.getAttribute('aria-controls')).hidden = !active;
        }
        if (tab === 'history') showList();
        else studio.render();
    }

    cloud.addEventListener('click', () => {
        repairOpening();
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
    for (const button of dialog.querySelectorAll('[data-language]')) {
        button.addEventListener('click', () => {
            language = button.dataset.language;
            try { localStorage.setItem('chaj.language', language); } catch { /* Keep the language for this page. */ }
            renderLanguage();
            if (tab === 'greetings') studio.render();
            else if (focusedId !== null) showMessage(focusedId);
            else refreshResults();
        });
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

    const { eventSource, eventTypes } = getContext();
    eventSource.on(eventTypes.CHAT_CHANGED, () => {
        repairOpening();
        search.value = '';
        page = 0;
        if (dialog.open) selectTab(tab);
    });
    for (const event of ['MESSAGE_SENT', 'MESSAGE_RECEIVED', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MORE_MESSAGES_LOADED']) {
        eventSource.on(eventTypes[event], () => {
            if (event === 'MESSAGE_DELETED') repairOpening();
            if (!dialog.open) return;
            if (tab === 'greetings') return studio.render();
            if (focusedId !== null && getContext().chat[focusedId] === focusedMessage) showMessage(focusedId);
            else showList();
        });
    }
    eventSource.on(eventTypes.CHARACTER_EDITED, () => {
        if (dialog.open && tab === 'greetings') studio.render();
    });
    renderLanguage();
    repairOpening();
    watchUpdates(update, getContext, getCopy);
}

const { eventSource, eventTypes } = getContext();
eventSource.on(eventTypes.APP_INITIALIZED, init);
