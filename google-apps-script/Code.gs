/**
 * Flowboard → Google Sheets + Google Calendar + Google Tasks (import) backend
 *
 * Setup (primary account — owns the sheet):
 * 1. Create a Google Sheet (or open an existing one).
 * 2. Extensions → Apps Script → paste this file.
 * 3. Deploy → New deployment → Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy the Web app URL into Flowboard → Sheets sync.
 * 5. Services (+): enable Google Tasks API (Tasks advanced service).
 * 6. Run authorizeGoogleTasks (and authorizeCalendar if using Calendar) once.
 * 7. Optional: run installGoogleTasksTrigger for auto-import every 10 minutes.
 *
 * Multi-account Google Tasks (e.g. 3 Gmails):
 * - Share the spreadsheet Editor with each Gmail.
 * - Under each other account: script.google.com → New project → paste this file.
 * - Project Settings → Script properties → SPREADSHEET_ID = the shared sheet id.
 * - Enable Tasks advanced service; run authorizeGoogleTasks; installGoogleTasksTrigger.
 * - Optional: deploy that project as a Web app and paste its /exec URL into
 *   Flowboard → "Extra Google Tasks import URLs" for one-click Import.
 *
 * Sheets created automatically:
 *   Projects | Flows | Tasks | Segments | Dependencies | CalendarMap |
 *   GoogleTasksMap | Meta
 *
 * Calendar: one event per day-segment (start→end that day).
 * Google Tasks: incomplete tasks → Flowboard backlog (segments empty).
 */

var SHEET_PROJECTS = 'Projects'
var SHEET_FLOWS = 'Flows'
var SHEET_TASKS = 'Tasks'
var SHEET_SEGS = 'Segments'
var SHEET_DEPS = 'Dependencies'
var SHEET_CAL = 'CalendarMap'
var SHEET_GTMAP = 'GoogleTasksMap'
var SHEET_META = 'Meta'

function doGet(e) {
  return handle_(e && e.parameter ? e.parameter : {})
}

function doPost(e) {
  var body = {}
  try {
    body = JSON.parse((e.postData && e.postData.contents) || '{}')
  } catch (err) {
    return json_({ ok: false, error: 'Invalid JSON body' })
  }
  return handle_(body)
}

function handle_(req) {
  try {
    var action = req.action || 'load'
    if (action === 'load') {
      return json_({
        ok: true,
        state: loadState_(),
        updatedAt: getMeta_('updatedAt'),
        calendarSync: getMeta_('calendarSync') === 'true',
      })
    }
    if (action === 'save') {
      if (!req.state) return json_({ ok: false, error: 'Missing state' })
      var saved = saveState_(req.state, {
        allowEmptyBoard:
          req.allowEmptyBoard === true || req.allowEmptyBoard === 'true',
      })
      if (!saved.ok) return json_(saved)
      var updatedAt = new Date().toISOString()
      setMeta_('updatedAt', updatedAt)

      var calendar = { synced: false, created: 0, updated: 0, deleted: 0 }
      var calendarError = ''
      var wantCalendar = req.syncCalendar === true || req.syncCalendar === 'true'
      setMeta_('calendarSync', wantCalendar ? 'true' : 'false')
      if (wantCalendar) {
        try {
          calendar = syncCalendar_(loadState_())
          calendar.synced = true
          if (calendar.errors && calendar.errors.length) {
            calendarError = calendar.errors.join('; ')
          }
        } catch (calErr) {
          // Sheets save already succeeded — don't fail the whole sync for Calendar
          calendarError = String(
            calErr && calErr.message ? calErr.message : calErr,
          )
          calendar = {
            synced: false,
            created: 0,
            updated: 0,
            deleted: 0,
            error: calendarError,
          }
        }
      }

      return json_({
        ok: true,
        updatedAt: updatedAt,
        calendar: calendar,
        calendarError: calendarError || undefined,
      })
    }
    if (action === 'syncCalendar') {
      try {
        var calResult = syncCalendar_(loadState_())
        return json_({ ok: true, calendar: calResult })
      } catch (calErr2) {
        return json_({
          ok: false,
          error: String(calErr2 && calErr2.message ? calErr2.message : calErr2),
        })
      }
    }
    if (action === 'deleteInvalidTasks') {
      return json_(deleteInvalidTasks_())
    }
    if (action === 'importGoogleTasks') {
      return json_(importGoogleTasks_())
    }
    if (action === 'ping') {
      return json_({
        ok: true,
        version: 4,
        features: ['sheets', 'calendar', 'cleanup', 'googleTasks'],
      })
    }
    return json_({ ok: false, error: 'Unknown action: ' + action })
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) })
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  )
}

/**
 * Active/bound spreadsheet, or open by Script property SPREADSHEET_ID
 * (used by secondary Gmail scripts writing into a shared sheet).
 */
function ss_() {
  var props = PropertiesService.getScriptProperties()
  var id = String(props.getProperty('SPREADSHEET_ID') || '').trim()
  if (id) return SpreadsheetApp.openById(id)
  var active = SpreadsheetApp.getActiveSpreadsheet()
  if (active) return active
  throw new Error(
    'No spreadsheet. Bind this script to a Sheet, or set script property SPREADSHEET_ID.',
  )
}

function ensureSheet_(name, headers) {
  var ss = ss_()
  var sheet = ss.getSheetByName(name)
  if (!sheet) {
    sheet = ss.insertSheet(name)
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    sheet.setFrozenRows(1)
  } else if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    sheet.setFrozenRows(1)
  }
  return sheet
}

/** Append a labels column on existing Tasks sheets created before labels existed. */
function ensureTaskLabelsColumn_() {
  var sheet = ss_().getSheetByName(SHEET_TASKS)
  if (!sheet) return
  var lastCol = Math.max(1, sheet.getLastColumn())
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String)
  if (headers.indexOf('labels') === -1) {
    sheet.getRange(1, headers.length + 1).setValue('labels')
  }
}

/** Append a priority column on existing Tasks sheets. */
function ensureTaskPriorityColumn_() {
  var sheet = ss_().getSheetByName(SHEET_TASKS)
  if (!sheet) return
  var lastCol = Math.max(1, sheet.getLastColumn())
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String)
  if (headers.indexOf('priority') === -1) {
    sheet.getRange(1, headers.length + 1).setValue('priority')
  }
}

var GTMAP_HEADERS = [
  'accountEmail',
  'googleTaskId',
  'flowboardTaskId',
  'importedAt',
  'status',
  'deletedAt',
]

/** Append status/deletedAt on existing GoogleTasksMap sheets. */
function ensureGoogleTasksMapColumns_() {
  var sheet = ss_().getSheetByName(SHEET_GTMAP)
  if (!sheet) return
  var lastCol = Math.max(1, sheet.getLastColumn())
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String)
  for (var i = 0; i < GTMAP_HEADERS.length; i++) {
    var name = GTMAP_HEADERS[i]
    if (headers.indexOf(name) === -1) {
      headers.push(name)
      sheet.getRange(1, headers.length).setValue(name)
    }
  }
}

function normalizeGtMapRow_(row) {
  var status = String((row && row.status) || 'imported')
    .trim()
    .toLowerCase()
  return {
    accountEmail: String((row && row.accountEmail) || '').toLowerCase(),
    googleTaskId: String((row && row.googleTaskId) || ''),
    flowboardTaskId: String((row && row.flowboardTaskId) || ''),
    importedAt: (row && row.importedAt) || '',
    status: status === 'deleted' ? 'deleted' : 'imported',
    deletedAt: (row && row.deletedAt) || '',
  }
}

/**
 * When a Flowboard task is gone from a Push/save, keep its GoogleTasksMap
 * row as status=deleted so the same Google Task is not reimported.
 */
function tombstoneOrphanGoogleTasksMap_(taskIds) {
  ensureGoogleTasksMapColumns_()
  var sheet = ss_().getSheetByName(SHEET_GTMAP)
  var rows = readObjects_(sheet)
  if (!rows.length) return 0
  var idSet = {}
  for (var i = 0; i < taskIds.length; i++) {
    idSet[String(taskIds[i])] = true
  }
  var changed = false
  var out = []
  for (var r = 0; r < rows.length; r++) {
    var row = normalizeGtMapRow_(rows[r])
    if (
      row.flowboardTaskId &&
      !idSet[row.flowboardTaskId] &&
      row.status !== 'deleted'
    ) {
      row.status = 'deleted'
      row.deletedAt = new Date().toISOString()
      changed = true
    }
    if (row.accountEmail && row.googleTaskId) out.push(row)
  }
  if (changed) {
    writeObjects_(sheet, GTMAP_HEADERS, out)
  }
  return changed ? 1 : 0
}

function normalizePriority_(raw) {
  var s = String(raw == null ? '' : raw)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
  if (s === 'q1' || s === '1' || s === 'do' || s === 'donow' || s === 'urgent')
    return 'q1'
  if (s === 'q2' || s === '2' || s === 'schedule') return 'q2'
  if (
    s === 'q3' ||
    s === '3' ||
    s === 'delegate' ||
    s === 'q4' ||
    s === '4' ||
    s === 'eliminate' ||
    s === 'drop'
  )
    return 'q3'
  return 'q2'
}

function parseLabelsCell_(raw) {
  if (raw === null || raw === undefined || raw === '') return []
  var text = String(raw)
  // Prefer JSON arrays when present
  if (text.charAt(0) === '[') {
    try {
      var parsed = JSON.parse(text)
      if (Array.isArray(parsed)) {
        return parsed
          .map(function (x) {
            return String(x).trim()
          })
          .filter(function (x) {
            return x
          })
      }
    } catch (err) {
      /* fall through */
    }
  }
  return text
    .split(/[,;]/)
    .map(function (x) {
      return String(x).trim()
    })
    .filter(function (x) {
      return x
    })
}

function formatLabelsCell_(labels) {
  if (!labels || !labels.length) return ''
  return labels
    .map(function (x) {
      return String(x).trim()
    })
    .filter(function (x) {
      return x
    })
    .join(', ')
}

function ensureAll_() {
  ensureSheet_(SHEET_PROJECTS, ['id', 'name', 'color'])
  ensureSheet_(SHEET_FLOWS, ['id', 'name', 'color', 'projectId'])
  ensureSheet_(SHEET_TASKS, [
    'id',
    'title',
    'notes',
    'projectId',
    'labels',
    'priority',
  ])
  ensureTaskLabelsColumn_()
  ensureTaskPriorityColumn_()
  ensureSheet_(SHEET_SEGS, [
    'taskId',
    'date',
    'startHour',
    'startMinute',
    'endHour',
    'endMinute',
  ])
  ensureSheet_(SHEET_DEPS, ['id', 'fromId', 'toId', 'flowId'])
  ensureSheet_(SHEET_CAL, ['mapKey', 'taskId', 'date', 'eventId'])
  ensureSheet_(SHEET_GTMAP, [
    'accountEmail',
    'googleTaskId',
    'flowboardTaskId',
    'importedAt',
    'status',
    'deletedAt',
  ])
  ensureGoogleTasksMapColumns_()
  ensureSheet_(SHEET_META, ['key', 'value'])
}

function readObjects_(sheet) {
  var range = sheet.getDataRange()
  var values = range.getValues()
  if (values.length < 2) return []
  var headers = values[0].map(String)
  var out = []
  for (var r = 1; r < values.length; r++) {
    var row = values[r]
    if (row.every(function (c) { return c === '' || c === null })) continue
    var obj = {}
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = row[c]
    }
    out.push(obj)
  }
  return out
}

function writeObjects_(sheet, headers, rows) {
  sheet.clearContents()
  // getRange(row, column, numRows, numColumns) — 3rd/4th args are counts, not end indices
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
  if (rows.length === 0) return
  var values = rows.map(function (row) {
    return headers.map(function (h) {
      var v = row[h]
      return v === undefined || v === null ? '' : v
    })
  })
  sheet.getRange(2, 1, values.length, headers.length).setValues(values)
}

function getMeta_(key) {
  ensureAll_()
  var sheet = ss_().getSheetByName(SHEET_META)
  var rows = readObjects_(sheet)
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].key) === key) return String(rows[i].value || '')
  }
  return ''
}

function setMeta_(key, value) {
  ensureAll_()
  var sheet = ss_().getSheetByName(SHEET_META)
  var rows = readObjects_(sheet)
  var found = false
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].key) === key) {
      rows[i].value = value
      found = true
      break
    }
  }
  if (!found) rows.push({ key: key, value: value })
  writeObjects_(sheet, ['key', 'value'], rows)
}

function sheetHeaders_(sheet) {
  if (!sheet || sheet.getLastRow() === 0) return []
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String)
}

function hasColumn_(sheet, name) {
  return sheetHeaders_(sheet).indexOf(name) !== -1
}

function countDataRows_(sheet) {
  if (!sheet) return 0
  var last = sheet.getLastRow()
  return last > 1 ? last - 1 : 0
}

function legacySegmentFromRow_(r) {
  if (!r || !r.date) return null
  var dateStr = formatDate_(r.date)
  if (!dateStr) return null
  var sh = Number(r.hour) || 0
  var sm = normalizeMinute_(r.minute)
  var endH = Number(r.endHour)
  var endM =
    r.endMinute === '' || r.endMinute === null || r.endMinute === undefined
      ? NaN
      : normalizeMinute_(r.endMinute)
  if (isNaN(endH)) {
    // Default 1 hour when only start is stored on Tasks
    endH = sh + 1
    endM = sm
    if (endH > 23) {
      endH = 24
      endM = 0
    }
  }
  if (endH > 23) {
    endH = 24
    endM = 0
  }
  return {
    date: dateStr,
    startHour: sh,
    startMinute: sm,
    endHour: endH,
    endMinute: isNaN(endM) ? 0 : endM,
  }
}

function readSegsByTask_() {
  var segRows = readObjects_(ss_().getSheetByName(SHEET_SEGS))
  var segsByTask = {}
  for (var i = 0; i < segRows.length; i++) {
    var row = segRows[i]
    var tid = String(row.taskId || '')
    if (!tid) continue
    if (!segsByTask[tid]) segsByTask[tid] = []
    segsByTask[tid].push({
      date: formatDate_(row.date),
      startHour: Number(row.startHour) || 0,
      startMinute: normalizeMinute_(row.startMinute),
      endHour: Number(row.endHour) >= 24 ? 24 : Number(row.endHour) || 0,
      endMinute: Number(row.endHour) >= 24 ? 0 : normalizeMinute_(row.endMinute),
    })
  }
  return segsByTask
}

/** Copy legacy Tasks!date/hour into Segments once, without wiping Tasks. */
function migrateLegacyTasksToSegments_() {
  ensureAll_()
  var tasksSheet = ss_().getSheetByName(SHEET_TASKS)
  if (!hasColumn_(tasksSheet, 'date')) return { migrated: 0 }
  var existingSegs = readSegsByTask_()
  var taskRows = readObjects_(tasksSheet)
  var added = []
  // keep existing segment rows
  var allSegRows = readObjects_(ss_().getSheetByName(SHEET_SEGS))
  for (var t = 0; t < taskRows.length; t++) {
    var r = taskRows[t]
    var id = String(r.id || '')
    if (!id) continue
    if (existingSegs[id] && existingSegs[id].length) continue
    var seg = legacySegmentFromRow_(r)
    if (!seg) continue
    added.push({
      taskId: id,
      date: seg.date,
      startHour: seg.startHour,
      startMinute: seg.startMinute,
      endHour: seg.endHour,
      endMinute: seg.endMinute,
    })
  }
  if (!added.length) return { migrated: 0 }
  var merged = allSegRows.concat(added)
  writeObjects_(
    ss_().getSheetByName(SHEET_SEGS),
    ['taskId', 'date', 'startHour', 'startMinute', 'endHour', 'endMinute'],
    merged,
  )
  return { migrated: added.length }
}

function loadState_() {
  ensureAll_()
  migrateLegacyTasksToSegments_()
  var ss = ss_()
  var projects = readObjects_(ss.getSheetByName(SHEET_PROJECTS)).map(function (r) {
    return { id: String(r.id), name: String(r.name), color: String(r.color) }
  })
  var flows = readObjects_(ss.getSheetByName(SHEET_FLOWS)).map(function (r) {
    return {
      id: String(r.id),
      name: String(r.name),
      color: String(r.color),
      projectId: String(r.projectId),
    }
  })

  var segsByTask = readSegsByTask_()
  var taskRows = readObjects_(ss.getSheetByName(SHEET_TASKS))
  var tasks = []
  for (var t = 0; t < taskRows.length; t++) {
    var r = taskRows[t]
    var id = String(r.id)
    if (!id) continue
    var segments = segsByTask[id] || []
    if (segments.length === 0) {
      var legacy = legacySegmentFromRow_(r)
      if (legacy) segments = [legacy]
    }
    tasks.push({
      id: id,
      title: String(r.title || ''),
      notes: String(r.notes || ''),
      projectId: String(r.projectId || ''),
      labels: parseLabelsCell_(r.labels),
      priority: normalizePriority_(r.priority),
      segments: segments,
    })
  }

  var dependencies = readObjects_(ss.getSheetByName(SHEET_DEPS)).map(function (r) {
    return {
      id: String(r.id),
      fromId: String(r.fromId),
      toId: String(r.toId),
      flowId: String(r.flowId),
    }
  })
  var catalogRaw = getMeta_('labelCatalog')
  var catalog = []
  if (catalogRaw) {
    try {
      var parsedCatalog = JSON.parse(catalogRaw)
      if (Array.isArray(parsedCatalog)) {
        for (var pi = 0; pi < parsedCatalog.length; pi++) {
          var entry = parsedCatalog[pi]
          if (typeof entry === 'string') {
            var sn = String(entry).trim()
            if (sn) catalog.push({ name: sn, description: '' })
          } else if (entry && typeof entry === 'object') {
            var en = String(entry.name || '').trim()
            if (en) {
              catalog.push({
                name: en,
                description: String(entry.description || '').trim(),
              })
            }
          }
        }
      }
    } catch (err) {
      var legacyNames = parseLabelsCell_(catalogRaw)
      for (var ln = 0; ln < legacyNames.length; ln++) {
        catalog.push({ name: legacyNames[ln], description: '' })
      }
    }
  }
  // Always include labels currently on tasks
  for (var ti = 0; ti < tasks.length; ti++) {
    var tl = tasks[ti].labels || []
    for (var li = 0; li < tl.length; li++) {
      var name = String(tl[li] || '').trim()
      if (!name) continue
      var found = false
      for (var ci = 0; ci < catalog.length; ci++) {
        if (String(catalog[ci].name).toLowerCase() === name.toLowerCase()) {
          found = true
          break
        }
      }
      if (!found) catalog.push({ name: name, description: '' })
    }
  }

  return {
    projects: projects,
    flows: flows,
    tasks: tasks,
    dependencies: dependencies,
    labels: catalog,
  }
}

function saveState_(state, opts) {
  opts = opts || {}
  ensureAll_()
  migrateLegacyTasksToSegments_()
  var ss = ss_()
  var tasksSheet = ss.getSheetByName(SHEET_TASKS)
  var segsSheet = ss.getSheetByName(SHEET_SEGS)
  var existingTaskCount = countDataRows_(tasksSheet)
  var existingSegCount = countDataRows_(segsSheet)
  var existingSegsByTask = readSegsByTask_()

  var tasks = state.tasks || []

  // Never wipe a populated sheet with an empty board unless the client
  // explicitly confirmed (Push after deleting the last task).
  if (tasks.length === 0 && existingTaskCount > 0 && !opts.allowEmptyBoard) {
    return {
      ok: false,
      error:
        'Refusing to save empty tasks over ' +
        existingTaskCount +
        ' existing Tasks rows. Pull from Sheets to restore, or Push again and confirm clearing the cloud board.',
    }
  }

  var hydrated = []
  var segOut = []
  for (var i = 0; i < tasks.length; i++) {
    var task = tasks[i]
    // Explicit segments: [] means unscheduled backlog — clear sheet segments.
    // Omitted segments (older clients) keep prior sheet rows when present.
    var hasSegmentsField = Object.prototype.hasOwnProperty.call(task, 'segments')
    var segs = []
    if (hasSegmentsField) {
      segs = Array.isArray(task.segments) ? task.segments : []
      if (segs.length === 0 && task.date) {
        var fromLegacy = legacySegmentFromRow_(task)
        if (fromLegacy) segs = [fromLegacy]
      }
    } else {
      if (task.date) {
        var fromLegacyOmit = legacySegmentFromRow_(task)
        if (fromLegacyOmit) segs = [fromLegacyOmit]
      }
      if (segs.length === 0 && existingSegsByTask[task.id]) {
        segs = existingSegsByTask[task.id]
      }
    }
    hydrated.push({
      id: task.id,
      title: task.title,
      notes: task.notes || '',
      projectId: task.projectId,
      labels: task.labels || [],
      priority: normalizePriority_(task.priority),
      segments: segs,
    })
    for (var s = 0; s < segs.length; s++) {
      var seg = segs[s]
      segOut.push({
        taskId: task.id,
        date: seg.date,
        startHour: seg.startHour,
        startMinute: normalizeMinute_(seg.startMinute),
        endHour: Number(seg.endHour) >= 24 ? 24 : seg.endHour,
        endMinute: Number(seg.endHour) >= 24 ? 0 : normalizeMinute_(seg.endMinute),
      })
    }
  }

  // If client sent no schedules, keep existing Segments instead of wiping them
  var writeSegs = segOut
  if (writeSegs.length === 0 && existingSegCount > 0 && tasks.length > 0) {
    writeSegs = readObjects_(segsSheet).map(function (row) {
      return {
        taskId: row.taskId,
        date: formatDate_(row.date),
        startHour: row.startHour,
        startMinute: normalizeMinute_(row.startMinute),
        endHour: Number(row.endHour) >= 24 ? 24 : row.endHour,
        endMinute: Number(row.endHour) >= 24 ? 0 : normalizeMinute_(row.endMinute),
      }
    })
  }

  writeObjects_(ss.getSheetByName(SHEET_PROJECTS), ['id', 'name', 'color'], state.projects || [])
  writeObjects_(
    ss.getSheetByName(SHEET_FLOWS),
    ['id', 'name', 'color', 'projectId'],
    state.flows || [],
  )

  // Keep denormalized first-segment times on Tasks for visibility / recovery
  writeObjects_(
    tasksSheet,
    [
      'id',
      'title',
      'notes',
      'projectId',
      'labels',
      'priority',
      'date',
      'hour',
      'minute',
      'endHour',
      'endMinute',
    ],
    hydrated.map(function (t) {
      var first = (t.segments && t.segments[0]) || null
      return {
        id: t.id,
        title: t.title,
        notes: t.notes || '',
        projectId: t.projectId,
        labels: formatLabelsCell_(t.labels),
        priority: normalizePriority_(t.priority),
        date: first ? String(first.date) : '',
        hour: first ? first.startHour : '',
        minute: first ? first.startMinute : '',
        endHour: first ? first.endHour : '',
        endMinute: first ? first.endMinute : '',
      }
    }),
  )

  writeObjects_(
    segsSheet,
    ['taskId', 'date', 'startHour', 'startMinute', 'endHour', 'endMinute'],
    writeSegs,
  )

  writeObjects_(
    ss.getSheetByName(SHEET_DEPS),
    ['id', 'fromId', 'toId', 'flowId'],
    state.dependencies || [],
  )

  setMeta_('labelCatalog', JSON.stringify(state.labels || []))

  // Keep GoogleTasksMap rows for deleted Flowboard tasks so import won't recreate them.
  tombstoneOrphanGoogleTasksMap_(
    hydrated.map(function (t) {
      return t.id
    }),
  )

  return { ok: true }
}

function mapKey_(taskId, date) {
  return String(taskId) + '|' + String(date)
}

function taskMarker_(taskId, date) {
  return 'Flowboard task: ' + String(taskId) + ' | date: ' + String(date)
}

function getEventByIdSafe_(cal, eventId) {
  if (!eventId) return null
  try {
    return cal.getEventById(String(eventId))
  } catch (err) {
    return null
  }
}

function findEventsForSegment_(cal, taskId, date, aroundStart) {
  var marker = taskMarker_(taskId, date)
  var legacy = 'Flowboard task: ' + String(taskId)
  var windowStart = new Date(aroundStart.getTime() - 60 * 24 * 60 * 60 * 1000)
  var windowEnd = new Date(aroundStart.getTime() + 60 * 24 * 60 * 60 * 1000)
  var events = cal.getEvents(windowStart, windowEnd)
  var matches = []
  for (var i = 0; i < events.length; i++) {
    var desc = events[i].getDescription() || ''
    if (desc.indexOf(marker) !== -1) matches.push(events[i])
  }
  if (matches.length) return matches
  // Fallback: legacy single-event marker on same calendar day
  for (var j = 0; j < events.length; j++) {
    var d = events[j].getDescription() || ''
    if (d.indexOf(legacy) !== -1 && d.indexOf('| date:') === -1) matches.push(events[j])
  }
  return matches
}

function deleteEventSafe_(event) {
  try {
    event.deleteEvent()
    return true
  } catch (err) {
    return false
  }
}

/**
 * Upsert one Google Calendar event per day-segment.
 */
function syncCalendar_(state) {
  var lock = LockService.getScriptLock()
  lock.waitLock(30000)

  try {
    ensureAll_()
    var cal = CalendarApp.getDefaultCalendar()
    var calendarName = cal.getName()
    var mapSheet = ss_().getSheetByName(SHEET_CAL)
    var existing = readObjects_(mapSheet)
    var byKey = {}
    for (var i = 0; i < existing.length; i++) {
      var key = String(existing[i].mapKey || '').trim()
      var tid = String(existing[i].taskId || '').trim()
      var date = formatDate_(existing[i].date)
      var eid = String(existing[i].eventId || '').trim()
      if (!key && tid) key = mapKey_(tid, date || 'legacy')
      if (key && eid) byKey[key] = eid
    }

    var projectNames = {}
    var projects = state.projects || []
    for (var p = 0; p < projects.length; p++) {
      projectNames[String(projects[p].id)] = String(projects[p].name || 'Project')
    }

    var created = 0
    var updated = 0
    var deleted = 0
    var skipped = 0
    var errors = []
    var newMap = []
    var keep = {}
    var tasks = state.tasks || []

    for (var t = 0; t < tasks.length; t++) {
      var task = tasks[t]
      var taskId = String(task.id)
      var segs = task.segments || []
      if (segs.length === 0) {
        var legacy = legacySegmentFromRow_(task)
        if (legacy) segs = [legacy]
      }
      var projectName = projectNames[String(task.projectId)] || 'Flowboard'
      var title = String(task.title || 'Untitled task')

      if (!segs.length) {
        skipped++
        continue
      }

      for (var s = 0; s < segs.length; s++) {
        var seg = segs[s]
        var dateStr = formatDate_(seg.date)
        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          skipped++
          errors.push(title + ': invalid date "' + seg.date + '"')
          continue
        }
        var key = mapKey_(taskId, dateStr)
        try {
          var start = parseSegmentTime_(dateStr, seg.startHour, seg.startMinute)
          var end = parseSegmentTime_(dateStr, seg.endHour, seg.endMinute)
          if (end.getTime() <= start.getTime()) {
            end = new Date(start.getTime() + 60 * 60 * 1000)
          }
          var description = [
            task.notes ? String(task.notes) : '',
            'Project: ' + projectName,
            'When: ' + dateStr + ' ' + seg.startHour + ':' + ('0' + seg.startMinute).slice(-2),
            taskMarker_(taskId, dateStr),
          ]
            .filter(function (part) { return part })
            .join('\n\n')

          var event = getEventByIdSafe_(cal, byKey[key])
          var found = findEventsForSegment_(cal, taskId, dateStr, start)
          if (!event && found.length) event = found[0]
          for (var f = 0; f < found.length; f++) {
            if (event && found[f].getId() === event.getId()) continue
            if (deleteEventSafe_(found[f])) deleted++
          }

          if (event) {
            event.setTitle(title)
            event.setDescription(description)
            event.setTime(start, end)
            updated++
            newMap.push({
              mapKey: key,
              taskId: taskId,
              date: dateStr,
              eventId: String(event.getId()),
            })
            keep[key] = true
          } else {
            var createdEvent = cal.createEvent(title, start, end, {
              description: description,
            })
            created++
            newMap.push({
              mapKey: key,
              taskId: taskId,
              date: dateStr,
              eventId: String(createdEvent.getId()),
            })
            keep[key] = true
          }
        } catch (segErr) {
          errors.push(
            title +
              ' @ ' +
              dateStr +
              ': ' +
              String(segErr && segErr.message ? segErr.message : segErr),
          )
        }
      }
    }

    for (var oldKey in byKey) {
      if (keep[oldKey]) continue
      var mapped = getEventByIdSafe_(cal, byKey[oldKey])
      if (mapped && deleteEventSafe_(mapped)) deleted++
    }

    writeObjects_(mapSheet, ['mapKey', 'taskId', 'date', 'eventId'], newMap)
    return {
      created: created,
      updated: updated,
      deleted: deleted,
      skipped: skipped,
      calendarName: calendarName,
      errors: errors,
    }
  } finally {
    lock.releaseLock()
  }
}

function normalizeMinute_(value) {
  var n = Number(value)
  if (isNaN(n) || n < 15) return 0
  if (n < 30) return 15
  if (n < 45) return 30
  return 45
}

function scriptTimeZone_() {
  try {
    return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone()
  } catch (err) {
    return Session.getScriptTimeZone()
  }
}

function parseSegmentTime_(dateStr, hour, minute) {
  var h = Number(hour)
  var m = normalizeMinute_(minute)
  if (isNaN(h) || h < 0) h = 0
  var tz = scriptTimeZone_()
  if (h >= 24) {
    var next = Utilities.parseDate(
      dateStr + ' 00:00:00',
      tz,
      'yyyy-MM-dd HH:mm:ss',
    )
    return new Date(next.getTime() + 24 * 60 * 60 * 1000)
  }
  if (h > 23) h = 23
  var hh = (h < 10 ? '0' : '') + h
  var mm = (m < 10 ? '0' : '') + m
  return Utilities.parseDate(
    dateStr + ' ' + hh + ':' + mm + ':00',
    tz,
    'yyyy-MM-dd HH:mm:ss',
  )
}

function formatDate_(value) {
  if (value === '' || value === null || value === undefined) return ''
  if (
    Object.prototype.toString.call(value) === '[object Date]' &&
    !isNaN(value.getTime())
  ) {
    return Utilities.formatDate(value, scriptTimeZone_(), 'yyyy-MM-dd')
  }
  var s = String(value).trim()
  var iso = s.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3]
  var us = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (us) {
    return (
      us[3] +
      '-' +
      ('0' + us[1]).slice(-2) +
      '-' +
      ('0' + us[2]).slice(-2)
    )
  }
  return s
}

/** Run once from the Apps Script editor to grant Calendar permission. */
function authorizeCalendar() {
  var name = CalendarApp.getDefaultCalendar().getName()
  Logger.log('Calendar authorized: ' + name)
}

/**
 * Run from Apps Script editor to push current sheet tasks into Google Calendar.
 * View → Logs to see created/updated counts.
 */
function forceSyncCalendarFromSheet() {
  authorizeCalendar()
  var result = syncCalendar_(loadState_())
  Logger.log(JSON.stringify(result))
  return result
}

function taskHasValidDate_(task) {
  var segs = task.segments || []
  for (var i = 0; i < segs.length; i++) {
    var d = formatDate_(segs[i].date)
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return true
  }
  var legacy = formatDate_(task.date)
  return Boolean(legacy && /^\d{4}-\d{2}-\d{2}$/.test(legacy))
}

/**
 * Delete tasks that claim a schedule but have no valid date.
 * Unscheduled backlog tasks (empty segments) are kept.
 * Also removes their Segments, Dependencies, and CalendarMap rows.
 * Runnable from the Apps Script editor, or via Flowboard Cloud sync.
 */
function deleteInvalidTasks() {
  var result = deleteInvalidTasks_()
  Logger.log(JSON.stringify(result))
  return result
}

function taskIsCorruptSchedule_(task) {
  var segs = task.segments || []
  // Empty segments = intentional backlog — not corrupt.
  if (!segs.length && (task.date === undefined || task.date === null || task.date === '')) {
    return false
  }
  return !taskHasValidDate_(task)
}

function deleteInvalidTasks_() {
  ensureAll_()
  var state = loadState_()
  var keepTasks = []
  var removed = []
  var removedIds = {}

  for (var t = 0; t < state.tasks.length; t++) {
    var task = state.tasks[t]
    if (!taskIsCorruptSchedule_(task)) {
      keepTasks.push(task)
    } else {
      removed.push({ id: task.id, title: task.title || '(untitled)' })
      removedIds[String(task.id)] = true
    }
  }

  if (!removed.length) {
    return { ok: true, deleted: 0, titles: [], message: 'No invalid tasks found.' }
  }

  var keepDeps = []
  for (var d = 0; d < state.dependencies.length; d++) {
    var dep = state.dependencies[d]
    if (removedIds[dep.fromId] || removedIds[dep.toId]) continue
    keepDeps.push(dep)
  }

  var nextState = {
    projects: state.projects,
    flows: state.flows,
    tasks: keepTasks,
    dependencies: keepDeps,
  }
  var saved = saveState_(nextState)
  if (!saved.ok) return saved

  // Drop CalendarMap rows for removed tasks (leave orphan calendar events;
  // user can delete those manually or run cleanup later)
  var mapSheet = ss_().getSheetByName(SHEET_CAL)
  var mapRows = readObjects_(mapSheet).filter(function (row) {
    return !removedIds[String(row.taskId || '')]
  })
  writeObjects_(mapSheet, ['mapKey', 'taskId', 'date', 'eventId'], mapRows)

  setMeta_('updatedAt', new Date().toISOString())

  return {
    ok: true,
    deleted: removed.length,
    titles: removed.map(function (r) { return r.title }),
    message: 'Deleted ' + removed.length + ' task(s) with no valid date.',
  }
}

/** Run once from the Apps Script editor to grant Google Tasks permission. */
function authorizeGoogleTasks() {
  if (typeof Tasks === 'undefined') {
    throw new Error(
      'Enable Tasks advanced service: Editor → Services (+) → Google Tasks API.',
    )
  }
  var lists = Tasks.Tasklists.list({ maxResults: 1 })
  var n = (lists.items && lists.items.length) || 0
  var email = Session.getEffectiveUser().getEmail()
  Logger.log('Google Tasks authorized for ' + email + ' (' + n + ' list sample)')
  return { ok: true, email: email }
}

/** Install a 10-minute trigger that imports new Google Tasks into the backlog. */
function installGoogleTasksTrigger() {
  authorizeGoogleTasks()
  var triggers = ScriptApp.getProjectTriggers()
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'importGoogleTasksNow') {
      ScriptApp.deleteTrigger(triggers[i])
    }
  }
  ScriptApp.newTrigger('importGoogleTasksNow')
    .timeBased()
    .everyMinutes(10)
    .create()
  Logger.log('Installed importGoogleTasksNow every 10 minutes')
  return { ok: true }
}

/** Editor / trigger entry point. */
function importGoogleTasksNow() {
  var result = importGoogleTasks_()
  Logger.log(JSON.stringify(result))
  return result
}

function accountEmail_() {
  try {
    var email = Session.getEffectiveUser().getEmail()
    if (email) return String(email).toLowerCase()
  } catch (err) {
    /* fall through */
  }
  return 'unknown'
}

function accountTag_(email) {
  var local = String(email || 'unknown').split('@')[0]
  var tag = local.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24)
  return tag || 'account'
}

function googleTasksMapKey_(accountEmail, googleTaskId) {
  return String(accountEmail) + '|' + String(googleTaskId)
}

function readGoogleTasksMap_() {
  ensureAll_()
  var rows = readObjects_(ss_().getSheetByName(SHEET_GTMAP))
  var map = {}
  for (var i = 0; i < rows.length; i++) {
    var row = normalizeGtMapRow_(rows[i])
    if (!row.accountEmail || !row.googleTaskId) continue
    // Any map row blocks reimport, including deleted tombstones (no flowboard task).
    map[googleTasksMapKey_(row.accountEmail, row.googleTaskId)] = row
  }
  return map
}

function appendGoogleTasksMapRow_(row) {
  ensureGoogleTasksMapColumns_()
  var sheet = ss_().getSheetByName(SHEET_GTMAP)
  var headers = sheetHeaders_(sheet)
  if (!headers.length) {
    headers = GTMAP_HEADERS.slice()
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    sheet.setFrozenRows(1)
  }
  var normalized = normalizeGtMapRow_(row)
  sheet.appendRow(
    headers.map(function (h) {
      var v = normalized[h]
      return v === undefined || v === null ? '' : v
    }),
  )
}

function ensureDefaultProject_() {
  var sheet = ss_().getSheetByName(SHEET_PROJECTS)
  var projects = readObjects_(sheet)
  if (projects.length) {
    return {
      id: String(projects[0].id),
      name: String(projects[0].name || 'Inbox'),
      color: String(projects[0].color || '#1d4e89'),
    }
  }
  var project = {
    id: Utilities.getUuid(),
    name: 'Inbox',
    color: '#1d4e89',
  }
  sheet.appendRow([project.id, project.name, project.color])
  return project
}

function appendTaskBacklogRow_(task) {
  var sheet = ss_().getSheetByName(SHEET_TASKS)
  var headers = sheetHeaders_(sheet)
  if (!headers.length) {
    headers = [
      'id',
      'title',
      'notes',
      'projectId',
      'labels',
      'priority',
      'date',
      'hour',
      'minute',
      'endHour',
      'endMinute',
    ]
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    sheet.setFrozenRows(1)
  }
  var row = headers.map(function (h) {
    if (h === 'id') return task.id
    if (h === 'title') return task.title
    if (h === 'notes') return task.notes || ''
    if (h === 'projectId') return task.projectId
    if (h === 'labels') return formatLabelsCell_(task.labels)
    if (h === 'priority') return normalizePriority_(task.priority)
    return ''
  })
  sheet.appendRow(row)
}

function mergeLabelCatalogNames_(names) {
  var catalogRaw = getMeta_('labelCatalog')
  var catalog = []
  if (catalogRaw) {
    try {
      var parsed = JSON.parse(catalogRaw)
      if (Array.isArray(parsed)) catalog = parsed
    } catch (err) {
      /* ignore */
    }
  }
  for (var i = 0; i < names.length; i++) {
    var name = String(names[i] || '').trim()
    if (!name) continue
    var found = false
    for (var c = 0; c < catalog.length; c++) {
      var entry = catalog[c]
      var en =
        typeof entry === 'string'
          ? entry
          : String((entry && entry.name) || '')
      if (en.toLowerCase() === name.toLowerCase()) {
        found = true
        break
      }
    }
    if (!found) catalog.push({ name: name, description: '' })
  }
  setMeta_('labelCatalog', JSON.stringify(catalog))
}

/**
 * Import incomplete Google Tasks for the script runner into Flowboard backlog.
 * Idempotent via GoogleTasksMap (accountEmail|googleTaskId), including
 * status=deleted tombstones after the Flowboard task was removed.
 */
function importGoogleTasks_() {
  if (typeof Tasks === 'undefined') {
    return {
      ok: false,
      error:
        'Tasks advanced service not enabled. In Apps Script: Services (+) → Google Tasks API, then run authorizeGoogleTasks.',
    }
  }

  var lock = LockService.getScriptLock()
  if (!lock.tryLock(30000)) {
    return { ok: false, error: 'Could not lock script for import; try again.' }
  }

  try {
    ensureAll_()
    var accountEmail = accountEmail_()
    var tag = accountTag_(accountEmail)
    var project = ensureDefaultProject_()
    var existingMap = readGoogleTasksMap_()
    var imported = 0
    var skipped = 0
    var labelNames = ['google-tasks', tag]

    var listResp = Tasks.Tasklists.list({ maxResults: 100 })
    var lists = listResp.items || []
    var listPageToken = listResp.nextPageToken
    while (listPageToken) {
      var moreLists = Tasks.Tasklists.list({
        maxResults: 100,
        pageToken: listPageToken,
      })
      lists = lists.concat(moreLists.items || [])
      listPageToken = moreLists.nextPageToken
    }

    for (var li = 0; li < lists.length; li++) {
      var list = lists[li]
      var listId = list.id
      if (!listId) continue
      var pageToken = null
      do {
        var opts = {
          showCompleted: false,
          showDeleted: false,
          showHidden: false,
          maxResults: 100,
        }
        if (pageToken) opts.pageToken = pageToken
        var taskResp = Tasks.Tasks.list(listId, opts)
        var items = taskResp.items || []
        for (var ti = 0; ti < items.length; ti++) {
          var gt = items[ti]
          var gid = String(gt.id || '')
          if (!gid) continue
          if (gt.status === 'completed') {
            skipped++
            continue
          }
          var title = String(gt.title || '').trim()
          if (!title) {
            skipped++
            continue
          }
          var key = googleTasksMapKey_(accountEmail, gid)
          if (existingMap[key]) {
            skipped++
            continue
          }
          var flowId = Utilities.getUuid()
          var notes = String(gt.notes || '').trim()
          var sourceLine =
            'Imported from Google Tasks (' +
            accountEmail +
            ')' +
            (list.title ? ' · ' + list.title : '')
          appendTaskBacklogRow_({
            id: flowId,
            title: title,
            notes: notes ? notes + '\n\n' + sourceLine : sourceLine,
            projectId: project.id,
            labels: labelNames.slice(),
            priority: 'q2',
          })
          var mapRow = {
            accountEmail: accountEmail,
            googleTaskId: gid,
            flowboardTaskId: flowId,
            importedAt: new Date().toISOString(),
            status: 'imported',
            deletedAt: '',
          }
          // Write map immediately so a later crash still blocks reimport / tombstone.
          appendGoogleTasksMapRow_(mapRow)
          existingMap[key] = normalizeGtMapRow_(mapRow)
          imported++
        }
        pageToken = taskResp.nextPageToken
      } while (pageToken)
    }

    if (imported > 0) {
      mergeLabelCatalogNames_(labelNames)
      setMeta_('updatedAt', new Date().toISOString())
    }

    return {
      ok: true,
      imported: imported,
      skipped: skipped,
      accountEmail: accountEmail,
      message:
        imported > 0
          ? 'Imported ' +
            imported +
            ' Google Task(s) from ' +
            accountEmail +
            ' into backlog.'
          : 'No new Google Tasks to import for ' + accountEmail + '.',
    }
  } catch (err) {
    return {
      ok: false,
      error: String(err && err.message ? err.message : err),
    }
  } finally {
    lock.releaseLock()
  }
}

/**
 * One-time cleanup: delete duplicate Flowboard events, keep one per task|date.
 * Run from the Apps Script editor if your calendar already has duplicates.
 */
function cleanupDuplicateFlowboardEvents() {
  var cal = CalendarApp.getDefaultCalendar()
  var start = new Date()
  start.setMonth(start.getMonth() - 6)
  var end = new Date()
  end.setMonth(end.getMonth() + 6)
  var events = cal.getEvents(start, end)
  var byKey = {}
  var removed = 0

  for (var i = 0; i < events.length; i++) {
    var desc = events[i].getDescription() || ''
    var matchDated = desc.match(/Flowboard task:\s*(\S+)\s*\|\s*date:\s*(\d{4}-\d{2}-\d{2})/)
    var matchLegacy = desc.match(/Flowboard task:\s*(\S+)/)
    var key = null
    if (matchDated) key = matchDated[1] + '|' + matchDated[2]
    else if (matchLegacy) key = matchLegacy[1] + '|legacy'
    if (!key) continue
    if (!byKey[key]) {
      byKey[key] = events[i]
      continue
    }
    events[i].deleteEvent()
    removed++
  }

  Logger.log('Removed ' + removed + ' duplicate Flowboard events')
  return removed
}
