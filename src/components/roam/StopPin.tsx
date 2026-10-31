// Bus-stop marker for Roam maps: the signpost pin. An ink teardrop carrying a
// white stop sign on a post, its tip on the exact kerb, so a stop never reads
// as a vehicle next to the yellow buses. Selected grows into a yellow pin with
// an ink sign; buses due soon add a small yellow dot.
type Props = {
  on?: boolean;
  label: string;
  /** Buses due in the next 20 min. */
  due?: number;
  onClick?: () => void;
};

export function StopPin({ on = false, label, due = 0, onClick }: Props) {
  return (
    <button
      type="button"
      className={`r-stop-pin${on ? " is-on" : ""}`}
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
    >
      <svg className="r-stop-svg" viewBox="0 0 28 36" aria-hidden="true">
        <path
          className="r-sp-body"
          d="M14 35c-1-3.5-12-12-12-21a12 12 0 0 1 24 0c0 9-11 17.5-12 21z"
        />
        <g transform="translate(5.5 4.2) scale(.95)">
          <rect className="r-sp-sign" x="4" y="1.5" width="10" height="8" rx="2.2" />
          <rect className="r-sp-sign" x="8.1" y="9" width="1.8" height="7" rx=".9" />
          <rect className="r-sp-bar" x="6.2" y="4.6" width="5.6" height="1.8" rx=".9" />
        </g>
      </svg>
      {due > 0 && !on ? <span className="r-stop-due" aria-hidden="true" /> : null}
    </button>
  );
}
