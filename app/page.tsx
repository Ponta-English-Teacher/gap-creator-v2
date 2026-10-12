import { connection } from "next/server";
import GapCreator from "@/components/GapCreator";

export default async function Home() {
  // Read the environment at request time, so adding the key only needs a restart.
  await connection();
  return <GapCreator hasApiKey={Boolean(process.env.OPENAI_API_KEY)} />;
}
