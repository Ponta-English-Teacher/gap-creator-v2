/** Explains the chosen activity before anything is generated. */
import { TYPE_INFO } from "@/lib/activityTypes";
import type { ActivityType } from "@/lib/types";

export default function ActivityAbout({ type }: { type: ActivityType }) {
  const { name, summary, about, inDevelopment } = TYPE_INFO[type];
  return (
    <section className="card about">
      <h2>{name}</h2>
      {inDevelopment && (
        <p className="about-dev" role="note">
          <strong>In development: not ready for classroom use yet.</strong> This activity is not part of the current release. You can try it, but it has not been fully checked and it will change.
        </p>
      )}
      <p className="about-summary">{summary}</p>
      <div className="about-grid">
        <div className="about-box about-A">
          <p className="about-label">Student A gets</p>
          <p>{about.studentA}</p>
        </div>
        <div className="about-box about-B">
          <p className="about-label">Student B gets</p>
          <p>{about.studentB}</p>
        </div>
      </div>
      <dl className="about-list">
        <div>
          <dt>Why they talk</dt>
          <dd>{about.why}</dd>
        </div>
        <div>
          <dt>They finish when</dt>
          <dd>{about.finish}</dd>
        </div>
        <div>
          <dt>Language practised</dt>
          <dd>{about.practises}</dd>
        </div>
      </dl>
      <p className="about-label">Example</p>
      <div className="demo">
        {about.dialogue.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      {about.note && <p className="about-note">{about.note}</p>}
    </section>
  );
}
