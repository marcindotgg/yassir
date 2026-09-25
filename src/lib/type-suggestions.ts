export interface TypeGroup {
  label: string;
  items: readonly string[];
}

export const TYPE_GROUPS: readonly TypeGroup[] = [
  {
    label: 'Card types',
    items: ['Creature', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Land', 'Planeswalker', 'Battle', 'Tribal', 'Legendary', 'Basic Land'],
  },
  {
    label: 'Creature types',
    items: [
      'Human', 'Warrior', 'Wizard', 'Soldier', 'Spirit', 'Elf', 'Cleric', 'Elemental', 'Rogue', 'Zombie', 'Goblin', 'Beast', 'Knight',
      'Phyrexian', 'Shaman', 'Bird', 'Dragon', 'Vampire', 'Druid', 'Cat', 'Horror', 'Merfolk', 'Artificer', 'Scout', 'Insect', 'Hero',
      'Angel', 'Construct', 'Giant', 'Noble', 'Warlock', 'Mutant', 'Dinosaur', 'Demon', 'Ally', 'Villain', 'Lizard', 'Eldrazi', 'Advisor',
      'Snake', 'Pirate', 'Dwarf', 'Shapeshifter', 'Faerie', 'Avatar', 'Berserker', 'Golem', 'Assassin', 'Dog', 'Wall', 'Monk', 'Robot',
      'Spider', 'Ogre', 'Ninja', 'Orc', 'Archer', 'Rat', 'Treefolk', 'Citizen', 'Sliver', 'Wurm', 'Minotaur', 'Drake', 'Wolf', 'Illusion',
      'Plant', 'Elephant', 'Nightmare',
    ],
  },
];

/** The word being typed: everything after the last space. */
export function splitLastWord(text: string): { head: string; word: string } {
  const cut = text.lastIndexOf(' ') + 1;
  return { head: text.slice(0, cut), word: text.slice(cut) };
}

/** Groups with the entries containing `word` (any case), minus an exact match; empty groups dropped. */
export function suggestFrom(groups: readonly TypeGroup[], word: string): TypeGroup[] {
  const q = word.toLowerCase();
  return groups.map((g) => ({
    label: g.label,
    items: g.items.filter((i) => {
      const l = i.toLowerCase();
      return l.includes(q) && l !== q;
    }),
  })).filter((g) => g.items.length > 0);
}
