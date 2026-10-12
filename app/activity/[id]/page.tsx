import type { Metadata } from "next";
import Link from "next/link";
import CheckAnswers from "@/components/CheckAnswers";
import SelfCheck, { SELF_CHECK_REVEALS } from "@/components/SelfCheck";
import StudentView from "@/components/StudentView";
import { TYPE_INFO } from "@/lib/activityTypes";
import { selfCheckAllowed, versionForPair } from "@/lib/gapLogic";
import { loadSharedSet } from "@/lib/shareStore";

export const metadata: Metadata = { title: "Gap Creator – Student" };

/**
 * Student page: choose Pair number → Student A or B.
 * Rendered on the server for ONE pair and ONE role, so other versions and the
 * partner's material are never sent to this phone. Reads stored data only; no AI calls.
 * Self-check (pictures, map, story): if the teacher allows it, "Check Answers" opens ?check=1,
 * and only then is the partner's information sent.
 */
export default async function StudentActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const shared = await loadSharedSet(id);

  if (!shared) {
    return (
      <main className="page student-page">
        <div className="card">
          <h1>Activity not found</h1>
          <p className="big-text">This activity is not available. The link may be wrong, or the activity may have expired.</p>
          <p className="big-text">Please ask your teacher for a new link.</p>
        </div>
      </main>
    );
  }

  const { set } = shared;
  const multiPair = set.pairCount > 1;
  const pairNumber = Number(query.pair);
  // One pair: everyone is "pair 1". Several pairs: the pair must be chosen first.
  const pair = !multiPair ? 1 : Number.isInteger(pairNumber) && pairNumber >= 1 && pairNumber <= set.pairCount ? pairNumber : null;
  const role = query.role === "A" || query.role === "B" ? query.role : null;
  const link = (choice: Record<string, string | number>) => {
    const qs = new URLSearchParams(Object.entries(choice).map(([k, v]) => [k, String(v)])).toString();
    return qs ? `/activity/${id}?${qs}` : `/activity/${id}`;
  };

  // Step 1: choose a pair number.
  if (pair === null) {
    return (
      <main className="page student-page">
        <div className="card choose-role">
          <h1>{TYPE_INFO[set.versions[0].type].name}</h1>
          <p className="big-text">
            Work with a partner.
            <br />
            <strong>You and your partner must choose the same Pair number.</strong>
            <br />
            Then one person chooses Student A and the other chooses Student B.
          </p>
          <h2 className="choose-heading">Choose your Pair number</h2>
          <div className="pair-buttons">
            {Array.from({ length: set.pairCount }, (_, i) => i + 1).map((p) => (
              <Link key={p} className="pair-button" href={link({ pair: p })}>
                Pair {p}
              </Link>
            ))}
          </div>
        </div>
      </main>
    );
  }

  const activity = set.versions[versionForPair(pair, set.versions.length) - 1];
  const pairParam: Record<string, number> = multiPair ? { pair } : {};

  // Step 3: the student's own material.
  if (role) {
    const own = link({ ...pairParam, role });
    if (query.check === "1" && selfCheckAllowed(activity)) {
      return (
        <main className="page student-page">
          <SelfCheck activity={activity} role={role} pair={multiPair ? pair : undefined} />
          <p className="switch-role">
            <Link href={own}>← Back to my page</Link>
          </p>
        </main>
      );
    }
    return (
      <main className="page student-page">
        <StudentView activity={activity} role={role} pair={multiPair ? pair : undefined} shareId={id} />
        {selfCheckAllowed(activity) && <CheckAnswers href={`${own}&check=1`} reveals={SELF_CHECK_REVEALS[activity.type] ?? "the answers"} />}
        <p className="switch-role">
          <Link href={link(pairParam)}>← Wrong student? Go back</Link>
        </p>
      </main>
    );
  }

  // Step 2: choose Student A or B.
  return (
    <main className="page student-page">
      <div className="card choose-role">
        {multiPair && <p className="pair-chosen">Pair {pair}</p>}
        <h1>{activity.title}</h1>
        <p className="big-text">
          {multiPair ? (
            <>
              <strong>Check: your partner also chose Pair {pair}.</strong>
              <br />
            </>
          ) : (
            <>
              Work with a partner.
              <br />
            </>
          )}
          One person chooses Student A and the other chooses Student B.
          <br />
          <strong>Do not show your screen to your partner.</strong>
        </p>
        <div className="role-buttons">
          <Link className="role-button role-A" href={link({ ...pairParam, role: "A" })}>
            Student A
          </Link>
          <Link className="role-button role-B" href={link({ ...pairParam, role: "B" })}>
            Student B
          </Link>
        </div>
        {multiPair && (
          <p className="switch-role">
            <Link href={`/activity/${id}`}>← Choose a different pair</Link>
          </p>
        )}
      </div>
    </main>
  );
}
