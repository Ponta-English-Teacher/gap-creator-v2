import type { Activity } from "@/lib/types";

export default function TeacherGuide({ activity }: { activity: Activity }) {
  const g = activity.teacherGuide;
  return (
    <section className="card guide">
      <h2>How to Conduct This Activity</h2>

      <div className="guide-goal">
        <p>
          <strong>Communication goal:</strong> {activity.communicationGoal}
        </p>
        {activity.targetExpressions?.length > 0 && (
          <p>
            <strong>Target expressions:</strong> {activity.targetExpressions.join(" · ")}
          </p>
        )}
      </div>

      <h3>What students will do</h3>
      <p>{g.whatStudentsDo}</p>

      <h3>How to explain it to students</h3>
      <blockquote className="script">{g.explanationScript}</blockquote>

      <h3>Procedure</h3>
      <ol className="procedure">
        {g.procedure.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>

      {g.demoExchange.length > 0 && (
        <>
          <h3>Demonstrate first</h3>
          <div className="demo">
            {g.demoExchange.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </>
      )}

      <h3>Useful Student Language</h3>
      <div className="language-groups">
        {(activity.usefulLanguage ?? []).map((group) => (
          <div key={group.purpose}>
            <p className="language-purpose">{group.purpose}</p>
            <ul>
              {group.expressions.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {g.tips.length > 0 && (
        <>
          <h3>Tips</h3>
          <ul>
            {g.tips.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
