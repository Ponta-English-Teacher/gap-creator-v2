/** Complete teacher information, with who-knows-what marked. Uses the same holder rules as the student views. */
import { isChooseOne, isCombination } from "@/lib/choice";
import { mapPlaceHolders, profileDetailHolder, storyEventHolder, textCellHolder } from "@/lib/gapLogic";
import { describeLocation, directionsToPlace } from "@/lib/townMap";
import type { Activity, ActivityOf, Holder } from "@/lib/types";
import { ChoiceAnswers, ChoiceComplete, ChoiceReviews } from "./ChoiceViews";
import ProgrammaticMap from "./ProgrammaticMap";
import RouteAnswers from "./RouteAnswers";

export default function AnswerKey({ activity }: { activity: Activity }) {
  const notes = activity.notes ?? [];
  return (
    <article className="answer-key">
      {notes.length > 0 && (
        <div className="notice notice-warning">
          <strong>Please check:</strong>
          <ul>
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
      <Legend />
      {activity.type === "picture" && <PictureKey activity={activity} />}
      {activity.type === "text" && <TextKey activity={activity} />}
      {activity.type === "schedule" && <ScheduleKey activity={activity} />}
      {activity.type === "map" && <MapKey activity={activity} />}
      {activity.type === "profile" && <ProfileKey activity={activity} />}
      {activity.type === "story" && <StoryKey activity={activity} />}
    </article>
  );
}

export function Legend() {
  return (
    <p className="legend">
      <Tag h="A" /> only Student A knows · <Tag h="B" /> only Student B knows · <Tag h="both" /> both know
    </p>
  );
}

export function Tag({ h }: { h: Holder }) {
  return <span className={`tag tag-${h}`}>{h === "both" ? "A+B" : h}</span>;
}

function PictureKey({ activity }: { activity: ActivityOf<"picture"> }) {
  const { data, images } = activity;
  return (
    <>
      {images && (
        <div className="picture-pair">
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
            <img className="picture" src={images.a} alt="Student A's picture" />
            <figcaption>Student A</figcaption>
          </figure>
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
            <img className="picture" src={images.b} alt="Student B's picture" />
            <figcaption>Student B</figcaption>
          </figure>
        </div>
      )}
      <h4>Intended differences</h4>
      <p>The pictures are drawn by AI, so positions can be approximate. Check each difference against the pictures above before class.</p>
      <div className="table-wrap">
        <table className="gap-table key-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th>Student A</th>
              <th>Student B</th>
              <th>Example question</th>
            </tr>
          </thead>
          <tbody>
            {data.differences.map((d, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>
                  {d.item} <span className="muted">({d.differenceType})</span>
                </td>
                <td>{d.studentA}</td>
                <td>{d.studentB}</td>
                <td>{d.exampleQuestion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h4>Same in both pictures</h4>
      <ul>
        {data.commonElements.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
      <details className="spec">
        <summary>Picture plan sent to the image AI</summary>
        <p>{data.sceneDescription}</p>
        <p>{data.imagePromptA}</p>
      </details>
    </>
  );
}

function TextKey({ activity }: { activity: ActivityOf<"text"> }) {
  const { subjects, rows } = activity.data;
  return (
    <div className="table-wrap">
      <table className="gap-table key-table">
        <thead>
          <tr>
            <th />
            {subjects.map((s) => (
              <th key={s}>{s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              <th scope="row">{row.item}</th>
              {row.cells.map((cell, c) => {
                const h = textCellHolder(r, c);
                return (
                  <td key={c} className={`cell-${h}`}>
                    <Tag h={h} /> <strong>{cell.answer}</strong>
                    <span className="qa">
                      {h === "A" ? "B" : "A"} asks: {cell.question}
                      <br />
                      {h} answers: {cell.fullAnswer}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScheduleKey({ activity }: { activity: ActivityOf<"schedule"> }) {
  const { columns, timeSlots, sections, solution } = activity.data;
  return (
    <>
      {sections.map((section) => (
        <div key={section.heading} className="table-wrap">
          <h4>{section.heading}</h4>
          <table className="gap-table key-table">
            <thead>
              <tr>
                <th />
                {columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeSlots.map((t) => (
                <tr key={t}>
                  <th scope="row">{t}</th>
                  {columns.map((c) => {
                    const cell = section.cells.find((x) => x.column === c && x.timeSlot === t);
                    return (
                      <td key={c} className={cell ? `cell-${cell.knownBy}` : ""}>
                        {cell && (
                          <>
                            <Tag h={cell.knownBy} /> {cell.text}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <Solution text={solution} />
    </>
  );
}

function MapKey({ activity }: { activity: ActivityOf<"map"> }) {
  const { places } = activity.data;
  const holders = mapPlaceHolders(places);
  return (
    <>
      <ProgrammaticMap data={activity.data} view="key" />
      {(activity.data.routeTasks?.length ?? 0) > 0 && (
        <>
          <h4>Route challenges</h4>
          <p>
            Each student travels to a place only their partner can see.
            {(activity.data.closures?.length ?? 0) > 0 && " Each closed road is drawn on one student’s map only; this map shows them all."}
          </p>
          <RouteAnswers data={activity.data} />
        </>
      )}
      <h4>
        Where each place is, and the shortest {(activity.data.closures?.length ?? 0) > 0 ? "open " : ""}route from START to its entrance (worked out by the app from the map)
      </h4>
      <div className="table-wrap">
        <table className="gap-table key-table">
          <thead>
            <tr>
              <th>Place</th>
              <th>Who knows</th>
              <th>Where it is</th>
              <th>Directions from START</th>
            </tr>
          </thead>
          <tbody>
            {places.map((p, i) => (
              <tr key={i} className={`cell-${holders[i]}`}>
                <td>
                  <strong>{p.name}</strong>
                  <br />
                  <span className="muted">{p.description}</span>
                </td>
                <td>
                  <Tag h={holders[i]} />
                </td>
                <td>{describeLocation(p, activity.data).text}</td>
                <td>{directionsToPlace(p, activity.data)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ProfileKey({ activity }: { activity: ActivityOf<"profile"> }) {
  const data = activity.data;
  if (isChooseOne(data) || isCombination(data))
    return (
      <>
        <ChoiceComplete data={data} />
        <h4>{isChooseOne(data) ? "Which choices are possible" : "Orders worked out by the app"}</h4>
        <ChoiceAnswers data={data} />
        {isChooseOne(data) && (
          <>
            <h4>Decision Review of every option</h4>
            <p className="field-hint">After a student submits a choice and reasons, they see the review of the option they chose. Check all of them before you share.</p>
            <ChoiceReviews data={data} />
          </>
        )}
      </>
    );
  return (
    <>
      <div className="profile-grid">
        {data.profiles.map((p, pi) => (
          <div key={p.name} className="profile-card">
            <h4>{p.name}</h4>
            <dl>
              {p.details.map((d, di) => {
                const holder = profileDetailHolder(pi, di);
                return (
                  <div key={di} className={`profile-row cell-${holder}`}>
                    <dt>{d.category}</dt>
                    <dd>
                      <Tag h={holder} /> {d.value}
                      {d.question && <span className="qa">Question: {d.question}</span>}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ))}
      </div>
      <Solution text={data.finalTaskAnswer} />
    </>
  );
}

function StoryKey({ activity }: { activity: ActivityOf<"story"> }) {
  const { background, events, explanation } = activity.data;
  return (
    <>
      <p className="story-background">{background}</p>
      <ol className="timeline">
        {events.map((e, i) => {
          const holder = storyEventHolder(i, events.length);
          return (
            <li key={i} className={`cell-${holder}`}>
              <span className="time">{e.time}</span>
              <span>
                <Tag h={holder} /> {e.fact}
                {holder !== "both" && (
                  <span className="qa">
                    {holder === "A" ? "B" : "A"} asks: {e.question}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <Solution text={explanation} />
    </>
  );
}

function Solution({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="solution">
      <h4>Final task answer</h4>
      <p>{text}</p>
    </div>
  );
}
