/**
 * Flowboard → Google Sheets + Google Calendar backend
 *
 * Setup:
 * 1. Create a Google Sheet (or open an existing one).
 * 2. Extensions → Apps Script → paste this file.
 * 3. Deploy → New deployment → Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy the Web app URL into Flowboard → Sheets sync.
 * 5. Enable "Google Calendar" in Flowboard. On first sync, Google may ask
 *    you to authorize Calendar access for this script (run once from the
 *    Apps Script editor if the web app doesn't prompt).
 *
 * Sheets created automatically:
 *   Projects | Flows | Tasks | Segments | Dependencies | CalendarMap | Meta
 *
 * Calendar: one event per day-segment (start→end that day).
 * Multi-day tasks can have different times each day.
 */

var SHEET_PROJECTS = 'Projects'
var SHEET_FLOWS = 'Flows'
var SHEET_TASKS = 'Tasks'
var SHEET_SEGS = 'Segments'
var SHEET_DEPS = 'Dependencies'
var SHEET_CAL = 'CalendarMap'
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
    if (action === 'ping') {
      return json_({ ok: true, version: 3, features: ['sheets', 'calendar', 'cleanup'] })
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

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet()
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
  ensureSheet_(SHEET_TASKS, ['id', 'title', 'notes', 'projectId', 'labels'])
  ensureTaskLabelsColumn_()
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
  return { projects: projects, flows: flows, tasks: tasks, dependencies: dependencies }
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
    var segs = task.segments || []
    if (segs.length === 0 && task.date) {
      var fromLegacy = legacySegmentFromRow_(task)
      if (fromLegacy) segs = [fromLegacy]
    }
    // Keep prior sheet segments if the client sent a task with no schedule
    if (segs.length === 0 && existingSegsByTask[task.id]) {
      segs = existingSegsByTask[task.id]
    }
    hydrated.push({
      id: task.id,
      title: task.title,
      notes: task.notes || '',
      projectId: task.projectId,
      labels: task.labels || [],
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
 * Delete tasks that have no valid schedule date (the ones Calendar skips).
 * Also removes their Segments, Dependencies, and CalendarMap rows.
 * Runnable from the Apps Script editor, or via Flowboard Cloud sync.
 */
function deleteInvalidTasks() {
  var result = deleteInvalidTasks_()
  Logger.log(JSON.stringify(result))
  return result
}

function deleteInvalidTasks_() {
  ensureAll_()
  var state = loadState_()
  var keepTasks = []
  var removed = []
  var removedIds = {}

  for (var t = 0; t < state.tasks.length; t++) {
    var task = state.tasks[t]
    if (taskHasValidDate_(task)) {
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
