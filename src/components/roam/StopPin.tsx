// Bus-stop marker for Roam maps: a small opaque stop sign on a post, clearly a
// place (not a vehicle). Selected stop turns yellow, grows and shows its line
// count; buses due soon show as a quiet dot on the sign.
type Props = {
  on?: boolean;
  label: string;
  /** Distinct lines serving the stop (shown on the selected stop only). */
  lines?: number;
  /** Buses due in the next 20 min. */
  due?: number;
  onClick?: () => void;
};

export function StopPin({ on = false, label, lines = 0, due = 0, onClick }: Props) {
  return (
    <button
      type="button"
      className={`r-stop-pin${on ? " is-on" : ""}`}
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
    >
      <span className="r-stop-sign">
        <svg viewBox="0 0 16 16" width="100%" height="100%" aria-hidden="true">
          <rect
            x="3"
            y="2.6"
            width="10"
            height="8.6"
            rx="2.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path d="M3 7.2h10" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="5.6" cy="9.3" r=".9" fill="currentColor" />
          <circle cx="10.4" cy="9.3" r=".9" fill="currentColor" />
          <path
            d="M5 11.2v1.6M11 11.2v1.6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        {due > 0 && !on ? <span className="r-stop-due" aria-hidden="true" /> : null}
        {on && lines > 0 ? (
          <span className="r-stop-count" aria-hidden="true">
            {lines}
          </span>
        ) : null}
      </span>
      <span className="r-stop-post" aria-hidden="true" />
      <span className="r-stop-foot" aria-hidden="true" />
    </button>
  );
}
