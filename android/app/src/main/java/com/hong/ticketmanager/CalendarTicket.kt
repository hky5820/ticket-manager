package com.hong.ticketmanager

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset

/** No money, private memo, or transfer recipient is copied into Calendar. */
data class CalendarTicket(val key: String, val title: String, val location: String,
    val description: String, val start: Long, val end: Long, val allDay: Boolean) {
    companion object {
        val zone: ZoneId = ZoneId.of("Asia/Seoul")
        fun from(t: JSONObject, durationMinutes: Int): CalendarTicket? {
            val id = t.get("id").toString()
            require(id.matches(Regex("[A-Za-z0-9_-]{1,100}"))) { "잘못된 티켓 ID" }
            val raw = t.opt("seats")
            val blob = if (raw is JSONObject) raw else t
            val seats = if (raw is JSONArray) raw else blob.optJSONArray("seats") ?: JSONArray()
            val qty = t.optInt("qty", 0).coerceIn(0, 1000)
            var canceled = 0; var transferred = 0
            val labels = mutableListOf<String>()
            for (i in 0 until seats.length()) {
                val seat = seats.getJSONObject(i)
                if (seat.optBoolean("x")) canceled++
                if (seat.optBoolean("t")) transferred++
                if (!seat.optBoolean("x") && !seat.optBoolean("t")) {
                    labels += listOf(seat.optString("grade"), seat.optString("floor").let { if (it.isEmpty()) "" else "${it}층" },
                        seat.optString("zone").let { if (it.isEmpty()) "" else "${it}구역" },
                        seat.optString("row").let { if (it.isEmpty()) "" else "${it}열" }, seat.optString("no"))
                        .filter { it.isNotBlank() }.joinToString(" ")
                }
            }
            val wholeTransfer = blob.optJSONObject("transfer")?.optBoolean("done") == true
            val kept = if (wholeTransfer) 0 else (qty - canceled - transferred).coerceAtLeast(0)
            val dateText = if (t.has("date") && !t.isNull("date")) t.getString("date") else if (!t.isNull("show_date")) t.optString("show_date") else ""
            if (kept == 0 || dateText.isBlank()) return null
            val date = LocalDate.parse(dateText)
            val timeText = blob.optString("time")
            val allDay = timeText.isBlank()
            val start = if (allDay) date.atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli()
                else date.atTime(LocalTime.parse(timeText)).atZone(zone).toInstant().toEpochMilli()
            val end = if (allDay) date.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli()
                else start + durationMinutes * 60_000L
            val description = buildString {
                append("예매처: ${t.optString("vendor").take(100)}\n보유: ${kept}매")
                if (labels.any { it.isNotBlank() }) append("\n좌석: ${labels.filter { it.isNotBlank() }.joinToString(" · ").take(1500)}")
                if (!allDay) append("\n종료 시각은 시작 후 ${durationMinutes}분으로 표시한 예상 시각입니다.")
                append("\n티켓함에서 변경하면 이 일정도 갱신됩니다. 예매 건별 일정입니다.")
            }
            return CalendarTicket(id, t.optString("name").ifBlank { "공연" }.take(200),
                blob.optString("venue").take(300), description, start, end, allDay)
        }
    }
}
