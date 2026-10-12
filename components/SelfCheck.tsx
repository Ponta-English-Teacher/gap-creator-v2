/**
 * Student self-check, opened after the speaking activity (and only if the teacher allows it).
 * Shows stored data only; nothing is regenerated.
 *   Spot the Differences  both pictures, and the list of differences behind a separate control
 *   How Do I Get There?   the complete map (with all road works), and the route answers behind a separate control
 *   What Happened?        the whole timeline, and the explanation behind a separate control
 *   Make the Best Choice  all the information, and the possible choices behind a separate control
 */
import { isChooseOne, isCombination } from "@/lib/choice";
import { mapPlaceHolders, profileDetailHolder, storyEventHolder } from "@/lib/gapLogic";
import type { Activity, ActivityOf, Role } from "@/lib/types";
import { Legend, Tag } from "./AnswerKey";
import { ChoiceAnswers, ChoiceComplete } from "./ChoiceViews";
import ProgrammaticMap from "./ProgrammaticMap";
import RouteAnswers from "./RouteAnswers";

/** What the "Check Answers" confirmation promises for each activity that has a self-check. */
export const SELF_CHECK_REVEALS: Partial<Record<Activity["type"], string>> = {
  picture: "both pictures",
  map: "the complete map",
  story: "the whole story",
  profile: "all the information and the possible choices",
};

export default function SelfCheck({ activity, role, pair }: { activity: Activity; role: Role; pair?: number }) {
  return (
    <article className="student-sheet self-check">
      <div className="sheet-header">
        <span className={`role-badge role-${role}`}>{pair ? `Pair ${pair} — Student ${role}` : `Student ${role}`}</span>
        <h3>Check your answers</h3>
      </div>
      {activity.type === "picture" && <PictureCheck activity={activity} role={role} />}
      {activity.type === "map" && <MapCheck activity={activity} role={role} />}
      {activity.type === "story" && <StoryCheck activity={activity} />}
      {activity.type === "profile" && <ChoiceCheck activity={activity} />}
    </article>
  );
}

function PictureCheck({ activity, role }: { activity: ActivityOf<"picture">; role: Role }) {
  const { images, data } = activity;
  if (!images) return null;
  const pictures: { role: Role; src: string }[] = [
    { role: "A", src: images.a },
    { role: "B", src: images.b },
  ];
  return (
    <>
      <p className="sheet-instructions">Here are both pictures. With your partner, check the differences you found.</p>
      <div className="check-pictures">
        {pictures.map((p) => (
          <figure key={p.role}>
            {/* eslint-disable-next-line @next/next/no-img-element -- stored picture served by the image route */}
            <img className="picture" src={p.src} alt={`Student ${p.role}'s picture`} />
            <figcaption>
              <span className={`role-badge role-${p.role}`}>Student {p.role}</span>
              {p.role === role && " your picture"}
            </figcaption>
          </figure>
        ))}
      </div>
      {data.differences.length > 0 && (
        <details className="check-differences">
          <summary>Show Differences ({data.differences.length})</summary>
          <ol>
            {data.differences.map((d, i) => (
              <li key={i}>
                <strong>{d.item}</strong>
                <span className="check-diff check-diff-A">A: {d.studentA}</span>
                <span className="check-diff check-diff-B">B: {d.studentB}</span>
              </li>
            ))}
          </ol>
          <p>The pictures were drawn by AI, so you may also notice small differences that are not on this list.</p>
        </details>
      )}
    </>
  );
}

function MapCheck({ activity, role }: { activity: ActivityOf<"map">; role: Role }) {
  const { places } = activity.data;
  const holders = mapPlaceHolders(places);
  const found = places.filter((_, i) => holders[i] !== "both" && holders[i] !== role);
  return (
    <>
      <p className="sheet-instructions">Here is the complete map. With your partner, check the places you found.</p>
      <Legend />
      <ProgrammaticMap data={activity.data} view="key" />
      {found.length > 0 && (
        <div className="find-list">
          <h4>You were looking for:</h4>
          <ul className="checklist">
            {found.map((p) => (
              <li key={p.name}>{p.name}</li>
            ))}
          </ul>
        </div>
      )}
      {(activity.data.routeTasks?.length ?? 0) > 0 && (
        <details className="check-differences">
          <summary>Show Route Answers</summary>
          <RouteAnswers data={activity.data} />
        </details>
      )}
      <h4>Your map during the activity</h4>
      <ProgrammaticMap data={activity.data} view={role} />
    </>
  );
}

function StoryCheck({ activity }: { activity: ActivityOf<"story"> }) {
  const { background, events, explanation } = activity.data;
  return (
    <>
      <p className="sheet-instructions">Here is the whole story, in order. With your partner, check what you worked out.</p>
      <Legend />
      <p className="story-background">{background}</p>
      <ol className="timeline">
        {events.map((e, i) => {
          const holder = storyEventHolder(i, events.length);
          return (
            <li key={i} className={`cell-${holder}`}>
              <span className="time">{e.time}</span>
              <span>
                <Tag h={holder} /> {e.fact}
              </span>
            </li>
          );
        })}
      </ol>
      {explanation && (
        <details className="check-differences">
          <summary>Show Explanation</summary>
          <p className="check-explanation">{explanation}</p>
        </details>
      )}
    </>
  );
}

function ChoiceCheck({ activity }: { activity: ActivityOf<"profile"> }) {
  const data = activity.data;
  if (isChooseOne(data) || isCombination(data))
    return (
      <>
        <p className="sheet-instructions">Here is all the information. With your partner, check your decision.</p>
        <Legend />
        <ChoiceComplete data={data} />
        <details className="check-differences">
          <summary>{isChooseOne(data) ? "Show Possible Choices" : "Show Example Orders"}</summary>
          <ChoiceAnswers data={data} />
        </details>
      </>
    );
  // The older profile table.
  return (
    <>
      <p className="sheet-instructions">Here is all the information. With your partner, check your decision.</p>
      <Legend />
      <div className="profile-grid">
        {data.profiles.map((p, pi) => (
          <div key={p.name} className="profile-card">
            <h4>{p.name}</h4>
            <dl>
              {p.details.map((d, di) => (
                <div key={di} className={`profile-row cell-${profileDetailHolder(pi, di)}`}>
                  <dt>{d.category}</dt>
                  <dd>
                    <Tag h={profileDetailHolder(pi, di)} /> {d.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      {data.finalTaskAnswer && (
        <details className="check-differences">
          <summary>Show a Possible Answer</summary>
          <p className="check-explanation">{data.finalTaskAnswer}</p>
        </details>
      )}
    </>
  );
}
