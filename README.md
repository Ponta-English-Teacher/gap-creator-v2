# Gap Creator

Create information-gap pairwork activities for English classes.
Student A has information Student B needs, and Student B has information Student A needs.

The teacher generates and checks an activity, then creates one student link + QR code.
Students open it, choose Student A or Student B, and see only their own material.
There are no accounts, no database and no activity library.

## Activities

Teachers see student-centred names; the code keeps the original type ids, so saved activities keep working.
The first release is Spot the Differences, How Do I Get There? and Make the Best Choice. The others carry
`inDevelopment` in `lib/activityTypes.ts`, which shows a badge on their card and a notice above their setup.

| Teacher sees | Type id | Status |
| --- | --- | --- |
| Spot the Differences | `picture` | available |
| How Do I Get There? | `map` | available |
| Make a Plan! | `schedule` | in development: marked "not ready yet", still usable (constraints planned) |
| Make the Best Choice | `profile` | available |
| What Happened? | `story` | in development: marked "not ready yet", still usable (student view redesign planned) |
| Complete the Table | `text` | in development: marked "not ready yet", still usable until the guessing games replace it; saved ones keep opening |
| Who Am I? / What's in My Bag? / Guess My Weekend! / Guess the Rules! | — | shown as "Coming soon" |
| Create Your Own Activity | — | shown as "Coming soon" |

Setup is the same for every activity: level, scenario (chosen from a list or typed), difficulty and class size.
Difficulty fills in the activity's own settings (`applyDifficulty` in `lib/activityTypes.ts`) and adds an
activity-specific instruction to the prompt (`DIFFICULTY_GUIDE` in `lib/activityPrompts.ts`). The description the
teacher reads, the preset and the prompt guide must be kept in step.

## Tests

`npm test` compiles `tests/` and runs Node's test runner (no AI calls). It checks the route calculations
(distance, time, traffic lights, railway crossings, closures) and the rules every generated map must obey, for
every environment at every difficulty.

## Start locally

1. Install Node.js 20 or newer.
2. In this folder:

   ```bash
   npm install
   cp .env.example .env.local
   ```

3. Open `.env.local` and set `OPENAI_API_KEY=...`. Never put the key in source code.
4. `npm run dev` and open http://localhost:3000

### Environment variables (`.env.local`)

| Variable | Required | Default |
| --- | --- | --- |
| `OPENAI_API_KEY` | yes | — |
| `OPENAI_TEXT_MODEL` | no | `gpt-5.4-mini` |
| `OPENAI_IMAGE_MODEL` | no | `gpt-image-2` (Picture Gap only) |

## Sharing with students

- **Create Student Link** stores the approved activity and returns a short id. Student page:
  `/activity/<id>` → choose A or B → `/activity/<id>?role=A`. It is rendered on the server for one role only,
  so the other student's material and the answer key never reach that phone. It never calls OpenAI.
- Each shared activity is up to three files under `shared/<id>/`: `activity.json`, `a.jpg`, `b.jpg`.
- **Student self-check** (Spot the Differences, How Do I Get There?, What Happened?): unless the teacher turns
  off "Allow students to check answers", the student page has a **Check Answers** button. After the student
  confirms they have finished, the server sends `?check=1`: both pictures (differences behind **Show
  Differences**), the complete map (routes stay in the teacher's Answer Key), or the whole timeline (explanation
  behind **Show Explanation**). Nothing is regenerated and nothing extra is sent before that. Activities shared
  before the option existed have no setting and are treated as allowed.

### Where shared activities are stored (`lib/shareStore.ts`)

| Situation | Storage |
| --- | --- |
| `BLOB_STORE_ID` or `BLOB_READ_WRITE_TOKEN` is set | Vercel Blob, **private** store |
| Neither is set (normal local development) | local disk: `.data/shared/<id>/` |
| Running on Vercel with no Blob store connected | sharing fails with a clear "connect a Blob store" message |

Links stop working after 30 days. Old files are deleted opportunistically each time a new activity is
shared (no scheduler).

**Local use on phones:** open the teacher page with the computer's network address (the "Network:" line
printed by `npm run dev`), not `localhost` — the QR code uses the address the teacher page was opened with.

### Vercel setup (when deploying)

1. In the Vercel project: **Storage → Create → Blob → Access: Private**, and connect it to the project
   (all environments). Vercel then provides `BLOB_STORE_ID` and authentication automatically.
2. Add `OPENAI_API_KEY` (and optionally `OPENAI_TEXT_MODEL`, `OPENAI_IMAGE_MODEL`) as environment variables.

## How it works

1. The teacher chooses an activity type; the form shows only the questions for that type.
2. **One** text request (`/api/generate`) returns a structured activity (JSON schema, validated with zod):
   one complete set of source information + instructions + teacher guide + useful language.
3. The app, not the AI, divides the information between Student A and Student B
   (`lib/gapLogic.ts`), so both views always come from the same data and both students ask and answer.
4. Picture Gap: the text model writes a scene specification with exact differences. The app draws
   Student A's picture, then **edits** that picture to make Student B's (only the listed differences).
   Consistency is good but not guaranteed; the teacher can redraw pictures only, or regenerate everything.
5. How Do I Get There? (map): no image generation, and the AI gives no positions, routes, distances or times.
   It names the streets and places, says how big each place is and chooses features. The app does the rest:
   - **Environment** (`lib/mapEnvironments.ts`): the teacher's setting is a place, not a task. Downtown business
     district, university campus, shopping district, tourist district or small town centre each decide the kind
     of places, how blocks are divided, which features are there and how the map looks (street widths, ground
     colour). A setting typed by the teacher is matched to an environment by its words; if they do not say,
     the AI picks one.
   - **Town** (`lib/townMap.ts`): streets (fixed grid H0–H3, V1–V3), blocks, one to four buildings per block,
     one street-facing entrance per building, corner buildings, then place names.
   - **Routes** (`routeTo`): computed over the street graph to the entrance. *Shortest* = least distance,
     *fastest* = least time. The walking model is explicit (`WALK`: block lengths, walking speed, waiting at
     traffic lights and railway crossings). Closed street segments are never used.
   - **Route challenges** (`lib/routeTasks.ts`): Easy has none. Intermediate: each student compares two routes
     to a place only their partner can see. Challenging: the direct route is closed by road works drawn only on
     the traveller's map, so the pair has to exchange that and agree on an open route. Answers (`solveRouteTask`)
     are calculated from the stored map and say so honestly when two routes are equal.
   - **Language support** for the map is chosen by the app for the CEFR level and the difficulty
     (`mapUsefulLanguage`), with the teacher's own expressions first. It uses gaps, so it cannot name a place
     or a closed road.
   Maps saved before buildings existed (two lots per block), and maps saved before environments existed, are
   still read and drawn, so old links keep working.

6. Make the Best Choice (`lib/choice.ts`) has two formats, both checked by the app before a teacher sees them:
   - **Choose One**: two students look at a picture of each option and exchange the facts they each hold.
     Then they choose and submit a choice with reasons, in one of two decision formats (`decisionOf`):
     *individual* (each student chooses for themselves and is checked and reviewed against the shared
     conditions and their own wishes; different choices are fine) or *shared* (they agree on one option,
     reviewed against both students' wishes; only for scenarios that need one common choice). The AI
     recommends the format from the scenario and the teacher can override it. All wording the app writes
     (steps, language support, form, reviews, model exchange) follows the format, and the app never states
     that both students agreed or contributed, because it only sees what one student submits.
     The content is written for conversation, not as a table puzzle: a small table of facts every option
     has (2-4 attributes, each a number or yes/no), plus *details* that are true of one option only, each
     told to one student (`detailHolder`), so partners ask "What else do you know about ...?". A student's
     wishes are *priorities* said in a sentence with its motivation ("You do not want to wait long, because
     ..."; rule `low` / `high` / `yes` / `no`, never a figure) and each student also has *interests* the app
     does not check. A *hard* limit with an amount is allowed only where the situation sets one, and no level
     requires it. `chooseOneShape` sets what the CEFR level and the task difficulty ask for; `buildChooseOne`
     rejects an activity that is impossible, gives a wish an exact figure, has an option that is best for
     everything a student (or the pair) cares about, has fewer than two options worth choosing, or has a
     wish that cannot tell options apart. The two students must be different people: different tastes, at
     most one wish in common, and (individual) not the same set of options worth choosing.
     After the calculated checks, a second AI reading (`wordingCheckInput` / `applyWordingCheck`, one small
     request per attempt) says what each wish sentence means and the app compares that with its rule; a
     contradiction, or a description that contradicts or gives away a fact, sends the activity back.
     The same reading corrects Japanese that does not match the English.
     - *Pictures*: one small picture per option, drawn with the existing image model from the option's
       `look` (`generateOptionPictures`). A picture that fails is left out and can be redrawn from the
       preview. When the options are people, the picture is a neutral folder, never a face.
     - *Decision Review*: `reviewOption` works out, for every option, which "Must" conditions it meets and
       where it stands on each priority (best, in between, worst, with the figures), without counting wishes,
       in each attribute's own words ("is the cheapest", "has the longest wait"). Facts the reader has no wish
       about are listed as plain facts, and the page separates "Facts, checked by the app" from "Opinions and
       possibilities".
       The option's own details are listed as "for you to judge", never as right or wrong. The AI adds only "what might happen" and a balanced view, and
       `checkReviews` rejects text that states a consequence as a fact or uses a number that is not in the
       activity. Students get the review of their option from `/api/review` only when they submit; such
       activities have no "Check Answers" page. What the student reads first is a short card
       (`StudentFeedback`): Your choice, Good points, Think about, and, when the teacher turns AI feedback on,
       Your English (their own meaning in one natural sentence, with Japanese). The AI answers the reasons the
       student actually wrote, at the class's CEFR level (one request per submission); `guardFeedback` drops
       points with numbers that are not facts and always states a failed "Must". "Your English" may not
       repeat a claim the facts contradict (`falseSuperlatives`; asked again once, then withheld). AI feedback
       is on by default, with its switch in the main setup. Without AI the card is filled
       from the app's checks (`review.simple`). At A1-A2 the full comparison is folded under "More about this
       choice".
     - *Teacher setup* (`components/ChoiceSetup.tsx`): level, lesson topic, then AI-suggested scenario,
       vocabulary, expressions and grammar, all editable.
     Activities shared before pictures and reviews existed still open with their older page, and ones
     made before priorities and details existed keep their figure-based wishes and wording.
   - **Build a Combination**: students build one order or list for a group. Prices are split between the
     students, and each knows about half of the people. The app sets the budget itself (`buildCombination`):
     enough for every hard condition, not enough for every wish. `solveOrder` finds the cheapest valid order,
     the best order within the budget and what everyone would like, by exact search.
   The generate route asks the AI again (with the reasons) up to four times when a check fails, and reports
   the failure to the teacher if no valid activity results. Conditions are written from their rules, so the
   words and the checks cannot disagree. Language support is written by the app for the CEFR level. Japanese
   translations of the situation and the student's own information are tap-to-show (A1-A2, or Strong support).
   Activities saved in the older profile-table format still open.

The AI is called only when the teacher clicks AI Suggest / AI Assist / Generate / Regenerate / Redraw.
Switching tabs or viewing previews never calls the AI.

## Files

```
app/page.tsx                 page (checks whether the API key is configured)
app/api/generate/route.ts    generate an activity (text + pictures for Picture Gap)
app/api/images/route.ts      redraw Picture Gap pictures from the existing specification
app/api/assist/route.ts      AI Suggest (goal) and AI Assist (target expressions)
app/api/share/route.ts       store an approved activity, return its short id
app/activity/[id]/page.tsx   student page (choose A/B, then only that student's material)
app/activity/[id]/image/[role]/route.ts  serves stored Picture Gap pictures
components/GapCreator.tsx    page state: type, settings, generated activity
components/ActivityAbout.tsx  what the chosen activity is, shown before generating
components/TeacherForm.tsx   setup (level, scenario, difficulty, class) + optional language focus and AI assist
components/TypeSpecificForm.tsx  optional extra settings for each activity
components/ActivityPreview.tsx   Student A / Student B / Answer Key tabs
components/StudentView.tsx   what each student sees
components/AnswerKey.tsx     full information for the teacher
components/ProgrammaticMap.tsx   SVG map for Map Gap
components/TeacherGuide.tsx  "How to Conduct This Activity"
components/SharePanel.tsx    Create Student Link + QR code
lib/shareStore.ts            temporary storage of shared activities (local files or Vercel Blob, 30-day expiry)
lib/openai.ts                the only file that talks to OpenAI (models configured here)
lib/activitySchemas.ts       JSON schemas for AI output
lib/activityPrompts.ts       all prompt text (incl. CEFR progression)
lib/gapLogic.ts              who-sees-what rules, clean-up of AI output
lib/mapEnvironments.ts       map environments (downtown, campus, ...) and map geometry
lib/townMap.ts               the town model, route engine, directions and location descriptions
lib/routeTasks.ts            route challenges, road works, their answers, and the map's language support
lib/activityTypes.ts         names, explanations, scenarios, grammar options and difficulty presets per activity
lib/types.ts                 shared TypeScript types
```
