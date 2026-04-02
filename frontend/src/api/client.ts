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

export function fetchPosts(): Promise<{ posts: PostSummary[] }> {
  return apiFetch("/posts");
}

export function fetchPostBySlug(slug: string): Promise<{ post: PostDetail }> {
  return apiFetch(`/posts/${encodeURIComponent(slug)}`);
}