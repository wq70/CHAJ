import { addOneMessage, isGenerating, openCharacterChat, refreshSwipeButtons, saveChatConditional, swipe, swipeState, syncSwipeToMes } from '../../../../script.js';
import { OVERSWIPE_BEHAVIOR, SWIPE_DIRECTION, SWIPE_SOURCE, SWIPE_STATE } from '../../../constants.js';
import { getMessageTimeStamp, humanizedDateTime } from '../../../RossAscends-mods.js';
import { getRegexedString, regex_placement } from '../../regex/engine.js';

export function makeEntry(text = '', group = '') {
    const id = Array.from(crypto.getRandomValues(new Uint32Array(3)), value => value.toString(36)).join('-');
    return { id, text, group };
}

function textKey(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return `${text.length}:${(hash >>> 0).toString(36)}`;
}

export function getEntries(character) {
    const value = character?.data?.alternate_greetings;
    const texts = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
    const stored = character?.data?.extensions?.chaj?.entries;
    const buckets = new Map();
    for (const item of Array.isArray(stored) ? stored : []) {
        if (!item || typeof item.id !== 'string' || typeof item.key !== 'string') continue;
        if (!buckets.has(item.key)) buckets.set(item.key, []);
        buckets.get(item.key).push(item);
    }
    const used = new Set();
    return texts.map((value, index) => {
        const text = String(value ?? '');
        const match = buckets.get(textKey(text))?.shift();
        const id = match && !used.has(match.id) ? match.id : `legacy-${index}`;
        used.add(id);
        return { id, text, group: typeof match?.group === 'string' ? match.group : '' };
    });
}

async function post(context, path, body) {
    const response = await fetch(`/api/characters/${path}`, {
        method: 'POST', headers: context.getRequestHeaders(), body: JSON.stringify(body),
    });
    if (!response.ok) throw Object.assign(new Error('http'), { status: response.status });
    return response;
}

export function canUseOpening(context) {
    const first = context.chat[0];
    return !context.groupId && !!context.chatId && context.chat.length <= 1
        && !isGenerating() && swipeState === SWIPE_STATE.NONE
        && (!first || (!first.is_user && !first.is_system && !first.extra?.isSmallSys && first.extra?.swipeable !== false));
}

const formatted = text => getRegexedString(text ?? '', regex_placement.AI_OUTPUT);

function greetingInfo(message, entry) {
    return { send_date: message.send_date, extra: {
        chaj_greeting_id: entry.id, chaj_greeting_key: textKey(entry.text), overswipe_behavior: OVERSWIPE_BEHAVIOR.LOOP,
    } };
}

function createOpening(context, character, entries, primary) {
    const sendDate = getMessageTimeStamp();
    const message = { name: character.name, is_user: false, is_system: false, send_date: sendDate, swipe_id: 0 };
    message.swipes = entries.map(entry => formatted(entry.text));
    message.swipe_info = entries.map(entry => greetingInfo(message, entry));
    if (primary) {
        message.swipes.unshift(primary);
        message.swipe_info.unshift({ send_date: sendDate, extra: {} });
    }
    syncSwipeToMes(0, 0, message);
    context.chat.push(message);
    addOneMessage(message, { scroll: false });
}

function reconcileOpening(opening, previous, entries, primary) {
    const swipes = Array.isArray(opening.swipes) && opening.swipes.length ? opening.swipes : [opening.mes ?? ''];
    const original = typeof swipes[opening.swipe_id] === 'string' ? opening.swipe_id : 0;
    const info = Array.isArray(opening.swipe_info) ? opening.swipe_info : [];
    const nextById = new Map(entries.map(entry => [entry.id, entry]));
    const previousById = new Map(previous.map(entry => [entry.id, entry]));
    const claimed = new Set(info.slice(0, swipes.length).map(item => item?.extra?.chaj_greeting_id).filter(Boolean));
    const candidates = new Map();
    for (const entry of previous) {
        if (claimed.has(entry.id)) continue;
        const text = formatted(entry.text);
        if (!candidates.has(text)) candidates.set(text, []);
        candidates.get(text).push(entry.id);
    }

    let changed = false;
    let selected = -1;
    const present = new Set();
    const newSwipes = [];
    const newInfo = [];
    for (let i = 0; i < swipes.length; i++) {
        const oldInfo = info[i];
        const storedId = oldInfo?.extra?.chaj_greeting_id;
        const id = storedId ?? (i === 0 && primary ? undefined : candidates.get(swipes[i])?.shift());
        const entry = nextById.get(id);
        if (!entry && (storedId || previousById.has(id))) {
            changed = true;
            continue;
        }
        if (i === original) selected = newSwipes.length;
        let text = swipes[i];
        let swipeInfo = oldInfo ?? (i === original ? {
            send_date: opening.send_date, gen_started: opening.gen_started, gen_finished: opening.gen_finished,
            extra: structuredClone(opening.extra ?? {}),
        } : { send_date: opening.send_date, extra: {} });
        if (entry) {
            present.add(entry.id);
            const key = oldInfo?.extra?.chaj_greeting_key;
            if (previousById.get(id)?.text !== entry.text || (key && key !== textKey(entry.text))) {
                text = formatted(entry.text);
                swipeInfo = greetingInfo(opening, entry);
                changed = true;
            } else if (!storedId || !key) {
                swipeInfo = { ...swipeInfo, extra: { ...swipeInfo.extra, ...greetingInfo(opening, entry).extra } };
                changed = true;
            }
        }
        newSwipes.push(text);
        newInfo.push(swipeInfo);
    }
    for (const entry of entries) {
        if (present.has(entry.id)) continue;
        newSwipes.push(formatted(entry.text));
        newInfo.push(greetingInfo(opening, entry));
        changed = true;
    }
    if (!changed) return false;
    if (!newSwipes.length) {
        // Keep the chat's only message even when deleting the last alternate of a card with no primary greeting.
        newSwipes.push(primary || opening.mes || '');
        const extra = { ...opening.extra };
        delete extra.chaj_greeting_id;
        delete extra.chaj_greeting_key;
        newInfo.push({ send_date: opening.send_date, extra });
    }
    opening.swipes = newSwipes;
    opening.swipe_info = newInfo;
    const index = Math.max(0, selected);
    const rerender = selected < 0 || opening.mes !== newSwipes[index];
    if (rerender) {
        syncSwipeToMes(0, index, opening);
        if (document.querySelector('#chat > .mes[mesid="0"]')) addOneMessage(opening, { type: 'swipe', scroll: false });
    } else {
        opening.swipe_id = index;
        if (newInfo[index]?.extra?.chaj_greeting_id) {
            opening.extra ??= {};
            Object.assign(opening.extra, {
                chaj_greeting_id: newInfo[index].extra.chaj_greeting_id,
                chaj_greeting_key: newInfo[index].extra.chaj_greeting_key,
                overswipe_behavior: OVERSWIPE_BEHAVIOR.LOOP,
            });
        }
    }
    return true;
}

export function syncOpening(context, previous) {
    if (!canUseOpening(context)) return false;
    const character = context.characters[context.characterId];
    if (!character) return false;
    const entries = getEntries(character);
    const opening = context.chat[0];
    if (!entries.length && !previous?.length && !opening?.swipe_info?.some?.(item => item?.extra?.chaj_greeting_id)) return false;
    const primary = formatted(character.first_mes);
    if (!opening && entries.length) {
        createOpening(context, character, entries, primary);
    } else if (!opening || !reconcileOpening(opening, previous ?? entries, entries, primary)) {
        return true;
    }
    refreshSwipeButtons(true, false);
    void saveChatConditional();
    return true;
}

export async function saveEntries(getContext, expected, entries) {
    const start = getContext();
    const avatar = start.characters[start.characterId]?.avatar;
    if (start.groupId || !avatar) throw new Error('singleChat');
    const latest = await (await post(start, 'get', { avatar_url: avatar })).json();
    if (latest.avatar !== avatar || !latest.json_data) throw new Error('badCard');
    const raw = JSON.parse(latest.json_data);
    const previous = getEntries(latest);
    if (JSON.stringify(previous) !== JSON.stringify(expected)) throw new Error('conflict');

    const alternates = entries.map(entry => entry.text);
    const metadata = { entries: entries.map(({ id, text, group }) => ({ id, key: textKey(text), group })) };
    const data = { alternate_greetings: alternates, extensions: { chaj: metadata } };
    const patch = raw.spec === undefined ? {
        spec: latest.spec,
        spec_version: latest.spec_version,
        data: { ...latest.data, ...data, extensions: { ...latest.data?.extensions, chaj: metadata } },
    } : { data };
    await post(start, 'merge-attributes', { avatar, ...patch });

    const current = getContext();
    const characterIndex = current.characters.findIndex(character => character?.avatar === avatar);
    const character = current.characters[characterIndex];
    if (!character) return { synced: false };
    character.data ??= latest.data ?? {};
    character.data.alternate_greetings = alternates;
    character.data.extensions = { ...character.data.extensions, chaj: metadata };
    character.json_data = JSON.stringify({ ...raw, ...patch, data: {
        ...raw.data, ...patch.data, extensions: { ...raw.data?.extensions, ...patch.data.extensions },
    } });
    let synced = false;
    if (character === current.characters[current.characterId] && start.chatId === current.chatId
        && start.chatMetadata === current.chatMetadata) {
        try { synced = syncOpening(current, previous); }
        catch (error) { console.error('[CHAJ] Opening sync failed', error); }
    }
    void current.eventSource.emit(current.eventTypes.CHARACTER_EDITED, { detail: { id: characterIndex, character } });
    return { synced };
}

export async function useGreeting(getContext, id, newChat) {
    let context = getContext();
    const character = context.characters[context.characterId];
    if (context.groupId || !character || isGenerating() || swipeState !== SWIPE_STATE.NONE) throw new Error('busyChat');
    if (newChat) {
        await openCharacterChat(`${character.name} - ${humanizedDateTime()}`);
        context = getContext();
    }
    if (!syncOpening(context)) throw new Error('busyChat');
    const opening = context.chat[0];
    const index = opening.swipe_info?.findIndex(info => info?.extra?.chaj_greeting_id === id) ?? -1;
    if (index < 0 || !document.querySelector('#chat > .mes[mesid="0"]')) throw new Error('missingSlot');
    if (index !== opening.swipe_id) {
        await swipe(null, SWIPE_DIRECTION.RIGHT, { source: SWIPE_SOURCE.SWIPE_PICKER, message: opening, forceSwipeId: index, forceDuration: 0 });
    }
}
