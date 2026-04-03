const API_BASE_PATH = "/api";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_PATH}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    let errorMessage = `API request failed with status ${response.status}`;
    let errorCode: string | undefined;

    try {
      const errorBody = (await response.json()) as { message?: string; code?: string };
      if (errorBody.message) {
        errorMessage = errorBody.message;
      }
      errorCode = errorBody.code;
    } catch {
      // Ignore JSON parsing errors and keep default message.
    }

    throw new ApiError(errorMessage, response.status, errorCode);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength === "0") {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export type PostSummary = {
  id: string;
  title: string;
  slug: string;
  description: string;
  category: string;
  publishedAt: string;
  author: {
    id: string;
    name: string | null;
  };
};

export type PostDetail = PostSummary & {
  content: string;
  createdAt: string;
};

export type VerseCategory = {
  id: string;
  name: string;
  color: string | null;
};

export type VerseItem = {
  id: string;
  verse: string;
  reference: string;
  category: string;
  categoryId: string | null;
  leitnerLevel: number;
  learningState: "LEARNING" | "MASTERED";
  dueAt: string;
  totalReviews: number;
  successfulReviews: number;
  failedReviews: number;
  createdAt: string;
  categoryRel: VerseCategory | null;
};

export type VersesResponse = {
  categories: VerseCategory[];
  verses: VerseItem[];
};

export type CreateVersePayload = {
  verse: string;
  reference: string;
  categoryId?: string;
  categoryName?: string;
  categoryColor?: string;
};

export type UpdateVersePayload = {
  verse: string;
  reference: string;
  categoryId?: string;
  categoryName?: string;
  categoryColor?: string;
};

export function fetchPosts(): Promise<{ posts: PostSummary[] }> {
  return apiFetch("/posts");
}

export function fetchPostBySlug(slug: string): Promise<{ post: PostDetail }> {
  return apiFetch(`/posts/${encodeURIComponent(slug)}`);
}

export function fetchVerses(): Promise<VersesResponse> {
  return apiFetch("/verses");
}

export function createVerse(payload: CreateVersePayload): Promise<{ verse: VerseItem }> {
  return apiFetch("/verses", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateVerse(verseId: string, payload: UpdateVersePayload): Promise<{ verse: VerseItem }> {
  return apiFetch(`/verses/${encodeURIComponent(verseId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function updateVerseProgress(verseId: string, leitnerLevel: number): Promise<{ verse: VerseItem }> {
  return apiFetch(`/verses/${encodeURIComponent(verseId)}/progress`, {
    method: "PATCH",
    body: JSON.stringify({ leitnerLevel })
  });
}

export async function deleteVerse(verseId: string): Promise<void> {
  await apiFetch(`/verses/${encodeURIComponent(verseId)}`, {
    method: "DELETE"
  });
}