import { loadSharedImage } from "@/lib/shareStore";

/**
 * Serves a stored Picture Gap picture. Never calls the image API.
 * The last URL segment is the picture name: "v2-a" (version 2, Student A), or "a"/"b" for older links.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; role: string }> }) {
  const { id, role: name } = await params;
  const image = await loadSharedImage(id, name);
  if (!image) return new Response("Picture not found or expired.", { status: 404 });
  return new Response(new Uint8Array(image), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" },
  });
}
