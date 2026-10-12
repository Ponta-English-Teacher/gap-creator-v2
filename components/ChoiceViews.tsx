/**
 * "Make the Best Choice" in its two formats (Choose One, Build a Combination):
 *   ChoiceStudent   what one student sees during the activity
 *   ChoiceComplete  everything, marked with who knew it (Answer Key and self-check)
 *   ChoiceAnswers   the possible choices, worked out by the app (Answer Key and self-check)
 * Pure rendering of stored data. Conditions are written from their rules (lib/choice.ts).
 */
import type { ReactNode } from "react";
import type { ChooseOneData, CombinationData } from "@/lib/activitySchemas";
import { allConditions, ASK_MORE, choiceSteps, conditionText, decisionOf, detailHolder, evaluateOptions, formatValue, hasDecisionReview, isChooseOne, mealConditionText, money, personHolder, plural, priceHolder, reviewOption, solveOrder, wishText } from "@/lib/choice";
import type { Order, OwnedCondition } from "@/lib/choice";
import { canSee, profileDetailHolder } from "@/lib/gapLogic";
import type { Holder, Role } from "@/lib/types";
import DecisionReviewView from "./DecisionReview";

type Data = ChooseOneData | CombinationData;

/** Japanese shown only when the student taps. Native <details>, so it works without scripts. */
function Ja({ children }: { children: ReactNode }) {
  return (
    <details className="ja">
      <summary>日本語</summary>
      <div lang="ja">{children}</div>
    </details>
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

function Tag({ h }: { h: Holder }) {
  return <span className={`tag tag-${h}`}>{h === "both" ? "A+B" : h}</span>;
}

/** The top of an option card: its picture (when one was drawn), name and what it is. */
function OptionHead({ option }: { option: ChooseOneData["options"][number] }) {
  return (
    <>
      {option.picture && (
        // eslint-disable-next-line @next/next/no-img-element -- generated or stored option picture
        <img className="option-picture" src={option.picture} alt={option.description || option.name} />
      )}
      <h4>{option.name}</h4>
      {option.description && <p className="option-description">{option.description}</p>}
    </>
  );
}

/** "Must" and "Would like" lists from a set of conditions. */
function Conditions({ items, ja }: { items: { hard: boolean; text: string; ja: string; worded?: boolean }[]; ja: boolean }) {
  // A wish written as a sentence about the student is something they care about, not an item on a list.
  const worded = items.some((i) => i.worded);
  const group = (hard: boolean, label: string, labelJa: string) => {
    const list = items.filter((i) => i.hard === hard);
    if (!list.length) return null;
    return (
      <div className={hard ? "conditions conditions-hard" : "conditions conditions-soft"}>
        <p className="conditions-label">{label}</p>
        <ul>
          {list.map((i) => (
            <li key={i.text}>{i.text}</li>
          ))}
        </ul>
        {ja && (
          <Ja>
            <p className="conditions-label">{labelJa}</p>
            <ul>
              {list.map((i) => (
                <li key={i.ja}>{i.ja}</li>
              ))}
            </ul>
          </Ja>
        )}
      </div>
    );
  };
  return (
    <>
      {group(true, "Must", "必須")}
      {group(false, worded ? "Important to you" : "Would like", worded ? "大切なこと" : "できれば")}
    </>
  );
}

const choiceItems = (conditions: OwnedCondition["condition"][], data: ChooseOneData) => conditions.map((c) => ({ hard: c.kind === "hard", worded: !!c.wish?.trim(), ...wishText(c, data) }));
/** Under a "Would like" heading, "Would like: cheese" reads better as just "cheese". */
const mealItems = (person: CombinationData["people"][number], data: CombinationData) =>
  person.conditions.map((c) => {
    const { text, ja } = mealConditionText(c, data);
    return { hard: c.kind === "hard", text: text.replace(/^Would like: /, ""), ja: ja.replace(/^できれば：/, "") };
  });

/** "Everyone gets one main and one drink. A side is extra." */
function comboRule(data: CombinationData): string {
  const list = (names: string[]) => names.map((n) => `one ${n.toLowerCase()}`).join(" and ");
  const required = data.categories.filter((c) => c.required).map((c) => c.name);
  const optional = data.categories.filter((c) => !c.required).map((c) => c.name);
  return `Everyone gets ${list(required)}.${optional.length ? ` ${optional.map((n) => `A ${n.toLowerCase()}`).join(" or ")} is extra: one each at most.` : ""}`;
}

// ---------- During the activity ----------

export function ChoiceStudent({ data, role, hints, ja }: { data: Data; role: Role; hints: boolean; ja: boolean }) {
  const steps = choiceSteps(data);
  return (
    <div className="choice">
      <section>
        <h4>1. The situation</h4>
        <p className="choice-situation">{data.situation}</p>
        {ja && <Ja>{data.situationJa}</Ja>}
        {isChooseOne(data) ? (
          <Conditions items={choiceItems(data.shared, data)} ja={ja} />
        ) : (
          <div className="conditions conditions-hard">
            <p className="conditions-label">Must</p>
            <ul>
              <li>
                Total: {money(data, data.budget)} or less <span className="muted">(for everyone together)</span>
              </li>
              <li>{comboRule(data)}</li>
            </ul>
          </div>
        )}
      </section>

      {isChooseOne(data) ? (
        <>
          <section>
            <h4>2. The {plural(data.optionNoun)}</h4>
            <div className="profile-grid">
              {data.options.map((o, oi) => (
                <div key={o.name} className="profile-card">
                  <OptionHead option={o} />
                  <dl>
                    {data.attributes.map((a, ai) => (
                      <div key={a.name} className="profile-row">
                        <dt>{a.name}</dt>
                        <dd>{canSee(profileDetailHolder(oi, ai), role) ? formatValue(a, o.values[ai]) : <Unknown question={hints ? a.question.replace("...", o.name) : undefined} />}</dd>
                      </div>
                    ))}
                    {(o.details ?? []).map((d, di) => (
                      // Keyed by position: a key is sent to the browser, and the text may be something only the partner knows.
                      <div key={di} className="profile-row profile-row-detail">
                        <dt>{di === 0 ? "Also" : ""}</dt>
                        <dd>
                          {canSee(detailHolder(oi, di), role) ? (
                            <>
                              {d.text}
                              {ja && d.textJa && <Ja>{d.textJa}</Ja>}
                            </>
                          ) : (
                            <Unknown question={hints ? ASK_MORE.replace("...", o.name) : undefined} />
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </section>
          <section className={`choice-own choice-own-${role}`}>
            <h4>3. About you</h4>
            <p>
              <strong>You are the {data.students[role].role}.</strong> {data.students[role].about}
            </p>
            {ja && <Ja>{data.students[role].aboutJa}</Ja>}
            <Conditions items={choiceItems(data.students[role].conditions, data)} ja={ja} />
            {data.students[role].interests?.trim() && (
              <div className="conditions conditions-soft">
                <p className="conditions-label">More about you</p>
                <p>{data.students[role].interests}</p>
                {ja && data.students[role].interestsJa && <Ja>{data.students[role].interestsJa}</Ja>}
              </div>
            )}
            <p className="choice-private">
              Your partner cannot see this.{" "}
              {decisionOf(data) === "individual"
                ? "They want different things, and they choose for themselves."
                : `Tell them what you ${data.students[role].conditions.some((c) => c.kind === "hard") ? "need" : "would like"}.`}
            </p>
          </section>
        </>
      ) : (
        <>
          <section className={`choice-own choice-own-${role}`}>
            <h4>2. The people you know about</h4>
            {data.people.map(
              (p, i) =>
                personHolder(i) === role && (
                  <div key={p.name} className="choice-person">
                    <p>
                      <strong>{p.name}.</strong> {p.about}
                    </p>
                    {ja && <Ja>{p.aboutJa}</Ja>}
                    <Conditions items={mealItems(p, data)} ja={ja} />
                  </div>
                ),
            )}
            <p className="choice-private">
              Your partner cannot see this. Ask your partner about: <strong>{data.people.filter((_, i) => personHolder(i) !== role).map((p) => p.name).join(", ")}</strong>.
            </p>
          </section>
          <section>
            <h4>3. The menu</h4>
            <Menu data={data} show={(i) => canSee(priceHolder(i), role)} />
          </section>
        </>
      )}

      <section>
        <h4>{isChooseOne(data) ? "4. Ask and share" : "4. Exchange information"}</h4>
        <ul>
          {steps.exchange.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>
      <section className="final-task">
        <h4>{!hasDecisionReview(data) ? "5. Negotiate and decide" : decisionOf(data) === "individual" ? "5. Make your own choice" : "5. Discuss and agree on one"}</h4>
        <p>{steps.decide}</p>
      </section>
    </div>
  );
}

function Menu({ data, show, tags }: { data: CombinationData; show: (itemIndex: number) => boolean; tags?: boolean }) {
  return (
    <div className="menu">
      {data.categories.map((c) => (
        <div key={c.name} className="menu-category">
          <p className="menu-title">
            {c.name} {!c.required && <span className="muted">(extra)</span>}
          </p>
          <ul>
            {data.items.map(
              (item, i) =>
                item.category.toLowerCase() === c.name.toLowerCase() && (
                  <li key={item.name}>
                    <span>
                      {item.name}
                      {item.tags.length > 0 && <span className="menu-tags"> {item.tags.join(", ")}</span>}
                    </span>
                    <span className="menu-price">
                      {tags && <Tag h={priceHolder(i)} />} {show(i) ? money(data, item.price) : <Unknown />}
                    </span>
                  </li>
                ),
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ---------- Everything, with who knew it ----------

export function ChoiceComplete({ data }: { data: Data }) {
  return (
    <div className="choice">
      <section>
        <h4>The situation</h4>
        {isChooseOne(data) && hasDecisionReview(data) && (
          <p className="self-check-note">
            <strong>{decisionOf(data) === "individual" ? "Individual decision." : "Shared decision."}</strong>{" "}
            {decisionOf(data) === "individual"
              ? "After exchanging information, each student chooses for themselves. Different choices are fine, and each student is reviewed against their own wishes."
              : "After exchanging information, the two students negotiate and agree on one option, which is reviewed against the wishes of both."}
            {data.decisionWhy ? ` ${data.decisionWhy}` : ""}
          </p>
        )}
        <p className="choice-situation">{data.situation}</p>
        {isChooseOne(data) ? (
          <Conditions items={choiceItems(data.shared, data)} ja={false} />
        ) : (
          <p>
            <strong>Budget (set by the app): {money(data, data.budget)}.</strong> {comboRule(data)}
          </p>
        )}
      </section>
      {isChooseOne(data) ? (
        <>
          {(["A", "B"] as Role[]).map((r) => (
            <section key={r} className={`choice-own choice-own-${r}`}>
              <h4>
                <Tag h={r} /> Student {r}: the {data.students[r].role}
              </h4>
              <p>{data.students[r].about}</p>
              <Conditions items={choiceItems(data.students[r].conditions, data)} ja={false} />
              {data.students[r].interests?.trim() && (
                <p>
                  <strong>More about them (opinion, not checked):</strong> {data.students[r].interests}
                </p>
              )}
            </section>
          ))}
          <section>
            <h4>All the {plural(data.optionNoun)}</h4>
            <div className="profile-grid">
              {data.options.map((o, oi) => (
                <div key={o.name} className="profile-card">
                  <OptionHead option={o} />
                  <dl>
                    {data.attributes.map((a, ai) => (
                      <div key={a.name} className={`profile-row cell-${profileDetailHolder(oi, ai)}`}>
                        <dt>{a.name}</dt>
                        <dd>
                          <Tag h={profileDetailHolder(oi, ai)} /> {formatValue(a, o.values[ai])}
                        </dd>
                      </div>
                    ))}
                    {(o.details ?? []).map((d, di) => (
                      <div key={d.text} className={`profile-row profile-row-detail cell-${detailHolder(oi, di)}`}>
                        <dt>{di === 0 ? "Also" : ""}</dt>
                        <dd>
                          <Tag h={detailHolder(oi, di)} /> {d.text}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <>
          <section>
            <h4>The people</h4>
            {data.people.map((p, i) => (
              <div key={p.name} className={`choice-person choice-own choice-own-${personHolder(i)}`}>
                <p>
                  <Tag h={personHolder(i)} /> <strong>{p.name}.</strong> {p.about}
                </p>
                <Conditions items={mealItems(p, data)} ja={false} />
              </div>
            ))}
          </section>
          <section>
            <h4>The menu with every price</h4>
            <Menu data={data} show={() => true} tags />
          </section>
        </>
      )}
    </div>
  );
}

// ---------- The Decision Review of every option ----------

export function ChoiceReviews({ data }: { data: ChooseOneData }) {
  // Individual decision: each student is reviewed against their own wishes, so there is a set of reviews for each.
  const roles: (Role | undefined)[] = decisionOf(data) === "individual" ? ["A", "B"] : [undefined];
  return (
    <div className="review-list">
      {roles.map((role) => (
        <div key={role ?? "both"}>
          {role && (
            <h5 className="review-for">
              <Tag h={role} /> What Student {role} sees after choosing each {data.optionNoun}
            </h5>
          )}
          {data.options.map((o, i) => (
            <DecisionReviewView key={o.name} review={reviewOption(data, i, role)} compact />
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------- The possible choices ----------

function OrderBox({ title, note, order, data }: { title: string; note: string; order: Order; data: CombinationData }) {
  return (
    <div className="order">
      <h5>{title}</h5>
      <p>{note}</p>
      <ul>
        {order.meals.map((m) => (
          <li key={m.person}>
            <strong>{m.person}:</strong> {m.items.join(" + ")} <span className="muted">({money(data, m.cost)})</span>
            {m.wishesMissed.length > 0 && <span className="order-missed"> gives up “{m.wishesMissed.join("”, “")}”</span>}
          </li>
        ))}
      </ul>
      <p className="order-total">
        {order.lines.map((l) => `${l.quantity} × ${l.item}`).join(", ")} = <strong>{money(data, order.total)}</strong> · wishes granted: {order.wishesMet} of {order.wishesTotal}
      </p>
    </div>
  );
}

/** Which options are possible and what each offers and gives up: for both students together, or for one student's own choice. */
function OptionReports({ data, role }: { data: ChooseOneData; role?: Role }) {
  const reports = evaluateOptions(data, role);
  const mine = (c: OwnedCondition) => !role || c.owner === "shared" || c.owner === role;
  const who = (c: OwnedCondition) => (c.owner === "shared" ? "shared" : `Student ${c.owner}`);
  // One student's own list needs no name on every line.
  const list = (items: OwnedCondition[]) => items.map((c) => `${role ? "" : `${who(c)}: `}${conditionText(c.condition, data, false).text}`).join("; ");
  const and = (names: string[]) => (names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);
  const good = reports.filter((r) => r.defensible);
  const must = allConditions(data).some((c) => mine(c) && c.condition.kind === "hard");
  const names = and(good.map((r) => r.name));
  return (
    <>
      <ul className="choice-reports">
        {reports.map((r) => (
          <li key={r.name} className={r.possible ? (r.defensible ? "report-good" : "report-possible") : "report-out"}>
            <strong>{r.name}:</strong>{" "}
            {r.possible ? (
              <>
                possible.
                {r.wishesMet.length > 0 && <> Strong for: {list(r.wishesMet)}.</>}
                {r.wishesPartly.length > 0 && <> In the middle for: {list(r.wishesPartly)}.</>}
                {r.wishesMissed.length > 0 && <> Gives up: {list(r.wishesMissed)}.</>}
                {r.beatenBy.length > 0 && <> {and(r.beatenBy)} {r.beatenBy.length > 1 ? "are" : "is"} as good or better on each of these.</>}
              </>
            ) : (
              <>not possible. Fails: {list(r.failed)}.</>
            )}
          </li>
        ))}
      </ul>
      <p className="choice-verdict">
        {role
          ? good.length === 1
            ? `On the facts the app can check, ${names} serves Student ${role}’s wishes best.`
            : `${names} are ${good.length === 2 ? "both" : "all"} reasonable choices for Student ${role}${must ? ", and each meets every “Must” condition that applies to them" : ""}. Each is stronger for something they care about, so the choice depends on what Student ${role} decides matters most.`
          : good.length === 1
            ? `On the facts the app can check, ${names} serves the two students’ wishes best${must ? " and meets every “Must” condition" : ""}.`
            : `${names} are ${good.length === 2 ? "both" : "all"} reasonable answers. ${must ? "Each meets every “Must” condition, and each" : "There are no “Must” conditions in this activity, and each"} is stronger for something one of the students cares about, so the right choice depends on what the students decide matters most.`}{" "}
        Any {data.optionNoun} marked “possible” can be accepted if {role ? "the student explains" : "students explain"} the choice: tastes, and what they think of each {data.optionNoun}’s own details, are not something the app can check.
      </p>
    </>
  );
}

export function ChoiceAnswers({ data }: { data: Data }) {
  if (isChooseOne(data)) {
    if (decisionOf(data) === "individual")
      return (
        <div className="choice-answers">
          {(["A", "B"] as Role[]).map((role) => (
            <div key={role}>
              <h5 className="review-for">
                <Tag h={role} /> Student {role}’s own choice
              </h5>
              <OptionReports data={data} role={role} />
            </div>
          ))}
          <p className="route-assumptions">Checked by the app. Each student is checked against the shared conditions and their own; the two students do not have to choose the same {data.optionNoun}.</p>
        </div>
      );
    return (
      <div className="choice-answers">
        <OptionReports data={data} />
        <p className="route-assumptions">Checked by the app against every condition.</p>
      </div>
    );
  }
  const solution = solveOrder(data, data.budget);
  if (!solution) return null;
  const over = solution.ideal.total - data.budget;
  return (
    <div className="choice-answers">
      <OrderBox
        title="A good order within the budget"
        note={`The most wishes that ${money(data, data.budget)} can pay for. Other orders with the same number of wishes are just as good.`}
        order={solution.best}
        data={data}
      />
      <OrderBox title="The cheapest order that is allowed" note="It meets every “Must” condition and nothing more." order={solution.cheapest} data={data} />
      <OrderBox
        title="What everyone would like"
        note={`Not possible: it costs ${money(data, over)} more than the budget. This is why students have to decide who gives something up.`}
        order={solution.ideal}
        data={data}
      />
      <p className="route-assumptions">Prices, totals and conditions are checked by the app. Any order that meets every “Must” condition and costs {money(data, data.budget)} or less is acceptable.</p>
    </div>
  );
}
