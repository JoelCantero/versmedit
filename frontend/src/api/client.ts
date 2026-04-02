const API_BASE_PATH = "/api";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_PATH}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
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