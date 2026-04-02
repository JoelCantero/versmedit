import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { CategoryColor, PrismaClient } from "../generated/prisma/index.js";

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

async function main() {
  console.log("Seeding verses and categories for canterojoel@gmail.com...");

  const user = await prisma.user.upsert({
    where: { email: "canterojoel@gmail.com" },
    update: {
      name: "Joel Cantero"
    },
    create: {
      email: "canterojoel@gmail.com",
      name: "Joel Cantero",
      emailVerified: true
    }
  });

  for (const categoryName of CATEGORY_NAMES) {
    const category = await findOrCreateCategory(user.id, categoryName);
    await seedVersesForCategory(user.id, category.id, categoryName);
  }

  const categoryCount = await prisma.category.count({ where: { userId: user.id } });
  const verseCount = await prisma.verse.count({ where: { userId: user.id } });

  console.log(`User ${user.email} now has ${categoryCount} categories and ${verseCount} verses.`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
