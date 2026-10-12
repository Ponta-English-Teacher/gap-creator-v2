import { ACTIVITY_GROUPS, ACTIVITY_TYPES, UPCOMING_ACTIVITIES } from "@/lib/activityTypes";
import type { ActivityType } from "@/lib/types";

export default function ActivityTypeSelector({
  selected,
  onSelect,
}: {
  selected: ActivityType | null;
  onSelect: (type: ActivityType) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Activity">
      {ACTIVITY_GROUPS.map((group) => (
        <div key={group} className="type-group">
          <h3 className="type-group-title">{group}</h3>
          <div className="type-grid">
            {ACTIVITY_TYPES.filter((t) => t.group === group).map((t) => (
              <button
                key={t.type}
                role="radio"
                aria-checked={selected === t.type}
                className={`type-card ${selected === t.type ? "selected" : ""}`}
                onClick={() => onSelect(t.type)}
              >
                {t.inDevelopment && <span className="type-badge type-badge-dev">In development · not ready yet</span>}
                <span className="type-name">{t.name}</span>
                <span className="type-summary">{t.summary}</span>
              </button>
            ))}
            {UPCOMING_ACTIVITIES.filter((t) => t.group === group).map((t) => (
              <div key={t.name} className="type-card type-card-upcoming">
                <span className="type-badge">Coming soon</span>
                <span className="type-name">{t.name}</span>
                <span className="type-summary">{t.summary}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
