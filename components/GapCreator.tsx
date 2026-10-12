"use client";

import { useEffect, useRef, useState } from "react";
import { applyDifficulty, CHOICE_SCENARIOS, DEFAULT_DIFFICULTY, DEFAULT_TYPE_SETTINGS, defaultExpressions, TYPE_INFO } from "@/lib/activityTypes";
import { pairsForVersion, versionCountFor } from "@/lib/gapLogic";
import { ApiError, postJson } from "@/lib/postJson";
import { DATA_FORMAT } from "@/lib/types";
import type { Activity, ActivitySet, ActivityType, CommonSettings, Difficulty, GenerateRequest, TypeSettings } from "@/lib/types";
import ActivityAbout from "./ActivityAbout";
import ActivityPreview from "./ActivityPreview";
import ActivityTypeSelector from "./ActivityTypeSelector";
import DisplayErrorBoundary from "./DisplayErrorBoundary";
import ErrorBox from "./ErrorBox";
import SharePanel from "./SharePanel";
import TeacherForm from "./TeacherForm";
import TeacherGuide from "./TeacherGuide";

const DEFAULT_COMMON: CommonSettings = {
  cefr: "A2",
  topic: "",
  goal: "",
  expressions: "",
  difficulty: DEFAULT_DIFFICULTY,
  support: "Useful expressions",
  pairs: 1,
};

export default function GapCreator({ hasApiKey }: { hasApiKey: boolean }) {
  const [type, setType] = useState<ActivityType | null>(null);
  const [common, setCommon] = useState<CommonSettings>(DEFAULT_COMMON);
  const [typeSettings, setTypeSettings] = useState<TypeSettings>(DEFAULT_TYPE_SETTINGS);

  // The generated versions live only in browser memory. Viewing them never calls the AI.
  const [set, setSet] = useState<ActivitySet | null>(null);
  const [versionIndex, setVersionIndex] = useState(0);
  const [lastRequest, setLastRequest] = useState<GenerateRequest | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  /** Moves to another activity, bringing its default scenario and grammar unless the teacher wrote their own. */
  function selectType(next: ActivityType) {
    if (next === type) return;
    const info = TYPE_INFO[next];
    // Make the Best Choice has a scenario list for each of its formats.
    const listed = (t: ActivityType) => (t === "profile" ? Object.values(CHOICE_SCENARIOS).flat() : TYPE_INFO[t].scenarios);
    // Choose One starts with no scenario: it comes from the lesson topic (suggested, or chosen by the AI).
    const first = next === "profile" ? (typeSettings.profile.format === "combination" ? CHOICE_SCENARIOS.combination[0] : "") : info.scenarios[0];
    const untouchedTopic = !common.topic.trim() || (type !== null && listed(type).includes(common.topic));
    const untouchedExpressions = !common.expressions.trim() || (type !== null && common.expressions === defaultExpressions(type));
    setCommon({
      ...common,
      topic: untouchedTopic ? first : common.topic,
      expressions: untouchedExpressions ? defaultExpressions(next) : common.expressions,
    });
    setType(next);
  }

  /** Difficulty decides the activity's own settings (counts, kinds of difference, map features). */
  function changeDifficulty(difficulty: Difficulty) {
    setCommon({ ...common, difficulty });
    setTypeSettings((prev) => applyDifficulty(prev, difficulty));
  }

  async function generate(request: GenerateRequest) {
    setGenerating(true);
    setError(null);
    try {
      const { set, format } = await postJson<{ set: ActivitySet; format?: number }>("/api/generate", request);
      if (format !== DATA_FORMAT) {
        throw new ApiError("The app was updated while this page was open. Please reload the page, then generate again.", `Page format ${DATA_FORMAT}, server format ${format}.`);
      }
      setSet(set);
      setVersionIndex(0);
      setLastRequest(request);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError("Something went wrong.", String(err)));
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    if (set) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [set]);

  const formChanged =
    lastRequest !== null &&
    type !== null &&
    JSON.stringify(lastRequest) !== JSON.stringify({ type, common, settings: typeSettings[type] });

  const activity = set?.versions[versionIndex] ?? null;
  const replaceVersion = (updated: Activity) =>
    setSet((prev) => prev && { ...prev, versions: prev.versions.map((v, i) => (i === versionIndex ? updated : v)) });

  return (
    <main className="page">
      <header className="page-header">
        <h1>Gap Creator</h1>
        <p className="subtitle">Create information-gap activities that give students a reason to communicate.</p>
      </header>

      {!hasApiKey && (
        <div className="notice notice-warning">
          <strong>Setup needed:</strong> the OpenAI API key is missing. Create a file called <code>.env.local</code> in the
          project folder containing <code>OPENAI_API_KEY=your-key</code>, then restart <code>npm run dev</code>. You can fill
          in the form, but AI features will not work until then.
        </div>
      )}

      <section className="card">
        <h2>1. Choose an activity</h2>
        <ActivityTypeSelector selected={type} onSelect={selectType} />
      </section>

      {type && (
        <>
          <ActivityAbout type={type} />
          <TeacherForm
            type={type}
            common={common}
            onCommonChange={setCommon}
            onDifficultyChange={changeDifficulty}
            settings={typeSettings[type]}
            onSettingsChange={(s) => setTypeSettings((prev) => ({ ...prev, [type]: s }))}
          />

          <div className="generate-bar">
            <button
              className="button button-primary button-large"
              disabled={generating}
              onClick={() => generate({ type, common, settings: typeSettings[type] })}
            >
              {generating ? "Generating…" : `Generate “${TYPE_INFO[type].name}”`}
            </button>
            {generating && (
              <GeneratingMessage type={type} versions={versionCountFor(common.pairs)} pictures={type === "profile" && typeSettings.profile.format !== "combination"} />
            )}
            {error && <ErrorBox error={error} />}
          </div>
        </>
      )}

      {set && activity && (
        <div ref={resultRef} className="results">
          <div className="results-header">
            <div>
              <p className="eyebrow">
                {TYPE_INFO[activity.type].name} · {activity.cefr}
                {lastRequest && ` · ${lastRequest.common.difficulty}`} · {set.pairCount} {set.pairCount === 1 ? "pair" : "pairs"}
              </p>
              <h2 className="results-title">{activity.title}</h2>
            </div>
            <button
              className="button"
              disabled={generating || !lastRequest}
              onClick={() => lastRequest && generate(lastRequest)}
              title="Makes a new activity with the same settings you used last time"
            >
              {generating ? "Generating…" : "Regenerate Activity"}
            </button>
          </div>
          {formChanged && (
            <p className="notice">
              You have changed the form since this activity was made. Use <strong>Generate</strong> above to use the new
              settings, or <strong>Regenerate</strong> to try again with the previous settings.
            </p>
          )}
          {set.versions.length > 1 && <VersionPicker set={set} selected={versionIndex} onSelect={setVersionIndex} />}
          <ActivityPreview key={versionIndex} activity={activity} onActivityChange={replaceVersion} />
          <SharePanel set={set} />
          <DisplayErrorBoundary what="The teacher guide">
            <TeacherGuide activity={activity} />
          </DisplayErrorBoundary>
        </div>
      )}
    </main>
  );
}

/** Teacher-only: which version each classroom pair gets (students only ever see their Pair number). */
function VersionPicker({ set, selected, onSelect }: { set: ActivitySet; selected: number; onSelect: (i: number) => void }) {
  return (
    <section className="card version-picker">
      <h3>Versions for your {set.pairCount} pairs</h3>
      <p>
        The app made {set.versions.length} different versions so that neighbouring pairs do not have the same material. Check
        each version and its answer key.
      </p>
      <div className="version-buttons" role="radiogroup" aria-label="Version">
        {set.versions.map((v, i) => (
          <button key={i} role="radio" aria-checked={selected === i} className={selected === i ? "selected" : ""} onClick={() => onSelect(i)}>
            <strong>Version {i + 1}</strong>
            <span>Pairs {pairsForVersion(i + 1, set.pairCount, set.versions.length).join(", ")}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function GeneratingMessage({ type, versions, pictures }: { type: ActivityType; versions: number; pictures?: boolean }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const many = versions > 1 ? ` ${versions} versions are made at the same time.` : "";
  return (
    <div className="progress" role="status">
      <span className="spinner" aria-hidden />
      <span>
        {type === "picture"
          ? `Planning the scene, then drawing the pictures. This usually takes 1–3 minutes.${many}`
          : pictures
            ? `Creating and checking the activity, then drawing a picture of each option. This usually takes 1–2 minutes.${many}`
            : `Creating the activity. This usually takes 20–60 seconds.${many}`}{" "}
        ({seconds}s)
      </span>
    </div>
  );
}
