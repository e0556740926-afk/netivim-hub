/** Netivim's field districts, and the usual district of each common city. */
export const DISTRICTS: Record<string, string> = {
  center: "מרכז",
  jerusalem: "ירושלים",
  south: "דרום",
  north: "צפון",
};

const CITY_DISTRICT: Record<string, keyof typeof DISTRICTS> = {
  // ירושלים והסביבה
  "ירושלים": "jerusalem", "בית שמש": "jerusalem", "ביתר": "jerusalem", "ביתר עילית": "jerusalem", "מעלה אדומים": "jerusalem",
  "גבעת זאב": "jerusalem", "מבשרת ציון": "jerusalem", "קרית יערים": "jerusalem", "טלזסטון": "jerusalem", "כוכב יעקב": "jerusalem",
  "אפרת": "jerusalem", "צור הדסה": "jerusalem", "מודיעין עילית": "jerusalem", "קרית ספר": "jerusalem",
  // מרכז
  "בני ברק": "center", "תל אביב": "center", "רמת גן": "center", "גבעתיים": "center", "פתח תקווה": "center", "פתח תקוה": "center",
  "ראש העין": "center", "אלעד": "center", "מודיעין": "center", "לוד": "center", "רמלה": "center", "ראשון לציון": "center",
  "חולון": "center", "בת ים": "center", "רחובות": "center", "נס ציונה": "center", "יבנה": "center", "גדרה": "center",
  "אור יהודה": "center", "יהוד": "center", "קרית אונו": "center", "גבעת שמואל": "center", "גני תקווה": "center",
  "כפר חב\"ד": "center", "כפר חבד": "center", "נתניה": "center", "רעננה": "center", "כפר סבא": "center", "הרצליה": "center",
  "הוד השרון": "center", "רמת השרון": "center", "באר יעקב": "center", "מזכרת בתיה": "center", "קרית עקרון": "center",
  "עמנואל": "center", "אריאל": "center", "קדומים": "center", "שוהם": "center", "אור עקיבא": "center",
  // דרום
  "אשדוד": "south", "אשקלון": "south", "באר שבע": "south", "אופקים": "south", "נתיבות": "south", "שדרות": "south",
  "קרית גת": "south", "קרית מלאכי": "south", "ערד": "south", "דימונה": "south", "ירוחם": "south", "אילת": "south",
  // צפון
  "חיפה": "north", "צפת": "north", "טבריה": "north", "עכו": "north", "נהריה": "north", "כרמיאל": "north", "עפולה": "north",
  "מגדל העמק": "north", "נוף הגליל": "north", "קרית אתא": "north", "קרית ביאליק": "north", "קרית מוצקין": "north",
  "קרית ים": "north", "קרית שמואל": "north", "קרית שמונה": "north", "רכסים": "north", "חדרה": "north", "חריש": "north",
  "יבנאל": "north", "מעלות": "north", "בית שאן": "north", "יקנעם": "north", "זכרון יעקב": "north", "קצרין": "north",
};

export const KNOWN_CITIES = Object.keys(CITY_DISTRICT).filter(c => c !== "פתח תקוה" && c !== "כפר חבד");

const norm = (s: string) => String(s || "").replace(/["״׳']/g, "").replace(/\s+/g, " ").trim();

/** The usual district for a city, or "" if unknown. */
export function districtForCity(city: string): string {
  const c = norm(city);
  if (!c) return "";
  for (const [name, d] of Object.entries(CITY_DISTRICT)) if (norm(name) === c) return d;
  return "";
}

export const isDistrict = (v: unknown): v is keyof typeof DISTRICTS => typeof v === "string" && v in DISTRICTS;
