import "server-only";

import { db } from "@/lib/db";

export interface AccountProfile {
  name: string | null;
  email: string;
  image: string | null;
}

function profileSelect() {
  return {
    name: true,
    email: true,
    image: true,
  } as const;
}

export async function getCurrentUserProfile(userId: string): Promise<AccountProfile> {
  const profile = await db.user.findUnique({
    where: { id: userId },
    select: profileSelect(),
  });

  if (!profile) {
    throw new Error("profile_not_found");
  }

  return profile;
}

export async function updateCurrentUserName(
  userId: string,
  name: string,
): Promise<AccountProfile> {
  return db.user.update({
    where: { id: userId },
    data: { name },
    select: profileSelect(),
  });
}