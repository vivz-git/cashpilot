/**
 * Illustrative product preview built in HTML with sample data.
 *
 * CashPilot's app UI is not in this repository yet. When it is, replace this
 * component with a screenshot (next/image) of the real "Needs attention" view.
 */

type Row = {
  client: string;
  invoice: string;
  amount: string;
  overdue: number;
  situation: string;
  tone: "risk" | "dispute" | "quiet" | "blocked" | "watch";
};

const rows: Row[] = [
  {
    client: "Marlow & Finch",
    invoice: "INV-1042",
    amount: "$18,400",
    overdue: 47,
    situation: "Promised payment missed",
    tone: "risk",
  },
  {
    client: "Kestrel Outdoor",
    invoice: "INV-1038",
    amount: "$9,750",
    overdue: 32,
    situation: "Disputes phase 2 hours",
    tone: "dispute",
  },
  {
    client: "Alder Dental Group",
    invoice: "INV-1051",
    amount: "$4,200",
    overdue: 21,
    situation: "No reply to 2 reminders",
    tone: "quiet",
  },
  {
    client: "Brightline Logistics",
    invoice: "INV-1047",
    amount: "$12,000",
    overdue: 15,
    situation: "Waiting on PO number",
    tone: "blocked",
  },
  {
    client: "Tidewater Foods",
    invoice: "INV-1055",
    amount: "$2,300",
    overdue: 6,
    situation: "Usually pays ~10 days late",
    tone: "watch",
  },
];

export function ProductPreview() {
  return (
    <div className="app">
      <div className="app-bar">
        <span className="app-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="app-workspace">Studio North · Receivables</span>
      </div>

      <div className="app-body">
        <div className="app-queue">
          <div className="app-queue-head">
            <span className="app-title">Needs attention</span>
            <span className="app-meta">5 invoices · $46,650 overdue</span>
          </div>
          <table className="app-table">
            <thead>
              <tr>
                <th scope="col">Client</th>
                <th scope="col" className="num">Amount</th>
                <th scope="col" className="num">Overdue</th>
                <th scope="col" className="hide-sm">Situation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.invoice} className={i === 0 ? "is-selected" : undefined}>
                  <td>
                    <span className="app-client">{row.client}</span>
                    <span className="app-invoice">{row.invoice}</span>
                    <span className={`tag tag-${row.tone} show-sm`}>{row.situation}</span>
                  </td>
                  <td className="num">{row.amount}</td>
                  <td className="num">{row.overdue}d</td>
                  <td className="hide-sm">
                    <span className={`tag tag-${row.tone}`}>{row.situation}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="app-detail">
          <div className="app-detail-head">
            <span className="app-title">Marlow &amp; Finch · INV-1042</span>
            <span className="tag tag-risk">Promised payment missed</span>
          </div>

          <div className="app-section">
            <span className="app-label">What&rsquo;s happening</span>
            <p>
              Finance promised payment by 12 Sep after your second reminder.
              Nothing received since. They&rsquo;ve paid all 6 previous invoices,
              on average 9 days late.
            </p>
          </div>

          <div className="app-section">
            <span className="app-label">Suggested approach</span>
            <p>Friendly check-in that references the promise. No escalation yet.</p>
          </div>

          <div className="app-draft">
            <div className="app-draft-meta">
              <span>To: sarah@marlowfinch.example</span>
              <span>Subject: INV-1042 — quick check-in</span>
            </div>
            <div className="app-draft-body">
              <p>Hi Sarah,</p>
              <p>
                Hope you&rsquo;re well. Just checking in on{" "}
                <span className="nowrap">INV-1042</span> ($18,400). You
                mentioned it was scheduled for 12 September, and I haven&rsquo;t
                seen it come through yet.
              </p>
              <p>
                If it&rsquo;s been held up, no problem. Let me know if a copy of
                the invoice or anything else would help.
              </p>
              <p>Thanks,<br />Alex</p>
            </div>
          </div>

          <div className="app-actions" aria-hidden="true">
            <span className="app-btn">Skip</span>
            <span className="app-btn">Edit</span>
            <span className="app-btn app-btn-primary">Approve &amp; send</span>
          </div>
        </div>
      </div>
    </div>
  );
}
