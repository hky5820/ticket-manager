package com.hong.ticketmanager

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class CalendarTicketTest {
    private fun row(extra: String = "") = JSONObject("""{"id":"abc-123","name":"공연","qty":2,"date":"2027-02-03","time":"19:30","seats":[]$extra}""")
    @Test fun seoulTimeAndEstimatedEnd() {
        val event = CalendarTicket.from(row(), 120)!!
        assertEquals(Instant.parse("2027-02-03T10:30:00Z").toEpochMilli(), event.start)
        assertEquals(7200000L, event.end-event.start)
        assertFalse(event.allDay)
    }
    @Test fun allDayUsesUtcAndExclusiveEnd() {
        val event = CalendarTicket.from(row().put("time", ""), 120)!!
        assertTrue(event.allDay)
        assertEquals(Instant.parse("2027-02-03T00:00:00Z").toEpochMilli(), event.start)
        assertEquals(86400000L, event.end-event.start)
    }
    @Test fun excludesFullyTransferredAndCanceled() {
        assertNull(CalendarTicket.from(row(",\"transfer\":{\"done\":true}"), 120))
        assertNull(CalendarTicket.from(row().put("seats", org.json.JSONArray("[{\"x\":true},{\"t\":true}]")), 120))
    }
    @Test fun serverBlobMatchesWebAndRedactsPrivateData() {
        val web=row().put("memo","private memo").put("price",123456).put("venue","공연장")
        val server=JSONObject().put("id","abc-123").put("name","공연").put("qty",2).put("show_date","2027-02-03")
            .put("seats",JSONObject("""{"seats":[],"time":"19:30","venue":"공연장"}"""))
        assertEquals(CalendarTicket.from(web,120),CalendarTicket.from(server,120))
        assertFalse(CalendarTicket.from(web,120)!!.description.contains("private"))
    }
    @Test fun missingDateIsNotAnEvent() { assertNull(CalendarTicket.from(row().removeDate(),120)) }
    private fun JSONObject.removeDate(): JSONObject { remove("date");put("show_date",JSONObject.NULL);return this }
    @Test(expected=Exception::class) fun malformedDateStopsSnapshot() { CalendarTicket.from(row().put("date","2027-02-30"),120) }
}
