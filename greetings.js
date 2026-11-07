import { addOneMessage, isGenerating, refreshSwipeButtons, saveChatConditional, swipeState } from '../../../../script.js';
import { SWIPE_STATE } from '../../../constants.js';
import { getMessageTimeStamp } from '../../../RossAscends-mods.js';
import { getRegexedString, regex_placement } from '../../regex/engine.js';

export function getAlternates(character) {
    const value = character?.data?.alternate_greetings;
    return Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
}

async function post(context, path, body) {
    const response = await fetch(`/api/characters/${path}`, {
        method: 'POST',
        headers: context.getRequestHeaders(),
        body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`角色卡保存接口返回 HTTP ${response.status}`);
    return response;
}

function canUpdateOpening(context) {
    const first = context.chat[0];
    return !context.groupId && !!context.chatId && !context.chatMetadata?.tainted
        && !isGenerating() && swipeState === SWIPE_STATE.NONE
        && (!first || (context.chat.length === 1 && !first.is_user && !first.is_system && !first.extra?.isSmallSys));
}

function renderOpening(context, character, alternates) {
    const primary = getRegexedString(character.first_mes ?? '', regex_placement.AI_OUTPUT);
    const swipes = alternates.map(text => getRegexedString(text, regex_placement.AI_OUTPUT));
    if (primary) swipes.unshift(primary);
    const sendDate = getMessageTimeStamp();
    const opening = {
        name: character.name,
        is_user: false,
        is_system: false,
        mes: swipes[0],
        send_date: sendDate,
        extra: {},
        swipe_id: 0,
        swipes,
        swipe_info: swipes.map(() => ({ send_date: sendDate, extra: {} })),
    };
    context.chat.push(opening);
    addOneMessage(opening, { scroll: false });
    return opening;
}

function appendSwipes(opening, blanks) {
    if (!Array.isArray(opening.swipes) || !opening.swipes.length) {
        opening.swipes = [opening.mes ?? ''];
    }
    if (typeof opening.swipes[opening.swipe_id] !== 'string') opening.swipe_id = 0;
    opening.swipe_info = opening.swipes.map((_, index) => opening.swipe_info?.[index] ?? {
        send_date: opening.send_date,
        gen_started: index === opening.swipe_id ? opening.gen_started : undefined,
        gen_finished: index === opening.swipe_id ? opening.gen_finished : undefined,
        extra: index === opening.swipe_id ? structuredClone(opening.extra ?? {}) : {},
    });
    opening.swipes.push(...blanks);
    opening.swipe_info.push(...blanks.map(() => ({ send_date: opening.send_date, extra: {} })));
}

export async function addBlankGreetings(getContext, count) {
    const start = getContext();
    const avatar = start.characters[start.characterId]?.avatar;
    if (start.groupId || !avatar) throw new Error('请先打开一个单人角色聊天。');

    const latest = await (await post(start, 'get', { avatar_url: avatar })).json();
    if (latest.avatar !== avatar || !latest.json_data) throw new Error('无法读取角色卡。');
    const raw = JSON.parse(latest.json_data);
    const previous = getAlternates(latest);
    const blanks = Array(count).fill('');
    const alternates = [...previous, ...blanks];
    // Older cards without a spec are normalized by ST when read. Save that upgrade so the slots survive reload.
    const patch = raw.spec === undefined ? {
        spec: latest.spec,
        spec_version: latest.spec_version,
        data: { ...latest.data, alternate_greetings: alternates },
    } : { data: { alternate_greetings: alternates } };
    await post(start, 'merge-attributes', { avatar, ...patch });

    const current = getContext();
    const characterIndex = current.characters.findIndex(character => character?.avatar === avatar);
    const character = current.characters[characterIndex];
    if (character) {
        character.data ??= latest.data ?? {};
        character.data.alternate_greetings = alternates;
        character.json_data = JSON.stringify({ ...raw, ...patch, data: { ...raw.data, ...patch.data } });
    }

    const sameChat = character && character === current.characters[current.characterId]
        && start.chatId === current.chatId && start.chatMetadata === current.chatMetadata;
    let synced = false;
    try {
        if (sameChat && canUpdateOpening(current)) {
            const opening = current.chat[0];
            if (opening) {
                appendSwipes(opening, blanks);
            } else {
                renderOpening(current, character, alternates);
            }
            refreshSwipeButtons(true, false);
            synced = true;
            await saveChatConditional();
        }
    } catch (error) {
        console.error('[CHAJ] 当前聊天的开场刷新失败', error);
    }
    if (character) {
        void current.eventSource.emit(current.eventTypes.CHARACTER_EDITED, {
            detail: { id: characterIndex, character },
        });
    }
    return { avatar, first: previous.length + 1, last: alternates.length, synced };
}

// ST skips creating the first message when the selected card greeting itself is empty.
export function showEmptyOpening(context) {
    if (context.chat.length || !canUpdateOpening(context)) return;
    const character = context.characters[context.characterId];
    const alternates = getAlternates(character);
    if (!alternates.includes('')) return;
    renderOpening(context, character, alternates);
    refreshSwipeButtons(true, false);
    void saveChatConditional();
}
