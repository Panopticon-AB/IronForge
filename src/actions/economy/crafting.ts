import { authActionClient } from '@/lib/safe-action';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

type MaterialRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
type RecipeCategory = 'WEAPON' | 'ARMOR' | 'CONSUMABLE' | 'MATERIAL' | 'COSMETIC';

interface CraftingMaterial {
  id: string;
  name: string;
  rarity: MaterialRarity;
  description: string;
  stackSize: number;
  currentAmount: number;
  obtainedFrom: string[];
}

interface CraftingRecipe {
  id: string;
  name: string;
  category: RecipeCategory;
  description: string;
  resultItem: { id: string; name: string; rarity: MaterialRarity };
  materials: Array<{ materialId: string; amount: number }>;
  craftingTime: number; // seconds
  unlockCondition?: string;
  isUnlocked: boolean;
}


// Sample materials
const MATERIALS: CraftingMaterial[] = [
  {
    id: 'iron-ore',
    name: 'Iron Ore',
    rarity: 'COMMON',
    description: 'Basic metal ore',
    stackSize: 999,
    currentAmount: 50,
    obtainedFrom: ['Dungeon floors 1-10', 'Daily rewards'],
  },
  {
    id: 'steel-ingot',
    name: 'Steel Ingot',
    rarity: 'UNCOMMON',
    description: 'Refined metal',
    stackSize: 999,
    currentAmount: 15,
    obtainedFrom: ['Crafting', 'Elite floors'],
  },
  {
    id: 'mithril-ore',
    name: 'Mithril Ore',
    rarity: 'RARE',
    description: 'Magical metal ore',
    stackSize: 999,
    currentAmount: 5,
    obtainedFrom: ['Boss drops', 'Rare crates'],
  },
  {
    id: 'dragon-scale',
    name: 'Dragon Scale',
    rarity: 'EPIC',
    description: 'From a powerful dragon',
    stackSize: 999,
    currentAmount: 2,
    obtainedFrom: ['Dragon bosses'],
  },
  {
    id: 'titan-essence',
    name: 'Titan Essence',
    rarity: 'LEGENDARY',
    description: 'Pure titan energy',
    stackSize: 99,
    currentAmount: 0,
    obtainedFrom: ['Final bosses', 'Achievement rewards'],
  },
  {
    id: 'magic-dust',
    name: 'Magic Dust',
    rarity: 'COMMON',
    description: 'Magical residue',
    stackSize: 999,
    currentAmount: 100,
    obtainedFrom: ['All sources'],
  },
  {
    id: 'health-herb',
    name: 'Health Herb',
    rarity: 'COMMON',
    description: 'Restorative plant',
    stackSize: 999,
    currentAmount: 30,
    obtainedFrom: ['Daily rewards', 'Rest floors'],
  },
];

// Sample recipes
const RECIPES: CraftingRecipe[] = [
  {
    id: 'recipe-steel-ingot',
    name: 'Steel Ingot',
    category: 'MATERIAL',
    description: 'Refine iron into steel',
    resultItem: { id: 'steel-ingot', name: 'Steel Ingot', rarity: 'UNCOMMON' },
    materials: [{ materialId: 'iron-ore', amount: 5 }],
    craftingTime: 30,
    isUnlocked: true,
  },
  {
    id: 'recipe-iron-sword',
    name: 'Iron Sword',
    category: 'WEAPON',
    description: 'A basic iron sword',
    resultItem: {
      id: 'weapon-iron-sword',
      name: 'Iron Sword',
      rarity: 'COMMON',
    },
    materials: [
      { materialId: 'iron-ore', amount: 10 },
      { materialId: 'magic-dust', amount: 5 },
    ],
    craftingTime: 60,
    isUnlocked: true,
  },
  {
    id: 'recipe-health-potion',
    name: 'Health Potion',
    category: 'CONSUMABLE',
    description: 'Restores 50 HP',
    resultItem: {
      id: 'potion-health',
      name: 'Health Potion',
      rarity: 'COMMON',
    },
    materials: [
      { materialId: 'health-herb', amount: 3 },
      { materialId: 'magic-dust', amount: 2 },
    ],
    craftingTime: 15,
    isUnlocked: true,
  },
  {
    id: 'recipe-mithril-armor',
    name: 'Mithril Armor',
    category: 'ARMOR',
    description: 'Lightweight magical armor',
    resultItem: { id: 'armor-mithril', name: 'Mithril Armor', rarity: 'RARE' },
    materials: [
      { materialId: 'mithril-ore', amount: 10 },
      { materialId: 'steel-ingot', amount: 5 },
      { materialId: 'magic-dust', amount: 20 },
    ],
    craftingTime: 300,
    unlockCondition: 'Reach dungeon floor 30',
    isUnlocked: false,
  },
];

/**
 * Get user's materials.
 */
export const getMaterialsAction = authActionClient.action(async () => {
  return MATERIALS;
});

/**
 * Get available recipes.
 */
export const getRecipesAction = authActionClient.action(async ({ ctx }) => {
  return RECIPES;
});

/**
 * Craft an item.
 */
export const craftItemAction = authActionClient
  .schema(z.string())
  .action(async ({ parsedInput: recipeId }) => {
    try {
      const recipe = RECIPES.find((r) => r.id === recipeId);
      if (!recipe) {
        return { success: false, message: 'Recipe not found' };
      }

      if (!recipe.isUnlocked) {
        return { success: false, message: 'Recipe not unlocked' };
      }

      const criticalSuccess = Math.random() < 0.1;
      console.log(`Crafted ${recipe.name}${criticalSuccess ? ' (CRITICAL!)' : ''}`);
      revalidatePath('/crafting');

      return {
        success: true,
        item: recipe.resultItem,
        criticalSuccess,
        bonus: criticalSuccess ? '+1 bonus item' : undefined,
        message: criticalSuccess
          ? `Critical success! Crafted ${recipe.name} with bonus!`
          : `Successfully crafted ${recipe.name}`,
      };
    } catch (error) {
      console.error('Error crafting:', error);
      return { success: false, message: 'Crafting failed' };
    }
  });

/**
 * Check if recipe can be crafted.
 */
export const canCraftRecipeAction = authActionClient
  .schema(z.string())
  .action(async ({ parsedInput: recipeId }) => {
    const recipe = RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return { canCraft: false, missingMaterials: [] };

    const missing: Array<{ name: string; required: number; have: number }> = [];

    for (const req of recipe.materials) {
      const mat = MATERIALS.find((m) => m.id === req.materialId);
      if (!mat || mat.currentAmount < req.amount) {
        missing.push({
          name: mat?.name || req.materialId,
          required: req.amount,
          have: mat?.currentAmount || 0,
        });
      }
    }

    return { canCraft: missing.length === 0, missingMaterials: missing };
  });
