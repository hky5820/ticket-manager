// Official production posters, verified 2026-11-01. Preserve user-provided images.
// Date and venue boundaries prevent matching another season or touring production.
const productions = [
  {
    "name": "겨울왕국",
    "venue": "샤롯데",
    "start": "2026-08-13",
    "end": "2027-03-01",
    "src": "assets/posters/26007416.gif",
    "source": "https://nol.yanolja.com/ticket/products/26007416"
  },
  {
    "name": "스위니토드",
    "venue": "디큐브",
    "start": "2026-12-04",
    "end": "2027-05-02",
    "src": "assets/posters/26014509.gif",
    "source": "https://nol.yanolja.com/ticket/products/26014509"
  },
  {
    "name": "레베카",
    "venue": "충무",
    "start": "2026-11-24",
    "end": "2027-03-14",
    "src": "assets/posters/26013993.gif",
    "source": "https://nol.yanolja.com/ticket/products/26013993"
  },
  {
    "name": "시카고",
    "venue": "LG",
    "start": "2026-12-05",
    "end": "2027-03-14",
    "src": "assets/posters/L0000150.gif",
    "source": "https://nol.yanolja.com/ticket/products/L0000150"
  },
  {
    "name": "오페라의 유령",
    "venue": "블루스퀘어",
    "start": "2026-12-22",
    "end": "2027-02-28",
    "src": "assets/posters/26013995.gif",
    "source": "https://nol.yanolja.com/ticket/products/26013995"
  },
  {
    "name": "요네즈 켄시",
    "venue": "인스파이어",
    "start": "2027-01-14",
    "end": "2027-01-17",
    "src": "assets/posters/26015024.gif",
    "source": "https://nol.yanolja.com/ticket/products/26015024"
  }
];
export function posterFor(ticket) {
  if (ticket.poster) return ticket.poster;
  const p = productions.find(p => (ticket.name||'').includes(p.name)
    && ticket.date >= p.start && ticket.date <= p.end
    && (!ticket.venue || ticket.venue.toLowerCase().includes(p.venue.toLowerCase())));
  return p?.src || '';
}
