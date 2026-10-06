"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui";

/** Resolve an existing approver's photo using an exact directory email match. */
export default function ApproverAvatar({ name, email }: { name: string; email?: string }) {
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    setPhoto(null);
    if (!email) return;
    const controller = new AbortController();
    fetch(`/api/directory/search?q=${encodeURIComponent(email)}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((result) => {
        if (controller.signal.aborted || !result.ok) return;
        const person = result.items?.find((item: { email?: string }) => item.email?.toLowerCase() === email.toLowerCase());
        if (person?.avatar_url) setPhoto(person.avatar_url);
      })
      .catch(() => {}); // The initials remain visible if directory access is unavailable.
    return () => controller.abort();
  }, [email]);
  return photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photo} alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-full object-cover" onError={() => setPhoto(null)} />
  ) : <Avatar name={name} size={36} />;
}
