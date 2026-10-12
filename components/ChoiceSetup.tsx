"use client";

import { useState } from "react";
import type { ChoiceSetupAssist } from "@/lib/activitySchemas";
import { LESSON_TOPICS, supportDescription, TYPE_INFO } from "@/lib/activityTypes";
import { MAX_PAIRS } from "@/lib/gapLogic";
import { ApiError, postJson } from "@/lib/postJson";
import { CEFR_LEVELS, DIFFICULTIES } from "@/lib/types";
import type { CommonSettings, Difficulty, LanguageSupport, ProfileSettings } from "@/lib/types";
import ErrorBox from "./ErrorBox";
import { Field, NumberInput, Segmented } from "./FormControls";

interface Props {
  common: CommonSettings;
  onCommonChange: (c: CommonSettings) => void;
  onDifficultyChange: (d: Difficulty) => void;
  settings: ProfileSettings;
  onSettingsChange: (s: ProfileSettings) => void;
  versionsHint: string;
}

const SUPPORT_OPTIONS: readonly LanguageSupport[] = ["None", "Useful expressions", "Strong support"];

/** What the AI last put into each field, so new ideas replace old ideas but never the teacher's own words. */
interface Filled {
  topic: string;
  vocabulary: string;
  expressions: string;
  grammar: string;
}
const NOTHING: Filled = { topic: "", vocabulary: "", expressions: "", grammar: "" };

/**
 * Teacher setup for Make the Best Choice (Choose One), in the order a lesson is planned:
 * level, lesson topic, a decision scenario, then the words and expressions to practise.
 * A level and a topic are enough: everything else can be suggested by the AI or left for it to choose.
 */
export default function ChoiceSetup({ common, onCommonChange, onDifficultyChange, settings, onSettingsChange, versionsHint }: Props) {
  const [ideas, setIdeas] = useState<(ChoiceSetupAssist & { cefr: string; lessonTopic: string }) | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const [filled, setFilled] = useState<Filled>(NOTHING);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const lessonTopic = settings.lessonTopic ?? "";
  const listed = LESSON_TOPICS.includes(lessonTopic);
  const [ownTopic, setOwnTopic] = useState(lessonTopic !== "" && !listed);
  const info = TYPE_INFO.profile;

  /** A field the teacher has not written in themselves: empty, or still the AI's last idea. */
  const untouched = (value: string | undefined, key: keyof Filled) => !(value ?? "").trim() || value === filled[key];

  function changeLessonTopic(next: string) {
    // Ideas for the old topic do not belong to the new one; the teacher's own words stay.
    onSettingsChange({
      ...settings,
      lessonTopic: next,
      vocabulary: untouched(settings.vocabulary, "vocabulary") ? "" : settings.vocabulary,
      grammar: untouched(settings.grammar, "grammar") ? "" : settings.grammar,
    });
    onCommonChange({ ...common, topic: untouched(common.topic, "topic") ? "" : common.topic, expressions: untouched(common.expressions, "expressions") ? "" : common.expressions });
    setFilled(NOTHING);
    setIdeas(null);
    setSeen([]);
  }

  async function suggest() {
    setLoading(true);
    setError(null);
    try {
      const result = await postJson<ChoiceSetupAssist>("/api/assist", { kind: "choice-setup", cefr: common.cefr, lessonTopic, avoid: seen });
      const next: Filled = {
        topic: result.scenarios[0]?.scenario ?? "",
        vocabulary: result.vocabulary.join("\n"),
        expressions: result.expressions.join("\n"),
        grammar: result.grammar[0] ?? "",
      };
      onCommonChange({
        ...common,
        topic: untouched(common.topic, "topic") ? next.topic : common.topic,
        expressions: untouched(common.expressions, "expressions") ? next.expressions : common.expressions,
      });
      onSettingsChange({
        ...settings,
        vocabulary: untouched(settings.vocabulary, "vocabulary") ? next.vocabulary : settings.vocabulary,
        grammar: untouched(settings.grammar, "grammar") ? next.grammar : settings.grammar,
      });
      setFilled(next);
      setIdeas({ ...result, cefr: common.cefr, lessonTopic });
      setSeen([...seen, ...result.scenarios.map((s) => s.scenario)]);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError("Something went wrong.", String(err)));
    } finally {
      setLoading(false);
    }
  }

  const stale = ideas !== null && ideas.cefr !== common.cefr;
  const decision = settings.decision ?? "auto";
  const DECISIONS = { "Let the AI recommend": "auto", "Individual Decision": "individual", "Shared Decision": "shared" } as const;
  const decisionLabel = (Object.keys(DECISIONS) as (keyof typeof DECISIONS)[]).find((k) => DECISIONS[k] === decision) ?? "Let the AI recommend";
  // The AI's recommendation for the scenario in the box, when it is one of its own suggestions.
  const recommended = ideas?.scenarios.find((x) => x.scenario === common.topic)?.decision;

  return (
    <>
      <Field label="1. Level (CEFR)">
        <Segmented label="CEFR level" options={CEFR_LEVELS} value={common.cefr} onChange={(v) => onCommonChange({ ...common, cefr: v })} />
        <p className="setting-note">The language level of your class. It sets how much students read and how they are asked to give reasons.</p>
      </Field>

      <Field label="2. Lesson topic">
        <div className="segmented" role="radiogroup" aria-label="Lesson topic">
          {LESSON_TOPICS.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={!ownTopic && lessonTopic === t}
              className={!ownTopic && lessonTopic === t ? "selected" : ""}
              onClick={() => {
                setOwnTopic(false);
                if (t !== lessonTopic) changeLessonTopic(t);
              }}
            >
              {t}
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={ownTopic}
            className={ownTopic ? "selected" : ""}
            onClick={() => {
              if (!ownTopic) changeLessonTopic("");
              setOwnTopic(true);
            }}
          >
            Another topic…
          </button>
        </div>
        {ownTopic && (
          <input
            className="input own-scenario"
            aria-label="Your lesson topic"
            value={lessonTopic}
            placeholder="e.g. Health, Sports, Festivals"
            autoFocus
            onChange={(e) => onSettingsChange({ ...settings, lessonTopic: e.target.value })}
          />
        )}
      </Field>

      <Field
        label="3. Decision scenario"
        htmlFor="scenario"
        hint="What the two students choose. Leave it empty and the AI chooses a suitable situation when it makes the activity."
      >
        <div className="assist assist-first">
          <button type="button" className="button button-ai" disabled={loading} onClick={suggest}>
            {loading ? "Thinking…" : ideas ? "✨ Suggest different ideas" : `✨ Suggest ideas for ${common.cefr}${lessonTopic.trim() ? ` · ${lessonTopic.trim()}` : ""}`}
          </button>
          <span className="field-hint"> Fills in a scenario, vocabulary, expressions and a grammar focus. You can change all of them.</span>
          {error && <ErrorBox error={error} />}
          {stale && <p className="field-hint">These ideas were made for {ideas.cefr}. Suggest ideas again for {common.cefr}.</p>}
        </div>
        {ideas && (
          <div className="segmented scenario-ideas" role="radiogroup" aria-label="Suggested scenarios">
            {ideas.scenarios.map((s, i) => (
              <button
                key={s.scenario}
                type="button"
                role="radio"
                aria-checked={common.topic === s.scenario}
                className={common.topic === s.scenario ? "selected" : ""}
                title={s.why}
                onClick={() => {
                  onCommonChange({ ...common, topic: s.scenario });
                  setFilled({ ...filled, topic: s.scenario });
                }}
              >
                {s.scenario}
                <span className="optional-tag">{s.decision === "individual" ? "individual" : "shared"}</span>
                {i === 0 && <span className="optional-tag">recommended</span>}
              </button>
            ))}
          </div>
        )}
        <input
          id="scenario"
          className="input own-scenario"
          value={common.topic}
          placeholder="Leave empty, or write your own, e.g. Two classmates each choose a lunch"
          onChange={(e) => onCommonChange({ ...common, topic: e.target.value })}
        />
      </Field>

      <Field label="4. Decision format">
        <Segmented label="Decision format" options={Object.keys(DECISIONS) as (keyof typeof DECISIONS)[]} value={decisionLabel} onChange={(v) => onSettingsChange({ ...settings, decision: DECISIONS[v] })} />
        <p className="setting-note">
          {decision === "individual"
            ? "Students exchange information, then each student chooses for themselves and explains why. Different choices are fine."
            : decision === "shared"
              ? "Students exchange information, negotiate, and agree on one option. Use this only when the scenario really needs one common choice (one flat to share, one person to hire)."
              : recommended
                ? `For this scenario the AI recommends ${recommended === "individual" ? "an Individual Decision: each student chooses for themselves" : "a Shared Decision: the two students agree on one option"}. Choose a format yourself to override it.`
                : "The AI chooses the format that fits the scenario: individual when each person would naturally choose their own, shared only when they must end with one common choice. The result tells you which it used."}
        </p>
        {decision !== "auto" && recommended && recommended !== decision && (
          <p className="field-hint">
            The AI suggested {recommended === "individual" ? "an individual" : "a shared"} decision for this scenario. Your choice is used, and the scenario is adapted to fit it.
          </p>
        )}
      </Field>

      <Field
        label="5. Language to practise"
        hint={`Teaching ideas suited to ${common.cefr} learners, not a fixed word list. Edit, delete or add your own. Leave a box empty and the AI chooses.`}
      >
        <label className="sub-label" htmlFor="vocabulary">
          Vocabulary <span className="muted">(one word or phrase per line)</span>
        </label>
        <textarea
          id="vocabulary"
          className="input textarea"
          rows={4}
          value={settings.vocabulary ?? ""}
          placeholder={"delicious\nhealthy\ncheap\nspicy"}
          onChange={(e) => onSettingsChange({ ...settings, vocabulary: e.target.value })}
        />
        <label className="sub-label" htmlFor="expressions">
          Useful expressions <span className="muted">(one per line; shown to students first)</span>
        </label>
        <textarea
          id="expressions"
          className="input textarea"
          rows={4}
          value={common.expressions}
          placeholder={"How much is ...?\nI think ... looks good.\n... is cheaper than ..."}
          onChange={(e) => onCommonChange({ ...common, expressions: e.target.value })}
        />
        <label className="sub-label" htmlFor="grammar">
          Grammar focus <span className="muted">(optional)</span>
        </label>
        <input
          id="grammar"
          className="input"
          value={settings.grammar ?? ""}
          placeholder="e.g. comparatives: cheaper than ..."
          onChange={(e) => onSettingsChange({ ...settings, grammar: e.target.value })}
        />
        {ideas && ideas.grammar.length > 1 && (
          <div className="segmented scenario-ideas" aria-label="Other grammar ideas">
            {ideas.grammar.map((g) => (
              <button
                key={g}
                type="button"
                className={settings.grammar === g ? "selected" : ""}
                onClick={() => {
                  onSettingsChange({ ...settings, grammar: g });
                  setFilled({ ...filled, grammar: g });
                }}
              >
                {g}
              </button>
            ))}
          </div>
        )}
      </Field>

      <Field label="6. Task difficulty">
        <Segmented label="Task difficulty" options={DIFFICULTIES} value={common.difficulty} onChange={onDifficultyChange} />
        <p className="setting-note">{info.difficulty[common.difficulty]}</p>
        <p className="field-hint">This is how hard the decision is, not how hard the English is. An A1 class can do a Challenging decision in simple English.</p>
      </Field>
      <Field label="Number of pairs in your class" htmlFor="pairs" hint="Students choose their Pair number on their phone, then Student A or B. Partners choose the same Pair number.">
        <NumberInput id="pairs" min={1} max={MAX_PAIRS} value={common.pairs} onChange={(n) => onCommonChange({ ...common, pairs: n })} />
        <p className="field-hint">{versionsHint} Each version has its own pictures.</p>
      </Field>
      <Field label="Language support on the student screen">
        <Segmented label="Language support" options={SUPPORT_OPTIONS} value={common.support} onChange={(v) => onCommonChange({ ...common, support: v })} />
        <p className="setting-note">{supportDescription("profile", common.support)} Your vocabulary is always shown.</p>
      </Field>
      <Field label="AI feedback after students choose">
        <label className={`checkbox ${settings.reasonFeedback ? "checked" : ""}`}>
          <input type="checkbox" checked={settings.reasonFeedback === true} onChange={() => onSettingsChange({ ...settings, reasonFeedback: !settings.reasonFeedback })} />
          Give each student AI feedback on their reasons and English
        </label>
        <p className="setting-note">
          {settings.reasonFeedback
            ? `On: when a student submits a choice, the AI answers the reasons they wrote, gently corrects a wrong fact, and gives their sentence back in natural ${common.cefr} English (“Your English”). This makes one AI request each time a student submits, with a limit of about 200 for one student link.`
            : "Off: students still see a short review of their choice, prepared and checked when the activity is made, but nothing about what they wrote and no “Your English”. No AI requests are made from student phones."}
        </p>
      </Field>
    </>
  );
}
