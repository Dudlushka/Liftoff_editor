// ----------------------------------------------------------
// Global state
// ----------------------------------------------------------

let midiEvents = null;       // { ticksPerBeat, events, microsecondsPerQuarter, bpm }
let noteData = null;         // { channels: Map, maxTick, minNote, maxNote }
let selectedTop = null;      // MIDI channel index (0–15)
let selectedBottom = null;

// DOM references – MIDI + piano roll
const fileInput = document.getElementById('midiFile');
const channelTopSelect = document.getElementById('channelTop');
const channelBottomSelect = document.getElementById('channelBottom');
const canvasTop = document.getElementById('canvasTop');
const canvasBottom = document.getElementById('canvasBottom');
const titleTop = document.getElementById('titleTop');
const titleBottom = document.getElementById('titleBottom');

// Channel configs (Blip/Bloop + gate + offset/scale)
const instTopSelect = document.getElementById('instTop');
const instBottomSelect = document.getElementById('instBottom');
const gateTopSelect = document.getElementById('gateTop');
const gateBottomSelect = document.getElementById('gateBottom');

const offsetTopXInput = document.getElementById('offsetTopX');
const offsetTopYInput = document.getElementById('offsetTopY');
const offsetTopZInput = document.getElementById('offsetTopZ');
const scaleTopXInput = document.getElementById('scaleTopX');
const scaleTopYInput = document.getElementById('scaleTopY');
const scaleTopZInput = document.getElementById('scaleTopZ');

const offsetBottomXInput = document.getElementById('offsetBottomX');
const offsetBottomYInput = document.getElementById('offsetBottomY');
const offsetBottomZInput = document.getElementById('offsetBottomZ');
const scaleBottomXInput = document.getElementById('scaleBottomX');
const scaleBottomYInput = document.getElementById('scaleBottomY');
const scaleBottomZInput = document.getElementById('scaleBottomZ');

// Road / tempo settings
const distPerQuarterInput = document.getElementById('distPerQuarter');
const groupLengthInput = document.getElementById('groupLength');
const tempoInput = document.getElementById('tempoBpm');
const tempoFromMidiInfo = document.getElementById('tempoFromMidiInfo');
const speedInfo = document.getElementById('speedInfo');

// Naming + metadata settings
const groupPrefixInput = document.getElementById('groupPrefix');
const mergedGroupNameInput = document.getElementById('mergedGroupName');
const metaMainGroupInput = document.getElementById('metaMainGroup');
const metaSubGroupInput = document.getElementById('metaSubGroup');
const metaTypePartsInput = document.getElementById('metaTypeParts');
const metaTypeMergedInput = document.getElementById('metaTypeMerged');
const generateEmptyGrpsInput = document.getElementById('generateEmptyGrps'); 

// Export
const btnExport = document.getElementById('btnExport');
const jsonOutput = document.getElementById('jsonOutput');

// ----------------------------------------------------------
// MIDI load
// ----------------------------------------------------------

fileInput.addEventListener('change', (e) =>
{
    const file = e.target.files[0];
    if (!file)
    {
        return;
    }

    const reader = new FileReader();
    reader.onload = () =>
    {
        try
        {
            const buffer = reader.result;
            midiEvents = parseMidi(buffer);
            noteData = buildNotesByChannel(midiEvents);
            setupChannelSelectors(noteData);
            applyMidiTempoToUi();
            resizeCanvases();
            renderAll();
        }
        catch (err)
        {
            console.error(err);
            alert('Failed to parse MIDI file. (Only standard .mid format is supported.)');
        }
    };
    reader.readAsArrayBuffer(file);
});

// ----------------------------------------------------------
// MIDI parser (ArrayBuffer -> events)
// ----------------------------------------------------------

function parseMidi(arrayBuffer)
{
    const data = new DataView(arrayBuffer);
    let pos = 0;

    function readString(len)
    {
        let s = '';
        for (let i = 0; i < len; i++)
        {
            s += String.fromCharCode(data.getUint8(pos++));
        }
        return s;
    }

    function readUint32()
    {
        const v = data.getUint32(pos);
        pos += 4;
        return v;
    }

    function readUint16()
    {
        const v = data.getUint16(pos);
        pos += 2;
        return v;
    }

    // var-length integer
    function readVarLen(offsetObj)
    {
        let result = 0;
        while (true)
        {
            const b = data.getUint8(offsetObj.pos++);
            result = (result << 7) | (b & 0x7f);
            if ((b & 0x80) === 0)
            {
                break;
            }
        }
        return result;
    }

    // Header chunk
    const headerId = readString(4);
    if (headerId !== 'MThd')
    {
        throw new Error('Not a MIDI file (missing MThd).');
    }

    const headerLength = readUint32();
    const formatType = readUint16();
    const numTracks = readUint16();
    const division = readUint16();

    // Only PPQN (ticks/quarter note) is supported
    if (division & 0x8000)
    {
        throw new Error('SMPTE-based timing is not supported in this demo.');
    }
    const ticksPerBeat = division;

    // Tempo (if no SetTempo meta, use 120 BPM)
    let initialTempoUsPerQ = 500000; // 120 BPM
    let tempoSet = false;

    // Skip remaining header
    pos = 8 + headerLength;

    const allEvents = [];

    // Tracks
    for (let t = 0; t < numTracks; t++)
    {
        const chunkId = readString(4);
        if (chunkId !== 'MTrk')
        {
            throw new Error('Missing MTrk chunk.');
        }

        const trackLength = readUint32();
        const trackStart = pos;
        const trackEnd = trackStart + trackLength;

        const offs = { pos: trackStart };
        let tick = 0;
        let runningStatus = null;

        while (offs.pos < trackEnd)
        {
            const delta = readVarLen(offs);
            tick += delta;

            let statusByte = data.getUint8(offs.pos++);
            if (statusByte < 0x80)
            {
                // Running status
                offs.pos--;
                if (runningStatus == null)
                {
                    throw new Error('Invalid running status usage.');
                }
                statusByte = runningStatus;
            }
            else
            {
                runningStatus = statusByte;
            }

            if (statusByte === 0xff)
            {
                // Meta event
                const metaType = data.getUint8(offs.pos++);
                const length = readVarLen(offs);

                if (metaType === 0x51 && length === 3 && !tempoSet)
                {
                    // Set Tempo – 3 bytes microsec/quarter note
                    const b0 = data.getUint8(offs.pos++);
                    const b1 = data.getUint8(offs.pos++);
                    const b2 = data.getUint8(offs.pos++);
                    initialTempoUsPerQ = (b0 << 16) | (b1 << 8) | b2;
                    tempoSet = true;
                }
                else
                {
                    offs.pos += length;
                }
            }
            else if (statusByte === 0xf0 || statusByte === 0xf7)
            {
                // SysEx – skip
                const length = readVarLen(offs);
                offs.pos += length;
            }
            else
            {
                const eventType = statusByte & 0xf0;
                const channel = statusByte & 0x0f;

                let param1, param2;
                if (eventType === 0xc0 || eventType === 0xd0)
                {
                    param1 = data.getUint8(offs.pos++);
                }
                else
                {
                    param1 = data.getUint8(offs.pos++);
                    param2 = data.getUint8(offs.pos++);
                }

                if (eventType === 0x90)
                {
                    // Note On (vel 0 => Note Off)
                    const note = param1;
                    const velocity = param2;
                    if (velocity > 0)
                    {
                        allEvents.push({
                            type: 'noteOn',
                            channel: channel,
                            note: note,
                            velocity: velocity,
                            time: tick
                        });
                    }
                    else
                    {
                        allEvents.push({
                            type: 'noteOff',
                            channel: channel,
                            note: note,
                            velocity: 0,
                            time: tick
                        });
                    }
                }
                else if (eventType === 0x80)
                {
                    // Note Off
                    const note = param1;
                    const velocity = param2;
                    allEvents.push({
                        type: 'noteOff',
                        channel: channel,
                        note: note,
                        velocity: velocity,
                        time: tick
                    });
                }
                else
                {
                    // Other channel events – ignored
                }
            }
        }

        pos = trackEnd;
    }

    // Sort by time; at same time, noteOn before noteOff
    allEvents.sort((a, b) =>
    {
        if (a.time !== b.time)
        {
            return a.time - b.time;
        }
        if (a.type === b.type)
        {
            return 0;
        }
        return a.type === 'noteOff' ? 1 : -1;
    });

    const bpm = 60000000 / initialTempoUsPerQ;

    return {
        formatType: formatType,
        ticksPerBeat: ticksPerBeat,
        events: allEvents,
        microsecondsPerQuarter: initialTempoUsPerQ,
        bpm: bpm
    };
}

// ----------------------------------------------------------
// Build notes per channel (pair noteOn/noteOff)
// ----------------------------------------------------------

function buildNotesByChannel(midi)
{
    const events = midi.events;
    const channels = new Map(); // channel -> noteObj[]
    const openNotes = [];

    for (let ch = 0; ch < 16; ch++)
    {
        openNotes[ch] = new Map(); // note -> stack of { start, velocity }
    }

    let maxTick = 0;
    let minNote = 127;
    let maxNote = 0;

    for (const ev of events)
    {
        if (ev.time > maxTick)
        {
            maxTick = ev.time;
        }

        if (ev.type === 'noteOn')
        {
            if (ev.note < minNote)
            {
                minNote = ev.note;
            }
            if (ev.note > maxNote)
            {
                maxNote = ev.note;
            }

            const stackMap = openNotes[ev.channel];
            let stack = stackMap.get(ev.note);
            if (!stack)
            {
                stack = [];
                stackMap.set(ev.note, stack);
            }
            stack.push({
                start: ev.time,
                velocity: ev.velocity
            });
        }
        else if (ev.type === 'noteOff')
        {
            const stackMap = openNotes[ev.channel];
            const stack = stackMap.get(ev.note);
            if (stack && stack.length > 0)
            {
                const open = stack.shift();
                const noteObj = {
                    note: ev.note,
                    start: open.start,
                    end: ev.time,
                    velocity: open.velocity
                };
                if (!channels.has(ev.channel))
                {
                    channels.set(ev.channel, []);
                }
                channels.get(ev.channel).push(noteObj);
            }
        }
    }

    // Unclosed notes: extend them to song end
    for (let ch = 0; ch < 16; ch++)
    {
        const stackMap = openNotes[ch];
        for (const [note, stack] of stackMap.entries())
        {
            for (const open of stack)
            {
                const noteObj = {
                    note: note,
                    start: open.start,
                    end: maxTick,
                    velocity: open.velocity
                };
                if (!channels.has(ch))
                {
                    channels.set(ch, []);
                }
                channels.get(ch).push(noteObj);
            }
        }
    }

    if (minNote > maxNote)
    {
        // No notes – just pick a default range
        minNote = 48;
        maxNote = 72;
    }

    return {
        channels: channels,
        maxTick: maxTick,
        minNote: minNote,
        maxNote: maxNote
    };
}

// ----------------------------------------------------------
// UI: channel selectors
// ----------------------------------------------------------

function setupChannelSelectors(noteData)
{
    const channelNumbers = Array.from(noteData.channels.keys()).sort((a, b) => a - b);

    function fillSelect(selectElem)
    {
        selectElem.innerHTML = '';
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '– none –';
        selectElem.appendChild(emptyOpt);

        for (const ch of channelNumbers)
        {
            const opt = document.createElement('option');
            opt.value = String(ch);
            opt.textContent = 'Channel ' + (ch + 1);
            selectElem.appendChild(opt);
        }

        selectElem.disabled = channelNumbers.length === 0;
    }

    fillSelect(channelTopSelect);
    fillSelect(channelBottomSelect);

    selectedTop = channelNumbers.length > 0 ? channelNumbers[0] : null;
    selectedBottom = channelNumbers.length > 1 ? channelNumbers[1] : selectedTop;

    if (selectedTop != null)
    {
        channelTopSelect.value = String(selectedTop);
    }
    if (selectedBottom != null)
    {
        channelBottomSelect.value = String(selectedBottom);
    }

    channelTopSelect.addEventListener('change', () =>
    {
        selectedTop = channelTopSelect.value === '' ? null : Number(channelTopSelect.value);
        renderAll();
    });

    channelBottomSelect.addEventListener('change', () =>
    {
        selectedBottom = channelBottomSelect.value === '' ? null : Number(channelBottomSelect.value);
        renderAll();
    });

    const modeRadios = document.querySelectorAll('input[name="mode"]');
    modeRadios.forEach((r) =>
    {
        r.addEventListener('change', renderAll);
    });
}

// ----------------------------------------------------------
// Tempo / speed helpers
// ----------------------------------------------------------

function applyMidiTempoToUi()
{
    if (!midiEvents)
    {
        return;
    }

    const bpm = midiEvents.bpm || 120;
    tempoInput.value = bpm.toFixed(1);
    tempoFromMidiInfo.textContent = 'Tempo from MIDI (first SetTempo event): ~' + bpm.toFixed(1) + ' BPM';
    updateSpeedInfo();
}

function updateSpeedInfo()
{
    if (!midiEvents)
    {
        speedInfo.textContent = 'Tempo / speed: –';
        return;
    }

    let bpm = parseFloat(tempoInput.value);
    if (!isFinite(bpm) || bpm <= 0)
    {
        bpm = midiEvents.bpm || 120;
    }

    let dist = parseFloat(distPerQuarterInput.value);
    if (!isFinite(dist) || dist <= 0)
    {
        dist = 1;
    }

    const secondsPerQuarter = 60.0 / bpm;
    const speedMPerS = dist / secondsPerQuarter;
    const speedKmh = speedMPerS * 3.6;

    speedInfo.textContent = 'Ideal speed: ~' + speedKmh.toFixed(1) + ' km/h for this spacing.';
}

tempoInput.addEventListener('input', updateSpeedInfo);
distPerQuarterInput.addEventListener('input', updateSpeedInfo);

// ----------------------------------------------------------
// Canvas resize
// ----------------------------------------------------------

function resizeCanvases()
{
    [canvasTop, canvasBottom].forEach((canvas) =>
    {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = 220;
    });
}

// ----------------------------------------------------------
// Piano roll rendering
// ----------------------------------------------------------

function renderAll()
{
    if (!noteData)
    {
        clearCanvas(canvasTop, 'No MIDI loaded.');
        clearCanvas(canvasBottom, 'No MIDI loaded.');
        titleTop.textContent = 'Top channel';
        titleBottom.textContent = 'Bottom channel';
        return;
    }

    const mode = getCurrentMode();
    const channels = noteData.channels;
    const maxTick = noteData.maxTick;
    const minNote = noteData.minNote;
    const maxNote = noteData.maxNote;

    const noteCount = maxNote - minNote + 1;
    if (noteCount <= 0 || maxTick <= 0)
    {
        clearCanvas(canvasTop, 'No note data.');
        clearCanvas(canvasBottom, 'No note data.');
        return;
    }

    drawChannelCanvas(canvasTop, selectedTop, 'Top channel', titleTop, channels, noteCount, minNote, maxNote, maxTick, mode);
    drawChannelCanvas(canvasBottom, selectedBottom, 'Bottom channel', titleBottom, channels, noteCount, minNote, maxNote, maxTick, mode);
}

function getCurrentMode()
{
    const checked = document.querySelector('input[name="mode"]:checked');
    return checked ? checked.value : 'bars';
}

function clearCanvas(canvas, msg)
{
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (msg)
    {
        ctx.fillStyle = '#cccccc';
        ctx.font = '12px system-ui';
        ctx.fillText(msg, 10, 20);
    }
}

function drawChannelCanvas(canvas, channel, baseTitle, titleElem, channels, noteCount, minNote, maxNote, maxTick, mode)
{
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const width = canvas.width;
    const height = canvas.height;

    const rowH = height / noteCount;

    // background rows
    for (let i = 0; i < noteCount; i++)
    {
        const y = i * rowH;
        ctx.fillStyle = (i % 2 === 0) ? '#4b4b4b' : '#3a3a3a';
        ctx.fillRect(0, y, width, rowH);
    }

    if (channel == null || !channels.has(channel))
    {
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px system-ui';
        ctx.fillText('No channel selected or no notes on this channel.', 10, 20);
        titleElem.textContent = baseTitle + ' – no channel';
        return;
    }

    const notes = channels.get(channel);
    titleElem.textContent = baseTitle + ' – Channel ' + (channel + 1) + ' (' + notes.length + ' notes)';

    const scaleX = width / maxTick;
    const padY = rowH * 0.15;

    ctx.lineWidth = 1;

    if (mode === 'bars')
    {
        ctx.fillStyle = '#ff4444';
        for (const n of notes)
        {
            const x = Math.max(0, n.start * scaleX);
            const w = Math.max(1, (n.end - n.start) * scaleX);
            const rowIndex = maxNote - n.note;
            const y = rowIndex * rowH + padY;
            const h = rowH - 2 * padY;

            ctx.fillRect(x, y, w, h);
        }
    }
    else
    {
        ctx.fillStyle = '#ff7777';
        const onsetWidth = Math.max(3, width * 0.002);

        for (const n of notes)
        {
            const x = Math.max(0, n.start * scaleX);
            const rowIndex = maxNote - n.note;
            const y = rowIndex * rowH + padY;
            const h = rowH - 2 * padY;
            const w = Math.min(onsetWidth, width);

            ctx.fillRect(x, y, w, h);
        }
    }

    // vertical grid (e.g. 16 divisions)
    const gridDivisions = 16;
    ctx.strokeStyle = '#555555';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= gridDivisions; i++)
    {
        const gx = (i / gridDivisions) * width;
        ctx.beginPath();
        ctx.moveTo(gx + 0.5, 0);
        ctx.lineTo(gx + 0.5, height);
        ctx.stroke();
    }
}

// ----------------------------------------------------------
// GRP JSON generation – "musical road"
// ----------------------------------------------------------

// MIDI note -> "Blip F# +" / "Bloop C -" etc.
// 3 octave classes: <=3 => " -", 4 => plain, >=5 => " +"
function makeUserActionValue(instrument, midiNote)
{
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const baseName = names[midiNote % 12];
    const midiOct = Math.floor(midiNote / 12) - 1; // MIDI standard

    let octSuffix = '';
    if (midiOct <= 3)
    {
        octSuffix = ' -';
    }
    else if (midiOct >= 5)
    {
        octSuffix = ' +';
    }

    return instrument + ' ' + baseName + octSuffix;
}

function readChannelConfig(kind)
{
    if (kind === 'top')
    {
        return {
            instrument: instTopSelect.value || 'Blip',
            gateType: gateTopSelect.value || 'TriggerSphere_PlaySound_1mX1m01',
            offset: [
                parseFloat(offsetTopXInput.value) || 0,
                parseFloat(offsetTopYInput.value) || 0,
                parseFloat(offsetTopZInput.value) || 0
            ],
            scale: [
                parseFloat(scaleTopXInput.value) || 1,
                parseFloat(scaleTopYInput.value) || 1,
                parseFloat(scaleTopZInput.value) || 1
            ]
        };
    }
    else
    {
        return {
            instrument: instBottomSelect.value || 'Blip',
            gateType: gateBottomSelect.value || 'TriggerSphere_PlaySound_1mX1m01',
            offset: [
                parseFloat(offsetBottomXInput.value) || 0,
                parseFloat(offsetBottomYInput.value) || 0,
                parseFloat(offsetBottomZInput.value) || 0
            ],
            scale: [
                parseFloat(scaleBottomXInput.value) || 1,
                parseFloat(scaleBottomYInput.value) || 1,
                parseFloat(scaleBottomZInput.value) || 1
            ]
        };
    }
}


//--------------------------------------------
//
//--------------------------------------------

function generateGrpLibraryJson()
{
    if (!noteData || !midiEvents)
    {
        throw new Error('No MIDI data loaded.');
    }

    let distPerQuarter = parseFloat(distPerQuarterInput.value);
    if (!isFinite(distPerQuarter) || distPerQuarter <= 0)
    {
        distPerQuarter = 1;
    }

    let groupLength = parseFloat(groupLengthInput.value);
    if (!isFinite(groupLength) || groupLength <= 0)
    {
        groupLength = 10;
    }

    let groupPrefix = (groupPrefixInput.value || '').trim();
    if (!groupPrefix)
    {
        groupPrefix = 'GRP';
    }

    let mergedGroupName = (mergedGroupNameInput.value || '').trim();
    if (!mergedGroupName)
    {
        mergedGroupName = 'MusicRoad';
    }

    const metaMainGroup = (metaMainGroupInput.value || '').trim() || null;
    const metaSubGroup = (metaSubGroupInput.value || '').trim() || null;
    const metaTypeParts = (metaTypePartsInput.value || '').trim() || null;
    const metaTypeMerged = (metaTypeMergedInput.value || '').trim() || null;

    const generateEmpty = !!generateEmptyGrpsInput.checked;

    const ticksPerBeat = midiEvents.ticksPerBeat;
    const channels = noteData.channels;

    const configTop = readChannelConfig('top');
    const configBottom = readChannelConfig('bottom');

    const groups = {};              // e.g. "GRP_000": { name, items, meta }
    const groupIndexSet = new Set();

    function addNoteSet(kind, midiChannel, config)
    {
        if (midiChannel == null)
        {
            return;
        }
        if (!channels.has(midiChannel))
        {
            return;
        }

        const notes = channels.get(midiChannel);

        for (const n of notes)
        {
            const quarterPos = n.start / ticksPerBeat;
            const xBase = quarterPos * distPerQuarter;

            const groupIndex = Math.floor(xBase / groupLength);
            const groupName = groupPrefix + '_' + String(groupIndex).padStart(3, '0');

            groupIndexSet.add(groupIndex);

            if (!groups[groupName])
            {
                groups[groupName] = {
                    name: groupName,
                    items: [],
                    meta: {
                        mainGroup: metaMainGroup,
                        subGroup: metaSubGroup,
                        type: metaTypeParts
                    }
                };
            }

            const xLocal = xBase - groupIndex * groupLength + config.offset[0];
            const yLocal = config.offset[1];
            const zLocal = config.offset[2];

            const userActionValue = makeUserActionValue(config.instrument, n.note);

            groups[groupName].items.push({
                refType: 'gp',
                refName: config.gateType,
                pos: [xLocal, yLocal, zLocal],
                rotRYP: [0, 0, 0],
                scale: [config.scale[0], config.scale[1], config.scale[2]],
                hidden: false,
                userActionValue: userActionValue,
                meta: {
                    mainGroup: metaMainGroup,
                    subGroup: metaSubGroup,
                    type: metaTypeParts
                }
            });
        }
    }

    // Add notes for both selected channels
    addNoteSet('top', selectedTop, configTop);
    addNoteSet('bottom', selectedBottom, configBottom);

    // Determine which group indices exist
    let maxGroupIndex = -1;
    for (const gi of groupIndexSet)
    {
        if (gi > maxGroupIndex)
        {
            maxGroupIndex = gi;
        }
    }

    // If "generate empty GRPs" is checked, create empty groups as placeholders
    if (generateEmpty && maxGroupIndex >= 0)
    {
        for (let gi = 0; gi <= maxGroupIndex; gi++)
        {
            const groupName = groupPrefix + '_' + String(gi).padStart(3, '0');
            if (!groups[groupName])
            {
                groups[groupName] = {
                    name: groupName,
                    items: [],
                    meta: {
                        mainGroup: metaMainGroup,
                        subGroup: metaSubGroup,
                        type: metaTypeParts
                    }
                };
            }
            // also mark this index as present, even if it had no notes
            groupIndexSet.add(gi);
        }
    }

    // Build merged group items (straight road composed of all segments)
    let groupIndicesToUse;
    if (generateEmpty && maxGroupIndex >= 0)
    {
        // 0..maxIndex, continuous, even if some groups are empty
        groupIndicesToUse = [];
        for (let gi = 0; gi <= maxGroupIndex; gi++)
        {
            groupIndicesToUse.push(gi);
        }
    }
    else
    {
        // Only non-empty groups
        groupIndicesToUse = Array.from(groupIndexSet).sort((a, b) => a - b);
    }

    const songItems = [];
    for (const gi of groupIndicesToUse)
    {
        const groupName = groupPrefix + '_' + String(gi).padStart(3, '0');
        const posX = gi * groupLength;
        const posY = 0.5;
        const posZ = 0.0;

        songItems.push({
            refType: 'grp',
            refName: groupName,
            pos: [posX, posY, posZ],
            rotRYP: [0, 0, 0],
            scale: [1, 1, 1],
            vis: true,
            meta: {
                mainGroup: metaMainGroup,
                subGroup: metaSubGroup,
                type: metaTypeMerged
            }
        });
    }

    const mergedGroup = {
        name: mergedGroupName,
        items: songItems,
        meta: {
            mainGroup: metaMainGroup,
            subGroup: metaSubGroup,
            type: metaTypeMerged
        }
    };

    const groupsObj = Object.assign({}, groups);
    groupsObj[mergedGroupName] = mergedGroup;

    return {
        groups: groupsObj
    };
}


// Export button
btnExport.addEventListener('click', () =>
{
    try
    {
        const obj = generateGrpLibraryJson();
        const jsonText = JSON.stringify(obj, null, 2);
        jsonOutput.value = jsonText;

        const mergedGroupName = (mergedGroupNameInput.value || 'MusicRoad').trim() || 'MusicRoad';

        const blob = new Blob([jsonText], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'GRPlibrary_' + mergedGroupName + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    catch (err)
    {
        console.error(err);
        alert('Failed to generate GRP JSON: ' + err.message);
    }
});

// ----------------------------------------------------------
// Window resize
// ----------------------------------------------------------

window.addEventListener('resize', () =>
{
    resizeCanvases();
    renderAll();
});

// Initial
window.addEventListener('load', () =>
{
    resizeCanvases();
    renderAll();
});
