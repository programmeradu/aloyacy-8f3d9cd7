// Pick your group character: people of many looks plus neutral animals. The
// choice stays on this phone and travels with your position pings.
import { AVATAR_CHOICES, AVATAR_PRESETS, AvatarArt } from "./MemberAvatar";
import { useMyAvatar } from "./avatar-store";

export function AvatarPicker({
  seed,
  dark = false,
  onPicked,
}: {
  /** Member id (or any stable seed) for the neutral default preview. */
  seed: string;
  dark?: boolean;
  onPicked?: (id: string) => void;
}) {
  const [mine, setMine] = useMyAvatar();
  return (
    <div className={`r-avpick${dark ? " is-dark" : ""}`}>
      <p className="r-avpick-lbl">Choose your character</p>
      <div className="r-avpick-grid" role="radiogroup" aria-label="Choose your character">
        {AVATAR_CHOICES.map((id) => {
          const on = mine === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={AVATAR_PRESETS[id].label}
              className={`r-avpick-opt${on ? " is-on" : ""}`}
              onClick={() => {
                setMine(id);
                onPicked?.(id);
              }}
            >
              <AvatarArt seed={seed} size={44} choice={id} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
