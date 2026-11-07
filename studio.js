import { canUseOpening, getEntries, makeEntry, saveEntries, useGreeting } from './greetings.js';

export function createStudio(root, getContext, getCopy, onUse) {
    const find = selector => root.querySelector(selector);
    const shelf = find('.chaj-shelf');
    const groupFilter = find('.chaj-groups');
    const form = find('form');
    const controls = find('.chaj-studio-controls');
    const textInput = find('textarea');
    const groupInput = find('input');
    const groupNames = find('datalist');
    const status = find('.chaj-save-status');
    const undoHistory = new Map();
    let busy = false;
    let notice;
    let draft;
    let activeAvatar;

    function currentCharacter() {
        const context = getContext();
        return !context.groupId && context.characters[context.characterId];
    }

    function option(label, value) {
        return new Option(label, value);
    }

    function action(label, name, id) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.dataset.action = name;
        button.dataset.greeting = id;
        button.disabled = busy;
        return button;
    }

    function render() {
        const c = getCopy();
        const character = currentCharacter();
        const avatar = character?.avatar;
        if (activeAvatar !== avatar) {
            activeAvatar = avatar;
            draft = undefined;
            notice = undefined;
            groupFilter.value = '';
        }
        const entries = getEntries(character);
        const { chat } = getContext();
        const opening = chat[0];
        const inUse = opening?.swipe_info?.[opening.swipe_id]?.extra?.chaj_greeting_id;
        const useHere = canUseOpening(getContext());
        find('.chaj-character').textContent = character?.name || c.singleChat;
        find('.chaj-total').textContent = entries.length;
        find('.chaj-blanks').textContent = entries.filter(entry => entry.text === '').length;
        find('.chaj-live').textContent = useHere && entries.length ? c.live(opening?.swipes?.length ?? 1) : '';
        controls.hidden = !avatar || !!draft;
        form.hidden = !avatar || !draft;
        if (draft) find('.chaj-edit-title').textContent = c[draft.mode === 'edit' ? 'editTitle' : 'branchTitle'];
        for (const button of root.querySelectorAll('[data-add], form button')) button.disabled = busy || !avatar;
        find('.chaj-undo').disabled = busy || !(undoHistory.get(avatar)?.length);
        status.textContent = busy ? c.saving : typeof notice === 'function' ? notice(c) : c[notice] || '';

        const selected = groupFilter.value;
        const groups = [...new Set(entries.map(entry => entry.group).filter(Boolean))];
        groupFilter.replaceChildren(option(c.allGroups, 'all'), option(c.ungrouped, 'none'), ...groups.map(group => option(group, `group:${group}`)));
        if ([...groupFilter.options].some(item => item.value === selected)) groupFilter.value = selected;
        groupNames.replaceChildren(...groups.map(group => option(group, group)));
        groupFilter.disabled = busy || !entries.length;
        const fragment = document.createDocumentFragment();
        if (!entries.length) {
            const empty = document.createElement('p');
            empty.className = 'chaj-empty';
            empty.textContent = c.emptyShelf;
            fragment.append(empty);
        }
        entries.forEach((entry, index) => {
            const filter = groupFilter.value;
            if (filter !== 'all' && filter !== (entry.group ? `group:${entry.group}` : 'none')) return;
            const row = document.createElement('article');
            row.className = 'chaj-entry';
            const header = document.createElement('div');
            header.className = 'chaj-entry-heading';
            const label = document.createElement('strong');
            label.textContent = `No. ${String(index + 1).padStart(2, '0')}`;
            const tag = document.createElement('span');
            tag.className = 'chaj-entry-group';
            tag.textContent = entry.group || c.ungrouped;
            header.append(label, tag);
            if (entry.id === inUse && useHere) {
                const active = document.createElement('span');
                active.className = 'chaj-active';
                active.textContent = c.active;
                header.append(active);
            }
            const excerpt = action(entry.text.trim().slice(0, 160) || c.blank, 'edit', entry.id);
            excerpt.className = 'chaj-entry-text';
            excerpt.title = c.edit;
            excerpt.setAttribute('aria-label', `${c.edit} · ${label.textContent} · ${excerpt.textContent}`);
            const actions = document.createElement('div');
            actions.className = 'chaj-entry-actions';
            const use = action(useHere ? c.use : c.newChat, 'use', entry.id);
            if (!useHere) use.title = c.newChatHint;
            const more = document.createElement('details');
            more.className = 'chaj-more';
            const summary = document.createElement('summary');
            summary.textContent = '···';
            summary.setAttribute('aria-label', c.more);
            const menu = document.createElement('div');
            menu.className = 'chaj-more-menu';
            menu.append(action(c.edit, 'edit', entry.id), action(c.branch, 'branch', entry.id), action(c.remove, 'remove', entry.id));
            more.append(summary, menu);
            actions.append(use, more);
            row.append(header, excerpt, actions);
            fragment.append(row);
        });
        shelf.replaceChildren(fragment);
    }

    async function commit(before, next, success, undo = false) {
        if (busy || !currentCharacter()?.avatar) return;
        const avatar = currentCharacter().avatar;
        busy = true;
        render();
        try {
            const result = await saveEntries(getContext, before, next);
            const history = undoHistory.get(avatar) ?? [];
            if (undo) history.pop();
            else history.push({ before, after: next });
            undoHistory.set(avatar, history.slice(-12));
            if (currentCharacter()?.avatar === avatar) {
                notice = typeof success === 'function' ? c => success(c, result.synced) : success;
                draft = undefined;
            }
        } catch (error) {
            notice = error.status ? c => c.http(error.status) : getCopy()[error.message] ? error.message : 'failed';
        } finally {
            busy = false;
            render();
        }
    }

    for (const button of root.querySelectorAll('[data-add]')) {
        button.addEventListener('click', () => {
            const before = getEntries(currentCharacter());
            const next = before.concat(Array.from({ length: Number(button.dataset.add) }, () => makeEntry()));
            void commit(before, next, (c, synced) => c.saved(before.length + 1, next.length) + (synced ? c.synced : c.nextChat));
        });
    }
    groupFilter.addEventListener('change', render);
    find('.chaj-undo').addEventListener('click', () => {
        const last = undoHistory.get(currentCharacter()?.avatar)?.at(-1);
        if (last) void commit(last.after, last.before, 'undone', true);
    });
    find('.chaj-edit-cancel').addEventListener('click', () => {
        draft = undefined;
        render();
    });
    form.addEventListener('submit', event => {
        event.preventDefault();
        if (!draft) return;
        const { before, index, mode } = draft;
        const text = textInput.value;
        const group = groupInput.value.trim();
        const next = before.slice();
        if (mode === 'edit') next[index] = { ...before[index], text, group };
        else next.splice(index + 1, 0, makeEntry(text, group));
        void commit(before, next, mode === 'edit' ? 'edited' : 'branched');
    });

    shelf.addEventListener('click', async event => {
        const button = event.target.closest('[data-action]');
        if (!button || busy) return;
        const before = getEntries(currentCharacter());
        const index = before.findIndex(entry => entry.id === button.dataset.greeting);
        const entry = before[index];
        if (!entry) return;
        const mode = button.dataset.action;
        if (mode === 'remove') {
            void commit(before, before.filter(item => item !== entry), 'removed');
        } else if (mode === 'use') {
            busy = true;
            render();
            try {
                await useGreeting(getContext, entry.id, !canUseOpening(getContext()));
                onUse();
            } catch (error) {
                notice = getCopy()[error.message] ? error.message : 'failed';
            } finally {
                busy = false;
                render();
            }
        } else {
            draft = { before, index, mode };
            textInput.value = entry.text;
            groupInput.value = entry.group;
            render();
            textInput.focus();
        }
    });
    return { render };
}
