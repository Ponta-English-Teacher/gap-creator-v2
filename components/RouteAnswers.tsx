/**
 * Answers to the route challenges of a map, worked out by the app from the stored map
 * (lib/routeTasks.ts). Used by the teacher's Answer Key and by the student self-check.
 */
import type { MapData } from "@/lib/activitySchemas";
import { routeSolutions, waitingRules } from "@/lib/routeTasks";
import { aboutMeters, aboutMinutes, WALK } from "@/lib/townMap";

export default function RouteAnswers({ data }: { data: MapData }) {
  const solutions = routeSolutions(data);
  if (!solutions.length) return null;
  const rules = waitingRules(data);
  return (
    <div className="route-answers">
      {solutions.map((s) => (
        <div key={s.task.for} className={`route-answer cell-${s.task.for}`}>
          <h5>
            Student {s.task.for}: from START to the {s.task.place}
          </h5>
          {s.closure && (
            <p>
              <strong>Closed road:</strong> {s.closure.label} (only on Student {s.closure.knownBy}’s map).
            </p>
          )}
          <ul>
            {s.options.map((o) => (
              <li key={o.label} className={o.blocked ? "route-blocked" : undefined}>
                <strong>{o.label}:</strong> {o.directions}
                <span className="route-numbers">
                  {aboutMeters(o.meters)} · {aboutMinutes(o.minutes)} · {o.turns} turn{o.turns === 1 ? "" : "s"}
                  {o.waits > 0 && ` · ${o.waits} wait${o.waits === 1 ? "" : "s"}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="route-verdict">{s.verdict}</p>
        </div>
      ))}
      <p className="route-assumptions">
        Calculated by the app: a block is {WALK.blockEastWest} m east–west and {WALK.blockNorthSouth} m north–south, walking is {WALK.speed} m a minute.
        {rules && ` ${rules}`} Other routes of the same length are just as good.
      </p>
    </div>
  );
}
