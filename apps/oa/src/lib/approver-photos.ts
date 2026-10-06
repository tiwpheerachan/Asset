import "server-only";
import { searchDirectory } from "./directory";
import type { FlowNodeFull, User } from "./types";

/** Only load photos of potential approvers in this template; never expose directory search to requesters. */
export async function approverPhotos(nodes: FlowNodeFull[], users: User[]): Promise<Record<number, string>> {
  const members = nodes.filter((node) => node.active).flatMap((node) => node.members);
  const people = users.filter((user) => user.active && user.email && members.some((member) =>
    member.source === "USER" ? member.user_id === user.id : member.job_role === user.job_role
  ));
  const photos: Record<number, string> = {};
  await Promise.all(people.map(async (user) => {
    if (user.avatar_url) { photos[user.id] = user.avatar_url; return; }
    const result = await searchDirectory(user.email, AbortSignal.timeout(3000));
    if (!result.ok) return;
    const person = result.items.find((item) => item.email?.toLowerCase() === user.email.toLowerCase());
    if (person?.avatar_url) photos[user.id] = person.avatar_url;
  }));
  return photos;
}
