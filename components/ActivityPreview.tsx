"use client";

import { useState } from "react";
import { ApiError, postJson } from "@/lib/postJson";
import type { ChooseOneData } from "@/lib/activitySchemas";
import { decisionOf, hasDecisionReview, isChooseOne } from "@/lib/choice";
import type { Activity } from "@/lib/types";
import AnswerKey from "./AnswerKey";
import DisplayErrorBoundary from "./DisplayErrorBoundary";
import ErrorBox from "./ErrorBox";
import { SELF_CHECK_REVEALS } from "./SelfCheck";
import StudentView from "./StudentView";

type Tab = "A" | "B" | "key";
const TABS: { id: Tab; label: string }[] = [
  { id: "A", label: "Student A" },
  { id: "B", label: "Student B" },
  { id: "key", label: "Answer Key" },
];

export default function ActivityPreview({ activity, onActivityChange }: { activity: Activity; onActivityChange: (a: Activity) => void }) {
  const [tab, setTab] = useState<Tab>("A");
  const review = activity.type === "profile" && hasDecisionReview(activity.data);
  const individual = activity.type === "profile" && isChooseOne(activity.data) && decisionOf(activity.data) === "individual";

  return (
    <section className="card preview">
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab tab-${t.id} ${tab === t.id ? "selected" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {activity.type === "picture" && <PictureRetry activity={activity} onActivityChange={onActivityChange} />}
      {activity.type === "profile" && isChooseOne(activity.data) && <OptionPictures activity={activity} data={activity.data} onActivityChange={onActivityChange} />}
      {review && (
        <p className="self-check-note">
          <strong>{individual ? "Individual decision" : "Shared decision"}.</strong>{" "}
          {individual
            ? "Students exchange information, then each chooses for themselves and writes their own reasons. Different choices are fine."
            : "Students exchange information, negotiate and agree on one option, then enter that choice and their reasons."}{" "}
          Only after submitting do they see the Decision Review of the option they chose{activity.reasonFeedback ? ", with AI feedback on their own reasons and English" : ""}. You can try it at the bottom of each
          student tab; every review is in the Answer Key. To use the other format, change “Decision format” in the setup and generate again.
        </p>
      )}
      {SELF_CHECK_REVEALS[activity.type] && !review && (
        <p className="self-check-note">
          {activity.allowSelfCheck !== false
            ? `Students can check their answers: after they finish, a “Check Answers” button shows them ${SELF_CHECK_REVEALS[activity.type]}.`
            : "Students cannot check their answers on their phones (“Allow students to check answers” was off)."}
        </p>
      )}
      <div className="tab-panel" role="tabpanel">
        <DisplayErrorBoundary key={tab} what={tab === "key" ? "The Answer Key" : `Student ${tab}’s view`}>
          {tab === "key" ? <AnswerKey activity={activity} /> : <StudentView activity={activity} role={tab} />}
        </DisplayErrorBoundary>
      </div>
    </section>
  );
}

/** Picture Gap: redraw only the pictures (same differences), or show why drawing failed. */
function PictureRetry({ activity, onActivityChange }: { activity: Extract<Activity, { type: "picture" }>; onActivityChange: (a: Activity) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function redraw() {
    setLoading(true);
    setError(null);
    try {
      const { images } = await postJson<{ images: { a: string; b: string } }>("/api/images", { data: activity.data });
      onActivityChange({ ...activity, images, imageError: undefined });
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError("Something went wrong.", String(err)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="picture-retry">
      {activity.imageError && <ErrorBox error={{ message: "The pictures could not be drawn.", detail: activity.imageError }} />}
      <p>
        The pictures are drawn by AI, so they may not match the plan perfectly. Check them against the Answer Key. If the pair is
        poor, redraw them (same differences) or regenerate the whole activity.
      </p>
      <button className="button" disabled={loading} onClick={redraw}>
        {loading ? "Drawing pictures… (1–2 min)" : activity.images ? "Redraw Pictures Only" : "Draw Pictures"}
      </button>
      {error && <ErrorBox error={error} />}
    </div>
  );
}

/** Make the Best Choice: the option pictures are drawn by AI, so the teacher checks them and can redraw them. */
function OptionPictures({ activity, data, onActivityChange }: { activity: Extract<Activity, { type: "profile" }>; data: ChooseOneData; onActivityChange: (a: Activity) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  // Activities made before pictures existed have nothing to draw from.
  if (!data.options.every((o) => o.look)) return null;
  const missing = data.options.filter((o) => !o.picture).length;

  async function redraw() {
    setLoading(true);
    setError(null);
    try {
      const drawn = await postJson<{ pictures: (string | null)[]; error?: string }>("/api/images", { looks: data.options.map((o) => o.look), people: data.optionsArePeople });
      const options = data.options.map((o, i) => ({ ...o, picture: drawn.pictures[i] ?? o.picture }));
      onActivityChange({ ...activity, data: { ...data, options }, pictureError: drawn.error });
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError("Something went wrong.", String(err)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="picture-retry">
      {activity.pictureError && <ErrorBox error={{ message: `${missing} of the ${data.options.length} pictures could not be drawn.`, detail: activity.pictureError }} />}
      <p>
        The pictures are drawn by AI from each option’s description, so check that each one matches its option and its facts.
        {missing > 0 ? " An option without a picture is shown as a card with its name and facts only." : ""}
        {data.optionsArePeople ? " Because the options are people, each picture is only an application folder: the app never draws a face or suggests what a person is like." : ""}
      </p>
      <button className="button" disabled={loading} onClick={redraw}>
        {loading ? "Drawing pictures… (about 1 min)" : missing === data.options.length ? "Draw Pictures" : "Redraw Pictures Only"}
      </button>
      {error && <ErrorBox error={error} />}
    </div>
  );
}
