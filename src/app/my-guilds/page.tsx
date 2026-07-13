// The installer home moved from /my-guilds → /my-guides (spelling fix). This
// stub permanently redirects any old bookmark or saved link to the new URL.
import { permanentRedirect } from "next/navigation";

export const dynamic = "force-static";

export default function MyGuildsRedirect(): never {
  permanentRedirect("/my-guides");
}
