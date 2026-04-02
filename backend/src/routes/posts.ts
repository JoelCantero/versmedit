import { Router } from "express";
import { prisma } from "../db/prisma.js";

export const postsRouter = Router();

postsRouter.get("/", async (_request, response) => {
  const posts = await prisma.post.findMany({
    where: {
      publishedAt: {
        not: null,
        lte: new Date(),
      },
    },
    orderBy: { publishedAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      category: true,
      publishedAt: true,
      author: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  response.json({ posts });
});

postsRouter.get("/:slug", async (request, response) => {
  const post = await prisma.post.findUnique({
    where: { slug: request.params.slug },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      content: true,
      category: true,
      publishedAt: true,
      createdAt: true,
      author: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!post || !post.publishedAt) {
    response.status(404).json({ error: "Post not found" });
    return;
  }

  response.json({ post });
});
