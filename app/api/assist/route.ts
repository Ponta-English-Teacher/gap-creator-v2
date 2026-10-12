import { choiceSetupAssist, expressionAssist, goalSuggestions } from "@/lib/activitySchemas";
import { ASSIST_INSTRUCTIONS, choiceSetupInput, expressionAssistInput, goalAssistInput } from "@/lib/activityPrompts";
import { describeError, generateStructured } from "@/lib/openai";
import { CEFR_LEVELS } from "@/lib/types";
import type { ActivityType, CefrLevel, CommonSettings } from "@/lib/types";

/** AI suggestions for the communication goal or target expressions. Never applied automatically. */
export async function POST(request: Request) {
  try {
    const { kind, type, common, cefr, lessonTopic, avoid } = (await request.json()) as {
      kind: "goal" | "expressions" | "choice-setup";
      type: ActivityType;
      common: CommonSettings;
      cefr?: CefrLevel;
      lessonTopic?: string;
      avoid?: string[];
    };
    if (kind === "choice-setup") {
      const level = CEFR_LEVELS.includes(cefr as CefrLevel) ? (cefr as CefrLevel) : "A2";
      const input = choiceSetupInput(level, String(lessonTopic ?? "").slice(0, 120), (Array.isArray(avoid) ? avoid : []).slice(0, 12).map((a) => String(a).slice(0, 120)));
      return Response.json(await generateStructured(choiceSetupAssist, "choice_setup", ASSIST_INSTRUCTIONS, input));
    }
    if (kind === "goal") {
      const result = await generateStructured(goalSuggestions, "goal_suggestions", ASSIST_INSTRUCTIONS, goalAssistInput(type, common));
      return Response.json(result);
    }
    const result = await generateStructured(
      expressionAssist,
      "expression_assist",
      ASSIST_INSTRUCTIONS,
      expressionAssistInput(type, common),
    );
    return Response.json(result);
  } catch (err) {
    console.error("[assist]", err);
    const { status, ...body } = describeError(err);
    return Response.json(body, { status });
  }
}
