/** Optional settings that change with the activity. Difficulty fills them in; the teacher can adjust them here. */
import type {
  ActivityType,
  MapSettings,
  PictureSettings,
  ProfileSettings,
  StorySettings,
  TextSettings,
  TypeSettings,
} from "@/lib/types";
import { MAP_FEATURE_OPTIONS } from "@/lib/activityTypes";
import { Field, NumberInput } from "./FormControls";

interface Props {
  type: ActivityType;
  settings: TypeSettings[ActivityType];
  onChange: (s: TypeSettings[ActivityType]) => void;
}

export default function TypeSpecificForm({ type, settings, onChange }: Props) {
  switch (type) {
    case "picture":
      return <PictureGapForm s={settings as PictureSettings} set={onChange} />;
    case "text":
      return <TextGapForm s={settings as TextSettings} set={onChange} />;
    case "schedule":
      return null;
    case "map":
      return <MapGapForm s={settings as MapSettings} set={onChange} />;
    case "profile":
      return <ProfileGapForm s={settings as ProfileSettings} set={onChange} />;
    case "story":
      return <StoryGapForm s={settings as StorySettings} set={onChange} />;
  }
}

/** "Allow students to check answers", for the activities that have a self-check. */
function SelfCheckOption<S extends { allowSelfCheck: boolean }>({ s, set, reveals }: { s: S; set: (s: S) => void; reveals: string }) {
  const allowed = s.allowSelfCheck ?? true;
  return (
    <Field label="After the activity" hint={`Students get a “Check Answers” button. After they confirm they have finished, ${reveals}.`}>
      <label className={`checkbox ${allowed ? "checked" : ""}`}>
        <input type="checkbox" checked={allowed} onChange={() => set({ ...s, allowSelfCheck: !allowed })} />
        Allow students to check answers
      </label>
    </Field>
  );
}

const DIFFERENCE_TYPES = ["object", "color", "position", "number", "action", "clothing", "sign/text", "time"];

function PictureGapForm({ s, set }: { s: PictureSettings; set: (s: PictureSettings) => void }) {
  const toggle = (t: string) =>
    set({ ...s, differenceTypes: s.differenceTypes.includes(t) ? s.differenceTypes.filter((x) => x !== t) : [...s.differenceTypes, t] });
  return (
    <>
      <Field label="Number of differences" htmlFor="differences">
        <NumberInput id="differences" min={2} max={10} value={s.differences} onChange={(n) => set({ ...s, differences: n })} />
      </Field>
      <Field label="Kinds of difference" hint="If you choose none, the AI will pick a mix.">
        <div className="checkbox-grid">
          {DIFFERENCE_TYPES.map((t) => (
            <label key={t} className={`checkbox ${s.differenceTypes.includes(t) ? "checked" : ""}`}>
              <input type="checkbox" checked={s.differenceTypes.includes(t)} onChange={() => toggle(t)} />
              {t}
            </label>
          ))}
        </div>
      </Field>
      <SelfCheckOption s={s} set={set} reveals="they see both pictures and can open the list of differences" />
    </>
  );
}

function TextGapForm({ s, set }: { s: TextSettings; set: (s: TextSettings) => void }) {
  return (
    <Field label="Number of rows" htmlFor="itemCount" hint="With two people, 8 rows = 16 facts = about 8 questions for each student.">
      <NumberInput id="itemCount" min={3} max={15} value={s.itemCount} onChange={(n) => set({ ...s, itemCount: n })} />
    </Field>
  );
}

function MapGapForm({ s, set }: { s: MapSettings; set: (s: MapSettings) => void }) {
  return (
    <>
      <Field label="Number of places to find" htmlFor="locationCount" hint="Plus 2–4 landmarks that both students can see.">
        <NumberInput id="locationCount" min={4} max={16} value={s.locationCount} onChange={(n) => set({ ...s, locationCount: n })} />
      </Field>
      <Field
        label="Extra map features"
        hint="The environment already has its own features (a downtown has traffic lights and a subway entrance, for example). Tick anything you want added. Both students see them."
      >
        {Object.entries(MAP_FEATURE_OPTIONS).map(([group, options]) => (
          <div key={group} className="feature-group">
            <p className="feature-group-title">{group}</p>
            <div className="checkbox-grid">
              {options.map((f) => (
                <label key={f} className={`checkbox ${s.features.includes(f) ? "checked" : ""}`}>
                  <input
                    type="checkbox"
                    checked={s.features.includes(f)}
                    onChange={() => set({ ...s, features: s.features.includes(f) ? s.features.filter((x) => x !== f) : [...s.features, f] })}
                  />
                  {f}
                </label>
              ))}
            </div>
          </div>
        ))}
      </Field>
      <SelfCheckOption s={s} set={set} reveals="they see the complete map with every place named and can open the answers to their route challenges" />
    </>
  );
}

function ProfileGapForm({ s, set }: { s: ProfileSettings; set: (s: ProfileSettings) => void }) {
  const translations = s.translations ?? true;
  return (
    <>
      <Field
        label="Japanese translations"
        hint="Students can tap “日本語” to read the situation and their own information in Japanese. Offered at A1–A2, and at any level with Strong support. Never shown for their partner’s information."
      >
        <label className={`checkbox ${translations ? "checked" : ""}`}>
          <input type="checkbox" checked={translations} onChange={() => set({ ...s, translations: !translations })} />
          Offer Japanese translations
        </label>
      </Field>
      {/* Choose One: the AI feedback switch is in the main setup (components/ChoiceSetup.tsx). */}
      {s.format === "combination" && <SelfCheckOption s={s} set={set} reveals="they see all the information and can open the possible choices" />}
    </>
  );
}

function StoryGapForm({ s, set }: { s: StorySettings; set: (s: StorySettings) => void }) {
  return (
    <>
      <Field label="Number of events" htmlFor="storyEvents" hint="The first event is shown to both students; the others are shared out between them.">
        <NumberInput id="storyEvents" min={4} max={10} value={s.eventCount} onChange={(n) => set({ ...s, eventCount: n })} />
      </Field>
      <SelfCheckOption s={s} set={set} reveals="they see the whole timeline and can open the explanation" />
    </>
  );
}
