/**
 * Exactly what one student sees. Pure rendering of the stored activity:
 * no AI calls, and the same data as the other student and the answer key.
 */
import { decisionOf, hasDecisionReview, isChooseOne, isCombination, reviewOption } from "@/lib/choice";
import { canSee, mapPlaceHolders, profileDetailHolder, showsTranslations, storyEventHolder, studentUsefulLanguage, textCellHolder } from "@/lib/gapLogic";
import type { Activity, ActivityOf, Role } from "@/lib/types";
import { routeTaskText } from "@/lib/routeTasks";
import { ChoiceStudent } from "./ChoiceViews";
import DecisionForm from "./DecisionForm";
import ProgrammaticMap from "./ProgrammaticMap";

/**
 * `shareId` is given on a student's phone. Without it (the teacher's preview) the Decision Review
 * is worked out in the page; with it, the review is only fetched when the student submits.
 */
export default function StudentView({ activity, role, pair, shareId }: { activity: Activity; role: Role; pair?: number; shareId?: string }) {
  const strongSupport = activity.support === "Strong support";
  const usefulLanguage = studentUsefulLanguage(activity);
  // Make the Best Choice lays out its own five steps, including the instructions and the decision.
  const choice = activity.type === "profile" && (isChooseOne(activity.data) || isCombination(activity.data)) ? activity.data : null;
  return (
    <article className={`student-sheet sheet-${role}`}>
      <div className="sheet-header">
        <span className={`role-badge role-${role}`}>{pair ? `Pair ${pair} — Student ${role}` : `Student ${role}`}</span>
        <h3>{activity.title}</h3>
      </div>
      {!choice && <p className="sheet-instructions">{role === "A" ? activity.studentInstructionsA : activity.studentInstructionsB}</p>}
      <p className="sheet-rule">🙈 Do not show your screen to your partner.</p>

      {activity.type === "picture" && <PictureStudent activity={activity} role={role} />}
      {activity.type === "text" && <TextStudent activity={activity} role={role} hints={strongSupport} />}
      {activity.type === "schedule" && <ScheduleStudent activity={activity} role={role} />}
      {activity.type === "map" && <MapStudent activity={activity} role={role} />}
      {choice && <ChoiceStudent data={choice} role={role} hints={strongSupport} ja={showsTranslations(activity)} />}
      {activity.type === "profile" && !choice && <ProfileStudent activity={activity} role={role} hints={strongSupport} />}
      {activity.type === "story" && <StoryStudent activity={activity} role={role} />}

      {activity.finalTask && !choice && (
        <div className="final-task">
          <h4>Final task</h4>
          <p>{activity.finalTask}</p>
        </div>
      )}

      {activity.support !== "None" && usefulLanguage.length > 0 && (
        <div className="useful-language">
          <h4>Useful language</h4>
          <div className="language-groups">
            {usefulLanguage.map((g) => (
              <div key={g.purpose}>
                <p className="language-purpose">{g.purpose}</p>
                <ul>
                  {g.expressions.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {choice && hasDecisionReview(choice) && (
        <DecisionForm
          optionNoun={choice.optionNoun}
          options={choice.options.map((o) => ({ name: o.name, picture: o.picture }))}
          cefr={activity.cefr}
          decision={decisionOf(choice)}
          role={role}
          ja={showsTranslations(activity)}
          feedbackOn={activity.reasonFeedback === true}
          shared={shareId ? { id: shareId, pair } : undefined}
          preview={shareId ? undefined : choice.options.map((_, i) => reviewOption(choice, i, role))}
        />
      )}
    </article>
  );
}

function Unknown({ question }: { question?: string }) {
  return (
    <span className="unknown">
      <span className="unknown-mark">?</span>
      {question && <span className="unknown-question">Ask: {question}</span>}
    </span>
  );
}

function PictureStudent({ activity, role }: { activity: ActivityOf<"picture">; role: Role }) {
  if (!activity.images) return <p className="notice">The pictures have not been drawn yet.</p>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- generated data URL, next/image adds nothing here
    <img className="picture" src={role === "A" ? activity.images.a : activity.images.b} alt={`Student ${role}'s picture`} />
  );
}

function TextStudent({ activity, role, hints }: { activity: ActivityOf<"text">; role: Role; hints: boolean }) {
  const { subjects, rows } = activity.data;
  return (
    <div className="table-wrap">
      <table className="gap-table">
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
              {row.cells.map((cell, c) => (
                <td key={c}>{canSee(textCellHolder(r, c), role) ? cell.answer : <Unknown question={hints ? cell.question : undefined} />}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScheduleStudent({ activity, role }: { activity: ActivityOf<"schedule">; role: Role }) {
  const { columns, timeSlots, sections } = activity.data;
  return (
    <>
      {sections.map((section) => (
        <div key={section.heading} className="table-wrap">
          <h4>{section.heading}</h4>
          <table className="gap-table">
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
                    return <td key={c}>{cell && canSee(cell.knownBy, role) ? cell.text : <Unknown />}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

function MapStudent({ activity, role }: { activity: ActivityOf<"map">; role: Role }) {
  const holders = mapPlaceHolders(activity.data.places);
  const toFind = activity.data.places.filter((_, i) => !canSee(holders[i], role));
  const task = activity.data.routeTasks?.find((t) => t.for === role);
  return (
    <>
      <ProgrammaticMap data={activity.data} view={role} />
      <div className="find-list">
        <h4>Ask your partner. Find these places:</h4>
        <ul className="checklist">
          {toFind.map((p) => (
            <li key={p.name}>☐ {p.name}</li>
          ))}
        </ul>
        <p>Your partner does not know the places with names on your map. Help them find them.</p>
      </div>
      {task && (
        <div className="route-task">
          <h4>Your route challenge</h4>
          <p>{routeTaskText(task, activity.data)}</p>
        </div>
      )}
    </>
  );
}

/** The older profile table (activities made before the two decision formats). */
function ProfileStudent({ activity, role, hints }: { activity: ActivityOf<"profile">; role: Role; hints: boolean }) {
  const data = activity.data;
  if (!("profiles" in data)) return null;
  return (
    <div className="profile-grid">
      {data.profiles.map((p, pi) => (
        <div key={p.name} className="profile-card">
          <h4>{p.name}</h4>
          <dl>
            {p.details.map((d, di) => (
              <div key={di} className="profile-row">
                <dt>{d.category}</dt>
                <dd>{canSee(profileDetailHolder(pi, di), role) ? d.value : <Unknown question={hints ? d.question : undefined} />}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

function StoryStudent({ activity, role }: { activity: ActivityOf<"story">; role: Role }) {
  const { background, events } = activity.data;
  return (
    <>
      <p className="story-background">{background}</p>
      <ol className="timeline">
        {events.map((e, i) =>
          canSee(storyEventHolder(i, events.length), role) ? (
            <li key={i}>
              <span className="time">{e.time}</span>
              <span>{e.fact}</span>
            </li>
          ) : (
            <li key={i} className="timeline-gap">
              <span className="time">{e.time}</span>
              <span>
                <strong>{e.question}</strong> Ask your partner.
              </span>
            </li>
          ),
        )}
      </ol>
    </>
  );
}
