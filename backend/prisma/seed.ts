import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { CategoryColor, PrismaClient } from "../generated/prisma/index.js";
import * as bcrypt from "bcryptjs";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/versmedit";

const adapter = new PrismaPg(connectionString);
const prisma = new PrismaClient({ adapter });

const CATEGORY_NAMES = ["Comienzo", "El camino romano", "Escuchar", "Conviccion"];

const VERSES_BY_CATEGORY: Record<string, Array<{ verse: string; reference: string }>> = {
  Comienzo: [
    {
      verse: "Dios, en el principio, creó los cielos y la tierra.",
      reference: "Genesis 1:1"
    },
    {
      verse: "En el principio ya existía el Verbo, y el Verbo estaba con Dios, y el Verbo era Dios.",
      reference: "Juan 1:1"
    },
    {
      verse:
        "Y el Verbo se hizo hombre y habitó entre nosotros. Y hemos contemplado su gloria, la gloria que corresponde al Hijo unigénito del Padre, lleno de gracia y de verdad.",
      reference: "Juan 1:14"
    },
    {
      verse:
        "Porque tanto amó Dios al mundo que dio a su Hijo unigénito, para que todo el que cree en él no se pierda, sino que tenga vida eterna.",
      reference: "Juan 3:16"
    }
  ],
  "El camino romano": [
    {
      verse: "pues todos han pecado y están privados de la gloria de Dios,",
      reference: "Romanos 3:23"
    },
    {
      verse:
        "Porque la paga del pecado es muerte, mientras que la dádiva de Dios es vida eterna en Cristo Jesús, nuestro Señor.",
      reference: "Romanos 6:23"
    },
    {
      verse:
        "Pero Dios demuestra su amor por nosotros en esto: en que, cuando todavía éramos pecadores, Cristo murió por nosotros.",
      reference: "Romanos 5:8"
    },
    {
      verse:
        "si confiesas con tu boca que Jesús es el Señor y crees en tu corazón que Dios lo levantó de entre los muertos, serás salvo.",
      reference: "Romanos 10:9"
    },
    {
      verse:
        "Porque con el corazón se cree para ser justificado, pero con la boca se confiesa para ser salvo.",
      reference: "Romanos 10:10"
    }
  ],
  Escuchar: [
    {
      verse:
        "Toda la Escritura es inspirada por Dios y útil para enseñar, para reprender, para corregir y para instruir en la justicia,",
      reference: "2 Timoteo 3:16"
    },
    {
      verse:
        "Recita siempre el libro de la ley y medita en él de día y de noche; cumple con cuidado todo lo que en él está escrito. Así prosperarás y tendrás éxito.",
      reference: "Josue 1:8"
    },
    {
      verse: "En mi corazón atesoro tus dichos para no pecar contra ti.",
      reference: "Salmo 119:11"
    },
    {
      verse: "Grábate en el corazón estas palabras que hoy te mando.",
      reference: "Deuteronomio 6:6"
    },
    {
      verse:
        "Inculcáselas continuamente a tus hijos. Háblales de ellas cuando estés en tu casa y cuando vayas por el camino, cuando te acuestes y cuando te levantes.",
      reference: "Deuteronomio 6:7"
    },
    {
      verse:
        "Ciertamente, la palabra de Dios es viva y poderosa, y más cortante que cualquier espada de dos filos. Penetra hasta lo más profundo del alma y del espíritu, hasta la médula de los huesos, y juzga los pensamientos y las intenciones del corazón.",
      reference: "Hebreos 4:12"
    },
    {
      verse:
        "Así que acerquémonos confiadamente al trono de la gracia para recibir misericordia y hallar la gracia que nos ayude en el momento que más la necesitemos.",
      reference: "Hebreos 4:16"
    },
    {
      verse:
        "Esta es la confianza que tenemos al acercarnos a Dios: que, si pedimos conforme a su voluntad, él nos oye.",
      reference: "1 Juan 5:14"
    },
    {
      verse:
        "Y, si sabemos que Dios oye todas nuestras oraciones, podemos estar seguros de que ya tenemos lo que le hemos pedido.",
      reference: "1 Juan 5:15"
    }
  ],
  Conviccion: [
    {
      verse: "Y el testimonio es este: que Dios nos ha dado vida eterna y esa vida está en su Hijo.",
      reference: "1 Juan 5:11"
    },
    {
      verse: "El que tiene al Hijo, tiene la vida; el que no tiene al Hijo de Dios, no tiene la vida.",
      reference: "1 Juan 5:12"
    },
    {
      verse: "No os angustiéis. Confiad en Dios, confiad también en mí.",
      reference: "Juan 14:1"
    },
    {
      verse:
        "En el hogar de mi Padre hay muchas viviendas; si no fuera así, ya os lo habría dicho. Voy a prepararos un lugar.",
      reference: "Juan 14:2"
    },
    {
      verse: "Y, si me voy y os lo preparo, vendré para llevaros conmigo. Así estaréis donde yo esté.",
      reference: "Juan 14:3"
    }
  ]
};

const CATEGORY_COLORS: Record<string, CategoryColor> = {
  Comienzo: CategoryColor.INDIGO,
  "El camino romano": CategoryColor.PURPLE,
  Escuchar: CategoryColor.BLUE,
  Conviccion: CategoryColor.GREEN,
};

async function findOrCreateCategory(userId: string, name: string) {
  const color = CATEGORY_COLORS[name] ?? CategoryColor.GRAY;

  const existingCategory = await prisma.category.findFirst({
    where: {
      userId,
      name
    }
  });

  if (existingCategory) {
    if (existingCategory.color !== color) {
      return prisma.category.update({
        where: { id: existingCategory.id },
        data: { color }
      });
    }
    return existingCategory;
  }

  return prisma.category.create({
    data: {
      name,
      color,
      userId
    }
  });
}

async function seedVersesForCategory(userId: string, categoryId: string, categoryName: string) {
  const verses = VERSES_BY_CATEGORY[categoryName] ?? [];

  for (const verseData of verses) {
    const existingVerse = await prisma.verse.findFirst({
      where: {
        userId,
        category: categoryName,
        reference: verseData.reference
      }
    });

    if (existingVerse) {
      if (existingVerse.verse !== verseData.verse) {
        await prisma.verse.update({
          where: { id: existingVerse.id },
          data: { verse: verseData.verse }
        });
      }
      continue;
    }

    await prisma.verse.create({
      data: {
        verse: verseData.verse,
        reference: verseData.reference,
        category: categoryName,
        categoryId,
        userId
      }
    });
  }
}

const BLOG_POSTS = [
  {
    title: "Getting Started with Bible Memorization",
    slug: "getting-started-with-bible-memorization",
    description: "Learn how to begin your Scripture memorization journey with Versmedit and the Leitner spaced-repetition system.",
    content: "Memorizing Scripture is one of the most rewarding spiritual disciplines. With Versmedit, you can build a consistent habit of hiding God's Word in your heart.\n\nThe key to effective memorization is consistency, not intensity. Start with just one or two verses and review them daily. As you master those, add more.\n\nVersmedit uses the Leitner spaced-repetition system to schedule your reviews at optimal intervals. New verses appear daily, while well-known ones come up less often. This scientifically proven approach moves information from short-term to long-term memory efficiently.\n\nHere are some tips to get started:\n\n1. Choose verses that speak to your current season of life\n2. Read the verse in context before memorizing it\n3. Say the verse out loud as you type the first letters\n4. Review your verses at the same time each day\n5. Trust the process — consistency beats perfection",
    category: "Getting Started",
  },
  {
    title: "Understanding the Leitner System",
    slug: "understanding-the-leitner-system",
    description: "A deep dive into the Leitner spaced-repetition system and how it powers your memorization in Versmedit.",
    content: "The Leitner system was developed by German science journalist Sebastian Leitner in the 1970s. It organizes items into levels based on how well you know them.\n\nIn Versmedit, each verse starts at Level 1 and progresses through 7 levels before reaching the Mastered stage. Here's how it works:\n\n- Level 1: Review the same day\n- Level 2: Review after 2 days\n- Level 3: Review after 3 days\n- Level 4: Review after 7 days\n- Level 5: Review after 15 days\n- Level 6: Review after 31 days\n- Level 7: Review after 61 days\n\nWhen you recall a verse correctly, it moves up one level. If you make a mistake, it drops down one level for more frequent review.\n\nThis approach ensures you spend more time on difficult verses and less time on ones you already know well. The total journey from Level 1 to Mastered takes about 120 days of consistent review.",
    category: "How It Works",
  },
  {
    title: "Practice Mode: Review Without Pressure",
    slug: "practice-mode-review-without-pressure",
    description: "Discover how Practice Mode lets you review all your verses freely without affecting your progress.",
    content: "Sometimes you want to review your verses without the pressure of tracking progress. That's exactly what Practice Mode is for.\n\nUnlike Memorize Mode, where correct answers move verses up a level and mistakes drop them down, Practice Mode lets you freely cycle through all your verses in random order. Nothing is tracked — no level changes, no schedule updates.\n\nPractice Mode is perfect for:\n\n- Warming up before your daily memorization session\n- Reviewing verses while commuting or waiting\n- Refreshing your memory on mastered verses\n- Practicing with a friend or study group\n\nYou can access Practice Mode from the My Account dropdown in the navigation. The 'Show verse' button lets you reveal the full text whenever you need a hint, and you can use it as many times as you want.\n\nThink of Memorize Mode as your structured daily workout and Practice Mode as a casual, stress-free practice session.",
    category: "Features",
  },
];

async function seedPosts(authorId: string) {
  for (const postData of BLOG_POSTS) {
    const existing = await prisma.post.findUnique({
      where: { slug: postData.slug },
    });

    if (existing) {
      await prisma.post.update({
        where: { id: existing.id },
        data: {
          title: postData.title,
          description: postData.description,
          content: postData.content,
          category: postData.category,
        },
      });
      continue;
    }

    await prisma.post.create({
      data: {
        ...postData,
        authorId,
        publishedAt: new Date(),
      },
    });
  }
}

async function main() {
  console.log("Seeding verses and categories for canterojoel@gmail.com...");

  const hashedPassword = await bcrypt.hash("password123", 10);

  const user = await prisma.user.upsert({
    where: { email: "canterojoel@gmail.com" },
    update: {
      name: "Joel Cantero"
    },
    create: {
      email: "canterojoel@gmail.com",
      name: "Joel Cantero",
      emailVerified: true,
      password: hashedPassword
    }
  });

  for (const categoryName of CATEGORY_NAMES) {
    const category = await findOrCreateCategory(user.id, categoryName);
    await seedVersesForCategory(user.id, category.id, categoryName);
  }

  const categoryCount = await prisma.category.count({ where: { userId: user.id } });
  const verseCount = await prisma.verse.count({ where: { userId: user.id } });

  console.log(`User ${user.email} now has ${categoryCount} categories and ${verseCount} verses.`);

  await seedPosts(user.id);
  const postCount = await prisma.post.count();
  console.log(`Seeded ${postCount} blog posts.`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
