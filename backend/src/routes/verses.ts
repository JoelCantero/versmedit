import { Router } from "express";
import { auth } from "../auth/auth.js";
import { prisma } from "../db/prisma.js";

export const versesRouter = Router();

const parseLevel = (value: unknown) => {
  const level = Number(value);
  if (!Number.isInteger(level) || level < 1 || level > 7) {
    return null;
  }
  return level;
};

async function getUserIdFromSession(requestHeaders: unknown) {
  const session = await auth.api.getSession({
    headers: requestHeaders as never
  });

  return session?.user?.id ?? null;
}

versesRouter.get("/", async (request, response) => {
  const userId = await getUserIdFromSession(request.headers);

  if (!userId) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [categories, verses] = await Promise.all([
    prisma.category.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        color: true
      }
    }),
    prisma.verse.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        verse: true,
        reference: true,
        category: true,
        categoryId: true,
        leitnerLevel: true,
        learningState: true,
        dueAt: true,
        totalReviews: true,
        successfulReviews: true,
        failedReviews: true,
        createdAt: true,
        categoryRel: {
          select: {
            id: true,
            name: true,
            color: true
          }
        }
      }
    })
  ]);

  response.json({ categories, verses });
});

versesRouter.post("/", async (request, response) => {
  const userId = await getUserIdFromSession(request.headers);

  if (!userId) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const verseText = typeof request.body?.verse === "string" ? request.body.verse.trim() : "";
  const reference = typeof request.body?.reference === "string" ? request.body.reference.trim() : "";
  const categoryId = typeof request.body?.categoryId === "string" ? request.body.categoryId : "";

  if (!verseText || !reference || !categoryId) {
    response.status(400).json({ error: "Fields 'verse', 'reference' and 'categoryId' are required" });
    return;
  }

  const category = await prisma.category.findFirst({
    where: {
      id: categoryId,
      userId
    },
    select: {
      id: true,
      name: true,
      color: true
    }
  });

  if (!category) {
    response.status(404).json({ error: "Category not found" });
    return;
  }

  const created = await prisma.verse.create({
    data: {
      verse: verseText,
      reference,
      category: category.name,
      categoryId: category.id,
      userId,
      leitnerLevel: 1,
      learningState: "LEARNING"
    },
    select: {
      id: true,
      verse: true,
      reference: true,
      category: true,
      categoryId: true,
      leitnerLevel: true,
      learningState: true,
      dueAt: true,
      totalReviews: true,
      successfulReviews: true,
      failedReviews: true,
      createdAt: true,
      categoryRel: {
        select: {
          id: true,
          name: true,
          color: true
        }
      }
    }
  });

  response.status(201).json({ verse: created });
});

versesRouter.patch("/:verseId", async (request, response) => {
  const userId = await getUserIdFromSession(request.headers);

  if (!userId) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const verseId = request.params.verseId;
  const verseText = typeof request.body?.verse === "string" ? request.body.verse.trim() : "";
  const reference = typeof request.body?.reference === "string" ? request.body.reference.trim() : "";
  const categoryId = typeof request.body?.categoryId === "string" ? request.body.categoryId : "";

  if (!verseText || !reference || !categoryId) {
    response.status(400).json({ error: "Fields 'verse', 'reference' and 'categoryId' are required" });
    return;
  }

  const verse = await prisma.verse.findFirst({
    where: {
      id: verseId,
      userId
    },
    select: {
      id: true
    }
  });

  if (!verse) {
    response.status(404).json({ error: "Verse not found" });
    return;
  }

  const category = await prisma.category.findFirst({
    where: {
      id: categoryId,
      userId
    },
    select: {
      id: true,
      name: true
    }
  });

  if (!category) {
    response.status(404).json({ error: "Category not found" });
    return;
  }

  const updated = await prisma.verse.update({
    where: { id: verseId },
    data: {
      verse: verseText,
      reference,
      categoryId: category.id,
      category: category.name
    },
    select: {
      id: true,
      verse: true,
      reference: true,
      category: true,
      categoryId: true,
      leitnerLevel: true,
      learningState: true,
      dueAt: true,
      totalReviews: true,
      successfulReviews: true,
      failedReviews: true,
      createdAt: true,
      categoryRel: {
        select: {
          id: true,
          name: true,
          color: true
        }
      }
    }
  });

  response.json({ verse: updated });
});

versesRouter.patch("/:verseId/progress", async (request, response) => {
  const userId = await getUserIdFromSession(request.headers);

  if (!userId) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const verseId = request.params.verseId;
  const level = parseLevel(request.body?.leitnerLevel);

  if (level === null) {
    response.status(400).json({ error: "Field 'leitnerLevel' must be an integer from 1 to 7" });
    return;
  }

  const verse = await prisma.verse.findFirst({
    where: {
      id: verseId,
      userId
    },
    select: {
      id: true
    }
  });

  if (!verse) {
    response.status(404).json({ error: "Verse not found" });
    return;
  }

  const now = new Date();
  const updated = await prisma.verse.update({
    where: { id: verseId },
    data: {
      leitnerLevel: level,
      learningState: level === 7 ? "MASTERED" : "LEARNING",
      masteredAt: level === 7 ? now : null,
      lastReviewedAt: now,
      dueAt: now
    },
    select: {
      id: true,
      verse: true,
      reference: true,
      category: true,
      categoryId: true,
      leitnerLevel: true,
      learningState: true,
      dueAt: true,
      totalReviews: true,
      successfulReviews: true,
      failedReviews: true,
      createdAt: true,
      categoryRel: {
        select: {
          id: true,
          name: true,
          color: true
        }
      }
    }
  });

  response.json({ verse: updated });
});

versesRouter.delete("/:verseId", async (request, response) => {
  const userId = await getUserIdFromSession(request.headers);

  if (!userId) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const verseId = request.params.verseId;

  const verse = await prisma.verse.findFirst({
    where: {
      id: verseId,
      userId
    },
    select: {
      id: true
    }
  });

  if (!verse) {
    response.status(404).json({ error: "Verse not found" });
    return;
  }

  await prisma.verse.delete({
    where: { id: verseId }
  });

  response.status(204).send();
});
