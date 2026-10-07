import type { ClientProject } from "./types";

/**
 * Client projects (the "Clients" page). Imported from the projects published on waleedaboelezz.com/projects
 * (titles, categories, descriptions and links as published there); images are stored locally in
 * public/images/projects/<slug>/. `coverFit`: "cover" fills the card with a photo, "contain" shows a logo whole.
 */
export const clientProjects: ClientProject[] = [
  {
    slug: "shalfa",
    name: {
      ar: "متجر شلفا",
      en: "Shalfa Store"
    },
    category: {
      ar: "شماغ",
      en: "Shemagh"
    },
    description: {
      ar: "من قصر المصمك وُلدت حكاية \"شلفا\" يوم ١٥ شوال ١٣١٩ هجري أشرقت شمس ذلك اليوم ، وفُتح الباب بالـ ( الشلفا ) ، وأُعلن فيها الملك لله ثم لعبدالعزيز ولأنك سعودي ماضيك عظيم ومستقبلك مشرق وأنت رمز الأناقة جيناك بشلفا ( فوق الرأس ) مورث سعودي ويزهاك ...♥",
      en: "From Al-Masmak Palace, the story of \"Shalfa\" was born on the 15th of Shawwal, 1319 AH. The sun rose that day, and the door opened with the (Shalfa) — proclaiming the kingdom to God, then to Abdulaziz. Because you're Saudi, your past is great and your future is bright, and you are a symbol of elegance — your roots run through Shalfa (worn on the head), a Saudi heritage that suits you...♥"
    },
    link: "https://shalfa.co/",
    cover: "/images/projects/shalfa/02.jpg",
    coverFit: "cover",
    gallery: [
      {
        src: "/images/projects/shalfa/01.jpg",
        width: 695,
        height: 837
      },
      {
        src: "/images/projects/shalfa/02.jpg",
        width: 1400,
        height: 600
      },
      {
        src: "/images/projects/shalfa/03.jpg",
        width: 1000,
        height: 1000
      },
      {
        src: "/images/projects/shalfa/04.jpg",
        width: 695,
        height: 837
      }
    ]
  },
  {
    slug: "mihmar",
    name: {
      ar: "متجر مهمار",
      en: "Mihmar Store"
    },
    category: {
      ar: "عسل",
      en: "Honey"
    },
    description: {
      ar: "حولنا شغفنا بالعسل لإاحتراف , لننتج عسل طبيعي 100% , صناعة سعودية متوافقة مع أعلي المعايير العالمية . ونهتم بأدق تفاصيل الإنتاج والتعبئة والتغليف ليصل اليكم في أفضل جودة وطعم وأفر سعر",
      en: "We turned our passion for honey into a craft, producing 100% natural honey — Saudi-made, meeting the highest international standards. We care about every detail of production, packing, and packaging so it reaches you in the best quality, taste, and price."
    },
    link: "https://mehmarksa.com/",
    cover: "/images/projects/mihmar/01.webp",
    coverFit: "contain",
    gallery: [
      {
        src: "/images/projects/mihmar/01.webp",
        width: 1333,
        height: 1333
      }
    ]
  },
  {
    slug: "souq-alzel",
    name: {
      ar: "سوق الزل",
      en: "Souq Al-Zel"
    },
    category: null,
    description: {
      ar: "لبيع المشالح والعود ودهن العود والزعفران والسداري والفراوي والعبي والشالات والسيوف والعقل",
      en: "Selling mashalih, oud, oud oil, saffron, sadari, farawi, abayas, shawls, swords, and headbands"
    },
    link: "https://suqalzl.com/",
    cover: "/images/projects/souq-alzel/01.png",
    coverFit: "contain",
    gallery: [
      {
        src: "/images/projects/souq-alzel/01.png",
        width: 400,
        height: 400
      }
    ]
  },
  {
    slug: "khanenh",
    name: {
      ar: "بهارات خنينة",
      en: "Khanenh Spices"
    },
    category: null,
    description: {
      ar: "خنينة | KHANENH هي علامة تجارية سعودية متخصصة في البهارات الصحيحة والخلطات الخاصة، مكوناتنا طبيعية 100% من أجود المصادر والمزارع في العالم، جميع بهاراتنا يتم غسلها بالماء النقي لأكثر من مرة قبل أن يتم طحنها وتعبئتها بشكل محكم في عبوّات مصنوعة خصيصاً لتمنع دخول الضوء والهواء والرطوبة، لأننا نؤمن أن خنينة هي سر الطبخة الثمينة",
      en: "Khanenh | KHANENH is a Saudi brand specializing in authentic spices and special blends. Our ingredients are 100% natural, sourced from the finest origins and farms worldwide. All our spices are washed with clean water multiple times before being ground and tightly packed in containers specifically made to block out light, air, and moisture — because we believe Khanenh is the secret to a treasured dish."
    },
    link: "https://khanenh.sa/",
    cover: "/images/projects/khanenh/01.webp",
    coverFit: "contain",
    gallery: [
      {
        src: "/images/projects/khanenh/01.webp",
        width: 461,
        height: 267
      }
    ]
  },
  {
    slug: "ana-tabiei",
    name: {
      ar: "انا طبيعي",
      en: "Ana Tabiei"
    },
    category: {
      ar: "متجر",
      en: "Store"
    },
    description: {
      ar: "منتجات طبيعية امنه 100%",
      en: "100% safe, natural products"
    },
    link: null,
    cover: "/images/projects/ana-tabiei/01.png",
    coverFit: "contain",
    gallery: [
      {
        src: "/images/projects/ana-tabiei/01.png",
        width: 1131,
        height: 1131
      }
    ]
  },
  {
    slug: "4mass",
    name: {
      ar: "متجر فور ماس",
      en: "4Mass Store"
    },
    category: null,
    description: {
      ar: "مؤسسة فور ماس للتجارة شركة سعودية متخصصة في حلول الأعمال التقنية،",
      en: "4Mass Trading Foundation is a Saudi company specializing in technical business solutions,"
    },
    link: "https://4mass.sa/",
    cover: "/images/projects/4mass/01.webp",
    coverFit: "contain",
    gallery: [
      {
        src: "/images/projects/4mass/01.webp",
        width: 260,
        height: 260
      }
    ]
  },
  {
    slug: "attarat-dubai",
    name: {
      ar: "عطارة دبي",
      en: "Attarat Dubai"
    },
    category: null,
    description: {
      ar: "أعشاب طبيعية، عطور شرقية، بخور فاخر، عود، مسك، عنبر، زيوت عطرية، خلطات عطرية، أعشاب طبية، توابل مختارة، ومستحضرات طبيعية للعناية بالجسم",
      en: "Natural herbs, oriental perfumes, fine incense, oud, musk, amber, essential oils, fragrance blends, medicinal herbs, select spices, and natural body-care products"
    },
    link: "http://attardubaiest.com/",
    cover: "/images/projects/attarat-dubai/01.png",
    coverFit: "contain",
    gallery: [
      {
        src: "/images/projects/attarat-dubai/01.png",
        width: 200,
        height: 124
      }
    ]
  },
  {
    slug: "grand-city",
    name: {
      ar: "المدينة الكبيرة",
      en: "The Big City"
    },
    category: null,
    description: {
      ar: "نهتم ببيع مستلزمات مواد الدعاية والإعلان ونسعى لتلبية احتياجاتكم في المعارض وكذلك في الطباعات ونحرص دائماً لتقديم كل ماهو جديد ومميز لإرضائكم وإرضاء عملائكم",
      en: "We specialize in selling advertising and promotional materials, and we strive to meet your needs for exhibitions as well as printing, always keen to offer everything new and distinctive to satisfy you and your customers."
    },
    link: "https://grandcitymedia-sa.com/",
    cover: "/images/projects/grand-city/01.png",
    coverFit: "contain",
    gallery: [
      {
        src: "/images/projects/grand-city/01.png",
        width: 380,
        height: 175
      }
    ]
  },
  {
    slug: "vavitalk",
    name: {
      ar: "vavitalk",
      en: "vavitalk"
    },
    category: null,
    description: {
      ar: "نؤمن أن الرياضة أسلوب حياة وليست مجرد تمرين لذلك نقدم تشكيلة مختارة من الملابس الرياضية الرجالية والنسائية التي تجمع بين الراحة والجودة والأناقة لتناسب مختلف الأنشطة اليومية والرياضية.",
      en: "We believe sports is a lifestyle, not just a workout — that's why we offer a curated selection of men's and women's activewear that combines comfort, quality, and style to suit various daily and athletic activities."
    },
    link: "https://vavitalksa.com/",
    cover: "/images/projects/vavitalk/01.png",
    coverFit: "contain",
    gallery: [
      {
        src: "/images/projects/vavitalk/01.png",
        width: 1400,
        height: 600
      }
    ]
  },
  {
    slug: "zad-almubarakiya",
    name: {
      ar: "zadalmubarakiya",
      en: "Zad Al-Mubarakiya"
    },
    category: null,
    description: {
      ar: "نقدم لكم تجربة أصيلة مستوحاة من تراث الكويت العريق، حيث نجمع بين أجود أنواع المكسرات الفاخرة والحلويات الكويتية الشرقية المختارة بعناية لتمنحكم مذاقًا استثنائيًا في كل مناسبة.\n\nنحرص في زاد المباركية على الجودة العالية، والطعم الأصيل، والتغليف الأنيق، لنكون خياركم الأول للهدايا والضيافة والمناسبات الخاصة.",
      en: "We offer you an authentic experience inspired by Kuwait's rich heritage, combining the finest premium nuts with carefully selected Kuwaiti Middle Eastern sweets to give you an exceptional taste for every occasion. At Zad Al-Mubarakiya, we're committed to high quality, authentic taste, and elegant packaging, making us your first choice for gifts, hospitality, and special occasions."
    },
    link: "https://zadalmubarakiya.com/",
    cover: "/images/projects/zad-almubarakiya/01.png",
    coverFit: "contain",
    gallery: [
      {
        src: "/images/projects/zad-almubarakiya/01.png",
        width: 1206,
        height: 510
      }
    ]
  },
  {
    slug: "logex",
    name: {
      ar: "Logex",
      en: "Logex"
    },
    category: {
      ar: "شركة شحن",
      en: "Shipping Company"
    },
    description: {
      ar: "شركة شحن سريع للرياض من 3 الي 4 ساعات",
      en: "A fast shipping company delivering within Riyadh in 3 to 4 hours"
    },
    link: "https://logex-ksa.com/",
    cover: "/images/projects/logex/01.jpg",
    coverFit: "contain",
    gallery: [
      {
        src: "/images/projects/logex/01.jpg",
        width: 1080,
        height: 1080
      }
    ]
  },
  {
    slug: "giveu",
    name: {
      ar: "giveu",
      en: "giveu"
    },
    category: {
      ar: "هدايا",
      en: "Gifts"
    },
    description: {
      ar: "GIVEU\nهو الحل الذكي للإهداء، يعيد تعريف تجربة تقديم الهدايا بأسلوب منظم ومرن. نوفّر لك رحلة إهداء سهلة، وخدمة متميزة، وتواصل واضح يليق بالمناسبة",
      en: "GIVEU is the smart solution for gifting, redefining the gift-giving experience with an organized, flexible approach. We provide an easy gifting journey, outstanding service, and clear communication fit for the occasion."
    },
    link: "https://giveunow.com/",
    cover: "/images/projects/giveu/01.png",
    coverFit: "contain",
    gallery: [
      {
        src: "/images/projects/giveu/01.png",
        width: 100,
        height: 103
      }
    ]
  },
  {
    slug: "bahrna",
    name: {
      ar: "مطعم بحرنا",
      en: "Bahrna Restaurant"
    },
    category: {
      ar: "مطعم",
      en: "Restaurant"
    },
    description: {
      ar: "نوفّر لك مجموعةً واسعة من أجود أنواع السمك والأصناف البحرية بأسعار تنافسية",
      en: "We offer a wide range of the finest fish and seafood at competitive prices"
    },
    link: "https://bahruna.zid.store/",
    cover: "/images/projects/bahrna/02.png",
    coverFit: "cover",
    gallery: [
      {
        src: "/images/projects/bahrna/01.png",
        width: 483,
        height: 816
      },
      {
        src: "/images/projects/bahrna/02.png",
        width: 958,
        height: 411
      }
    ]
  },
  {
    slug: "sarah-line",
    name: {
      ar: "متجر ساره",
      en: "Sarah Store"
    },
    category: null,
    description: {
      ar: "بسارة لاين، علامة عبايات تجمع بين الأناقة العصرية وفخامة التفاصيل، بتصاميم صُممت لتكمّل إطلالتكِ وتعكس ذوقكِ بأسلوب راقٍ ومميز.",
      en: "Sarah Line is an abaya brand that combines modern elegance with luxurious detail, with designs made to complement your look and reflect your taste in a refined, distinctive style."
    },
    link: "https://bysarahline.zid.store/",
    cover: "/images/projects/sarah-line/01.png",
    coverFit: "cover",
    gallery: [
      {
        src: "/images/projects/sarah-line/01.png",
        width: 1559,
        height: 667
      }
    ]
  },
  {
    slug: "oreva",
    name: {
      ar: "oreva",
      en: "oreva"
    },
    category: null,
    description: null,
    link: "https://oreva.zid.store/",
    cover: "/images/projects/oreva/02.png",
    coverFit: "cover",
    gallery: [
      {
        src: "/images/projects/oreva/01.png",
        width: 483,
        height: 816
      },
      {
        src: "/images/projects/oreva/02.png",
        width: 958,
        height: 411
      }
    ]
  }
];
