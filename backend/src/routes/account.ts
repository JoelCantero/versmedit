import { Router } from "express";
import { auth } from "../auth/auth.js";
import { prisma } from "../db/prisma.js";

export const accountRouter = Router();

const NEXT_REVIEW_INTERVAL_DAYS: Record<number, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 7,
  5: 15,
  6: 31,
  7: 61
};

const getDueDateFromNow = (daysToAdd: number) => {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + daysToAdd);
  return dueDate;
};

accountRouter.get("/my-account", async (request, response) => {
  const session = await auth.api.getSession({
    headers: request.headers as never
  });

  if (!session?.user?.id) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userId = session.user.id;
  const dueOnly = request.query.dueOnly === "true";

  const [categories, verses] = await Promise.all([
    prisma.category.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        color: true,
        createdAt: true,
        _count: {
          select: {
            verses: true
          }
        }
      }
    }),
    prisma.verse.findMany({
      where: {
        userId,
        ...(dueOnly
          ? {
              learningState: "LEARNING",
              dueAt: {
                lte: new Date()
              }
            }
          : {})
      },
      orderBy: dueOnly
        ? [
            { createdAt: "asc" },
            { id: "asc" }
          ]
        : { createdAt: "desc" },
      select: {
        id: true,
        verse: true,
        reference: true,
        category: true,
        categoryId: true,
        leitnerLevel: true,
        learningState: true,
        dueAt: true,
        lastReviewedAt: true,
        masteredAt: true,
        totalReviews: true,
        successfulReviews: true,
        failedReviews: true,
        resetCount: true,
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

  response.json({
    session: {
      id: session.session.id,
      expiresAt: session.session.expiresAt,
      createdAt: session.session.createdAt
    },
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      createdAt: session.user.createdAt
    },
    categories,
    verses
  });
});

accountRouter.post("/verses/:verseId/review", async (request, response) => {
  const session = await auth.api.getSession({
    headers: request.headers as never
  });

  if (!session?.user?.id) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userId = session.user.id;
  const verseId = request.params.verseId;
  const success = request.body?.success;

  if (typeof success !== "boolean") {
    response.status(400).json({ error: "Field 'success' must be a boolean" });
    return;
  }

  const verse = await prisma.verse.findFirst({
    where: {
      id: verseId,
      userId
    },
    select: {
      id: true,
      leitnerLevel: true,
      learningState: true
    }
  });

  if (!verse) {
    response.status(404).json({ error: "Verse not found" });
    return;
  }

  const now = new Date();

  if (success) {
    if (verse.learningState === "MASTERED") {
      const updated = await prisma.verse.update({
        where: { id: verse.id },
        data: {
          totalReviews: { increment: 1 },
          successfulReviews: { increment: 1 },
          lastReviewedAt: now
        },
        select: {
          id: true,
          leitnerLevel: true,
          learningState: true,
          dueAt: true,
          masteredAt: true
        }
      });

      response.json({ verse: updated });
      return;
    }

    if (verse.leitnerLevel >= 7) {
      const updated = await prisma.verse.update({
        where: { id: verse.id },
        data: {
          learningState: "MASTERED",
          masteredAt: now,
          lastReviewedAt: now,
          dueAt: now,
          totalReviews: { increment: 1 },
          successfulReviews: { increment: 1 }
        },
        select: {
          id: true,
          leitnerLevel: true,
          learningState: true,
          dueAt: true,
          masteredAt: true
        }
      });

      response.json({ verse: updated });
      return;
    }

    const nextLevel = verse.leitnerLevel + 1;
    const dueAt = getDueDateFromNow(NEXT_REVIEW_INTERVAL_DAYS[verse.leitnerLevel] ?? 1);

    const updated = await prisma.verse.update({
      where: { id: verse.id },
      data: {
        leitnerLevel: nextLevel,
        learningState: "LEARNING",
        dueAt,
        masteredAt: null,
        lastReviewedAt: now,
        totalReviews: { increment: 1 },
        successfulReviews: { increment: 1 }
      },
      select: {
        id: true,
        leitnerLevel: true,
        learningState: true,
        dueAt: true,
        masteredAt: true
      }
    });

    response.json({ verse: updated });
    return;
  }

  const failedLevel = Math.max(1, verse.leitnerLevel - 1);
  const updated = await prisma.verse.update({
    where: { id: verse.id },
    data: {
      leitnerLevel: failedLevel,
      learningState: "LEARNING",
      dueAt: getDueDateFromNow(0),
      masteredAt: null,
      lastReviewedAt: now,
      totalReviews: { increment: 1 },
      failedReviews: { increment: 1 }
    },
    select: {
      id: true,
      leitnerLevel: true,
      learningState: true,
      dueAt: true,
      masteredAt: true
    }
  });

  response.json({ verse: updated });
});