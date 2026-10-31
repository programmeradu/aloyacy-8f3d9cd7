// Credits for the Greek word of the day recordings: real people from
// Wikimedia Commons, Mozilla Common Voice (CC0) and the public-domain FSI Greek Basic Course. CC BY-SA and CC BY need the author, licence and source
// named, so every clip is listed here with a link to its original file.
// Words without a recording use the phone's built-in voice and need no credit.
import credits from "@/data/greek-voice-credits.json";
import { useRoamI18n } from "@/lib/roam-i18n";

type Credit = {
  slug: string;
  word: string;
  file: string;
  author: string;
  licence: string;
  licenceUrl: string;
  source: string;
  changes: string;
};

export function GreekVoiceCredits() {
  const { r } = useRoamI18n();
  return (
    <div>
      <p className="r-lbl mb-4" style={{ lineHeight: 1.45 }}>
        {r("me.creditsIntro")}
      </p>
      <div className="r-me-group" data-credits="greek-voices">
        {(credits as Credit[]).map((c) => (
          <div key={c.slug} className="r-row r-me-row" style={{ alignItems: "flex-start", paddingTop: 12, paddingBottom: 12 }}>
            <span className="flex-1 min-w-0 text-left">
              <span className="block text-[16px] font-medium leading-tight" lang="el">
                {c.word}
              </span>
              <span className="r-lbl block mt-1" style={{ wordBreak: "break-word" }}>
                {r("me.creditsBy")} {c.author} ·{" "}
                <a href={c.licenceUrl} target="_blank" rel="noopener noreferrer license" className="underline">
                  {c.licence}
                </a>
              </span>
              <a
                href={c.source}
                target="_blank"
                rel="noopener noreferrer"
                className="r-lbl block mt-0.5 underline"
                style={{ wordBreak: "break-word" }}
              >
                {c.file}
              </a>
            </span>
          </div>
        ))}
      </div>
      <p className="r-lbl mt-4" style={{ lineHeight: 1.45 }}>
        {r("me.creditsChanges")}
      </p>
    </div>
  );
}
