/**
 * Coffee Land - Database Seed Script
 * Run: pnpm --filter @workspace/api-server run seed
 */
import { db, branchesTable, usersTable, categoriesTable, menuItemsTable, tablesTable, paymentProvidersTable, restaurantSettingsTable, employeesTable, suppliersTable, ingredientsTable } from "@workspace/db";
import { hashPassword } from "./lib/auth";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("🌱 Seeding Coffee Land database...");

  // ── BRANCHES ──────────────────────────────────────────────────────────────
  const [existingBranch] = await db.select().from(branchesTable).limit(1);
  let branchId: number;
  if (existingBranch) {
    branchId = existingBranch.id;
    console.log("  ✓ Branch already exists:", branchId);
  } else {
    const [branch] = await db.insert(branchesTable).values({
      name: "Coffee Land - Main",
      address: "Bole Road, Addis Ababa, Ethiopia",
      phone: "+251 11 123 4567",
      isActive: true,
    }).returning();
    branchId = branch.id;
    console.log("  ✓ Created branch:", branchId);
  }

  // ── RESTAURANT SETTINGS ───────────────────────────────────────────────────
  const [existingSettings] = await db.select().from(restaurantSettingsTable).limit(1);
  if (!existingSettings) {
    await db.insert(restaurantSettingsTable).values({
      name: "Coffee Land",
      nameAm: "ቁፍ ላንድ",
      phone: "+251 11 123 4567",
      address: "Bole Road, Addis Ababa, Ethiopia",
      vatRate: "15",
      loyaltyPointsPerEtb: "1",
      receiptFooterText: "Thank you for visiting Coffee Land! / ቁፍ ላንድን ስለጎበኙ እናመሰግናለን!",
      primaryColor: "#6B2E0A",
      branchId,
    });
    console.log("  ✓ Created restaurant settings");
  }

  // ── ADMIN USER ────────────────────────────────────────────────────────────
  const [existingAdmin] = await db.select().from(usersTable).where(eq(usersTable.username, "admin"));
  let adminUserId: number;
  if (existingAdmin) {
    adminUserId = existingAdmin.id;
    console.log("  ✓ Admin user already exists");
  } else {
    const passwordHash = await hashPassword("admin123");
    const [admin] = await db.insert(usersTable).values({
      username: "admin",
      passwordHash,
      role: "admin",
      branchId,
    }).returning();
    adminUserId = admin.id;
    const [adminEmp] = await db.insert(employeesTable).values({
      fullName: "Admin User",
      role: "admin",
      phone: "+251 91 234 5678",
      hireDate: "2024-01-01",
      isActive: true,
      branchId,
      userId: adminUserId,
    }).returning();
    console.log("  ✓ Created admin user (username: admin, password: admin123)");
  }

  // ── SAMPLE STAFF ──────────────────────────────────────────────────────────
  const staffToCreate = [
    { username: "manager1", password: "pass123", role: "manager" as const, fullName: "Mekdes Alemu", phone: "+251 91 111 2222" },
    { username: "cashier1", password: "pass123", role: "cashier" as const, fullName: "Dawit Tesfaye", phone: "+251 91 333 4444" },
    { username: "kitchen1", password: "pass123", role: "kitchen" as const, fullName: "Tigist Bekele", phone: "+251 91 555 6666" },
  ];

  for (const s of staffToCreate) {
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.username, s.username));
    if (!existing) {
      const hash = await hashPassword(s.password);
      const [user] = await db.insert(usersTable).values({ username: s.username, passwordHash: hash, role: s.role, branchId }).returning();
      await db.insert(employeesTable).values({ fullName: s.fullName, role: s.role, phone: s.phone, hireDate: "2024-01-15", isActive: true, branchId, userId: user.id });
      console.log(`  ✓ Created ${s.role}: ${s.username}`);
    }
  }

  // ── MENU CATEGORIES ───────────────────────────────────────────────────────
  const existingCats = await db.select().from(categoriesTable);
  let catMap: Record<string, number> = {};
  if (existingCats.length > 0) {
    existingCats.forEach(c => { catMap[c.nameEn] = c.id; });
    console.log("  ✓ Categories already exist");
  } else {
    const categories = [
      { nameEn: "Coffee Drinks", nameAm: "ቡና መጠጦች", sortOrder: 1, icon: "coffee" },
      { nameEn: "Burgers", nameAm: "በርገር", sortOrder: 2, icon: "hamburger" },
      { nameEn: "Sides", nameAm: "ተጨማሪ ምግቦች", sortOrder: 3, icon: "french-fries" },
      { nameEn: "Soft Drinks", nameAm: "ለስላሳ መጠጦች", sortOrder: 4, icon: "cup" },
      { nameEn: "Desserts", nameAm: "ጣፋጭ ምግቦች", sortOrder: 5, icon: "cake" },
      { nameEn: "Breakfast", nameAm: "ቁርስ", sortOrder: 6, icon: "egg" },
    ];
    for (const cat of categories) {
      const [c] = await db.insert(categoriesTable).values(cat).returning();
      catMap[c.nameEn] = c.id;
    }
    console.log("  ✓ Created", Object.keys(catMap).length, "categories");
  }

  // ── MENU ITEMS ────────────────────────────────────────────────────────────
  const existingItems = await db.select().from(menuItemsTable);
  if (existingItems.length === 0 && Object.keys(catMap).length > 0) {
    const coffeeId = catMap["Coffee Drinks"];
    const burgerId = catMap["Burgers"];
    const sidesId = catMap["Sides"];
    const drinksId = catMap["Soft Drinks"];
    const dessertsId = catMap["Desserts"];
    const breakfastId = catMap["Breakfast"];

    const menuItems = [
      // Coffee
      { nameEn: "Espresso", nameAm: "እስፕሬሶ", categoryId: coffeeId, price: "45", descriptionEn: "Strong single shot of espresso", descriptionAm: "ጠንካራ የቡና ሾት", prepTimeMinutes: 3 },
      { nameEn: "Macchiato", nameAm: "ማኪያቶ", categoryId: coffeeId, price: "55", descriptionEn: "Ethiopian-style espresso with a touch of milk foam", descriptionAm: "ከወተት አረፋ ጋር የተቀናጀ ቡና", prepTimeMinutes: 4 },
      { nameEn: "Cappuccino", nameAm: "ካፑቺኖ", categoryId: coffeeId, price: "75", descriptionEn: "Espresso with steamed milk and foam", descriptionAm: "ከተሞቀ ወተት ጋር የቡና መጠጥ", prepTimeMinutes: 5 },
      { nameEn: "Latte", nameAm: "ላቴ", categoryId: coffeeId, price: "80", descriptionEn: "Smooth espresso with steamed milk", descriptionAm: "ለስላሳ ቡና ከወተት ጋር", prepTimeMinutes: 5 },
      { nameEn: "Americano", nameAm: "አሜሪካኖ", categoryId: coffeeId, price: "60", descriptionEn: "Espresso diluted with hot water", descriptionAm: "ቡና ከሙቅ ውሃ ጋር", prepTimeMinutes: 3 },
      { nameEn: "Cold Brew", nameAm: "ቀዝቃዛ ቡና", categoryId: coffeeId, price: "90", descriptionEn: "Slowly steeped cold coffee", descriptionAm: "ቀስ ብሎ የተፈሰሰ ቀዝቃዛ ቡና", prepTimeMinutes: 2 },
      { nameEn: "Ethiopian Traditional Coffee", nameAm: "የኢትዮጵያ ባህላዊ ቡና", categoryId: coffeeId, price: "50", descriptionEn: "Traditional Ethiopian coffee ceremony style", descriptionAm: "ባህላዊ የኢትዮጵያ ቡና ሥነ ሥርዓት", prepTimeMinutes: 10 },

      // Burgers
      { nameEn: "Classic Beef Burger", nameAm: "ክላሲክ የበሬ በርገር", categoryId: burgerId, price: "280", descriptionEn: "Juicy beef patty with lettuce, tomato, and special sauce", descriptionAm: "ጭማቂ የበሬ ሥጋ ከሰላጣ እና ቲማቲም ጋር", prepTimeMinutes: 15 },
      { nameEn: "Double Smash Burger", nameAm: "ድቡብ ስምቅ በርገር", categoryId: burgerId, price: "380", descriptionEn: "Two smashed beef patties with American cheese", descriptionAm: "ሁለት የበሬ ሥጋ ከአሜሪካን ቺዝ ጋር", prepTimeMinutes: 18 },
      { nameEn: "Crispy Chicken Burger", nameAm: "ቁርጥ ዶሮ በርገር", categoryId: burgerId, price: "260", descriptionEn: "Crispy fried chicken fillet with coleslaw", descriptionAm: "ፈጣን ዶሮ ከቆዳ ሰላጣ ጋር", prepTimeMinutes: 15 },
      { nameEn: "Veggie Burger", nameAm: "የሚቲ ፍሬ በርገር", categoryId: burgerId, price: "220", descriptionEn: "Grilled mushroom and lentil patty", descriptionAm: "የተጠበሰ እንጉዳይ እና ምስር", prepTimeMinutes: 14 },
      { nameEn: "BBQ Bacon Burger", nameAm: "ባርቢኪው ቤከን በርገር", categoryId: burgerId, price: "350", descriptionEn: "Beef burger with BBQ sauce and crispy bacon", descriptionAm: "የበሬ በርገር ከቤርቢኪው ሶስ ጋር", prepTimeMinutes: 18 },

      // Sides
      { nameEn: "French Fries", nameAm: "ፈረንሳይ ድንች", categoryId: sidesId, price: "80", descriptionEn: "Crispy golden french fries", descriptionAm: "ጥሩ ሚዛናዊ ፈረንሳይ ድንች", prepTimeMinutes: 8 },
      { nameEn: "Sweet Potato Fries", nameAm: "ጣፋጭ ድንች ፍሬ", categoryId: sidesId, price: "95", descriptionEn: "Crispy sweet potato wedges", descriptionAm: "ቁርጥ ጣፋጭ ድንች", prepTimeMinutes: 10 },
      { nameEn: "Onion Rings", nameAm: "ሽንኩርት ቀለበቶች", categoryId: sidesId, price: "85", descriptionEn: "Beer-battered crispy onion rings", descriptionAm: "ፈጠን ሽንኩርት ቀለበቶች", prepTimeMinutes: 8 },
      { nameEn: "Coleslaw", nameAm: "ቆዳ ሰላጣ", categoryId: sidesId, price: "55", descriptionEn: "Creamy coleslaw with carrot and cabbage", descriptionAm: "ቅባት ሰላጣ ከካሮት እና ጎመን", prepTimeMinutes: 2 },

      // Drinks
      { nameEn: "Fresh Orange Juice", nameAm: "ትኩስ ብርቱካን ጭማቂ", categoryId: drinksId, price: "70", descriptionEn: "Freshly squeezed orange juice", descriptionAm: "ትኩስ ብርቱካን ጭማቂ", prepTimeMinutes: 3 },
      { nameEn: "Mango Juice", nameAm: "ሙዝ ጭማቂ", categoryId: drinksId, price: "75", descriptionEn: "Fresh mango blend", descriptionAm: "ትኩስ ማንጎ ጭማቂ", prepTimeMinutes: 3 },
      { nameEn: "Avocado Juice", nameAm: "አቮካዶ ጭማቂ", categoryId: drinksId, price: "80", descriptionEn: "Creamy avocado blend with honey", descriptionAm: "ከቅቤ ማር ጋር አቮካዶ ጭማቂ", prepTimeMinutes: 4 },
      { nameEn: "Soft Drink (330ml)", nameAm: "ለስላሳ መጠጥ", categoryId: drinksId, price: "40", descriptionEn: "Coca-Cola, Sprite, or Fanta", descriptionAm: "ኮካ-ኮላ፣ ስፕሬት ወይም ፋንታ", prepTimeMinutes: 1 },
      { nameEn: "Mineral Water", nameAm: "ማዕድን ውሃ", categoryId: drinksId, price: "25", descriptionEn: "500ml mineral water bottle", descriptionAm: "500 ሚሊ ሊትር ማዕድን ውሃ", prepTimeMinutes: 1 },

      // Desserts
      { nameEn: "Chocolate Cake", nameAm: "ቸኮሌት ኬክ", categoryId: dessertsId, price: "95", descriptionEn: "Rich dark chocolate layer cake", descriptionAm: "ጥቁር ቸኮሌት ኬክ", prepTimeMinutes: 3 },
      { nameEn: "Tiramisu", nameAm: "ቲራሚሱ", categoryId: dessertsId, price: "110", descriptionEn: "Italian coffee-flavored dessert", descriptionAm: "ጣፋጭ የቡና ቲራሚሱ", prepTimeMinutes: 3 },
      { nameEn: "Ice Cream (2 scoops)", nameAm: "አይስ ክሪም", categoryId: dessertsId, price: "70", descriptionEn: "Vanilla, chocolate, or strawberry", descriptionAm: "ቫኒላ፣ ቸኮሌት ወይም ስትሮቤሪ", prepTimeMinutes: 2 },
    ];

    for (const item of menuItems) {
      await db.insert(menuItemsTable).values({ ...item, isAvailable: true, branchId });
    }
    console.log("  ✓ Created", menuItems.length, "menu items");
  }

  // ── PAYMENT PROVIDERS ─────────────────────────────────────────────────────
  const existingProviders = await db.select().from(paymentProvidersTable);
  if (existingProviders.length === 0) {
    await db.insert(paymentProvidersTable).values([
      { name: "Cash", providerType: "cash", isActive: true },
      {
        name: "CBE (Commercial Bank of Ethiopia)",
        providerType: "cbe",
        baseVerificationUrl: "https://apps.cbe.com.et:100/",
        receiverAccountNo: "1000123456789",
        isActive: true,
      },
      {
        name: "TeleBirr",
        providerType: "telebirr",
        baseVerificationUrl: "https://transactioninfo.ethiotelecom.et/api/transaction/",
        receiverAccountNo: "+251911234567",
        isActive: true,
      },
    ]);
    console.log("  ✓ Created 3 payment providers (Cash, CBE, TeleBirr)");
  }

  // ── TABLES ────────────────────────────────────────────────────────────────
  const existingTables = await db.select().from(tablesTable);
  if (existingTables.length === 0) {
    const tables = [
      { label: "Table 1", capacity: 2, branchId }, { label: "Table 2", capacity: 4, branchId },
      { label: "Table 3", capacity: 4, branchId }, { label: "Table 4", capacity: 6, branchId },
      { label: "Table 5", capacity: 6, branchId }, { label: "Table 6", capacity: 2, branchId },
      { label: "Table 7", capacity: 8, branchId }, { label: "Table 8", capacity: 4, branchId },
      { label: "Bar 1", capacity: 1, branchId }, { label: "Bar 2", capacity: 1, branchId },
      { label: "Patio 1", capacity: 4, branchId }, { label: "Patio 2", capacity: 4, branchId },
    ];
    for (const t of tables) await db.insert(tablesTable).values({ ...t, status: "free" });
    console.log("  ✓ Created 12 tables");
  }

  // ── SUPPLIERS ─────────────────────────────────────────────────────────────
  const existingSuppliers = await db.select().from(suppliersTable);
  if (existingSuppliers.length === 0) {
    await db.insert(suppliersTable).values([
      { name: "Yirgacheffe Coffee Cooperative", contactPerson: "Abebe Girma", phone: "+251 46 111 2222", email: "info@yirgacheffe.et" },
      { name: "Addis Meat Suppliers", contactPerson: "Kebede Tadesse", phone: "+251 91 222 3333" },
      { name: "Fresh Produce Ethiopia", contactPerson: "Hiwot Alemu", phone: "+251 91 444 5555" },
    ]);
    console.log("  ✓ Created 3 suppliers");
  }

  // ── INGREDIENTS ───────────────────────────────────────────────────────────
  const existingIngredients = await db.select().from(ingredientsTable);
  if (existingIngredients.length === 0) {
    await db.insert(ingredientsTable).values([
      { name: "Coffee Beans (Yirgacheffe)", unit: "kg", currentStock: "15", reorderThreshold: "5", costPerUnit: "450", branchId },
      { name: "Fresh Milk", unit: "liter", currentStock: "20", reorderThreshold: "8", costPerUnit: "35", branchId },
      { name: "Beef Patty (200g)", unit: "piece", currentStock: "80", reorderThreshold: "20", costPerUnit: "120", branchId },
      { name: "Burger Buns", unit: "piece", currentStock: "100", reorderThreshold: "25", costPerUnit: "15", branchId },
      { name: "French Fries (frozen 1kg)", unit: "pack", currentStock: "25", reorderThreshold: "8", costPerUnit: "95", branchId },
      { name: "Lettuce", unit: "piece", currentStock: "30", reorderThreshold: "10", costPerUnit: "12", branchId },
      { name: "Tomatoes", unit: "kg", currentStock: "8", reorderThreshold: "3", costPerUnit: "45", branchId },
      { name: "Cheddar Cheese (slice)", unit: "piece", currentStock: "3", reorderThreshold: "10", costPerUnit: "25", branchId },
      { name: "Sugar", unit: "kg", currentStock: "12", reorderThreshold: "4", costPerUnit: "55", branchId },
    ]);
    console.log("  ✓ Created 9 ingredients (note: cheese is low stock for demo)");
  }

  console.log("\n✅ Seeding complete!");
  console.log("\n📋 Demo login credentials:");
  console.log("  Admin:   admin / admin123");
  console.log("  Manager: manager1 / pass123");
  console.log("  Cashier: cashier1 / pass123");
  console.log("  Kitchen: kitchen1 / pass123");

  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
