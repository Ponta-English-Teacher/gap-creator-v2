"use client";

import { useState } from "react";
import type { ExpressionAssist } from "@/lib/activitySchemas";
import { CHOICE_SCENARIOS, matchesDifficulty, supportDescription, TYPE_INFO } from "@/lib/activityTypes";
import type { GrammarOption } from "@/lib/activityTypes";
import { MAX_PAIRS, versionCountFor } from "@/lib/gapLogic";
import { ApiError, postJson } from "@/lib/postJson";
import { CEFR_LEVELS, DIFFICULTIES } from "@/lib/types";
import type { ActivityType, CommonSettings, Difficulty, LanguageSupport, ProfileSettings, TypeSettings } from "@/lib/types";
import ChoiceSetup from "./ChoiceSetup";
import ErrorBox from "./ErrorBox";
import { Field, NumberInput, Segmented } from "./FormControls";
import TypeSpecificForm from "./TypeSpecificForm";

interface Props {
  type: ActivityType;
  common: CommonSettings;
  onCommonChange: (c: CommonSettings) => void;
  /** Difficulty also resets the activity's own settings, so the page handles it. */
  onDifficultyChange: (d: Difficulty) => void;
  settings: TypeSettings[ActivityType];
  onSettingsChange: (s: TypeSettings[ActivityType]) => void;
}

/** Shown to teachers. "Minimal" still works for activities made earlier. */
const SUPPORT_OPTIONS: readonly LanguageSupport[] = ["None", "Useful expressions", "Strong support"];

export default function TeacherForm({ type, common, onCommonChange, onDifficultyChange, settings, onSettingsChange }: Props) {
  const info = TYPE_INFO[type];
  const set = <K extends keyof CommonSettings>(key: K, value: CommonSettings[K]) => onCommonChange({ ...common, [key]: value });
  const moreSettings = type !== "schedule";
  // Make the Best Choice has two formats, each with its own scenarios.
  const choice = type === "profile" ? (settings as ProfileSettings) : null;
  const format = choice?.format ?? "choose-one";
  const scenarios = choice ? CHOICE_SCENARIOS[format] : info.scenarios;
  const FORMATS = { "Choose One": "choose-one", "Build a Combination": "combination" } as const;
  const changeFormat = (label: keyof typeof FORMATS) => {
    const next = FORMATS[label];
    if (!choice || next === format) return;
    onSettingsChange({ ...choice, format: next });
    // Bring the new format's first scenario, unless the teacher wrote their own.
    // (Choose One starts with no scenario: the AI suggests one from the lesson topic.)
    if (next === "combination" ? true : CHOICE_SCENARIOS.combination.includes(common.topic)) set("topic", next === "combination" ? CHOICE_SCENARIOS.combination[0] : "");
  };
  // Choose One has its own setup, in lesson-planning order.
  const chooseOne = choice !== null && format === "choose-one";

  return (
    <>
      <section className="card">
        <h2>2. Set it up</h2>
        {choice && (
          <Field label="Task">
            <Segmented
              label="Task"
              options={Object.keys(FORMATS) as (keyof typeof FORMATS)[]}
              value={format === "combination" ? "Build a Combination" : "Choose One"}
              onChange={changeFormat}
            />
            <p className="setting-note">
              {format === "combination"
                ? "Students build one order or list for a group: several items, quantities and a budget the app sets and checks."
                : "Students look at pictures of the options and exchange the facts each of them has. Then they choose one, write their reasons, and read a Decision Review of their choice."}
            </p>
          </Field>
        )}
        {chooseOne && (
          <ChoiceSetup
            common={common}
            onCommonChange={onCommonChange}
            onDifficultyChange={onDifficultyChange}
            settings={choice}
            onSettingsChange={onSettingsChange}
            versionsHint={versionsHint(type, common.pairs)}
          />
        )}
        {!chooseOne && (
          <>
        <ScenarioField key={`${type}-${format}`} label={info.scenarioLabel} scenarios={scenarios} value={common.topic} onChange={(v) => set("topic", v)} />
        <Field label="Level (CEFR)">
          <Segmented label="CEFR level" options={CEFR_LEVELS} value={common.cefr} onChange={(v) => set("cefr", v)} />
        </Field>
        <Field label="Difficulty">
          <Segmented label="Difficulty" options={DIFFICULTIES} value={common.difficulty} onChange={onDifficultyChange} />
          <p className="setting-note">{info.difficulty[common.difficulty]}</p>
          {!matchesDifficulty(type, settings, common.difficulty) && (
            <p className="field-hint">You changed some settings under “More settings”, so this description may no longer match.</p>
          )}
        </Field>
        <Field
          label="Number of pairs in your class"
          htmlFor="pairs"
          hint="Students choose their Pair number on their phone, then Student A or B. Partners choose the same Pair number."
        >
          <NumberInput id="pairs" min={1} max={MAX_PAIRS} value={common.pairs} onChange={(n) => set("pairs", n)} />
          <p className="field-hint">{versionsHint(type, common.pairs)}</p>
        </Field>
          </>
        )}
      </section>

      {!chooseOne && (
      <details className="card optional">
        <summary>
          Language focus and support <span className="optional-tag">optional</span>
        </summary>
        <Field label="Grammar and question patterns" hint="Tick the patterns you want students to practise. They are added to the list below.">
          <GrammarPicker options={info.grammar} expressions={common.expressions} onChange={(v) => set("expressions", v)} />
        </Field>
        <Field
          label="Target expressions"
          htmlFor="expressions"
          hint={
            info.appLanguage
              ? `One expression per line. Leave empty and students get useful language chosen for ${common.cefr} and this difficulty; anything you add is shown first.`
              : "One expression per line. Edit freely, or leave empty and the AI will choose."
          }
        >
          <textarea
            id="expressions"
            className="input textarea"
            rows={5}
            value={common.expressions}
            placeholder={info.grammar[0].expressions.join("\n")}
            onChange={(e) => set("expressions", e.target.value)}
          />
          <ExpressionsAssist
            type={type}
            common={common}
            onReplace={(list) => set("expressions", list.join("\n"))}
            onAdd={(line) => set("expressions", [common.expressions.trimEnd(), line].filter(Boolean).join("\n"))}
          />
        </Field>
        <Field label="Communication goal" htmlFor="goal" hint="What should students be able to do? Leave empty and the AI will write one.">
          <input
            id="goal"
            className="input"
            value={common.goal}
            placeholder={info.goalExample}
            onChange={(e) => set("goal", e.target.value)}
          />
          <GoalAssist type={type} common={common} onUse={(g) => set("goal", g)} />
        </Field>
        <Field label="Language support on the student screen">
          <Segmented label="Language support" options={SUPPORT_OPTIONS} value={common.support} onChange={(v) => set("support", v)} />
          <p className="setting-note">{supportDescription(type, common.support)}</p>
        </Field>
      </details>
      )}

      {moreSettings && (
        <details className="card optional">
          <summary>
            More settings <span className="optional-tag">optional</span>
          </summary>
          {type !== "profile" && <p className="field-hint">Difficulty fills these in for you. Change them only if you want something different.</p>}
          <TypeSpecificForm type={type} settings={settings} onChange={onSettingsChange} />
        </details>
      )}
    </>
  );
}

/** Scenario chosen from a list, or typed by the teacher. */
function ScenarioField({ label, scenarios, value, onChange }: { label: string; scenarios: string[]; value: string; onChange: (v: string) => void }) {
  const [own, setOwn] = useState(value !== "" && !scenarios.includes(value));
  return (
    <Field label={label}>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {scenarios.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={!own && value === s}
            className={!own && value === s ? "selected" : ""}
            onClick={() => {
              setOwn(false);
              onChange(s);
            }}
          >
            {s}
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={own}
          className={own ? "selected" : ""}
          onClick={() => {
            if (!own) onChange("");
            setOwn(true);
          }}
        >
          Write my own…
        </button>
      </div>
      {own && (
        <input
          className="input own-scenario"
          aria-label={`Your own: ${label}`}
          value={value}
          placeholder={`e.g. ${scenarios[0]}`}
          autoFocus
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

/** Ticking a pattern adds its expressions to the target expressions; unticking removes them. */
function GrammarPicker({ options, expressions, onChange }: { options: GrammarOption[]; expressions: string; onChange: (v: string) => void }) {
  const current = lines(expressions);
  return (
    <div className="checkbox-grid">
      {options.map((o) => {
        const checked = o.expressions.every((e) => current.includes(e));
        const toggle = () =>
          onChange(
            (checked ? current.filter((l) => !o.expressions.includes(l)) : [...current, ...o.expressions.filter((e) => !current.includes(e))]).join("\n"),
          );
        return (
          <label key={o.label} className={`checkbox ${checked ? "checked" : ""}`}>
            <input type="checkbox" checked={checked} onChange={toggle} />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}

/** Explains what the pair count means in practice (versions are decided by the app). */
function versionsHint(type: ActivityType, pairs: number): string {
  const v = versionCountFor(pairs);
  if (v === 1) return "All students use the same activity.";
  const pictures = type === "picture" ? ` (${v} picture pairs)` : "";
  return `The app will make ${v} different versions${pictures} and share them across the ${pairs} pairs, so neighbouring pairs get different material.`;
}

// ---------- AI Assist panels: they only SUGGEST. The teacher clicks to use a suggestion. ----------

function useAssist<T>() {
  const [result, setResult] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  async function run(body: unknown) {
    setLoading(true);
    setError(null);
    try {
      setResult(await postJson<T>("/api/assist", body));
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError("Something went wrong.", String(err)));
    } finally {
      setLoading(false);
    }
  }
  return { result, setResult, loading, error, run };
}

function GoalAssist({ type, common, onUse }: { type: ActivityType; common: CommonSettings; onUse: (g: string) => void }) {
  const { result, setResult, loading, error, run } = useAssist<{ suggestions: string[] }>();
  return (
    <div className="assist">
      <button type="button" className="button button-ai" disabled={loading} onClick={() => run({ kind: "goal", type, common })}>
        {loading ? "Thinking…" : "✨ AI Suggest"}
      </button>
      {error && <ErrorBox error={error} />}
      {result && (
        <div className="assist-panel">
          <p className="assist-title">Suggestions — click one to use it, then edit it if you like:</p>
          <ul className="suggestion-list">
            {result.suggestions.map((s) => (
              <li key={s}>
                <span>{s}</span>
                <button type="button" className="button button-small" onClick={() => onUse(s)}>
                  Use this
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="link-button" onClick={() => setResult(null)}>
            Close suggestions
          </button>
        </div>
      )}
    </div>
  );
}

function ExpressionsAssist({
  type,
  common,
  onReplace,
  onAdd,
}: {
  type: ActivityType;
  common: CommonSettings;
  onReplace: (list: string[]) => void;
  onAdd: (line: string) => void;
}) {
  const { result, setResult, loading, error, run } = useAssist<ExpressionAssist>();
  const current = common.expressions.split("\n").map((l) => l.trim());

  const addList = (title: string, items: string[]) =>
    items.length > 0 && (
      <div className="assist-group">
        <p className="assist-title">{title}</p>
        <ul className="suggestion-list">
          {items.map((s) => (
            <li key={s}>
              <span>{s}</span>
              <button type="button" className="button button-small" disabled={current.includes(s)} onClick={() => onAdd(s)}>
                {current.includes(s) ? "Added" : "+ Add"}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <div className="assist">
      <button type="button" className="button button-ai" disabled={loading} onClick={() => run({ kind: "expressions", type, common })}>
        {loading ? "Checking…" : "✨ AI Assist"}
      </button>
      {error && <ErrorBox error={error} />}
      {result && (
        <div className="assist-panel">
          <div className="assist-group">
            <p className="assist-title">Level check ({common.cefr})</p>
            <p>{result.levelCheck}</p>
          </div>
          {result.corrections.length > 0 && (
            <div className="assist-group">
              <p className="assist-title">Suggested corrections</p>
              <ul className="correction-list">
                {result.corrections.map((c) => (
                  <li key={c.original}>
                    <span className="strike">{c.original}</span> → <strong>{c.suggestion}</strong>
                    <span className="reason">{c.reason}</span>
                  </li>
                ))}
              </ul>
              {result.revisedList.length > 0 && (
                <button type="button" className="button button-small" onClick={() => onReplace(result.revisedList)}>
                  Apply these corrections to my list
                </button>
              )}
            </div>
          )}
          {addList("Useful additions", result.usefulAdditions)}
          {addList("Simpler alternatives", result.simplerAlternatives)}
          {addList("More challenging alternatives", result.challengingAlternatives)}
          <button type="button" className="link-button" onClick={() => setResult(null)}>
            Close suggestions
          </button>
        </div>
      )}
    </div>
  );
}
