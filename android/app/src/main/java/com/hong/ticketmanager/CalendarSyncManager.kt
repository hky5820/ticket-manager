package com.hong.ticketmanager

import android.Manifest
import android.content.ContentProviderOperation
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.CalendarContract
import androidx.core.content.ContextCompat
import androidx.work.*
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class CalendarSyncManager(private val context: Context) {
    private val prefs = context.getSharedPreferences("calendar_sync", Context.MODE_PRIVATE)
    private val resolver = context.contentResolver
    companion object {
        private const val ACCOUNT = "ticket-manager-local"
        private const val NAME = "ticket-manager"
        private const val JOB = "ticket-calendar-refresh"
        private val lock = Any()
        val executor = Executors.newSingleThreadExecutor()
        @Volatile var foreground = false
        val permissions = arrayOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR)
    }
    fun hasPermission() = permissions.all { ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED }
    fun status() = JSONObject().put("supported", true).put("enabled", prefs.getBoolean("enabled", false))
        .put("permission", hasPermission()).put("lastSync", prefs.getLong("lastSync", 0))
        .put("count", prefs.getInt("count", 0)).put("error", prefs.getString("error", ""))
        .put("durationMinutes", prefs.getInt("duration", 120)).put("background", prefs.getBoolean("cloud", false))

    fun enable() {
        require(hasPermission()) { "캘린더 권한이 필요합니다" }
        prefs.edit().putBoolean("enabled", true).putString("error", "").apply()
        val request = PeriodicWorkRequestBuilder<CalendarSyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(JOB, ExistingPeriodicWorkPolicy.UPDATE, request)
    }
    fun disable() = synchronized(lock) {
        prefs.edit().putBoolean("enabled", false).apply()
        WorkManager.getInstance(context).cancelUniqueWork(JOB)
        // Existing events remain; disabling synchronization is not a deletion request.
    }
    fun duration(minutes: Int) { require(minutes in listOf(60, 120, 180, 240)); prefs.edit().putInt("duration", minutes).apply() }
    fun recordError(message: String) { prefs.edit().putString("error", message.take(180)).apply() }

    fun accept(payload: JSONObject) = synchronized(lock) {
        if (!prefs.getBoolean("enabled", false)) return@synchronized
        try {
            require(hasPermission()) { "설정에서 캘린더 권한을 허용하세요" }
            val cfg = payload.optJSONObject("source")
            // Native background fetch only uses the app's existing public Supabase project.
            val cloud = cfg?.optString("url") == "https://ydqabdlwzseommowiupw.supabase.co"
                && cfg.optString("key").startsWith("sb_publishable_")
            prefs.edit().putBoolean("dirty", payload.optBoolean("dirty"))
                .putBoolean("cloud", cloud).putLong("revision", prefs.getLong("revision", 0) + 1)
                .apply()
            if (cloud) prefs.edit().putString("key", cfg!!.getString("key")).apply()
            reconcile(payload.getJSONArray("tickets"), payload.optBoolean("allowDelete"),
                payload.optJSONArray("deleted") ?: JSONArray())
        } catch (e: Exception) { recordError(e.message ?: "캘린더 반영 실패") }
    }

    private fun ownedCalendar(): Long {
        resolver.query(CalendarContract.Calendars.CONTENT_URI, arrayOf(CalendarContract.Calendars._ID), "${CalendarContract.Calendars.ACCOUNT_NAME}=? AND ${CalendarContract.Calendars.ACCOUNT_TYPE}=? AND ${CalendarContract.Calendars.NAME}=?",
            arrayOf(ACCOUNT, CalendarContract.ACCOUNT_TYPE_LOCAL, NAME), null)?.use { if (it.moveToFirst()) return it.getLong(0) }
        val values = ContentValues().apply {
            put(CalendarContract.Calendars.ACCOUNT_NAME, ACCOUNT); put(CalendarContract.Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL)
            put(CalendarContract.Calendars.NAME, NAME); put(CalendarContract.Calendars.CALENDAR_DISPLAY_NAME, "티켓함"); put(CalendarContract.Calendars.OWNER_ACCOUNT, ACCOUNT)
            put(CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL, CalendarContract.Calendars.CAL_ACCESS_OWNER); put(CalendarContract.Calendars.CALENDAR_COLOR, 0xff2463db.toInt())
            put(CalendarContract.Calendars.VISIBLE, 1); put(CalendarContract.Calendars.SYNC_EVENTS, 1); put(CalendarContract.Calendars.CALENDAR_TIME_ZONE, "Asia/Seoul")
            put(CalendarContract.Calendars.ALLOWED_REMINDERS, "1"); put(CalendarContract.Calendars.ALLOWED_AVAILABILITY, "0,1"); put(CalendarContract.Calendars.ALLOWED_ATTENDEE_TYPES, "0")
        }
        val uri = CalendarContract.Calendars.CONTENT_URI.buildUpon().appendQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER, "true")
            .appendQueryParameter(CalendarContract.Calendars.ACCOUNT_NAME, ACCOUNT).appendQueryParameter(CalendarContract.Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL).build()
        return ContentUris.parseId(requireNotNull(resolver.insert(uri, values)))
    }

    private data class Existing(val id: Long, val key: String, val start: Long, val allDay: Boolean,
        val title: String, val location: String, val description: String, val end: Long)

    private fun reconcile(rows: JSONArray, allowDelete: Boolean, deleted: JSONArray) {
        require(rows.length() <= 2000) { "한 번에 연동할 수 있는 티켓 수를 초과했습니다" }
        val known = mutableSetOf<String>(); val desired = linkedMapOf<String, CalendarTicket>()
        val duration = prefs.getInt("duration", 120)
        // Parse all records BEFORE any provider mutation. A malformed snapshot cannot erase events.
        for (i in 0 until rows.length()) {
            val row = rows.getJSONObject(i); val key = row.get("id").toString()
            require(known.add(key)) { "중복된 티켓 ID가 있어 연동을 중단했습니다" }
            CalendarTicket.from(row, duration)?.let { desired[key] = it }
        }
        val removed = (0 until deleted.length()).map { deleted.getString(it) }.toSet()
        val today = LocalDate.now(CalendarTicket.zone)
        fun upcoming(start: Long, allDay: Boolean) = start >= today.atStartOfDay()
            .atZone(if (allDay) java.time.ZoneOffset.UTC else CalendarTicket.zone).toInstant().toEpochMilli()
        val calendarId = ownedCalendar()
        val existing = mutableListOf<Existing>()
        resolver.query(CalendarContract.Events.CONTENT_URI, arrayOf(CalendarContract.Events._ID, CalendarContract.Events.CUSTOM_APP_URI, CalendarContract.Events.DTSTART, CalendarContract.Events.ALL_DAY, CalendarContract.Events.TITLE,
            CalendarContract.Events.EVENT_LOCATION, CalendarContract.Events.DESCRIPTION, CalendarContract.Events.DTEND), "${CalendarContract.Events.CALENDAR_ID}=? AND ${CalendarContract.Events.CUSTOM_APP_PACKAGE}=? AND ${CalendarContract.Events.DELETED}=0",
            arrayOf(calendarId.toString(), context.packageName), null)?.use { cursor ->
            while (cursor.moveToNext()) {
                val uri = Uri.parse(cursor.getString(1) ?: "")
                if (uri.scheme != "ticketmanager" || uri.host != "ticket") continue
                existing += Existing(cursor.getLong(0), uri.lastPathSegment ?: continue, cursor.getLong(2), cursor.getInt(3) == 1,
                    cursor.getString(4) ?: "", cursor.getString(5) ?: "", cursor.getString(6) ?: "", cursor.getLong(7))
            }
        }
        val operations = arrayListOf<ContentProviderOperation>()
        val byKey = existing.groupBy { it.key }
        var count = 0
        desired.values.forEach { ticket ->
            val old = byKey[ticket.key]?.firstOrNull()
            if (old == null && !upcoming(ticket.start, ticket.allDay)) return@forEach
            if (upcoming(ticket.start, ticket.allDay)) count++
            val values = ContentValues().apply {
                put(CalendarContract.Events.CALENDAR_ID, calendarId); put(CalendarContract.Events.TITLE, ticket.title); put(CalendarContract.Events.EVENT_LOCATION, ticket.location)
                put(CalendarContract.Events.DESCRIPTION, ticket.description); put(CalendarContract.Events.DTSTART, ticket.start); put(CalendarContract.Events.DTEND, ticket.end)
                put(CalendarContract.Events.ALL_DAY, if (ticket.allDay) 1 else 0); put(CalendarContract.Events.EVENT_TIMEZONE, if (ticket.allDay) "UTC" else "Asia/Seoul")
                put(CalendarContract.Events.CUSTOM_APP_PACKAGE, context.packageName)
                put(CalendarContract.Events.CUSTOM_APP_URI, Uri.Builder().scheme("ticketmanager").authority("ticket").appendPath(ticket.key).build().toString())
            }
            if (old == null) operations += ContentProviderOperation.newInsert(CalendarContract.Events.CONTENT_URI).withValues(values).build()
            else if (old.title != ticket.title || old.location != ticket.location || old.description != ticket.description ||
                old.start != ticket.start || old.end != ticket.end || old.allDay != ticket.allDay) {
                operations += ContentProviderOperation.newUpdate(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, old.id)).withValues(values).build()
            }
        }
        existing.forEach { old ->
            val duplicate = byKey[old.key]?.firstOrNull()?.id != old.id
            val inactive = old.key !in desired && (old.key in known || old.key in removed || (allowDelete && upcoming(old.start, old.allDay)))
            if (duplicate || inactive) operations += ContentProviderOperation.newDelete(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, old.id)).build()
        }
        // One atomic batch: provider IDs and custom-app markers survive a process crash without a separate mapping write.
        if (operations.isNotEmpty()) resolver.applyBatch(CalendarContract.AUTHORITY, operations)
        prefs.edit().putLong("lastSync", System.currentTimeMillis()).putInt("count", count).putString("error", "").apply()
    }

    fun refreshInBackground(): Boolean {
        val stamp: Long; val key: String
        synchronized(lock) {
            if (!prefs.getBoolean("enabled", false) || !hasPermission() || foreground ||
                prefs.getBoolean("dirty", false) || !prefs.getBoolean("cloud", false)) return true
            stamp = prefs.getLong("revision", 0); key = prefs.getString("key", "") ?: ""
        }
        try {
            val connection = URL("https://ydqabdlwzseommowiupw.supabase.co/rest/v1/tickets?select=id,name,vendor,show_date,qty,seats&order=id.asc").openConnection() as HttpURLConnection
            val rows: JSONArray
            try {
                connection.connectTimeout = 15000; connection.readTimeout = 20000
                connection.setRequestProperty("apikey", key); connection.setRequestProperty("Authorization", "Bearer $key")
                connection.setRequestProperty("Prefer", "count=exact"); connection.setRequestProperty("Range", "0-999")
                require(connection.responseCode in 200..299) { "서버 연결 실패: ${connection.responseCode}" }
                val total = connection.getHeaderField("Content-Range")?.substringAfter('/')?.toIntOrNull()
                rows = JSONArray(connection.inputStream.bufferedReader().use { it.readText() })
                require(total != null && rows.length() == total) { "전체 티켓을 받지 못해 기존 일정을 유지합니다" }
            } finally { connection.disconnect() }
            synchronized(lock) {
                if (!prefs.getBoolean("enabled", false) || !hasPermission() || foreground ||
                    prefs.getBoolean("dirty", false) || stamp != prefs.getLong("revision", 0)) return true
                reconcile(rows, true, JSONArray())
            }
            return true
        } catch (e: Exception) { recordError(e.message ?: "백그라운드 연동 실패"); return false }
    }
}

class CalendarSyncWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result = if (CalendarSyncManager(applicationContext).refreshInBackground()) Result.success() else Result.retry()
}
